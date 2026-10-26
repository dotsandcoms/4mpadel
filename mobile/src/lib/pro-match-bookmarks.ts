import { trackEvent } from './analytics';
import { supabase } from '@/lib/supabase';
import type { MatchDetails } from '@/lib/pro-padel-live';

export type MatchBookmark = { notify: boolean; name: string; tournamentName: string; row?: MatchDetails };
let bookmarks = new Map<number, MatchBookmark>();
let owner: string | null = null;
let loadedAt = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
export const subscribeMatchBookmarks = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getMatchBookmarks = () => bookmarks;

supabase.auth.onAuthStateChange((_event, session) => {
  const next = session?.user.id || null;
  if (next !== owner) { owner = next; loadedAt = 0; bookmarks = new Map(); emit(); }
});
export async function refreshMatchBookmarks(force = false): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user.id || null;
    if (user !== owner) { owner = user; bookmarks = new Map(); loadedAt = 0; emit(); }
    if (!user || (!force && Date.now() - loadedAt < 60000)) return;
    const { data: rows, error } = await supabase.rpc('get_pro_match_bookmarks');
    if (error) throw new Error('Saved matches could not be loaded. Please retry.');
    if (owner !== user) return;
    bookmarks = new Map((Array.isArray(rows) ? rows : []).map((row: { match_id: number; notify_enabled: boolean; metadata?: { name?: string; tournament_name?: string } }) => [row.match_id, { notify: row.notify_enabled, name: row.metadata?.name || 'Saved match', tournamentName: row.metadata?.tournament_name || 'International padel', row: bookmarks.get(row.match_id)?.row }]));
    loadedAt = Date.now(); emit();
  })().finally(() => { loading = null; });
  return loading;
}
export async function saveMatchBookmark(row: MatchDetails, saved: boolean, notify: boolean) {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user.id;
  if (!user) throw new Error('Sign in to save matches.');
  const { error } = await supabase.rpc('set_pro_match_bookmark', { p_match_id: row.match.id, p_enabled: saved, p_notify: saved && notify,
    p_metadata: { name: row.match.teams.map(team => team.map(player => player.name).join(' / ') || 'Pair to be confirmed').join(' vs '), tournament_name: row.match.tournamentName, date: row.match.playedAt?.slice(0, 10) } });
  if (error) throw new Error(error.message || 'Your match could not be saved. Please retry.');
  void trackEvent('match_bookmark', { enabled: saved, notify: saved && notify });
  if (owner !== user) return;
  bookmarks = new Map(bookmarks);
  if (saved) bookmarks = new Map([[row.match.id, { notify, name: row.match.teams.map(team => team.map(player => player.name).join(' / ') || 'Pair to be confirmed').join(' vs '), tournamentName: row.match.tournamentName, row }], ...[...bookmarks].filter(([id]) => id !== row.match.id)]);
  else bookmarks.delete(row.match.id);
  emit();
}

export async function removeMatchBookmark(id: number) {
  const user = owner;
  const { error } = await supabase.rpc('set_pro_match_bookmark', { p_match_id: id, p_enabled: false, p_notify: false });
  if (error) throw new Error('The match could not be removed. Please retry.');
  void trackEvent('match_bookmark', { enabled: false, notify: false });
  if (owner !== user) return;
  bookmarks = new Map(bookmarks); bookmarks.delete(id); emit();
}
