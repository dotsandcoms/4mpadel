import { Host, SegmentedButton, SingleChoiceSegmentedButtonRow, Text } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { lightBrand as b } from '@/theme/tokens';
import type { NativeSegmentedProps } from './native-segmented-control.types';

export function NativeSegmentedControl({ value, options, onChange, disabled = false }: NativeSegmentedProps) {
  return <Host colorScheme="light" seedColor={b.accent} style={{ width: '100%', height: 52, flexShrink: 0 }}>
    <SingleChoiceSegmentedButtonRow modifiers={[fillMaxWidth()]}>
      {options.map(option => <SegmentedButton key={option.value} enabled={!disabled} selected={value === option.value} onClick={() => onChange(option.value)}>
        <SegmentedButton.Label><Text style={{ fontSize: 12 }}>{option.label}</Text></SegmentedButton.Label>
      </SegmentedButton>)}
    </SingleChoiceSegmentedButtonRow>
  </Host>;
}
