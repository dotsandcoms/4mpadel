import { supabase } from './supabase';
import { searchProPlayers } from './player-hub';
import { clubLocation, fetchClubs, fetchClubGroups, filterClubs, filterClubGroups } from './clubs';
import type { CalendarEvent } from './home';

export type SearchKind = 'events' | 'players' | 'clubs' | 'organisations';
export type SearchResult = { key: string; kind: SearchKind; title: string; subtitle: string; detail: string; image: string | null; path: string; website?: boolean; event?: Pick<CalendarEvent, 'sapa_status' | 'event_name'>; search?: string };
export type DirectorySection = { kind: Exclude<SearchKind, 'events'>; items: SearchResult[]; error: boolean; limited: boolean };
export const SEARCH_LIMIT = 20;
export const searchTerm = (query: string) => query.trim().replace(/\s+/g, ' ').slice(0, 80);
const str = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const photo = (value: unknown) => { try { const url = new URL(str(value)); return url.protocol === 'https:' ? url.href : null; } catch { return null; } };
export const searchPattern = (query: string) => `%${searchTerm(query).replace(/[\\%_]/g, '\\$&')}%`;
const slugPath = (prefix: string, value: unknown) => { const slug = str(value); return slug && slug.length <= 200 ? `/${prefix}/${encodeURIComponent(slug)}` : null; };

/** Bounded public lookups, independently delivered. No private profile fields. */
export async function searchDirectory(query: string, international: boolean, signal: AbortSignal, receive: (section: DirectorySection) => void): Promise<void> {
  const term = searchTerm(query);
  if (term.length < 2 || signal.aborted) return;
  const pattern = searchPattern(term);
  const load = async (kind: DirectorySection['kind'], request: () => PromiseLike<SearchResult[]>) => {
    try {
      const items = await request();
      if (!signal.aborted) receive({ kind, items: items.slice(0, SEARCH_LIMIT), limited: items.length >= SEARCH_LIMIT, error: false });
    } catch { if (!signal.aborted) receive({ kind, items: [], limited: false, error: true }); }
  };
  await Promise.all([
    load('players', async () => {
      if (international) {
        const result = await searchProPlayers(term, 'all', 1, undefined, signal);
        return result.players.filter(player => Number.isSafeInteger(player.id) && player.id > 0).map(player => ({ key: `pro:${player.id}`, kind: 'players' as const, title: player.name, subtitle: 'FIP player', detail: player.nationality || '', image: photo(player.photoUrl), path: `/pro/player/${player.id}` }));
      }
      const { data, error } = await supabase.from('players_public').select('id,name,image_url,home_club').ilike('name', pattern).order('name').order('id').limit(SEARCH_LIMIT).abortSignal(signal);
      if (error) throw error;
      return (data ?? []).filter(row => Number.isSafeInteger(Number(row.id)) && Number(row.id) > 0 && str(row.name)).map(row => ({ key: `player:${row.id}`, kind: 'players' as const, title: str(row.name), subtitle: '4M player', detail: str(row.home_club), image: photo(row.image_url), path: `/players/${row.id}` }));
    }),
    load('clubs', async () => {
      const [clubs, groups] = await Promise.all([fetchClubs(signal), fetchClubGroups(signal)]);
      return [
        ...filterClubGroups(groups, term).map(group => ({ key: `club-group:${group.id}`, kind: 'clubs' as const, title: group.name, subtitle: 'Club group', detail: `${clubs.filter(club => club.groupId === group.id).length} venues`, image: group.logo, path: `/club-groups/${encodeURIComponent(group.slug)}` })),
        ...filterClubs(clubs, term, null, 0).map(({ club }) => ({ key: `club:${club.id}`, kind: 'clubs' as const, title: club.name, subtitle: 'Club', detail: clubLocation(club), image: club.logo, path: `/clubs/${encodeURIComponent(club.slug)}` })),
      ];
    }),
    load('organisations', async () => {
      const { data, error } = await supabase.from('organisations').select('id,name,slug,logo_url,org_type,coverage').eq('status', 'approved').ilike('name', pattern).order('name').order('id').limit(SEARCH_LIMIT).abortSignal(signal);
      if (error) throw error;
      return (data ?? []).flatMap(row => { const path = slugPath('organisations', row.slug); return path && str(row.name) ? [{ key: `organisation:${row.id}`, kind: 'organisations' as const, title: str(row.name), subtitle: 'Organisation', detail: [str(row.org_type), str(row.coverage)].filter(Boolean).join(' · '), image: photo(row.logo_url), path, website: true }] : []; });
    }),
  ]);
}

/** Current/upcoming events lead discovery; past events remain searchable. */
export function sortSearchEvents(events: CalendarEvent[], today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date())) {
  const date = (value: string | null | undefined) => value?.slice(0, 10) || '';
  const bucket = (event: CalendarEvent) => date(event.start_date) && date(event.end_date || event.start_date) >= today ? date(event.start_date) <= today ? 0 : 1 : 2;
  return [...events].sort((a, z) => bucket(a) - bucket(z) || (bucket(a) === 2 ? date(z.start_date).localeCompare(date(a.start_date)) : date(a.start_date).localeCompare(date(z.start_date))));
}
