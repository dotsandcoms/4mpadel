import { refundOrganisationPayment } from './organisation-refund.ts';
import { canReviewEventRefund, handleReviewedRefundRetry } from './reviewed-refund-retry.ts';
import { belongsToDivision, cancellationRefundStatus } from './division-cancellation.js';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    getPaystackSecretForPayment,
    resolvePaystackVerifySecrets,
    verifyPaystackReference,
    assertPaystackPayment,
    requiresOrganisationPaystack,
    verifyOrganisationPayment,
} from './paystack.ts';
import {
    applyRegistrationWithdrawal,
    cancelEventTempLicense,
    checkRefundEligibility,
    isLedgerSplitPayment,
    paymentCoversRefundEntry,
    paymentUsesVerifiedEntryTransfer,
    canManageRefundEvent,
    verifyRefundActor,
    ownsRefundRegistration,
    refundEventId,
    literalRefundEmail,
    resolvePaystackGatewayReference,
    resolveRefundableItems,
    roundRands,
    switchRegistrationDivision,
    toPaystackCents,
    transferBookingOwnership,
    type PaymentRow,
    type RefundRow,
    type RegistrationRow,
} from './refund-engine.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const fmtR = (n: number) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;
const normEmail = (v: unknown) => String(v ?? '').trim().toLowerCase();

type Action =
    | 'withdraw'
    | 'withdraw_all'
    | 'remove_partner'
    | 'admin_remove'
    | 'cancel_event'
    | 'cancel_division'
    | 'switch_division'
    | 'retry_failed'
    | 'reviewed_retry_failed'
    | 'reconcile_retry';

const supportedActions = new Set<Action>([
    'withdraw', 'withdraw_all', 'remove_partner', 'admin_remove', 'cancel_event',
    'cancel_division', 'switch_division', 'retry_failed', 'reviewed_retry_failed', 'reconcile_retry',
]);

type RefundReason =
    | 'owner_withdraw'
    | 'partner_withdraw'
    | 'owner_removed_partner'
    | 'admin_removal'
    | 'admin_cash_refund'
    | 'event_cancelled'
    | 'division_cancelled';

async function sendEmailViaEdge(payload: {
    to: string;
    template: string;
    variables: Record<string, unknown>;
}): Promise<void> {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    try {
        const res = await fetch(`${url}/functions/v1/send-email`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) console.error(`send-email [${payload.template}] failed:`, await res.text());
    } catch (err) {
        console.error('send-email error:', err);
    }
}

/** Call Paystack's refund endpoint for one transaction + amount (cents). */
async function paystackRefund(
    secret: string,
    reference: string,
    amountCents: number,
): Promise<{ ok: boolean; refundId: string | null; status: string; message: string }> {
    try {
        const res = await fetch('https://api.paystack.co/refund', {
            method: 'POST',
            headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: reference, amount: amountCents }),
        });
        const body = await res.json();
        if (body?.status === true && body?.data) {
            const data = body.data as Record<string, unknown>;
            return {
                ok: true,
                refundId: data.id != null ? String(data.id) : null,
                status: String(data.status || 'pending'),
                message: String(body.message || 'Refund queued'),
            };
        }
        return { ok: false, refundId: null, status: 'failed', message: String(body?.message || 'Refund failed') };
    } catch (err) {
        return { ok: false, refundId: null, status: 'failed', message: (err as Error).message };
    }
}

/**
 * Locate a Paystack transaction. "reversed" often means a partial/full refund
 * already ran — remaining balance can still be refundable, so do NOT treat it
 * like an abandoned checkout.
 */
