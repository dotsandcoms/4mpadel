/**
 * Canonical source for manual event registration persistence helpers.
 * Supabase bundles each function in isolation — copy changes to:
 *   - confirm-manual-payment/manual-event-payment.ts
 *   - paystack-webhook/manual-event-payment.ts
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchCommerceConfig, licenseQuote } from './commerce.ts';

export type ManualRegistrationRow = Record<string, unknown>;
export type ManualPaymentCover = { type: string; email: string; division?: string; license?: string; event_id?: string | number };
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
    freeEntries: ManualRegistrationRow[] = [],
): ManualRegistrationRow[] {
    const entryCoverSet = new Set(covers.filter((c) => c.type === 'entry')
        .map((c) => `${String(c.event_id || '')}|${String(c.email).toLowerCase()}|${c.division}`));
    const free = new Set(freeEntries.map(row => `${String(row.event_id || '')}|${String(row.email || '').toLowerCase()}|${row.division}`));
    const covered = (event: unknown, email: unknown, division: unknown) =>
        free.has(`${String(event || '')}|${String(email || '').toLowerCase()}|${division}`) || entryCoverSet.has(`${String(event || '')}|${String(email || '').toLowerCase()}|${division}`)
        || entryCoverSet.has(`|${String(email || '').toLowerCase()}|${division}`);
    const permitted = ['event_id','division_id','division','full_name','email','phone','partner_name','partner_email',
        'payment_method','tshirt_size','tshirt_sponsor_name','tshirt_logo_url','access_grant_id'];
    return rows.map((row) => ({
        ...Object.fromEntries(permitted.filter(key => row[key] !== undefined).map(key => [key,row[key]])),
        registered_by: registrantEmail.toLowerCase(),
        payment_status: covered(row.event_id,row.email,row.division) ? 'paid' : 'pending',
        partner_payment_status: row.partner_email ? covered(row.event_id,row.partner_email,row.division) ? 'paid' : 'pending' : null,
        status: 'registered',
    }));
}

export async function persistManualEventRegistrations(
    supabaseAdmin: SupabaseClient,
    payment: Record<string, unknown>,
    meta: Record<string, unknown>,
    covers: ManualPaymentCover[],
): Promise<{ savedRows: ManualRegistrationRow[]; persisted: boolean; needsReview?: boolean }> {
    const { data, error } = await supabaseAdmin.rpc('finalize_paid_event_checkout', { p_payment_id: payment.id });
    if (error) throw error;
    if (!data || !Array.isArray(data.savedRows)) throw new Error('Payment registration could not be confirmed.');
    return { savedRows: data.savedRows, persisted: data.persisted === true, needsReview: data.needsReview === true };
}

/** Apply covers and partner mirrors using the stable division identity. */
export async function markManualEventEntryCoversPaid(
    supabaseAdmin: SupabaseClient,
    payment: Record<string, unknown>,
    meta: Record<string, unknown>,
    covers: ManualPaymentCover[],
): Promise<void> {
    const snapshots = Array.isArray(meta.registration_rows) ? meta.registration_rows as ManualRegistrationRow[] : [];
    for (const cover of covers.filter((item) => item.type === 'entry')) {
        const snapshot = snapshots.find((row) => String(row.email).toLowerCase() === cover.email.toLowerCase()
            && row.division === cover.division
            && (cover.event_id == null || String(row.event_id) === String(cover.event_id)));
        const eventId = cover.event_id ?? snapshot?.event_id ?? meta.event_id ?? payment.event_id;
        const divisionId = snapshot?.division_id || snapshots.find((row) => row.division === cover.division
            && String(row.event_id) === String(eventId))?.division_id;
        for (const [emailColumn, values] of [
            ['email', { payment_status: 'paid', payment_method: 'paystack' }],
            ['partner_email', { partner_payment_status: 'paid' }],
        ] as const) {
            let query = supabaseAdmin.from('event_registrations').update(values)
                .eq('event_id', eventId).ilike(emailColumn, cover.email).neq('status', 'withdrawn');
            query = divisionId ? query.eq('division_id', divisionId) : query.eq('division', cover.division);
            const { data: updated, error } = await query.select('id');
            if (error) throw error;
            if (emailColumn === 'email' && !updated?.length) {
                throw new Error('The paid entry cover did not match an active registration');
            }
        }
    }
}

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
    const config = await fetchCommerceConfig(supabaseAdmin);
    const serverItems = Array.isArray(meta.server_license_items) ? meta.server_license_items as Record<string, unknown>[] : [];
    const stdFee = (c: ManualPaymentCover) => {
        const saved = serverItems.find(item => String(item.email).toLowerCase() === c.email.toLowerCase() && item.license === c.license);
        return saved ? Number(saved.amount) : licenseQuote(c.license === 'full' ? 'full' : 'temporary', config).total;
    };

    // License total: prefer the explicit license line item(s); fall back to the
    // standard fee for the license type when the breakdown is unavailable.
    const licenseLineTotal = lineItems
        .filter((li) => isLicenseLabel(li.label))
        .reduce((sum, li) => sum + Number(li.amount || 0), 0);
    const fallbackLicenseTotal = licenseCovers.reduce((sum, c) => sum + stdFee(c), 0);
    const licenseTotal = serverItems.length ? fallbackLicenseTotal : licenseLineTotal > 0 ? licenseLineTotal : fallbackLicenseTotal;

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
