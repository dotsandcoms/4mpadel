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
