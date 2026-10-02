import { supabase } from '@/lib/supabase';

export type ProCategory = 'men' | 'women';
export type ProPerson = { id: number; name: string };
export type ProPlayer = ProPerson & {
  category: ProCategory; rank: number; points: number | null;
  nationality: string | null; photoUrl: string | null; rankingDate: string | null;
  rankChange: number | null; pointsChange: number | null;
  height: number | null; side: string | null; hand: string | null;
};
export type ProMatch = {
  id: number; category: ProCategory; round: number; roundName: string | null;
  tournamentId: number; tournamentName: string; playedAt: string | null;
  status: string; winner: 'team_1' | 'team_2' | null;
  teams: ProPerson[][]; score: (string | number | null)[][];
  scheduledAt?: string | null; scheduleLabel?: string | null; court?: string | null;
};
export type ProTournament = { id: number; name: string; startDate: string; endDate: string; location: string | null; photoUrl: string | null; level?: string | null; status?: string | null; country?: string | null; venue?: string | null };
type Snapshot = { version: 1; updatedAt: string };
export type ProRankings = Snapshot & { limit: number; categories: Record<ProCategory, { players: ProPlayer[]; editionDate?: string | null; previousEdition?: boolean }> };
export type ProTour = Snapshot & { coverage: string; matches: ProMatch[]; tournaments: ProTournament[] };
export type ProFixtures = Snapshot & { coverage: string; matches: ProMatch[]; drawPublished: boolean; tournament: ProTournament | null };
export type ProFollow = { player_id: number; player_name: string; category: ProCategory };
export type ProSnapshots = { rankings: ProRankings; tour: ProTour; fixtures: ProFixtures };
export type ProResource<T> = { data: T | null; error: string | null };

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object';
const dated = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const person = (v: unknown) => isObject(v) && Number.isSafeInteger(v.id) && v.id > 0 && typeof v.name === 'string';
const category = (v: unknown) => v === 'men' || v === 'women';
const match = (v: unknown) => isObject(v) && Number.isSafeInteger(v.id) && category(v.category) &&
  Number.isInteger(v.round) && typeof v.tournamentName === 'string' && typeof v.status === 'string' &&
  Array.isArray(v.teams) && v.teams.length === 2 && v.teams.every((t: unknown) => Array.isArray(t) && t.every(person)) &&
  Array.isArray(v.score) && v.score.every((s: unknown) => Array.isArray(s) && s.length === 2 && s.every(n => n === null || typeof n === 'string' || typeof n === 'number'));

/** Validate public snapshots, never contact the credentialed provider from a device. */
export function parseProSnapshot<K extends keyof ProSnapshots>(kind: K, value: unknown): ProSnapshots[K] {
  if (!isObject(value) || value.version !== 1 || !dated(value.updatedAt)) throw new Error('Invalid international padel snapshot');
  if (kind === 'rankings') {
    if (!isObject(value.categories) || !['men', 'women'].every(c =>
      Array.isArray(value.categories[c]?.players) && value.categories[c].players.every((p: unknown) =>
        person(p) && isObject(p) && p.category === c && Number.isInteger(p.rank) && p.rank > 0))) throw new Error('Invalid rankings');
  } else {
    if (!Array.isArray(value.matches) || !value.matches.every(match) || typeof value.coverage !== 'string') throw new Error('Invalid matches');
    if (kind === 'tour' && !Array.isArray(value.tournaments)) throw new Error('Invalid tour');
    if (kind === 'fixtures' && (typeof value.drawPublished !== 'boolean' ||
      (value.tournament !== null && (!isObject(value.tournament) || typeof value.tournament.name !== 'string' || !dated(value.tournament.startDate))))) throw new Error('Invalid fixtures');
  }
  return value as ProSnapshots[K];
}

export async function fetchProSnapshot<K extends keyof ProSnapshots>(kind: K): Promise<ProSnapshots[K]> {
  const { data } = supabase.storage.from('pro-padel').getPublicUrl(`${kind}-v1.json`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(data.publicUrl, { signal: controller.signal });
    if (!response.ok) throw new Error('International padel data is unavailable');
    return parseProSnapshot(kind, await response.json());
  } finally { clearTimeout(timer); }
}

export async function fetchProFollows(userId: string): Promise<ProFollow[]> {
  const { data, error } = await supabase.from('pro_player_follows')
    .select('player_id,player_name,category').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function setProFollow(userId: string, player: ProFollow, following: boolean) {
  const query = following
    ? supabase.from('pro_player_follows').insert({ ...player, user_id: userId }).select('player_id')
    : supabase.from('pro_player_follows').delete().eq('user_id', userId).eq('player_id', player.player_id).select('player_id');
  const { data, error } = await query;
  // A duplicate means another device already followed this player.
  if (error && !(following && error.code === '23505')) throw error;
  if (following && !error && !data?.length) throw new Error('Follow was not saved');
}

export function selectProMatches(matches: ProMatch[], ids: number[] | null, filter: ProCategory | 'all' = 'all', upcoming = false) {
  const follows = ids === null ? null : new Set(ids);
  return [...new Map(matches.filter(m => (filter === 'all' || m.category === filter) &&
    (!follows || m.teams.some(t => t.some(p => follows.has(p.id))))).map(m => [m.id, m])).values()]
    .sort((a, b) => upcoming
      ? (a.scheduledAt || '9999').localeCompare(b.scheduledAt || '9999') || a.id - b.id
      : (b.playedAt || '').localeCompare(a.playedAt || '') || a.round - b.round || a.id - b.id);
}

export const proStale = (updatedAt: string, now = Date.now()) => now - Date.parse(updatedAt) > 48 * 3600000;
export function proDate(value?: string | null, time = false) {
  if (!value || !dated(value)) return time ? 'Date and time TBC' : 'Date TBC';
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg',
    ...(time ? { hour: '2-digit', minute: '2-digit' } as const : {}) }).format(new Date(value)) + (time ? ' SAST' : '');
}
export const proRound = (m: ProMatch) => m.roundName || ({ 1: 'Final', 2: 'Semi-final', 4: 'Quarter-final' }[m.round] ?? `Round of ${m.round * 2}`);
export const proStatus = (m: ProMatch) => ({ live: 'Live now', finished: 'Final score', retired: 'Retirement', walkover: 'Walkover', bye: 'Bye', ended: 'Unconfirmed score', scheduled: 'Scheduled at last update' }[m.status] ?? 'Result pending');
