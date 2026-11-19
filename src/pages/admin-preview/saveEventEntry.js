import { supabase } from '../../supabaseClient';
import { sendEmail } from '../../utils/emails';
import { logEventActivity } from '../../utils/eventActivityLog';
import { addProvisionalEntries } from '../../utils/provisionalEntry';
import { readAll } from './playersData';

export async function saveEventEntry(event, draft) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user?.email) throw new Error('Sign in before adding registrations.');
  const { data: permission, error: permissionError } = await supabase.from('admin_sidebar_permissions').select('role').eq('email',auth.user.email).maybeSingle();
  if (permissionError || permission?.role !== 'super_admin') throw new Error('A verified super-admin account is required.');
  const { data: division, error } = await supabase.from('tournament_divisions').select('id,name,entry_fee').eq('id',draft.division.id).eq('event_id',event.id).single();
  if (error || !division) throw new Error('Division is no longer available.');
  if (division.entry_fee == null || Number(division.entry_fee) * draft.players.length !== draft.amountDue) throw new Error('The entry fee has changed. Close and refresh before adding.');
  const { data: profiles, error: profileError } = await supabase.from('players').select('id,name,email').in('id',draft.players.map(player=>player.id));
  if (profileError || profiles?.length !== draft.players.length) throw new Error('Selected players could not be verified.');
  const players = draft.players.map(player=>profiles.find(profile=>profile.id===player.id));
  const registrations = await readAll(()=>supabase.from('event_registrations').select('id,email,division,status').eq('event_id',event.id).eq('division',division.name).order('id'));
  return addProvisionalEntries({client:supabase,event,division,players,registrations,adminEmail:auth.user.email,note:draft.note,sendEmail,logEventActivity});
}
