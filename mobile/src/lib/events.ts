import { supabase } from './supabase';
import { featuredBackgroundSource, type CalendarEvent } from './home';

export type EventDetail = CalendarEvent & {
  collect_tshirt_size?: boolean; allow_tshirt_logo_upload?: boolean; allow_tshirt_sponsor_name?: boolean;
  image?: string | null;
  event_dates?: string | null;
  organisation_id?: string | null;
  sponsor_logos?: string[] | null;
  is_quick_event?: boolean | null;
  indoor_outdoor?: string | null;
  courts?: string | null;
  address?: string | null;
  balls?: string | null;
  draw_released?: string | null;
  cut_off_times?: string | null;
  tournament_director?: string | null;
  referees?: string | null;
  prize_money_total?: number | null;
  prize_money_breakdown?: unknown;
  points_breakdown?: string | null;
  rules_regs?: string | null;
  sanctioning_details?: string | null;
  withdrawal_substitution?: string | null;
  youtube_playlist_url?: string | null;
  gallery_album_id?: string | null;
  max_players?: number | null;
  default_match_format?: string | null;
  rankings_updated_at?: string | null;
  description?: string | null;
  event_status?: string | null;
  is_visible?: boolean | null;
  sanction_status?: string | null;
  is_weekly?: boolean | null;
  is_league?: boolean | null;
  image_url?: string | null;
  custom_image_url?: string | null;
  poster_image_url?: string | null;
  early_bird_fee?: number | string | null;
  early_bird_ends_at?: string | null;
  registration_access?: string | null;
  organiser_phone?: string | null;
  organiser_email?: string | null;
  contact_details?: string | null;
  payment_method?: string | null;
  payment_instructions?: string | null;
  payment_bank_name?: string | null;
  payment_account_name?: string | null;
  payment_account_number?: string | null;
  payment_branch_code?: string | null;
  payment_reference_note?: string | null;
  external_payment_url?: string | null;
  venues?: string[] | null;
  back_draw_options?: string | null;
  max_teams_capacity?: number | null;
  scoring_point?: string | null;
  golden_point?: boolean | null;
  start_time?: string | null;
  end_time?: string | null;
};
export type Division = {
  id: string;
  event_id: number;
  name: string;
  entry_fee?: number | string | null;
  entries_close_at?: string | null;
  license_required?: boolean;
  format?: string | null;
  gender?: string | null;
  age_category?: string | null;
  details?: string | null;
  is_active?: boolean;
  seeding_ranking_source?: string | null;
};
export type EntryBalance = { registrationId: string; known: boolean; paid: number | null; price: number; due: number | null };
export type EventRegistration = {
  balance?: EntryBalance;
  registered_by?: string | null;
  tshirt_size?: string | null;
  tshirt_logo_url?: string; tshirt_sponsor_name?: string;
  id: string;
  division: string;
  division_id: string | null;
  full_name: string;
  email: string;
  partner_name: string | null;
  partner_email: string | null;
  payment_status: string | null;
  partner_payment_status: string | null;
  status: string;
};

/** Calendar.jsx's publication filters, paginated to avoid Supabase's row cap. */
export async function fetchCalendarEvents(): Promise<EventDetail[]> {
  const events: EventDetail[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('calendar').select('*')
      .neq('is_visible', false)
      .or('sanction_status.eq.approved,sanction_status.is.null')
      .order('start_date', { ascending: true }).order('id', { ascending: true })
      .range(offset, offset + 499);
    if (error) throw error;
    events.push(...data as EventDetail[]);
    if (data.length < 500) break;
  }
  const manualIds = events.filter(event => event.is_manual).map(event => event.id);
  const counts = new Map<number, number>();
  for (let start = 0; start < manualIds.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('event_registrations_public').select('id, event_id')
        .in('event_id', manualIds.slice(start, start + 100)).order('id').range(offset, offset + 499);
      if (error) throw error;
      for (const row of data) counts.set(Number(row.event_id), (counts.get(Number(row.event_id)) || 0) + 1);
      if (data.length < 500) break;
    }
  }
  return events.map(event => event.is_manual ? { ...event, registered_players: counts.get(event.id) || 0 } : event);
}

export async function fetchEvent(identifier: string): Promise<EventDetail> {
  const query = supabase.from('calendar').select('*')
    .neq('is_visible', false).or('sanction_status.eq.approved,sanction_status.is.null');
  const { data, error } = await (/^\d+$/.test(identifier)
    ? query.eq('id', Number(identifier)) : query.eq('slug', identifier)).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This event is no longer available. Browse the calendar for other events.');
  return data as EventDetail;
}

