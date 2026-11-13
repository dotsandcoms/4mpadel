import { Button, Column, Row, FilledTonalButton, OutlinedButton, Host, IconButton, RNHostView, Text, TextButton } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, semantics } from '@expo/ui/jetpack-compose/modifiers';
import { SymbolView } from 'expo-symbols';
import { homeIcons, type HomeActionProps } from './home-action.types';
import { lightBrand as b } from '@/theme/tokens';

export function HomeAction({ label, accessibilityLabel: spokenLabel = label, onPress, icon, iconPosition = 'leading', kind = 'link', disabled = false, compact = false, size = 'regular', fullWidth = false, accentColor = b.accent }: HomeActionProps) {
  const small = size === 'small';
  const graphic = icon ? <RNHostView matchContents><SymbolView name={homeIcons[icon]} size={small ? 16 : kind === 'shortcut' ? 24 : fullWidth && compact ? 18 : 20} tintColor={kind === 'primary' ? '#FFFFFF' : kind === 'outline' || kind === 'link' ? accentColor : b.premium} style={{ width: small ? 20 : 28, height: small ? 20 : 28 }} /></RNHostView> : null;
  const Control = kind === 'primary' ? Button : kind === 'outline' ? OutlinedButton : kind === 'link' ? FilledTonalButton : TextButton;
  const Content = kind === 'shortcut' ? Column : Row;
  return <Host colorScheme="light" seedColor={accentColor} matchContents={!fullWidth && (kind === 'link' || kind === 'outline' || (kind === 'primary' && compact))} style={fullWidth ? { width: '100%', height: compact ? 44 : 48 } : kind === 'icon' ? { width: 48, height: 48 } : kind === 'shortcut' ? { flex: 1, height: 108, minWidth: 0 } : kind === 'primary' ? compact ? { minHeight: 44, flexShrink: 0 } : { width: '100%', height: 52 } : undefined}>
    {kind === 'icon' ? <IconButton enabled={!disabled} onClick={onPress} modifiers={[semantics({ contentDescription: spokenLabel })]}>{graphic}</IconButton> :
      <Control enabled={!disabled} onClick={onPress} colors={kind === 'primary' ? { containerColor: accentColor, contentColor: '#FFFFFF' } : kind === 'outline' ? { containerColor: b.elevated, contentColor: accentColor } : kind === 'link' ? { containerColor: fullWidth && /^#[0-9a-f]{6}$/i.test(accentColor) ? `${accentColor}14` : b.glass, contentColor: accentColor } : undefined} contentPadding={{ start: small ? 8 : kind === 'shortcut' ? 2 : 12, end: small ? 8 : kind === 'shortcut' ? 2 : 12, top: small || kind === 'link' ? 4 : 8, bottom: small || kind === 'link' ? 4 : 8 }} modifiers={fullWidth || kind === 'shortcut' || (kind === 'primary' && !compact) ? [fillMaxWidth(), semantics({ contentDescription: spokenLabel })] : [semantics({ contentDescription: spokenLabel })]}>
        <Content {...(kind === 'shortcut' ? { horizontalAlignment: 'center' as const, verticalArrangement: { spacedBy: 8 } } : { verticalAlignment: 'center' as const, horizontalArrangement: { spacedBy: small ? 4 : 8 } })}>
          {iconPosition === 'leading' && graphic}<Text style={{ fontSize: small ? 12 : kind === 'shortcut' ? 11 : compact ? 13 : 14 }} color={kind === 'primary' ? '#FFFFFF' : kind === 'shortcut' ? b.premium : accentColor}>{label}</Text>{iconPosition === 'trailing' && graphic}
        </Content>
      </Control>}
  </Host>;
}
