import { supabase } from './supabase';
import type { DirectoryPlayer } from './players';
import type { RankingPlayer } from './rankings';
import type { ProPlayer } from './pro-padel';
export type HubPlayer = { key: string; source: '4m' | 'pro'; id: string; rankedinId?: string; name: string; photo: string | null; gender: 'men' | 'women' | 'unknown'; rank: number | null; fipRank?: number | null; fipPlayerId?: number; fipProfileUrl?: string; fipName?: string; fipUnverified?: boolean; points: number | null; subtitle: string; pro?: ProPlayer };
export type OfficialFipProfile = { name: string; url: string; rank: number | null; premierBestRank: number | null };
export type PlayerFipLink = { local_player_id: number; fip_player_id: number | null; fip_profile_url?: string | null; fip_player_name: string; fip_category: 'men' | 'women'; fip_rank: number | null; fip_points?: number | null; fip_nationality?: string | null; fip_photo_url?: string | null; fip_hand?: string | null; fip_side?: string | null; status: 'pending' | 'verified' };

export async function fetchPlayerFipLinks(): Promise<PlayerFipLink[]> {
  const links: PlayerFipLink[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('player_fip_links')
      .select('local_player_id,fip_player_id,fip_profile_url,fip_player_name,fip_category,fip_rank,fip_points,fip_nationality,fip_photo_url,fip_hand,fip_side,status')
      .order('local_player_id').range(from, from + 999);
    if (error) throw error;
    links.push(...(data || []) as PlayerFipLink[]);
    if (!data || data.length < 1000) return links;
  }
}

/** Keep the editable 4M identity as the primary card and suppress its FIP duplicate. */
export function mergeLinkedPlayers(locals: HubPlayer[], pros: HubPlayer[], links: PlayerFipLink[]) {
  const byLocal = new Map(links.map(link => [String(link.local_player_id), link]));
  const byPro = new Map(pros.map(p => [Number(p.id), p]));
  const merged = locals.map(p => {
    const link = byLocal.get(p.id);
    if (!link) return p;
    const fip = link.fip_player_id == null ? undefined : byPro.get(link.fip_player_id);
    return { ...p, fipPlayerId: link.fip_player_id ?? undefined, fipProfileUrl: link.fip_profile_url ?? undefined, fipName: link.fip_player_name, fipRank: fip?.rank ?? link.fip_rank,
      fipUnverified: link.status !== 'verified',
      gender: p.gender === 'unknown' ? link.fip_category : p.gender };
  });
  const linkedIds = new Set(merged.filter(p => !p.fipUnverified).map(p => p.fipPlayerId).filter((id): id is number => id != null));
  return { locals: merged, pros: pros.filter(p => !linkedIds.has(Number(p.id))) };
}

