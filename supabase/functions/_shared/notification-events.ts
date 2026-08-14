/**
 * Push event catalog for Edge Functions.
 * Keep in sync with mobile/src/lib/notification-events.ts and
 * src/utils/notificationEvents.js.
 *
 * Usage (service role):
 *   const { title, body } = pushCopy('partner_entry_paid', { payerName, eventName });
 *   await supabase.rpc('enqueue_push', { p_email, p_type: 'partner_entry_paid', p_title: title, p_body: body, p_path: '/(tabs)/calendar', p_data: { type: 'partner_entry_paid' } });
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
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_PATHS: Record<NotificationType, string> = {
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

export type PushCopyVars = {
  playerName?: string;
  partnerName?: string;
  payerName?: string;
  eventName?: string;
  division?: string;
  amount?: string;
  withdrawnPlayerName?: string;
};

export function pushCopy(type: NotificationType, vars: PushCopyVars = {}): { title: string; body: string } {
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
      return { title: 'Refund on the way', body: `Your ${event} entry has been refunded.` };
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
  }
}
