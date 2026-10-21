import { supabase } from './supabase';
import { pathFromNotificationData } from './notification-routing';

export const FEED_FILTERS = ['all', 'players', 'matches', 'tournaments'] as const;
export type FeedFilter = typeof FEED_FILTERS[number];
export type ActivityKind = 'entry' | 'result' | 'profile' | 'ranking' | 'match_live' | 'match_schedule' | 'tournament';
export type FeedItem = { id: string; kind: ActivityKind; title: string; body: string; photo: string | null; path: string; payload: Record<string, unknown>; occurredAt: string };
export type FeedCursor = { at: string; id: string };
export type FeedPage = { items: FeedItem[]; hasMore: boolean; cursor: FeedCursor | null };
export function feedScheduleLabel(item: FeedItem): string {
  switch (item.payload.schedule_update) {
    case 'time': return 'MATCH TIME CHANGED';
    case 'court': return 'COURT CHANGED';
    case 'time_and_court': return 'MATCH TIME & COURT CHANGED';
    default: return 'UPCOMING MATCH';
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string' ? v : '';
const kinds = ['entry', 'result', 'profile', 'ranking', 'match_live', 'match_schedule', 'tournament'];
function rankingPosition(value: unknown): number | null {
  const raw = typeof value === 'number' ? String(value) : text(value).trim().replace(/^#/, '');
  const rank = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(rank) && rank > 0 ? rank : null;
}
function photo(v: unknown) { try { const url = new URL(text(v)); return url.protocol === 'https:' ? url.href : null; } catch { return null; } }
export function feedPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value === '/match-result') return value;
  const player = /^\/(?:players|pro\/player)\/([1-9]\d*)$/.exec(value);
  if (player && Number.isSafeInteger(Number(player[1]))) return value;
  if (!/^\/(?:events|pro\/match)\//.test(value)) return null;
  return pathFromNotificationData({ path: value });
}
export function parseFeedPage(value: unknown): FeedPage {
  if (!object(value) || !Array.isArray(value.items) || typeof value.has_more !== 'boolean') throw new Error('Following could not be loaded.');
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  let cursor: FeedCursor | null = null;
  for (const row of value.items) {
    if (!object(row) || !uuid.test(text(row.id)) || !kinds.includes(text(row.kind)) || !text(row.title).trim() || !Number.isFinite(Date.parse(text(row.occurred_at))) || !feedPath(row.path)) throw new Error('Following could not be displayed.');
    // Advance over hidden posts too, so older real updates remain reachable.
    cursor = { at: text(row.occurred_at), id: text(row.id) };
    if (seen.has(text(row.id))) continue;
    seen.add(text(row.id));
    const payload = object(row.payload) ? row.payload : {};
    if (row.kind === 'ranking') {
      const before = rankingPosition(payload.before_rank), rank = rankingPosition(payload.rank);
      if (before === null || rank === null || before === rank) continue;
    }
    items.push({ id: text(row.id), kind: row.kind as ActivityKind, title: text(row.title), body: text(row.body), photo: photo(row.photo_url), path: feedPath(row.path)!, payload, occurredAt: text(row.occurred_at) });
  }
  return { items, hasMore: value.has_more && !!cursor, cursor };
}
export async function fetchFollowingFeed(filter: FeedFilter, limit = 20, cursor: FeedCursor | null = null): Promise<FeedPage> {
  const { data, error } = await supabase.rpc('get_following_feed', { p_filter: filter, p_limit: limit, p_before: cursor?.at ?? null, p_before_id: cursor?.id ?? null });
  if (error) throw new Error('Following could not be loaded. Please retry.');
  return parseFeedPage(data);
}
/** Refresh the visible window so returning from details preserves loaded pages. */
export async function fetchFollowingWindow(filter: FeedFilter, target: number, current: () => boolean = () => true, cursor: FeedCursor | null = null): Promise<FeedPage> {
  let page = await fetchFollowingFeed(filter, Math.min(50, target), cursor);
  while (page.hasMore && page.cursor && page.items.length < target && current()) {
    const next = await fetchFollowingFeed(filter, Math.min(50, target - page.items.length), page.cursor);
    if (next.cursor?.id === page.cursor.id && next.cursor.at === page.cursor.at) throw new Error('Following could not be loaded. Please retry.');
    page = { ...next, items: [...new Map([...page.items, ...next.items].map(item => [item.id, item])).values()] };
  }
  return page;
}
export function feedScores(item: FeedItem): { teams: [string, string]; scores: (number | string)[][]; winner: number | null; summary: boolean; points: boolean } | null {
  const { teams, scores, winner } = item.payload;
  if (!Array.isArray(teams) || teams.length !== 2 || teams.some(v => typeof v !== 'string' || !v.trim())) return null;
  const valid = Array.isArray(scores) ? scores.filter((v): v is (number | string)[] => Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number' ? Number.isInteger(n) && n >= 0 && n <= 99 : typeof n === 'string' && /^\d{1,2}(\(\d{1,2}\))?$/.test(n))).slice(0, 5) : [];
  return { teams: teams as [string, string], scores: valid, winner: winner === 0 || winner === 1 ? winner : null, summary: item.payload.is_summary === true, points: item.payload.score_unit === 'points' };
}
export type FeedPlayer = { name: string; photo: string | null; country: string | null };
function feedPlayer(value: unknown): FeedPlayer | null {
  if (!object(value) || !text(value.name).trim()) return null;
  const country = text(value.nationality).trim().toUpperCase();
  return { name: text(value.name).trim().slice(0, 200), photo: photo(value.photo_url), country: /^[A-Z]{2}$/.test(country) ? country : null };
}
export function feedActors(item: FeedItem): FeedPlayer[] {
  return Array.isArray(item.payload.actors) ? item.payload.actors.map(feedPlayer).filter((p): p is FeedPlayer => !!p).slice(0, 4) : [];
}
export function feedParticipants(item: FeedItem): FeedPlayer[][] {
  const scores = feedScores(item);
  if (!scores) return [];
  const participants = item.payload.participants;
  return scores.teams.map((team, i) => {
    const players = Array.isArray(participants) && Array.isArray(participants[i]) ? participants[i].map(feedPlayer).filter((p): p is FeedPlayer => !!p).slice(0, 2) : [];
    return players.length ? players : team.split(' / ').slice(0, 2).map(name => ({ name, photo: null, country: null }));
  });
}
export function feedEventPhoto(item: FeedItem): string | null { return photo(item.payload.event_image_url); }
/** The RPC supplies the current deadline; historical notification copy is never a timer source. */
export function feedDeadline(item: FeedItem): string | null {
  if (item.kind !== 'tournament') return null;
  const changes = item.payload.changes;
  const relevant = ['registration_open', 'registration_closing', 'registration_closed', 'early_bird_ending'].includes(text(item.payload.update_type))
    || Array.isArray(changes) && changes.some(change => object(change) && ['registration_closes_at', 'registration_opens_at'].includes(text(change.field)));
  const value = text(item.payload.registration_closes_at), at = Date.parse(value);
  return relevant && Number.isFinite(at) && new Date(at).getUTCFullYear() > 2000 ? new Date(at).toISOString() : null;
}
export function feedCountdown(deadline: string, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
  if (!Number.isFinite(seconds)) return null;
  return { closed: seconds === 0, days: Math.floor(seconds / 86400), hours: Math.floor(seconds % 86400 / 3600), minutes: Math.floor(seconds % 3600 / 60), seconds: seconds % 60 };
}
/** Rebuild the allowed match payload rather than forwarding arbitrary server JSON to a route. */
export function feedMatchResult(item: FeedItem): string | null {
  const row = item.payload.rankedin_match;
  const scored = feedScores(item);
  if (!scored || !object(row) || !object(row.Info) || !object(row.Score)) return null;
  const side = (key: string) => object(row.Info) && object(row.Info[key]) ? { Name: text((row.Info[key] as Record<string, unknown>).Name) } : { Name: '' };
  return JSON.stringify({ Info: { EventName: text(row.Info.EventName), Date: text(row.Info.Date), Court: text(row.Info.Court), Challenger: { ...side('Challenger'), IsWinner: scored.winner === 0 }, Challenger1: side('Challenger1'), Challenged: { ...side('Challenged'), IsWinner: scored.winner === 1 }, Challenged1: side('Challenged1') }, Score: { IsSummary: scored.summary, Score: scored.scores.map(set => ({ Score1: set[0], Score2: set[1] })) } });
}
export function feedTime(at: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(at)) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return new Date(at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}
