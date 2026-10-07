import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebsiteHeader } from '@/components/events/website-ui';
import { LocalRankings } from '@/components/rankings/local-rankings';
import { ProPadelFeed } from '@/components/pro-padel-feed';
import { ProPlayerProfile } from '@/components/players/pro-player-profile';
import { usePlayerHub } from '@/hooks/use-player-hub';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import { filterHubPlayers, playerRankLabel, proHubPlayer, searchProPlayers, topLocalPlayers, type HubPlayer } from '@/lib/player-hub';
import { playerPoints } from '@/lib/players';
import { lightBrand as b } from '@/theme/tokens';
const BLUE = '#2449D8';
const panel = { padding: 16, borderRadius: 20, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge } as const;
type ViewName = 'Discover' | 'Following' | 'Rankings' | 'Tour';

export default function PlayerHub() {
  const state = usePlayerHub(), router = useRouter(), safe = useSafeAreaInsets(), bottom = useTabScenePadding();
  const params = useLocalSearchParams<{ view?: string; source?: string; query?: string; gender?: string }>();
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
  useEffect(() => { if (['Discover', 'Following', 'Rankings', 'Tour'].includes(params.view || '')) setView(params.view as ViewName); if (['all', '4m', 'pro'].includes(params.source || '')) setSource(params.source!); if (params.query != null) setQuery(params.query); if (['all', 'men', 'women'].includes(params.gender || '')) setGender(params.gender!); }, [params.view, params.source, params.query, params.gender]);
  useEffect(() => { if (view === 'Rankings') { if (source === 'all') setSource('4m'); if (gender === 'all') setGender('men'); } }, [view, source, gender]);
  const locals = state.locals;
  const pros = useMemo(() => [...(state.pro.rankings.data?.categories.men.players || []), ...(state.pro.rankings.data?.categories.women.players || [])].map(proHubPlayer), [state.pro.rankings.data]);
  const all = useMemo(() => {
    const verified = new Set(state.fipLinks.filter(link => link.status === 'verified').map(link => link.fip_player_id));
    return [...new Map([...locals, ...pros.filter(p => !verified.has(Number(p.id))), ...remote.filter(p => !verified.has(Number(p.id)))].map(p => [p.key, p])).values()];
  }, [locals, pros, remote, state.fipLinks]);
  useEffect(() => { setPage(1); setRemote([]); setMore(false); setRemoteTotal(null); }, [query, gender, source, view]);
  useEffect(() => {
    const version = ++sequence.current;
    if (source === '4m' || !state.pro.userId || view === 'Following' || view === 'Tour' || (!query.trim() && !browse && !(view === 'Rankings' && source === 'pro'))) { setSearching(false); setSearchError(''); return; }
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
  const followButton = (p: HubPlayer) => <Pressable accessibilityRole="button" accessibilityLabel={`${state.isFollowing(p) ? 'Unfollow' : 'Follow'} ${p.name}`} disabled={followDisabled(p)} onPress={() => follow(p)} style={{ minHeight: 44, borderRadius: 12, backgroundColor: p.source === '4m' ? '#EAF0FF' : b.glass, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, opacity: followDisabled(p) ? 0.5 : 1 }}><Ionicons name={state.isFollowing(p) ? 'heart' : 'heart-outline'} size={18} color={p.source === '4m' ? BLUE : b.accent} /><Text style={{ color: p.source === '4m' ? BLUE : b.accent, fontWeight: '700', fontSize: 12 }}>{state.pending === p.key || String(state.pro.pendingId) === p.id && p.source === 'pro' ? 'Saving…' : state.isFollowing(p) ? 'Following' : 'Follow'}</Text></Pressable>;
  const rail = (title: string, rows: HubPlayer[], local: boolean, category = gender) => <View style={{ gap: 12 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: b.premium, fontSize: 19, fontWeight: '800' }}>{title}</Text><Text style={{ color: b.muted, fontSize: 11 }}>TOP 20 · {category.toUpperCase()}</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{rows.map(p => <View key={p.key} style={{ ...panel, width: 170, padding: 10, gap: 10 }}><Pressable accessibilityRole="button" accessibilityLabel={`View ${p.name}`} onPress={() => void openPlayer(p)}><View style={{ backgroundColor: local ? BLUE : b.glass, height: 154, borderRadius: 14, overflow: 'hidden', borderWidth: local ? 4 : 0, borderColor: BLUE }}><Text style={{ position: 'absolute', right: 8, top: 4, color: local ? '#FFFFFF30' : '#38601820', fontWeight: '900', fontSize: 55 }}>{p.rank}</Text>{p.photo ? <Image source={{ uri: p.photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" contentPosition="top" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: local ? '#FFF' : b.accent, fontWeight: '800', fontSize: 42 }}>{p.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</Text></View>}<View style={{ position: 'absolute', bottom: 8, left: 8, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: local ? BLUE : b.padel }}><Text style={{ color: local ? '#FFF' : b.premium, fontSize: 10, fontWeight: '800' }}>{p.source === '4m' ? p.rank ? `SAPA #${p.rank}` : '4M' : p.rank ? `FIP #${p.rank}` : 'FIP'}</Text></View></View><Text numberOfLines={2} style={{ color: b.premium, fontWeight: '800', fontSize: 15, lineHeight: 20, minHeight: 40, marginTop: 10 }}>{p.name}</Text><Text numberOfLines={1} style={{ color: p.fipPlayerId || p.fipProfileUrl ? BLUE : b.muted, fontSize: 11, fontWeight: p.fipPlayerId || p.fipProfileUrl ? '700' : '400' }}>{p.fipPlayerId || p.fipProfileUrl ? p.fipRank ? `FIP #${p.fipRank}` : 'FIP profile' : p.subtitle}</Text>{p.fipUnverified && <Text style={{ color: BLUE, fontSize: 11, fontWeight: '700' }}>Unverified link</Text>}</Pressable>{followButton(p)}</View>)}</ScrollView></View>;
  const row = (p: HubPlayer, ranking = false) => <View key={p.key} style={{ ...panel, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center', ...(p.fipPlayerId || p.fipProfileUrl ? { borderColor: '#B7C9FF', backgroundColor: '#F7F9FF' } : {}) }}><Pressable accessibilityRole="button" accessibilityLabel={`View ${p.name}`} onPress={() => void openPlayer(p)} style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' }}>{ranking && <Text style={{ width: 24, color: b.premium }}>{p.rank ?? '—'}</Text>}<View style={{ height: 44, width: 44, borderRadius: 13, backgroundColor: p.source === '4m' ? BLUE : b.glass, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>{p.photo ? <Image source={{ uri: p.photo }} style={{ width: 44, height: 44 }} contentFit="cover" /> : <Text style={{ color: p.source === '4m' ? '#FFF' : b.accent, fontWeight: '700' }}>{p.name[0]}</Text>}</View><View style={{ flex: 1, gap: 4 }}><Text style={{ color: b.premium, fontSize: 14, fontWeight: '700' }}>{p.name}</Text><Text style={{ color: p.source === '4m' ? BLUE : b.accent, fontSize: 11 }}>{playerRankLabel(p)} · {ranking ? `${playerPoints(p.points)} pts` : p.subtitle}</Text>{p.fipUnverified && <Text style={{ color: BLUE, fontSize: 11, fontWeight: '700' }}>Unverified link</Text>}</View></Pressable>{followButton(p)}</View>;
  return <View style={{ flex: 1, backgroundColor: b.page, paddingTop: safe.top }}><WebsiteHeader />
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: view === 'Rankings' ? 24 : 8, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View><Text style={{ color: b.premium, fontSize: 25, fontWeight: '800' }}>Your world of padel.</Text><Text style={{ color: b.muted, fontSize: 13, marginTop: 4 }}>Home-court favourites. World-class players.</Text></View></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{(['Discover', 'Following', 'Rankings', 'Tour'] as ViewName[]).map(t => <Chip key={t} label={t === 'Following' && followed.length ? `Following ${followed.length}` : t} active={view === t} onPress={() => { setView(t); setBrowse(false); if(t === 'Rankings') { if(source === 'all') setSource('4m'); if(gender === 'all') setGender('men'); } }} />)}</ScrollView>
      {view !== 'Tour' && <>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: b.elevated, borderRadius: 14, borderWidth: 1, borderColor: b.edge, paddingLeft: 12 }}><Ionicons name="search" size={19} color={b.muted} /><TextInput accessibilityLabel="Search all 4M and FIP players" placeholder="Search any local or FIP player…" placeholderTextColor={b.muted} value={query} onChangeText={setQuery} autoCorrect={false} style={{ flex: 1, minHeight: 46, paddingHorizontal: 10, color: b.premium, fontSize: 14 }} />{!!query && <Pressable accessibilityLabel="Clear search" onPress={() => setQuery('')} style={{ padding: 12 }}><Ionicons name="close-circle" size={20} color={b.muted} /></Pressable>}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>{(view === 'Rankings' ? ['4m', 'pro'] : ['all', '4m', 'pro']).map(s => <Chip key={s} label={s === 'all' ? 'All players' : s === '4m' ? '4M' : 'FIP'} blue={s === '4m'} active={source === s} onPress={() => setSource(s)} />)}{view !== 'Following' && <><View style={{ width: 1, height: 24, backgroundColor: b.edge, marginHorizontal: 3 }} /><View style={{ flexDirection: 'row', gap: 4 }}>{(view === 'Rankings' ? ['men', 'women'] : ['all', 'men', 'women']).map(g => <Chip key={g} label={g === 'all' ? 'All' : g === 'men' ? 'Men' : 'Women'} active={gender === g} onPress={() => setGender(g)} compact />)}</View></>}</ScrollView>
      </>}
    </View>
    {view === 'Rankings' && source !== 'pro' ? <LocalRankings embedded query={query} gender={gender} /> : view === 'Tour' ? <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: bottom }} refreshControl={<RefreshControl refreshing={state.pro.loading} onRefresh={() => void state.pro.refresh()} />}><ProPadelFeed state={state.pro} /></ScrollView> : <FlatList data={view === 'Rankings' ? filterHubPlayers(remote.length ? remote : pros, query, 'pro', gender).sort((a, z) => (a.rank ?? Infinity) - (z.rank ?? Infinity)) : searchingDirectory || view === 'Following' ? results : []} keyExtractor={p => p.key} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 16, paddingBottom: bottom, gap: 10 }} refreshing={state.loading && locals.length > 0} onRefresh={() => { setReload(n => n + 1); void state.refresh(); }} renderItem={({ item }) => row(item, view === 'Rankings')}
      ListHeaderComponent={<View style={{ gap: 20 }}>
        {[state.error, state.followError, state.pro.followsError, state.pro.writeError, searchError].filter(Boolean).map((e, i) => <Pressable key={i} accessibilityRole="button" onPress={() => { setReload(n => n + 1); void state.refresh(); }}><Text style={{ color: b.danger }}>{e} Tap to retry.</Text></Pressable>)}
        {!state.pro.userId && <Pressable onPress={signIn} style={panel}><Text style={{ color: b.premium, fontWeight: '700' }}>Build your follow list</Text><Text style={{ color: b.muted, marginTop: 6 }}>Sign in to follow players and search the full FIP directory.</Text></Pressable>}

        {view === 'Discover' && !searchingDirectory && <>
          {source !== 'pro' && localTop.length > 0 && rail(gender === 'all' ? '4M men · top 20' : 'Meet our local heroes', localTop, true, gender === 'all' ? 'men' : gender)}
          {source !== 'pro' && gender === 'all' && topLocalPlayers(locals, 'women').length > 0 && rail('4M women · top 20', topLocalPlayers(locals, 'women'), true, 'women')}
          {source !== '4m' && rail('Meet the world’s best', proTop, false)}
          <Pressable accessibilityRole="button" onPress={() => setBrowse(true)} style={{ ...panel, backgroundColor: BLUE }}><Text style={{ color: '#FFF', fontSize: 18, fontWeight: '800' }}>Find your next favourite →</Text><Text style={{ color: '#FFFFFFCC', marginTop: 6 }}>Find local talent and favourites from across the international tour.</Text></Pressable>
        </>}
        {view === 'Following' && <Text style={{ color: b.premium, fontSize: 18, fontWeight: '800' }}>Your players. One list.</Text>}
        {searchingDirectory && source !== '4m' && remoteTotal !== null && <Text style={{ color: b.muted, fontSize: 12 }}>{query.trim() ? `${remoteTotal.toLocaleString('en-ZA')} FIP directory matches` : `${remoteTotal.toLocaleString('en-ZA')} FIP players available`}{more ? ' · Load more below' : ''}</Text>}
        {(searching || state.loading) && <ActivityIndicator color={BLUE} />}
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
  </View>;
}
function Chip({ label, active, onPress, blue = false, compact = false }: { label: string; active: boolean; onPress: () => void; blue?: boolean; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={{ minHeight: 44, paddingHorizontal: compact ? 8 : 12, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? blue ? BLUE : b.premium : b.elevated, borderWidth: 1, borderColor: active ? 'transparent' : b.edge }}><Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFF' : b.muted }}>{label}</Text></Pressable>;
}
