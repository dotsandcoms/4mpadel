import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { homeIcons, type HomeActionProps } from './home-action.types';
import { lightBrand as b } from '@/theme/tokens';

/** One Android touch target; decorative icons never intercept the button press. */
export function HomeAction({ label, shortLabel = label, accessibilityLabel: spokenLabel = label, onPress, icon, iconPosition = 'leading', kind = 'link', disabled = false, compact = false, size = 'regular', fullWidth = false, accentColor = b.messagingAction }: HomeActionProps) {
  const color = accentColor === b.accent ? b.messagingAction : accentColor;
  const shortcut = kind === 'shortcut', iconOnly = kind === 'icon', primary = kind === 'primary';
  const stretch = fullWidth || primary && !compact;
  const small = size === 'small';
  const ink = primary ? '#FFFFFF' : shortcut || iconOnly ? b.premium : color;
  const graphic = icon ? <SymbolView name={homeIcons[icon]} size={shortcut || iconOnly ? 24 : small ? 16 : 20} tintColor={shortcut ? color : ink} style={{ width: shortcut || iconOnly ? 24 : small ? 16 : 20, height: shortcut || iconOnly ? 24 : small ? 16 : 20 }} /> : null;
  return <Pressable accessibilityRole="button" accessibilityLabel={spokenLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    android_ripple={{ color: `${color}20`, borderless: false }}
    style={({ pressed }) => ({ minHeight: 48, minWidth: 48, width: iconOnly ? 48 : stretch ? '100%' : undefined, flex: shortcut ? 1 : undefined, flexShrink: shortcut ? 1 : 0, alignSelf: stretch || shortcut ? 'stretch' : 'center', alignItems: 'center', justifyContent: 'center', borderRadius: iconOnly ? 24 : 12, overflow: 'hidden', opacity: disabled ? 0.4 : 1, backgroundColor: pressed && !disabled ? `${color}12` : 'transparent' })}>
    <View pointerEvents="none" style={{ width: stretch || shortcut ? '100%' : undefined, minHeight: shortcut ? 80 : iconOnly ? 48 : primary && !compact ? 48 : small || compact ? 36 : 40, flexDirection: shortcut ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: shortcut ? 8 : 6, paddingHorizontal: shortcut ? 4 : iconOnly ? 0 : small ? 10 : 12, paddingVertical: shortcut ? 8 : 0, borderRadius: 10, borderWidth: kind === 'outline' ? 1 : 0, borderColor: kind === 'outline' ? '#C8D5DE' : 'transparent', backgroundColor: primary ? color : kind === 'link' ? `${color}12` : kind === 'outline' ? b.elevated : 'transparent' }}>
      {iconPosition === 'leading' && (shortcut ? <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${color}0D`, alignItems: 'center', justifyContent: 'center' }}>{graphic}</View> : graphic)}
      {!iconOnly && <Text numberOfLines={shortcut ? 2 : 1} style={{ color: ink, fontSize: shortcut || small ? 12 : compact ? 13 : 14, lineHeight: shortcut || small ? 16 : 20, fontWeight: primary ? '600' : '500', textAlign: 'center', minHeight: shortcut ? 16 : undefined }}>{shortcut ? shortLabel : label}</Text>}
      {iconPosition === 'trailing' && graphic}
    </View>
  </Pressable>;
}
