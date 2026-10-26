import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fetchFollowingWindow, type FeedFilter, type FeedPage } from '@/lib/following-feed';
const empty: FeedPage = { items: [], hasMore: false, cursor: null };
export function useFollowingFeed(filter: FeedFilter = 'all', limit = 20) {
  const [userId, setUserId] = useState<string | null>(null);
  const [page, setPage] = useState<FeedPage>(empty);
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false), [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(''), [moreError, setMoreError] = useState(false);
  const epoch = useRef(0), owner = useRef<string | null>(null), focused = useRef(false), active = useRef(true), ready = useRef(false), current = useRef(empty), moreLock = useRef(false);
  const previousFilter = useRef(filter);
  const refresh = useCallback(async (initial = false) => {
    if (!ready.current || !owner.current) return;
    const version = ++epoch.current, id = owner.current;
    moreLock.current = false; setLoadingMore(false); setError(''); setMoreError(false);
    if (initial) setLoading(true); else setRefreshing(true);
    try {
      const target = Math.max(limit, current.current.items.length);
      const next = await fetchFollowingWindow(filter, target, () => active.current && epoch.current === version && owner.current === id);
      if (active.current && epoch.current === version && owner.current === id) { current.current = next; setPage(next); }
    } catch { if (active.current && epoch.current === version) setError('Your updates could not be loaded. Please retry.'); }
    finally { if (active.current && epoch.current === version) { setLoading(false); setRefreshing(false); } }
  }, [filter, limit]);
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  useEffect(() => {
    active.current = true;
    let received = false;
    const receive = (id: string | null) => {
      received = true;
      if (ready.current && owner.current === id) return;
      ready.current = true; owner.current = id; epoch.current++; current.current = empty;
      setUserId(id); setPage(empty); setError(''); setRefreshing(false); setLoadingMore(false); setLoading(!!id);
      if (id && focused.current) void Promise.resolve().then(() => refreshRef.current(true));
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => receive(session?.user.id ?? null));
    void supabase.auth.getSession().then(({ data }) => { if (active.current && !received) receive(data.session?.user.id ?? null); }).catch(() => { if (active.current) { setError('Please sign in to view your updates.'); setLoading(false); } });
    return () => { active.current = false; epoch.current++; data.subscription.unsubscribe(); };
  }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    if (previousFilter.current !== filter) { previousFilter.current = filter; epoch.current++; current.current = empty; setPage(empty); }
    void refresh(!current.current.items.length);
    const timer = setInterval(() => { if (AppState.currentState === 'active' && !moreLock.current && current.current.items.length <= limit) void refresh(); }, 60000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(!current.current.items.length); });
    return () => { focused.current = false; epoch.current++; subscription.remove(); clearInterval(timer); };
  }, [refresh]));
  const loadMore = useCallback(async () => {
    const previous = current.current;
    if (!owner.current || !previous.hasMore || !previous.cursor || moreLock.current) return;
    setMoreError(false); moreLock.current = true; const version = epoch.current, id = owner.current; setLoadingMore(true); setError('');
    try {
      const next = await fetchFollowingWindow(filter, limit, () => active.current && epoch.current === version && owner.current === id, previous.cursor);
      if (active.current && version === epoch.current && id === owner.current) {
        const merged = { ...next, items: [...new Map([...previous.items, ...next.items].map(item => [item.id, item])).values()] };
        current.current = merged; setPage(merged);
      }
    } catch { if (active.current && version === epoch.current) { setError('More updates could not be loaded. Please retry.'); setMoreError(true); } }
    finally { if (version === epoch.current) { moreLock.current = false; setLoadingMore(false); } }
  }, [filter, limit]);
  return { ...page, userId, loading, refreshing, loadingMore, error, moreError, refresh, loadMore };
}
