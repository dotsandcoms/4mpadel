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
    division_id?: string | null;
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
    event_registration_id?: string | null;
    amount: number;          // RANDS
    status: string;
    metadata?: unknown;
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

type VerifiedEntryTransfer = {
    cover_position: number;
    event_id: string | number;
    registration_id: string;
    email?: string;
    division: string;
    division_id: string | null;
    original_division?: string;
    original_division_id?: string | null;
};

function refundEntryCover(payment: PaymentRow, registration: RegistrationRow): { cover: Cover; transferred: boolean } | undefined {
    const aliases = parseMeta(payment.metadata).verified_entry_transfers;
    const byPosition = new Map<number, VerifiedEntryTransfer>(Array.isArray(aliases)
        ? aliases.map(value => [Number(value?.cover_position), value as VerifiedEntryTransfer]) : []);
    let position = 0;
    for (const cover of coversOf(payment)) {
        if (cover.type !== 'entry') continue;
        const alias = byPosition.get(++position);
        if (alias) {
            const sourceDivision = alias.original_division ?? alias.division;
            const sourceDivisionId = alias.original_division !== undefined ? alias.original_division_id : alias.division_id;
            if (alias.cover_position === position && String(alias.event_id) === String(registration.event_id)
                && alias.registration_id === registration.id && normEmail(registration.email)
                && (alias.email === undefined || normEmail(alias.email) === normEmail(registration.email))
                && (cover.division_id ? cover.division_id === sourceDivisionId : cover.division === sourceDivision)
                && (alias.division_id ? alias.division_id === registration.division_id : alias.division === registration.division)) {
                return { cover, transferred: true };
            }
        } else if (normEmail(cover.email) === normEmail(registration.email) && String(cover.division || '') === String(registration.division || '')) {
            return { cover, transferred: false };
        }
    }
}

export function paymentCoversRefundEntry(payment: PaymentRow, registration: RegistrationRow): boolean {
    return Boolean(refundEntryCover(payment, registration));
}

export function paymentUsesVerifiedEntryTransfer(payment: PaymentRow, registration: RegistrationRow): boolean {
    return refundEntryCover(payment, registration)?.transferred === true;
}

/**
 * Paystack only knows about the original checkout reference. License splits
 * create ledger-only rows (`LIC-<parent>` with metadata.parent_reference) that
 * must never be sent to Paystack's refund/verify APIs.
 */
export function resolvePaystackGatewayReference(payment: PaymentRow): string {
    const meta = parseMeta(payment.metadata);
    const parent = String(meta.parent_reference || '').trim();
    if (parent) return parent;
    const ref = String(payment.reference || '');
    if (ref.startsWith('LIC-')) return ref.slice(4);
    return ref;
}

