import { trackEvent } from '@/lib/analytics';
import { useAnalyticsSearch } from '@/hooks/use-analytics-search';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useRoute } from 'expo-router/react-navigation';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebsiteHeader } from '@/components/events/website-ui';
import { LocalRankings } from '@/components/rankings/local-rankings';
import { ProPlayerProfile } from '@/components/players/pro-player-profile';
import { PlayerFollowAction } from '@/components/players/player-follow-action';
import { usePlayerHub } from '@/hooks/use-player-hub';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import { filterHubPlayers, playerCountryFlag, localPlayerCountryFlag, proHubPlayer, searchProPlayers, topLocalPlayers, type HubPlayer } from '@/lib/player-hub';
import { playerPoints } from '@/lib/players';
import { HomeAction } from '@/components/home-action';
import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { FeedPortrait } from '@/components/home-feed';
import { ErrorBanner } from '@/components/error-banner';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';
const LOCAL_BLUE = '#2449D8';
const panel = { padding: 16, borderRadius: 16, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge } as const;
type ViewName = 'Discover' | 'Following' | 'Rankings';

export default function PlayerHub() {
  const state = usePlayerHub(), router = useRouter(), safe = useSafeAreaInsets(), bottom = useTabScenePadding();
  const params = useLocalSearchParams<{ view?: string; source?: string; query?: string; gender?: string }>();
  const route = useRoute();
  const [view, setView] = useState<ViewName>('Discover');
  const [source, setSource] = useState('all'); const [gender, setGender] = useState('all');
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<HubPlayer[]>([]), [page, setPage] = useState(1), [more, setMore] = useState(false), [searching, setSearching] = useState(false), [searchError, setSearchError] = useState('');
  const [remoteTotal, setRemoteTotal] = useState<number | null>(null);
  const [browse, setBrowse] = useState(false), [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<HubPlayer | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
  const sequence = useRef(0);
  useFocusEffect(useCallback(() => { setMatchOpen(false); }, []));
  // A shortcut can resend the same params after the user changes the screen's filters.
  useEffect(() => {
    if (params.view === 'Tour') { router.replace('/calendar?circuit=pro'); return; }
    if (['Discover', 'Following', 'Rankings'].includes(params.view || '')) setView(params.view as ViewName);
    if (['all', '4m', 'pro'].includes(params.source || '')) setSource(params.source!);
    if (params.query != null) setQuery(params.query);
    if (['all', 'men', 'women'].includes(params.gender || '')) setGender(params.gender!);
  }, [route.params, params.view, params.source, params.query, params.gender, router]);
  useEffect(() => { if (view === 'Rankings') { if (source === 'all') setSource('4m'); if (gender === 'all') setGender('men'); } }, [view, source, gender]);
  const locals = state.locals;
  const localPlayersById = useMemo(() => new Map(locals.map(player => [player.id, player])), [locals]);
  const pros = useMemo(() => [...(state.pro.rankings.data?.categories.men.players || []), ...(state.pro.rankings.data?.categories.women.players || [])].map(proHubPlayer), [state.pro.rankings.data]);
  const all = useMemo(() => {
    const verified = new Set(state.fipLinks.filter(link => link.status === 'verified').map(link => link.fip_player_id));
    return [...new Map([...locals, ...pros.filter(p => !verified.has(Number(p.id))), ...remote.filter(p => !verified.has(Number(p.id)))].map(p => [p.key, p])).values()];
  }, [locals, pros, remote, state.fipLinks]);
  useEffect(() => { setPage(1); setRemote([]); setMore(false); setRemoteTotal(null); }, [query, gender, source, view]);
  useEffect(() => {
    const version = ++sequence.current;
    if (source === '4m' || !state.pro.userId || view === 'Following' || (!query.trim() && !browse && !(view === 'Rankings' && source === 'pro'))) { setSearching(false); setSearchError(''); return; }
    setSearching(true); setSearchError('');
    const timer = setTimeout(() => {
      void searchProPlayers(query.trim(), gender, page).then(result => {
        if (sequence.current !== version) return;
        setRemote(old => page === 1 ? result.players.map(proHubPlayer) : [...new Map([...old, ...result.players.map(proHubPlayer)].map(p => [p.key, p])).values()]); setMore(result.hasMore); setRemoteTotal(result.total);
      }).catch(e => { if (sequence.current === version) setSearchError(e.message); }).finally(() => { if (sequence.current === version) setSearching(false); });
    }, 600);
    return () => { clearTimeout(timer); sequence.current++; };
  }, [query, gender, source, page, browse, reload, view, state.pro.userId]);
  const followed = useMemo(() => {
    const rows = all.filter(state.isFollowing);
    for (const p of state.pro.follows) if (!rows.some(r => r.key === `pro:${p.player_id}` || r.fipPlayerId === p.player_id)) rows.push({ key: `pro:${p.player_id}`, source: 'pro', id: String(p.player_id), name: p.player_name, photo: null, gender: p.category, rank: null, points: null, subtitle: 'FIP player' });
    return rows;
  }, [all, state.ids, state.pro.follows]);
  const searchingDirectory = !!query.trim() || browse;
  const candidates = view === 'Following' ? followed : all;
  const results = filterHubPlayers(candidates, query, source, view === 'Following' ? 'all' : gender);
  useAnalyticsSearch(query, view === 'Rankings' ? filterHubPlayers(remote.length ? remote : pros, query, 'pro', gender).length : results.length, view === 'Rankings' ? 'rankings' : 'players', !state.loading && !state.pro.loading && !state.error && !searching && !searchError && (view !== 'Rankings' || source === 'pro'));
  const localTop = topLocalPlayers(locals, gender === 'women' ? 'women' : 'men');
  const verifiedFipIds = new Set(state.fipLinks.filter(link => link.status === 'verified').map(link => link.fip_player_id).filter((id): id is number => id != null));
  const proTop = pros.filter(p => !verifiedFipIds.has(Number(p.id)) && (gender === 'all' || p.gender === gender)).sort((a, z) => (a.rank ?? Infinity) - (z.rank ?? Infinity)).slice(0, 20);
  const signIn = () => router.push('/(auth)/sign-in');
  const follow = (p: HubPlayer) => { if (!state.pro.userId) signIn(); else void state.toggle(p); };
  const followDisabled = (p: HubPlayer) => !!state.pending || state.pro.pendingId !== null || (p.source === '4m' ? state.followLoading || !!state.followError : state.pro.followsLoading || !!state.pro.followsError);
  const openPlayer = (p: HubPlayer) => {
    if (p.source === '4m') { router.push({ pathname: '/players/[id]', params: { id: p.id } }); return; }
    setSelected(p);
  };
  const openMatchFromPlayer = (id: number, from: string) => {
    setMatchOpen(true);
    router.push({ pathname: '/pro/match/[id]', params: { id: String(id), from } });
  };
  const followButton = (p: HubPlayer) => <PlayerFollowAction name={p.name} following={state.isFollowing(p)}
    pending={state.pending === p.key || String(state.pro.pendingId) === p.id && p.source === 'pro'}
    accentColor={p.source === '4m' ? LOCAL_BLUE : b.accent} disabled={followDisabled(p)} onPress={() => follow(p)} />;
  const rankLabel = (p: HubPlayer) => p.source === '4m' ? p.rank ? `SAPA ${p.gender === 'women' ? 'Women' : 'Men'}-Main · #${p.rank}` : '4M player' : p.rank ? `FIP · #${p.rank}` : 'FIP player';
  const rail = (title: string, rows: HubPlayer[], local: boolean, category = gender) => <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 19, fontWeight: '600' }}>{title}</Text>
    <FlatList horizontal showsHorizontalScrollIndicator={false} data={rows} keyExtractor={p => p.key} initialNumToRender={3} maxToRenderPerBatch={4} windowSize={3} contentContainerStyle={{ gap: 12 }} renderItem={({ item: p }) => <View style={{ ...panel, width: 144, borderRadius: 18, padding: 8, gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${p.name}. ${rankLabel(p)}`} onPress={() => openPlayer(p)}>
        <View style={{ height: 128, borderRadius: 12, overflow: 'hidden', borderWidth: local ? 3 : 0, borderColor: LOCAL_BLUE, backgroundColor: b.surface }}>
          {p.photo ? <Image source={{ uri: p.photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" contentPosition="top" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: local ? LOCAL_BLUE : b.accent, fontWeight: '600', fontSize: 42 }}>{p.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</Text></View>}
          {p.rank && !local ? <Text accessibilityElementsHidden style={{ position: 'absolute', right: 8, top: 4, color: '#38601820', fontWeight: '800', fontSize: 44 }}>{p.rank}</Text> : null}
          {(local ? localPlayerCountryFlag(p.nationality) : playerCountryFlag(p.pro?.nationality)) ? <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: b.elevated, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2 }}><Text style={{ fontSize: 15 }}>{local ? localPlayerCountryFlag(p.nationality) : playerCountryFlag(p.pro?.nationality)}</Text></View> : null}
          <View style={{ position: 'absolute', bottom: 6, left: 6, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: local ? LOCAL_BLUE : b.accent }}><Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{p.rank ? `${local ? 'SAPA' : 'FIP'} #${p.rank}` : local ? '4M' : 'FIP'}</Text></View>
        </View>
        <Text numberOfLines={2} style={{ color: b.premium, fontWeight: '700', fontSize: 14, lineHeight: 18, minHeight: 36, marginTop: 8 }}>{p.name}</Text>
        <Text numberOfLines={1} style={{ color: b.muted, fontSize: 11, lineHeight: 16, marginTop: 4 }}>{local ? p.subtitle : `FIP ${p.gender === 'women' ? 'Women' : 'Men'}`}</Text>
        {p.fipUnverified && <Text style={{ color: b.muted, fontSize: 11, lineHeight: 16 }}>Unverified FIP link</Text>}
      </Pressable>
      {followButton(p)}
    </View>} />
  </View>;
  const row = (p: HubPlayer, ranking = false) => <View key={p.key} style={{ ...panel, padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${p.name}`} onPress={() => openPlayer(p)} style={{ flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      {ranking && <Text style={{ width: 24, color: b.premium, fontVariant: ['tabular-nums'] }}>{p.rank ?? '—'}</Text>}
      <FeedPortrait name={p.name} uri={p.photo} size={44} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={{ color: b.premium, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{p.name}</Text>
        <Text style={{ color: b.muted, fontSize: 12, lineHeight: 17 }}>{rankLabel(p)}{ranking ? ` · ${playerPoints(p.points)} pts` : ''}</Text>
        {!ranking && p.subtitle && <Text numberOfLines={1} style={{ color: b.muted, fontSize: 12 }}>{p.subtitle}</Text>}
        {p.fipUnverified && <Text style={{ color: b.muted, fontSize: 11 }}>Unverified FIP link</Text>}
      </View>
    </Pressable>{followButton(p)}
  </View>;
  return <View style={{ flex: 1, backgroundColor: b.page, paddingTop: safe.top }}><WebsiteHeader />
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 24, lineHeight: 30, fontWeight: '600' }}>Players</Text>
      <NativeSegmentedControl label="Players view" value={view} options={(['Discover', 'Following', 'Rankings'] as ViewName[]).map(value => ({ value, label: value }))} onChange={next => {
        void trackEvent('feature_interaction', { feature: 'player_hub', action: 'tab', selection: next.toLowerCase() });
        setView(next as ViewName); setBrowse(false);
        if (next === 'Rankings') { if (source === 'all') setSource('4m'); if (gender === 'all') setGender('men'); }
      }} />
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: b.elevated, borderRadius: 12, paddingLeft: 12 }}>
          <Ionicons name="search" size={18} color={b.muted} />
          <TextInput accessibilityLabel="Search players" placeholder={source === '4m' ? 'Find a 4M player' : source === 'pro' ? 'Find a FIP player' : 'Find a player'} placeholderTextColor={b.muted} value={query} onChangeText={setQuery} autoCorrect={false} style={{ flex: 1, minHeight: 44, paddingHorizontal: 10, color: b.premium, fontSize: 15 }} />
          {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear player search" onPress={() => setQuery('')} style={{ padding: 12 }}><Ionicons name="close-circle" size={18} color={b.muted} /></Pressable>}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}><NativeSegmentedControl label="Player directory" value={source} options={(view === 'Rankings' ? ['4m', 'pro'] : ['all', '4m', 'pro']).map(value => ({ value, label: value === 'all' ? 'All' : value === '4m' ? view === 'Rankings' ? 'SAPA' : '4M' : 'FIP' }))} onChange={setSource} /></View>
          {view !== 'Following' && <View style={{ flex: 1, minWidth: 0 }}><NativeSegmentedControl label="Player category" value={gender} options={(view === 'Rankings' ? ['men', 'women'] : ['all', 'men', 'women']).map(value => ({ value, label: value === 'all' ? 'All' : value === 'men' ? 'Men' : 'Women' }))} onChange={setGender} /></View>}
        </View>
      </>
    </View>
    {view === 'Rankings' && source !== 'pro' ? <LocalRankings embedded query={query} gender={gender} renderFollow={id => { const player = localPlayersById.get(id); return player ? followButton(player) : null; }} /> : <FlatList data={view === 'Rankings' ? filterHubPlayers(remote.length ? remote : pros, query, 'pro', gender).sort((a, z) => (a.rank ?? Infinity) - (z.rank ?? Infinity)) : searchingDirectory || view === 'Following' ? results : []} keyExtractor={p => p.key} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 16, paddingBottom: bottom, gap: 10 }} refreshing={state.loading && locals.length > 0} onRefresh={() => { setReload(n => n + 1); void state.refresh(); }} renderItem={({ item }) => row(item, view === 'Rankings')}
      ListHeaderComponent={<View style={{ gap: 20 }}>
        {[state.error, state.followError, state.pro.followsError, state.pro.writeError, searchError].filter(Boolean).map((e, i) => <Pressable key={i} accessibilityRole="button" onPress={() => { setReload(n => n + 1); void state.refresh(); }}><Text style={{ color: b.danger }}>{e} Tap to retry.</Text></Pressable>)}
        {!state.pro.userId && <Pressable onPress={signIn} style={panel}><Text style={{ color: b.premium, fontWeight: '700' }}>Build your follow list</Text><Text style={{ color: b.muted, marginTop: 6 }}>Sign in to follow players and search the full FIP directory.</Text></Pressable>}

        {view === 'Discover' && !searchingDirectory && <>
          {source !== 'pro' && localTop.length > 0 && rail(gender === 'women' ? 'SAPA Women-Main' : 'SAPA Men-Main', localTop, true, gender === 'all' ? 'men' : gender)}
          {source !== 'pro' && gender === 'all' && topLocalPlayers(locals, 'women').length > 0 && rail('SAPA Women-Main', topLocalPlayers(locals, 'women'), true, 'women')}
          {source !== '4m' && rail('On the FIP tour', proTop, false)}
          <View style={{ gap: 8 }}><Text style={{ color: b.muted, fontSize: 13, lineHeight: 19 }}>Looking for a partner? Open a 4M player’s profile to send a message request.</Text><HomeAction label="Browse all players" onPress={() => setBrowse(true)} /></View>
        </>}
        {view === 'Following' && <Text style={{ color: b.premium, fontSize: 18, fontWeight: '600' }}>My following</Text>}
        {searchingDirectory && source !== '4m' && remoteTotal !== null && <Text style={{ color: b.muted, fontSize: 12 }}>{query.trim() ? `${remoteTotal.toLocaleString('en-ZA')} FIP directory matches` : `${remoteTotal.toLocaleString('en-ZA')} FIP players available`}{more ? ' · Load more below' : ''}</Text>}
        {(searching || state.loading) && <ActivityIndicator color={loadingBlue} />}
      </View>}
      ListEmptyComponent={view === 'Following' ? <View style={panel}><Text style={{ color: b.muted }}>Follow a local or FIP player to start your list. Your favourites will appear together here.</Text></View> : searchingDirectory && !searching ? <Text style={{ color: b.muted }}>No players found. Try another name or filter.</Text> : null}
      ListFooterComponent={more && source !== '4m' && view !== 'Following' ? <Pressable disabled={searching} accessibilityRole="button" onPress={() => setPage(p => p + 1)} style={{ ...panel, alignItems: 'center' }}><Text style={{ color: b.accent, fontWeight: '700' }}>{searching ? 'Loading…' : `Load more FIP players${remoteTotal !== null ? ` (${remote.length} of ${remoteTotal.toLocaleString('en-ZA')})` : ''}`}</Text></Pressable> : null} />}
    <Modal visible={!!selected && !matchOpen} animationType="slide" onRequestClose={() => setSelected(null)}>
      {selected && <ProPlayerProfile
        key={selected.key}
        player={selected}
        followButton={followButton(selected)}
        onClose={() => setSelected(null)}
        onMatch={id => openMatchFromPlayer(id, 'players')}
        onPlayer={(id, name) => {
          const known = all.find(person => person.key === `pro:${id}`);
          setSelected(known || { key: `pro:${id}`, source: 'pro', id: String(id), name, photo: null, gender: selected.gender, rank: null, points: null, subtitle: 'FIP player' });
        }} />}
    </Modal>
    <ErrorBanner message={state.error || state.followError || state.pro.followsError || state.pro.writeError || searchError || null} top={safe.top + 8} />
  </View>;
}
