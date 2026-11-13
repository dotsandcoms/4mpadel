import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useState, type ReactNode } from 'react';
import { messagingImageUrl } from '@/lib/messaging';
import { lightBrand as b } from '@/theme/tokens';
export function ChatButton({ children, onPress, disabled, quiet = false, danger = false, warning = false, style }: { children: ReactNode; onPress: () => void; disabled?: boolean; quiet?: boolean; danger?: boolean; warning?: boolean; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[{ minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: quiet ? b.surface : danger ? '#FBE8E6' : warning ? b.warningSurface : b.messagingAction, opacity: disabled ? 0.5 : 1 }, style]}><Text style={{ color: danger ? b.danger : warning ? b.warning : quiet ? b.premium : '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{children}</Text></Pressable>;
}
export function ChatAvatar({ name, image, event = false, size = 52 }: { name: string; image?: string | null; event?: boolean; size?: number }) {
  const trustedImage = messagingImageUrl(image, process.env.EXPO_PUBLIC_SUPABASE_URL);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const initials = String(name || 'Player').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <View accessible={false} style={{ width: size, height: size, flexShrink: 0, borderRadius: event ? 16 : size / 2, backgroundColor: event ? '#E5EDD8' : b.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    {event ? <Ionicons name="calendar-outline" size={size * 0.42} color={b.accent} /> : <Text style={{ color: b.accent, fontWeight: '700', fontSize: size * 0.33 }}>{initials}</Text>}
    {trustedImage && failedImage !== trustedImage && <Image source={{ uri: trustedImage }} style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} recyclingKey={trustedImage} cachePolicy="none" contentFit="cover" onError={() => setFailedImage(trustedImage)} />}
  </View>;
}
export function ChatNotice({ title, children, icon = 'chatbubble-ellipses-outline' }: { title: string; children: ReactNode; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  return <View style={{ alignItems: 'center', paddingHorizontal: 28, paddingVertical: 44, gap: 14 }}><View style={{ height: 68, width: 68, borderRadius: 22, backgroundColor: b.surface, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={30} color={b.accent} /></View><Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '700', color: b.premium, textAlign: 'center' }}>{title}</Text><Text style={{ color: b.muted, lineHeight: 23, fontSize: 15, textAlign: 'center' }}>{children}</Text></View>;
}
export function ChatPill({ children, active, onPress, activeColor = b.premium }: { children: ReactNode; active: boolean; onPress: () => void; activeColor?: string }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={{ minHeight: 44, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: active ? activeColor : b.elevated, borderWidth: 1, borderColor: active ? activeColor : b.edge, borderRadius: 24 }}><Text style={{ color: active ? b.elevated : b.muted, fontWeight: '600' }}>{children}</Text></Pressable>;
}
export function chatDate(value: string) {
  const date = new Date(value); if (!Number.isFinite(date.getTime())) return '';
  const today = new Date();
  return date.toDateString() === today.toDateString() ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}
