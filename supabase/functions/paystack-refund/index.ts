import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    getPaystackSecretForPayment,
    resolvePaystackVerifySecrets,
    verifyPaystackReference,
} from './paystack.ts';
import {
    applyRegistrationWithdrawal,
    cancelEventTempLicense,
    checkRefundEligibility,
    isLedgerSplitPayment,
    resolveCanManageEvent,
    resolveIsAdmin,
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
    | 'switch_division'
    | 'retry_failed';

type RefundReason =
    | 'owner_withdraw'
    | 'partner_withdraw'
    | 'owner_removed_partner'
    | 'admin_removal'
    | 'admin_cash_refund'
    | 'event_cancelled';

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

    const paystackStatus = String(primary.status || '').toLowerCase();
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
    const regDivision = String(reg.division || '');
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
            return covers.some((c: Record<string, unknown>) =>
                c.type === 'entry'
                && normEmail(c.email) === regEmail
                && String(c.division || '') === regDivision);
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
    let aggregateStatus = items.length === 0 ? 'no_refund' : 'processing';
    const refundedReferences: string[] = [];

    for (const item of items) {
        let payment = ctx.paymentById.get(item.payment_id);
        const method = String((payment as unknown as Record<string, unknown>)?.payment_method || 'paystack');
        const isCash = method === 'cash' || method === 'manual';
        const useCash = ctx.skipPaystack || isCash;

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
        const result = await paystackRefund(secret, refundReference, toPaystackCents(item.refund_amount_rands));

        const update: Record<string, unknown> = {
            paystack_refund_id: result.refundId,
            status: result.ok ? 'processing' : 'failed',
            metadata: {
                cover_type: item.cover_type,
                is_test: item.is_test,
                method,
                ledger_reference: payment?.reference || item.reference,
                ...verifyMeta,
                ...(result.ok ? {} : { paystack_error: result.message }),
            },
        };
        await supabaseAdmin.from('payment_refunds').update(update).eq('id', refundRow?.id);

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
    const markRefundedNow = ctx.skipPaystack && refundedTotal > 0;
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
            .eq('id', reg.id);
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
async function handleSwitchDivision(
    supabaseAdmin: SupabaseClient,
    opts: {
        registrationId?: string;
        targetDivisionId?: string;
        topUpReference?: string;
        moveTeam?: boolean;
        callerEmail: string;
        isAdmin: boolean;
        json: (status: number, body: unknown) => Response;
    },
): Promise<Response> {
    const { registrationId, targetDivisionId, topUpReference, moveTeam = false, callerEmail, isAdmin, json } = opts;
    if (!registrationId || !targetDivisionId) {
        return json(400, { error: 'registration_id and target_division_id are required' });
    }

    const { data: reg } = await supabaseAdmin
        .from('event_registrations')
        .select('*')
        .eq('id', registrationId)
        .maybeSingle();
    if (!reg) return json(404, { error: 'Registration not found' });
    if (reg.status === 'withdrawn') return json(400, { error: 'Registration already withdrawn' });

    const isOwnerOrSelf = normEmail(reg.registered_by) === callerEmail || normEmail(reg.email) === callerEmail;
    if (!isAdmin && !isOwnerOrSelf) return json(403, { error: 'Not authorized for this registration' });

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
    const { data: existingInTarget } = await supabaseAdmin
        .from('event_registrations')
        .select('id')
        .eq('event_id', eventId)
        .ilike('email', reg.email)
        .eq('division', targetDiv.name)
        .neq('status', 'withdrawn')
        .maybeSingle();
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
        if (!reg.partner_email) return json(400, { error: 'This registration does not have a team mate to move' });
        const { data: partnerReg } = await supabaseAdmin
            .from('event_registrations')
            .select('*')
            .eq('event_id', eventId)
            .eq('division', reg.division)
            .ilike('email', reg.partner_email)
            .neq('status', 'withdrawn')
            .maybeSingle();
        if (!partnerReg) return json(404, { error: 'Team mate registration not found' });
        const pairIsLinked = normEmail(partnerReg.partner_email) === normEmail(reg.email)
            || normEmail(partnerReg.registered_by) === normEmail(reg.email)
            || normEmail(reg.registered_by) === normEmail(partnerReg.email);
        if (!pairIsLinked) return json(400, { error: 'The selected registrations are not a linked team' });

        const moving = [reg as RegistrationRow, partnerReg as RegistrationRow];
        for (const player of moving) {
            const { data: conflict } = await supabaseAdmin
                .from('event_registrations')
                .select('id')
                .eq('event_id', eventId)
                .ilike('email', player.email)
                .eq('division', targetDiv.name)
                .neq('status', 'withdrawn')
                .maybeSingle();
            if (conflict) return json(400, { error: `${player.full_name || player.email} is already entered in that division` });
        }

        for (const player of moving) {
            const { error: parkError } = await supabaseAdmin
                .from('event_registrations')
                .update({ division: `__moving__/${player.id}`, division_id: null })
                .eq('id', player.id);
            if (parkError) throw parkError;
        }

        for (const player of moving) {
            const teamMate = moving.find((candidate) => candidate.id !== player.id)!;
            const owesMore = newFee > oldFee && player.payment_status === 'paid';
            const newStatus = owesMore ? 'pending' : player.payment_status;
            const teamMateOwesMore = newFee > oldFee && teamMate.payment_status === 'paid';
            const teamMateNewStatus = teamMateOwesMore ? 'pending' : teamMate.payment_status;
            const { error: moveError } = await supabaseAdmin
                .from('event_registrations')
                .update({
                    division_id: targetDiv.id,
                    division: targetDiv.name,
                    registered_by: player.email,
                    payment_status: newStatus,
                    partner_name: teamMate.full_name,
                    partner_email: teamMate.email,
                    partner_payment_status: teamMateNewStatus,
                })
                .eq('id', player.id);
            if (moveError) throw moveError;

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
        const { data: topPay } = await supabaseAdmin.from('payments').select('*').eq('reference', topUpReference).maybeSingle();
        if (!topPay || Number(topPay.event_id) !== Number(eventId)) return json(404, { error: 'Top-up payment not found' });
        if (parseMeta(topPay.metadata).source !== 'division_switch') return json(400, { error: 'Invalid top-up payment' });

        if (topPay.status !== 'success') {
            const { secrets, configError } = resolvePaystackVerifySecrets(topPay);
            if (secrets.length === 0) return json(500, { error: configError || 'Payment verification not configured' });
            const verification = await verifyPaystackReference(topUpReference, secrets);
            if (!verification.ok) return json(200, { switched: false, retry: true, error: 'Top-up not verified', status: verification.status });
            await supabaseAdmin.from('payments').update({ status: 'success' }).eq('id', topPay.id);
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
                const r = await paystackRefund(secret, gatewayRef, toPaystackCents(refundAmount));
                await supabaseAdmin.from('payment_refunds')
                    .update({ paystack_refund_id: r.refundId, status: r.ok ? 'processing' : 'failed' })
                    .eq('id', refundRow?.id);
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

/**
 * Re-issue a failed payment_refunds row against the correct Paystack gateway
 * reference (parent REGEV-* for LIC-* ledger splits). Admin only.
 */
async function handleRetryFailedRefund(
    supabaseAdmin: SupabaseClient,
    opts: {
        paymentRefundId?: string;
        callerEmail: string;
        json: (status: number, body: unknown) => Response;
    },
): Promise<Response> {
    const { paymentRefundId, callerEmail, json } = opts;
    if (!paymentRefundId) {
        return json(400, { error: 'payment_refund_id is required' });
    }

    const { data: refundRow, error: refundErr } = await supabaseAdmin
        .from('payment_refunds')
        .select('*')
        .eq('id', paymentRefundId)
        .maybeSingle();
    if (refundErr) return json(500, { error: refundErr.message });
    if (!refundRow) return json(404, { error: 'Refund row not found' });
    if (String(refundRow.status || '') !== 'failed') {
        return json(400, {
            error: `Refund is status "${refundRow.status}", only failed rows can be retried`,
        });
    }
    if (!refundRow.payment_id) {
        return json(400, { error: 'Refund row has no payment_id' });
    }

    const { data: payment, error: payErr } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('id', refundRow.payment_id)
        .maybeSingle();
    if (payErr) return json(500, { error: payErr.message });
    if (!payment) return json(404, { error: 'Payment not found' });

    const method = String(payment.payment_method || 'paystack');
    const isCash = method === 'cash' || method === 'manual';
    const gatewayRef = resolvePaystackGatewayReference(payment as PaymentRow);
    const amountRands = roundRands(Number(refundRow.amount || 0));
    if (amountRands <= 0) return json(400, { error: 'Refund amount must be > 0' });

    const coverType = String(parseMeta(refundRow.metadata).cover_type || '');
    const prevMeta = parseMeta(refundRow.metadata);

    if (isCash) {
        await supabaseAdmin
            .from('payment_refunds')
            .update({
                status: 'processed',
                paystack_reference: gatewayRef || refundRow.paystack_reference,
                processed_at: new Date().toISOString(),
                metadata: {
                    ...prevMeta,
                    method,
                    retried_at: new Date().toISOString(),
                    retried_by: `admin:${callerEmail}`,
                    ledger_reference: payment.reference,
                    previous_paystack_reference: refundRow.paystack_reference,
                },
            })
            .eq('id', refundRow.id);

        if (coverType === 'license' && refundRow.event_registration_id) {
            const { data: reg } = await supabaseAdmin
                .from('event_registrations')
                .select('email, event_id')
                .eq('id', refundRow.event_registration_id)
                .maybeSingle();
            if (reg?.email) {
                await cancelEventTempLicense(supabaseAdmin, reg.email, reg.event_id);
            }
        }

        return json(200, {
            retried: true,
            status: 'processed',
            paystack_reference: gatewayRef,
            amount_rands: amountRands,
            cash: true,
        });
    }

    if (!gatewayRef) {
        return json(400, { error: 'Could not resolve Paystack gateway reference' });
    }

    const { secrets, configError } = resolvePaystackVerifySecrets(payment as Record<string, unknown>);
    if (secrets.length === 0) {
        return json(500, { error: configError || 'Paystack not configured' });
    }

    // Parent checkout may already be partially refunded (entry fee), which
    // Paystack often reports as status "reversed" even when balance remains.
    // Locate the transaction, then attempt the remaining refund.
    let gatewayAmountCents: number | null = null;
    let gatewayStatus = 'unknown';
    let gatewayFound = false;
    for (const secret of secrets) {
        try {
            const inspectRes = await fetch(
                `https://api.paystack.co/transaction/verify/${encodeURIComponent(gatewayRef)}`,
                { headers: { Authorization: `Bearer ${secret}` } },
            );
            const inspectBody = await inspectRes.json();
            if (inspectBody?.data?.reference || inspectBody?.data?.id != null) {
                gatewayFound = true;
                gatewayStatus = String(inspectBody.data.status || 'unknown');
                gatewayAmountCents = inspectBody.data.amount != null
                    ? Number(inspectBody.data.amount)
                    : null;
                break;
            }
            gatewayStatus = String(inspectBody?.data?.status || inspectBody?.status || gatewayStatus);
        } catch {
            /* try next secret */
        }
    }

    if (!gatewayFound) {
        await supabaseAdmin
            .from('payment_refunds')
            .update({
                paystack_reference: gatewayRef,
                metadata: {
                    ...prevMeta,
                    method,
                    retried_at: new Date().toISOString(),
                    retried_by: `admin:${callerEmail}`,
                    ledger_reference: payment.reference,
                    previous_paystack_reference: refundRow.paystack_reference,
                    verify_failed: true,
                    paystack_error: `Transaction not found for ${gatewayRef}`,
                    gateway_status: gatewayStatus,
                },
            })
            .eq('id', refundRow.id);
        return json(400, {
            error: `Paystack transaction not found for ${gatewayRef}`,
            paystack_reference: gatewayRef,
            gateway_status: gatewayStatus,
        });
    }

    const secret = getPaystackSecretForPayment(payment as Record<string, unknown>);
    const result = await paystackRefund(secret, gatewayRef, toPaystackCents(amountRands));

    // Fully consumed on gateway — settle ledger without inventing a second refund.
    const fullyGone = !result.ok && /fully\s+(reversed|refunded)|no\s+refundable|already\s+refunded/i.test(result.message || '');
    if (fullyGone) {
        await supabaseAdmin
            .from('payment_refunds')
            .update({
                paystack_reference: gatewayRef,
                status: 'processed',
                processed_at: new Date().toISOString(),
                metadata: {
                    ...prevMeta,
                    method,
                    retried_at: new Date().toISOString(),
                    retried_by: `admin:${callerEmail}`,
                    ledger_reference: payment.reference,
                    previous_paystack_reference: refundRow.paystack_reference,
                    settled_without_paystack_call: true,
                    settle_reason: 'no_refundable_balance_on_gateway',
                    gateway_status: gatewayStatus,
                    gateway_amount_cents: gatewayAmountCents,
                    paystack_error: result.message,
                },
            })
            .eq('id', refundRow.id);
        return json(200, {
            retried: true,
            status: 'processed',
            settled_without_paystack_call: true,
            settle_reason: 'no_refundable_balance_on_gateway',
            paystack_reference: gatewayRef,
            amount_rands: amountRands,
            gateway_amount_cents: gatewayAmountCents,
            ledger_reference: payment.reference,
            paystack_message: result.message,
        });
    }

    await supabaseAdmin
        .from('payment_refunds')
        .update({
            paystack_reference: gatewayRef,
            paystack_refund_id: result.refundId,
            status: result.ok ? 'processing' : 'failed',
            metadata: {
                ...prevMeta,
                method,
                retried_at: new Date().toISOString(),
                retried_by: `admin:${callerEmail}`,
                ledger_reference: payment.reference,
                previous_paystack_reference: refundRow.paystack_reference,
                gateway_status: gatewayStatus,
                gateway_amount_cents: gatewayAmountCents,
                ...(isLedgerSplitPayment(payment as PaymentRow)
                    ? { ledger_split_parent: gatewayRef }
                    : {}),
                ...(result.ok ? { paystack_error: null } : { paystack_error: result.message }),
            },
        })
        .eq('id', refundRow.id);

    if (!result.ok) {
        console.error('retry_failed Paystack refund failed:', gatewayRef, result.message);
        return json(502, {
            retried: false,
            error: result.message,
            paystack_reference: gatewayRef,
            amount_rands: amountRands,
            gateway_status: gatewayStatus,
            gateway_amount_cents: gatewayAmountCents,
        });
    }

    if (refundRow.event_registration_id) {
        const { data: reg } = await supabaseAdmin
            .from('event_registrations')
            .select('id, email, event_id, refund_amount')
            .eq('id', refundRow.event_registration_id)
            .maybeSingle();
        if (reg) {
            if (coverType === 'license' && reg.email) {
                await cancelEventTempLicense(supabaseAdmin, reg.email, reg.event_id);
            }
            const nextRefunded = roundRands(Number(reg.refund_amount || 0) + amountRands);
            await supabaseAdmin
                .from('event_registrations')
                .update({
                    refund_amount: nextRefunded,
                    payment_status: 'refunded',
                })
                .eq('id', reg.id);
        }
    }

    console.log(
        `retry_failed ok: ${refundRow.id} ledger=${payment.reference} → paystack=${gatewayRef} R${amountRands}`,
    );

    return json(200, {
        retried: true,
        status: 'processing',
        paystack_reference: gatewayRef,
        paystack_refund_id: result.refundId,
        amount_rands: amountRands,
        gateway_status: gatewayStatus,
        gateway_amount_cents: gatewayAmountCents,
        ledger_reference: payment.reference,
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

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return json(401, { error: 'Unauthorized' });

        const {
            registration_id,
            action,
            event_id,
            skip_paystack,
            no_refund,
            target_division_id,
            top_up_reference,
            move_team,
            payment_refund_id,
            cancellation_reason,
        } = await req.json() as {
            registration_id?: string;
            action?: Action;
            event_id?: string;
            skip_paystack?: boolean;
            no_refund?: boolean;
            target_division_id?: string;
            top_up_reference?: string;
            move_team?: boolean;
            payment_refund_id?: string;
            cancellation_reason?: string;
        };
        if (!action) return json(400, { error: 'Missing action' });

        const supabaseAdmin = createClient(supabaseUrl, serviceKey);
        const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
        // Prefer JWT role claim — edge SUPABASE_SERVICE_ROLE_KEY can differ in
        // format from the dashboard api-keys value even for the same project.
        let isServiceRole = !!serviceKey && bearer === serviceKey;
        if (!isServiceRole && bearer.split('.').length === 3) {
            try {
                const payload = JSON.parse(atob(bearer.split('.')[1]!));
                isServiceRole = payload?.role === 'service_role';
            } catch {
                /* ignore */
            }
        }

        // Service-role callers may retry failed refunds (ops / one-off reprocess).
        // All other actions still require a logged-in user.
        let callerEmail = 'service-role';
        let isAdmin = false;
        if (isServiceRole && action === 'retry_failed') {
            isAdmin = true;
        } else {
            const supabaseUser = createClient(supabaseUrl, anonKey, {
                global: { headers: { Authorization: authHeader } },
            });
            const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
            if (userError || !user?.email) return json(401, { error: 'Unauthorized' });
            callerEmail = normEmail(user.email);
            isAdmin = await resolveIsAdmin(supabaseAdmin, user.email);
        }

        // retry_failed stays platform-admin / service-role only.
        if (action === 'retry_failed' && !isAdmin) {
            return json(403, { error: 'Admin only' });
        }

        // ===== Retry a failed payment_refunds row (admin / service role) =====
        if (action === 'retry_failed') {
            return await handleRetryFailedRefund(supabaseAdmin, {
                paymentRefundId: payment_refund_id,
                callerEmail,
                json,
            });
        }

        // ----- Load the target registration(s) -----
        let targets: RegistrationRow[] = [];
        let eventId: string | number | undefined;

        if (action === 'cancel_event') {
            if (!event_id) return json(400, { error: 'event_id required for cancel_event' });
            eventId = event_id;
            if (!isAdmin) {
                const canManage = await resolveCanManageEvent(supabaseAdmin, callerEmail, eventId);
                if (!canManage) return json(403, { error: 'You do not have permission to cancel this event' });
                isAdmin = true;
            }
            const { data } = await supabaseAdmin
                .from('event_registrations')
                .select('*')
                .eq('event_id', event_id)
                .neq('status', 'withdrawn');
            targets = (data || []) as RegistrationRow[];
        } else if (action === 'withdraw_all') {
            if (!event_id) return json(400, { error: 'event_id required for withdraw_all' });
            eventId = event_id;
            const { data } = await supabaseAdmin
                .from('event_registrations')
                .select('*')
                .eq('event_id', event_id)
                .neq('status', 'withdrawn');
            // The caller's own active registrations (rows they own or are the player on).
            targets = (data || []).filter(
                (r) => normEmail(r.registered_by) === callerEmail || normEmail(r.email) === callerEmail,
            ) as RegistrationRow[];
        } else {
            if (!registration_id) return json(400, { error: 'registration_id required' });
            const { data: reg } = await supabaseAdmin
                .from('event_registrations')
                .select('*')
                .eq('id', registration_id)
                .maybeSingle();
            if (!reg) return json(404, { error: 'Registration not found' });
            eventId = reg.event_id;

            if (action === 'remove_partner') {
                // Caller must own the booking; the target is the partner's active row.
                if (!isAdmin && normEmail(reg.registered_by) !== callerEmail) {
                    return json(403, { error: 'Only the booking owner can remove a partner' });
                }
                if (!reg.partner_email) return json(400, { error: 'No partner on this registration' });
                const { data: partnerReg } = await supabaseAdmin
                    .from('event_registrations')
                    .select('*')
                    .eq('event_id', reg.event_id)
                    .eq('division', reg.division)
                    .ilike('email', reg.partner_email)
                    .neq('status', 'withdrawn')
                    .maybeSingle();
                if (!partnerReg) return json(404, { error: 'Partner registration not found' });
                targets = [partnerReg as RegistrationRow];
            } else {
                targets = [reg as RegistrationRow];
            }
        }

        // Org owners/admins managing their own event (not in admin_sidebar_permissions)
        // need admin_remove + cash/no-refund flags for ManualEventRegistrations.
        if (action === 'admin_remove' && !isAdmin) {
            const canManage = await resolveCanManageEvent(supabaseAdmin, callerEmail, eventId);
            if (!canManage) return json(403, { error: 'Admin only' });
            isAdmin = true;
        }

        // skip_paystack and no_refund are admin / event-manager only. [CORRECTION 4]
        const skipPaystack = !!skip_paystack && isAdmin && action === 'admin_remove';
        const noRefund = !!no_refund && isAdmin && action === 'admin_remove';

        // ===== Division switch (move the entry instead of refunding) =====
        if (action === 'switch_division') {
            // Org managers may move any entry on their event; players still use
            // the existing owner/self path inside handleSwitchDivision.
            if (!isAdmin) {
                isAdmin = await resolveCanManageEvent(supabaseAdmin, callerEmail, eventId);
            }
            return await handleSwitchDivision(supabaseAdmin, {
                registrationId: registration_id,
                targetDivisionId: target_division_id,
                topUpReference: top_up_reference,
                moveTeam: move_team,
                callerEmail,
                isAdmin,
                json,
            });
        }

        if (targets.length === 0 && action !== 'cancel_event') {
            return json(200, { processed: false, reason: 'no_active_registrations', refunds: [] });
        }

        // ----- Shared context: event, divisions, payments, existing refunds -----
        const { data: event } = await supabaseAdmin
            .from('calendar')
            .select('id, event_name, event_dates, slug, is_manual, registration_closes_at')
            .eq('id', eventId)
            .maybeSingle();
        const { data: divisions } = await supabaseAdmin
            .from('tournament_divisions')
            .select('id, name, entry_fee, entries_close_at')
            .eq('event_id', eventId);
        const { data: payments } = await supabaseAdmin
            .from('payments')
            .select('*')
            .eq('event_id', eventId);
        const successPayments = (payments || []).filter((p) => p.status === 'success') as PaymentRow[];
        const paymentById = new Map<string, PaymentRow>();
        for (const p of successPayments) paymentById.set(p.id, p);

        const paymentIds = successPayments.map((p) => p.id);
        let existingRefunds: RefundRow[] = [];
        if (paymentIds.length) {
            const { data: refs } = await supabaseAdmin
                .from('payment_refunds')
                .select('id, payment_id, amount, status')
                .in('payment_id', paymentIds);
            existingRefunds = (refs || []) as RefundRow[];
        }

        // Pre-withdrawal snapshot of active registrations per player email, used
        // to decide whether a withdrawal removes the player's LAST active entry
        // (the temp license is per-event, so it's only refunded/cancelled then).
        const { data: activeRegs } = await supabaseAdmin
            .from('event_registrations')
            .select('id, email')
            .eq('event_id', eventId)
            .neq('status', 'withdrawn');
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
            if (action === 'cancel_event') reason = 'event_cancelled';
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
                const { data: partnerReg } = await supabaseAdmin
                    .from('event_registrations')
                    .select('*')
                    .eq('event_id', reg.event_id)
                    .eq('division', reg.division)
                    .ilike('email', reg.partner_email)
                    .neq('status', 'withdrawn')
                    .maybeSingle();
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
            if (summary.refunded_rands > 0 && action !== 'cancel_event') {
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
                template: action === 'cancel_event' ? 'event_cancelled' : 'entry_withdrawn',
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
            const { data: refs } = await supabaseAdmin
                .from('payment_refunds')
                .select('id, payment_id, amount, status')
                .in('payment_id', paymentIds.length ? paymentIds : ['00000000-0000-0000-0000-000000000000']);
            existingRefunds = (refs || []) as RefundRow[];
        }

        const totalRefunded = roundRands(results.reduce((s, r) => s + r.refunded_rands, 0));
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
        console.error('paystack-refund error:', error);
        return json(500, { error: (error as Error).message });
    }
});
