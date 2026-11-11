import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeAction } from '@/components/home-action';
import { lightBrand as b } from '@/theme/tokens';

/** Shared native actions keep the two event directories in the same visual system. */
export function DiscoverySearch({ value, onChange, placeholder, filterCount = 0, onFilters }: {
  value: string; onChange: (value: string) => void; placeholder: string; filterCount?: number; onFilters?: () => void;
}) {
  return <View style={s.searchRow}>
    <View style={s.search}>
      <Ionicons name="search-outline" size={18} color={b.muted} accessible={false} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} accessibilityLabel={placeholder}
        placeholderTextColor={b.faint} autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing"
        style={s.input} selectionColor={b.accent} />
    </View>
    {onFilters && <HomeAction label={filterCount ? `Filters · ${filterCount}` : 'Filters'} icon="filters" compact
      accessibilityLabel={`City and event type filters${filterCount ? `, ${filterCount} active` : ''}`} onPress={onFilters} />}
  </View>;
}

export function DiscoveryChoices({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void;
}) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.choices} contentContainerStyle={s.choiceContent}>
    {options.map(option => <HomeAction key={option.value} label={option.label} compact
      accessibilityLabel={`${label}: ${option.label}${value === option.value ? ', selected' : ''}`}
      kind={value === option.value ? 'primary' : 'link'} onPress={() => onChange(option.value)} />)}
  </ScrollView>;
}

export function DiscoveryFilterSheet({ visible, onClose, onClear, resultLabel, children }: {
  visible: boolean; onClose: () => void; onClear: () => void; resultLabel: string; children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
    allowSwipeDismissal onRequestClose={onClose}>
    <View style={[s.sheet, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top }]}>
      <View style={s.sheetHeader}>
        <Text accessibilityRole="header" style={s.sheetTitle}>Event filters</Text>
        <HomeAction label="Close filters" icon="close" kind="icon" onPress={onClose} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.sheetContent} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <View style={[s.sheetFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <HomeAction label="Clear" onPress={onClear} />
        <View style={{ flex: 1 }}><HomeAction label={resultLabel} kind="primary" fullWidth onPress={onClose} /></View>
      </View>
    </View>
  </Modal>;
}

export function DiscoveryFilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ gap: 8 }}><Text style={s.groupTitle}>{title}</Text>{children}</View>;
}

export const discoveryStyles = StyleSheet.create({
  headingBlock: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 4 },
  heading: { color: b.premium, fontSize: 24, lineHeight: 30, fontWeight: '600' },
  description: { color: b.muted, fontSize: 13, lineHeight: 18 },
  searchBlock: { paddingHorizontal: 16, paddingBottom: 4 },
  timing: { marginHorizontal: 16, marginTop: 4, marginBottom: 12 },
  results: { paddingHorizontal: 16, paddingBottom: 12, gap: 4 },
  caption: { color: b.muted, fontSize: 12, lineHeight: 18 },
  empty: { marginHorizontal: 16, padding: 20, borderRadius: 16, backgroundColor: b.surface, gap: 8 },
  emptyTitle: { color: b.premium, fontSize: 16, lineHeight: 22, fontWeight: '500' },
});

const s = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  search: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: b.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: b.edge },
  input: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 14, color: b.premium, paddingVertical: 8 },
  choices: { flexGrow: 0, height: 52 },
  choiceContent: { alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  sheet: { flex: 1, backgroundColor: b.page },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: b.edge },
  sheetTitle: { color: b.premium, fontSize: 20, lineHeight: 28, fontWeight: '600' },
  sheetContent: { padding: 20, gap: 24 },
  sheetFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: b.edge },
  groupTitle: { color: b.label, fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