async function inspectPaystackTransaction(
    reference: string,
    secrets: string[],
): Promise<{ found: boolean; status: string; amountCents: number | null; refundable: boolean }> {
    let lastStatus = 'unknown';
    for (const secret of secrets) {
        try {
            const res = await fetch(
                `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
                { headers: { Authorization: `Bearer ${secret}` } },
            );
            const body = await res.json();
            if (body?.data?.reference || body?.data?.id != null) {
                const status = String(body.data.status || '').toLowerCase();
                return {
                    found: true,
                    status,
                    amountCents: body.data.amount != null ? Number(body.data.amount) : null,
                    // success = paid; reversed / reversal-pending = refund activity
                    // exists (partial refund in flight) — remaining balance can still
                    // be refundable, so do NOT treat these like abandoned checkouts.
                    refundable: status === 'success'
                        || status === 'reversed'
                        || status === 'reversal-pending',
                };
            }
            lastStatus = String(body?.data?.status || body?.status || lastStatus);
        } catch {
            /* try next */
        }
    }
    return { found: false, status: lastStatus, amountCents: null, refundable: false };
}

/**
 * Before refunding, confirm the gateway reference exists on Paystack.
 * Ledger-split rows (LIC-* with parent_reference) are not real Paystack
 * transactions — verify/refund against the parent checkout instead.
 *
 * Abandoned / duplicate checkout rows can be marked success locally while a
 * later REGEV-* reference is the real charge. When that happens, demote the
 * bad row (never a LIC-* split, never a partially-refunded "reversed" charge)
 * and switch to a verified sibling.
 */
async function resolvePaystackRefundTarget(
    supabaseAdmin: SupabaseClient,
    item: { payment_id: string; reference: string; refund_amount_rands: number; cover_type: string },
    reg: RegistrationRow,
    ctx: {
        payments: PaymentRow[];
        paymentById: Map<string, PaymentRow>;
    },
): Promise<{
    ok: boolean;
    payment_id: string;
    reference: string;
    message?: string;
    remapped?: boolean;
}> {
    const payment = ctx.paymentById.get(item.payment_id)
        || ctx.payments.find((p) => p.id === item.payment_id);
    if (!payment) {
        return { ok: false, payment_id: item.payment_id, reference: item.reference, message: 'Payment row missing' };
    }

    const ledgerSplit = isLedgerSplitPayment(payment);
    const gatewayRef = resolvePaystackGatewayReference(payment) || item.reference;

    const { secrets, configError } = resolvePaystackVerifySecrets(payment as unknown as Record<string, unknown>);
    if (secrets.length === 0) {
        return { ok: false, payment_id: item.payment_id, reference: gatewayRef, message: configError || 'Paystack not configured' };
    }

    const primary = await inspectPaystackTransaction(gatewayRef, secrets);
    if (primary.refundable) {
        return {
            ok: true,
            payment_id: item.payment_id,
            reference: gatewayRef,
            remapped: gatewayRef !== String(payment.reference || ''),
            message: gatewayRef !== String(payment.reference || '')
                ? `Ledger ${payment.reference} → Paystack ${gatewayRef} (${primary.status})`
                : undefined,
        };
    }

    if (requiresOrganisationPaystack(payment.metadata)) {
        return { ok: false, payment_id: item.payment_id, reference: gatewayRef,
            message: 'The original subaccount payment needs Paystack review.' };
    }
    const paystackStatus = String(primary.status || '').toLowerCase();
    if (item.cover_type === 'entry' && paymentUsesVerifiedEntryTransfer(payment, reg)) {
        return { ok: false, payment_id: item.payment_id, reference: gatewayRef,
            message: `The original checkout for this transferred entry is not refundable (${paystackStatus}). Review that receipt.` };
    }

    // Demote local success that Paystack never settled — but never demote
    // LIC-* ledger splits or partially-refunded ("reversed") gateway charges.
    if (!ledgerSplit
        && ['abandoned', 'failed', 'ongoing', 'pending', 'processing', 'queued', 'unknown'].includes(paystackStatus)) {
        await supabaseAdmin
            .from('payments')
            .update({
                status: paystackStatus === 'abandoned' || paystackStatus === 'failed' ? paystackStatus : 'abandoned',
                metadata: {
                    ...parseMeta(payment.metadata),
                    refund_verify_demoted: true,
                    refund_verify_status: paystackStatus,
                    refund_verify_message: 'not refundable on gateway',
                    refund_verify_at: new Date().toISOString(),
                },
            })
            .eq('id', payment.id)
            .eq('status', 'success');
        ctx.paymentById.delete(payment.id);
    }

    const regEmail = normEmail(reg.email);
    const parentRef = String(parseMeta(payment.metadata).parent_reference || '').trim();

    const candidates = ctx.payments
        .filter((p) => p.id !== payment.id && p.status === 'success')
        .filter((p) => {
            // Prefer the parent checkout that the LIC-* row was split from.
            if (parentRef && p.reference === parentRef) return true;
            const covers = parseMeta(p.metadata).covers;
            if (!Array.isArray(covers)) return false;
            if (item.cover_type === 'license') {
                return covers.some((c: Record<string, unknown>) =>
                    c.type === 'license'
                    && normEmail(c.email) === regEmail
                    && c.license !== 'full');
            }
            return paymentCoversRefundEntry(p, reg);
        })
        .sort((a, b) => {
            // Parent of a ledger split first, then most recent.
            if (parentRef) {
                if (a.reference === parentRef && b.reference !== parentRef) return -1;
                if (b.reference === parentRef && a.reference !== parentRef) return 1;
            }
            return String(b.created_at || '').localeCompare(String(a.created_at || ''));
        });

    for (const candidate of candidates) {
        if (requiresOrganisationPaystack(candidate.metadata)) continue;
        const { secrets: candSecrets } = resolvePaystackVerifySecrets(candidate as unknown as Record<string, unknown>);
        if (candSecrets.length === 0) continue;
        const candGateway = resolvePaystackGatewayReference(candidate);
        const verified = await inspectPaystackTransaction(candGateway, candSecrets);
        if (!verified.refundable) continue;
        // Keep ledger attribution on the original split row when we only needed
        // its parent gateway ref; remap payment_id only for true sibling swaps.
        const keepLedgerRow = ledgerSplit && candidate.reference === parentRef;
        if (!keepLedgerRow) ctx.paymentById.set(candidate.id, candidate);
        console.warn(
            `Refund remapped from unverified ${payment.reference} → verified ${candGateway} for ${reg.email} / ${reg.division}`,
        );
        return {
            ok: true,
            payment_id: keepLedgerRow ? item.payment_id : candidate.id,
            reference: candGateway,
            remapped: true,
            message: `Remapped from ${payment.reference} (Paystack: ${paystackStatus})`,
        };
    }

    return {
        ok: false,
        payment_id: item.payment_id,
        reference: gatewayRef,
        message: `Paystack has no refundable charge for ${gatewayRef} (${paystackStatus}). No verified sibling payment found.`,
    };
}

type RefundSummaryItem = {
    registration_id: string;
    division: string;
    refunded_rands: number;
    paystack: boolean;
    status: string;
    reason: RefundReason;
    /** Paystack gateway references actually refunded (never LIC-* ledger refs). */
    references: string[];
};

/**
 * Process a single registration: resolve refundable items, issue refunds,
 * record payment_refunds rows, apply withdrawal side-effects. Idempotent.
 */
async function processRegistration(
    supabaseAdmin: SupabaseClient,
    reg: RegistrationRow,
    ctx: {
        eventId: string | number;
        event: Record<string, unknown>;
        divisions: Array<Record<string, unknown>>;
        payments: PaymentRow[];
        paymentById: Map<string, PaymentRow>;
        existingRefunds: RefundRow[];
        reason: RefundReason;
        initiatedBy: string;
        skipPaystack: boolean;
        isAdmin: boolean;
        refundLicense: boolean;
        noRefund: boolean;
    },
): Promise<RefundSummaryItem> {
    const items = ctx.noRefund
        ? []
        : resolveRefundableItems(reg, ctx.payments, ctx.existingRefunds, {
            refundLicense: ctx.refundLicense,
        });

    let refundedTotal = 0;
    let anyPaystack = false;
    const missingPaidEntry = ctx.reason === 'division_cancelled' && reg.payment_status === 'paid' && !items.some((item) => item.cover_type === 'entry');
    let aggregateStatus = missingPaidEntry ? 'needs_attention' : (items.length === 0 ? 'no_refund' : 'processing');
    const refundedReferences: string[] = [];

    for (const item of items) {
        let payment = ctx.paymentById.get(item.payment_id);
        const method = String((payment as unknown as Record<string, unknown>)?.payment_method || 'paystack');
        const isCash = method === 'cash' || method === 'manual';
        const useCash = !requiresOrganisationPaystack(payment?.metadata) && (ctx.skipPaystack || isCash);
        if (ctx.reason === 'division_cancelled' && useCash) {
            aggregateStatus = 'needs_attention';
            continue;
        }

        let refundPaymentId = item.payment_id;
        let refundReference = item.reference;
        let verifyMeta: Record<string, unknown> = {};

        if (!useCash) {
            const target = await resolvePaystackRefundTarget(supabaseAdmin, item, reg, {
                payments: ctx.payments,
                paymentById: ctx.paymentById,
            });
            if (!target.ok) {
                const { data: failedRow } = await supabaseAdmin
                    .from('payment_refunds')
                    .insert([{
                        payment_id: item.payment_id,
                        event_registration_id: reg.id,
                        paystack_reference: item.reference,
                        amount: item.refund_amount_rands,
                        currency: 'ZAR',
                        status: 'failed',
                        reason: ctx.reason,
                        initiated_by: ctx.initiatedBy,
                        metadata: {
                            cover_type: item.cover_type,
                            is_test: item.is_test,
                            method,
                            paystack_error: target.message,
                            verify_failed: true,
                        },
                    }])
                    .select('id')
                    .maybeSingle();
                console.error('Refund blocked — Paystack verify failed:', item.reference, target.message, failedRow?.id);
                aggregateStatus = 'needs_attention';
                continue;
            }
            refundPaymentId = target.payment_id;
            refundReference = target.reference;
            payment = ctx.paymentById.get(refundPaymentId) || payment;
            if (target.remapped) {
                verifyMeta = {
                    remapped_from: item.reference,
                    remapped_to: target.reference,
                    remap_reason: target.message,
                };
            }
        }

        // 1. Insert the refund row up-front (auditable even if the API call dies).
        const insertRow: Record<string, unknown> = {
            payment_id: refundPaymentId,
            event_registration_id: reg.id,
            paystack_reference: refundReference,
            amount: item.refund_amount_rands,
            currency: 'ZAR',
            status: useCash ? 'processed' : 'pending',
            reason: useCash && ctx.reason === 'admin_removal' ? 'admin_cash_refund' : ctx.reason,
            initiated_by: ctx.initiatedBy,
            metadata: { cover_type: item.cover_type, is_test: item.is_test, method, ...verifyMeta },
            processed_at: useCash ? new Date().toISOString() : null,
        };
        const { data: refundRow, error: insErr } = await supabaseAdmin
            .from('payment_refunds')
            .insert([insertRow])
            .select('id')
            .maybeSingle();
        if (insErr) {
            console.error('payment_refunds insert failed:', insErr);
            aggregateStatus = 'needs_attention';
            continue;
        }

        if (useCash) {
            refundedTotal = roundRands(refundedTotal + item.refund_amount_rands);
            if (refundReference) refundedReferences.push(refundReference);
            if (item.cover_type === 'license') {
                await cancelEventTempLicense(supabaseAdmin, reg.email, ctx.eventId);
            }
            continue;
        }

        // 2. Call Paystack against the verified gateway reference (never LIC-*).
        const secret = getPaystackSecretForPayment((payment ?? {}) as Record<string, unknown>);
        const subaccount = requiresOrganisationPaystack(payment?.metadata);
        const amountCents = toPaystackCents(item.refund_amount_rands);
        const result = subaccount
            ? await refundOrganisationPayment(secret, refundReference, amountCents, supabaseAdmin, refundRow?.id)
            : await paystackRefund(secret, refundReference, amountCents);

        const update: Record<string, unknown> = {
            paystack_refund_id: result.refundId,
            status: subaccount ? result.status : result.ok ? 'processing' : 'failed',
            metadata: {
                cover_type: item.cover_type,
                is_test: item.is_test,
                method,
                ledger_reference: payment?.reference || item.reference,
                ...('fundedBy' in result && result.fundedBy ? { refund_funded_by: result.fundedBy } : {}),
                ...verifyMeta,
                ...(result.ok ? {} : { paystack_error: result.message }),
            },
        };
        const saveRefund = supabaseAdmin.from('payment_refunds').update(update).eq('id', refundRow?.id);
        await (subaccount ? saveRefund.neq('status', 'processed') : saveRefund);

        if (result.ok) {
            anyPaystack = true;
            refundedTotal = roundRands(refundedTotal + item.refund_amount_rands);
            if (refundReference) refundedReferences.push(refundReference);
            if (item.cover_type === 'license') {
                await cancelEventTempLicense(supabaseAdmin, reg.email, ctx.eventId);
            }
        } else {
            console.error('Paystack refund failed:', refundReference, result.message);
            aggregateStatus = 'needs_attention';
        }
    }

    // 3. Withdrawal side-effects (idempotent).
    //    For cash refunds the money is settled, so mark refunded now. For
    //    Paystack the webhook flips payment_status='refunded' on refund.processed;
    //    here we only record refund_amount and withdraw the row.
    const markRefundedNow = ctx.skipPaystack && refundedTotal > 0 && !anyPaystack;
    await applyRegistrationWithdrawal(supabaseAdmin, reg, {
        markRefunded: markRefundedNow,
        refundAmountRands: refundedTotal > 0 ? refundedTotal : undefined,
        unlinkPartners: true,
    });

    if (refundedTotal > 0 && !markRefundedNow) {
        // Record the refund amount even though payment_status finalizes via webhook.
        await supabaseAdmin
            .from('event_registrations')
            .update({ refund_amount: refundedTotal })
            .eq('id', reg.id).eq('event_id', ctx.eventId);
    }

    if (aggregateStatus === 'processing' && !anyPaystack && refundedTotal > 0) {
        aggregateStatus = 'processed'; // cash-only
    }

    return {
        registration_id: reg.id,
        division: reg.division,
        refunded_rands: refundedTotal,
        paystack: anyPaystack,
        status: aggregateStatus,
        reason: ctx.reason,
        references: [...new Set(refundedReferences)],
    };
}

function parseMeta(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    return {};
}

function divisionClosed(div: Record<string, unknown>, event: Record<string, unknown>): boolean {
    const closeAt = (div?.entries_close_at as string) || (event?.registration_closes_at as string);
    if (!closeAt) return false;
    return new Date(closeAt).getTime() < Date.now();
}

/**
 * Move a paid registration to another division instead of refunding+rebooking.
 * Handles equal fee (free move), lower fee (refund the difference), and higher
 * fee (requires a verified Paystack top-up of the difference). Solo move:
 * the partner is unlinked and stays in the original division.
 */
async function findLinkedRefundPartner(client: SupabaseClient, entry: RegistrationRow, allowReverse = false) {
    const expectedEmail = normEmail(entry.partner_email);
    const sourceEmail = normEmail(entry.email);
    if (!sourceEmail || (!expectedEmail && !allowReverse)) return null;
    const byEmail = Boolean(expectedEmail);
    const { data, error } = await client.from('event_registrations').select('*').eq('event_id', entry.event_id)
        .ilike(byEmail ? 'email' : 'partner_email', literalRefundEmail(byEmail ? expectedEmail : sourceEmail))
        .neq('status', 'withdrawn');
    if (error) throw error;
    const matches = ((data || []) as RegistrationRow[]).filter(candidate => {
        const sameDivision = entry.division_id && candidate.division_id
            ? entry.division_id === candidate.division_id : Boolean(entry.division && entry.division === candidate.division);
        const originalOwner = normEmail(entry.registered_by);
        const partnerOwner = normEmail(candidate.registered_by);
        const reciprocal = normEmail(candidate.partner_email) === sourceEmail;
        return candidate.id !== entry.id && sameDivision && (byEmail
            ? normEmail(candidate.email) === expectedEmail && (reciprocal || partnerOwner === sourceEmail
                || originalOwner === expectedEmail || Boolean(originalOwner && partnerOwner === originalOwner))
            : reciprocal);
    });
    return matches.length === 1 ? matches[0] : null;
}

async function handleSwitchDivision(
    supabaseAdmin: SupabaseClient,
    opts: {
        registration: RegistrationRow;
        targetDivisionId?: string;
        topUpReference?: string;
        moveTeam?: boolean;
        callerEmail: string;
        isAdmin: boolean;
        json: (status: number, body: unknown) => Response;
    },
): Promise<Response> {
    const { registration: reg, targetDivisionId, topUpReference, moveTeam = false, callerEmail, isAdmin, json } = opts;
    if (!targetDivisionId) return json(400, { error: 'target_division_id is required' });
    if (reg.status === 'withdrawn') return json(400, { error: 'Registration already withdrawn' });
    if (!isAdmin && !ownsRefundRegistration(reg, callerEmail)) return json(403, { error: 'Not authorized for this registration' });

    const eventId = reg.event_id;
    const [{ data: event }, { data: divisions }] = await Promise.all([
        supabaseAdmin.from('calendar').select('id, event_name, event_dates, slug, is_manual, registration_closes_at').eq('id', eventId).maybeSingle(),
        supabaseAdmin.from('tournament_divisions').select('id, name, entry_fee, entries_close_at, is_active, gender').eq('event_id', eventId),
    ]);
    if (event?.is_manual === false) return json(400, { error: 'Not a manual event' });

    const divList = divisions || [];
    const currentDiv = divList.find((d) => d.id === reg.division_id || d.name === reg.division);
    const targetDiv = divList.find((d) => d.id === targetDivisionId);
    if (!targetDiv) return json(404, { error: 'Target division not found' });
    if (targetDiv.is_active === false) return json(400, { error: 'Target division is not active' });
    if (divisionClosed(targetDiv, event || {})) return json(400, { error: 'Target division entries have closed' });

    // Eligibility: must not already be registered in the target division.
    const { data: targetRegistrations } = await supabaseAdmin
        .from('event_registrations')
        .select('id, email, partner_email, status')
        .eq('event_id', eventId)
        .eq('division', targetDiv.name)
        .neq('status', 'withdrawn');
    const existingInTarget = (targetRegistrations || []).find((row) =>
        normEmail(row.email) === normEmail(reg.email)
        || normEmail(row.partner_email) === normEmail(reg.email)
    );
    if (existingInTarget) return json(400, { error: 'You are already entered in that division' });

    const oldFee = Number(currentDiv?.entry_fee || 0);
    const newFee = Number(targetDiv.entry_fee || 0);
    const delta = roundRands(newFee - oldFee);

    const { data: payments } = await supabaseAdmin.from('payments').select('*').eq('event_id', eventId);
    const successPayments = (payments || []).filter((p) => p.status === 'success') as PaymentRow[];

    // Whole-team moves mirror Event Manager: preserve the pair, move both rows,
    // and mark paid entries pending when the new division costs more. This
    // avoids charging one team member's card for another player's difference.
    if (moveTeam) {
        const partnerReg = await findLinkedRefundPartner(supabaseAdmin, reg, true);
        if (!partnerReg) return json(400, { error: 'The selected registrations are not a linked team' });
        const moving = [reg as RegistrationRow, partnerReg as RegistrationRow];
        for (const player of moving) {
            const { data: targetRows } = await supabaseAdmin
                .from('event_registrations')
                .select('id, email, partner_email')
                .eq('event_id', eventId)
                .eq('division', targetDiv.name)
                .neq('status', 'withdrawn');
            const conflict = (targetRows || []).find((row) =>
                normEmail(row.email) === normEmail(player.email)
                || normEmail(row.partner_email) === normEmail(player.email)
            );
            if (conflict) return json(400, { error: `${player.full_name || player.email} is already entered in that division` });
        }

        const { error: moveError } = await supabaseAdmin.rpc('move_registration_division', {
            p_registration_ids: moving.map((player) => player.id),
            p_target_division_id: targetDiv.id,
            p_reset_payment: true,
        });
        if (moveError) throw moveError;

        for (const player of moving) {
            const teamMate = moving.find((candidate) => candidate.id !== player.id)!;
            const owesMore = newFee > oldFee && player.payment_status === 'paid';
            const newStatus = owesMore ? 'pending' : player.payment_status;
            await supabaseAdmin.rpc('reassign_tournament_participant_division', {
                p_event_id: eventId,
                p_email: player.email,
                p_full_name: player.full_name || '',
                p_from_class: reg.division,
                p_to_class: targetDiv.name,
                p_is_paid: newStatus === 'paid',
            });

            for (const payment of successPayments) {
                const meta = parseMeta(payment.metadata);
                const covers = Array.isArray(meta.covers) ? meta.covers as Record<string, unknown>[] : [];
                let changed = false;
                const nextCovers = covers.map((cover) => {
                    if (cover.type === 'entry' && normEmail(cover.email) === normEmail(player.email) && String(cover.division || '') === String(reg.division)) {
                        changed = true;
                        return { ...cover, division: targetDiv.name };
                    }
                    return cover;
                });
                if (!changed) continue;
                const fees = { ...((meta.division_entry_fees as Record<string, number>) || {}), [targetDiv.name]: newFee };
                await supabaseAdmin.from('payments').update({ metadata: { ...meta, covers: nextCovers, division_entry_fees: fees } }).eq('id', payment.id);
                break;
            }

            let feeNote = 'There was no change to your entry fee.';
            if (owesMore) feeNote = `Your new division has a higher entry fee of ${fmtR(newFee)}. Your entry is now marked pending — please complete payment to confirm your spot.`;
            else if (newFee < oldFee) feeNote = 'Your new division has a lower entry fee; any difference will be handled by the organiser.';
            try {
                await sendEmailViaEdge({
                    to: player.email,
                    template: 'division_changed',
                    variables: {
                        eventId,
                        playerName: player.full_name || 'Player',
                        eventName: event?.event_name || 'Tournament',
                        fromDivision: reg.division,
                        toDivision: targetDiv.name,
                        division: targetDiv.name,
                        partnerName: teamMate.full_name || 'Team mate',
                        eventDates: event?.event_dates || '',
                        paid: newStatus === 'paid',
                        amount: fmtR(newFee),
                        amountDue: newStatus === 'paid' ? 'R 0.00' : fmtR(newFee),
                        feeNote,
                        eventUrl: `https://4mpadel.co.za/calendar/${event?.slug || eventId}`,
                    },
                });
            } catch (_e) { /* email best-effort */ }
        }

        return json(200, {
            switched: true,
            moved_count: moving.length,
            from_division: reg.division,
            to_division: targetDiv.name,
            delta,
        });
    }

    let refundedRands = 0;
    let chargedRands = 0;

    // ---- Higher fee: verify the top-up payment before moving ----
    if (delta > 0 && reg.payment_status === 'paid') {
        if (!topUpReference) return json(402, { error: 'top_up_required', delta, message: 'A top-up payment is required for this division.' });
        const { data: topPay, error: topUpError } = await supabaseAdmin.from('payments').select('*')
            .eq('reference', topUpReference).eq('event_id', eventId).maybeSingle();
        if (topUpError) throw topUpError;
        if (!topPay) return json(404, { error: 'Top-up payment not found' });
        const metadata = parseMeta(topPay.metadata);
        const matchingSource = metadata.from_division_id ? metadata.from_division_id === currentDiv?.id : metadata.from_division === reg.division;
        if (metadata.source !== 'division_switch' || metadata.registration_id !== reg.id
            || metadata.target_division_id !== targetDiv.id || !matchingSource
            || normEmail(metadata.registrant_email || metadata.email) !== normEmail(reg.email)
            || !['pending', 'processing', 'success'].includes(topPay.status)) {
            return json(400, { error: 'The saved top-up belongs to a different registration or division.' });
        }

        if (topPay.status !== 'success') {
            const { secrets, configError } = resolvePaystackVerifySecrets(topPay);
            if (secrets.length === 0) return json(500, { error: configError || 'Payment verification not configured' });
            const verification = await verifyPaystackReference(topUpReference, secrets);
            if (!verification.ok) return json(200, { switched: false, retry: true, error: 'Top-up not verified', status: verification.status });
            assertPaystackPayment(topPay, verification.data);
            const subaccount = requiresOrganisationPaystack(topPay.metadata);
            if (subaccount && !await verifyOrganisationPayment(supabaseAdmin, topUpReference, verification.data)) {
                return json(409, { error: 'Payment received. 4M must verify the settlement before you pay again.' });
            }
            const { error } = await supabaseAdmin.from('payments').update({ status: 'success' }).eq('id', topPay.id).eq('event_id', eventId);
            if (subaccount && error) throw error;
        }
        if (Number(topPay.amount) + 0.01 < delta) return json(400, { error: 'Top-up amount is less than the fee difference' });
        chargedRands = Number(topPay.amount);
        if (!successPayments.some((p) => p.id === topPay.id)) successPayments.push({ ...topPay, status: 'success' } as PaymentRow);
    }

    // ---- Lower fee: refund the difference from the original covering payment ----
    if (delta < 0 && reg.payment_status === 'paid') {
        const refundAmount = roundRands(Math.abs(delta));
        const regEmail = normEmail(reg.email);
        const oldName = String(reg.division || '');
        const coveringPayment = successPayments.find((p) => {
            const covers = parseMeta(p.metadata).covers;
            return Array.isArray(covers) && covers.some((c: Record<string, unknown>) =>
                c.type === 'entry' && normEmail(c.email) === regEmail && String(c.division || '') === oldName);
        });
        if (coveringPayment) {
            const method = String((coveringPayment as unknown as Record<string, unknown>).payment_method || 'paystack');
            const isCash = method === 'cash' || method === 'manual';
            const gatewayRef = resolvePaystackGatewayReference(coveringPayment);
            const { data: refundRow } = await supabaseAdmin.from('payment_refunds').insert([{
                payment_id: coveringPayment.id,
                event_registration_id: reg.id,
                paystack_reference: gatewayRef,
                amount: refundAmount,
                currency: 'ZAR',
                status: isCash ? 'processed' : 'pending',
                reason: 'division_switch',
                initiated_by: isAdmin ? `admin:${callerEmail}` : callerEmail,
                metadata: { cover_type: 'entry', kind: 'division_switch_delta', method },
                processed_at: isCash ? new Date().toISOString() : null,
            }]).select('id').maybeSingle();

            if (!isCash) {
                const secret = getPaystackSecretForPayment(coveringPayment as unknown as Record<string, unknown>);
                const subaccount = requiresOrganisationPaystack(coveringPayment.metadata);
                const amountCents = toPaystackCents(refundAmount);
                const r = subaccount
                    ? await refundOrganisationPayment(secret, gatewayRef, amountCents, supabaseAdmin, refundRow?.id)
                    : await paystackRefund(secret, gatewayRef, amountCents);
                const saveRefund = supabaseAdmin.from('payment_refunds')
                    .update({ paystack_refund_id: r.refundId, status: subaccount ? r.status : r.ok ? 'processing' : 'failed' })
                    .eq('id', refundRow?.id);
                await (subaccount ? saveRefund.neq('status', 'processed') : saveRefund);
                if (r.ok) refundedRands = refundAmount;
            } else {
                refundedRands = refundAmount;
            }
        }
    }

    // ---- Perform the move ----
    await switchRegistrationDivision(
        supabaseAdmin,
        reg as RegistrationRow,
        { id: targetDiv.id, name: targetDiv.name, fee: newFee },
        successPayments,
    );

    // ---- Division-changed email ----
    // A dedicated template (not a fresh "Registration Confirmed") so the player
    // clearly sees they moved FROM their old division TO the new one, rather than
    // being confused by what looks like a brand-new registration.
    const eventUrl = `https://4mpadel.co.za/calendar/${event?.slug || eventId}`;
    let feeNote = 'There was no change to your entry fee.';
    if (chargedRands > 0) {
        feeNote = `An additional <strong style="color:#FFFFFF;">${fmtR(chargedRands)}</strong> was charged for the higher entry fee of your new division.`;
    } else if (refundedRands > 0) {
        feeNote = `The <strong style="color:#FFFFFF;">${fmtR(refundedRands)}</strong> entry-fee difference is being refunded to you.`;
    } else if (reg.payment_status !== 'paid' && delta !== 0) {
        feeNote = `Your registration remains payment pending at the new division fee of <strong style="color:#FFFFFF;">${fmtR(newFee)}</strong>.`;
    }
    try {
        await sendEmailViaEdge({
            to: reg.email,
            template: 'division_changed',
            variables: {
                eventId,
                playerName: reg.full_name || 'Player',
                eventName: event?.event_name || 'Tournament',
                fromDivision: reg.division,
                toDivision: targetDiv.name,
                division: targetDiv.name,
                // A division switch is a solo move — the partner link is cleared,
                // so the new entry starts without a partner.
                partnerName: 'TBD',
                eventDates: event?.event_dates || '',
                paid: reg.payment_status === 'paid',
                amount: fmtR(newFee),
                feeNote,
                eventUrl,
            },
        });
    } catch (_e) { /* email best-effort */ }

    return json(200, {
        switched: true,
        from_division: reg.division,
        to_division: targetDiv.name,
        delta,
        charged_rands: chargedRands,
        refunded_rands: refundedRands,
    });
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    let divisionFailureContext: { client: SupabaseClient; id: string; eventId: number } | null = null;
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return json(401, { error: 'Unauthorized' });

        const {
            registration_id,
            reviewed_registration_id,
            action,
            event_id,
            skip_paystack,
            no_refund,
            target_division_id,
            top_up_reference,
            move_team,
            payment_refund_id,
            cancellation_reason,
            division_id,
        } = await req.json() as {
            registration_id?: string;
            reviewed_registration_id?: string;
            action?: Action;
            event_id?: string;
            skip_paystack?: boolean;
            no_refund?: boolean;
            target_division_id?: string;
            top_up_reference?: string;
            move_team?: boolean;
            payment_refund_id?: string;
            cancellation_reason?: string;
            division_id?: string;
        };
        if (!action || !supportedActions.has(action)) return json(400, { error: 'Unsupported action' });

        const supabaseAdmin = createClient(supabaseUrl, serviceKey);
        const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
        const review = action === 'reviewed_retry_failed' || action === 'reconcile_retry';
        const retryAction = action === 'retry_failed' || review;
        const servicesOwnRetry = retryAction && !!serviceKey && bearer === serviceKey;
        let callerEmail = 'service-role';
        let supabaseUser: SupabaseClient | undefined;
        if (!servicesOwnRetry) {
            supabaseUser = createClient(supabaseUrl, anonKey, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
            if (userError || !user?.email) return json(401, { error: 'Unauthorized' });
            callerEmail = normEmail(user.email);
        }
        if (retryAction) {
            if (!await canReviewEventRefund({ bearer, serviceKey, actor: supabaseUser, email: callerEmail })) {
                return json(403, { error: 'A verified platform administrator is required to review refunds.' });
            }
            return await handleReviewedRefundRetry(supabaseAdmin, {
                refundId: payment_refund_id, registrationId: review ? reviewed_registration_id : registration_id, eventId: event_id, email: callerEmail,
                review, reconcile: action === 'reconcile_retry', json,
            });
        }

        if (!supabaseUser) return json(401, { error: 'Unauthorized' });
        const actor = await verifyRefundActor(supabaseUser, callerEmail);
        if (!actor) return json(403, { error: 'An active account is required.' });

        // Resolve scope from the selected event or saved registration before any
        // privileged operation. A sidebar record cannot authorize money movement.
        let targets: RegistrationRow[] = [];
        let eventId: number;
        let isAdmin = false;
        let targetRegistration: RegistrationRow | null = null;
        const requestedEventId = refundEventId(event_id);
        if (event_id != null && requestedEventId === null) return json(400, { error: 'Choose a valid event.' });

        const loadEvent = (id: number) => supabaseAdmin.from('calendar').select('*').eq('id', id).maybeSingle();
        let eventContext: Awaited<ReturnType<typeof loadEvent>> | undefined;
        const canManageThisEvent = async (id: number) => {
            if (!await canManageRefundEvent(supabaseUser, actor, id)) return false;
            eventContext ??= await loadEvent(id);
            if (eventContext.error) throw eventContext.error;
            if (eventContext.data?.paystack_subaccount_checkout !== true) return true;
            const permission = await supabaseAdmin.rpc('paystack_split_staff_permission', { p_event_id: id, p_email: callerEmail });
            if (permission.error) throw permission.error;
            return permission.data === true;
        };
        let cancelledDivision: { id: string; name: string } | null = null;
        if (action === 'cancel_event' || action === 'cancel_division') {
            if (requestedEventId === null) return json(400, { error: 'event_id required for cancellation' });
            eventId = requestedEventId;
            isAdmin = await canManageThisEvent(eventId);
            if (!isAdmin) return json(403, { error: 'Current event management access is required.' });
            if (action === 'cancel_division') {
                if (!division_id) return json(400, { error: 'division_id required' });
                // Claim once before refunding: concurrent clicks cannot issue duplicate refunds.
                const { data: division, error: divisionError } = await supabaseAdmin
                    .from('tournament_divisions').select('id, name, cancelled_at, cancellation_refund_status')
                    .eq('id', division_id).eq('event_id', eventId).maybeSingle();
                if (divisionError) throw divisionError;
                if (!division) return json(404, { error: 'Division not found in this event' });
                if (division.cancelled_at) return json(409, { error: 'This division is already cancelled. Check refunds in the Income Statement; failed refunds must be retried individually.' });
                const { data: claimed, error: claimError } = await supabaseAdmin
                    .from('tournament_divisions').update({
                        is_active: false, cancelled_at: new Date().toISOString(), cancelled_by: callerEmail,
                        cancellation_reason: String(cancellation_reason || '').trim() || null,
                        cancellation_refund_status: 'processing',
                    }).eq('id', division_id).eq('event_id', eventId).is('cancelled_at', null).select('id, name').maybeSingle();
                if (claimError) throw claimError;
                if (!claimed) return json(409, { error: 'Division cancellation is already underway' });
                cancelledDivision = claimed;
                divisionFailureContext = { client: supabaseAdmin, id: claimed.id, eventId };
            }
            const { data, error: registrationsError } = await supabaseAdmin
                .from('event_registrations')
                .select('*')
                .eq('event_id', event_id)
                .neq('status', 'withdrawn');
            if (registrationsError) throw registrationsError;
            targets = (cancelledDivision ? (data || []).filter((reg) => belongsToDivision(reg, cancelledDivision)) : (data || [])) as RegistrationRow[];
        } else if (action === 'withdraw_all') {
            if (requestedEventId === null) return json(400, { error: 'event_id required for withdraw_all' });
            eventId = requestedEventId;
            isAdmin = await canManageThisEvent(eventId);
            const { data, error } = await supabaseAdmin.from('event_registrations')
                .select('*').eq('event_id', eventId).neq('status', 'withdrawn');
            if (error) throw error;
            targets = ((data || []) as RegistrationRow[]).filter(reg => ownsRefundRegistration(reg, actor.email));
        } else {
            if (!registration_id) return json(400, { error: 'registration_id required' });
            const { data, error } = await supabaseAdmin.from('event_registrations')
                .select('*').eq('id', registration_id).maybeSingle();
            if (error) throw error;
            const reg = data as RegistrationRow | null;
            const storedEventId = refundEventId(reg?.event_id);
            if (!reg || storedEventId === null || (requestedEventId !== null && requestedEventId !== storedEventId)) {
                return json(404, { error: 'Registration not found in this event' });
            }
            eventId = storedEventId;
            targetRegistration = reg;
            isAdmin = await canManageThisEvent(eventId);
            if (action === 'remove_partner') {
                if (!isAdmin && normEmail(reg.registered_by) !== actor.email) {
                    return json(403, { error: 'Only the booking owner or event manager can remove a partner' });
                }
                const partner = await findLinkedRefundPartner(supabaseAdmin, reg);
                if (!partner) return json(404, { error: 'Linked partner registration not found in this division' });
                targets = [partner];
            } else if (action === 'admin_remove') {
                if (!isAdmin) return json(403, { error: 'Current event management access is required.' });
                targets = [reg];
            } else {
                if (!isAdmin && !ownsRefundRegistration(reg, actor.email)) {
                    return json(403, { error: 'Not authorized for this registration' });
                }
                targets = [reg];
            }
        }

        const skipPaystack = skip_paystack === true && isAdmin && action === 'admin_remove';
        const noRefund = no_refund === true && isAdmin && action === 'admin_remove';

        if (action === 'switch_division' && targetRegistration) {
            return await handleSwitchDivision(supabaseAdmin, {
                registration: targetRegistration,
                targetDivisionId: target_division_id,
                topUpReference: top_up_reference,
                moveTeam: move_team === true,
                callerEmail,
                isAdmin,
                json,
            });
        }

        if (targets.length === 0 && action !== 'cancel_event' && action !== 'cancel_division') {
            return json(200, { processed: false, reason: 'no_active_registrations', refunds: [] });
        }

        // ----- Shared context: event, divisions, payments, existing refunds -----
        const { data: event, error: eventReadError } = eventContext ?? await loadEvent(eventId);
        if (eventReadError) throw eventReadError;
        if (!event) throw new Error('Event not found');
        const { data: divisions, error: divisionsReadError } = await supabaseAdmin
            .from('tournament_divisions')
            .select('id, name, entry_fee, entries_close_at')
            .eq('event_id', eventId);
        if (divisionsReadError) throw divisionsReadError;
        const { data: payments, error: paymentsReadError } = await supabaseAdmin
            .from('payments')
            .select('*')
            .eq('event_id', eventId);
        if (paymentsReadError) throw paymentsReadError;
        const successPayments = (payments || []).filter((p) => p.status === 'success') as PaymentRow[];
        const paymentById = new Map<string, PaymentRow>();
        for (const p of successPayments) paymentById.set(p.id, p);

        const paymentIds = successPayments.map((p) => p.id);
        let existingRefunds: RefundRow[] = [];
        if (paymentIds.length) {
            const { data: refs, error: refundsReadError } = await supabaseAdmin
                .from('payment_refunds')
                .select('id, payment_id, amount, status')
                .in('payment_id', paymentIds);
            if (refundsReadError) throw refundsReadError;
            existingRefunds = (refs || []) as RefundRow[];
        }

        // Pre-withdrawal snapshot of active registrations per player email, used
        // to decide whether a withdrawal removes the player's LAST active entry
        // (the temp license is per-event, so it's only refunded/cancelled then).
        const { data: activeRegs, error: activeRegsError } = await supabaseAdmin
            .from('event_registrations')
            .select('id, email')
            .eq('event_id', eventId)
            .neq('status', 'withdrawn');
        if (activeRegsError) throw activeRegsError;
        const activeIdsByEmail = new Map<string, Set<string>>();
        for (const r of activeRegs || []) {
            const em = normEmail(r.email);
            if (!activeIdsByEmail.has(em)) activeIdsByEmail.set(em, new Set());
            activeIdsByEmail.get(em)!.add(r.id);
        }
        const withdrawnIds = new Set(targets.map((t) => t.id));
        const licenseHandledFor = new Set<string>(); // emails whose license is already being refunded

        const eventUrl = `https://4mpadel.co.za/calendar/${event?.slug || eventId}`;
        const results: RefundSummaryItem[] = [];

        for (const reg of targets) {
            // Eligibility (close-date gate for non-admins).
            const elig = checkRefundEligibility(reg, divisions || [], event || {}, callerEmail, isAdmin);
            if (!elig.eligible) {
                results.push({
                    registration_id: reg.id,
                    division: reg.division,
                    refunded_rands: 0,
                    paystack: false,
                    status: `skipped:${elig.reason}`,
                    reason: 'owner_withdraw',
                    references: [],
                });
                continue;
            }

            // Determine reason.
            let reason: RefundReason;
            if (action === 'cancel_division') reason = 'division_cancelled';
            else if (action === 'cancel_event') reason = 'event_cancelled';
            else if (action === 'admin_remove') reason = 'admin_removal';
            else if (action === 'remove_partner') reason = 'owner_removed_partner';
            else {
                // withdraw / withdraw_all: owner vs partner perspective
                reason = normEmail(reg.registered_by) === normEmail(reg.email)
                    ? 'owner_withdraw'
                    : 'partner_withdraw';
            }

            // Ownership transfer: owner withdraws own entry but partner stays active.
            if ((action === 'withdraw' || action === 'withdraw_all')
                && normEmail(reg.registered_by) === callerEmail
                && reg.partner_email) {
                const partnerReg = await findLinkedRefundPartner(supabaseAdmin, reg);
                if (partnerReg) {
                    await transferBookingOwnership(supabaseAdmin, reg, partnerReg as RegistrationRow);
                }
            }

            // Refund the temp license only when this removes the player's last
            // active entry in the event, and only once per player per operation.
            const regEmail = normEmail(reg.email);
            const activeSet = activeIdsByEmail.get(regEmail) || new Set<string>();
            let remainingActive = 0;
            for (const id of activeSet) if (!withdrawnIds.has(id)) remainingActive++;
            const isLastEntry = remainingActive === 0;
            const refundLicense = isLastEntry && !licenseHandledFor.has(regEmail);
            if (refundLicense) licenseHandledFor.add(regEmail);

            const summary = await processRegistration(supabaseAdmin, reg, {
                eventId: eventId!,
                event: event || {},
                divisions: divisions || [],
                payments: successPayments,
                paymentById,
                existingRefunds,
                reason,
                initiatedBy: isAdmin ? `admin:${callerEmail}` : callerEmail,
                skipPaystack,
                isAdmin,
                refundLicense,
                noRefund,
            });
            results.push(summary);

            // Emails.
            const div = (divisions || []).find((d) => d.id === reg.division_id || d.name === reg.division);
            const entryFee = Number(div?.entry_fee || 0);
            if (summary.refunded_rands > 0 && action !== 'cancel_event' && action !== 'cancel_division') {
                await sendEmailViaEdge({
                    to: reg.email,
                    template: 'entry_refunded',
                    variables: {
                        eventId,
                        playerName: reg.full_name || 'Player',
                        eventName: event?.event_name || 'Tournament',
                        division: reg.division,
                        amount: fmtR(summary.refunded_rands),
                        reference: summary.references.join(', ') || '',
                        eventUrl,
                    },
                });
            }
            await sendEmailViaEdge({
                to: reg.email,
                template: action === 'cancel_division' ? 'division_cancelled' : action === 'cancel_event' ? 'event_cancelled' : 'entry_withdrawn',
                variables: {
                    eventId,
                    eventName: event?.event_name || 'Tournament',
                    division: reg.division,
                    eventDates: event?.event_dates || '',
                    eventUrl,
                    withdrawnPlayerName: reg.full_name,
                    recipientRole: 'player',
                    playerName: reg.full_name,
                    partnerName: reg.partner_name || '',
                    refundAmount: summary.refunded_rands > 0 ? fmtR(summary.refunded_rands) : undefined,
                    refundStatus: summary.status,
                    entryFee,
                    cancellationReason: cancellation_reason || '',
                },
            });

            // Keep existingRefunds current so a multi-division loop respects the guard.
            // (Re-query is simplest and safe for the small per-event volume.)
            const { data: refs, error: refundsReadError } = await supabaseAdmin
                .from('payment_refunds')
                .select('id, payment_id, amount, status')
                .in('payment_id', paymentIds.length ? paymentIds : ['00000000-0000-0000-0000-000000000000']);
            if (refundsReadError) throw refundsReadError;
            existingRefunds = (refs || []) as RefundRow[];
        }

        const totalRefunded = roundRands(results.reduce((s, r) => s + r.refunded_rands, 0));
        if (cancelledDivision) {
            const refundStatus = cancellationRefundStatus(results);
            const { error } = await supabaseAdmin.from('tournament_divisions')
                .update({ cancellation_refund_status: refundStatus }).eq('id', cancelledDivision.id).eq('event_id', eventId);
            if (error) throw error;
            return json(200, { processed: true, cancelled: true, division_id: cancelledDivision.id,
                refund_status: refundStatus, registrations_processed: results.length,
                total_refunded_rands: totalRefunded, refunds: results });
        }
        if (action === 'cancel_event') {
            const needsAttention = results.some((r) => r.status === 'needs_attention' || r.status.startsWith('skipped:'));
            const processing = results.some((r) => r.status === 'processing');
            const refundStatus = needsAttention ? 'needs_attention' : (processing ? 'processing' : 'complete');
            const now = new Date().toISOString();

            const { error: cancelError } = await supabaseAdmin
                .from('calendar')
                .update({
                    event_status: 'cancelled',
                    cancelled_at: now,
                    cancelled_by: callerEmail,
                    cancellation_reason: String(cancellation_reason || '').trim() || null,
                    cancellation_refund_status: refundStatus,
                    featured_event: false,
                    featured_result: false,
                    is_spotlight: false,
                    allow_payments: false,
                })
                .eq('id', eventId);
            if (cancelError) return json(500, { error: `Refunds processed but event status update failed: ${cancelError.message}` });

            await supabaseAdmin.from('player_schedule_events').delete().eq('event_id', eventId);

            return json(200, {
                processed: true,
                cancelled: true,
                refund_status: refundStatus,
                registrations_processed: results.length,
                total_refunded_rands: totalRefunded,
                refunds: results,
            });
        }

        return json(200, { processed: true, total_refunded_rands: totalRefunded, refunds: results });
    } catch (error) {
        if (divisionFailureContext) {
            await divisionFailureContext.client.from('tournament_divisions')
                .update({ cancellation_refund_status: 'needs_attention' }).eq('id', divisionFailureContext.id).eq('event_id', divisionFailureContext.eventId);
        }
        console.error('paystack-refund error:', error);
        return json(500, { error: (error as Error).message });
    }
});
