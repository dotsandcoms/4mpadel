/**
 * ONE-OFF: reprocess stuck refund 92e7c531-4e1b-42b5-8b2d-7449fc26767d
 *
 * IMPORTANT: do NOT change event_registrations — Hamza is still registered
 * (Men's Advanced + Men's Open). This only sends the R500 to Paystack and
 * updates payment_refunds.
 *
 * Local .env has sk_test only, so we invoke the deployed paystack-refund edge
 * after preparing the row for retry_failed — then we immediately restore the
 * registration payment_status if the edge flipped it.
 *
 * Safer path used here: call Paystack via edge retry, then force-preserve
 * registration status/payment_status from a pre-snapshot.
 *
 * Usage:
 *   node scripts/reprocess-stuck-refund-once.mjs --dry-run
 *   node scripts/reprocess-stuck-refund-once.mjs
 *
 * Delete this file after use.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');
const REFUND_ID = '92e7c531-4e1b-42b5-8b2d-7449fc26767d';
const EXPECTED_REF = 'REGEV-439-1782386451852';
const EXPECTED_AMOUNT = 500;

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(url, serviceKey);

function parseMeta(raw) {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return {}; }
    }
    return typeof raw === 'object' ? raw : {};
}

const { data: refund, error: refundErr } = await supabase
    .from('payment_refunds')
    .select('*')
    .eq('id', REFUND_ID)
    .maybeSingle();

if (refundErr) {
    console.error('Load refund failed:', refundErr.message);
    process.exit(1);
}
if (!refund) {
    console.error('Refund not found:', REFUND_ID);
    process.exit(1);
}

console.log('Refund:', {
    id: refund.id,
    status: refund.status,
    amount: refund.amount,
    payment_id: refund.payment_id,
    paystack_reference: refund.paystack_reference,
    paystack_refund_id: refund.paystack_refund_id,
    event_registration_id: refund.event_registration_id,
});

if (String(refund.paystack_reference) !== EXPECTED_REF) {
    console.error(`Unexpected reference ${refund.paystack_reference}`);
    process.exit(1);
}
if (Number(refund.amount) !== EXPECTED_AMOUNT) {
    console.error(`Unexpected amount ${refund.amount}`);
    process.exit(1);
}
if (refund.paystack_refund_id) {
    console.error('Already has paystack_refund_id — aborting:', refund.paystack_refund_id);
    process.exit(1);
}

let payment = null;
if (refund.payment_id) {
    ({ data: payment } = await supabase.from('payments').select('*').eq('id', refund.payment_id).maybeSingle());
}
if (!payment) {
    ({ data: payment } = await supabase.from('payments').select('*').eq('reference', EXPECTED_REF).maybeSingle());
}
if (!payment) {
    console.error('Payment not found for', EXPECTED_REF);
    process.exit(1);
}

console.log('Payment:', {
    id: payment.id,
    reference: payment.reference,
    amount: payment.amount,
    status: payment.status,
    is_test: payment.is_test,
});

const { data: regSnap } = await supabase
    .from('event_registrations')
    .select('id, email, full_name, division, status, payment_status, refund_amount')
    .eq('id', refund.event_registration_id)
    .maybeSingle();

console.log('Registration snapshot (will be preserved):', regSnap);

if (!regSnap) {
    console.error('Linked registration missing — aborting');
    process.exit(1);
}

if (DRY_RUN) {
    console.log('[dry-run] would refund R500 via edge retry_failed, then restore registration to:', {
        status: regSnap.status,
        payment_status: regSnap.payment_status,
        refund_amount: regSnap.refund_amount,
    });
    process.exit(0);
}

const prevMeta = parseMeta(refund.metadata);
const { error: prepErr } = await supabase
    .from('payment_refunds')
    .update({
        payment_id: payment.id,
        status: 'failed',
        metadata: {
            ...prevMeta,
            prepared_for_retry_at: new Date().toISOString(),
            prepared_for_retry_by: 'script:reprocess-stuck-refund-once',
            prepared_from_status: refund.status,
            prepared_note: 'Stuck pending; money-only retry — keep registration registered/paid',
            preserve_registration: true,
        },
    })
    .eq('id', REFUND_ID)
    .is('paystack_refund_id', null);

if (prepErr) {
    console.error('Prepare update failed:', prepErr.message);
    process.exit(1);
}
console.log('Prepared refund row (payment_id linked, status=failed)');

const res = await fetch(`${url}/functions/v1/paystack-refund`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
    },
    body: JSON.stringify({
        action: 'retry_failed',
        payment_refund_id: REFUND_ID,
    }),
});

const text = await res.text();
let body;
try { body = JSON.parse(text); } catch { body = { raw: text }; }
console.log('Edge response:', res.status, JSON.stringify(body, null, 2));

// Edge retry_failed may set payment_status=refunded on this still-active entry.
// Restore the pre-refund registration snapshot so he stays registered/paid.
const { error: restoreErr } = await supabase
    .from('event_registrations')
    .update({
        status: regSnap.status,
        payment_status: regSnap.payment_status,
        refund_amount: regSnap.refund_amount,
    })
    .eq('id', regSnap.id);

if (restoreErr) {
    console.error('CRITICAL: failed to restore registration snapshot:', restoreErr.message);
} else {
    console.log('Restored registration to pre-refund snapshot (still registered/paid).');
}

const { data: finalRow } = await supabase
    .from('payment_refunds')
    .select('id, status, payment_id, paystack_reference, paystack_refund_id, amount, processed_at, metadata')
    .eq('id', REFUND_ID)
    .maybeSingle();

const { data: finalReg } = await supabase
    .from('event_registrations')
    .select('id, division, status, payment_status, refund_amount')
    .eq('id', regSnap.id)
    .maybeSingle();

console.log('\nFinal refund row:', JSON.stringify(finalRow, null, 2));
console.log('Final registration:', JSON.stringify(finalReg, null, 2));

if (!res.ok || body?.retried === false || body?.error) {
    process.exit(2);
}
