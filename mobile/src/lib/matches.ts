import { supabase } from '@/lib/supabase';
import { LIVE_AFTER_MS } from '@/lib/when';

const RANKEDIN_PROFILE =
  'https://api.rankedin.com/v1/player/playerprofileinfoasync';
const RANKEDIN_MATCHES = 'https://api.rankedin.com/v1/player/GetPlayerMatchesAsync';
const RANKEDIN_API = 'https://api.rankedin.com/v1';
const CACHE_MS = 5 * 60 * 1000;
let anonymousToken: string | null | undefined;

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
    IsPlayed?: boolean;
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

type RankedInEvent = {
  Id: string | number;
  Name?: string | null;
  StartDate?: string | null;
};

type TournamentSide = {
  Id?: string | number | null;
  EventParticipantId?: string | number | null;
  Player1Id?: string | number | null;
  Player2Id?: string | number | null;
  Name?: string | null;
  Player2Name?: string | null;
};

type TournamentMatch = {
  Date?: string | null;
  Court?: string | null;
  Challenger?: TournamentSide | null;
  Challenged?: TournamentSide | null;
  MatchResult?: {
    IsPlayed?: boolean;
    IsFirstParticipantWinner?: boolean;
    WinnerParticipantId?: string | number | null;
    Score?: {
      WinnerParticipantId?: string | number | null;
      FirstParticipantScore?: number;
      SecondParticipantScore?: number;
      IsFirstParticipantWinner?: boolean;
      DetailedScoring?: Array<{
        FirstParticipantScore?: number;
        SecondParticipantScore?: number;
      }>;
    };
  } | null;
};

export async function fetchPlayerMatches(rankedinId?: string | null): Promise<MatchLists> {
  if (!rankedinId) return EMPTY;

  const cached = await readCache(rankedinId);
  const upcoming = splitUpcoming(cached.upcoming);
  const past = mergePast(cached.past, cached.upcoming);

  if (upcoming.length && past.length) {
    return { upcoming, past: past.slice(0, 15) };
  }

  const live = await fetchLive(rankedinId);
  return {
    upcoming: upcoming.length ? upcoming : splitUpcoming(live.upcoming),
    past: past.length ? past.slice(0, 15) : mergePast(live.past, live.upcoming).slice(0, 15),
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

async function fetchRankedinJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  let cached: T | null = null;
  try {
    const { data } = await supabase
      .from('rankedin_cache')
      .select('payload')
      .eq('url', url)
      .maybeSingle();
    cached = (data?.payload as T | undefined) ?? null;
  } catch {
    // A live response is still usable when the shared cache is unavailable.
  }

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
    if (!response.ok) throw new Error(`RankedIn request failed (${response.status})`);
    return (await response.json()) as T;
  } catch (error) {
    if (cached !== null) return cached;
    throw error;
  }
}

async function getAnonymousHeaders(): Promise<Record<string, string>> {
  if (anonymousToken === undefined) {
    try {
      const layout = await fetchRankedinJson<{ AnonymousToken?: string }>(
        `${RANKEDIN_API}/player/getlayoutinfoasync?language=en`
      );
      anonymousToken = layout.AnonymousToken || null;
    } catch {
      anonymousToken = null;
    }
  }
  return anonymousToken ? { 'x-anonymous-token': anonymousToken } : {};
}

