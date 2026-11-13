import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { helpApi, type HelpCursor, type HelpRequest } from '@/lib/help-requests';

type HelpInboxPage = { rows: HelpRequest[]; unread: number; next: HelpCursor | null; topics: string[]; needsVerification: boolean };
type HelpInbox = HelpInboxPage & { owner: string | null; loading: boolean; error: string; revision: number; refresh: () => Promise<void>; loadMore: () => Promise<void> };
const empty: HelpInboxPage = { rows: [], unread: 0, next: null, topics: [], needsVerification: false };
const Context = createContext<HelpInbox | null>(null);
export function HelpInboxProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [owner, setOwner] = useState<string | null>(null), [page, setPage] = useState(empty);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const account = useRef<string | null>(null), epoch = useRef(0), pending = useRef(false), again = useRef(false);
  const foreground = useRef(AppState.currentState === 'active'), cursor = useRef<HelpCursor | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async (append = false) => {
    if (!account.current || !foreground.current || (append && !cursor.current)) return;
    if (pending.current) { if (!append) again.current = true; return; }
    pending.current = true; setLoading(true); const version = epoch.current;
    try {
      const result = await helpApi<HelpInboxPage>('inbox', append ? { ...cursor.current } : {});
      if (version !== epoch.current || !foreground.current) return;
      cursor.current = result.next;
      setPage(previous => ({ ...result, rows: append ? [...new Map([...previous.rows, ...result.rows].map(row => [row.id, row])).values()] : result.rows }));
      setError('');
    } catch (e) {
      if (version === epoch.current) { setPage(empty); cursor.current = null; setError(e instanceof Error ? e.message : 'Help messages could not load.'); }
    } finally {
      pending.current = false;
      if (version === epoch.current) setLoading(false);
      if (again.current) { again.current = false; void refresh(); }
    }
  }, []);
  const signal = useCallback(() => {
    if (!foreground.current || timer.current) return;
    timer.current = setTimeout(() => { timer.current = null; setRevision(value => value + 1); void refresh(); }, 400);
  }, [refresh]);
  useEffect(() => {
    let alive = true, received = false;
    const receive = (id: string | null) => {
      received = true; if (!alive) return;
      epoch.current++; account.current = id; cursor.current = null;
      setOwner(id); setPage(empty); setError(''); setRevision(value => value + 1);
      setTimeout(() => { if (alive) void refresh(); }, 0);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => receive(session?.user.id ?? null));
    void supabase.auth.getSession().then(({ data }) => { if (!received) receive(data.session?.user.id ?? null); }).catch(() => {});
    const app = AppState.addEventListener('change', state => {
      foreground.current = state === 'active'; epoch.current++; cursor.current = null;
      setPage(empty); setLoading(false); setRevision(value => value + 1);
      if (foreground.current) void refresh();
    });
    // Reconcile a missed signal while visible; background clients do no polling.
    const repair = setInterval(() => { if (foreground.current) void refresh(); }, 60000);
    return () => { alive = false; epoch.current++; data.subscription.unsubscribe(); app.remove(); clearInterval(repair); if (timer.current) clearTimeout(timer.current); };
  }, [refresh]);
  const topics = page.topics.join(',');
  useEffect(() => {
    if (!owner || !topics || !foreground.current) return;
    const channels = topics.split(',').map(topic => supabase.channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'help_changed' }, signal).subscribe());
    return () => { for (const channel of channels) void supabase.removeChannel(channel); };
  }, [owner, topics, signal]);
  useEffect(() => { void refresh(); }, [pathname, refresh]);
  return <Context.Provider value={{ ...page, owner, loading, error, revision, refresh: () => refresh(), loadMore: () => refresh(true) }}>{children}</Context.Provider>;
}
export function useHelpInbox() {
  const value = useContext(Context);
  if (!value) throw new Error('HelpInboxProvider is required.');
  return value;
}
