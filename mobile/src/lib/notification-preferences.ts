import { supabase } from './supabase';
import type { NotificationType } from './notification-events';

export type NotificationToggle = NotificationType | 'push_enabled' | 'followed_events' | 'quiet_hours_enabled';
export type NotificationPreferences = Partial<Record<NotificationToggle, boolean>> & { reminder_minutes?: number; quiet_start?: number; quiet_end?: number; timezone?: string };
export const NOTIFICATION_GROUPS: { title: string; items: { key: NotificationToggle; label: string; detail: string }[] }[] = [
  { title: 'Your account and entries', items: [
    { key: 'registration_complete', label: 'Account registration', detail: 'Confirmation when your player profile is created.' },
    { key: 'event_registration', label: 'Tournament entries', detail: 'Confirmation when you enter a tournament.' },
    { key: 'division_changed', label: 'Division changes', detail: 'Updates to the division you’re playing in.' },
  ] },
  { title: 'Partners', items: [
    { key: 'partner_entry_paid', label: 'Entered by a partner', detail: 'When another player enters you into a tournament.' },
    { key: 'partner_assigned', label: 'Partner changes', detail: 'When a partner is linked to or removed from your entry.' },
    { key: 'partner_invite', label: 'Partner invitations', detail: 'Invitations to play together.' },
    { key: 'entry_withdrawn', label: 'Withdrawals', detail: 'Your withdrawal confirmation and partner withdrawals.' },
  ] },
  { title: 'Tournament stages', items: [
    { key: 'followed_events', label: 'Followed tournaments', detail: 'Updates for events you follow before entering.' },
    { key: 'registration_open', label: 'Registration opens', detail: 'When a followed tournament opens for entries.' },
    { key: 'early_bird_ending', label: 'Early bird deadlines', detail: 'A reminder before early bird pricing ends.' },
    { key: 'registration_closing', label: 'Entry deadlines', detail: 'A reminder before entries close.' },
    { key: 'registration_closed', label: 'Registration closed', detail: 'Confirmation after entries close.' },
    { key: 'event_updated', label: 'Tournament changes', detail: 'Changed dates, venue or entry deadlines.' },
    { key: 'tournament_live', label: 'Tournament day updates', detail: 'Your first match tomorrow and when your match starts.' },
    { key: 'tournament_finished', label: 'Final results', detail: 'When your division’s results are finalised.' },
    { key: 'ranking_change', label: 'Ranking points', detail: 'Awarded or corrected points and published ranking changes.' },
  ] },
  { title: 'Your matches', items: [
    { key: 'schedule_published', label: 'Schedule published', detail: 'Your confirmed court and match time.' },
    { key: 'schedule_changed', label: 'Schedule changes', detail: 'Changes to your court or time, including cancellations.' },
    { key: 'match_reminder', label: 'Match reminders', detail: 'A reminder before each scheduled match.' },
    { key: 'match_progression', label: 'Next round', detail: 'When you are placed in your next match.' },
    { key: 'opponent_confirmed', label: 'Opponent confirmed', detail: 'When your next opponent is known.' },
    { key: 'result_confirmed', label: 'Match results', detail: 'When your score is confirmed.' },
    { key: 'result_corrected', label: 'Result corrections', detail: 'When an organiser corrects your result.' },
  ] },
  { title: 'Payments and events', items: [
    { key: 'payment_reminder', label: 'Payment deadlines', detail: 'A reminder for unpaid entries before their deadline.' },
    { key: 'payment_confirmation', label: 'Payment confirmations', detail: 'When your entry payment is received.' },
    { key: 'entry_refunded', label: 'Refunds', detail: 'Updates when your entry is refunded.' },
    { key: 'event_cancelled', label: 'Cancellations', detail: 'When your event or division is cancelled.' },
    { key: 'draws_ready', label: 'Draws published', detail: 'When your tournament draw is ready.' },
  ] },
];
export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const { data, error } = await supabase.rpc('get_notification_preferences');
  if (error) throw error;
  return data ?? {};
}
export async function saveNotificationPreference(key: NotificationToggle, enabled: boolean) {
  const { error } = await supabase.rpc('set_notification_pref', { p_type: key, p_enabled: enabled });
  if (error) throw error;
}

export async function saveNotificationTiming(prefs: NotificationPreferences) {
  const { error } = await supabase.rpc('set_notification_timing', {
    p_minutes: prefs.reminder_minutes ?? 30,
    p_start: prefs.quiet_start ?? 22,
    p_end: prefs.quiet_end ?? 7,
    p_timezone: prefs.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Africa/Johannesburg',
  });
  if (error) throw error;
}
