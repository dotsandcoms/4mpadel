import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { fetchFollowedLocalFixtures } from '@/lib/followed-local-matches';
import type { HubPlayer } from '@/lib/player-hub';
import { LocalMatchCarousel } from './local-match-carousel';
import { lightBrand as brand } from '@/theme/tokens';
const BLUE = '#2449D8';

export function FollowedLocalMatches({ players, directory = players }: { players: HubPlayer[]; directory?: HubPlayer[] }) {
  const router = useRouter();
  const [result, setResult] = useState<Awaited<ReturnType<typeof fetchFollowedLocalFixtures>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [retry, setRetry] = useState(0);
  const ref = useRef(players); ref.current = players;
  const signature = players.map(p => `${p.id}:${p.rankedinId || ''}`).sort().join(',');
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setResult(null);
    void fetchFollowedLocalFixtures(ref.current).then(data => { if (active) setResult(data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [signature, retry]));
  if (!players.length) return null;
  return <View style={{ gap: 14 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: brand.edge }}>
        <View style={{ flex: 1, gap: 4 }}><Text style={{ color: brand.premium, fontSize: 18, fontWeight: '600' }}>Upcoming 4M matches</Text><Text style={{ color: brand.muted, fontSize: 13 }}>Your followed local players</Text></View>
        {loading ? <ActivityIndicator color={BLUE} /> : <Text style={{ color: BLUE, backgroundColor: '#EAF0FF', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, fontWeight: '700' }}>{result?.fixtures.length ?? 0}</Text>}
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} color={brand.muted} size={18} />
      </View>
    </Pressable>
    {expanded && !loading && <>
      {!!result?.failed && <View style={{ gap: 8 }}><Text style={{ color: brand.muted }}>Some player schedules could not be loaded.</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={{ padding: 12, backgroundColor: '#EAF0FF', borderRadius: 12 }}><Text style={{ color: BLUE, fontWeight: '700' }}>Retry schedules</Text></Pressable></View>}
      {!!result?.fixtures.length && <LocalMatchCarousel fixtures={result.fixtures} directory={directory} onPlayer={id => router.push({ pathname: '/players/[id]', params: { id } })} />}
      {!result?.fixtures.length && !result?.failed && <Text style={{ color: brand.muted, lineHeight: 20 }}>No upcoming matches have been published for these players yet. Fixtures appear once their tournament schedule is available.</Text>}
      {!!result?.unlinked && <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 18 }}>Schedules are unavailable for {result.unlinked} followed {result.unlinked === 1 ? 'player' : 'players'} without a linked RankedIn profile.</Text>}
    </>}
  </View>;
}
