import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

const EVENT_ID = 381;
const DIVISION = "Men's Open (Pro/Elite)";
const CHRIS_EMAIL = 'chris@agcapital.co.za';
const CHRIS_NAME = 'Chris Westerhof';
const TIAAN_EMAIL = 'tiaancwtc@gmail.com';
const TIAAN_NAME = 'Tiaan Van Wyk';
const TIAAN_PARTICIPANT_ID = 'a6c7060a-4e18-4111-818d-b8a7c2b08823';

async function upsertReg(match, insertPayload, updatePayload) {
  let q = sb.from('event_registrations').select('id').eq('event_id', EVENT_ID).eq('division', DIVISION);
  if (match.email) q = q.ilike('email', match.email);
  const { data: existing } = await q.maybeSingle();

  if (existing) {
    const { data, error } = await sb
      .from('event_registrations')
      .update(updatePayload)
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;
    return { action: 'updated', row: data };
  }

  const { data, error } = await sb.from('event_registrations').insert([insertPayload]).select('*').single();
  if (error) throw error;
  return { action: 'inserted', row: data };
}

const { data: part, error: pErr } = await sb
  .from('tournament_participants')
  .update({ is_paid: true, last_synced_at: new Date().toISOString() })
  .eq('id', TIAAN_PARTICIPANT_ID)
  .select('full_name, class_name, is_paid, email')
  .single();
if (pErr) throw pErr;

const chrisReg = await upsertReg(
  { email: CHRIS_EMAIL },
  {
    event_id: EVENT_ID,
    full_name: CHRIS_NAME,
    email: CHRIS_EMAIL,
    division: DIVISION,
    partner_name: TIAAN_NAME,
    partner_email: TIAAN_EMAIL,
    payment_status: 'paid',
    partner_payment_status: 'paid',
    payment_method: 'paystack',
    status: 'registered',
    registered_by: CHRIS_EMAIL,
  },
  {
    full_name: CHRIS_NAME,
    partner_name: TIAAN_NAME,
    partner_email: TIAAN_EMAIL,
    payment_status: 'paid',
    partner_payment_status: 'paid',
    payment_method: 'paystack',
    status: 'registered',
    registered_by: CHRIS_EMAIL,
  },
);

const tiaanReg = await upsertReg(
  { email: TIAAN_EMAIL },
  {
    event_id: EVENT_ID,
    full_name: TIAAN_NAME,
    email: TIAAN_EMAIL,
    division: DIVISION,
    partner_name: CHRIS_NAME,
    partner_email: CHRIS_EMAIL,
    payment_status: 'paid',
    payment_method: 'paystack',
    status: 'registered',
    registered_by: CHRIS_EMAIL,
  },
  {
    full_name: TIAAN_NAME,
    partner_name: CHRIS_NAME,
    partner_email: CHRIS_EMAIL,
    payment_status: 'paid',
    payment_method: 'paystack',
    status: 'registered',
    registered_by: CHRIS_EMAIL,
  },
);

console.log('Tiaan participant:', part);
console.log('Chris registration:', chrisReg.action, chrisReg.row.id, chrisReg.row.payment_status, 'partner_paid:', chrisReg.row.partner_payment_status);
console.log('Tiaan registration:', tiaanReg.action, tiaanReg.row.id, 'registered_by:', tiaanReg.row.registered_by, 'paid:', tiaanReg.row.payment_status);
