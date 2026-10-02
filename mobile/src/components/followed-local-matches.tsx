import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { fetchFollowedLocalFixtures } from '@/lib/followed-local-matches';
import { parseMatchDate } from '@/lib/matches';
import type { HubPlayer } from '@/lib/player-hub';
import { formatHomeWhen } from '@/lib/when';
import { lightBrand as brand } from '@/theme/tokens';
const BLUE = '#2449D8';

export function FollowedLocalMatches({ players }: { players: HubPlayer[] }) {
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
      {result?.fixtures.map(({ key, match, players: followed }) => {
        const info = match.Info || {};
        const sides = [[info.Challenger?.Name, info.Challenger1?.Name], [info.Challenged?.Name, info.Challenged1?.Name]];
        return <View key={key} style={{ padding: 18, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: brand.edge, gap: 14 }}>
          <Text style={{ color: BLUE, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>4M · LOCAL TOURNAMENT</Text>
          <Text style={{ color: brand.premium, fontSize: 19, fontWeight: '700' }}>{info.EventName}</Text>
          <Text style={{ color: brand.muted, fontSize: 14 }}>{formatHomeWhen(parseMatchDate(info.Date), info.Date) || 'Time to be confirmed'}</Text>
          {sides.map((names, i) => <View key={i} style={{ gap: 10, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: brand.edge }}>
            {names.filter(Boolean).map((name, j) => <Text key={j} style={{ color: brand.premium, fontWeight: '600', fontSize: 15 }}>{name}</Text>)}
            {!names.some(Boolean) && <Text style={{ color: brand.muted }}>Players to be confirmed</Text>}
          </View>)}
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Ionicons name="location-outline" color={BLUE} size={15} /><Text style={{ color: brand.muted, flex: 1, fontSize: 12 }}>{[info.Court, info.Venue || info.Location].filter(Boolean).join(' · ') || 'Court to be confirmed'}</Text></View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{followed.map(player => <Pressable key={player.key} accessibilityRole="button" accessibilityLabel={`View ${player.name}`} onPress={() => router.push({ pathname: '/players/[id]', params: { id: player.id } })} style={{ backgroundColor: '#EAF0FF', borderRadius: 10, padding: 12 }}><Text style={{ color: BLUE, fontSize: 12, fontWeight: '600' }}>♥ {player.name}</Text></Pressable>)}</View>
        </View>;
      })}
      {!result?.fixtures.length && !result?.failed && <Text style={{ color: brand.muted, lineHeight: 20 }}>No upcoming matches have been published for these players yet. Fixtures appear once their tournament schedule is available.</Text>}
      {!!result?.unlinked && <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 18 }}>Schedules are unavailable for {result.unlinked} followed {result.unlinked === 1 ? 'player' : 'players'} without a linked RankedIn profile.</Text>}
    </>}
  </View>;
}
