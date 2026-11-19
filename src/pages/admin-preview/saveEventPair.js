import { supabase } from '../../supabaseClient';
import { sendEmail } from '../../utils/emails';
import { inviteEventPartner, pairEventEntries } from '../../utils/pairEventEntries';
import { readAll } from './playersData';

export async function saveEventPair({ event, solo, partnerId, profileId }) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user?.email) throw new Error('Sign in before pairing entries.');
  const { data: permission, error } = await supabase.from('admin_sidebar_permissions').select('role').eq('email', auth.user.email).maybeSingle();
  if (error || permission?.role !== 'super_admin') throw new Error('A verified super-admin account is required.');
  const registrations = await readAll(() => supabase.from('event_registrations').select('*').eq('event_id', event.id).order('id'));
  const current = registrations.find(row => String(row.id) === String(solo.id));
  const partner = registrations.find(row => String(row.id) === String(partnerId));
  if (!current || current.division !== solo.division || current.email !== solo.email) throw new Error('The entry has changed. Close and refresh before pairing.');
  if (profileId) {
    if (partnerId) throw new Error('Choose one partner source.');
    const [{ data: profile, error: profileError }, { data: division, error: divisionError }] = await Promise.all([
      supabase.from('players').select('id,name,email').eq('id', profileId).maybeSingle(),
      supabase.from('tournament_divisions').select('*').eq('event_id', event.id).eq('name', current.division).maybeSingle(),
    ]);
    if (profileError || divisionError || !profile || !division) throw new Error('Player or division could not be verified. Refresh and try again.');
    return inviteEventPartner({ client: supabase, event, solo: current, profile, division, registrations, sendEmail });
  }
  return pairEventEntries({ client: supabase, event, solo: current, partner, registrations, sendEmail });
}
