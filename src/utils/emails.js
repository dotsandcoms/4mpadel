import { supabase } from '../supabaseClient';

/**
 * Dispatches a transaction email notification via the secure Supabase Edge Function.
 * The function writes its own email_queue audit row using server authority; the
 * browser must never write to that protected table directly.
 * 
 * @param {string} to - Recipient email address
 * @param {string} template - Template identifier (welcome, event_entry, org_applied, etc.)
 * @param {object} variables - Dynamic variables needed by the template
 */
export const sendEmail = async (to, template, variables = {}) => {
    if (!to) {
        console.error('Email Dispatch Error: Missing recipient email address (to).');
        return { success: false, error: 'Missing recipient' };
    }

    try {
        // Safely invoke our secure Supabase Edge Function. It owns all audit
        // writes, so RLS remains closed to browser clients.
        const { data, error } = await supabase.functions.invoke('send-email', {
            body: { to, template, variables }
        });

        if (error) throw error;

        return { success: true, messageId: data?.messageId };

    } catch (err) {
        console.error(`Email dispatch via Edge Function failed for [${template}]:`, err.message);
        return { success: false, error: err.message };
    }
};
