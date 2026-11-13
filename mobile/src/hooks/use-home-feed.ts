import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { homeFeedCache } from '@/lib/home-feed-cache';
import { fetchFeatured, fetchHappeningNow, fetchPendingPayments, fetchPlayer, fetchRecentResults, fetchSchedule } from '@/lib/home';
import { fetchFollowingFeed } from '@/lib/following-feed';
import { fetchMediaAlbums } from '@/lib/media';
import { fetchProSnapshot } from '@/lib/pro-padel';
import { fetchPlayerMatches } from '@/lib/matches';
import { fetchLiveTournaments } from '@/lib/pro-padel-live';
import { fetchHomeTourPresentation } from '@/lib/home-tour-presentation';
import { homeTourEvents } from '@/lib/home-feed';
import { useScreenActive } from './use-screen-active';

export type HomeSource = '4m' | 'international';
export type HomeResource<T> = { data: T | undefined; loading: boolean; error: boolean; refresh: (force?: boolean) => Promise<void> };
type Owner = { key: string; id: string | null; email: string };

function useHomeResource<T>(owner: Owner | undefined, active: boolean, key: string, ttl: number, fetcher: () => Promise<T>, enabled = true): HomeResource<T> {
  const [state, setState] = useState<{ owner?: string; key?: string; data?: T; loading: boolean; error: boolean }>({ loading: true, error: false });
  const generation = useRef(0), fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  const refresh = useCallback(async (force = false) => {
    if (!owner || !active || !enabled) return;
    const version = ++generation.current;
    const cached = homeFeedCache.read<T>(owner.key, key);
    setState({ owner: owner.key, key, data: cached, loading: cached === undefined, error: false });
    try {
      const data = await homeFeedCache.load(owner.key, key, ttl, () => fetchRef.current(), force);
      if (version === generation.current) setState({ owner: owner.key, key, data, loading: false, error: false });
    } catch {
      if (version === generation.current) setState({ owner: owner.key, key, data: cached, loading: false, error: true });
    }
  }, [owner?.key, active, enabled, key, ttl]);
  useEffect(() => {
    void refresh();
    return () => { generation.current++; };
  }, [refresh]);
  // Never paint an old account's data, including the render before the effect runs.
  const current = owner && state.owner === owner.key && state.key === key;
  return { data: current ? state.data : undefined, loading: enabled && (!current || state.loading), error: current ? state.error : false, refresh };
}

export function useHomeFeed(source: HomeSource, enabled = true) {
  const screenActive = useScreenActive();
  const active = screenActive && enabled;
  const [owner, setOwner] = useState<Owner>();
  useEffect(() => {
    let mounted = true, received = false;
    const receive = (user: { id: string; email?: string } | null) => {
      received = true;
      if (!mounted) return;
      const email = user?.email?.trim().toLowerCase() || '';
      const next = { id: user?.id ?? null, email, key: user ? `${user.id}:${email}` : 'guest' };
      homeFeedCache.setOwner(next.key);
      setOwner(current => current?.key === next.key ? current : next);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => receive(session?.user ?? null));
    void supabase.auth.getSession().then(({ data }) => { if (!received) receive(data.session?.user ?? null); })
      .catch(() => { if (!received) receive(null); });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);
  const email = owner?.email ?? '';
  const signedIn = owner?.id != null && email !== '';
  const profile = useHomeResource(owner, screenActive, 'profile:sapa-main-v1', 60000, async () => {
    const player = await fetchPlayer(email, true);
    return player ? { ...player, winLoss: null } : null;
  }, signedIn);
  const schedule = useHomeResource(owner, active, 'schedule', 60000, () => fetchSchedule(email, true), signedIn);
  const payments = useHomeResource(owner, active, 'payments', 60000, () => fetchPendingPayments(email, true), signedIn);
  const following = useHomeResource(owner, active, 'following', 45000, () => fetchFollowingFeed('all', 12), signedIn);
  const matches = useHomeResource(owner, active, `matches:${profile.data?.rankedin_id ?? ''}`, 300000,
    () => fetchPlayerMatches(profile.data?.rankedin_id, { includeHistory: false, requireUpcoming: true }), !!profile.data?.rankedin_id);
  const local = source === '4m';
  const spotlight = useHomeResource(owner, active, 'spotlight', 90000, () => fetchFeatured(true), local);
  const happening = useHomeResource(owner, active, 'happening', 60000, () => fetchHappeningNow(true), local);
  const results = useHomeResource(owner, active, 'results:all-divisions', 180000, () => fetchRecentResults(true), local);
  const media = useHomeResource(owner, active, 'media', 300000, () => fetchMediaAlbums(undefined, 6), local);
  const tour = useHomeResource(owner, active, 'tour', 120000, () => fetchProSnapshot('tour'), !local);
  const fixtures = useHomeResource(owner, active, 'fixtures', 60000, () => fetchProSnapshot('fixtures'), !local);
  const live = useHomeResource(owner, active, 'live', 60000, fetchLiveTournaments, !local);
  const fip = useHomeResource(owner, active, 'fip', 3600000, () => fetchProSnapshot('fip-calendar'), !local);
  const presented = [...(live.data || []), ...homeTourEvents([...(fixtures.data?.tournament ? [fixtures.data.tournament] : []), ...(tour.data?.tournaments || [])])];
  const presentationIds = [...new Set(presented.filter(event => event.id > 0).map(event => event.id))].slice(0, 3);
  const tourPresentation = useHomeResource(owner, active, `tour-presentation:${presentationIds.join(',')}`, 900000, () => fetchHomeTourPresentation(presented), !local && signedIn && presentationIds.length > 0);
  useEffect(() => {
    if (!active || local) return;
    const timer = setInterval(() => { void live.refresh(true); }, 60000);
    return () => clearInterval(timer);
  }, [active, local, live.refresh]);
  const refresh = async () => {
    await Promise.allSettled([profile, schedule, payments, following, matches,
      ...(local ? [spotlight, happening, results, media] : [tour, fixtures, live, fip])].map(resource => resource.refresh(true)));
  };
  return { owner, active, signedIn, profile, schedule, payments, following, matches, spotlight, happening, results, media, tour, fixtures, live, fip, tourPresentation, refresh };
}
