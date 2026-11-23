import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertPaystackPayment, parseMetadata, resolvePaystackVerifySecrets, verifyPaystackReference } from './paystack.ts';
import { handleReviewedRefundRetry } from './reviewed-refund-retry.ts';
import { toPaystackCents } from './refund-engine.ts';

export type VerifiedEntrySwitch = {
    from_division_id: string;
    from_division: string;
    division_id: string;
    division: string;
    delta: number;
    old_fee: number;
    new_fee: number;
    completed?: boolean;
    replayed?: boolean;
    charged_rands?: number;
    refund_id?: string;
};

type SwitchInput = {
    eventId: string | number;
    registrationId: string;
    targetDivisionId: string;
    actorEmail: string;
    eventManager: boolean;
    topUpReference?: string;
};

type Json = (status: number, body: unknown) => Response;

function switchArguments(input: SwitchInput) {
    return {
        p_event_id: input.eventId,
        p_registration_id: input.registrationId,
        p_target_division_id: input.targetDivisionId,
        p_actor_email: input.actorEmail,
        p_event_manager: input.eventManager,
        p_top_up_reference: input.topUpReference || null,
    };
}

export async function reviewVerifiedEntrySwitch(service: SupabaseClient, input: SwitchInput): Promise<VerifiedEntrySwitch | null> {
    const { data, error } = await service.rpc('review_verified_entry_switch', switchArguments(input));
    if (error) throw new Error(error.message);
    return data;
}

export async function completeVerifiedEntrySwitch(service: SupabaseClient, input: SwitchInput, reviewed: VerifiedEntrySwitch, json: Json): Promise<VerifiedEntrySwitch | Response> {
    // A recorded move supplies its own evidence and remains readable on retry.
    if (reviewed.completed) return reviewed;

    const deltaCents = toPaystackCents(reviewed.delta);
    const reference = input.topUpReference;
    if (deltaCents <= 0 && reference) {
        return json(409, { error: 'This division switch no longer requires that payment. If you have paid, contact the organiser before trying again.' });
    }

    let gateway = null;
    if (deltaCents > 0) {
        if (!reference) return json(402, { code: 'top_up_required', delta: reviewed.delta, error: 'This division needs an additional payment. Contact the organiser if your app does not offer checkout.' });
        const { data: payment, error } = await service.from('payments').select('*')
            .eq('reference', reference).eq('event_id', input.eventId).maybeSingle();
        if (error) throw error;
        if (!payment) return json(404, { error: 'Top-up payment not found' });

        const metadata = parseMetadata(payment.metadata);
        const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase();
        const savedPayer = normalize(metadata.registrant_email || metadata.email);
        const matchingSource = metadata.from_division_id
            ? metadata.from_division_id === reviewed.from_division_id : metadata.from_division === reviewed.from_division;
        if (metadata.source !== 'division_switch' || metadata.registration_id !== input.registrationId
            || metadata.target_division_id !== input.targetDivisionId || !matchingSource
            || !savedPayer
            || payment.payment_type !== 'event_entry_fee' || payment.payment_method !== 'paystack'
            || payment.currency !== 'ZAR' || !['pending', 'processing', 'success'].includes(payment.status)
            || toPaystackCents(Number(payment.amount)) !== deltaCents) {
            return json(409, { error: 'The saved top-up does not match this entry, division and fee. If you have paid, contact the organiser before trying again.' });
        }

        // A local status never proves the charge. Bind Paystack evidence to the
        // exact checkout before any ledger write. SQL maps historic account
        // aliases and binds the saved payer to the current registration.
        const { secrets, configError } = resolvePaystackVerifySecrets(payment);
        if (!secrets.length) return json(500, { error: configError || 'Payment verification not configured' });
        const verification = await verifyPaystackReference(reference, secrets);
        if (!verification.ok) return json(200, { switched: false, retry: true, error: 'Top-up not verified', status: verification.status });
        const verified = verification.data;
        assertPaystackPayment(payment, verified);
        const id = String(verified.id ?? '');
        const payer = normalize((verified.customer as { email?: string } | undefined)?.email);
        if (!/^[1-9][0-9]*$/.test(id) || (typeof verified.id === 'number' && !Number.isSafeInteger(verified.id))
            || payer !== savedPayer) {
            return json(409, { error: 'The verified top-up does not match the saved payer. Contact the organiser with your payment reference.' });
        }
        gateway = { reference, amount: deltaCents, currency: 'ZAR', domain: verified.domain, customer_email: payer, id };
    }

    const { data, error } = await service.rpc('commit_verified_entry_switch', {
        ...switchArguments(input), p_expected_delta: reviewed.delta, p_gateway: gateway,
    });
    if (error) throw new Error(error.message);
    if (!data?.completed) throw new Error('The reviewed division switch was not completed.');
    return data;
}

export async function dispatchVerifiedSwitchRefund(service: SupabaseClient, input: SwitchInput, refundId: string, json: Json): Promise<string> {
    try {
        const response = await handleReviewedRefundRetry(service, {
            refundId, registrationId: input.registrationId, eventId: input.eventId,
            email: input.actorEmail, review: true, reconcile: false,
            initialDivisionSwitch: true, eventManager: input.eventManager, json,
        });
        const { status } = await response.json();
        return typeof status === 'string' ? status : 'pending';
    } catch (error) {
        console.error('Verified division-switch refund needs review:', error);
        return 'pending';
    }
}
