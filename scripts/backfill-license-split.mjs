/**
 * Backfill: split an already-recorded bundled payment into separate ledger
 * rows, so a license that was charged together with an event entry shows as its
 * own line in the User Ledger.
 *
 * This is the one-off equivalent of the recordLicensePaymentSplit() helper that
 * now runs automatically in the paystack-webhook / confirm-manual-payment
 * finalisers. It produces identical rows:
 *   - inserts a dedicated license row (reference `LIC-<ref>`,
 *     payment_type full_license/temp_license), and
 *   - reduces the original row to the entry portion and narrows its covers to
 *     entries only.
 * The two rows sum back to the original charge (no double counting).
 *
 * Idempotent: guarded by metadata.split_recorded and an upsert on the license
 * row's unique reference. Safe to re-run. Use --dry-run to preview.
 *
 * Usage:
 *   node scripts/backfill-license-split.mjs REGEV-439-1782725109438
 *   node scripts/backfill-license-split.mjs REGEV-439-1782725109438 --dry-run
 *   node scripts/backfill-license-split.mjs --all --dry-run    # scan & preview every un-split bundled payment
 *   node scripts/backfill-license-split.mjs --all              # split them all
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ALL = args.includes('--all');
const reference = args.find((a) => !a.startsWith('--'));

if (!reference && !ALL) {
    console.error('Usage: node scripts/backfill-license-split.mjs <reference> [--dry-run]');
    console.error('   or: node scripts/backfill-license-split.mjs --all [--dry-run]');
    process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(url, key);

const FULL_LICENSE_RANDS = 450;
const TEMP_LICENSE_RANDS = 120;
const fmtR = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
const tag = DRY_RUN ? '[dry-run] would' : '';
const isLicenseLabel = (label) => /licen[cs]e/i.test(String(label || ''));
const round2 = (n) => Math.round(n * 100) / 100;

function parseMeta(raw) {
    if (!raw) return {};
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// Unwrap finance-sync rows: the real metadata may sit under
// original_trx.metadata when the row was created by the Paystack sync.
function resolveMeta(rawMetadata) {
    const outer = parseMeta(rawMetadata);
    if (outer.source === 'paystack_sync' && outer.original_trx?.metadata) {
        return { meta: parseMeta(outer.original_trx.metadata), outer };
    }
    return { meta: outer, outer };
}

async function splitPayment(payment) {
    const { meta, outer } = resolveMeta(payment.metadata);
    const ref = String(payment.reference || '');
    const total = Number(payment.amount || 0);

    if (outer.split_recorded || meta.split_recorded) {
        console.log(`  skip ${ref}: already split (split_recorded)`);
        return false;
    }

    const covers = Array.isArray(meta.covers) ? meta.covers : [];
    const licenseCovers = covers.filter((c) => c.type === 'license');
    if (licenseCovers.length === 0) {
        console.log(`  skip ${ref}: no license cover`);
        return false;
    }

    const lineItems = Array.isArray(meta.line_items) ? meta.line_items : [];
    const stdFee = (c) => (c.license === 'full' ? FULL_LICENSE_RANDS : TEMP_LICENSE_RANDS);

    const licenseLineTotal = lineItems
        .filter((li) => isLicenseLabel(li.label))
        .reduce((sum, li) => sum + Number(li.amount || 0), 0);
    const fallbackLicenseTotal = licenseCovers.reduce((sum, c) => sum + stdFee(c), 0);
    const licenseTotal = licenseLineTotal > 0 ? licenseLineTotal : fallbackLicenseTotal;

    if (licenseTotal <= 0 || licenseTotal >= total) {
        console.log(`  skip ${ref}: license amount out of range (license ${fmtR(licenseTotal)} vs total ${fmtR(total)})`);
        return false;
    }

    const entryPortion = round2(total - licenseTotal);
    const eventId = meta.event_id || payment.event_id || null;

    console.log(`  ${ref}: ${fmtR(total)}  ->  entry ${fmtR(entryPortion)} + license ${fmtR(licenseTotal)}`);

    // Build one license ledger row per license cover.
    const licenseRows = [];
    for (let i = 0; i < licenseCovers.length; i++) {
        const c = licenseCovers[i];
        const isFull = c.license === 'full';
        const amount = licenseCovers.length === 1 ? licenseTotal : stdFee(c);

        const { data: player } = await supabase
            .from('players').select('id, name').ilike('email', c.email).maybeSingle();

        const licenseRef = licenseCovers.length === 1 ? `LIC-${ref}` : `LIC-${ref}-${i + 1}`;
        console.log(`    ${tag} insert ${isFull ? 'full_license' : 'temp_license'} row ${licenseRef} (${fmtR(amount)}) for ${player?.name || c.email}`);

        licenseRows.push({
            player_id: player?.id ?? payment.player_id ?? null,
            event_id: eventId,
            amount,
            currency: 'ZAR',
            status: 'success',
            payment_type: isFull ? 'full_license' : 'temp_license',
            payment_method: 'paystack',
            reference: licenseRef,
            is_test: !!meta.is_test,
            metadata: {
                source: meta.source || 'manual_event',
                event_id: eventId,
                event_name: meta.event_name ?? null,
                covers: [c],
                parent_reference: ref,
                note: `License portion split from ${ref} (${fmtR(licenseTotal)}) — backfill`,
            },
        });
    }

    if (!DRY_RUN) {
        const { error: licErr } = await supabase
            .from('payments').upsert(licenseRows, { onConflict: 'reference' });
        if (licErr) { console.error('  license upsert failed:', licErr.message); return false; }
    }

    // Reduce the original row to the entry portion, narrowing top-level covers to
    // entries only (when present) and preserving the rest of the metadata.
    const newMetadata = { ...outer, split_recorded: true };
    if (Array.isArray(outer.covers)) {
        newMetadata.covers = outer.covers.filter((c) => c.type !== 'license');
    }
    console.log(`    ${tag} update original ${ref}: amount -> ${fmtR(entryPortion)}, covers narrowed, split_recorded=true`);
    if (!DRY_RUN) {
        const { error: updErr } = await supabase
            .from('payments')
            .update({ amount: entryPortion, payment_type: 'event_entry_fee', metadata: newMetadata })
            .eq('id', payment.id);
        if (updErr) { console.error('  original update failed:', updErr.message); return false; }
    }

    return true;
}

// ---------------------------------------------------------------------------

let targets = [];

if (ALL) {
    // Pull success payments and filter to bundled, un-split ones client-side
    // (license detection lives in JSON metadata, which is awkward to filter in SQL).
    const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('status', 'success')
        .eq('payment_type', 'event_entry_fee');
    if (error) { console.error('Query failed:', error.message); process.exit(1); }

    targets = (data || []).filter((p) => {
        const { meta, outer } = resolveMeta(p.metadata);
        if (outer.split_recorded || meta.split_recorded) return false;
        const covers = Array.isArray(meta.covers) ? meta.covers : [];
        return covers.some((c) => c.type === 'license');
    });
    console.log(`Found ${targets.length} un-split bundled payment(s).\n`);
} else {
    const { data: payment, error } = await supabase
        .from('payments').select('*').eq('reference', reference).maybeSingle();
    if (error || !payment) { console.error('Payment not found:', error?.message || reference); process.exit(1); }
    targets = [payment];
}

let split = 0;
for (const p of targets) {
    const did = await splitPayment(p);
    if (did) split++;
}

console.log('');
console.log(DRY_RUN
    ? `Dry run complete — no changes written. ${split} payment(s) would be split.`
    : `Done. ${split} payment(s) split.`);
