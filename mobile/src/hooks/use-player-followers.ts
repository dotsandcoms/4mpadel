import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchPlayerFollowers, type PlayerFollower } from '@/lib/player-followers';
import { supabase } from '@/lib/supabase';

const empty = () => ({ followers: [] as PlayerFollower[], total: 0, hasMore: false,
  loading: true, refreshing: false, loadingMore: false, error: '', moreError: '', signInRequired: false });

export function usePlayerFollowers(playerId: string) {
  const [state, setState] = useState(empty);
  const sequence = useRef(0), busy = useRef(false), offset = useRef(0), more = useRef(false);
  const owner = useRef<string | null | undefined>(undefined);

  const load = useCallback(async (append = false) => {
    if (append && (busy.current || !more.current)) return;
    const current = ++sequence.current, from = append ? offset.current : 0;
    busy.current = true;
    setState(previous => ({ ...previous, loading: !append && !previous.followers.length,
      refreshing: !append && !!previous.followers.length, loadingMore: append, error: '', moreError: '' }));
    try {
      const { data, error } = await supabase.auth.getSession();
      if (current !== sequence.current) return;
      if (error) throw error;
      if (!data.session) {
        more.current = false;
        setState({ ...empty(), loading: false, signInRequired: true });
        return;
      }
      owner.current = data.session.user.id;
      const page = await fetchPlayerFollowers(playerId, from);
      if (current !== sequence.current) return;
      offset.current = from + page.followers.length;
      more.current = page.hasMore;
      setState(previous => ({ ...empty(), loading: false, total: page.total, hasMore: page.hasMore,
        followers: append ? [...new Map([...previous.followers, ...page.followers].map(row => [row.id, row])).values()] : page.followers }));
    } catch {
      if (current === sequence.current) setState(previous => ({ ...previous,
        ...(append ? { moreError: 'Could not load more followers. Please try again.' }
          : { error: 'Could not load your followers. Please try again.' }) }));
    } finally {
      if (current === sequence.current) {
        busy.current = false;
        setState(previous => ({ ...previous, loading: false, refreshing: false, loadingMore: false }));
      }
    }
  }, [playerId]);

  useFocusEffect(useCallback(() => {
    let active = true;
    owner.current = undefined; offset.current = 0; more.current = false;
    setState(empty());
    void load();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user.id ?? null, previous = owner.current;
      owner.current = next;
      if (previous === next || previous === undefined && event === 'INITIAL_SESSION') return;
      sequence.current++; busy.current = false; offset.current = 0; more.current = false;
      setState({ ...empty(), loading: !!next, signInRequired: !next });
      // Leave Supabase's auth callback before starting an authenticated request.
      if (next) void Promise.resolve().then(() => { if (active) void load(); });
    });
    return () => { active = false; sequence.current++; busy.current = false; data.subscription.unsubscribe(); };
  }, [load]));

  return { ...state, refresh: () => load(), loadMore: () => load(true) };
}
