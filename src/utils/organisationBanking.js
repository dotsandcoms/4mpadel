import { supabase } from '../supabaseClient';

// No banking values may be logged, persisted in browser storage, or sent to emails.
export async function organisationBanking(action, organisationId, data = {}) {
    const result = await supabase.rpc('organisation_banking', {
        p_action: action, p_org_id: organisationId || null, p_data: data,
    });
    if (result.error) {
        const message = result.error.message || '';
        if (message.includes('MFA_REQUIRED:')) throw new Error('Verify a new authenticator code and try again.');
        // Only expose known business errors, never a database detail/parameter dump.
        const safe = [
            'Sign in again', 'Only organisation', 'Only 4M', 'Banking details changed',
            'Save banking details', 'This event', 'This organisation', 'This request',
            'Enter a valid', 'Check the bank', 'Payout request does not match',
            'Only pending requests', 'Secure banking is temporarily',
        ];
        throw new Error(safe.some(prefix => message.startsWith(prefix))
            ? message : 'Secure banking is unavailable. Please try again or contact 4M support.');
    }
    return result.data;
}

export function formatBankingDestination(summary) {
    return summary?.saved ? `${summary.bank_name} · Account ending ${summary.last_four}` : 'No payout account saved';
}
