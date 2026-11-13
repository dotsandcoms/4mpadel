import { HelpInboxProvider, useHelpInbox } from '@/components/help-inbox-provider';
import { helpConversation } from '@/lib/help-inbox';
import { activateMessageDrafts, clearMessageDrafts } from '@/lib/messaging-drafts';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabase';
import { messagingFailure, unreadMessages, incomingChange, type Conversation, type MessagingStatus } from '@/lib/messaging';

type Notice = { id: string; title: string; detail: string };
type Inbox = { owner: string | null; rows: Conversation[]; status: MessagingStatus | null; loading: boolean; error: string; revision: number; refresh: () => Promise<void>; badge: number; notice: Notice | null; dismissNotice: () => void };
const Context = createContext<Inbox | null>(null);
function ChatInboxProvider({ children }: { children: ReactNode }) {
  const help = useHelpInbox();
  const pathname = usePathname(), location = useRef(pathname); location.current = pathname;
  const [owner, setOwner] = useState<string | null>(null), [rows, setRows] = useState<Conversation[]>([]);
  const [status, setStatus] = useState<MessagingStatus | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [notice, setNotice] = useState<Notice | null>(null);
  const epoch = useRef(0), account = useRef<string | null>(null), token = useRef(''), foreground = useRef(AppState.currentState === 'active');
  const pending = useRef(false), refreshAgain = useRef(false), connected = useRef(false), failures = useRef(0);
  const previous = useRef<Conversation[] | null>(null), signalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(async () => {
    if (!foreground.current || !account.current) return;
    if (pending.current) { refreshAgain.current = true; return; }
    pending.current = true; const version = epoch.current, id = account.current; setLoading(true);
    try {
      const result = await supabase.rpc('messaging_snapshot', { p_previews: location.current.startsWith('/messages') });
      if (result.error) throw messagingFailure(result.error);
      const next = result.data as { status: MessagingStatus; rows: Conversation[] };
      if (version === epoch.current && account.current === id && foreground.current) {
        const incoming = previous.current && incomingChange(previous.current, next.rows);
        if (incoming && location.current !== `/messages/${incoming.id}`) setNotice({ id: incoming.id, title: incoming.kind === 'direct' ? 'New message' : incoming.title, detail: incoming.kind === 'event_announcements' ? 'New event announcement' : incoming.notificationIsReply ? 'New reply to your message' : 'You have a new message' });
        previous.current = next.rows; failures.current = 0;
        setStatus(next.status); setRows(next.rows); setError('');
      }
    } catch (e) {
      if (version === epoch.current && foreground.current) { failures.current++; setRows([]); setStatus(null); setNotice(null); setError(e instanceof Error ? e.message : 'Could not load messages.'); }
    } finally {
      pending.current = false;
      if (version === epoch.current) setLoading(false);
      if (refreshAgain.current) { refreshAgain.current = false; void refresh(); }
    }
  }, []);
  const signal = useCallback(() => {
    if (!foreground.current || signalTimer.current) return;
    signalTimer.current = setTimeout(() => { signalTimer.current = null; setRevision(v => v + 1); void refresh(); }, 600);
  }, [refresh]);
  useEffect(() => {
    let alive = true, received = false;
    const receive = (id: string | null, accessToken = '') => {
      received = true;
      if (!alive) return;
      token.current = accessToken;
      if (id !== account.current) {
        if (account.current) void clearMessageDrafts(account.current).catch(() => {});
        if (id) activateMessageDrafts(id);
        epoch.current++; account.current = id; previous.current = null; connected.current = false;
        setOwner(id); setRows([]); setStatus(null); setNotice(null); setError(''); setRevision(v => v + 1);
      }
      // Leave the Auth callback before asking Auth/Realtime for another session.
      setTimeout(() => { if (alive) { if (accessToken) void supabase.realtime.setAuth(accessToken).catch(() => {}); void refresh(); } }, 0);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => receive(session?.user.id ?? null, session?.access_token));
    void supabase.auth.getSession().then(({ data }) => { if (!received) receive(data.session?.user.id ?? null, data.session?.access_token); }).catch(() => {});
    const app = AppState.addEventListener('change', state => {
      foreground.current = state === 'active'; epoch.current++; setRevision(v => v + 1);
      if (!foreground.current) { setRows([]); setStatus(null); setNotice(null); setLoading(false); connected.current = false; }
      else void refresh();
    });
    const notification = Notifications.addNotificationReceivedListener(event => { if (event.request.content.data?.type === 'chat_message') signal(); });
    let timer: ReturnType<typeof setTimeout>;
    const repair = () => {
      // Healthy sockets generate no periodic inbox queries. Failed connections
      // reconcile with jitter and exponential backoff; foreground always refreshes.
      if (foreground.current && !connected.current) void refresh();
      timer = setTimeout(repair, Math.min(120000, 15000 * 2 ** Math.min(failures.current, 3)) + Math.random() * 15000);
    };
    timer = setTimeout(repair, 15000 + Math.random() * 15000);
    return () => { alive = false; epoch.current++; data.subscription.unsubscribe(); app.remove(); notification.remove(); clearTimeout(timer); if (signalTimer.current) clearTimeout(signalTimer.current); };
  }, [refresh, signal]);
  // Private/group sends signal the own-account topic; only events need shared thread topics.
  const topics = rows.filter(row => row.kind === 'event_announcements' || row.kind === 'event_discussion').map(row => row.id).sort().join(',');
  useEffect(() => {
    if (!owner || !status?.enabled) return;
    let cancelled = false;
    const channels: ReturnType<typeof supabase.channel>[] = [], joined = new Set<string>();
    const names = [`messaging:${owner}`, ...topics.split(',').filter(Boolean).map(id => `messaging-thread:${id}`)];
    void (async () => {
      await supabase.realtime.setAuth(token.current || undefined);
      if (cancelled) return;
      for (const name of names) {
        const channel = supabase.channel(name, { config: { private: true } }).on('broadcast', { event: 'inbox_changed' }, signal)
          .subscribe(state => { if (cancelled) return; if (state === 'SUBSCRIBED') joined.add(name); else joined.delete(name); connected.current = joined.size === names.length; });
        channels.push(channel);
      }
    })().catch(() => { connected.current = false; });
    return () => { cancelled = true; connected.current = false; for (const channel of channels) void supabase.removeChannel(channel); };
  }, [owner, status?.enabled, topics, signal]);
  useEffect(() => { if (owner) void refresh(); }, [owner, pathname, refresh]);
  return <Context.Provider value={{ owner, rows: [...rows, ...help.rows.map(helpConversation)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), status, loading, error, revision, refresh: async () => { await Promise.all([refresh(), help.refresh()]); }, badge: unreadMessages(rows) + help.unread, notice, dismissNotice: () => setNotice(null) }}>{children}</Context.Provider>;
}
export function useMessagingInbox() {
  const value = useContext(Context);
  if (!value) throw new Error('MessagingProvider is required.');
  return value;
}

export function MessagingProvider({ children }: { children: ReactNode }) {
  return <HelpInboxProvider><ChatInboxProvider>{children}</ChatInboxProvider></HelpInboxProvider>;
}
