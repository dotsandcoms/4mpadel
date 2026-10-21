import { supabase } from '@/lib/supabase';
import { LIVE_AFTER_MS } from '@/lib/when';

const RANKEDIN_PROFILE =
  'https://api.rankedin.com/v1/player/playerprofileinfoasync';
const RANKEDIN_MATCHES = 'https://api.rankedin.com/v1/player/GetPlayerMatchesAsync';
const RANKEDIN_API = 'https://api.rankedin.com/v1';
const CACHE_MS = 5 * 60 * 1000;

export type MatchSide = {
  Name?: string | null;
  RankedinId?: string | null;
  CountryShort?: string | null;
  IsWinner?: boolean;
};

export type PlayerMatch = {
  ChallengeId?: number | string;
  MatchId?: number | string;
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
  career?: { played: number; wins: number; losses: number };
};

const EMPTY: MatchLists = { upcoming: [], past: [] };
type LoadedMatches = { matches: MatchLists; upcomingAvailable: boolean; historyComplete: boolean };
const requests = new Map<string, Promise<LoadedMatches>>();
const results = new Map<string, { value: LoadedMatches; fetchedAt: number }>();

export async function fetchPlayerMatches(rankedinId?: string | null, options?: { requireUpcoming?: boolean; includeHistory?: boolean }): Promise<MatchLists> {
  if (!rankedinId) return EMPTY;
  const includeHistory = options?.includeHistory !== false;
  const requestKey = `${rankedinId}:${includeHistory ? 'all' : 'upcoming'}`;
  const saved = results.get(requestKey);
  let result = saved && Date.now() - saved.fetchedAt < CACHE_MS ? saved.value : undefined;
  if (!result) {
    let request = requests.get(requestKey);
    if (!request) {
      request = loadPlayerMatches(rankedinId, includeHistory).then(value => {
        if (value.historyComplete && value.upcomingAvailable) {
          results.set(requestKey, { value, fetchedAt: Date.now() });
          if (results.size > 24) results.delete(results.keys().next().value!);
        }
        return value;
      }).finally(() => requests.delete(requestKey));
      requests.set(requestKey, request);
    }
    result = await request;
  }
  if (options?.requireUpcoming && !result.upcomingAvailable) {
    throw new Error('The published match schedule could not be loaded.');
  }
  return result.matches;
}

async function loadPlayerMatches(rankedinId: string, includeHistory: boolean): Promise<LoadedMatches> {
  const [cached, profile] = await Promise.all([
    readCache(rankedinId),
    fetchJson(`${RANKEDIN_PROFILE}?rankedinId=${encodeURIComponent(rankedinId)}&language=en`).catch(() => null),
  ]);
  const career = careerStatistics(profile?.Statistics);
  // The shared website cache may contain only the latest five tournaments.
  const historyFresh = cached.pastFresh && career !== undefined && cached.past.length >= career.played;
  const live = cached.upcomingFresh && (!includeHistory || historyFresh)
    ? {}
    : await fetchLive(profile, !cached.upcomingFresh, includeHistory && !historyFresh, career?.played);
  const upcoming = live.upcoming ?? cached.upcoming;
  // An empty/placeholder history response must not erase previously published results.
  const past = live.past?.length ? preservePublishedScores(live.past, cached.past) : cached.past;
  return {
    matches: { upcoming: splitUpcoming(upcoming), past: includeHistory ? mergePast(past, upcoming) : [], career },
    upcomingAvailable: live.upcoming !== undefined || cached.upcomingAvailable,
    historyComplete: !includeHistory || historyFresh || (live.past !== undefined && (career === undefined || live.past.length >= career.played)),
  };
}

function careerStatistics(stats?: Record<string, unknown>): MatchLists['career'] {
  const record = (value: unknown) => typeof value === 'string' ? value.match(/^(\d+)\s*-\s*(\d+)$/) : null;
  const doubles = record(stats?.CareerWinLossDoubles);
  const singles = record(stats?.CareerWinLossSingles);
  if (!doubles && !singles) return undefined;
  const wins = Number(doubles?.[1] ?? 0) + Number(singles?.[1] ?? 0);
  const losses = Number(doubles?.[2] ?? 0) + Number(singles?.[2] ?? 0);
  return { played: wins + losses, wins, losses };
}

function sameMatch(first: PlayerMatch, second: PlayerMatch) {
  const firstId = first.ChallengeId || first.MatchId;
  const secondId = second.ChallengeId || second.MatchId;
  return firstId && secondId ? String(firstId) === String(secondId) : matchKey(first, 0) === matchKey(second, 0);
}

