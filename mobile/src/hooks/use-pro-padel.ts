import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { fetchProSnapshot, fetchProFollows, setProFollow, type ProFollow, type ProResource, type ProSnapshots } from '@/lib/pro-padel';

type Resources = { [K in keyof ProSnapshots]: ProResource<ProSnapshots[K]> };
const empty: Resources = { rankings: { data: null, error: null }, tour: { data: null, error: null }, fixtures: { data: null, error: null } };
const labels = { rankings: 'World rankings', tour: 'Tour results', fixtures: 'Upcoming matches' };

export function useProPadel() {
  const [resources, setResources] = useState<Resources>(empty);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [follows, setFollows] = useState<{ owner: string | null; rows: ProFollow[]; loading: boolean; error: string | null }>({ owner: null, rows: [], loading: true, error: null });
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const alive = useRef(false);
  const owner = useRef<string | null>(null);
  const authReady = useRef(false);
  const epoch = useRef(0);
  const snapshotRequest = useRef<Promise<void> | null>(null);
  const followRequest = useRef(0);
  const writeLock = useRef(false);

  const refreshFollows = useCallback(async () => {
    const id = owner.current;
    if (!authReady.current || !id || writeLock.current) return;
    const request = ++followRequest.current;
    const currentEpoch = epoch.current;
    try {
      const rows = await fetchProFollows(id);
      if (alive.current && owner.current === id && epoch.current === currentEpoch && request === followRequest.current)
        setFollows({ owner: id, rows, loading: false, error: null });
    } catch {
      if (alive.current && owner.current === id && epoch.current === currentEpoch && request === followRequest.current)
        setFollows(s => ({ owner: id, rows: s.owner === id ? s.rows : [], loading: false, error: 'Your followed players could not be loaded. Please retry.' }));
    }
  }, []);

  const refreshSnapshots = useCallback((): Promise<void> => {
    if (snapshotRequest.current) return snapshotRequest.current;
    setLoading(true);
    const request = Promise.all((['rankings', 'tour', 'fixtures'] as const).map(async kind => {
      try {
        const data = await fetchProSnapshot(kind);
        if (alive.current) setResources(s => ({ ...s, [kind]: { data, error: null } }));
      } catch {
        if (alive.current) setResources(s => ({ ...s, [kind]: { ...s[kind], error: `${labels[kind]} could not be refreshed. Please retry.` } }));
      }
    })).then(() => {}).finally(() => {
      snapshotRequest.current = null;
      if (alive.current) setLoading(false);
    });
    snapshotRequest.current = request;
    return request;
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([refreshSnapshots(), refreshFollows()]);
  }, [refreshSnapshots, refreshFollows]);

  useEffect(() => {
    alive.current = true;
    let authEvent = false;
    const receive = (id: string | null) => {
      const changed = !authReady.current || owner.current !== id;
      authReady.current = true;
      if (!changed) return;
      owner.current = id;
      epoch.current++;
      followRequest.current++;
      writeLock.current = false;
      setPendingId(null);
      setWriteError(null);
      setUserId(id);
      setFollows({ owner: id, rows: [], loading: !!id, error: null });
      // Keep database work outside Supabase's auth callback.
      if (id) void Promise.resolve().then(refreshFollows);
    };
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      authEvent = true;
      if (alive.current) receive(session?.user.id ?? null);
    });
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive.current || authEvent) return;
      if (error) throw error;
      receive(data.session?.user.id ?? null);
    }).catch(() => {
      if (alive.current && !authEvent) setFollows({ owner: null, rows: [], loading: false, error: 'Could not restore your follows. Reopen the app to retry.' });
    });
    return () => { alive.current = false; epoch.current++; subscription.subscription.unsubscribe(); };
  }, [refreshFollows]);

  useFocusEffect(useCallback(() => {
    void refresh();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]));

  async function toggleFollow(player: ProFollow) {
    const id = owner.current;
    if (!id || writeLock.current || follows.owner !== id || follows.loading || follows.error) return;
    const currentEpoch = epoch.current;
    const following = !follows.rows.some(row => row.player_id === player.player_id);
    writeLock.current = true;
    followRequest.current++;
    setPendingId(player.player_id);
    setWriteError(null);
    try {
      await setProFollow(id, player, following);
      if (alive.current && epoch.current === currentEpoch) setFollows(s => ({ ...s,
        rows: following ? [...s.rows.filter(p => p.player_id !== player.player_id), player] : s.rows.filter(p => p.player_id !== player.player_id) }));
    } catch {
      if (alive.current && epoch.current === currentEpoch) setWriteError('That follow change could not be saved. Please try again.');
    } finally {
      if (epoch.current === currentEpoch) {
        writeLock.current = false;
        if (alive.current) { setPendingId(null); void refreshFollows(); }
      }
    }
  }

  return { ...resources, loading, refresh, refreshFollows, userId,
    follows: follows.owner === userId ? follows.rows : [], followsLoading: follows.loading,
    followsError: follows.error, pendingId, writeError, toggleFollow };
}
export type ProPadelState = ReturnType<typeof useProPadel>;
