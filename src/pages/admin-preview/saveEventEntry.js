import { supabase } from '../../supabaseClient';
import { sendEmail } from '../../utils/emails';
import { logEventActivity } from '../../utils/eventActivityLog';
import { addProvisionalEntries } from '../../utils/provisionalEntry';
import { readAll } from './playersData';
import { verifyEventOperationAccess } from './eventOperationAccess.js';
import { searchRegistrationPlayers } from '../../utils/adminEventRegistration.js';

export async function saveEventEntry(event, draft, { session, scopeId = 'all', client = supabase } = {}) {
  const access = await verifyEventOperationAccess({ client, eventId: event.id, expectedUserId: session?.user?.id, scopeId });
  if (!access.user?.email || !access.event.is_manual || access.event.event_status === 'cancelled') throw new Error('This event no longer accepts staff registrations.');
  const { data: division, error } = await client.from('tournament_divisions').select('id,name,entry_fee,is_active').eq('id',draft.division.id).eq('event_id',event.id).single();
  if (error || !division) throw new Error('Division is no longer available.');
  if (division.is_active === false) throw new Error('This division is closed.');
  if (division.entry_fee == null || Number(division.entry_fee) * draft.players.length !== draft.amountDue) throw new Error('The entry fee has changed. Close and refresh before adding.');
  const players = await Promise.all(draft.players.map(async selected => {
    const { data, error: playerError } = await searchRegistrationPlayers(client, selected.email);
    const match = data.find(player => String(player.id) === String(selected.id) && player.email?.trim().toLowerCase() === selected.email?.trim().toLowerCase());
    if (playerError || !match) throw new Error('A selected player could not be verified. Find the player again before saving.');
    return match;
  }));
  const registrations = await readAll(()=>client.from('event_registrations').select('id,email,division,division_id,status').eq('event_id',event.id).order('id'));
  const current = await verifyEventOperationAccess({ client, eventId: event.id, expectedUserId: session?.user?.id, scopeId });
  if (current.user.email !== access.user.email || current.event.event_status === 'cancelled') throw new Error('The event workspace changed. Reopen before saving.');
  return addProvisionalEntries({client,event,division,players,registrations,adminEmail:access.user.email,note:draft.note,sendEmail,logEventActivity});
}
