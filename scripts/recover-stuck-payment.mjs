/**
 * Recover a paid-but-unfinalised manual_event payment.
 *
 * Handles the case where a payment was recorded by the admin Paystack finance
 * sync (metadata.source === 'paystack_sync', with the real checkout metadata
 * nested under metadata.original_trx.metadata) and therefore never went through
 * the normal finaliser. It:
 *   (a) unwraps original_trx.metadata when needed,
 *   (b) inserts/marks the event_registrations row(s) as paid for entry covers,
 *   (c) applies licence covers — sets players.license_type + paid_registration
 *       and inserts a temporary_licenses row for temporary licences,
 *   (d) marks the payment finalised and emails the registrant.
 *
 * Idempotent: safe to re-run. Use --dry-run to preview without writing.
 *
 * Usage:
 *   node scripts/recover-stuck-payment.mjs REGEV-439-1782716049997
 *   node scripts/recover-stuck-payment.mjs REGEV-439-1782716049997 --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const reference = args.find((a) => !a.startsWith('--'));

if (!reference) {
    console.error('Usage: node scripts/recover-stuck-payment.mjs <reference> [--dry-run]');
    process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(url, key);
const fmtR = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
const tag = DRY_RUN ? '[dry-run] would' : '';

function parseMeta(raw) {
    if (!raw) return {};
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// Unwrap finance-sync rows: the real manual_event metadata sits under
// original_trx.metadata when the row was created by the Paystack sync.
function resolveMeta(rawMetadata) {
    const outer = parseMeta(rawMetadata);
    if (outer.source === 'paystack_sync' && outer.original_trx?.metadata) {
        return { meta: parseMeta(outer.original_trx.metadata), wasWrapped: true, outer };
    }
    return { meta: outer, wasWrapped: false, outer };
}

function buildPersistedRegistrationRows(rows, covers, registrantEmail) {
    const registrant = (registrantEmail || '').toLowerCase();
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
            if (entryCoverSet.has(partnerKey)) partner_payment_status = 'paid';
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
    if (DRY_RUN) {
        console.log(`  [dry-run] would email [${template}] → ${to}`);
        return;
    }
    const res = await fetch(`${url}/functions/v1/send-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, template, variables }),
    });
    const text = await res.text();
    console.log(`  email [${template}] → ${to}: ${res.status} ${text.slice(0, 100)}`);
}

// ---------------------------------------------------------------------------

const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('reference', reference)
    .maybeSingle();

if (error || !payment) {
    console.error('Payment not found:', error?.message || reference);
    process.exit(1);
}

const { meta, wasWrapped, outer } = resolveMeta(payment.metadata);
const eventId = meta.event_id || payment.event_id;
const covers = Array.isArray(meta.covers) ? meta.covers : [];
const rows = Array.isArray(meta.registration_rows) ? meta.registration_rows : [];
const registrantEmail = String(meta.registrant_email || '').toLowerCase();

console.log(`Reference:     ${reference}`);
console.log(`Payment status: ${payment.status} | amount: ${fmtR(payment.amount)} | source: ${outer.source || 'n/a'}${wasWrapped ? ' (unwrapped from original_trx)' : ''}`);
console.log(`Registrant:    ${meta.registrant_name || '?'} <${registrantEmail || '?'}>`);
console.log(`Event:         ${meta.event_name || eventId}`);
console.log(`Covers:        ${covers.map((c) => `${c.type}:${c.email}:${c.division || c.license || ''}`).join(' | ') || 'none'}`);
console.log(`Reg rows:      ${rows.length}`);
console.log('');

if (outer.recovered) {
    console.log('This payment is already marked recovered. Re-running anyway (idempotent)…\n');
}

if (rows.length === 0 && covers.length === 0) {
    console.error('No registration_rows or covers found in metadata — nothing to recover. Aborting.');
    process.exit(1);
}

// 1. Upsert registration rows.
if (rows.length > 0) {
    const toUpsert = buildPersistedRegistrationRows(rows, covers, registrantEmail);
    for (const r of toUpsert) {
        console.log(`${tag} upsert registration: ${r.full_name} <${r.email}> — ${r.division} (${r.payment_status})`);
    }
    if (!DRY_RUN) {
        const { data: saved, error: upErr } = await supabase
            .from('event_registrations')
            .upsert(toUpsert, { onConflict: 'event_id,email,division' })
            .select('*');
        if (upErr) {
            console.error('Registration upsert failed:', upErr.message, upErr.details);
            process.exit(1);
        }
        console.log(`  saved ${saved?.length ?? 0} registration row(s)`);
    }
}

// 2. Mark entry covers paid on event_registrations.
for (const c of covers.filter((x) => x.type === 'entry')) {
    console.log(`${tag} mark paid: ${c.email} — ${c.division}`);
    if (!DRY_RUN) {
        await supabase.from('event_registrations')
            .update({ payment_status: 'paid', payment_method: 'paystack' })
            .eq('event_id', eventId).eq('division', c.division).ilike('email', c.email);
        await supabase.from('event_registrations')
            .update({ partner_payment_status: 'paid' })
            .eq('event_id', eventId).eq('division', c.division).ilike('partner_email', c.email);
    }
}

// 3. Apply licence covers (this is the part the old script and the sync miss).
for (const c of covers.filter((x) => x.type === 'license')) {
    const isFull = c.license === 'full';
    const { data: player } = await supabase
        .from('players').select('id, name, email').ilike('email', c.email).maybeSingle();
    if (!player) {
        console.log(`  ! no player profile found for ${c.email} — cannot apply licence`);
        continue;
    }
    console.log(`${tag} apply ${isFull ? 'full' : 'temporary'} licence to ${player.name || c.email} (paid_registration=true)`);
    if (!DRY_RUN) {
        await supabase.from('players')
            .update({ license_type: isFull ? 'full' : 'temporary', paid_registration: true })
            .eq('id', player.id);
    }

    if (!isFull) {
        // Avoid duplicate temporary_licenses rows on re-run.
        const { data: existingLic } = await supabase
            .from('temporary_licenses')
            .select('id')
            .eq('player_id', player.id)
            .eq('event_id', eventId)
            .maybeSingle();
        if (existingLic) {
            console.log('  temporary licence row already exists — skipping insert');
        } else {
            const { data: ev } = await supabase
                .from('calendar').select('event_name, end_date, start_date').eq('id', eventId).maybeSingle();
            console.log(`${tag} insert temporary_licenses row for ${player.name || c.email}`);
            if (!DRY_RUN) {
                await supabase.from('temporary_licenses').insert([{
                    player_id: player.id,
                    event_id: eventId,
                    event_name: ev?.event_name || meta.event_name || '',
                    event_date: ev?.end_date || ev?.start_date || null,
                }]);
            }
        }
    }
}

// 4. Mark the payment finalised (keep the sync wrapper intact, just add flags).
console.log(`${tag} mark payment success + recovered`);
if (!DRY_RUN) {
    await supabase.from('payments')
        .update({ status: 'success', metadata: { ...outer, recovered: true, registrations_persisted: true } })
        .eq('id', payment.id);
}

// 5. Emails — registration confirmed + payment receipt.
const lineItems = Array.isArray(meta.line_items)
    ? meta.line_items.map((li) => `${li.label}: ${fmtR(li.amount)}`).join('\n')
    : '';
const eventUrl = (meta.event_url || '').replace('localhost:5173', '4mpadel.co.za') || 'https://4mpadel.co.za/calendar';

if (registrantEmail) {
    await sendEmail(registrantEmail, 'event_registration', {
        eventId,
        playerName: meta.registrant_name || 'Player',
        eventName: meta.event_name || 'Tournament',
        division: meta.division_names || covers.find((c) => c.type === 'entry')?.division || '',
        partnerName: meta.primary_partner_name || 'TBD',
        eventDates: meta.event_dates || '',
        venue: meta.event_venue || '',
        paid: true,
        amount: fmtR(payment.amount),
        amountDue: 'R 0.00',
        eventUrl,
    });
    await sendEmail(registrantEmail, 'payment_confirmation', {
        eventId,
        playerName: meta.registrant_name || 'Player',
        eventName: meta.event_name || 'Tournament',
        amount: fmtR(payment.amount),
        lineItems,
        reference,
        eventUrl,
    });
}

// 6. Show the result.
if (!DRY_RUN) {
    const emails = rows.map((r) => r.email).filter(Boolean);
    const { data: regs } = await supabase
        .from('event_registrations')
        .select('full_name, email, division, payment_status, status')
        .eq('event_id', eventId)
        .in('email', emails.length ? emails : [registrantEmail].filter(Boolean));
    console.log('\nRegistrations now:');
    console.table(regs);
}

console.log(DRY_RUN ? '\nDry run complete — no changes written.' : '\nRecovery complete.');
