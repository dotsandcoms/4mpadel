import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { fetchPendingActions, type PendingAction } from '@/lib/home';
import { notificationEventIds, type NotificationEvent, type PlayerNotification } from '@/lib/notification-centre';
import { fetchNotificationSnapshot, markNotificationsRead } from '@/lib/notification-read-state';

type Owner = { key: string; email: string; id: string };
type State = { owner?: string; actions: PendingAction[]; notifications: PlayerNotification[]; events: NotificationEvent[]; unread: number; through: string | null; loading: boolean; error: string };
const empty: State = { actions: [], notifications: [], events: [], unread: 0, through: null, loading: true, error: '' };

export function useNotificationCentre() {
  const [owner, setOwner] = useState<Owner | null>(), [state, setState] = useState<State>(empty);
  const version = useRef(0), currentOwner = useRef<string | null>(null), reading = useRef<object | null>(null);
  useEffect(() => {
    let mounted = true, received = false;
    const receive = (user: { id: string; email?: string } | null) => {
      received = true;
      if (!mounted) return;
      const email = user?.email?.trim().toLowerCase() || '';
      const next = user && email ? { id: user.id, email, key: `${user.id}:${email}` } : null;
      if (currentOwner.current === (next?.key ?? null)) { if (!next) setOwner(null); return; }
      currentOwner.current = next?.key ?? null; version.current++; reading.current = null;
      setState(empty); setOwner(next);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => receive(session?.user ?? null));
    void supabase.auth.getSession().then(({ data }) => { if (!received) receive(data.session?.user ?? null); }).catch(() => { if (!received) receive(null); });
    return () => { mounted = false; version.current++; data.subscription.unsubscribe(); };
  }, []);
  const email = owner?.email ?? '', key = owner?.key;
  const load = useCallback(async () => {
    if (!key) return;
    const request = ++version.current;
    const valid = () => request === version.current && currentOwner.current === key;
    setState(previous => ({ ...(previous.owner === key ? previous : empty), owner: key, loading: true, error: '' }));
    const [pending, history] = await Promise.allSettled([
      fetchPendingActions(email, true),
      fetchNotificationSnapshot(),
    ]);
    if (!valid()) return;
    const actions = pending.status === 'fulfilled' ? pending.value : [];
    const notifications = history.status === 'fulfilled' ? history.value.items : [];
    const error = pending.status === 'rejected' || history.status === 'rejected' ? 'Some notifications couldn’t load. Pull down to retry.' : '';
    setState({ owner: key, actions, notifications, events: [], unread: history.status === 'fulfilled' ? history.value.unread : 0, through: history.status === 'fulfilled' ? history.value.through : null, loading: false, error });
    const ids = notificationEventIds(actions, notifications);
    if (!ids.length) return;
    try {
      const events: NotificationEvent[] = [];
      for (let offset = 0; offset < ids.length; offset += 50) {
        if (!valid()) return;
        const result = await supabase.from('calendar').select('id,event_name,start_date,city,custom_image_url,poster_image_url,image_url,sapa_status').in('id', ids.slice(offset, offset + 50));
        if (result.error) throw result.error;
        events.push(...result.data as NotificationEvent[]);
      }
      if (valid()) setState(previous => ({ ...previous, events }));
    } catch { if (valid()) setState(previous => ({ ...previous, error: previous.error || 'Some event details couldn’t load. Pull down to retry.' })); }
  }, [key, email]);
  const markRead = useCallback(async (ids?: string[]) => {
    if (!key || currentOwner.current !== key || reading.current) return false;
    const request = ++version.current, token = {};
    reading.current = token;
    try {
      const result = await markNotificationsRead(ids, ids ? undefined : state.through ?? undefined);
      if (currentOwner.current !== key || request !== version.current) return false;
      setState(previous => ({ ...previous, notifications: result.items, unread: result.unread, through: result.through, loading: false, error: '' }));
      return true;
    } catch {
      if (currentOwner.current === key && request === version.current) setState(previous => ({ ...previous, loading: false, error: 'Couldn’t mark notifications read. Please try again.' }));
      return false;
    } finally { if (reading.current === token) reading.current = null; }
  }, [key, state.through]);
  useFocusEffect(useCallback(() => { void load(); return () => { version.current++; }; }, [load]));
  const current = state.owner === key && !!key;
  return { ...(current ? state : { ...empty, loading: owner === undefined }), ownerKey: key, signedIn: !!owner, refresh: load, markRead };
}
