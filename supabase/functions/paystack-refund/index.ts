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
    resolveIsAdmin,
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

type Action = 'withdraw' | 'withdraw_all' | 'remove_partner' | 'admin_remove' | 'switch_division';

type RefundReason =
    | 'owner_withdraw'
    | 'partner_withdraw'
    | 'owner_removed_partner'
    | 'admin_removal'
    | 'admin_cash_refund';

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

type RefundSummaryItem = {
    registration_id: string;
    division: string;
    refunded_rands: number;
    paystack: boolean;
    status: string;
    reason: RefundReason;
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

    for (const item of items) {
        const payment = ctx.paymentById.get(item.payment_id);
        const method = String((payment as unknown as Record<string, unknown>)?.payment_method || 'paystack');
        const isCash = method === 'cash' || method === 'manual';
        const useCash = ctx.skipPaystack || isCash;

        // 1. Insert the refund row up-front (auditable even if the API call dies).
        const insertRow: Record<string, unknown> = {
            payment_id: item.payment_id,
            event_registration_id: reg.id,
            paystack_reference: item.reference,
            amount: item.refund_amount_rands,
            currency: 'ZAR',
            status: useCash ? 'processed' : 'pending',
            reason: useCash && ctx.reason === 'admin_removal' ? 'admin_cash_refund' : ctx.reason,
            initiated_by: ctx.initiatedBy,
            metadata: { cover_type: item.cover_type, is_test: item.is_test, method },
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
            if (item.cover_type === 'license') {
                await cancelEventTempLicense(supabaseAdmin, reg.email, ctx.eventId);
            }
            continue;
        }

        // 2. Call Paystack.
        const secret = getPaystackSecretForPayment((payment ?? {}) as Record<string, unknown>);
        const result = await paystackRefund(secret, item.reference, toPaystackCents(item.refund_amount_rands));

        const update: Record<string, unknown> = {
            paystack_refund_id: result.refundId,
            status: result.ok ? 'processing' : 'failed',
        };
        await supabaseAdmin.from('payment_refunds').update(update).eq('id', refundRow?.id);

        if (result.ok) {
            anyPaystack = true;
            refundedTotal = roundRands(refundedTotal + item.refund_amount_rands);
            if (item.cover_type === 'license') {
                await cancelEventTempLicense(supabaseAdmin, reg.email, ctx.eventId);
            }
        } else {
            console.error('Paystack refund failed:', item.reference, result.message);
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
        callerEmail: string;
        isAdmin: boolean;
        json: (status: number, body: unknown) => Response;
    },
): Promise<Response> {
    const { registrationId, targetDivisionId, topUpReference, callerEmail, isAdmin, json } = opts;
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

    let refundedRands = 0;
    let chargedRands = 0;

    // ---- Higher fee: verify the top-up payment before moving ----
    if (delta > 0) {
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
    if (delta < 0) {
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
            const { data: refundRow } = await supabaseAdmin.from('payment_refunds').insert([{
                payment_id: coveringPayment.id,
                event_registration_id: reg.id,
                paystack_reference: coveringPayment.reference,
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
                const r = await paystackRefund(secret, coveringPayment.reference, toPaystackCents(refundAmount));
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

    // ---- Confirmation email ----
    const eventUrl = `https://4mpadel.co.za/calendar/${event?.slug || eventId}`;
    try {
        await sendEmailViaEdge({
            to: reg.email,
            template: 'event_registration',
            variables: {
                eventId,
                playerName: reg.full_name || 'Player',
                eventName: event?.event_name || 'Tournament',
                division: targetDiv.name,
                partnerName: 'TBD',
                eventDates: event?.event_dates || '',
                paid: true,
                amount: fmtR(newFee),
                amountDue: 'R 0.00',
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

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return json(401, { error: 'Unauthorized' });

        const { registration_id, action, event_id, skip_paystack, no_refund, target_division_id, top_up_reference } = await req.json() as {
            registration_id?: string;
            action?: Action;
            event_id?: string;
            skip_paystack?: boolean;
            no_refund?: boolean;
            target_division_id?: string;
            top_up_reference?: string;
        };
        if (!action) return json(400, { error: 'Missing action' });

        const supabaseUser = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
        if (userError || !user?.email) return json(401, { error: 'Unauthorized' });

        const supabaseAdmin = createClient(supabaseUrl, serviceKey);
        const callerEmail = normEmail(user.email);
        const isAdmin = await resolveIsAdmin(supabaseAdmin, user.email);

        // skip_paystack and no_refund are admin-only. [CORRECTION 4]
        const skipPaystack = !!skip_paystack && isAdmin && action === 'admin_remove';
        const noRefund = !!no_refund && isAdmin && action === 'admin_remove';

        if (action === 'admin_remove' && !isAdmin) {
            return json(403, { error: 'Admin only' });
        }

        // ===== Division switch (move the entry instead of refunding) =====
        if (action === 'switch_division') {
            const result = await handleSwitchDivision(supabaseAdmin, {
                registrationId: registration_id,
                targetDivisionId: target_division_id,
                topUpReference: top_up_reference,
                callerEmail,
                isAdmin,
                json,
            });
            return result;
        }

        // ----- Load the target registration(s) -----
        let targets: RegistrationRow[] = [];
        let eventId: string | number | undefined;

        if (action === 'withdraw_all') {
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

        if (targets.length === 0) {
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
            const elig = checkRefundEligibility(reg, divisions || [], event || {}, user.email, isAdmin);
            if (!elig.eligible) {
                results.push({
                    registration_id: reg.id,
                    division: reg.division,
                    refunded_rands: 0,
                    paystack: false,
                    status: `skipped:${elig.reason}`,
                    reason: 'owner_withdraw',
                });
                continue;
            }

            // Determine reason.
            let reason: RefundReason;
            if (action === 'admin_remove') reason = 'admin_removal';
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
            if (summary.refunded_rands > 0) {
                await sendEmailViaEdge({
                    to: reg.email,
                    template: 'entry_refunded',
                    variables: {
                        eventId,
                        playerName: reg.full_name || 'Player',
                        eventName: event?.event_name || 'Tournament',
                        division: reg.division,
                        amount: fmtR(summary.refunded_rands),
                        reference: results.length ? (successPayments[0]?.reference || '') : '',
                        eventUrl,
                    },
                });
            }
            await sendEmailViaEdge({
                to: reg.email,
                template: 'entry_withdrawn',
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
                    entryFee,
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
        return json(200, { processed: true, total_refunded_rands: totalRefunded, refunds: results });
    } catch (error) {
        console.error('paystack-refund error:', error);
        return json(500, { error: (error as Error).message });
    }
});
