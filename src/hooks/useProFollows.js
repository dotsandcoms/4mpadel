import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function useProFollows() {
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState({ userId: null, rows: [], loading: true, error: '' });
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState([]);
  const activeUser = useRef(null);
  const locks = useRef(new Set());
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const nextId = next?.user?.id || null;
      if (activeUser.current !== nextId) setState({ userId: nextId, rows: [], loading: true, error: '' });
      activeUser.current = nextId;
      setSession(next);
    });
    return () => { activeUser.current = null; data.subscription.unsubscribe(); };
  }, []);
  const userId = session?.user?.id || null;
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    supabase.from('pro_player_follows').select('player_id,player_name,category,created_at').eq('user_id', userId).order('created_at', { ascending: false }).abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (!controller.signal.aborted && activeUser.current === userId) setState({ userId, rows: error ? [] : data, loading: false, error: error ? 'Your followed players could not be loaded. Please retry.' : '' });
      });
    return () => controller.abort();
  }, [userId, attempt]);
  const loading = session === undefined || Boolean(userId && (state.userId !== userId || state.loading));
  const rows = userId && state.userId === userId ? state.rows : [];
  const error = userId && state.userId === userId ? state.error : '';
  async function toggle(player) {
    if (!userId || loading || error) return;
    const lock = `${userId}:${player.id}`;
    if (locks.current.has(lock)) return;
    locks.current.add(lock); setPending([...locks.current]);
    const followed = rows.some((row) => row.player_id === player.id);
    try {
      const query = followed
        ? supabase.from('pro_player_follows').delete().eq('user_id', userId).eq('player_id', player.id).select('player_id')
        : supabase.from('pro_player_follows').insert({ user_id: userId, player_id: player.id, player_name: player.name, category: player.category }).select('player_id,player_name,category,created_at');
      const { data, error: writeError } = await query;
      if (writeError || !followed && !data?.length) throw new Error('write');
      if (activeUser.current === userId) setState((current) => ({ ...current, rows: followed ? current.rows.filter((row) => row.player_id !== player.id) : [...current.rows.filter((row) => row.player_id !== player.id), data[0]], error: '' }));
    } catch {
      if (activeUser.current === userId) setState((current) => ({ ...current, error: 'That change could not be saved. Retry to reload your followed players.' }));
    } finally { locks.current.delete(lock); setPending([...locks.current]); }
  }
  return { signedIn: Boolean(userId), loading, rows, error, toggle,
    isFollowing: (id) => rows.some((row) => row.player_id === id),
    isPending: (id) => pending.includes(`${userId}:${id}`),
    retry: () => { setState((current) => ({ ...current, loading: true, error: '' })); setAttempt((value) => value + 1); },
  };
}
