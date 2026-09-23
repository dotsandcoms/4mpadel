import { ActivityIndicator, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { PressableScale } from '@/components/pressable-scale';
import { brand } from '@/theme/tokens';

export function ActionButton({ label, onPress, disabled, busy, secondary }: {
  label: string; onPress: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean;
}) {
  return <PressableScale accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }} disabled={disabled || busy}
    onPress={onPress} style={{ minHeight: 50, borderRadius: 14, paddingHorizontal: 18,
      paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10,
      backgroundColor: secondary ? brand.elevated : brand.padel, borderWidth: secondary ? 1 : 0,
      borderColor: brand.edge, opacity: disabled ? 0.45 : 1 }}>
    {busy && <ActivityIndicator color={secondary ? brand.padel : brand.page} />}
    <Text style={{ color: secondary ? brand.premium : brand.page, fontWeight: '700', fontSize: 15 }}>{label}</Text>
  </PressableScale>;
}
export function Notice({ title, children, onRetry }: { title: string; children?: ReactNode; onRetry?: () => void }) {
  return <View style={{ padding: 20, gap: 12, borderRadius: 16, backgroundColor: brand.elevated }}>
    <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 18, fontWeight: '700' }}>{title}</Text>
    {!!children && <Text style={{ color: brand.muted, fontSize: 15, lineHeight: 23 }}>{children}</Text>}
    {onRetry && <ActionButton label="Try again" onPress={onRetry} secondary />}
  </View>;
}
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <PressableScale onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
    style={{ paddingHorizontal: 15, minHeight: 44, justifyContent: 'center',
      borderRadius: 12, backgroundColor: selected ? brand.padel : brand.elevated, opacity: 1 }}>
    <Text style={{ color: selected ? brand.page : brand.muted, fontSize: 13, fontWeight: '700' }}>{label}</Text>
  </PressableScale>;
}
