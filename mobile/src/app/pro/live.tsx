import { MatchCard } from '@/components/pro-padel-feed';
import { fetchLiveMatches, fetchMatchDetails, type MatchDetails } from '@/lib/pro-padel-live';
import { searchProPlayers } from '@/lib/player-hub';
import { fetchProSnapshot, type ProPlayer } from '@/lib/pro-padel';
import { lightBrand as b } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const profileCache = new Map<number, ProPlayer | null>();

export default function LiveProTourScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<MatchDetails[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState<Map<number, ProPlayer>>(new Map());
  const request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    try {
      const live = await fetchLiveMatches();
      const details = await Promise.allSettled(live.slice(0, 8).map(row => fetchMatchDetails(row.id)));
      if (current !== request.current) return;
      setRows(details.filter((v): v is PromiseFulfilledResult<MatchDetails | null> => v.status === 'fulfilled').map(v => v.value).filter((v): v is MatchDetails => !!v));
      setCount(live.length);
      setError('');
    } catch (e) { if (current === request.current) setError(e instanceof Error ? e.message : 'Could not load live matches.'); }
    finally { if (current === request.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 60000);
    return () => { request.current++; clearInterval(timer); };
  }, [load]));
  useEffect(() => {
    const players = [...new Map(rows.flatMap(row => row.match.teams.flat()).map(player => [player.id, player])).values()];
    if (!players.length) return;
    let active = true;
    const found = new Map<number, ProPlayer>();
    for (const player of players) {
      const cached = profileCache.get(player.id);
      if (cached) found.set(player.id, cached);
    }
    setLookup(new Map(found));
    void (async () => {
      try {
        const rankings = await fetchProSnapshot('rankings');
        if (!active) return;
        for (const player of players) {
          const ranked = rankings.categories.men.players.find(row => row.id === player.id)
            || rankings.categories.women.players.find(row => row.id === player.id);
          if (ranked?.photoUrl?.startsWith('https://')) {
            profileCache.set(player.id, ranked);
            found.set(player.id, ranked);
          }
        }
        setLookup(new Map(found));
      } catch { /* The player directory can still supply portraits. */ }
      for (const player of players) {
        if (!active) return;
        if (profileCache.has(player.id)) continue;
        // The signed-in player lookup spaces requests per user.
        await new Promise(resolve => setTimeout(resolve, 800));
        if (!active) return;
        try {
          const result = await searchProPlayers('', 'all', 1, player.id);
          const profile = result.players.find(row => row.id === player.id) || null;
          profileCache.set(player.id, profile);
          if (profile) {
            found.set(player.id, profile);
            setLookup(new Map(found));
          }
        } catch { /* Keep initials for unavailable profiles. */ }
      }
    })();
    return () => { active = false; };
  }, [rows]);
  return <SafeAreaView style={{ flex: 1, backgroundColor: b.page }} edges={['top']}>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50, gap: 15 }} refreshControl={undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: b.elevated, borderRadius: 23 }}><Ionicons name="arrow-back" size={22} color={b.premium} /></Pressable>
      <Text style={{ color: b.accent, fontWeight: '800', letterSpacing: 1.3, fontSize: 11 }}>INTERNATIONAL · LIVE</Text>
      <Text accessibilityRole="header" style={{ color: b.premium, fontWeight: '800', fontSize: 32 }}>On court now</Text>
      <Text style={{ color: b.muted, lineHeight: 21 }}>Follow the scores as they happen. Open a match for set statistics and point-by-point coverage.</Text>
      <Pressable accessibilityRole="button" onPress={() => void load()} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 }}><Ionicons name="refresh" size={17} color={b.accent} /><Text style={{ color: b.accent, fontWeight: '700' }}>Refresh scores</Text></Pressable>
      {loading && <ActivityIndicator color={b.accent} />}
      {!!error && <Text accessibilityRole="alert" style={{ color: b.danger }}>{error}</Text>}
      {!loading && !error && !count && <View style={{ backgroundColor: b.elevated, borderColor: b.edge, borderWidth: 1, borderRadius: 20, padding: 22, gap: 7 }}><Text style={{ color: b.premium, fontSize: 18, fontWeight: '700' }}>No matches live right now</Text><Text style={{ color: b.muted, lineHeight: 20 }}>Check back when play starts. The tour calendar has upcoming fixtures.</Text></View>}
      {count > rows.length && <Text style={{ color: b.muted, fontSize: 12 }}>{count} live matches · showing details for {rows.length} available matches</Text>}
      {rows.map(row => <MatchCard key={row.match.id} match={row.match} lookup={lookup} onPlayer={id => {
        const player = lookup.get(id);
        if (player) router.push({ pathname: '/rankings', params: { view: 'Discover', source: 'pro', gender: player.category, query: player.name } });
      }} />)}
    </ScrollView>
  </SafeAreaView>;
}
