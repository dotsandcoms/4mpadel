import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseMetadata, verifyPaystackWebhookSignature } from './paystack.ts';

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

    return { processed: true };
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-paystack-signature',
};

const fmtR = (n: number) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

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

    if (payload?.event !== 'charge.success') {
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders });
    }

    const data = payload.data as Record<string, unknown> | undefined;
    const reference = String(data?.reference || '');
    if (!reference) {
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

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
