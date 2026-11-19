import { supabase } from '../../supabaseClient';
import { moveEventEntries } from '../../utils/moveEventEntries';
import { sendEmail } from '../../utils/emails';
import { logEventActivity } from '../../utils/eventActivityLog';
import { readAll } from './playersData';

export async function saveEventMove({ event, team, targetId }) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user?.email) throw new Error('Sign in before moving entries.');
  const { data: permission, error } = await supabase.from('admin_sidebar_permissions').select('role').eq('email', auth.user.email).maybeSingle();
  if (error || permission?.role !== 'super_admin') throw new Error('A verified super-admin account is required.');
  const [registrations, payments, divisions] = await Promise.all([
    readAll(() => supabase.from('event_registrations').select('*').eq('event_id', event.id).order('id')),
    readAll(() => supabase.from('payments').select('*').eq('event_id', event.id).order('id')),
    readAll(() => supabase.from('tournament_divisions').select('*').eq('event_id', event.id).order('id')),
  ]);
  const playersToMove = team.map(row => registrations.find(reg => String(reg.id) === String(row.id)));
  if (!team.length || team.length > 2 || new Set(team.map(row => row.id)).size !== team.length || playersToMove.some((row, i) => !row || row.division !== team[i].division || row.partner_email !== team[i].partner_email || row.payment_status !== team[i].payment_status)) throw new Error('The entries have changed. Close and refresh before moving.');
  const targetDiv = divisions.find(row => String(row.id) === String(targetId));
  return moveEventEntries({ supabase, event, registrations, payments, divisions, moveTarget: playersToMove[0], playersToMove, targetDiv, moveTeamTogether: team.length > 1, sendEmail, logEventActivity });
}
