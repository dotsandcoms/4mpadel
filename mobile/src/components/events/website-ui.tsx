import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { type ComponentProps, type ReactNode, useState, createContext, useContext } from 'react';
import { Platform, Pressable, Text as NativeText, View, type TextProps, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { HomeHeader } from '@/components/home-header';

export const lime = '#CCFF00';
export const EventAccent = createContext(lime);
export const useEventAccent = () => useContext(EventAccent);
export type EventIconName = ComponentProps<typeof SymbolView>['name'];
/** The website uses SF Pro Rounded on Apple devices. */
export function EventText({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[{ fontFamily: Platform.OS === 'ios' ? 'ui-rounded' : 'sans-serif', color: '#16251F', fontWeight: '400' }, style]} />;
}
export function EventIcon({ name, size = 16, color: suppliedColor }: { name: EventIconName; size?: number; color?: string }) {
  const accent = useEventAccent();
  const color = suppliedColor || '#386018';
  const outlines: Record<string, ComponentProps<typeof Feather>['name']> = {
    rosette: 'award', cloud: 'cloud', envelope: 'mail', person: 'user', camera: 'camera', 'exclamationmark.circle': 'alert-circle', 'point.3.connected.trianglepath.dotted': 'git-branch', calendar: 'calendar', magnifyingglass: 'search', 'mappin.and.ellipse': 'map-pin', map: 'map',
    'person.2': 'users', lock: 'lock', clock: 'clock', 'chevron.right': 'chevron-right',
    'chevron.down': 'chevron-down', plus: 'plus', checkmark: 'check', 'arrow.left': 'arrow-left',
    'square.and.arrow.up': 'share-2', 'line.3.horizontal.decrease': 'filter', 'doc.text': 'file-text',
    phone: 'phone', 'info.circle': 'info', bolt: 'zap', star: 'star', 'rectangle.split.2x2': 'layout',
  };
  if (typeof name === 'string' && outlines[name]) return <Feather name={outlines[name]} size={size} color={color} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
  if (name === 'trophy' || name === 'crown') return <MaterialCommunityIcons name={name === 'trophy' ? 'trophy-outline' : 'crown-outline'} size={size} color={color} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
  return <SymbolView name={name} size={size} tintColor={color} />;
}
export function WebsiteHeader() {
  const router = useRouter();
  return <View style={{ height: 60, justifyContent: 'center', backgroundColor: '#F5F6F3', borderBottomColor: '#DCE2DA', borderBottomWidth: 1 }}>
    <HomeHeader onSearch={() => router.push('/search')} onNotifications={() => router.push('/notifications')} />
  </View>;
}
export function CircleAction({ name, label, onPress, selected, disabled }: { name: EventIconName; label: string; onPress: () => void; selected?: boolean; disabled?: boolean }) {
  const accent = useEventAccent();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} hitSlop={4}
    style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? accent : '#FFFFFF', borderWidth: 1, borderColor: selected ? accent : '#16251f4d', opacity: disabled ? 0.5 : 1 }}>
    <EventIcon name={name} color="#16251F" size={18} />
  </Pressable>;
}
export function Fade({ to = '#F5F6F3' }: { to?: string }) {
  return <View pointerEvents="none" style={{ position: 'absolute', inset: 0, experimental_backgroundImage: `linear-gradient(180deg, rgba(245,246,243,0.82) 0%, rgba(245,246,243,0.94) 45%, ${to} 100%)` } as ViewStyle} />;
}
export function Accordion({ title, icon, children, accessory, highlighted = false, pending = false, singleLineTitle = false }: { pending?: boolean; singleLineTitle?: boolean; highlighted?: boolean; title: string; icon: EventIconName; children: ReactNode; accessory?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const accent = useEventAccent();
  return <View style={{ backgroundColor: pending ? '#fff7ed' : '#fff', borderRadius: 16, borderWidth: 1, borderColor: pending ? '#fb923c' : highlighted ? accent : '#f3f4f6', boxShadow: highlighted ? `0px 2px 12px ${accent}30` : '0px 2px 3px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: singleLineTitle ? 16 : 22 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: singleLineTitle ? 8 : 12, paddingLeft: singleLineTitle ? 16 : 24, paddingVertical: 16, minHeight: 64 }}>
        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: `${accent}20`, alignItems: 'center', justifyContent: 'center' }}><EventIcon name={icon} color="#0a0a0a" /></View>
        <EventText numberOfLines={singleLineTitle ? 1 : undefined} adjustsFontSizeToFit={singleLineTitle} minimumFontScale={0.75} style={{ fontSize: 14, fontWeight: '400', color: '#0f172a', flex: 1, minWidth: 0 }}>{title}</EventText>
      </Pressable>
      {accessory}
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${title}`} hitSlop={10} style={{ paddingLeft: 12 }}><EventIcon name={open ? 'chevron.down' : 'chevron.right'} size={12} color="#65726B" /></Pressable>
    </View>
    {open && <View style={{ borderTopWidth: 1, borderTopColor: pending ? '#fed7aa' : '#f3f4f6', padding: 20, gap: 12 }}>{children}</View>}
  </View>;
}
export function InfoRows({ rows }: { rows: [string, unknown][] }) {
  return <>{rows.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => <View key={label} style={{ flexDirection: 'row', gap: 16, paddingVertical: 5 }}>
    <EventText style={{ color: '#64748b', fontSize: 13, flex: 1 }}>{label}</EventText><EventText style={{ color: '#111827', fontSize: 13, textAlign: 'right', flex: 1 }}>{String(value)}</EventText>
  </View>)}</>;
}
