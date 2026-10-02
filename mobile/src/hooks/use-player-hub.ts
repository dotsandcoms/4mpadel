import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchDirectory } from '@/lib/players';
import { fetchLocalFollows, fetchPlayerFipLinks, mergeLinkedPlayers, setLocalFollow, rankedLocalPlayers, type HubPlayer, type PlayerFipLink } from '@/lib/player-hub';
import { categoriesFor, fetchRankings } from '@/lib/rankings';
import { useProPadel } from './use-pro-padel';

export function usePlayerHub() {
  const pro = useProPadel();
  const [locals, setLocals] = useState<HubPlayer[]>([]);
  const [fipLinks, setFipLinks] = useState<PlayerFipLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [localFollows, setLocalFollows] = useState<{ owner: string | null; ids: string[] }>({ owner: null, ids: [] });
  const [followError, setFollowError] = useState('');
  const [followLoading, setFollowLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const epoch = useRef(0), lock = useRef(false), owner = useRef(pro.userId);
  owner.current = pro.userId;
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [players, linkResult] = await Promise.all([fetchDirectory(), fetchPlayerFipLinks().then(value => ({ value, error: false })).catch(() => ({ value: [] as PlayerFipLink[], error: true }))]);
      const ranks = await Promise.allSettled(categoriesFor(15809).map(c => fetchRankings(15809, c)));
      const linked = rankedLocalPlayers(players, ranks[0].status === 'fulfilled' ? ranks[0].value : [], ranks[1].status === 'fulfilled' ? ranks[1].value : []);
      setFipLinks(linkResult.value);
      setLocals(mergeLinkedPlayers(linked, [], linkResult.value).locals);
      if (linkResult.error) setError('Some FIP links could not be loaded. Pull down to retry.');
      if (ranks.some(r => r.status === 'rejected')) setError('Some featured rankings could not be loaded. You can still search all 4M players.');
    } catch { setError('4M players could not be loaded. Pull down to retry.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useFocusEffect(useCallback(() => {
    const version = ++epoch.current;
    const id = pro.userId;
    setFollowLoading(true); setFollowError('');
    if (!id) { setLocalFollows({ owner: null, ids: [] }); setFollowLoading(false); return; }
    void fetchLocalFollows(id).then(ids => { if (epoch.current === version) setLocalFollows({ owner: id, ids }); }).catch(() => { if (epoch.current === version) setFollowError('Your 4M follows could not be loaded. Pull down to retry.'); }).finally(() => { if (epoch.current === version) setFollowLoading(false); });
    return () => { epoch.current++; };
  }, [pro.userId]));
  const refresh = async () => {
    await Promise.all([load(), pro.refresh()]);
    const id = owner.current;
    const version = ++epoch.current;
    if (id) try { const ids = await fetchLocalFollows(id); if (owner.current === id && epoch.current === version && !lock.current) { setLocalFollows({ owner: id, ids }); setFollowError(''); } } catch { setFollowError('Your 4M follows could not be refreshed.'); }
  };
  const ids = localFollows.owner === pro.userId ? localFollows.ids : [];
  const isFollowing = (p: HubPlayer) => p.source === '4m'
    ? ids.includes(p.id) || (!p.fipUnverified && !!p.fipPlayerId && pro.follows.some(f => f.player_id === p.fipPlayerId))
    : pro.follows.some(f => String(f.player_id) === p.id);
  const toggle = async (p: HubPlayer) => {
    if (!pro.userId || lock.current) return;
    if (p.source === 'pro') { await pro.toggleFollow({ player_id: Number(p.id), player_name: p.name, category: p.gender === 'women' ? 'women' : 'men' }); return; }
    if (followLoading || followError) return;
    if (!ids.includes(p.id) && p.fipPlayerId && !p.fipUnverified && pro.follows.some(f => f.player_id === p.fipPlayerId)) {
      await pro.toggleFollow({ player_id: p.fipPlayerId, player_name: p.name, category: p.gender === 'women' ? 'women' : 'men' });
      return;
    }
    const id = pro.userId, next = !ids.includes(p.id);
    epoch.current++; lock.current = true; setPending(p.key);
    try { await setLocalFollow(id, p.id, next); if (owner.current === id) setLocalFollows(s => ({ owner: id, ids: next ? [...new Set([...s.ids, p.id])] : s.ids.filter(x => x !== p.id) })); }
    catch { if (owner.current === id) setFollowError('Follow could not be saved. Pull down to retry.'); }
    finally { lock.current = false; setPending(null); }
  };
  return { pro, locals, fipLinks, loading, error, ids, followError, followLoading, pending, refresh, isFollowing, toggle };
}
