import { supabase } from '../supabaseClient';

/**
 * Dispatches a transaction email notification via the secure Supabase Edge Function,
 * writing a row to public.email_queue first for database logging and tracking.
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

    const subject = getSubjectForTemplate(template, variables);

    // 1. Create a tracking audit row in the email_queue
    let queueRowId = null;
    try {
        const { data: queueRow, error: queueError } = await supabase
            .from('email_queue')
            .insert({
                recipient_email: to,
                subject: subject,
                body_html: `Template: ${template} (Waiting for server processing)`,
                status: 'pending'
            })
            .select('id')
            .single();

        if (!queueError && queueRow) {
            queueRowId = queueRow.id;
        }
    } catch (dbErr) {
        console.error('Failed to log email trigger to public.email_queue:', dbErr);
    }

    try {
        // 2. Safely invoke our secure Supabase Edge Function
        const { data, error } = await supabase.functions.invoke('send-email', {
            body: { to, template, variables }
        });

        if (error) throw error;

        // 3. Mark the email as successfully sent
        if (queueRowId) {
            await supabase
                .from('email_queue')
                .update({
                    status: 'sent',
                    processed_at: new Date().toISOString()
                })
                .eq('id', queueRowId);
        }

        return { success: true, messageId: data?.messageId };

    } catch (err) {
        console.error(`Email dispatch via Edge Function failed for [${template}]:`, err.message);

        // 4. Mark the queue row as failed with details
        if (queueRowId) {
            await supabase
                .from('email_queue')
                .update({
                    status: 'failed',
                    error_message: err.message
                })
                .eq('id', queueRowId);
        }

        return { success: false, error: err.message };
    }
};

/**
 * Matches templates to their exact localized subject lines for the database log.
 */
const getSubjectForTemplate = (template, vars) => {
    switch (template) {
        case 'welcome': 
            return `Welcome to 4M Padel South Africa! 🎾`;
        case 'event_entry': 
            return `Registration Confirmed: ${vars.eventName || 'Tournament'}! 🏆`;
        case 'org_applied': 
            return `Organisation Application Received - 4M Padel 🏢`;
        case 'admin_org_applied': 
            return `⚠️ Action Required: New Organisation Pending Review!`;
        case 'org_approved': 
            return `Congratulations! Your Organisation is Approved! 🎉`;
        case 'org_rejected': 
            return `Update on your Organisation Application`;
        case 'event_pending_sanction': 
            return `🏆 Sanction Requested: ${vars.eventName || 'New Event'}`;
        case 'event_sanctioned': 
            return `Tournament Sanctioned & Live: ${vars.eventName}! 🏆`;
        case 'event_rejected': 
            return `Sanction Update: ${vars.eventName}`;
        case 'draws_ready': 
            return `Draws Published: ${vars.eventName}! 🎾`;
        case 'registration_pending_payment':
            return `Complete payment: ${vars.eventName || 'Tournament'} — registration not confirmed`;
        case 'event_registration':
            return vars.paid
                ? `Registration Confirmed: ${vars.eventName || 'Tournament'}! ✅`
                : `You're Registered: ${vars.eventName || 'Tournament'}! 🎾`;
        case 'payment_confirmation':
            return `Payment Confirmed: ${vars.eventName || 'Tournament'} ✅`;
        case 'partner_entry_paid':
            return vars.pendingPayment
                ? `You're entered: ${vars.eventName || 'Tournament'} 🎾`
                : `Entry paid: ${vars.eventName || 'Tournament'} ✅`;
        case 'entry_withdrawn':
            return vars.recipientRole === 'partner'
                ? `${vars.withdrawnPlayerName || 'Your partner'} withdrew from ${vars.eventName || 'Tournament'}`
                : `Withdrawal confirmed: ${vars.eventName || 'Tournament'}`;
        case 'entry_refunded':
            return `Refund Initiated: ${vars.eventName || 'Tournament'} ✅`;
        case 'partner_invite':
            return `${vars.inviterName || 'Your partner'} registered you for ${vars.eventName || 'a tournament'}! 🎾`;
        case 'profile_invite':
            return `${vars.inviterName || 'A 4M Padel player'} invited you to join 4M Padel 🎾`;
        default: 
            return vars.subject || 'Notification from 4M Padel';
    }
};
