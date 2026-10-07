import { supabase } from '@/lib/supabase';
import type { ProMatch, ProPerson, ProTournament } from '@/lib/pro-padel';

export type PointGame = { game_number: number; game_score: string | null; serving: string | null; points: string[] };
export type PointSet = { set_number: number; set_score: string | null; games: PointGame[] };
export type PointFeed = { coverage: 'full' | 'partial' | 'tracking' | null; status: string; sets: PointSet[] };
export type MatchStats = Record<string, unknown>;
export type LiveMatch = { id: number; status: string; coverage: string | null };
export type LiveScoreSummary = { sets: [string | null, string | null][]; points: string | null; serving: string | null; coverage: string | null };
export type MatchDetails = { match: ProMatch; scoreText: string | null; duration: string | null; startedAt: string | null; updatedAt: string | null; draw: string | null; watchability: number | null; seeds: [string | null, string | null]; liveScore?: LiveScoreSummary | null };
export type HeadToHead = { matches: MatchDetails[]; total: number; complete: boolean };
export type MatchPrediction = { team1: number; team2: number; eloDiff: number | null };
export type PlayerStats = { matchesPlayed: number | null; matchesWon: number | null; winPercentage: number | null; titles: number | null; finals: number | null; semifinals: number | null; setsWon: number | null; setsLost: number | null; gamesWon: number | null; gamesLost: number | null; bestRound: number | null; coverage: string | null; since: string | null };
export type PlayerProfile = { id: number; name: string; category: 'men' | 'women'; rank: number | null; points: number | null; nationality: string | null; photoUrl: string | null; birthdate: string | null; birthplace: string | null; age: number | null; height: number | null; side: string | null; hand: string | null; elo: number | null };
export type PlayerPair = { id: string; name: string; partner: ProPerson; partnerRank: number | null; partnerPoints: number | null; partnerNationality: string | null; partnerPhotoUrl: string | null; partnerSide: string | null; partnerHand: string | null; combinedPoints: number | null; status: string | null; firstMatchAt: string | null; lastMatchAt: string | null };
export type PlayerRanking = { type: string; rank: number | null; points: number | null; date: string | null; rankChange: number | null; pointsChange: number | null };
export type PlayerCoach = { coaches: string[]; sourceUrl: string | null };

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() && v !== 'hidden_free_plan' ? v.trim() : null;
const finiteNumber = (v: unknown): number | null => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const positiveId = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const person = (v: unknown): ProPerson | null => object(v) && positiveId(v.id) && text(v.name) ? { id: v.id, name: text(v.name)!, nationality: /^[A-Z]{2}$/.test(v.nationality || '') ? v.nationality : null } : null;

export function recentMatchForm(matches: MatchDetails[], playerId: number): boolean[] {
  return matches.filter(({ match }) => ['finished', 'retired'].includes(match.status) && !!match.winner && match.teams.some(team => team.some(player => player.id === playerId)))
    .slice(0, 10).reverse().map(({ match }) => match.winner === `team_${match.teams.findIndex(team => team.some(player => player.id === playerId)) + 1}`);
}

