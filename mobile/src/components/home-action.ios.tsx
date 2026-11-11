import { View } from 'react-native';
import { Button, Host, HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, background, buttonBorderShape, buttonStyle, contentShape, controlSize, disabled as isDisabled, font, foregroundStyle, frame, lineLimit, multilineTextAlignment, padding, shapes, tint } from '@expo/ui/swift-ui/modifiers';
import { homeIcons, type HomeActionProps } from './home-action.types';
import { lightBrand as b } from '@/theme/tokens';

export function HomeAction({ label, accessibilityLabel: spokenLabel = label, onPress, icon, iconPosition = 'leading', kind = 'link', disabled = false, compact = false, fullWidth = false, accentColor = b.accent }: HomeActionProps) {
  const Content = kind === 'shortcut' || kind === 'icon' ? VStack : HStack;
  const intrinsic = kind === 'link' || kind === 'outline' || kind === 'primary' && compact;
  const graphic = icon ? <Image systemName={homeIcons[icon].ios} modifiers={[font({ size: kind === 'shortcut' ? 23 : kind === 'outline' ? 15 : fullWidth && compact ? 18 : 20, weight: 'regular' }), foregroundStyle(kind === 'primary' ? '#FFFFFF' : kind === 'outline' || kind === 'link' && fullWidth ? accentColor : b.premium), ...(kind === 'shortcut' ? [frame({ width: 44, height: 44 }), background(b.surface, shapes.circle())] : [])]} /> : null;
  const content = <Content spacing={8} modifiers={[
    ...(kind === 'icon' ? [frame({ width: 44, height: 44 })] : kind === 'shortcut' ? [frame({ maxWidth: Infinity, minHeight: 96 }), padding({ vertical: 4 })] : kind === 'primary' ? compact ? [frame({ minHeight: 28 }), padding({ horizontal: 4 })] : [frame({ maxWidth: Infinity, minHeight: 40 })] : kind === 'outline' ? [frame({ ...(fullWidth ? { maxWidth: Infinity } : {}), minHeight: 36 }), padding({ horizontal: 12 }), background(b.elevated, shapes.capsule())] : [frame({ ...(fullWidth ? { maxWidth: Infinity } : {}), minHeight: fullWidth ? 32 : 24 }), padding({ horizontal: 6 })]),
    contentShape(shapes.rectangle()),
  ]}>
    {iconPosition === 'leading' && graphic}
    {kind !== 'icon' && <Text modifiers={[font({ size: kind === 'shortcut' ? 11 : compact || kind === 'outline' ? 13 : 14, weight: kind === 'primary' ? 'semibold' : 'medium' }), multilineTextAlignment('center'), lineLimit(2), foregroundStyle(kind === 'primary' ? '#FFFFFF' : kind === 'shortcut' ? b.premium : accentColor)]}>{label}</Text>}
    {iconPosition === 'trailing' && graphic}
  </Content>;
  const control = <Host colorScheme="light" ignoreSafeArea="all" matchContents={!fullWidth && intrinsic} style={fullWidth ? { width: '100%', height: compact ? 44 : 48 } : kind === 'icon' ? { width: 44, height: 44 } : kind === 'shortcut' ? { flex: 1, height: 108, minWidth: 0 } : kind === 'primary' ? compact ? { minHeight: 44, flexShrink: 0 } : { width: '100%', height: 52 } : kind === 'outline' ? { minHeight: 44, flexShrink: 0 } : undefined}>
    <Button onPress={onPress} modifiers={[buttonStyle(kind === 'primary' ? 'borderedProminent' : kind === 'link' ? 'bordered' : 'plain'), tint(accentColor), ...(kind === 'link' ? [controlSize(fullWidth ? 'regular' : 'small'), buttonBorderShape('capsule'), frame({ minHeight: 44 }), contentShape(shapes.rectangle())] : kind === 'outline' ? [frame({ minHeight: 44 }), contentShape(shapes.rectangle())] : []), accessibilityLabel(spokenLabel), isDisabled(disabled)]}>
      {content}
    </Button>
  </Host>;
  return kind === 'outline' ? <View style={{ minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: b.edge, backgroundColor: b.elevated, alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...(fullWidth ? { width: '100%' } : {}) }}>{control}</View> : control;
}
