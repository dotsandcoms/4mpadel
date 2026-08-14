import { supabase } from '@/lib/supabase';

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
  const upcoming = splitUpcoming(cached.upcoming);
  const past = mergePast(cached.past, cached.upcoming);

  if (upcoming.length || past.length) {
    return { upcoming, past: past.slice(0, 15) };
  }

  const live = await fetchLive(rankedinId);
  return {
    upcoming: splitUpcoming(live.upcoming),
    past: mergePast(live.past, live.upcoming).slice(0, 15),
  };
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

export function matchDayParts(dateStr?: string | null) {
  const date = parseMatchDate(dateStr);
  if (!date.getTime()) return { day: '–', month: '', weekday: '' };
  return {
    day: String(date.getDate()),
    month: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date).toUpperCase(),
    weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date).toUpperCase(),
  };
}

export function matchKey(match: PlayerMatch, index: number) {
  const info = match.Info || {};
  return `${info.EventName || 'match'}|${info.Date || ''}|${info.Challenger?.Name || ''}|${info.Challenged?.Name || ''}|${index}`;
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
    .filter((match) => parseMatchDate(match.Info?.Date).getTime() >= now)
    .sort((a, b) => parseMatchDate(a.Info?.Date).getTime() - parseMatchDate(b.Info?.Date).getTime());
}

function mergePast(past: PlayerMatch[], upcoming: PlayerMatch[]) {
  const now = Date.now();
  const list = past.filter(isRealMatch);
  const keys = new Set(list.map((match) => matchKey(match, 0)));
  upcoming.filter(isRealMatch).forEach((match) => {
    if (parseMatchDate(match.Info?.Date).getTime() >= now) return;
    const key = matchKey(match, 0);
    if (keys.has(key)) return;
    keys.add(key);
    list.push(match);
  });
  return list.sort(
    (a, b) => parseMatchDate(b.Info?.Date).getTime() - parseMatchDate(a.Info?.Date).getTime()
  );
}

async function readCache(rankedinId: string): Promise<MatchLists> {
  try {
    const { data, error } = await supabase
      .from('player_matches')
      .select(
        'upcoming_matches, past_matches, upcoming_matches_updated_at, past_matches_updated_at, updated_at'
      )
      .eq('rankedin_id', rankedinId)
      .maybeSingle();
    if (error || !data) return EMPTY;

    const upcoming = freshList(
      data.upcoming_matches,
      data.upcoming_matches_updated_at || data.updated_at
    );
    const past = freshList(data.past_matches, data.past_matches_updated_at || data.updated_at);
    return { upcoming, past };
  } catch {
    return EMPTY;
  }
}

function freshList(payload: unknown, stamp: string | null) {
  if (!Array.isArray(payload) || payload.length === 0) return [];
  if (!stamp) return payload as PlayerMatch[];
  const age = Date.now() - new Date(stamp).getTime();
  if (Number.isNaN(age) || age > CACHE_MS * 12) return payload as PlayerMatch[];
  return payload as PlayerMatch[];
}

async function fetchLive(rankedinId: string): Promise<MatchLists> {
  try {
    const profileRes = await fetch(
      `${RANKEDIN_PROFILE}?rankedinId=${encodeURIComponent(rankedinId)}&language=en`
    );
    if (!profileRes.ok) return EMPTY;
    const profile = (await profileRes.json()) as { Id?: number; Header?: { PlayerId?: number } };
    const internalId = profile.Id || profile.Header?.PlayerId;
    if (!internalId) return EMPTY;

    const [upcomingRes, pastRes] = await Promise.all([
      fetch(
        `${RANKEDIN_MATCHES}?playerid=${internalId}&takehistory=false&skip=0&take=20&language=en`
      ),
      fetch(
        `${RANKEDIN_MATCHES}?playerid=${internalId}&takehistory=true&skip=0&take=40&language=en`
      ),
    ]);

    const upcomingJson = upcomingRes.ok
      ? ((await upcomingRes.json()) as { Payload?: PlayerMatch[] })
      : {};
    const pastJson = pastRes.ok ? ((await pastRes.json()) as { Payload?: PlayerMatch[] }) : {};

    return {
      upcoming: upcomingJson.Payload || [],
      past: pastJson.Payload || [],
    };
  } catch {
    return EMPTY;
  }
}
