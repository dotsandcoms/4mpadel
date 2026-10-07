import { supabase } from '@/lib/supabase';

export type PublicRanking = { org?: string; ranking_id?: number; age_group?: string; division?: string; match_type?: string; rank?: string | number; points?: number | string; details?: { name?: string; date?: string; class?: string; place?: string | number; points?: number | string }[] };
export type DirectoryPlayer = { rankedin_id?: string; id: string; name: string; image_url: string | null; home_club: string | null; category: string | null; rank_label: string | null; points: number | null };
export type PublicPlayer = DirectoryPlayer & { bio?: string; instagram_link?: string; match_form?: string; nationality?: string; region?: string; racket_brand?: string; court_side?: string | null; playing_hand?: string | null; skill_rating?: number; rankedin_id?: string; rankings: PublicRanking[]; sponsors: string[]; additional_images: string[] };
const columns = 'id,name,image_url,home_club,category,rank_label,points,rankedin_id';
export function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === 'string' && !!x.trim());
  if (typeof value !== 'string' || !value.trim()) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? stringList(parsed) : [value]; }
  catch { return value.split(',').map(x => x.trim()).filter(Boolean); }
}
export function publicRank(value: unknown): string {
  const rank = String(value ?? '').trim().replace(/^#/, '');
  return /^\d+$/.test(rank) && Number(rank) > 0 ? `#${rank}` : 'Unranked';
}
export function playerPoints(value: unknown): string {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return Math.round(Number(value)).toLocaleString('en-ZA');
}
export function sapaMainRanking(player: Pick<PublicPlayer, 'rankings' | 'category'>): PublicRanking | null {
  const sapa = player.rankings.filter(row => row.ranking_id === 15809 || row.org?.trim().toLowerCase() === 'sapa ranking');
  const category = (player.category || '').toLowerCase();
  const women = /women|woman|ladies|lady|female/.test(category);
  const men = /men|man|male/.test(category) && !women;
  const hasMenMain = sapa.some(row => row.age_group?.trim().toLowerCase() === 'men-main');
  const hasWomenMain = sapa.some(row => row.age_group?.trim().toLowerCase() === 'women-main');
  const ageGroup = women || (!men && hasWomenMain && !hasMenMain) ? 'women-main' : 'men-main';
  const main = sapa.filter(row => row.age_group?.trim().toLowerCase() === ageGroup);
  return main.find(row => row.match_type?.trim().toLowerCase() === `${ageGroup.split('-')[0]}-doubles`) ?? main[0] ?? null;
}
export function filterPlayers(players: DirectoryPlayer[], search: string, category: string, club: string) {
  const query = search.trim().toLocaleLowerCase();
  return players.filter(p => p.name.toLocaleLowerCase().includes(query) && (!category || p.category === category) && (!club || p.home_club === club));
}
export async function fetchDirectory(): Promise<DirectoryPlayer[]> {
  const players: DirectoryPlayer[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('players_public').select(columns).order('name').order('id').range(from, from + 999);
    if (error) throw error;
    const rows = data || [];
    players.push(...rows.map(p => ({ ...p, id: String(p.id), name: p.name || 'Player' })));
    if (rows.length < 1000) return players;
  }
}
export async function fetchPublicPlayer(id: string): Promise<PublicPlayer> {
  if (!/^\d+$/.test(id)) throw new Error('Player not found.');
  const { data, error } = await supabase.from('players_public').select(`${columns},bio,nationality,region,racket_brand,court_side,playing_hand,skill_rating,rankings,sponsors,additional_images,instagram_link,match_form`).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This player profile is no longer available.');
  return { ...data, id: String(data.id), name: data.name || 'Player', rankings: Array.isArray(data.rankings) ? data.rankings : [], sponsors: stringList(data.sponsors), additional_images: stringList(data.additional_images).filter(url => /^https:\/\//i.test(url)) };
}

export function pointsGain(value: unknown): string {
  const points = playerPoints(value);
  return points === '—' ? points : `${Number(value) > 0 ? '+' : ''}${points} PTS`;
}
export function playerForm(value?: string | null): string[] {
  return String(value || '').toUpperCase().split(/[\s/,]+/).filter(v => v === 'W' || v === 'L').slice(0, 5);
}
export function instagramUrl(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const raw = value.trim();
  if (/^@?[a-zA-Z0-9._]+$/.test(raw)) return `https://www.instagram.com/${raw.replace(/^@/, '')}/`;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['instagram.com', 'www.instagram.com'].includes(url.hostname.toLowerCase()) || !/^\/[a-zA-Z0-9._]+\/?$/.test(url.pathname)) return null;
    return `https://www.instagram.com${url.pathname}`;
  } catch { return null; }
}
