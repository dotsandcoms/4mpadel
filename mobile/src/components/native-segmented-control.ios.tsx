import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, disabled as isDisabled, font, frame, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import type { NativeSegmentedProps } from './native-segmented-control.types';

/** Segmented pickers need a finite proposal on both axes inside RN lists. */
export function NativeSegmentedControl({ label, value, options, onChange, disabled = false }: NativeSegmentedProps) {
  return <Host colorScheme="light" ignoreSafeArea="all" style={{ width: '100%', height: 44, flexShrink: 0 }}>
    <Picker label={label} selection={value} onSelectionChange={onChange} modifiers={[pickerStyle('segmented'), isDisabled(disabled), frame({ maxWidth: Infinity, height: 44 }), accessibilityLabel(label)]}>
      {options.map(option => <Text key={option.value} modifiers={[tag(option.value), font({ size: 13, weight: 'medium' })]}>{option.label}</Text>)}
    </Picker>
  </Host>;
}