/** True when this payments row is a bookkeeping split, not a gateway charge. */
export function isLedgerSplitPayment(payment: PaymentRow): boolean {
    const meta = parseMeta(payment.metadata);
    if (String(meta.parent_reference || '').trim()) return true;
    return String(payment.reference || '').startsWith('LIC-');
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

    // Running total drawn (Rands) per payment: existing non-failed refunds plus
    // items chosen in this call, so an entry + license taken from one
    // transaction stay within that transaction's amount.
    const drawnByPayment = new Map<string, number>();
    const entryDrawnByPayment = new Map<string, number>();
    for (const r of existingRefunds) {
        if (!r.payment_id || r.status === 'failed') continue;
        drawnByPayment.set(
            r.payment_id,
            roundRands((drawnByPayment.get(r.payment_id) || 0) + Number(r.amount || 0)),
        );
        const coverType = parseMeta(r.metadata).cover_type;
        if (r.event_registration_id === registration.id && (!coverType || coverType === 'entry')) {
            entryDrawnByPayment.set(
                r.payment_id,
                roundRands((entryDrawnByPayment.get(r.payment_id) || 0) + Number(r.amount || 0)),
            );
        }
    }

    const successPayments = payments.filter((p) => p.status === 'success');
    const remainingOf = (p: PaymentRow) =>
        roundRands(Number(p.amount || 0) - (drawnByPayment.get(p.id) || 0));

    // Prefer the transaction with the most room (so a fee fits in one payment),
    // then prefer rows that look like a real settled checkout (covers + paystack),
    // tie-broken by most recent — the player's "active" paid entry.
    const byRoomThenRecent = (a: PaymentRow, b: PaymentRow) => {
        const diff = remainingOf(b) - remainingOf(a);
        if (Math.abs(diff) > 0.005) return diff;
        const score = (p: PaymentRow) => {
            const meta = parseMeta(p.metadata);
            let s = 0;
            if (Array.isArray(meta.covers) && (meta.covers as Cover[]).length > 0) s += 10;
            if (meta.source === 'manual_event' || meta.source === 'paystack_sync') s += 5;
            if (meta.inherited_covers_from || meta.inherited_covers_from_sibling) s += 2;
            return s;
        };
        const scoreDiff = score(b) - score(a);
        if (scoreDiff !== 0) return scoreDiff;
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    };

    const items: RefundableItem[] = [];

    // --- Entry fee: refund once ---
    const entryPayments = successPayments
        .filter(p => parseMeta(p.metadata).source !== 'native_entry_balance')
        .filter(p => paymentCoversRefundEntry(p, registration))
        // A previous partial identifies the receipt for this entry. Finish that
        // allocation before considering any other successful checkout.
        .sort((a, b) => Number(entryDrawnByPayment.has(b.id)) - Number(entryDrawnByPayment.has(a.id)) || byRoomThenRecent(a, b));

    for (const p of entryPayments) {
        const cover = refundEntryCover(p, registration)?.cover;
        const entryFee = roundRands(Number(divisionFeesOf(p)[cover?.division || registration.division] || 0));
        const entryRemaining = roundRands(entryFee - (entryDrawnByPayment.get(p.id) || 0));
        const amount = Math.min(entryRemaining, remainingOf(p));
        if (amount <= 0) {
            if (entryDrawnByPayment.has(p.id)) break;
            continue;
        }
        items.push({
            payment_id: p.id,
            // Always the Paystack checkout ref (parent), never LIC-* ledger refs.
            reference: resolvePaystackGatewayReference(p),
            refund_amount_rands: amount,
            cover_type: 'entry',
            already_refunded_rands: drawnByPayment.get(p.id) || 0,
            is_test: paymentTestMode(p),
        });
        drawnByPayment.set(p.id, roundRands((drawnByPayment.get(p.id) || 0) + amount));
        break; // entry refunded once
    }

    // Verified balance adjustments are additional entry payments, not duplicate
    // original checkouts. Refund each once to its own original payment reference.
    for (const payment of successPayments) {
        const meta = parseMeta(payment.metadata);
        if (meta.source !== 'native_entry_balance' || meta.verified_balance !== true || meta.registration_id !== registration.id) continue;
        const amount = remainingOf(payment);
        if (amount <= 0) continue;
        items.push({ payment_id: payment.id, reference: resolvePaystackGatewayReference(payment), refund_amount_rands: amount, cover_type: 'entry', already_refunded_rands: drawnByPayment.get(payment.id) || 0, is_test: paymentTestMode(payment) });
        drawnByPayment.set(payment.id, roundRands((drawnByPayment.get(payment.id) || 0) + amount));
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
        const meta = parseMeta(p.metadata);
        const lineItems = Array.isArray(meta.line_items) ? meta.line_items as Array<{ label?: string; type?: string; amount?: number }> : [];
        const licenseLine = lineItems.find((li) => /licen[cs]e/i.test(String(li.label || li.type || '')));
        const fromLine = Number(licenseLine?.amount || 0);
        const licenseAmount = fromLine > 0 ? fromLine : TEMP_LICENSE_RANDS;
        const amount = Math.min(licenseAmount, remaining);
        if (amount <= 0) continue;
        items.push({
            payment_id: p.id,
            // LIC-* rows are ledger splits — refund against the parent Paystack charge.
            reference: resolvePaystackGatewayReference(p),
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

    // Bind all writes to the same saved event and registration.
    const { data: current, error: readError } = await supabaseAdmin.from('event_registrations')
        .select('status').eq('id', reg.id).eq('event_id', reg.event_id).maybeSingle();
    if (readError || !current) throw readError || new Error('Registration no longer belongs to this event.');

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
        .eq('id', reg.id).eq('event_id', reg.event_id);
    if (error) throw error;

    if (unlinkPartners) {
        // Only clear pointers back to the exact withdrawn player in this
        // division. A saved partner email alone may be stale.
        const columns = { partner_name: null, partner_email: null, partner_payment_status: null };
        let query = supabaseAdmin.from('event_registrations').update(columns)
            .eq('event_id', reg.event_id).ilike('partner_email', literalRefundEmail(reg.email)).eq('status', 'registered');
        query = reg.division_id ? query.eq('division_id', reg.division_id) : query.eq('division', reg.division);
        const { error: unlinkError } = await query;
        if (unlinkError) throw unlinkError;
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
    ownerReg: RegistrationRow,
    partnerReg: RegistrationRow,
): Promise<void> {
    if (String(ownerReg.event_id) !== String(partnerReg.event_id)) throw new Error('Partner belongs to another event.');
    const { error } = await supabaseAdmin
        .from('event_registrations')
        .update({
            registered_by: partnerReg.email,
            partner_name: null,
            partner_email: null,
            partner_payment_status: null,
        })
        .eq('id', partnerReg.id).eq('event_id', ownerReg.event_id);
    if (error) throw error;
}

// ----------------------------------------------------------------------------
// 4. cancelEventTempLicense
// ----------------------------------------------------------------------------

/**
 * Revoke the temporary license for (player, event), preserving purchase history, and, if the player has no
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
        .select('id, email, license_type')
        .ilike('email', literalRefundEmail(playerEmail))
        .maybeSingle();
    if (!player || normEmail(player.email) !== normEmail(playerEmail)) return;

    await supabaseAdmin
        .from('temporary_licenses')
        .update({ revoked_at: new Date().toISOString() })
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
// 4b. switchRegistrationDivision
// ----------------------------------------------------------------------------

/**
 * Move a registration from its current division to `target` (a solo move): the
 * partner, if any, is unlinked and stays in the original division. The original
 * payment's entry cover is rewritten from the old division to the new one so the
 * entry stays "paid" and future refunds resolve to the new division.
 *
 * Fee differences (top-up charge / delta refund) are handled by the caller; this
 * helper only performs the move + cover rewrite.
 */
export async function switchRegistrationDivision(
    supabaseAdmin: SupabaseClient,
    reg: RegistrationRow,
    target: { id: string; name: string; fee: number },
    payments: PaymentRow[],
): Promise<void> {
    const oldDivision = String(reg.division || '');
    const regEmail = normEmail(reg.email);
    const hasVerifiedAllocation = payments.some(payment => payment.status === 'success' && paymentUsesVerifiedEntryTransfer(payment, reg));

    // Capacity and partner changes commit together, or the original entry stays intact.
    const { error } = await supabaseAdmin.rpc('move_registration_division', {
        p_registration_ids: [reg.id],
        p_target_division_id: target.id,
        p_reset_payment: false,
    });
    if (error) throw error;
    if (hasVerifiedAllocation) return;

    // 3. Rewrite the original payment's entry cover from old -> new division.
    for (const payment of payments) {
        if (payment.status !== 'success') continue;
        const meta = parseMeta(payment.metadata);
        const covers = Array.isArray(meta.covers) ? (meta.covers as Cover[]) : [];
        const idx = covers.findIndex(
            (c) =>
                c.type === 'entry' &&
                normEmail(c.email) === regEmail &&
                String(c.division || '') === oldDivision,
        );
        if (idx === -1) continue;
        const newCovers = covers.map((c, i) => (i === idx ? { ...c, division: target.name } : c));
        const fees = { ...((meta.division_entry_fees as Record<string, number>) || {}) };
        fees[target.name] = target.fee;
        await supabaseAdmin
            .from('payments')
            .update({ metadata: { ...meta, covers: newCovers, division_entry_fees: fees } })
            .eq('id', payment.id);
        break; // one entry cover moved
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
 * Verified managers can bypass the close-date gate for the exact event.
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

export function literalRefundEmail(email: string): string {
    return normEmail(email).replace(/[\\%_]/g, '\\$&');
}

export function refundEventId(value: unknown): number | null {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export type RefundActor = { email: string; platform: boolean };

export async function verifyRefundActor(client: SupabaseClient, email: string): Promise<RefundActor | null> {
    const identity = normEmail(email);
    if (!identity) return null;
    const [active, platform] = await Promise.all([
        client.rpc('account_is_active'),
        client.rpc('is_super_admin', { user_email: identity }),
    ]);
    if (active.error || active.data !== true) return null;
    return { email: identity, platform: !platform.error && platform.data === true };
}

export async function canManageRefundEvent(client: SupabaseClient, actor: RefundActor, eventId: unknown): Promise<boolean> {
    const id = refundEventId(eventId);
    if (id === null) return false;
    if (actor.platform) return true;
    const result = await client.rpc('can_manage_event', { p_event_id: id });
    return !result.error && result.data === true;
}

export function ownsRefundRegistration(registration: RegistrationRow, email: string): boolean {
    const actor = normEmail(email);
    return Boolean(actor && [registration.email, registration.registered_by].some(value => normEmail(value) === actor));
}
