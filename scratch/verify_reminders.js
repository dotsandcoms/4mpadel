import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE URL or SERVICE ROLE KEY in .env file.");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

async function testReminders() {
  console.log("=== Testing Reminders Database Query ===");
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
        start_date
      )
    `)
    .eq('payment_status', 'pending')
    .eq('status', 'registered');

  if (fetchRegError) {
    console.error("Failed to run reminders query:", fetchRegError.message);
    return;
  }

  console.log(`Successfully fetched ${registrations?.length || 0} unpaid registrations.`);

  if (!registrations || registrations.length === 0) {
    console.log("No registrations require payment reminders at this time.");
    return;
  }

  // Fetch division fees for exact amounts
  const divisionIds = registrations.map(r => r.division_id).filter(Boolean);
  const divisionFees = {};

  if (divisionIds.length > 0) {
    const { data: divisionsData, error: fetchDivError } = await supabaseAdmin
      .from('tournament_divisions')
      .select('id, entry_fee')
      .in('id', divisionIds);

    if (!fetchDivError && divisionsData) {
      divisionsData.forEach(d => {
        divisionFees[d.id] = Number(d.entry_fee || 0);
      });
    }
  }

  for (const reg of registrations) {
    // Skip past events (events starting today or already started)
    if (reg.calendar?.start_date) {
      const todayStr = now.toISOString().split('T')[0];
      if (todayStr >= reg.calendar.start_date) {
        continue;
      }
    }

    const createdAt = new Date(reg.created_at);
    const closesAt = reg.calendar?.registration_closes_at ? new Date(reg.calendar.registration_closes_at) : null;
    
    const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    const fee = reg.division_id ? (divisionFees[reg.division_id] ?? 0) : Number(reg.calendar?.entry_fee || 0);
    
    console.log(`\n--------------------------------------------------`);
    console.log(`Player: ${reg.full_name} (${reg.email})`);
    console.log(`Event: ${reg.calendar.event_name} (ID: ${reg.calendar.id})`);
    console.log(`Division: ${reg.division} | Fee: R ${fee}`);
    console.log(`Created At: ${reg.created_at} (${hoursSinceCreation.toFixed(2)} hours ago)`);
    console.log(`General Reminder Sent: ${reg.reminder_sent_at || 'Never'}`);
    console.log(`Deadline Reminder Sent: ${reg.close_reminder_sent_at || 'Never'}`);
    
    let shouldSendGeneral = false;
    let shouldSendDeadline = false;

    if (closesAt) {
      const hoursToClose = (closesAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      console.log(`Deadline Closes: ${closesAt.toISOString()} (${hoursToClose.toFixed(2)} hours from now)`);
      
      if (!reg.close_reminder_sent_at && hoursToClose > 0 && hoursToClose <= 24) {
        shouldSendDeadline = true;
      }
    } else {
      console.log(`Deadline Closes: TBC/Null`);
    }

    if (!shouldSendDeadline && hoursSinceCreation >= 24 && !reg.reminder_sent_at) {
      if (!closesAt || now < closesAt) {
        shouldSendGeneral = true;
      }
    }

    console.log(`Decision: ${shouldSendDeadline ? '🚨 SEND DEADLINE REMINDER' : shouldSendGeneral ? '📧 SEND GENERAL REMINDER' : '⏳ DO NOTHING (Criteria not met yet)'}`);
  }
}

testReminders();
