import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { lightBrand as b } from '@/theme/tokens';
import type { NativeSegmentedProps } from './native-segmented-control.types';

export function NativeSegmentedControl({ label, value, options, onChange, disabled = false, variant = 'segmented' }: NativeSegmentedProps) {
  const { fontScale } = useWindowDimensions();
  const tabs = variant === 'tabs';
  return <View accessibilityRole={tabs ? 'tablist' : 'radiogroup'} accessibilityLabel={label} style={{ width: '100%', height: Math.max(48, Math.ceil(20 * fontScale) + 20), minHeight: 48, flexShrink: 0, borderBottomWidth: tabs ? 1 : 0, borderBottomColor: b.edge, backgroundColor: tabs ? 'transparent' : b.surface, borderRadius: tabs ? 0 : 12, overflow: 'hidden' }}>
    <ScrollView horizontal bounces={false} showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: tabs ? 0 : 4 }}>
      {options.map(option => {
        const selected = value === option.value;
        return <Pressable key={option.value} accessibilityRole={tabs ? 'tab' : 'radio'} accessibilityLabel={option.label} accessibilityState={tabs ? { selected, disabled } : { checked: selected, disabled }} disabled={disabled}
          onPress={() => { if (!selected) onChange(option.value); }} android_ripple={{ color: '#27517B20' }}
          style={{ flexGrow: 1, flexBasis: 0, minWidth: Math.ceil(option.label.length * 8 * fontScale + (tabs ? 32 : 48)), minHeight: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderBottomWidth: tabs ? 3 : 0, borderBottomColor: selected ? b.messagingAction : 'transparent', opacity: disabled ? 0.4 : 1 }}>
          <View pointerEvents="none" style={{ paddingHorizontal: tabs ? 0 : 8, paddingVertical: 8, borderRadius: 8, backgroundColor: !tabs && selected ? '#E3EDF7' : 'transparent' }}>
            <Text numberOfLines={1} style={{ color: selected ? b.messagingAction : b.muted, fontSize: 13, lineHeight: 20, fontWeight: selected ? '600' : '400', textAlign: 'center' }}>{option.label}</Text>
          </View>
        </Pressable>;
      })}
    </ScrollView>
  </View>;
}
