/**
 * Push event catalog for the website and future Edge Function sends.
 * Keep in sync with:
 *   - supabase/migrations/20260814_player_push_notifications.sql
 *   - mobile/src/lib/notification-events.ts
 *   - supabase/functions/_shared/notification-events.ts
 *
 * Enqueue with the service role:
 *   supabase.rpc('enqueue_push', { p_email, p_type, p_title, p_body, p_path, p_data })
 * partner_entry_paid is the “someone registered you as their partner” event.
 */

export const NOTIFICATION_TYPES = [
  'partner_assigned',
  'partner_entry_paid',
  'partner_invite',
  'event_registration',
  'payment_confirmation',
  'payment_reminder',
  'entry_withdrawn',
  'entry_refunded',
  'draws_ready',
  'division_changed',
  'match_reminder',
  'ranking_change',
  'club_announcement',
];

export const NOTIFICATION_PATHS = {
  partner_assigned: '/(tabs)/calendar',
  partner_entry_paid: '/(tabs)/calendar',
  partner_invite: '/(tabs)/calendar',
  event_registration: '/(tabs)/calendar',
  payment_confirmation: '/(tabs)/calendar',
  payment_reminder: '/(tabs)/calendar',
  entry_withdrawn: '/(tabs)/calendar',
  entry_refunded: '/(tabs)/calendar',
  draws_ready: '/(tabs)/calendar',
  division_changed: '/(tabs)/calendar',
  match_reminder: '/(tabs)/calendar',
  ranking_change: '/(tabs)/rankings',
  club_announcement: '/(tabs)/explore',
};

/**
 * @param {string} type
 * @param {{ playerName?: string, partnerName?: string, payerName?: string, eventName?: string, division?: string, amount?: string, withdrawnPlayerName?: string }} [vars]
 */
export function pushCopy(type, vars = {}) {
  const event = vars.eventName || 'the tournament';
  const partner = vars.partnerName || 'your partner';
  const payer = vars.payerName || partner;

  switch (type) {
    case 'partner_entry_paid':
      return {
        title: 'You’ve been entered',
        body: `${payer} registered you as their partner for ${event}.`,
      };
    case 'partner_assigned':
      return {
        title: 'Partner confirmed',
        body: `You’re playing with ${partner} at ${event}.`,
      };
    case 'partner_invite':
      return {
        title: 'Partner invite',
        body: `${vars.playerName || 'A player'} wants you as their partner for ${event}.`,
      };
    case 'event_registration':
      return { title: 'Entry received', body: `You’re down for ${event}.` };
    case 'payment_confirmation':
      return {
        title: 'Payment received',
        body: vars.amount
          ? `Your ${vars.amount} payment for ${event} is confirmed.`
          : `Your payment for ${event} is confirmed.`,
      };
    case 'payment_reminder':
      return {
        title: 'Payment due',
        body: `Complete payment to keep your place in ${event}.`,
      };
    case 'entry_withdrawn':
      return {
        title: vars.withdrawnPlayerName ? 'Partner withdrew' : 'Withdrawal confirmed',
        body: vars.withdrawnPlayerName
          ? `${vars.withdrawnPlayerName} withdrew from ${event}.`
          : `You’re withdrawn from ${event}.`,
      };
    case 'entry_refunded':
      return {
        title: 'Refund on the way',
        body: `Your ${event} entry has been refunded.`,
      };
    case 'draws_ready':
      return { title: 'Draws are up', body: `The ${event} draws are ready.` };
    case 'division_changed':
      return {
        title: 'Division updated',
        body: vars.division
          ? `You’re now in ${vars.division} at ${event}.`
          : `Your division at ${event} has changed.`,
      };
    case 'match_reminder':
      return { title: 'Match coming up', body: `You’re on court soon at ${event}.` };
    case 'ranking_change':
      return {
        title: 'Ranking update',
        body: 'Your ranking has changed. Open Rankings to see the new list.',
      };
    case 'club_announcement':
      return { title: 'Club update', body: 'There’s a new note from your club.' };
    default:
      return { title: '4M Padel', body: 'You have an update.' };
  }
}

/**
 * Payload for enqueue_push. Service role only.
 * @param {string} email
 * @param {string} type
 * @param {object} [vars]
 */
export function enqueuePushArgs(email, type, vars = {}) {
  const { title, body } = pushCopy(type, vars);
  return {
    p_email: email,
    p_type: type,
    p_title: title,
    p_body: body,
    p_path: NOTIFICATION_PATHS[type] || '/(tabs)/calendar',
    p_data: { type, eventName: vars.eventName || null },
  };
}
