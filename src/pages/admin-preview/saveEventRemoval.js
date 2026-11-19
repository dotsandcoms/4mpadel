import { supabase } from '../../supabaseClient';
import { logEventActivity } from '../../utils/eventActivityLog';
import { invokeEventRefund, removeEventEntries } from '../../utils/removeEventEntries';

export async function saveEventRemoval({ event, team, mode }) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user?.email) throw new Error('Sign in before removing entries.');
  const { data: permission, error } = await supabase.from('admin_sidebar_permissions').select('role').eq('email', auth.user.email).maybeSingle();
  if (error || permission?.role !== 'super_admin') throw new Error('A verified super-admin account is required.');
  const { data: rows, error: readError } = await supabase.from('event_registrations').select('*').eq('event_id', event.id).in('id', team.map(row => row.id));
  if (readError || rows?.length !== team.length) throw new Error('Entries could not be verified.');
  const entries = team.map(original => rows.find(row => row.id === original.id));
  if (entries.some((row, i) => !row || row.status === 'withdrawn' || row.division !== team[i].division || row.payment_status !== team[i].payment_status || row.partner_email !== team[i].partner_email)) throw new Error('Entries have changed. Close and review the refreshed event.');
  return removeEventEntries({ event, entries, mode, invoke: body => invokeEventRefund(supabase, body), logEventActivity });
}