function preservePublishedScores(live: PlayerMatch[], saved: PlayerMatch[]) {
  const merged = live.map(match => {
    if (match.Score?.Score?.length) return match;
    const candidates = saved.filter(old => sameMatch(old, match));
    return candidates.length === 1 && candidates[0].Score?.Score?.length
      ? { ...match, Score: candidates[0].Score }
      : match;
  });
  return [...merged, ...saved.filter(old => !live.some(match => sameMatch(old, match)))];
}

export function parseMatchDate(dateStr?: string | null) {
  if (!dateStr) return new Date(0);
  const raw = String(dateStr).trim();
  if (raw.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const iso = new Date(raw);
    return Number.isNaN(iso.getTime()) || iso.getFullYear() <= 1 ? new Date(0) : iso;
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

type CachedMatches = MatchLists & { upcomingFresh: boolean; pastFresh: boolean; upcomingAvailable: boolean };
const EMPTY_CACHE: CachedMatches = { ...EMPTY, upcomingFresh: false, pastFresh: false, upcomingAvailable: false };

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
      upcoming: upcoming || [], past: past || [], upcomingAvailable: upcoming !== null,
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

type RankedInProfile = { Id?: number; Header?: { PlayerId?: number }; Statistics?: Record<string, unknown> };

async function fetchLive(profile: RankedInProfile | null, upcoming: boolean, past: boolean, played?: number): Promise<Partial<MatchLists>> {
  try {
    const internalId = profile?.Id || profile?.Header?.PlayerId;
    if (!internalId) return {};
    const layout = await fetchJson(`${RANKEDIN_API}/player/getlayoutinfoasync?language=en`).catch(() => null);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (layout?.AnonymousToken) headers['x-anonymous-token'] = layout.AnonymousToken;
    const load = async (history: boolean) => {
      try {
        return await fetchPages<PlayerMatch>(`${RANKEDIN_MATCHES}?playerid=${internalId}&takehistory=${history}&language=en`, history ? 40 : 20, headers, validList,
          match => String(match.ChallengeId || match.MatchId || matchKey(match, 0)));
      } catch { return undefined; }
    };
    const [upcomingList, directHistory] = await Promise.all([
      upcoming ? load(false) : undefined,
      past ? load(true) : undefined,
    ]);
    const tournamentHistory = past && (directHistory === undefined || (played !== undefined && directHistory.length < played))
      ? await fetchTournamentHistory(internalId).catch(() => undefined)
      : undefined;
    const pastList = tournamentHistory === undefined ? directHistory
      : preservePublishedScores(tournamentHistory, directHistory || []);
    return { upcoming: upcomingList, past: pastList };
  } catch {
    return {};
  }
}

async function fetchPages<T>(url: string, take: number, headers: Record<string, string> | undefined, validate: (value: unknown) => T[] | null, key: (value: T) => string): Promise<T[]> {
  const rows = new Map<string, T>();
  for (let skip = 0; ; ) {
    const data = await fetchJson(`${url}&skip=${skip}&take=${take}`, headers);
    const page = validate(data.Payload);
    if (page === null) throw new Error('RankedIn returned placeholder data.');
    const previousSize = rows.size;
    page.forEach(row => rows.set(key(row), row));
    const pageSize = data.Payload.length;
    const hasMore = data.HasMore ?? (typeof data.TotalCount === 'number' ? skip + pageSize < data.TotalCount : pageSize === take);
    if (!page.length || !hasMore) return [...rows.values()];
    if (rows.size === previousSize) throw new Error('RankedIn repeated a match history page.');
    skip += pageSize;
  }
}

type PlayerEvent = { Id: number; Name: string; StartDate?: string };
type TournamentSide = { Name?: string; Player2Name?: string; Player1Id?: number; Player2Id?: number; Player1Url?: string };
type TournamentScore = {
  FirstParticipantScore?: number; SecondParticipantScore?: number; IsFirstParticipantWinner?: boolean;
  DetailedScoring?: Array<{ FirstParticipantScore: number; SecondParticipantScore: number }>;
};
type TournamentMatch = {
  Id: number; Date?: string; Court?: string; Challenger?: TournamentSide; Challenged?: TournamentSide;
  MatchResult?: { IsPlayed?: boolean; IsFirstParticipantWinner?: boolean; Score?: TournamentScore };
};

type TournamentPayload = { Matches?: TournamentMatch[] | { Matches?: TournamentMatch[] } } | TournamentPayload[];

function tournamentMatches(data: TournamentPayload | null): TournamentMatch[] {
  if (Array.isArray(data)) return data.flatMap(section => tournamentMatches(section));
  const matches = data?.Matches;
  if (Array.isArray(matches)) return matches;
  if (Array.isArray(matches?.Matches)) return matches.Matches;
  throw new Error('Published tournament matches could not be loaded.');
}

async function fetchTournamentHistory(internalId: number): Promise<PlayerMatch[]> {
  const events = await fetchPages<PlayerEvent>(`${RANKEDIN_API}/player/ParticipatedEventsAsync?playerId=${internalId}&language=en`, 100, undefined,
    value => Array.isArray(value) ? value.filter(event => event?.Id && event?.Name) : null, event => String(event.Id));
  const pastEvents = events.filter(event => parseMatchDate(event.StartDate).getTime() <= Date.now());
  const matches: PlayerMatch[] = [];
  let nextEvent = 0;
  // Keep the public API workload bounded while loading every participated event.
  await Promise.all(Array.from({ length: Math.min(3, pastEvents.length) }, async () => {
    while (nextEvent < pastEvents.length) {
      const event = pastEvents[nextEvent++];
      try {
        const fixtures = tournamentMatches(await fetchJson(`${RANKEDIN_API}/tournament/GetMatchesSectionAsync?Id=${event.Id}&LanguageCode=en&IsReadonly=true`));
        const teamFixtures = fixtures.filter(match => match.Challenger?.Player1Url?.includes('/team/') || match.Challenged?.Player1Url?.includes('/team/'));
        for (const team of teamFixtures) {
          try {
            fixtures.push(...tournamentMatches(await fetchJson(`${RANKEDIN_API}/tournament/GetTournamentTeamsMatchesAsync?tournamentId=${event.Id}&challengeId=${team.Id}&language=en`)));
          } catch { /* Keep other published results when a team draw is unavailable. */ }
        }
        for (const fixture of fixtures) {
          const first = fixture.Challenger;
          const second = fixture.Challenged;
          const onFirst = [first?.Player1Id, first?.Player2Id].some(id => String(id) === String(internalId));
          const onSecond = [second?.Player1Id, second?.Player2Id].some(id => String(id) === String(internalId));
          if ((!onFirst && !onSecond) || !fixture.MatchResult?.IsPlayed) continue;
          matches.push(normalizeTournamentMatch(event, fixture, onFirst));
        }
      } catch { /* A failed event must not discard results from the other events. */ }
    }
  }));
  return [...new Map(matches.map(match => [match.ChallengeId, match])).values()];
}

function normalizeTournamentMatch(event: PlayerEvent, match: TournamentMatch, onFirst: boolean): PlayerMatch {
  const score = match.MatchResult?.Score;
  // Team-match result flags can disagree with the published individual score.
  const firstWon = score?.IsFirstParticipantWinner
    ?? (score?.FirstParticipantScore !== undefined && score?.SecondParticipantScore !== undefined ? score.FirstParticipantScore > score.SecondParticipantScore : match.MatchResult?.IsFirstParticipantWinner);
  const date = parseMatchDate(match.Date).getTime() ? parseMatchDate(match.Date) : parseMatchDate(event.StartDate);
  const label = date.getTime() ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '';
  const detailed = score?.DetailedScoring;
  const sets = detailed?.length ? detailed.map(set => ({ Score1: set.FirstParticipantScore, Score2: set.SecondParticipantScore }))
    : score?.FirstParticipantScore != null && score?.SecondParticipantScore != null ? [{ Score1: score.FirstParticipantScore, Score2: score.SecondParticipantScore }] : [];
  return {
    ChallengeId: match.Id,
    Info: {
      EventName: event.Name, EventStartDate: event.StartDate, Date: label, Court: match.Court,
      Challenger: { Name: match.Challenger?.Name, IsWinner: firstWon }, Challenger1: { Name: match.Challenger?.Player2Name },
      Challenged: { Name: match.Challenged?.Name, IsWinner: firstWon === undefined ? undefined : !firstWon }, Challenged1: { Name: match.Challenged?.Player2Name },
      IsWinner: firstWon === undefined ? undefined : onFirst ? firstWon : !firstWon,
    },
    Score: { Score: sets, IsSummary: !detailed?.length && sets.length > 0 },
  };
}