async function invoke(kind: string, id?: number | string, page?: number, extra?: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('pro-padel-explore', { body: { kind, id, page, ...extra } });
  if (error) {
    const response = (error as any).context;
    const body = response && typeof response.json === 'function' ? await response.json().catch(() => null) : null;
    if (response?.status === 404 && body?.code === 'NOT_FOUND') {
      throw new Error('Live international match coverage is not available yet.');
    }
    throw new Error(body?.error || 'Could not load international match data. Please retry.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function parseProviderMatch(raw: unknown): MatchDetails | null {
  if (!object(raw) || !positiveId(raw.id) || !['men', 'women'].includes(raw.category) || !object(raw.players)) return null;
  const teams = ['team_1', 'team_2'].map(key => Array.isArray(raw.players[key]) ? raw.players[key].map(person).filter(Boolean) as ProPerson[] : []);
  const tournament = object(raw.tournament) ? raw.tournament : {};
  const score = Array.isArray(raw.score) ? raw.score.map((set: any) => [set?.team_1 ?? null, set?.team_2 ?? null]) : [];
  const match: ProMatch = {
    id: raw.id, category: raw.category, round: Number(raw.round) || 0, roundName: text(raw.round_name),
    tournamentId: Number(tournament.id) || 0, tournamentName: text(tournament.name) || 'International match',
    playedAt: text(raw.played_at), status: text(raw.status) || 'scheduled',
    winner: raw.winner === 'team_1' || raw.winner === 'team_2' ? raw.winner : null,
    teams, score, scheduledAt: text(raw.scheduled_at), scheduleLabel: text(raw.schedule_label), court: text(raw.court),
  };
  const seed = object(raw.seeds) ? raw.seeds : {};
  const scoreText = text(raw.score) || (score.length ? score.map(([first, second]) => first != null && second != null ? `${first}-${second}` : '').filter(Boolean).join(', ') : null);
  return { match, scoreText, duration: text(raw.duration), startedAt: text(raw.started_time), updatedAt: text(raw.updated_at), draw: text(raw.draw),
    watchability: Number.isFinite(raw.watchability) && raw.watchability >= 0 && raw.watchability <= 100 ? raw.watchability : null,
    seeds: [text(seed.team_1), text(seed.team_2)] };
}

export async function fetchLiveMatches(): Promise<LiveMatch[]> {
  const value = await invoke('live');
  if (!Array.isArray(value?.data)) throw new Error('Live matches are unavailable.');
  return value.data.filter((row: any) => object(row) && positiveId(row.id)).map((row: any) => ({ id: row.id, status: text(row.status) || 'live', coverage: text(row.coverage) }));
}

export async function fetchMatchDetails(id: number): Promise<MatchDetails | null> {
  const value = await invoke('match', id);
  if (value?.unavailable) return null;
  const result = parseProviderMatch(value);
  if (!result) throw new Error('This match could not be displayed.');
  return result;
}

export async function fetchPointFeed(id: number): Promise<PointFeed | null> {
  const value = await invoke('points', id);
  if (value?.unavailable) return null;
  if (!object(value) || !Array.isArray(value.sets)) return null;
  return { status: text(value.status) || '', coverage: ['full', 'partial', 'tracking'].includes(value.coverage) ? value.coverage : null,
    sets: value.sets.filter(object).map((set: any) => ({ set_number: Number(set.set_number) || 0, set_score: text(set.set_score),
      games: Array.isArray(set.games) ? set.games.filter(object).map((game: any) => ({ game_number: Number(game.game_number) || 0,
        game_score: text(game.game_score), serving: text(game.serving), points: Array.isArray(game.points) ? game.points.filter((p: unknown) => typeof p === 'string') : [] })) : [] })) };
}

export function liveScoreFromPointFeed(feed: PointFeed | null): LiveScoreSummary | null {
  if (!feed?.sets.length) return null;
  const lastSet = feed.sets[feed.sets.length - 1];
  const lastGame = lastSet.games[lastSet.games.length - 1];
  const sets = feed.sets.map(set => {
    const value = set.set_score || set.games[set.games.length - 1]?.game_score || '';
    const score = /^(\d+)-(\d+)$/.exec(value);
    return score ? [score[1], score[2]] as [string, string] : [null, null] as [null, null];
  });
  return { sets, points: lastSet.set_score ? null : lastGame?.points[lastGame.points.length - 1] || null,
    serving: lastSet.set_score ? null : lastGame?.serving || null, coverage: feed.coverage };
}

export async function withLiveScores(rows: MatchDetails[]): Promise<MatchDetails[]> {
  const feeds = await Promise.allSettled(rows.map(async row => ['live', 'ongoing'].includes(row.match.status)
    ? liveScoreFromPointFeed(await fetchPointFeed(row.match.id)) : null));
  return rows.map((row, index) => feeds[index].status === 'fulfilled' && feeds[index].value
    ? { ...row, liveScore: feeds[index].value } : row);
}

export async function fetchMatchStats(id: number): Promise<MatchStats | null> {
  const value = await invoke('stats', id);
  return value?.unavailable || !object(value) ? null : value;
}

export async function fetchHeadToHead(id: number): Promise<HeadToHead | null> {
  const value = await invoke('head-to-head', id);
  if (value?.unavailable) return null;
  if (!Array.isArray(value?.data)) throw new Error('Head-to-head history could not be loaded.');
  const matches = value.data.map(parseProviderMatch).filter(Boolean) as MatchDetails[];
  return { matches, total: Number(value.meta?.total) || matches.length, complete: Number(value.meta?.last_page) === 1 };
}

export async function fetchMatchPrediction(details: MatchDetails): Promise<MatchPrediction | null> {
  const teams = details.match.teams.map(team => team.map(player => player.id));
  const playedAt = details.match.playedAt?.slice(0, 10) || details.match.scheduledAt?.slice(0, 10);
  if (teams.some(team => team.length !== 2) || !playedAt) return null;
  const value = await invoke('prediction', details.match.id, undefined, { team_1: teams[0], team_2: teams[1], played_at: playedAt });
  if (value?.unavailable || !Number.isFinite(value?.probability?.team_1) || !Number.isFinite(value?.probability?.team_2)) return null;
  return { team1: value.probability.team_1, team2: value.probability.team_2, eloDiff: Number.isFinite(value.eloDiff) ? value.eloDiff : null };
}

export async function fetchPlayerStats(id: number): Promise<PlayerStats | null> {
  const value = await invoke('player-stats', id);
  if (value?.unavailable || !object(value)) return null;
  const count = (item: unknown) => Number.isFinite(item) && Number(item) >= 0 ? Number(item) : null;
  return { matchesPlayed: count(value.matches_played), matchesWon: count(value.matches_won), winPercentage: count(value.win_percentage),
    titles: count(value.titles), finals: count(value.finals), semifinals: count(value.semifinals),
    setsWon: count(value.sets_won), setsLost: count(value.sets_lost), gamesWon: count(value.games_won), gamesLost: count(value.games_lost),
    bestRound: count(value.best_round), coverage: text(value.coverage), since: text(value.performance_since) };
}

export async function fetchPlayerProfile(id: number): Promise<PlayerProfile | null> {
  const value = await invoke('player', id);
  if (value?.unavailable) return null;
  const row = object(value?.data) ? value.data : value;
  if (!object(row) || row.id !== id || !text(row.name) || !['men', 'women'].includes(row.category)) throw new Error('This player profile could not be displayed.');
  const number = (item: unknown) => { const value = finiteNumber(item); return value != null && value >= 0 ? value : null; };
  return { id, name: text(row.name)!, category: row.category, rank: number(row.ranking), points: number(row.points),
    nationality: text(row.nationality), photoUrl: /^https:\/\//.test(row.photo_url || '') ? row.photo_url : null,
    birthdate: /^\d{4}-\d{2}-\d{2}$/.test(row.birthdate || '') ? row.birthdate : null,
    birthplace: text(row.birthplace), age: number(row.age), height: number(row.height), side: text(row.side), hand: text(row.hand), elo: number(row.elo) };
}

export async function fetchPlayerCoach(id: number): Promise<PlayerCoach> {
  const value = await invoke('player-coach', id);
  return { coaches: Array.isArray(value?.coaches) ? value.coaches.filter((coach: unknown): coach is string => !!text(coach)) : [],
    sourceUrl: typeof value?.sourceUrl === 'string' && /^https:\/\/www\.padelfip\.com\/player\/[a-z0-9-]+\/$/.test(value.sourceUrl) ? value.sourceUrl : null };
}

export async function fetchPlayerMatches(id: number, page = 1, year?: number): Promise<{ matches: MatchDetails[]; hasMore: boolean; total: number }> {
  const value = await invoke('player-matches', id, page, year ? { year } : undefined);
  if (value?.unavailable) return { matches: [], hasMore: false, total: 0 };
  if (!Array.isArray(value?.data)) throw new Error('Player match history could not be loaded.');
  const matches = value.data.map(parseProviderMatch).filter(Boolean) as MatchDetails[];
  return { matches, hasMore: Number(value.meta?.last_page) > page, total: Number(value.meta?.total) || matches.length };
}

export async function fetchPlayerPairs(id: number): Promise<PlayerPair[]> {
  const value = await invoke('player-pairs', id);
  if (value?.unavailable) return [];
  const rows = Array.isArray(value) ? value : value?.data;
  if (!Array.isArray(rows)) throw new Error('Player partners could not be loaded.');
  return rows.filter(object).map((row: Record<string, any>) => {
    const rawPartner = Array.isArray(row.players) ? row.players.find((p: unknown) => object(p) && p.id !== id && !!person(p)) : null;
    const partner = person(rawPartner);
    return partner ? { id: text(row.id) || String(partner.id), name: text(row.name) || partner.name, partner,
      partnerRank: finiteNumber(rawPartner.ranking), partnerPoints: finiteNumber(rawPartner.points), partnerNationality: text(rawPartner.nationality),
      partnerPhotoUrl: /^https:\/\//.test(rawPartner.photo_url || '') ? rawPartner.photo_url : null,
      partnerSide: text(rawPartner.side), partnerHand: text(rawPartner.hand), combinedPoints: finiteNumber(row.points),
      status: text(row.status), firstMatchAt: text(row.first_match_at), lastMatchAt: text(row.last_match_at) } : null;
  }).filter((pair: PlayerPair | null): pair is PlayerPair => pair !== null);
}

export async function fetchPairStats(pairId: string): Promise<PlayerStats | null> {
  const value = await invoke('pair-stats', pairId);
  if (value?.unavailable || !object(value)) return null;
  const count = (item: unknown) => { const number = finiteNumber(item); return number != null && number >= 0 ? number : null; };
  return { matchesPlayed: count(value.matches_played), matchesWon: count(value.matches_won), winPercentage: count(value.win_percentage),
    titles: count(value.titles), finals: count(value.finals), semifinals: count(value.semifinals),
    setsWon: count(value.sets_won), setsLost: count(value.sets_lost), gamesWon: count(value.games_won), gamesLost: count(value.games_lost),
    bestRound: count(value.best_round), coverage: text(value.coverage), since: text(value.performance_since) };
}

export async function fetchPairMatches(pairId: string, page = 1, year?: number): Promise<{ matches: MatchDetails[]; hasMore: boolean; total: number }> {
  const value = await invoke('pair-matches', pairId, page, year ? { year } : undefined);
  if (value?.unavailable) return { matches: [], hasMore: false, total: 0 };
  if (!Array.isArray(value?.data)) throw new Error('Pair match history could not be loaded.');
  const matches = value.data.map(parseProviderMatch).filter(Boolean) as MatchDetails[];
  return { matches, hasMore: Number(value.meta?.last_page) > page, total: Number(value.meta?.total) || matches.length };
}

export async function fetchPlayerRankings(id: number): Promise<PlayerRanking[]> {
  const value = await invoke('player-rankings', id);
  if (value?.unavailable) return [];
  const rows = Array.isArray(value) ? value : value?.data;
  if (!Array.isArray(rows)) throw new Error('FIP rankings could not be loaded.');
  return rows.filter(object).filter((row: Record<string, any>) => !!text(row.type)).map((row: Record<string, any>) => ({
    type: text(row.type)!, rank: finiteNumber(row.ranking), points: finiteNumber(row.points), date: text(row.date),
    rankChange: finiteNumber(row.ranking_diff), pointsChange: finiteNumber(row.points_diff),
  }));
}

export async function fetchTournamentDetails(id: number): Promise<ProTournament | null> {
  const value = await invoke('tournament', id);
  if (value?.unavailable) return null;
  if (!object(value) || value.id !== id || !text(value.name)) throw new Error('Tournament details could not be loaded.');
  return { id, name: text(value.name)!, startDate: text(value.start_date) || '', endDate: text(value.end_date) || '',
    level: text(value.level), status: text(value.status), location: text(value.location), country: text(value.country),
    venue: text(value.venue?.name), photoUrl: /^https:\/\//.test(value.photo_url || '') ? value.photo_url : null };
}

export async function fetchTournamentMatches(id: number, page = 1): Promise<{ matches: MatchDetails[]; hasMore: boolean; total: number; lastPage: number }> {
  const value = await invoke('tournament-matches', id, page);
  if (value?.unavailable) return { matches: [], hasMore: false, total: 0, lastPage: 1 };
  if (!Array.isArray(value?.data)) throw new Error('Tournament matches could not be loaded.');
  const matches = value.data.map(parseProviderMatch).filter(Boolean) as MatchDetails[];
  return { matches, hasMore: Number(value.meta?.last_page) > page, total: Number(value.meta?.total) || matches.length, lastPage: Number(value.meta?.last_page) || 1 };
}

export type ProSeason = { id: number; name: string; startDate: string; endDate: string; status: string };

export async function fetchProSeasons(): Promise<ProSeason[]> {
  const value = await invoke('seasons');
  if (!Array.isArray(value?.data)) throw new Error('International tour seasons could not be loaded.');
  return value.data.filter((row: any) => object(row) && positiveId(row.id) && text(row.name))
    .map((row: any) => ({ id: row.id, name: text(row.name)!, startDate: text(row.start_date) || '', endDate: text(row.end_date) || '', status: text(row.status) || '' }));
}

export async function fetchSeasonTournaments(id: number, page = 1): Promise<{ tournaments: ProTournament[]; hasMore: boolean }> {
  const value = await invoke('season-tournaments', id, page);
  if (!Array.isArray(value?.data)) throw new Error('Season tournaments could not be loaded.');
  return {
    tournaments: value.data.filter((row: any) => object(row) && positiveId(row.id) && text(row.name) && text(row.start_date) && text(row.end_date))
      .map((row: any) => ({ id: row.id, name: text(row.name)!, startDate: text(row.start_date)!, endDate: text(row.end_date)!,
        level: text(row.level), status: text(row.status), location: text(row.location), country: text(row.country),
        venue: text(row.venue?.name), photoUrl: /^https:\/\//.test(row.photo_url || '') ? row.photo_url : null })),
    hasMore: Number(value.meta?.last_page) > page,
  };
}
