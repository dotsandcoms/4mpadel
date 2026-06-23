/**
 * One-off: finalize a stuck manual_event payment after Paystack success.
 * Usage: node scripts/confirm-payment-once.mjs MANUAL-431-1782124736429
 */
import { createClient } from '@supabase/supabase-js';

const reference = process.argv[2];
if (!reference) {
    console.error('Usage: node scripts/confirm-payment-once.mjs <reference>');
    process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(url, key);
const fmtR = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

async function sendEmail(to, template, variables) {
    const res = await fetch(`${url}/functions/v1/send-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, template, variables }),
    });
    const text = await res.text();
    console.log(`email [${template}] → ${to}:`, res.status, text.slice(0, 120));
}

const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .maybeSingle();

if (error || !payment) {
    console.error('Payment not found:', error?.message);
    process.exit(1);
}

if (payment.status === 'success') {
    console.log('Already finalized.');
    process.exit(0);
}

const meta = payment.metadata || {};
const eventId = meta.event_id || payment.event_id;
const covers = Array.isArray(meta.covers) ? meta.covers : [];

await supabase.from('payments').update({ status: 'success' }).eq('id', payment.id);
console.log('Payment marked success');

for (const c of covers.filter((x) => x.type === 'entry')) {
    await supabase
        .from('event_registrations')
        .update({ payment_status: 'paid' })
        .eq('event_id', eventId)
        .eq('division', c.division)
        .ilike('email', c.email);
    await supabase
        .from('event_registrations')
        .update({ partner_payment_status: 'paid' })
        .eq('event_id', eventId)
        .eq('division', c.division)
        .ilike('partner_email', c.email);
    console.log(`Marked paid: ${c.email} — ${c.division}`);
}

const lineItems = Array.isArray(meta.line_items)
    ? meta.line_items.map((li) => `${li.label}: ${fmtR(li.amount)}`).join('\n')
    : '';

if (meta.registrant_email) {
    await sendEmail(meta.registrant_email, 'payment_confirmation', {
        playerName: meta.registrant_name || 'Player',
        eventName: meta.event_name || 'Tournament',
        amount: fmtR(payment.amount),
        lineItems,
        reference,
        eventUrl: meta.event_url?.replace('localhost:5173', '4mpadel.co.za') || 'https://4mpadel.co.za/calendar',
    });
}

const registrantEmail = String(meta.registrant_email || '').toLowerCase();
const partnerDivisions = new Map();
for (const c of covers.filter((x) => x.type === 'entry')) {
    const email = String(c.email || '').toLowerCase();
    if (!email || email === registrantEmail) continue;
    if (!partnerDivisions.has(email)) partnerDivisions.set(email, []);
    partnerDivisions.get(email).push(c.division);
}

for (const [partnerEmail, divs] of partnerDivisions) {
    const { data: reg } = await supabase
        .from('event_registrations')
        .select('full_name')
        .eq('event_id', eventId)
        .ilike('email', partnerEmail)
        .limit(1)
        .maybeSingle();
    await sendEmail(partnerEmail, 'partner_entry_paid', {
        playerName: reg?.full_name || 'Player',
        payerName: meta.registrant_name || 'Your partner',
        eventName: meta.event_name || 'Tournament',
        division: divs.join(', '),
        eventUrl: meta.event_url?.replace('localhost:5173', '4mpadel.co.za') || 'https://4mpadel.co.za/calendar',
    });
}

const { data: regs } = await supabase
    .from('event_registrations')
    .select('full_name, email, division, payment_status')
    .eq('event_id', eventId)
    .in('email', ['bradley.elin@gmail.com', 'markstillerman@gmail.com']);

console.log('\nRegistrations now:');
console.table(regs);
