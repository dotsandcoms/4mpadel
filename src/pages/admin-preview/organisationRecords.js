import { readAll } from './playersData.js';
import { verifyEntityAccess } from './organisationFederationData.js';
import { searchClubMemberPlayers } from './clubMemberAdd.js';
import { notifyEntityDecision } from './entityDecisions.js';

export const organisationRoles = ['owner','admin','staff'];
const operations = ['create','delete','add_member','change_role','remove_member'];

async function platform(client, context) {
  const authority = await verifyEntityAccess(client,'organisations',context);
  if (context.scopeId !== 'all' || !authority.superAdmin) throw new Error('Open Organisations with current platform super-admin access.');
  context.signal?.throwIfAborted();
  return authority;
}

export async function organisationRecordsAvailable(client, context) {
  await platform(client,context);
  const result = await client.rpc('admin_organisation_records',{p_action:'capability'});
  context.signal?.throwIfAborted();
  if (result.error && !['PGRST202','42883'].includes(result.error.code)) throw new Error('Could not confirm organisation management availability.');
  return result.data?.can_manage === true;
}
export async function loadOrganisationMembers(client, organisation, context) {
  if (!organisation?.id) throw new Error('Choose an organisation.');
  await platform(client,context);
  const members = await readAll(() => client.from('organisation_members')
    .select('id,organisation_id,player_id,user_email,role,players!player_id(id,name)')
    .eq('organisation_id',organisation.id).order('id'),context.signal);
  if (members.some(member=>member.organisation_id!==organisation.id)) throw new Error('Organisation membership scope could not be confirmed.');
  return members;
}
export const findOrganisationPlayers = (client, context, query, members) => searchClubMemberPlayers({
  client,scopeId:context.scopeId,userId:context.userId,signal:context.signal,query,members,
});
export const organisationSlug = value => String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

export function organisationWorkflowReview(action, organisation, input) {
  if (!operations.includes(action) || !organisation?.id) throw new Error('Choose an organisation action.');
  if (action==='create') {
    const name=input.name?.trim(),slug=organisationSlug(input.slug);
    if (!name || name.length<2 || name.length>150 || slug.length<2 || slug.length>120) throw new Error('Enter a name and valid public page slug.');
    if (!input.player?.id || !input.player.email) throw new Error('Choose an existing player as owner.');
    return {action,id:organisation.id,expected:{},input:{name,slug,player_id:input.player.id,email:input.player.email},label:input.player.name||input.player.email};
  }
  const expected={name:organisation.name,status:organisation.status};
  if (action==='delete') {
    if (input.confirmation?.trim()!==organisation.name.trim()) throw new Error('Type the organisation name exactly.');
    return {action,id:organisation.id,expected,input:{confirmation:input.confirmation.trim()}};
  }
  if (action==='add_member') {
    if (!input.player?.id || !input.player.email || !organisationRoles.includes(input.role)) throw new Error('Choose an existing player and member role.');
    return {action,id:organisation.id,expected,input:{player_id:input.player.id,email:input.player.email,role:input.role},label:input.player.name||input.player.email};
  }
  const member=input.member;
  if (!member?.id || member.organisation_id!==organisation.id || (action==='change_role'&&!organisationRoles.includes(input.role))) {
    throw new Error('Review a current member and role from this organisation.');
  }
  expected.member={id:member.id,role:member.role,player_id:member.player_id,user_email:member.user_email};
  return {action,id:organisation.id,expected,input:action==='change_role'?{role:input.role}:{},label:member.players?.name||member.user_email};
}

export async function submitOrganisationRecord(client, review, context) {
  await platform(client,context);
  if (!operations.includes(review?.action) || !review.id) throw new Error('Review an organisation action before confirming.');
  context.onAttempt?.();
  const {data,error}=await client.rpc('admin_organisation_records',{p_action:review.action,p_organisation_id:review.id,p_expected:review.expected,p_data:review.input});
  if (error || data?.id !== review.id || data?.action !== review.action) throw new Error(error?.message || 'The organisation action could not be confirmed.');
  if (review.action !== 'create' || data.reused) return data;
  try {
    await platform(client, context);
    const issue = await notifyEntityDecision(client, review.input.email, 'org_approved', { orgName: review.input.name });
    return { ...data, email: issue ? 'unconfirmed' : 'submitted' };
  } catch {
    return { ...data, email: 'unconfirmed' };
  }
}
