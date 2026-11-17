import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { SETTINGS_BLUE } from './settings-ui';
import type { SupportRelatedKind, SupportRelatedOption } from '@/lib/support-related';
import { lightBrand as b } from '@/theme/tokens';
import { useHelpAccount } from '@/hooks/use-help-account';

type PickerRequest = { kind: SupportRelatedKind; value: string; options: SupportRelatedOption[]; onChoose: (value: string) => void };
const PickerContext = createContext<{ request: PickerRequest | null; open: (request: PickerRequest) => void; choose: (value: string) => void } | null>(null);

export function SupportRelatedProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [request, setRequest] = useState<PickerRequest | null>(null);
  const owner = useHelpAccount();
  useEffect(() => { setRequest(null); }, [owner]);
  return <PickerContext.Provider value={{ request,
    open: next => { setRequest(next); router.push('/help/related' as Href); },
    choose: value => { if (request && (value === '' || request.options.some(option => option.value === value))) request.onChoose(value); router.back(); },
  }}>{children}</PickerContext.Provider>;
}
export const useSupportRelatedPicker = () => useContext(PickerContext);

export function SupportRelatedField({ kind, value, options, onChange }: { kind: SupportRelatedKind; value: string; options: SupportRelatedOption[]; onChange: (value: string) => void }) {
  const picker = useSupportRelatedPicker(), selected = options.find(option => option.value === value);
  const label = kind === 'entry' ? 'Related entry' : 'Related payment';
  return <View style={{ marginBottom: 16, gap: 8 }}>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}><Text style={{ color: b.label, fontSize: 14, fontWeight: '500' }}>{label}</Text><Text style={{ color: b.muted, fontSize: 12 }}>Optional</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{ text: selected?.label || 'None selected' }} accessibilityHint="Search and choose an item to include with your enquiry"
      onPress={() => picker?.open({ kind, value, options, onChoose: onChange })} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge }}>
      <SymbolView name={{ ios: kind === 'entry' ? 'calendar' : 'creditcard', android: kind === 'entry' ? 'calendar_month' : 'credit_card', web: kind === 'entry' ? 'calendar_month' : 'credit_card' }} size={20} tintColor={SETTINGS_BLUE} />
      <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={2} style={{ color: selected ? b.premium : b.muted, fontSize: 15, lineHeight: 20 }}>{selected?.label || (kind === 'entry' ? 'Choose an entry' : 'Choose a payment')}</Text>{selected?.detail && <Text style={{ color: b.muted, fontSize: 12, marginTop: 4 }}>{selected.detail}</Text>}</View>
      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={b.muted} />
    </Pressable>
  </View>;
}
