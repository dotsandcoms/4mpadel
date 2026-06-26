/**
 * Finalize a stuck manual_event payment after Paystack success.
 * Persists registration_rows from payment metadata, then marks payment success.
 * Usage: node scripts/confirm-payment-once.mjs REGEV-439-1782458821682
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

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

function parseMeta(raw) {
    if (!raw) return {};
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function buildPersistedRegistrationRows(rows, covers, registrantEmail) {
    const registrant = registrantEmail.toLowerCase();
    const entryCoverSet = new Set(
        covers
            .filter((c) => c.type === 'entry')
            .map((c) => `${String(c.email).toLowerCase()}|${c.division}`),
    );

    return rows.map((row) => {
        const email = String(row.email || '').toLowerCase();
        const rowKey = `${email}|${row.division}`;
        const isRegistrant = email === registrant;

        let payment_status = String(row.payment_status || 'pending');
        if (isRegistrant || entryCoverSet.has(rowKey) || payment_status === 'paid') {
            payment_status = 'paid';
        } else {
            payment_status = 'pending';
        }

        let partner_payment_status = row.partner_payment_status ?? null;
        if (row.partner_email) {
            const partnerKey = `${String(row.partner_email).toLowerCase()}|${row.division}`;
            if (entryCoverSet.has(partnerKey)) {
                partner_payment_status = 'paid';
            }
        }

        return {
            ...row,
            payment_status,
            partner_payment_status,
            status: 'registered',
            payment_method: payment_status === 'paid' ? 'paystack' : row.payment_method,
        };
    });
}

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

const meta = parseMeta(payment.metadata);
const eventId = meta.event_id || payment.event_id;
const covers = Array.isArray(meta.covers) ? meta.covers : [];
const rows = Array.isArray(meta.registration_rows) ? meta.registration_rows : [];
const registrantEmail = String(meta.registrant_email || '').toLowerCase();

if (payment.status === 'success' && meta.registrations_persisted) {
    console.log('Already finalized.');
    process.exit(0);
}

if (rows.length > 0 && !meta.registrations_persisted) {
    const toUpsert = buildPersistedRegistrationRows(rows, covers, registrantEmail);
    console.log('Upserting registrations:');
    for (const row of toUpsert) {
        console.log(`  - ${row.full_name} (${row.email}): payment=${row.payment_status}`);
    }

    const { data: savedRows, error: upsertError } = await supabase
        .from('event_registrations')
        .upsert(toUpsert, { onConflict: 'event_id,email,division' })
        .select('*');

    if (upsertError) {
        console.error('Upsert failed:', upsertError.message, upsertError.details);
        process.exit(1);
    }
    console.log(`Saved ${savedRows?.length ?? 0} registration row(s)`);
}

if (payment.status !== 'success') {
    await supabase
        .from('payments')
        .update({ status: 'success', metadata: { ...meta, registrations_persisted: true } })
        .eq('id', payment.id);
    console.log('Payment marked success');
} else {
    await supabase
        .from('payments')
        .update({ metadata: { ...meta, registrations_persisted: true } })
        .eq('id', payment.id);
}

for (const c of covers.filter((x) => x.type === 'entry')) {
    await supabase
        .from('event_registrations')
        .update({ payment_status: 'paid', payment_method: 'paystack' })
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

const emails = rows.map((r) => r.email).filter(Boolean);
const { data: regs } = await supabase
    .from('event_registrations')
    .select('full_name, email, division, payment_status, partner_payment_status, status')
    .eq('event_id', eventId)
    .in('email', emails.length ? emails : [meta.registrant_email].filter(Boolean));

console.log('\nRegistrations now:');
console.table(regs);

const { data: payCheck } = await supabase
    .from('payments')
    .select('reference, status')
    .eq('id', payment.id)
    .single();
console.log('Payment:', payCheck);
