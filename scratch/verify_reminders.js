import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE URL or SERVICE ROLE KEY in .env file.');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

const HOURS_1D = 24;
const HOURS_3D = 72;
const HOURS_7D = 168;

function isEventStillOpen(cal, now) {
  const compareDate = cal?.end_date || cal?.start_date;
  if (!compareDate) return true;
  const eventEnd = new Date(compareDate);
  eventEnd.setHours(23, 59, 59, 999);
  return now <= eventEnd;
}

function pickReminderStage(reg, closesAt, now) {
  const hoursToClose = (closesAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursToClose <= 0) return null;

  if (hoursToClose <= HOURS_1D && !reg.reminder_1d_sent_at) {
    return 'SEND 1-DAY REMINDER';
  }
  if (hoursToClose <= HOURS_3D && hoursToClose > HOURS_1D && !reg.reminder_3d_sent_at) {
    return 'SEND 3-DAY REMINDER';
  }
  if (hoursToClose <= HOURS_7D && hoursToClose > HOURS_3D && !reg.reminder_7d_sent_at) {
    return 'SEND 7-DAY REMINDER';
  }
  return 'DO NOTHING';
}

async function testReminders() {
  console.log('=== Dry-run: manual-event close-date payment reminders (7d / 3d / 1d) ===');
  const now = new Date();

  const { data: registrations, error: fetchRegError } = await supabaseAdmin
    .from('event_registrations')
    .select(`
      id,
      created_at,
      full_name,
      email,
      division,
      partner_name,
      pay_token,
      reminder_7d_sent_at,
      reminder_3d_sent_at,
      reminder_1d_sent_at,
      division_id,
      calendar!inner (
        id,
        event_name,
        registration_closes_at,
        slug,
        entry_fee,
        start_date,
        end_date,
        is_manual,
        allow_payments
      )
    `)
    .eq('payment_status', 'pending')
    .eq('status', 'registered')
    .eq('calendar.is_manual', true)
    .eq('calendar.allow_payments', true)
    .not('division_id', 'is', null)
    .not('pay_token', 'is', null)
    .not('calendar.registration_closes_at', 'is', null);

  if (fetchRegError) {
    console.error('Failed to run reminders query:', fetchRegError.message);
    return;
  }

  console.log(`Eligible manual-event registrations: ${registrations?.length || 0}`);

  const divisionIds = (registrations || []).map((r) => r.division_id).filter(Boolean);
  const divisionFees = {};
  if (divisionIds.length > 0) {
    const { data: divisionsData } = await supabaseAdmin
      .from('tournament_divisions')
      .select('id, entry_fee')
      .in('id', divisionIds);
    for (const d of divisionsData || []) {
      divisionFees[d.id] = Number(d.entry_fee || 0);
    }
  }

  const counts = { '7d': 0, '3d': 0, '1d': 0, skip: 0 };

  for (const reg of registrations || []) {
    const cal = reg.calendar;
    const fee = reg.division_id ? (divisionFees[reg.division_id] ?? 0) : Number(cal?.entry_fee || 0);
    const open = isEventStillOpen(cal, now);
    const closesAt = cal.registration_closes_at ? new Date(cal.registration_closes_at) : null;
    const hoursToClose = closesAt ? (closesAt.getTime() - now.getTime()) / (1000 * 60 * 60) : null;

    console.log('\n--------------------------------------------------');
    console.log(`Player: ${reg.full_name} (${reg.email})`);
    console.log(`Event: ${cal.event_name} (ID: ${cal.id}) manual=${cal.is_manual}`);
    console.log(`Division: ${reg.division} | Fee: R ${fee} | Open: ${open}`);
    console.log(`Closes in: ${hoursToClose != null ? `${hoursToClose.toFixed(1)}h` : 'n/a'}`);
    console.log(`Sent: 7d=${!!reg.reminder_7d_sent_at} 3d=${!!reg.reminder_3d_sent_at} 1d=${!!reg.reminder_1d_sent_at}`);

    if (!open || fee <= 0 || !closesAt || now >= closesAt) {
      console.log('Decision: SKIP');
      counts.skip++;
      continue;
    }

    const decision = pickReminderStage(reg, closesAt, now);
    console.log(`Decision: ${decision}`);
    if (decision === 'SEND 7-DAY REMINDER') counts['7d']++;
    else if (decision === 'SEND 3-DAY REMINDER') counts['3d']++;
    else if (decision === 'SEND 1-DAY REMINDER') counts['1d']++;
    else counts.skip++;
  }

  console.log('\n=== Summary ===');
  console.log(counts);
}

testReminders();
