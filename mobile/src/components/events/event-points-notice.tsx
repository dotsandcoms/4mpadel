import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { PointsSheet } from '@/lib/event-documents';
import { feedTime } from '@/lib/following-feed';
import type { EventDetail } from '@/lib/events';
import { lightBrand as b } from '@/theme/tokens';

export function EventPointsNotice({ event, sheet }: { event: EventDetail; sheet: PointsSheet }) {
  const router = useRouter();
  return <Pressable accessibilityRole="button" accessibilityLabel="Points updated. View published SAPA ranking points" onPress={() => router.push({ pathname: '/events/points', params: { id: String(event.id) } })}
    style={{ minHeight: 56, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: b.edge, backgroundColor: b.elevated, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
    <Ionicons name="stats-chart-outline" size={21} color={b.accent} accessible={false} />
    <View style={{ flex: 1, gap: 4 }}><Text style={{ color: b.premium, fontSize: 14, fontWeight: '600' }}>Points updated</Text><Text style={{ color: b.muted, fontSize: 12, lineHeight: 17 }}>{sheet.updatedAt ? `SAPA points published · ${feedTime(sheet.updatedAt)}` : 'View published SAPA points per player'}</Text></View>
    <Ionicons name="chevron-forward" size={17} color={b.muted} accessible={false} />
  </Pressable>;
}
