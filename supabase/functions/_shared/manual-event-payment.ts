/**
 * Canonical source for manual event registration persistence helpers.
 * Supabase bundles each function in isolation — copy changes to:
 *   - confirm-manual-payment/manual-event-payment.ts
 *   - paystack-webhook/manual-event-payment.ts
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type ManualRegistrationRow = Record<string, unknown>;
export type ManualPaymentCover = { type: string; email: string; division?: string; license?: string };
export type SoloLinkUpdate = {
    id: string;
    email: string;
    division: string;
    partner_name: string;
    partner_email: string;
    partner_payment_status?: string | null;
};

export function buildPersistedRegistrationRows(
    rows: ManualRegistrationRow[],
    covers: ManualPaymentCover[],
    registrantEmail: string,
): ManualRegistrationRow[] {
    const registrant = registrantEmail.toLowerCase();
    const entryCoverSet = new Set(
        covers
            .filter((c) => c.type === 'entry')
            .map((c) => `${String(c.email).toLowerCase()}|${c.division}`),
    );

    return rows.map((row) => {
        const email = String(row.email || '').toLowerCase();
        const key = `${email}|${row.division}`;
        const isRegistrant = email === registrant;

        let payment_status = String(row.payment_status || 'pending');
        if (isRegistrant || entryCoverSet.has(key) || payment_status === 'paid') {
            payment_status = 'paid';
        } else {
            payment_status = 'pending';
        }

        let partner_payment_status = row.partner_payment_status as string | null | undefined;
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
        };
    });
}

export async function persistManualEventRegistrations(
    supabaseAdmin: SupabaseClient,
    payment: Record<string, unknown>,
    meta: Record<string, unknown>,
    covers: ManualPaymentCover[],
): Promise<{ savedRows: ManualRegistrationRow[]; persisted: boolean }> {
    const rows = Array.isArray(meta.registration_rows)
        ? (meta.registration_rows as ManualRegistrationRow[])
        : [];
    if (rows.length === 0 || meta.registrations_persisted) {
        return { savedRows: [], persisted: false };
    }

    const registrantEmail = String(meta.registrant_email || '').toLowerCase();
    const toUpsert = buildPersistedRegistrationRows(rows, covers, registrantEmail);
    const entryCoverSet = new Set(
        covers
            .filter((c) => c.type === 'entry')
            .map((c) => `${String(c.email).toLowerCase()}|${c.division}`),
    );
    const soloLinks = Array.isArray(meta.solo_link_updates)
        ? (meta.solo_link_updates as SoloLinkUpdate[])
        : [];

    const { data: savedRows, error } = await supabaseAdmin
        .from('event_registrations')
        .upsert(toUpsert, { onConflict: 'event_id,email,division' })
        .select('*');

    if (error) throw error;

    for (const link of soloLinks) {
        const updates: Record<string, unknown> = {
            partner_name: link.partner_name,
            partner_email: link.partner_email,
            partner_payment_status: link.partner_payment_status ?? null,
        };
        const soloKey = `${String(link.email).toLowerCase()}|${link.division}`;
        if (entryCoverSet.has(soloKey)) {
            updates.payment_status = 'paid';
        }
        const { error: linkError } = await supabaseAdmin
            .from('event_registrations')
            .update(updates)
            .eq('id', link.id);
        if (linkError) throw linkError;
    }

    await supabaseAdmin
        .from('payments')
        .update({ metadata: { ...meta, registrations_persisted: true } })
        .eq('id', payment.id as string);

    return { savedRows: savedRows || [], persisted: true };
}

const FULL_LICENSE_RANDS = 450;
const TEMP_LICENSE_RANDS = 120;

/**
 * Split a combined event payment into separate ledger rows so a bundled
 * license shows as its own entry in the User Ledger (and reconciles per type).
 *
 * Paystack settles the registration as ONE transaction, so finalisation starts
 * with a single `payments` row for the full amount tagged `event_entry_fee`.
 * When metadata.covers includes a license, we:
 *   - insert a dedicated license row (reference `LIC-<ref>`), and
 *   - reduce the original row to the entry portion and narrow its covers to
 *     entries only.
 * The two rows therefore sum back to the charge (no double counting), and the
 * refund engine — which reads covers + division_entry_fees — attributes entry
 * vs license unambiguously.
 *
 * Idempotent: guarded by metadata.split_recorded and an upsert on the license
 * row's unique reference, so a webhook retry or the racing browser-confirm path
 * cannot double-insert. Must run AFTER persistManualEventRegistrations (which
 * stamps registrations_persisted) — we re-read the row's metadata before the
 * update so that flag is preserved.
 */
