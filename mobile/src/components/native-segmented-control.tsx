import { Pressable, Text, View } from 'react-native';
import { lightBrand as b } from '@/theme/tokens';
import type { NativeSegmentedProps } from './native-segmented-control.types';

export function NativeSegmentedControl({ label, value, options, onChange, disabled = false }: NativeSegmentedProps) {
  return <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: b.panel, padding: 4, borderRadius: 12, minHeight: 44, flexShrink: 0 }}>
    {options.map(option => <Pressable key={option.value} accessibilityRole="tab" disabled={disabled} accessibilityState={{ selected: value === option.value, disabled }} onPress={() => onChange(option.value)} style={{ flex: 1, padding: 8, justifyContent: 'center', backgroundColor: value === option.value ? b.elevated : 'transparent', borderRadius: 8 }}>
      <Text style={{ color: b.premium, textAlign: 'center', fontSize: 13, fontWeight: '600' }}>{option.label}</Text>
    </Pressable>)}
  </View>;
}
