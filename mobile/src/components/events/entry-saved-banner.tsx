import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightBrand as brand } from '@/theme/tokens';

export function EntrySavedBanner({ eventName, pending, onDismiss }: { eventName: string; pending: boolean; onDismiss: () => void }) {
  const title = pending ? 'Entry saved · payment pending' : 'Entry confirmed';
  const body = pending ? `${eventName}: complete payment to confirm your place.` : `Your entry for ${eventName} has been saved.`;
  useEffect(() => { AccessibilityInfo.announceForAccessibility(`${title}. ${body}`); }, [title, body]);
  return <View accessibilityLiveRegion="polite" style={{ marginHorizontal: 20, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: brand.edge, backgroundColor: brand.elevated, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <Ionicons name={pending ? 'time-outline' : 'checkmark-circle'} size={26} color={brand.accent} />
    <View style={{ flex: 1, gap: 4 }}><Text style={{ color: brand.premium, fontSize: 15, fontWeight: '700' }}>{title}</Text><Text style={{ color: brand.muted, fontSize: 13, lineHeight: 19 }}>{body}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss entry confirmation" onPress={onDismiss} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="close" size={22} color={brand.muted} /></Pressable>
  </View>;
}