export function playerRankLabel(p: HubPlayer): string {
  const first = p.source === '4m' ? p.rank ? `SAPA #${p.rank}` : '4M' : p.rank ? `FIP #${p.rank}` : 'FIP';
  return p.source === '4m' && (p.fipPlayerId || p.fipProfileUrl) ? `${first} · ${p.fipRank ? `FIP #${p.fipRank}` : 'FIP rank not listed'}` : first;
}
export function localHubPlayer(p: DirectoryPlayer): HubPlayer {
  const category = (p.category || '').toLowerCase();
  const gender = /women|ladies|female/.test(category) ? 'women' : /men|male/.test(category) ? 'men' : 'unknown';
  const rank = Number(String(p.rank_label || '').replace(/^#/, ''));
  return { key: `4m:${p.id}`, source: '4m', id: p.id, rankedinId: p.rankedin_id ? String(p.rankedin_id) : undefined, name: p.name, photo: p.image_url, gender, rank: rank > 0 && Number.isFinite(rank) ? rank : null, points: p.points, subtitle: p.home_club || p.category || '4M player' };
}
export function playerCountryLabel(value: string | null | undefined): string {
  const code = value?.trim().toUpperCase();
  if (!code) return 'FIP player';
  if (!/^[A-Z]{2}$/.test(code)) return value!.trim();
  return `${playerCountryFlag(code)} ${code}`;
}
export function playerCountryFlag(value: string | null | undefined): string {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(letter => 0x1F1E6 + letter.charCodeAt(0) - 65)) : '';
}
export function proHubPlayer(p: ProPlayer): HubPlayer {
  return { key: `pro:${p.id}`, source: 'pro', id: String(p.id), name: p.name, photo: p.photoUrl, gender: p.category, rank: p.rank != null && p.rank > 0 ? p.rank : null, points: p.points, subtitle: playerCountryLabel(p.nationality), pro: p };
}
export const normalizeName = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function filterHubPlayers(rows: HubPlayer[], query: string, source: string, gender: string) {
  const q = normalizeName(query);
  return rows.filter(p => (source === 'all' || p.source === source || source === 'pro' && p.source === '4m' && !!(p.fipPlayerId || p.fipProfileUrl)) && (gender === 'all' || p.gender === gender) && (normalizeName(p.name).includes(q) || !!p.fipName && normalizeName(p.fipName).includes(q)));
}
export function topLocalPlayers(rows: HubPlayer[], gender: 'men' | 'women') {
  return rows.filter(p => p.source === '4m' && p.gender === gender && p.rank !== null).sort((a, b) => a.rank! - b.rank! || a.name.localeCompare(b.name)).slice(0, 20);
}
async function invokePlayerSearch(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('player-search', { body });
  if (error || data?.error) {
    let message = data?.error;
    if (!message && error?.context instanceof Response) { try { message = (await error.context.json()).error; } catch {} }
    throw new Error(message || 'FIP search could not be loaded. Please retry.');
  }
  return data;
}
export async function searchProPlayers(query: string, category = 'all', page = 1, id?: number): Promise<{ players: ProPlayer[]; officialProfiles: OfficialFipProfile[]; hasMore: boolean; total: number | null }> {
  const data = await invokePlayerSearch({ query, category, page, id });
  if (!Array.isArray(data?.players)) throw new Error('Invalid player search response.');
  return { ...data, officialProfiles: Array.isArray(data.officialProfiles) ? data.officialProfiles : [] };
}
export async function lookupOfficialFipProfile(url: string): Promise<OfficialFipProfile> {
  const data = await invokePlayerSearch({ fipUrl: url });
  if (typeof data?.officialProfile?.name !== 'string' || typeof data.officialProfile.url !== 'string') throw new Error('Invalid official FIP profile response.');
  return data.officialProfile;
}
export async function fetchLocalFollows(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('local_player_follows').select('player_id').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(p => String(p.player_id));
}
export async function setLocalFollow(userId: string, playerId: string, follow: boolean) {
  const q = follow ? supabase.from('local_player_follows').insert({ user_id: userId, player_id: playerId }).select('player_id') : supabase.from('local_player_follows').delete().eq('user_id', userId).eq('player_id', playerId).select('player_id');
  const { data, error } = await q;
  if (error && !(follow && error.code === '23505')) throw error;
  if (follow && !error && !data?.length) throw new Error('Follow was not saved.');
}

/** Featured positions must come from the same national table, never age-group profile labels. */
export function rankedLocalPlayers(players: DirectoryPlayer[], men: RankingPlayer[], women: RankingPlayer[]): HubPlayer[] {
  const rankings = [...men.map(r => ({ ...r, gender: 'men' as const })), ...women.map(r => ({ ...r, gender: 'women' as const }))];
  const names = new Map<string, number>();
  for (const p of players) names.set(normalizeName(p.name), (names.get(normalizeName(p.name)) || 0) + 1);
  return players.map(p => {
    const exact = p.rankedin_id ? rankings.filter(r => r.rankedinId === String(p.rankedin_id)) : [];
    const matchingNames = rankings.filter(r => normalizeName(r.name) === normalizeName(p.name));
    const match = exact.length === 1 ? exact[0] : !p.rankedin_id && matchingNames.length === 1 && names.get(normalizeName(p.name)) === 1 ? matchingNames[0] : undefined;
    return { ...localHubPlayer(p), rank: match?.rank || null, points: match?.points ?? p.points, ...(match ? { gender: match.gender } : {}) };
  });
}

/** A source filter without followed players should still offer players to discover. */
export function homePlayerSelection(personal: boolean, followed: HubPlayer[], suggestions: HubPlayer[]) {
  const showingFollowed = personal && followed.length > 0;
  return { showingFollowed, players: showingFollowed ? followed : suggestions };
}
