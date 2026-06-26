/**
 * Canonical source for event-registration refund logic.
 *
 * Supabase bundles each function in isolation, so this file is COPIED into each
 * function directory that imports it. Keep copies in sync:
 *   - paystack-refund/refund-engine.ts
 *   - paystack-webhook/refund-engine.ts
 *
 * Money convention: every amount in this module is in RANDS (matching
 * payments.amount / event_registrations.refund_amount). Conversion to Paystack
 * subunits (cents) happens only at the Paystack API boundary via toPaystackCents().
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type Cover = {
    type: string;            // 'entry' | 'license'
    email: string;
    division?: string;
    license?: string;        // 'full' | 'temporary' (for type === 'license')
};

export type PaymentRow = {
    id: string;
    reference: string;
    amount: number;          // RANDS
    status: string;
    is_test?: boolean | null;
    created_at?: string | null;
    metadata: unknown;
};

export type RefundRow = {
    id?: string;
    payment_id: string | null;
    amount: number;          // RANDS
    status: string;
};

export type RegistrationRow = {
    id: string;
    event_id: string | number;
    email: string;
    full_name?: string | null;
    division: string;
    division_id?: string | null;
    registered_by?: string | null;
    partner_name?: string | null;
    partner_email?: string | null;
    partner_payment_status?: string | null;
    payment_status?: string | null;
    status?: string | null;
};

export type RefundableItem = {
    payment_id: string;
    reference: string;
    refund_amount_rands: number;
    cover_type: string;          // 'entry' | 'license'
    already_refunded_rands: number;
    is_test: boolean | null;
};

export type EligibilityResult = {
    eligible: boolean;
    reason: string;
    closedForSelfService: boolean;
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const normEmail = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** Round to 2 decimals to avoid floating-point drift on Rand sums. */
export function roundRands(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Convert a Rand amount to Paystack subunits (cents). Use ONLY at the API boundary. */
export function toPaystackCents(rands: number): number {
    return Math.round(Number(rands || 0) * 100);
}

function parseMeta(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    return {};
}

function coversOf(payment: PaymentRow): Cover[] {
    const meta = parseMeta(payment.metadata);
    return Array.isArray(meta.covers) ? (meta.covers as Cover[]) : [];
}

function divisionFeesOf(payment: PaymentRow): Record<string, number> {
    const meta = parseMeta(payment.metadata);
    return (meta.division_entry_fees as Record<string, number>) || {};
}

/** Temp-license fee fallback (Rands). Matches src/constants/fees.js TEMPORARY_LICENSE. */
const TEMP_LICENSE_RANDS = 120;

function paymentTestMode(payment: PaymentRow): boolean | null {
    const meta = parseMeta(payment.metadata);
    if (payment.is_test === true || meta.is_test === true) return true;
    if (payment.is_test === false || meta.is_test === false) return false;
    return null;
}

// ----------------------------------------------------------------------------
// 1. resolveRefundableItems
// ----------------------------------------------------------------------------

/**
 * For the ONE registration being withdrawn, resolve what to refund.
 *
 * Policy: refund each line item for this entry exactly ONCE — the entry fee
 * once and any temporary-license once — to the original payer. If the same
 * entry was covered by more than one successful transaction (e.g. a duplicate
 * payment), only a single entry fee is auto-refunded; the surplus is left for
 * manual review rather than refunded twice.
 *
 * Withdraw-from-all refunds the full amount because the caller invokes this
 * once per registration, so each separately-paid entry is refunded in turn.
 *
 * Guard: a payment is only ever drawn down to its own amount
 *   sum(existing refunds for payment) + new <= payment.amount   (Rands),
 * accounting for items chosen earlier in the same call.
 *
 * - Entry fee: refundable in full (organiser absorbs Paystack fee loss).
 * - Temporary license: refundable ONLY when this withdrawal removes the
 *   player's last active entry in the event (the license is per-event and
 *   covers all divisions). Pass options.refundLicense to control this.
 *   Full annual license: NOT refundable.
 */
export function resolveRefundableItems(
    registration: RegistrationRow,
    payments: PaymentRow[],
    existingRefunds: RefundRow[],
    options: { refundLicense?: boolean } = {},
): RefundableItem[] {
    const refundLicense = options.refundLicense !== false;
    const regEmail = normEmail(registration.email);
    const regDivision = String(registration.division || '');

    // Running total drawn (Rands) per payment: existing non-failed refunds plus
    // items chosen in this call, so an entry + license taken from one
    // transaction stay within that transaction's amount.
    const drawnByPayment = new Map<string, number>();
    for (const r of existingRefunds) {
        if (!r.payment_id || r.status === 'failed') continue;
        drawnByPayment.set(
            r.payment_id,
            roundRands((drawnByPayment.get(r.payment_id) || 0) + Number(r.amount || 0)),
        );
    }

    const successPayments = payments.filter((p) => p.status === 'success');
    const remainingOf = (p: PaymentRow) =>
        roundRands(Number(p.amount || 0) - (drawnByPayment.get(p.id) || 0));

    // Prefer the transaction with the most room (so a fee fits in one payment),
    // tie-broken by most recent — the player's "active" paid entry.
    const byRoomThenRecent = (a: PaymentRow, b: PaymentRow) => {
        const diff = remainingOf(b) - remainingOf(a);
        if (Math.abs(diff) > 0.005) return diff;
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    };

    const items: RefundableItem[] = [];

    // --- Entry fee: refund once ---
    const entryPayments = successPayments
        .filter((p) =>
            coversOf(p).some(
                (c) =>
                    c.type === 'entry' &&
                    normEmail(c.email) === regEmail &&
                    String(c.division || '') === regDivision,
            ),
        )
        .sort(byRoomThenRecent);

    for (const p of entryPayments) {
        const entryFee = roundRands(Number(divisionFeesOf(p)[regDivision] || 0));
        const remaining = remainingOf(p);
        if (entryFee <= 0 || remaining <= 0) continue;
        const amount = Math.min(entryFee, remaining);
        items.push({
            payment_id: p.id,
            reference: p.reference,
            refund_amount_rands: amount,
            cover_type: 'entry',
            already_refunded_rands: drawnByPayment.get(p.id) || 0,
            is_test: paymentTestMode(p),
        });
        drawnByPayment.set(p.id, roundRands((drawnByPayment.get(p.id) || 0) + amount));
        break; // entry refunded once
    }

    // --- Temporary license: refund once, only if this is the player's last
    //     active entry in the event (full annual licenses excluded) ---
    const licensePayments = !refundLicense ? [] : successPayments
        .filter((p) =>
            coversOf(p).some(
                (c) =>
                    c.type === 'license' &&
                    normEmail(c.email) === regEmail &&
                    c.license !== 'full',
            ),
        )
        .sort(byRoomThenRecent);

    for (const p of licensePayments) {
        const remaining = remainingOf(p);
        if (remaining <= 0) continue;
        const amount = Math.min(TEMP_LICENSE_RANDS, remaining);
        if (amount <= 0) continue;
        items.push({
            payment_id: p.id,
            reference: p.reference,
            refund_amount_rands: amount,
            cover_type: 'license',
            already_refunded_rands: drawnByPayment.get(p.id) || 0,
            is_test: paymentTestMode(p),
        });
        drawnByPayment.set(p.id, roundRands((drawnByPayment.get(p.id) || 0) + amount));
        break; // license refunded once
    }

    return items;
}

// ----------------------------------------------------------------------------
// 2. applyRegistrationWithdrawal  (idempotent)
// ----------------------------------------------------------------------------

export type WithdrawalOptions = {
    markRefunded?: boolean;
    refundAmountRands?: number;
    unlinkPartners?: boolean;   // default true
};

/**
 * Mark a registration withdrawn and (optionally) refunded, then unlink partner
 * references on the surviving rows. Safe to call twice: a row already
 * 'withdrawn' is left untouched (returns alreadyWithdrawn: true).
 */
export async function applyRegistrationWithdrawal(
    supabaseAdmin: SupabaseClient,
    reg: RegistrationRow,
    options: WithdrawalOptions = {},
): Promise<{ withdrawn: boolean; alreadyWithdrawn: boolean }> {
    const unlinkPartners = options.unlinkPartners !== false;

    // Re-read current state for idempotency.
    const { data: current } = await supabaseAdmin
        .from('event_registrations')
        .select('status')
        .eq('id', reg.id)
        .maybeSingle();

    if (current?.status === 'withdrawn') {
        return { withdrawn: false, alreadyWithdrawn: true };
    }

    const updates: Record<string, unknown> = {
        status: 'withdrawn',
        withdrawn_at: new Date().toISOString(),
    };
    if (options.markRefunded) {
        updates.payment_status = 'refunded';
        updates.refunded_at = new Date().toISOString();
        if (typeof options.refundAmountRands === 'number') {
            updates.refund_amount = roundRands(options.refundAmountRands);
        }
    }

    const { error } = await supabaseAdmin
        .from('event_registrations')
        .update(updates)
        .eq('id', reg.id);
    if (error) throw error;

    if (unlinkPartners) {
        // Partner's row (they had reg as partner) — they stay registered.
        if (reg.partner_email) {
            await supabaseAdmin
                .from('event_registrations')
                .update({ partner_name: null, partner_email: null, partner_payment_status: null })
                .eq('event_id', reg.event_id)
                .eq('division', reg.division)
                .ilike('email', reg.partner_email)
                .eq('status', 'registered');
        }
        // Any row that listed reg as their partner.
        await supabaseAdmin
            .from('event_registrations')
            .update({ partner_name: null, partner_email: null, partner_payment_status: null })
            .eq('event_id', reg.event_id)
            .eq('division', reg.division)
            .ilike('partner_email', reg.email)
            .eq('status', 'registered');
    }

    return { withdrawn: true, alreadyWithdrawn: false };
}

// ----------------------------------------------------------------------------
// 3. transferBookingOwnership
// ----------------------------------------------------------------------------

/**
 * When the booking owner withdraws but the partner stays, promote the partner
 * to owner of their own row and clear the partner linkage back to the old owner.
 */
export async function transferBookingOwnership(
    supabaseAdmin: SupabaseClient,
    _ownerReg: RegistrationRow,
    partnerReg: RegistrationRow,
): Promise<void> {
    const { error } = await supabaseAdmin
        .from('event_registrations')
        .update({
            registered_by: partnerReg.email,
            partner_name: null,
            partner_email: null,
            partner_payment_status: null,
        })
        .eq('id', partnerReg.id);
    if (error) throw error;
}

// ----------------------------------------------------------------------------
// 4. cancelEventTempLicense
// ----------------------------------------------------------------------------

/**
 * Delete the temporary license for (player, event) and, if the player has no
 * other temporary license remaining and no full annual license, reset their
 * profile licence status back to "none".
 *
 * Resets BOTH license_type AND paid_registration: buying a temp license sets
 * paid_registration = true (in confirm-manual-payment), and the booking flow's
 * license check treats paid_registration === true as an active licence even when
 * license_type is 'none'. Leaving it set would make a refunded/cancelled licence
 * still read as active on re-booking.
 */
export async function cancelEventTempLicense(
    supabaseAdmin: SupabaseClient,
    playerEmail: string,
    eventId: string | number,
): Promise<void> {
    const { data: player } = await supabaseAdmin
        .from('players')
        .select('id, license_type')
        .ilike('email', playerEmail)
        .maybeSingle();
    if (!player) return;

    await supabaseAdmin
        .from('temporary_licenses')
        .delete()
        .eq('player_id', player.id)
        .eq('event_id', eventId);

    // Keep a full annual licence untouched.
    if (String(player.license_type || '').toLowerCase() === 'full') return;

    // Any other temporary licences still on file for this player?
    const { count: tempCount } = await supabaseAdmin
        .from('temporary_licenses')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', player.id);

    if ((tempCount || 0) === 0) {
        await supabaseAdmin
            .from('players')
            .update({ license_type: 'none', paid_registration: false })
            .eq('id', player.id);
    }
}

// ----------------------------------------------------------------------------
// 5. checkRefundEligibility
// ----------------------------------------------------------------------------

type DivisionRow = {
    id?: string;
    name?: string;
    entries_close_at?: string | null;
};

type EventRow = {
    registration_closes_at?: string | null;
    is_manual?: boolean | null;
};

function isClosed(division: DivisionRow | undefined, event: EventRow | undefined): boolean {
    const closeAt = division?.entries_close_at || event?.registration_closes_at;
    if (!closeAt) return false;
    return new Date(closeAt).getTime() < Date.now();
}

/**
 * Eligibility for self-service refund/withdrawal.
 * Admins bypass the close-date gate. `isAdmin` MUST be resolved server-side
 * (see resolveIsAdmin) — never trusted from the request body.
 */
export function checkRefundEligibility(
    reg: RegistrationRow,
    divisions: DivisionRow[],
    event: EventRow,
    callerEmail: string,
    isAdmin: boolean,
): EligibilityResult {
    if (event?.is_manual === false) {
        return { eligible: false, reason: 'not_manual_event', closedForSelfService: false };
    }
    if (reg.status === 'withdrawn') {
        return { eligible: false, reason: 'already_withdrawn', closedForSelfService: false };
    }

    const div = divisions.find(
        (d) => d.id === reg.division_id || d.name === reg.division,
    );
    const closed = isClosed(div, event);

    if (isAdmin) {
        return { eligible: true, reason: 'admin', closedForSelfService: closed };
    }

    const caller = normEmail(callerEmail);
    const isOwner = normEmail(reg.registered_by) === caller;
    const isSelf = normEmail(reg.email) === caller;
    const isPartner = normEmail(reg.partner_email) === caller;
    if (!isOwner && !isSelf && !isPartner) {
        return { eligible: false, reason: 'not_authorized', closedForSelfService: closed };
    }

    if (closed) {
        return { eligible: false, reason: 'closed', closedForSelfService: true };
    }

    return { eligible: true, reason: 'ok', closedForSelfService: false };
}

// ----------------------------------------------------------------------------
// 6. resolveIsAdmin
// ----------------------------------------------------------------------------

/**
 * Single source of truth for admin authorization: presence of a row in
 * admin_sidebar_permissions for the given email.
 */
export async function resolveIsAdmin(
    supabaseAdmin: SupabaseClient,
    email: string | null | undefined,
): Promise<boolean> {
    if (!email) return false;
    const { data } = await supabaseAdmin
        .from('admin_sidebar_permissions')
        .select('email')
        .ilike('email', email)
        .maybeSingle();
    return !!data;
}
