import { supabase } from '@/lib/supabase';
import { LIVE_AFTER_MS } from '@/lib/when';

const RANKEDIN_PROFILE =
  'https://api.rankedin.com/v1/player/playerprofileinfoasync';
const RANKEDIN_MATCHES = 'https://api.rankedin.com/v1/player/GetPlayerMatchesAsync';
const CACHE_MS = 5 * 60 * 1000;

export type MatchSide = {
  Name?: string | null;
  IsWinner?: boolean;
};

export type PlayerMatch = {
  Info?: {
    EventName?: string | null;
    Date?: string | null;
    EventStartDate?: string | null;
    Challenger?: MatchSide;
    Challenger1?: MatchSide;
    Challenged?: MatchSide;
    Challenged1?: MatchSide;
    Court?: string | null;
    Location?: string | null;
    Venue?: string | null;
    IsWinner?: boolean;
  };
  Score?: {
    Score?: { Score1: number; Score2: number }[];
    IsSummary?: boolean;
  };
};

export type MatchLists = {
  upcoming: PlayerMatch[];
  past: PlayerMatch[];
};

const EMPTY: MatchLists = { upcoming: [], past: [] };

export async function fetchPlayerMatches(rankedinId?: string | null): Promise<MatchLists> {
  if (!rankedinId) return EMPTY;

  const cached = await readCache(rankedinId);
  const live = cached.upcomingFresh && cached.pastFresh
    ? {}
    : await fetchLive(rankedinId, !cached.upcomingFresh, !cached.pastFresh);
  const upcoming = live.upcoming ?? cached.upcoming;
  // An empty/placeholder history response must not erase previously published results.
  const past = live.past?.length ? preservePublishedScores(live.past, cached.past) : cached.past;
  return {
    upcoming: splitUpcoming(upcoming),
    past: mergePast(past, upcoming).slice(0, 15),
  };
}

function preservePublishedScores(live: PlayerMatch[], saved: PlayerMatch[]) {
  return live.map(match => {
    if (match.Score?.Score?.length) return match;
    const candidates = saved.filter(old => matchKey(old, 0) === matchKey(match, 0));
    return candidates.length === 1 && candidates[0].Score?.Score?.length
      ? { ...match, Score: candidates[0].Score }
      : match;
  });
}

export function parseMatchDate(dateStr?: string | null) {
  if (!dateStr) return new Date(0);
  const raw = String(dateStr).trim();
  if (raw.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const iso = new Date(raw);
    return Number.isNaN(iso.getTime()) ? new Date(0) : iso;
  }
  const match = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (match) {
    const [, day, month, year, hours = '0', mins = '0', secs = '0'] = match;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(mins),
      Number(secs)
    );
  }
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

export function matchKey(match: PlayerMatch, index: number) {
  const info = match.Info || {};
  return `${info.EventName || 'match'}|${info.Date || ''}|${info.Challenger?.Name || ''}|${info.Challenged?.Name || ''}|${info.Challenger1?.Name || ''}|${info.Challenged1?.Name || ''}|${index}`;
}

export function isMatchWinner(match: PlayerMatch) {
  const info = match.Info || {};
  if (info.IsWinner !== undefined) return info.IsWinner;
  return info.Challenger?.IsWinner;
}

function isRealMatch(match: PlayerMatch) {
  const name = match.Info?.EventName;
  return Boolean(name && name !== 'EventName');
}

function splitUpcoming(matches: PlayerMatch[]) {
  const now = Date.now();
  return matches
    .filter(isRealMatch)
    .filter((match) => parseMatchDate(match.Info?.Date).getTime() + LIVE_AFTER_MS >= now)
    .sort((a, b) => parseMatchDate(a.Info?.Date).getTime() - parseMatchDate(b.Info?.Date).getTime());
}

function mergePast(past: PlayerMatch[], upcoming: PlayerMatch[]) {
  const now = Date.now();
  const list = past.filter(isRealMatch);
  const keys = new Set(list.map((match) => matchKey(match, 0)));
  upcoming.filter(isRealMatch).forEach((match) => {
    if (parseMatchDate(match.Info?.Date).getTime() + LIVE_AFTER_MS >= now) return;
    const key = matchKey(match, 0);
    if (keys.has(key)) return;
    keys.add(key);
    list.push(match);
  });
  return list.sort(
    (a, b) => parseMatchDate(b.Info?.Date).getTime() - parseMatchDate(a.Info?.Date).getTime()
  );
}

type CachedMatches = MatchLists & { upcomingFresh: boolean; pastFresh: boolean };
const EMPTY_CACHE: CachedMatches = { ...EMPTY, upcomingFresh: false, pastFresh: false };

async function readCache(rankedinId: string): Promise<CachedMatches> {
  try {
    const { data, error } = await supabase
      .from('player_matches')
      .select('upcoming_matches, past_matches, upcoming_matches_updated_at, past_matches_updated_at, updated_at')
      .eq('rankedin_id', rankedinId)
      .maybeSingle();
    if (error || !data) return EMPTY_CACHE;
    const upcoming = validList(data.upcoming_matches);
    const past = validList(data.past_matches);
    return {
      upcoming: upcoming || [], past: past || [],
      upcomingFresh: upcoming !== null && isFresh(data.upcoming_matches_updated_at || data.updated_at),
      pastFresh: past !== null && isFresh(data.past_matches_updated_at || data.updated_at),
    };
  } catch {
    return EMPTY_CACHE;
  }
}

function validList(payload: unknown): PlayerMatch[] | null {
  if (!Array.isArray(payload)) return null;
  const matches = payload.filter(match => match && isRealMatch(match));
  return payload.length && !matches.length ? null : matches;
}

function isFresh(stamp?: string | null) {
  if (!stamp) return false;
  const age = Date.now() - Date.parse(stamp);
  return Number.isFinite(age) && age >= 0 && age < CACHE_MS;
}

async function fetchJson(url: string, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`RankedIn returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLive(rankedinId: string, upcoming: boolean, past: boolean): Promise<Partial<MatchLists>> {
  try {
    const [profile, layout] = await Promise.all([
      fetchJson(`${RANKEDIN_PROFILE}?rankedinId=${encodeURIComponent(rankedinId)}&language=en`),
      fetchJson('https://api.rankedin.com/v1/player/getlayoutinfoasync?language=en').catch(() => null),
    ]);
    const internalId = profile.Id || profile.Header?.PlayerId;
    if (!internalId) return {};
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (layout?.AnonymousToken) headers['x-anonymous-token'] = layout.AnonymousToken;
    const load = async (history: boolean) => {
      try {
        const data = await fetchJson(`${RANKEDIN_MATCHES}?playerid=${internalId}&takehistory=${history}&skip=0&take=${history ? 40 : 20}&language=en`, headers);
        return validList(data.Payload) ?? undefined;
      } catch { return undefined; }
    };
    const [upcomingList, pastList] = await Promise.all([
      upcoming ? load(false) : undefined,
      past ? load(true) : undefined,
    ]);
    return { upcoming: upcomingList, past: pastList };
  } catch {
    return {};
  }
}
