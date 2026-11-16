import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchEvent, type EventDetail } from '@/lib/events';
import { useEventPoints } from '@/hooks/use-event-points';
import type { PointsSheet } from '@/lib/event-documents';
import { HomeAction } from '@/components/home-action';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

export default function EventPointsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => { let live = true; setEvent(null); setError(''); void fetchEvent(id).then(row => { if (live) setEvent(row); }).catch(() => { if (live) setError('This event could not load. Please retry.'); }); return () => { live = false; }; }, [id, revision]);
  return <>
    <Stack.Screen options={{ headerShown: true, title: 'Ranking points', headerBackTitle: 'Back', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false }} />
    {event ? <PointsContent key={event.id} event={event} /> : <View style={{ flex: 1, padding: 24, gap: 16, backgroundColor: b.page }}>{error ? <><Text style={{ color: b.muted }}>{error}</Text><HomeAction label="Retry" onPress={() => setRevision(value => value + 1)} /></> : <ActivityIndicator color={loadingBlue} accessibilityLabel="Loading ranking points" />}</View>}
  </>;
}
function PointsContent({ event }: { event: EventDetail }) {
  const { sheet, loading, error, refresh } = useEventPoints(event);
  return <ScrollView style={{ flex: 1, backgroundColor: b.page }} contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 18 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={loadingBlue} />}>
    <View style={{ gap: 8 }}><Text accessibilityRole="header" style={{ color: b.premium, fontSize: 24, lineHeight: 30, fontWeight: '700' }}>{event.event_name}</Text><Text style={{ color: b.muted, fontSize: 13, lineHeight: 19 }}>Published SAPA ranking points · Per player</Text></View>
    {!!error && <View style={{ gap: 12 }}><Text style={{ color: b.danger }}>{error}</Text><HomeAction label="Retry" onPress={refresh} /></View>}
    {!loading && !error && !sheet && <View style={{ padding: 20, borderRadius: 14, backgroundColor: b.elevated, gap: 8 }}><Text style={{ color: b.premium, fontWeight: '600' }}>Points are not published yet</Text><Text style={{ color: b.muted, lineHeight: 21 }}>The sheet becomes available once the event is complete and its SAPA points have been published.</Text></View>}
    {sheet?.divisions.map(division => <PointsDivision key={division.name} division={division} />)}
  </ScrollView>;
}

function PointsDivision({ division }: { division: PointsSheet['divisions'][number] }) {
  const [open, setOpen] = useState(false);
  return <View style={{ backgroundColor: b.elevated, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: b.edge }}>
    <Pressable accessibilityRole="button" accessibilityLabel={division.name} accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} style={{ minHeight: 64, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ flex: 1, color: b.premium, fontSize: 16, fontWeight: '600' }}>{division.name}</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={b.muted} accessible={false} />
    </Pressable>
    {open && <View>
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: b.surface, flexDirection: 'row', gap: 12 }}><Text style={{ width: 50, fontSize: 11, color: b.muted }}>Position</Text><Text style={{ flex: 1, fontSize: 11, color: b.muted }}>Players</Text><Text style={{ width: 58, textAlign: 'right', fontSize: 11, color: b.muted }}>Points</Text></View>
      {division.rows.map((row, index) => <View key={`${row.position}:${index}`} style={{ padding: 14, flexDirection: 'row', gap: 12, borderTopWidth: index ? 1 : 0, borderColor: b.edge, alignItems: 'center' }}><Text style={{ width: 50, color: b.muted, fontSize: 12 }}>{row.position}</Text><View style={{ flex: 1, gap: 5 }}>{row.players.map((player, i) => <Text key={`${player}:${i}`} style={{ color: b.premium, fontSize: 13, lineHeight: 19 }}>{player}</Text>)}</View><Text style={{ width: 58, color: b.accent, textAlign: 'right', fontSize: 14, fontWeight: '700' }}>{row.points.toLocaleString('en-ZA')}</Text></View>)}
    </View>}
  </View>;
}