function formatMatchDate(raw?: string | null, fallback?: string | null) {
  const parsed = parseMatchDate(raw);
  const date = parsed.getTime() ? parsed : parseMatchDate(fallback);
  if (!date.getTime()) return fallback || raw || null;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function sameId(left: string | number | null | undefined, right: string | number) {
  return left != null && String(left) === String(right);
}

function sideHasPlayer(side: TournamentSide | null | undefined, playerId: string | number) {
  return sameId(side?.Player1Id, playerId) || sameId(side?.Player2Id, playerId);
}

function normalizeTournamentMatch(
  match: TournamentMatch,
  event: RankedInEvent,
  playerId: string | number
): PlayerMatch {
  const first = match.Challenger;
  const second = match.Challenged;
  const score = match.MatchResult?.Score;
  const winnerId = match.MatchResult?.WinnerParticipantId ?? score?.WinnerParticipantId;
  let firstWon: boolean | undefined;
  if (winnerId != null) {
    firstWon =
      sameId(first?.Id, winnerId) ||
      sameId(first?.EventParticipantId, winnerId) ||
      sameId(first?.Player1Id, winnerId);
  } else if (score?.IsFirstParticipantWinner != null) {
    firstWon = score.IsFirstParticipantWinner;
  } else if (match.MatchResult?.IsFirstParticipantWinner != null) {
    firstWon = match.MatchResult.IsFirstParticipantWinner;
  } else if (score?.FirstParticipantScore != null && score?.SecondParticipantScore != null) {
    firstWon = score.FirstParticipantScore > score.SecondParticipantScore;
  }
  const playerWon =
    firstWon == null
      ? undefined
      : sideHasPlayer(first, playerId)
        ? firstWon
        : !firstWon;

  return {
    Info: {
      EventName: event.Name || 'Tournament',
      Date: formatMatchDate(match.Date, event.StartDate),
      EventStartDate: event.StartDate,
      Challenger: { Name: first?.Name, IsWinner: firstWon },
      Challenger1: { Name: first?.Player2Name },
      Challenged: {
        Name: second?.Name,
        IsWinner: firstWon == null ? undefined : !firstWon,
      },
      Challenged1: { Name: second?.Player2Name },
      Court: match.Court,
      IsPlayed: match.MatchResult?.IsPlayed,
      IsWinner: playerWon,
    },
    Score: {
      Score: (score?.DetailedScoring || []).map((set) => ({
        Score1: Number(set.FirstParticipantScore || 0),
        Score2: Number(set.SecondParticipantScore || 0),
      })),
    },
  };
}

function tournamentMatches(payload: unknown): TournamentMatch[] {
  const root = Array.isArray(payload) ? payload[0] : payload;
  if (!root || typeof root !== 'object') return [];
  const matches = (root as { Matches?: unknown }).Matches;
  if (Array.isArray(matches)) return matches as TournamentMatch[];
  if (matches && typeof matches === 'object') {
    const nested = (matches as { Matches?: unknown }).Matches;
    if (Array.isArray(nested)) return nested as TournamentMatch[];
  }
  return [];
}

async function fetchCompletedFallback(
  internalId: string | number,
  headers: Record<string, string>
): Promise<PlayerMatch[]> {
  const eventsUrl = `${RANKEDIN_API}/player/ParticipatedEventsAsync?playerId=${internalId}&language=en&skip=0&take=100`;
  const eventsJson = await fetchRankedinJson<{ Payload?: RankedInEvent[]; payload?: RankedInEvent[] }>(
    eventsUrl,
    headers
  );
  const events = (eventsJson.Payload || eventsJson.payload || [])
    .filter((event) => parseMatchDate(event.StartDate).getTime() < Date.now())
    .sort(
      (a, b) =>
        parseMatchDate(b.StartDate).getTime() - parseMatchDate(a.StartDate).getTime()
    )
    .slice(0, 5);

  const results = await Promise.all(
    events.map(async (event) => {
      try {
        const specialTeamEvent =
          String(event.Id) === '68674' ||
          String(event.Name || '').toLowerCase().includes('north vs south');
        const url = specialTeamEvent
          ? `${RANKEDIN_API}/tournament/GetTournamentTeamsMatchesAsync?tournamentId=${event.Id}&challengeId=6404918&language=en`
          : `${RANKEDIN_API}/tournament/GetMatchesSectionAsync?Id=${event.Id}&LanguageCode=en&IsReadonly=true`;
        const payload = await fetchRankedinJson<unknown>(url, headers);
        return tournamentMatches(payload)
          .filter(
            (match) =>
              match.MatchResult?.IsPlayed &&
              (sideHasPlayer(match.Challenger, internalId) ||
                sideHasPlayer(match.Challenged, internalId))
          )
          .map((match) => normalizeTournamentMatch(match, event, internalId));
      } catch {
        return [];
      }
    })
  );

  return results.flat();
}

async function fetchLive(rankedinId: string): Promise<MatchLists> {
  try {
    const headers = await getAnonymousHeaders();
    const profile = await fetchRankedinJson<{ Id?: number; Header?: { PlayerId?: number } }>(
      `${RANKEDIN_PROFILE}?rankedinId=${encodeURIComponent(rankedinId)}&language=en`,
      headers
    );
    const internalId = profile.Id || profile.Header?.PlayerId;
    if (!internalId) return EMPTY;

    const [upcomingJson, pastJson] = await Promise.all([
      fetchRankedinJson<{ Payload?: PlayerMatch[] }>(
        `${RANKEDIN_MATCHES}?playerid=${internalId}&takehistory=false&skip=0&take=20&language=en`,
        headers
      ),
      fetchRankedinJson<{ Payload?: PlayerMatch[] }>(
        `${RANKEDIN_MATCHES}?playerid=${internalId}&takehistory=true&skip=0&take=40&language=en`,
        headers
      ),
    ]);

    const pastPayload = pastJson.Payload || [];
    const pastIsPlaceholder =
      pastPayload.length > 0 && pastPayload.every((match) => !isRealMatch(match));
    const past =
      pastPayload.length === 0 || pastIsPlaceholder
        ? await fetchCompletedFallback(internalId, headers)
        : pastPayload;

    return {
      upcoming: upcomingJson.Payload || [],
      past,
    };
  } catch {
    return EMPTY;
  }
}