export async function fetchDivisions(eventId: number): Promise<Division[]> {
  const { data, error } = await supabase.from('tournament_divisions')
    .select('id, event_id, name, entry_fee, format, entries_close_at, license_required, age_category, gender, sort_order, is_active, details, seeding_ranking_source')
    .eq('event_id', eventId).eq('is_active', true).order('sort_order');
  if (error) throw error;
  return data as Division[];
}

export async function currentEmail() {
  const { data, error } = await supabase.auth.getUser();
  if (error?.name === 'AuthSessionMissingError') return null;
  if (error) throw error;
  return data.user?.email?.toLowerCase() ?? null;
}

export async function fetchScheduledIds(email: string): Promise<number[]> {
  const { data, error } = await supabase.from('player_schedule_events')
    .select('event_id').ilike('user_email', email);
  if (error) throw error;
  return data.map(row => Number(row.event_id));
}

/** Mirrors website playerSchedule.js. Does not remove a tournament registration. */
export async function setEventScheduled(eventId: number, saved: boolean) {
  const email = await currentEmail();
  if (!email) throw new Error('Sign in to save events to your schedule.');
  if (!saved) {
    const { error } = await supabase.from('player_schedule_events').delete()
      .ilike('user_email', email).eq('event_id', eventId);
    if (error) throw error;
    return;
  }
  const { data: existing, error: lookupError } = await supabase.from('player_schedule_events')
    .select('id').ilike('user_email', email).eq('event_id', eventId).maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return;
  const { error } = await supabase.from('player_schedule_events')
    .insert({ user_email: email, event_id: eventId });
  if (error && error.code !== '23505') throw error;
}

export async function fetchMyEventRegistrations(eventId: number, email: string) {
  const { data, error } = await supabase.from('event_registrations').select('*')
    .eq('event_id', eventId).ilike('email', email).neq('status', 'withdrawn');
  if (error) throw error;
  return data as EventRegistration[];
}

export type PublicEntry = { id: string; full_name: string; partner_name: string | null; division: string; division_id: string | null; email_hash?: string; partner_email_hash?: string; registered_by_hash?: string; status?: string };
export type EventOrganisation = { name: string; logo_url: string | null; slug: string | null };
export async function fetchPublicEntries(eventId: number): Promise<PublicEntry[]> {
  const entries: PublicEntry[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('event_registrations_public')
      .select('id, full_name, partner_name, division, division_id, email_hash, partner_email_hash, registered_by_hash, status').eq('event_id', eventId).range(offset, offset + 499);
    if (error) throw error;
    entries.push(...data as PublicEntry[]);
    if (data.length < 500) return entries;
  }
}
export async function fetchEventOrganisation(id?: string | null): Promise<EventOrganisation | null> {
  if (!id) return null;
  const { data, error } = await supabase.from('organisations').select('name, logo_url, slug').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
export async function fetchDrawStatus(event: EventDetail) {
  if (event.is_manual) {
    const { data, error } = await supabase.from('draws').select('id, status').eq('event_id', event.id).in('status', ['published', 'in_progress', 'completed']);
    if (error) throw error;
    const started = data.length ? await supabase.from('draw_matches').select('id', { count: 'exact', head: true }).in('draw_id', data.map(row => row.id)).in('status', ['in_progress', 'completed', 'walkover', 'retired']) : { count: 0, error: null };
    if (started.error) throw started.error;
    return { hasDraw: data.length > 0, hasResults: data.some(row => row.status === 'completed'), isFinished: data.length > 0 && data.every(row => row.status === 'completed'), isLive: (started.count ?? 0) > 0 };

  }
  const { data, error } = await supabase.from('rankedin_results_cache').select('has_draw, has_results').eq('event_id', event.id).maybeSingle();
  if (error) throw error;
  return { hasDraw: !!data?.has_draw, hasResults: !!data?.has_results, isFinished: false, isLive: false };
}

/** Same precedence as website imageUtils.getEventImage. */
export function eventImage(event: EventDetail) {
  const uri = event.image || event.custom_image_url || event.poster_image_url || event.image_url;
  return uri ? { uri } : featuredBackgroundSource(event);
}

/** Same public ranking fields consumed by the website's event seeding. */
export async function fetchEventPlayerRankings(): Promise<import('./event-teams').RankedPlayer[]> {
  const players: import('./event-teams').RankedPlayer[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('players_public')
      .select('id, name, image_url, rankedin_id, rankings, points, rank_label, preferred_ranking, active_ranking_label, category, gender')
      .order('id').range(offset, offset + 999);
    if (error) throw error;
    players.push(...data);
    if (data.length < 1000) return players;
  }
}


export { fetchEntryBalances } from './entry-balances';
