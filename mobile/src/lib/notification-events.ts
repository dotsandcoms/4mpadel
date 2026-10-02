/**
 * Mobile push catalog. SQL producers and preferences live in
 * mobile/supabase/migrations/20260925100000_push_delivery.sql.
 * Existing service callers retain their legacy event keys.
 */

export const NOTIFICATION_TYPES = [
  'registration_open',
  'early_bird_ending',
  'registration_closing',
  'registration_closed',
  'schedule_published',
  'schedule_changed',
  'match_progression',
  'opponent_confirmed',
  'result_confirmed',
  'result_corrected',
  'tournament_live',
  'tournament_finished',
  'event_updated',
  'registration_complete',
  'event_cancelled',
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

/** Default in-app path when the sender does not supply one. */
export const NOTIFICATION_PATHS: Record<NotificationType, string> = {
  registration_open: '/calendar',
  early_bird_ending: '/calendar',
  registration_closing: '/calendar',
  registration_closed: '/calendar',
  schedule_published: '/calendar',
  schedule_changed: '/calendar',
  match_progression: '/calendar',
  opponent_confirmed: '/calendar',
  result_confirmed: '/calendar',
  result_corrected: '/calendar',
  tournament_live: '/calendar',
  tournament_finished: '/calendar',
  event_updated: '/calendar',
  registration_complete: '/(tabs)/profile',
  event_cancelled: '/calendar',
  partner_assigned: '/calendar',
  partner_entry_paid: '/calendar',
  partner_invite: '/calendar',
  event_registration: '/calendar',
  payment_confirmation: '/calendar',
  payment_reminder: '/calendar',
  entry_withdrawn: '/calendar',
  entry_refunded: '/calendar',
  draws_ready: '/calendar',
  division_changed: '/calendar',
  match_reminder: '/calendar',
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

/**
 * Short lock-screen copy. Sentence case, no emoji — the email templates are
 * longer and can be warmer; a banner has one line.
 */
export function pushCopy(
  type: NotificationType,
  vars: PushCopyVars = {}
): { title: string; body: string } {
  const event = vars.eventName || 'the tournament';
  const partner = vars.partnerName || 'your partner';
  const payer = vars.payerName || partner;

  switch (type) {
    case 'registration_open':
      return { title: 'Registration open', body: `Open ${event} for the latest details.` };
    case 'early_bird_ending':
      return { title: 'Early bird ending', body: `Open ${event} for the latest details.` };
    case 'registration_closing':
      return { title: 'Registration closing', body: `Open ${event} for the latest details.` };
    case 'registration_closed':
      return { title: 'Registration closed', body: `Open ${event} for the latest details.` };
    case 'schedule_published':
      return { title: 'Schedule published', body: `Open ${event} for the latest details.` };
    case 'schedule_changed':
      return { title: 'Schedule changed', body: `Open ${event} for the latest details.` };
    case 'match_progression':
      return { title: 'Match progression', body: `Open ${event} for the latest details.` };
    case 'opponent_confirmed':
      return { title: 'Opponent confirmed', body: `Open ${event} for the latest details.` };
    case 'result_confirmed':
      return { title: 'Result confirmed', body: `Open ${event} for the latest details.` };
    case 'result_corrected':
      return { title: 'Result corrected', body: `Open ${event} for the latest details.` };
    case 'tournament_live':
      return { title: 'Tournament live', body: `Open ${event} for the latest details.` };
    case 'tournament_finished':
      return { title: 'Tournament finished', body: `Open ${event} for the latest details.` };
    case 'event_updated':
      return { title: 'Event updated', body: `Open ${event} for the latest details.` };
    case 'registration_complete':
      return { title: 'Registration complete', body: 'Your 4M Padel player profile is ready.' };
    case 'event_cancelled':
      return { title: 'Event cancelled', body: `${event} has been cancelled. Open the app for details.` };
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
      return {
        title: 'Entry received',
        body: `You’re down for ${event}.`,
      };
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
      return {
        title: 'Draws are up',
        body: `The ${event} draws are ready.`,
      };
    case 'division_changed':
      return {
        title: 'Division updated',
        body: vars.division
          ? `You’re now in ${vars.division} at ${event}.`
          : `Your division at ${event} has changed.`,
      };
    case 'match_reminder':
      return {
        title: 'Match coming up',
        body: `You’re on court soon at ${event}.`,
      };
    case 'ranking_change':
      return {
        title: 'Ranking update',
        body: 'Your ranking has changed. Open Rankings to see the new list.',
      };
    case 'club_announcement':
      return {
        title: 'Club update',
        body: 'There’s a new note from your club.',
      };
  }
}
