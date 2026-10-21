import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { paymentPresentation } from '@/lib/payment-presentation';
import { formatMoney } from '@/lib/event-rules';

export function PaymentStatus({ status, balance, free = false, compact = false }: { status?: string | null; balance?: { known: boolean; due: number | null } | null; free?: boolean; compact?: boolean }) {
  const state = paymentPresentation(status, balance, free);
  const label = state.due != null ? `${formatMoney(state.due)} outstanding` : state.label;
  const color = state.tone === 'confirmed' ? '#047857' : state.tone === 'pending' ? '#A35B0A' : '#65726B';
  return <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, borderRadius: 12, borderWidth: 1, borderColor: state.tone === 'confirmed' ? '#A7F3D0' : state.tone === 'pending' ? '#FDE68A' : '#DCE2DA', backgroundColor: state.tone === 'confirmed' ? '#ECFDF5' : state.tone === 'pending' ? '#FFFBEB' : '#F5F6F3', paddingHorizontal: compact ? 6 : 8, paddingVertical: 4, maxWidth: '100%' }}>
    <Ionicons name={state.confirmed ? 'checkmark' : state.tone === 'pending' ? 'time-outline' : 'information-circle-outline'} size={12} color={color} />
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color, fontSize: 11, fontWeight: '600', flexShrink: 1 }}>{compact ? state.compact : label}</Text>
  </View>;
}
