import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const storageKey = 'home-action-banner-dismissal-v1';
type Login = { user: { id: string }; access_token: string } | null;
export function homeBannerSession(session: Login): string | null {
  if (!session) return null;
  try {
    // Used only to scope a UI preference, never as an authorisation decision.
    const body = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(body.padEnd(Math.ceil(body.length / 4) * 4, '=')));
    return typeof claims.session_id === 'string' && claims.session_id ? `${session.user.id}:${claims.session_id}` : null;
  } catch { return null; }
}

export function useHomeBannerDismissal() {
  const [state, setState] = useState({ key: null as string | null, ready: false, hidden: false });
  const current = useRef<string | null | undefined>(undefined), version = useRef(0);
  useEffect(() => {
    let alive = true, received = false;
    const receive = (session: Login) => {
      received = true;
      const key = homeBannerSession(session);
      if (!alive || current.current === key) return;
      current.current = key; const request = ++version.current;
      setState({ key, ready: !key, hidden: false });
      if (!key) return;
      void AsyncStorage.getItem(storageKey).then(saved => {
        if (alive && request === version.current) setState({ key, ready: true, hidden: saved === key });
      }).catch(() => { if (alive && request === version.current) setState({ key, ready: true, hidden: false }); });
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => receive(session));
    void supabase.auth.getSession().then(({ data }) => { if (!received) receive(data.session); }).catch(() => { if (!received) receive(null); });
    return () => { alive = false; version.current++; data.subscription.unsubscribe(); };
  }, []);
  const dismiss = () => {
    version.current++;
    const key = current.current || null;
    setState({ key, ready: true, hidden: true });
    if (key) void AsyncStorage.setItem(storageKey, key).catch(() => {});
  };
  return { ready: state.ready, hidden: state.hidden, dismiss };
}