export async function recordLicensePaymentSplit(
    supabaseAdmin: SupabaseClient,
    payment: Record<string, unknown>,
    meta: Record<string, unknown>,
): Promise<{ split: boolean; reason?: string }> {
    if (meta.split_recorded) return { split: false, reason: 'already_split' };

    const covers: ManualPaymentCover[] = Array.isArray(meta.covers)
        ? (meta.covers as ManualPaymentCover[])
        : [];
    const licenseCovers = covers.filter((c) => c.type === 'license');
    if (licenseCovers.length === 0) return { split: false, reason: 'no_license_cover' };

    const reference = String(payment.reference || '');
    const total = Number(payment.amount || 0);
    const lineItems = Array.isArray(meta.line_items)
        ? (meta.line_items as Array<{ label: string; amount: number }>)
        : [];
    const isLicenseLabel = (label: unknown) => /licen[cs]e/i.test(String(label || ''));
    const stdFee = (c: ManualPaymentCover) =>
        c.license === 'full' ? FULL_LICENSE_RANDS : TEMP_LICENSE_RANDS;

    // License total: prefer the explicit license line item(s); fall back to the
    // standard fee for the license type when the breakdown is unavailable.
    const licenseLineTotal = lineItems
        .filter((li) => isLicenseLabel(li.label))
        .reduce((sum, li) => sum + Number(li.amount || 0), 0);
    const fallbackLicenseTotal = licenseCovers.reduce((sum, c) => sum + stdFee(c), 0);
    const licenseTotal = licenseLineTotal > 0 ? licenseLineTotal : fallbackLicenseTotal;

    // Bail out rather than corrupt totals if the numbers don't make sense.
    if (licenseTotal <= 0 || licenseTotal >= total) {
        return { split: false, reason: 'license_amount_out_of_range' };
    }

    const entryPortion = Math.round((total - licenseTotal) * 100) / 100;
    const eventId = (meta.event_id as string) || (payment.event_id as string) || null;

    // One license ledger row per license cover, attributing the matching
    // line-item amount where possible, else the standard fee.
    const licenseRows: Record<string, unknown>[] = [];
    for (let i = 0; i < licenseCovers.length; i++) {
        const c = licenseCovers[i];
        const isFull = c.license === 'full';
        const amount = licenseCovers.length === 1 ? licenseTotal : stdFee(c);

        const { data: player } = await supabaseAdmin
            .from('players')
            .select('id')
            .ilike('email', c.email)
            .maybeSingle();

        licenseRows.push({
            player_id: player?.id ?? payment.player_id ?? null,
            event_id: eventId,
            amount,
            currency: 'ZAR',
            status: 'success',
            payment_type: isFull ? 'full_license' : 'temp_license',
            payment_method: 'paystack',
            reference: licenseCovers.length === 1 ? `LIC-${reference}` : `LIC-${reference}-${i + 1}`,
            is_test: !!meta.is_test,
            metadata: {
                source: meta.source || 'manual_event',
                event_id: eventId,
                event_name: meta.event_name ?? null,
                covers: [c],
                parent_reference: reference,
                note: `License portion split from ${reference} (R ${licenseTotal})`,
            },
        });
    }

    // Insert license row(s) — idempotent on the unique reference.
    const { error: licErr } = await supabaseAdmin
        .from('payments')
        .upsert(licenseRows, { onConflict: 'reference' });
    if (licErr) throw licErr;

    // Re-read current metadata so we preserve registrations_persisted (written
    // by persistManualEventRegistrations) and any other concurrent updates.
    const { data: currentRow } = await supabaseAdmin
        .from('payments')
        .select('metadata')
        .eq('id', payment.id as string)
        .maybeSingle();
    const baseMeta = (currentRow?.metadata as Record<string, unknown>) || meta;
    const entryCovers = covers.filter((c) => c.type !== 'license');

    const { error: updErr } = await supabaseAdmin
        .from('payments')
        .update({
            amount: entryPortion,
            payment_type: 'event_entry_fee',
            metadata: { ...baseMeta, covers: entryCovers, split_recorded: true },
        })
        .eq('id', payment.id as string);
    if (updErr) throw updErr;

    return { split: true };
}
