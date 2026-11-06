import { useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { lightBrand as b } from '@/theme/tokens';
export function NotificationSection({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={{ borderWidth: 1, borderColor: b.edge, backgroundColor: b.elevated, borderRadius: 17, overflow: 'hidden', marginBottom: 12 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${summary}`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 74, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ flex: 1 }}><Text style={{ color: b.premium, fontSize: 16, fontWeight: '700' }}>{title}</Text><Text style={{ color: b.muted, fontSize: 12, lineHeight: 18, marginTop: 5 }}>{summary}</Text></View><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} color={b.muted} size={19} />
    </Pressable>
    {expanded && <View style={{ backgroundColor: b.surface, borderTopWidth: 1, borderColor: b.edge }}>{children}</View>}
  </View>;
}
