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

function isEventStillOpen(cal, now) {
  const compareDate = cal?.end_date || cal?.start_date;
  if (!compareDate) return true;
  const eventEnd = new Date(compareDate);
  eventEnd.setHours(23, 59, 59, 999);
  return now <= eventEnd;
}

async function testReminders() {
  console.log('=== Dry-run: manual-event payment reminders only ===');
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
      reminder_sent_at,
      close_reminder_sent_at,
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
    .not('pay_token', 'is', null);

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

  for (const reg of registrations || []) {
    const cal = reg.calendar;
    const fee = reg.division_id ? (divisionFees[reg.division_id] ?? 0) : Number(cal?.entry_fee || 0);
    const open = isEventStillOpen(cal, now);
    const createdAt = new Date(reg.created_at);
    const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    console.log('\n--------------------------------------------------');
    console.log(`Player: ${reg.full_name} (${reg.email})`);
    console.log(`Event: ${cal.event_name} (ID: ${cal.id}) manual=${cal.is_manual}`);
    console.log(`Division: ${reg.division} | Fee: R ${fee} | Open: ${open}`);

    if (!open || fee <= 0) {
      console.log('Decision: SKIP');
      continue;
    }

    const closesAt = cal.registration_closes_at ? new Date(cal.registration_closes_at) : null;
    let decision = 'DO NOTHING';
    if (closesAt && !reg.close_reminder_sent_at) {
      const hoursToClose = (closesAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursToClose > 0 && hoursToClose <= 24) decision = 'SEND DEADLINE REMINDER';
    }
    if (decision === 'DO NOTHING' && hoursSinceCreation >= 24 && !reg.reminder_sent_at) {
      if (!closesAt || now < closesAt) decision = 'SEND GENERAL REMINDER';
    }
    console.log(`Decision: ${decision}`);
  }
}

testReminders();
