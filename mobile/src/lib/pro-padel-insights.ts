import { invokeProResource, type ProviderFreshness } from './pro-padel-live';

export type InsightResult<T> = { data: T | null; unavailable?: 'subscription' | 'coverage'; freshness?: ProviderFreshness };
export type Rival = { id: number | string; name: string; nationality: string | null; played: number | null; won: number | null; winPercentage: number | null; firstMatchAt: string | null; lastMatchAt: string | null };
export type Rivals = { count: number | null; rivals: Rival[] };
export type PerformancePeriod = { from: string | null; to: string | null; expected: number | null; actual: number | null; delta: number | null; played: number | null };
export type Performance = PerformancePeriod & { trend: 'rising' | 'stable' | 'declining' | null; periods: PerformancePeriod[]; windows: { label: string; value: PerformancePeriod }[]; streak: { result: 'won' | 'lost'; matches: number } | null };
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown, min = 0, max = Infinity): number | null => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : null;
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && Number.isFinite(Date.parse(v)) ? v : null;
const pair = (v: unknown) => typeof v === 'string' && /^[1-9]\d*-[1-9]\d*$/.test(v);
function period(row: any): PerformancePeriod { return { from: date(row?.from), to: date(row?.to), expected: number(row?.expected_win_rate, 0, 100), actual: number(row?.actual_win_rate, 0, 100), delta: number(row?.delta, -100, 100), played: number(row?.matches_played) }; }
export function parsePerformance(value: unknown): Performance | null {
  if (!object(value) || !('matches_played' in value)) return null;
  return { ...period(value), trend: ['rising', 'stable', 'declining'].includes(value.trend) ? value.trend : null,
    periods: Array.isArray(value.by_period) ? value.by_period.filter(object).map(period) : [],
    windows: ['last_7_days', 'last_30_days', 'last_90_days'].filter(key => object(value.windows?.[key])).map(key => ({ label: key.replaceAll('_', ' '), value: period(value.windows[key]) })),
    streak: ['won', 'lost'].includes(value.streak?.result) && number(value.streak?.matches) !== null ? { result: value.streak.result, matches: Number(value.streak.matches) } : null };
}
export function parseRivals(value: unknown, kind: 'player' | 'pair'): Rivals | null {
  if (!object(value) || !Array.isArray(value.rivals)) return null;
  return { count: number(value.rivals_count), rivals: value.rivals.filter((row: any) => object(row) && typeof row.name === 'string' && row.name.trim() && (kind === 'pair' ? pair(row.id) : Number.isSafeInteger(row.id) && row.id > 0)).map((row: any) => ({ id: row.id, name: row.name.trim(), nationality: /^[A-Z]{2}$/.test(row.nationality || '') ? row.nationality : null, played: number(row.matches_played), won: number(row.matches_won), winPercentage: number(row.win_percentage, 0, 100), firstMatchAt: date(row.first_match_at), lastMatchAt: date(row.last_match_at) })) };
}
/** Only professional player IDs or provider pair IDs enter these endpoints. */
export async function fetchProInsight<T extends 'rivals' | 'performance'>(kind: T, subject: { player: number } | { pair: string }): Promise<InsightResult<T extends 'rivals' ? Rivals : Performance>> {
  const isPair = 'pair' in subject, id = isPair ? subject.pair : subject.player;
  if (isPair ? !pair(id) : !Number.isSafeInteger(id) || Number(id) <= 0) throw new Error('Invalid professional player or pair.');
  const value = await invokeProResource(kind === 'rivals' ? isPair ? 'pair-rivals' : 'player-rivals' : isPair ? 'pair-synergy' : 'player-form', id);
  if (value?.unavailable) return { data: null, unavailable: value.reason === 'subscription' ? 'subscription' : 'coverage' };
  // Pair order is equivalent, but a different player/pair must never be substituted.
  const identity = (v: unknown) => isPair && pair(v) ? String(v).split('-').map(Number).sort((a, b) => a - b).join('-') : String(v);
  if (!object(value) || identity(value.id) !== identity(id)) throw new Error('The provider returned a different player or pair.');
  const data = kind === 'rivals' ? parseRivals(value, isPair ? 'pair' : 'player') : parsePerformance(value);
  if (!data) throw new Error('This professional insight could not be displayed.');
  return { data: data as T extends 'rivals' ? Rivals : Performance, freshness: value._freshness };
}
