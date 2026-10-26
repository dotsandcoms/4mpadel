/** Analytics accepts product categories and counts, never free-form account or route data. */
export const EVENT_FIELDS = {
  login: ['method'], sign_up: ['method'], logout: [],
  tutorial_complete: [], profile_completed: [], profile_updated: ['photo_changed'],
  begin_checkout: ['item_category', 'currency', 'value'],
  registration_complete: ['payment_state', 'item_count'],
  payment_confirmed: ['item_category'],
  schedule_change: ['enabled'], player_follow: ['enabled', 'content_type'],
  match_bookmark: ['enabled', 'notify'],
  notification_permission: ['permission'], notification_open: ['destination'],
  search_performed: ['content_type', 'result_count', 'query_length'],
  share: ['content_type', 'method'], support_opened: ['content_type'],
  content_view: ['content_type', 'content_id'],
  feature_interaction: ['feature', 'action', 'selection'],
  registration_step: ['step', 'flow', 'item_count'],
  checkout_outcome: ['item_category', 'status'],
  checkout_exit: ['step', 'flow'],
  action_error: ['feature'],
  notification_preference: ['preference', 'enabled'],
  notification_timing_changed: ['timing_field'],
} as const;

export type AnalyticsEvent = keyof typeof EVENT_FIELDS;
export type PurchaseKind = 'event_registration' | 'entry_balance' | 'licence_full' | 'licence_temporary';
export const PURCHASE_KINDS: readonly PurchaseKind[] = ['event_registration', 'entry_balance', 'licence_full', 'licence_temporary'];

const SCREENS: Record<string, string> = {
  '': 'home', index: 'home', calendar: 'events', 'events/[id]': 'event_details',
  explore: 'explore', profile: 'my_profile', rankings: 'rankings',
  onboarding: 'onboarding', 'sign-in': 'sign_in', 'complete-profile': 'complete_profile',
  settings: 'account_settings', 'edit-profile': 'edit_profile', 'delete-account': 'delete_account',
  license: 'sapa_licence', payments: 'payments', 'my-entries': 'my_entries',
  'events/register': 'event_registration', 'events/pay-balance': 'entry_balance',
  'events/switch-division': 'switch_division', following: 'following',
  notifications: 'notifications', 'notification-settings': 'notification_settings',
  'players/index': 'players', 'players/[id]': 'player_profile',
  'pro-padel': 'pro_padel', 'pro/live': 'pro_live', 'pro/match/[id]': 'pro_match',
  'pro/player/[id]': 'pro_player', 'pro/tournament/[id]': 'pro_tournament',
  'pro/fip/[id]/index': 'fip_tournament', 'pro/fip/[id]/document': 'fip_document',
  'media/index': 'media', 'media/[id]': 'media_album', 'calendar/[id]': 'calendar_event',
  search: 'event_search', help: 'help', legal: 'legal', 'reset-password': 'reset_password',
  'match-result': 'match_result',
};

/** Receives Expo Router segments, whose dynamic parts are templates such as [id]. */
export function analyticsScreen(segments: string): string {
  const route = segments.split('/').filter(part => part && !/^\(.*\)$/.test(part)).join('/');
  return SCREENS[route] ?? 'other';
}

const ENUMS: Record<string, readonly string[]> = {
  method: ['password', 'google', 'apple', 'native'],
  item_category: PURCHASE_KINDS,
  currency: ['ZAR'], payment_state: ['paid', 'pending'],
  content_type: ['events', 'local_player', 'pro_player', 'pro_match', 'tournament', 'support', 'players', 'rankings', 'media', 'media_album', 'fip_document'],
  permission: ['granted', 'denied', 'undetermined', 'unavailable'],
  destination: [...new Set(Object.values(SCREENS)), 'other'],
  feature: ['event_details', 'event_calendar', 'rankings', 'player_hub', 'pro_live', 'following_feed', 'media', 'licence', 'registration', 'entry_balance', 'authentication', 'profile', 'match_detail', 'notifications'],
  action: ['tab', 'filter', 'refresh', 'photo_open', 'video_open', 'document_open', 'calendar_export', 'directions_open', 'external_registration', 'retry'],
  selection: ['overview', 'activity', 'players', 'draws', 'results', 'media', 'discover', 'following', 'rankings', 'tour', 'all', '4m', 'pro', 'sa', 'men', 'women', 'past', 'upcoming', 'saved', 'live', 'finished', 'all_days', 'specific_day', 'all_rounds', 'specific_round', 'all_tiers', 'specific_tier', 'all_cities', 'specific_city', 'full', 'temporary', 'featured', 'sapa', 'grand_tour', 'broll', 'leagues', 'tournaments', 'summary', 'points', 'h2h', 'matches', 'major', 'super_gold', 'gold', 'silver', 'bronze', 'fip_event'],
  flow: ['register', 'pay'], status: ['unconfirmed', 'browser_returned', 'opened'],
  preference: ['push_enabled', 'quiet_hours_enabled', 'followed_events', 'registration_complete', 'event_registration', 'division_changed', 'partner_entry_paid', 'partner_assigned', 'partner_invite', 'entry_withdrawn', 'registration_open', 'early_bird_ending', 'registration_closing', 'registration_closed', 'event_updated', 'tournament_live', 'tournament_finished', 'ranking_change', 'pro_match_live', 'schedule_published', 'schedule_changed', 'match_reminder', 'match_progression', 'opponent_confirmed', 'result_confirmed', 'result_corrected', 'payment_reminder', 'payment_confirmation', 'entry_refunded', 'event_cancelled', 'draws_ready'],
  timing_field: ['reminder_minutes', 'quiet_start', 'quiet_end'],
};

export function safeAnalyticsParams(name: AnalyticsEvent, input: Record<string, unknown> = {}) {
  const result: Record<string, string | number | boolean> = {};
  for (const key of EVENT_FIELDS[name] ?? []) {
    const value = input[key];
    if (ENUMS[key]?.includes(value as string)) result[key] = value as string;
    else if (key === 'content_id' && typeof value === 'string' && /^(event|tournament|pro_match):[1-9]\d{0,11}$/.test(value)) result[key] = value;
    else if (key === 'step' && typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4) result[key] = value;
    else if (['enabled', 'notify', 'photo_changed'].includes(key) && typeof value === 'boolean') result[key] = value;
    else if (['value', 'item_count', 'result_count', 'query_length'].includes(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e9) result[key] = value;
  }
  return result;
}
