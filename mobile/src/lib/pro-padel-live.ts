import { supabase } from '@/lib/supabase';
import type { ProMatch, ProPerson, ProTournament } from '@/lib/pro-padel';

export type PointGame = { game_number: number; game_score: string | null; serving: string | null; points: string[] };
export type PointSet = { set_number: number; set_score: string | null; games: PointGame[] };
export type PointFeed = { coverage: 'full' | 'partial' | 'tracking' | null; status: string; sets: PointSet[] };
export type MatchStats = Record<string, unknown>;
export type LiveMatch = { id: number; status: string; coverage: string | null };
export type MatchDetails = { match: ProMatch; scoreText: string | null; duration: string | null; startedAt: string | null; updatedAt: string | null; draw: string | null; watchability: number | null; seeds: [string | null, string | null] };
export type HeadToHead = { matches: MatchDetails[]; total: number; complete: boolean };
export type MatchPrediction = { team1: number; team2: number; eloDiff: number | null };
export type PlayerStats = { matchesPlayed: number | null; matchesWon: number | null; winPercentage: number | null; titles: number | null; coverage: string | null; since: string | null };

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() && v !== 'hidden_free_plan' ? v.trim() : null;
const positiveId = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const person = (v: unknown): ProPerson | null => object(v) && positiveId(v.id) && text(v.name) ? { id: v.id, name: text(v.name)! } : null;

async function invoke(kind: string, id?: number, page?: number, extra?: Record<string, unknown>): Promise<any> {
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
  return { match, scoreText: text(raw.score), duration: text(raw.duration), startedAt: text(raw.started_time), updatedAt: text(raw.updated_at), draw: text(raw.draw),
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
    titles: count(value.titles), coverage: text(value.coverage), since: text(value.performance_since) };
}

export async function fetchTournamentMatches(id: number, page = 1): Promise<{ matches: MatchDetails[]; hasMore: boolean }> {
  const value = await invoke('tournament-matches', id, page);
  if (value?.unavailable) return { matches: [], hasMore: false };
  if (!Array.isArray(value?.data)) throw new Error('Tournament matches could not be loaded.');
  return { matches: value.data.map(parseProviderMatch).filter(Boolean) as MatchDetails[], hasMore: Number(value.meta?.last_page) > page };
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
