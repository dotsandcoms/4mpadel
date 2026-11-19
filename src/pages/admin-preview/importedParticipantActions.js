import { readAll } from './playersData.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';

// CURRENT MAIN participant writes are protected by is_super_admin(email), not
// can_manage_event alone. Never widen a delegated read grant into a write grant.
export async function verifyImportedParticipantWrite({client,eventId,expectedUserId,scopeId='all',signal}) {
  const access=await verifyEventOperationAccess({client,eventId,expectedUserId,scopeId,signal});
  let activeQuery=client.rpc('account_is_active');
  if(signal)activeQuery=activeQuery.abortSignal(signal);
  const active=await activeQuery;
  if(active.error||active.data!==true)throw new Error('An active account is required to change imported participants.');
  if(!access.user?.email)throw new Error('A verified account email is required.');
  let query=client.rpc('is_super_admin',{user_email:access.user.email});
  if(signal)query=query.abortSignal(signal);
  const {data,error}=await query;
  if(error||data!==true)throw new Error('Imported participant changes require a verified super-admin account. Event access alone is read-only.');
  return access;
}

export async function searchImportedProfiles({client,eventId,expectedUserId,scopeId,query,signal}) {
  await verifyImportedParticipantWrite({client,eventId,expectedUserId,scopeId,signal});
  const text=String(query||'').trim().toLowerCase();
  if(text.length<2)return [];
  // MAIN searches the loaded player directory by name/email. Paginate it rather
  // than interpolating user search into a PostgREST filter expression.
  const profiles=await readAll(()=>client.from('players').select('id,name,email').order('id'),signal);
  return profiles.filter(row=>[row.name,row.email].some(value=>String(value||'').toLowerCase().includes(text))).slice(0,20);
}

const fields=['id','event_id','full_name','class_name','rankedin_participant_id','profile_id','whatsapp_added'];
export async function saveImportedParticipant({client,eventId,expectedUserId,scopeId='all',participant,action,profile,isCurrent=()=>true,onAttempt=()=>{}}) {
  if(!['profile','whatsapp'].includes(action))throw new Error('This imported action is not connected to a safe save workflow.');
  if(String(participant?.event_id)!==String(eventId))throw new Error('The participant is outside this event.');
  await verifyImportedParticipantWrite({client,eventId,expectedUserId,scopeId});
  if(!isCurrent())throw new Error('The workspace changed. Reopen this action.');
  const {data:current,error}=await client.from('tournament_participants').select(fields.join(',')).eq('event_id',eventId).eq('id',participant.id).single();
  if(error||!current||fields.some(key=>(current[key]??null)!==(participant[key]??null)))throw new Error('This participant changed. Reload records before continuing.');
  let patch;
  if(action==='profile'){
    if(!profile?.id)throw new Error('Select a player profile.');
    const {data:player,error:playerError}=await client.from('players').select('id,name,email').eq('id',profile.id).single();
    if(playerError||!player||['id','name','email'].some(key=>(player[key]??null)!==(profile[key]??null)))throw new Error('The selected profile changed. Search again before linking.');
    patch={profile_id:player.id};
  }else patch={whatsapp_added:!current.whatsapp_added};
  await verifyImportedParticipantWrite({client,eventId,expectedUserId,scopeId});
  if(!isCurrent())throw new Error('The workspace changed. Reopen this action.');
  let update=client.from('tournament_participants').update(patch);
  fields.forEach(key=>{update=current[key]==null?update.is(key,null):update.eq(key,current[key]);});
  onAttempt();
  const {data:saved,error:saveError}=await update.select(fields.join(',')).single();
  if(saveError)throw saveError;
  if(!saved||String(saved.id)!==String(participant.id)||String(saved.event_id)!==String(eventId)||Object.keys(patch).some(key=>saved[key]!==patch[key]))throw new Error('The participant change could not be confirmed. Reload before trying again.');
  return saved;
}

export const importedHeldAction = action => action==='sync'
  ? 'Sync is held for review. The current importer makes separate writes and deletes, and can remove participants after a division fetch fails. No RankedIn fetch, import or removal will run here until that failure path is protected.'
  : 'Payment changes are held for review. The current workflow updates participant flags and financial records separately, and can report success after a partial failure. No payment flag, registration or payment record will change here until that workflow is safely connected.';
