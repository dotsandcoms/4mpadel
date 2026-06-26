import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseMetadata, verifyPaystackWebhookSignature } from './paystack.ts';
import { persistManualEventRegistrations } from './manual-event-payment.ts';

async function sendEmailViaEdge(payload: {
    to: string;
    template: string;
    variables: Record<string, unknown>;
}): Promise<void> {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const res = await fetch(`${url}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text();
        console.error(`send-email [${payload.template}] failed:`, text);
    }
}

async function finalizeManualEventPayment(
    supabaseAdmin: SupabaseClient,
    payment: Record<string, unknown>,
) {
    const meta = parseMetadata(payment.metadata);
    if (meta.source !== 'manual_event') {
        return { processed: false, skipped: true, reason: 'not_manual_event' };
    }
    if (payment.status === 'success') {
        return { processed: false, alreadyProcessed: true };
    }

    const paymentId = payment.id as string;
    const reference = payment.reference as string;
    const amount = Number(payment.amount || 0);
    const eventId = (meta.event_id as string) || (payment.event_id as string);
    const covers: Array<{ type: string; email: string; division?: string; license?: string }> =
        Array.isArray(meta.covers) ? meta.covers : [];

    const { savedRows, persisted } = await persistManualEventRegistrations(
        supabaseAdmin,
        payment,
        meta,
        covers,
    );

    await supabaseAdmin.from('payments').update({ status: 'success' }).eq('id', paymentId);

    for (const c of covers.filter((c) => c.type === 'entry')) {
        await supabaseAdmin
            .from('event_registrations')
            .update({ payment_status: 'paid' })
            .eq('event_id', eventId)
            .eq('division', c.division)
            .ilike('email', c.email);
        await supabaseAdmin
            .from('event_registrations')
            .update({ partner_payment_status: 'paid' })
            .eq('event_id', eventId)
            .eq('division', c.division)
            .ilike('partner_email', c.email);
    }

    for (const c of covers.filter((c) => c.type === 'license')) {
        const isFull = c.license === 'full';
        const { data: player } = await supabaseAdmin
            .from('players')
            .select('id')
            .ilike('email', c.email)
            .maybeSingle();
        if (player) {
            await supabaseAdmin
                .from('players')
                .update({ license_type: isFull ? 'full' : 'temporary', paid_registration: true })
                .eq('id', player.id);
            if (!isFull) {
                const { data: ev } = await supabaseAdmin
                    .from('calendar')
                    .select('event_name, end_date, start_date')
                    .eq('id', eventId)
                    .maybeSingle();
                await supabaseAdmin.from('temporary_licenses').insert([{
                    player_id: player.id,
                    event_id: eventId,
                    event_name: ev?.event_name || (meta.event_name as string) || '',
                    event_date: ev?.end_date || ev?.start_date || null,
                }]);
            }
        }
    }

    const lineItems = Array.isArray(meta.line_items)
        ? (meta.line_items as Array<{ label: string; amount: number }>)
            .map((li) => `${li.label}: ${fmtR(li.amount)}`)
            .join('\n')
        : '';

    const registrantEmail = String(meta.registrant_email || '').toLowerCase();
    const eventUrl = (meta.event_url as string) || 'https://4mpadel.co.za/calendar';
    const divisionEntryFees = (meta.division_entry_fees || {}) as Record<string, number>;
    const fmtRWhole = (n: number) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

    if (persisted && meta.registrant_email) {
        await sendEmailViaEdge({
            to: meta.registrant_email as string,
            template: 'event_registration',
            variables: {
                eventId: eventId,
                playerName: meta.registrant_name || 'Player',
                eventName: meta.event_name || 'Tournament',
                division: meta.division_names || '',
                partnerName: meta.primary_partner_name || 'TBD',
                eventDates: meta.event_dates || '',
                venue: meta.event_venue || '',
                paid: true,
                amount: fmtR(amount),
                amountDue: 'R 0.00',
                eventUrl,
            },
        });
    }

    if (meta.registrant_email) {
        await sendEmailViaEdge({
            to: meta.registrant_email as string,
            template: 'payment_confirmation',
            variables: {
                eventId: eventId,
                playerName: meta.registrant_name || 'Player',
                eventName: meta.event_name || 'Tournament',
                amount: fmtR(amount),
                lineItems,
                reference,
                eventUrl: meta.event_url || 'https://4mpadel.co.za/calendar',
            },
        });
    }

    const partnerDivisions = new Map<string, string[]>();
    for (const c of covers.filter((c) => c.type === 'entry')) {
        const email = String(c.email || '').toLowerCase();
        if (!email || email === registrantEmail) continue;
        if (!partnerDivisions.has(email)) partnerDivisions.set(email, []);
        if (c.division) partnerDivisions.get(email)!.push(c.division);
    }

    for (const [partnerEmail, divs] of partnerDivisions) {
        const { data: reg } = await supabaseAdmin
            .from('event_registrations')
            .select('full_name')
            .eq('event_id', eventId)
            .ilike('email', partnerEmail)
            .limit(1)
            .maybeSingle();

        await sendEmailViaEdge({
            to: partnerEmail,
            template: 'partner_entry_paid',
            variables: {
                eventId: eventId,
                playerName: reg?.full_name || 'Player',
                payerName: meta.registrant_name || 'Your partner',
                eventName: meta.event_name || 'Tournament',
                division: divs.join(', '),
                eventUrl: meta.event_url || 'https://4mpadel.co.za/calendar',
            },
        });
    }

    for (const row of savedRows) {
        const email = String(row.email || '').toLowerCase();
        if (email === registrantEmail || row.payment_status === 'paid') continue;
        const division = String(row.division || '');
        const fee = Number(divisionEntryFees[division] || 0);
        if (fee <= 0) continue;
        const payUrl = row.pay_token ? `${eventUrl}?pay_token=${row.pay_token}` : eventUrl;
        await sendEmailViaEdge({
            to: row.email as string,
            template: 'partner_invite',
            variables: {
                eventId: eventId,
                playerName: row.full_name || 'Player',
                inviterName: meta.registrant_name || 'Your partner',
                eventName: meta.event_name || 'Tournament',
                division,
                eventDates: meta.event_dates || '',
                amountDue: fmtRWhole(fee),
                payUrl,
            },
        });
    }

    return { processed: true };
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
};

const fmtR = (n: number) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

// ---------------------------------------------------------------------------
// Refund webhook handling
// ---------------------------------------------------------------------------

const REFUND_STATUS_BY_EVENT: Record<string, string> = {
    'refund.pending': 'pending',
    'refund.processing': 'processing',
    'refund.processed': 'processed',
    'refund.failed': 'failed',
};

/**
 * Handle refund.* events. Idempotent: matches an existing payment_refunds row
 * (by paystack_refund_id, else by reference + amount among non-final rows) and
 * advances its status. On 'processed' it finalizes the registration's
 * payment_status — guarded so a replay or the client poll cannot double-apply.
 */
async function handleRefundEvent(
    supabaseAdmin: SupabaseClient,
    event: string,
    data: Record<string, unknown>,
): Promise<{ updated: boolean; reason?: string }> {
    const newStatus = REFUND_STATUS_BY_EVENT[event];
    if (!newStatus) return { updated: false, reason: 'unknown_refund_event' };

    const refundId = data.id != null ? String(data.id) : null;
    const transaction = data.transaction as Record<string, unknown> | string | undefined;
    const reference = String(
        data.transaction_reference
        || (typeof transaction === 'object' ? transaction?.reference : transaction)
        || data.reference
        || '',
    );
    const amountRands = data.amount != null ? Number(data.amount) / 100 : null;

    let row: Record<string, unknown> | null = null;

    if (refundId) {
        const { data: byId } = await supabaseAdmin
            .from('payment_refunds')
            .select('*')
            .eq('paystack_refund_id', refundId)
            .maybeSingle();
        row = byId || null;
    }

    if (!row && reference) {
        const { data: candidates } = await supabaseAdmin
            .from('payment_refunds')
            .select('*')
            .eq('paystack_reference', reference)
            .in('status', ['pending', 'processing']);
        const list = candidates || [];
        row = (amountRands != null
            ? list.find((r) => Math.abs(Number(r.amount) - amountRands) < 0.01)
            : undefined) || list[0] || null;
    }

    if (!row) return { updated: false, reason: 'refund_row_not_found' };

    // Idempotency: never regress a processed row; skip identical no-op writes.
    if (row.status === 'processed' && newStatus !== 'processed') {
        return { updated: false, reason: 'already_processed' };
    }
    if (row.status === newStatus && (row.paystack_refund_id || !refundId)) {
        return { updated: false, reason: 'no_change' };
    }

    const update: Record<string, unknown> = { status: newStatus };
    if (refundId && !row.paystack_refund_id) update.paystack_refund_id = refundId;
    if (newStatus === 'processed' || newStatus === 'failed') {
        update.processed_at = new Date().toISOString();
    }
    await supabaseAdmin.from('payment_refunds').update(update).eq('id', row.id);

    if (newStatus === 'processed' && row.event_registration_id) {
        const { data: reg } = await supabaseAdmin
            .from('event_registrations')
            .select('id, payment_status')
            .eq('id', row.event_registration_id)
            .maybeSingle();
        if (reg && reg.payment_status !== 'refunded') {
            await supabaseAdmin
                .from('event_registrations')
                .update({
                    payment_status: 'refunded',
                    refunded_at: new Date().toISOString(),
                    refund_amount: Number(row.amount),
                })
                .eq('id', row.event_registration_id);
        }
    }

    return { updated: true };
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('x-paystack-signature') || '';

    const signatureValid = await verifyPaystackWebhookSignature(rawBody, signature);
    if (!signatureValid) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: corsHeaders });
    }

    let payload: Record<string, unknown>;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
    }

    const eventName = String(payload?.event || '');
    const isRefundEvent = eventName.startsWith('refund.');

    if (eventName !== 'charge.success' && !isRefundEvent) {
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders });
    }

    const data = payload.data as Record<string, unknown> | undefined;

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    if (isRefundEvent) {
        try {
            const result = await handleRefundEvent(supabaseAdmin, eventName, data || {});
            return new Response(JSON.stringify({ received: true, ...result }), { status: 200, headers: corsHeaders });
        } catch (error) {
            console.error('paystack-webhook refund error:', error);
            return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
        }
    }

    const reference = String(data?.reference || '');
    if (!reference) {
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders });
    }

    try {
        const { data: payment } = await supabaseAdmin
            .from('payments')
            .select('*')
            .eq('reference', reference)
            .maybeSingle();

        if (!payment || parseMetadata(payment.metadata).source !== 'manual_event') {
            return new Response(JSON.stringify({ received: true, skipped: true }), { status: 200, headers: corsHeaders });
        }

        const result = await finalizeManualEventPayment(supabaseAdmin, payment);

        return new Response(JSON.stringify({ received: true, ...result }), { status: 200, headers: corsHeaders });
    } catch (error) {
        console.error('paystack-webhook error:', error);
        return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: corsHeaders });
    }
});
