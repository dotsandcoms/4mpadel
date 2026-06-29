import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    parseMetadata,
    resolvePaystackVerifySecrets,
    verifyPaystackReference,
} from './paystack.ts';
import { persistManualEventRegistrations } from './manual-event-payment.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const fmtR = (n: number) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

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
    const paymentId = payment.id as string;
    const reference = payment.reference as string;
    const amount = Number(payment.amount || 0);
    const eventId = (meta.event_id as string) || (payment.event_id as string);
    const covers: Array<{ type: string; email: string; division?: string; license?: string }> =
        Array.isArray(meta.covers) ? meta.covers : [];

    // Atomically claim this payment. This edge function (triggered by the browser)
    // and the Paystack webhook both run identical persist + email logic, and either
    // can be retried. They race on this single conditional UPDATE: only the caller
    // that flips status from non-'success' -> 'success' gets a row back and proceeds.
    // The losers return immediately, which is what stops the duplicate
    // registration/payment confirmation emails.
    const { data: claimed, error: claimError } = await supabaseAdmin
        .from('payments')
        .update({ status: 'success' })
        .eq('id', paymentId)
        .neq('status', 'success')
        .select('id');
    if (claimError) throw claimError;
    if (!claimed || claimed.length === 0) {
        return { processed: false, alreadyProcessed: true };
    }

    try {
    const { savedRows, persisted } = await persistManualEventRegistrations(
        supabaseAdmin,
        payment,
        meta,
        covers,
    );

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
    } catch (err) {
        // Side-effects failed after we claimed the payment. Release the claim by
        // reverting status to 'pending' so a retry (browser or webhook) can safely
        // reprocess instead of leaving the registration half-finished.
        await supabaseAdmin.from('payments').update({ status: 'pending' }).eq('id', paymentId);
        throw err;
    }
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { reference } = await req.json();
        if (!reference) {
            return new Response(JSON.stringify({ error: 'Missing reference' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseUser = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
        if (userError || !user?.email) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceKey);
        const { data: payment, error: payError } = await supabaseAdmin
            .from('payments')
            .select('*')
            .eq('reference', reference)
            .maybeSingle();

        if (payError || !payment) {
            return new Response(JSON.stringify({ error: 'Payment record not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const paymentMeta = parseMetadata(payment.metadata);
        const registrantEmail = String(paymentMeta.registrant_email || '').toLowerCase();
        if (registrantEmail !== user.email.toLowerCase()) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (payment.status === 'success') {
            return new Response(JSON.stringify({ processed: false, alreadyProcessed: true }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { secrets: paystackSecrets, mode: paystackMode, configError } = resolvePaystackVerifySecrets(payment);
        if (paystackSecrets.length === 0) {
            return new Response(JSON.stringify({ error: configError || 'Payment verification not configured' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const verification = await verifyPaystackReference(reference, paystackSecrets);
        if (!verification.ok) {
            console.error('Paystack verify failed:', reference, paystackMode, verification.status, verification.message);
            return new Response(JSON.stringify({
                verified: false,
                retry: true,
                error: 'Payment not verified',
                status: verification.status,
                message: verification.message,
            }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const result = await finalizeManualEventPayment(supabaseAdmin, payment);

        return new Response(JSON.stringify({ ...result, paystackMode }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('confirm-manual-payment error:', error);
        return new Response(JSON.stringify({ error: (error as Error).message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
