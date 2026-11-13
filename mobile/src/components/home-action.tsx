import { Pressable, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { homeIcons, type HomeActionProps } from './home-action.types';
import { lightBrand as b } from '@/theme/tokens';

export function HomeAction({ label, accessibilityLabel: spokenLabel = label, onPress, icon, iconPosition = 'leading', kind = 'link', disabled = false, compact = false, size = 'regular', fullWidth = false, accentColor = b.accent }: HomeActionProps) {
  const small = size === 'small';
  return <Pressable disabled={disabled} accessibilityState={{ disabled }} accessibilityRole="button" accessibilityLabel={spokenLabel} onPress={onPress} style={{ flex: kind === 'shortcut' ? 1 : undefined, flexDirection: kind === 'shortcut' ? 'column' : 'row', width: fullWidth || kind === 'primary' && !compact ? '100%' : undefined, minHeight: kind === 'primary' && !compact ? 48 : 44, minWidth: 44, padding: small ? 6 : 8, paddingHorizontal: small ? 8 : kind === 'link' || kind === 'outline' ? 14 : 8, gap: small ? 4 : 8, alignItems: 'center', justifyContent: 'center', opacity: disabled ? .4 : 1, borderWidth: kind === 'outline' ? 1 : 0, borderColor: b.edge, backgroundColor: kind === 'outline' ? b.elevated : kind === 'primary' ? accentColor : kind === 'link' ? fullWidth && /^#[0-9a-f]{6}$/i.test(accentColor) ? `${accentColor}14` : b.glass : undefined, borderRadius: kind === 'link' ? 24 : 12 }}>
    {icon && iconPosition === 'leading' && <SymbolView name={homeIcons[icon]} size={small ? 16 : 24} tintColor={kind === 'primary' ? '#FFFFFF' : kind === 'outline' || kind === 'link' ? accentColor : b.premium} />}
    {kind !== 'icon' && <Text style={{ fontSize: small ? 12 : kind === 'shortcut' ? 11 : 14, fontWeight: '500', color: kind === 'primary' ? '#FFFFFF' : kind === 'link' ? accentColor : b.premium }}>{label}</Text>}
  {icon && iconPosition === 'trailing' && <SymbolView name={homeIcons[icon]} size={16} tintColor={accentColor} />}
  </Pressable>;
}
