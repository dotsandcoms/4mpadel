import { Stack, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SearchBarProps } from 'react-native-screens';
import { HomeAction } from '@/components/home-action';
import { SETTINGS_BLUE } from '@/components/settings-ui';
import { useSupportRelatedPicker } from '@/components/support-related-picker';
import { filterSupportOptions, supportItemTitle } from '@/lib/support-related';
import { lightBrand as b } from '@/theme/tokens';

export default function RelatedItemPicker() {
  const router = useRouter(), safe = useSafeAreaInsets(), picker = useSupportRelatedPicker();
  const request = picker?.request;
  const [query, setQuery] = useState('');
  const searchRef = useRef<NonNullable<SearchBarProps['ref']> extends React.RefObject<infer T> ? T : never>(null);
  const clearSearch = () => { searchRef.current?.clearText(); setQuery(''); };
  const entry = request?.kind !== 'payment';
  const rows = useMemo(() => filterSupportOptions(request?.options || [], query), [request?.options, query]);
  const placeholder = entry ? 'Tournament, city or venue' : 'Tournament, amount or reference';
  return <>
    <Stack.Title style={{ fontSize: 17, fontWeight: '600', color: b.premium }}>{entry ? 'Choose an entry' : 'Choose a payment'}</Stack.Title>
    <Stack.Toolbar placement="right"><Stack.Toolbar.Button onPress={() => router.back()} tintColor={SETTINGS_BLUE}>Done</Stack.Toolbar.Button></Stack.Toolbar>
    {Platform.OS !== 'web' && <Stack.SearchBar ref={searchRef} placeholder={placeholder} hideWhenScrolling={false} hideNavigationBar={false} obscureBackground={false} placement="stacked" tintColor={SETTINGS_BLUE} onChangeText={event => setQuery(event.nativeEvent.text)} />}
    <FlatList style={{ flex: 1, backgroundColor: b.page }} data={rows} keyExtractor={row => row.value} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: safe.bottom + 24 }}
      ListHeaderComponent={<View style={{ paddingTop: 12, paddingBottom: 16, gap: 16 }}>
        {Platform.OS === 'web' && <View style={s.webSearch}><SymbolView name="magnifyingglass" size={18} tintColor={b.muted} /><TextInput accessibilityLabel={placeholder} placeholder={placeholder} placeholderTextColor={b.placeholder} autoCorrect={false} value={query} onChangeText={setQuery} style={{ flex: 1, minHeight: 44, color: b.premium, fontSize: 16 }} />{!!query && <HomeAction label="Clear search" kind="icon" icon="close" onPress={clearSearch} />}</View>}
        <Text style={s.helper}>{entry ? 'Choose from your entries to include the tournament reference with your enquiry' : 'Choose a transaction to include its reference with your enquiry'}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: request?.value === '' }} onPress={() => picker?.choose('')} style={s.none}>
          <View style={{ flex: 1, gap: 4 }}><Text style={s.name}>{entry ? 'No related entry' : 'No related payment'}</Text><Text style={s.meta}>Continue without a reference</Text></View>
          {request?.value === '' && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={18} tintColor={SETTINGS_BLUE} />}
        </Pressable>
        {!!query.trim() && <Text accessibilityLiveRegion="polite" style={s.meta}>{rows.length} {rows.length === 1 ? 'match' : 'matches'}</Text>}
      </View>}
      renderItem={({ item, index }) => {
        const selected = item.value === request?.value;
        const day = item.date && new Date(`${item.date.slice(0, 10)}T12:00:00Z`);
        const dated = day && !Number.isNaN(day.getTime());
        return <View>
          {(!index || rows[index - 1].group !== item.group) && <Text accessibilityRole="header" style={s.group}>{item.group || (entry ? 'Your entries' : 'Your payments')}</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={[supportItemTitle(item.label), item.detail, item.location, item.amount, item.status?.label].filter(Boolean).join('. ')} onPress={() => picker?.choose(item.value)} android_ripple={{ color: b.surface }} style={[s.row, { backgroundColor: selected ? '#F1F4FC' : b.elevated, borderTopLeftRadius: !index || rows[index - 1].group !== item.group ? 12 : 0, borderTopRightRadius: !index || rows[index - 1].group !== item.group ? 12 : 0, borderBottomLeftRadius: index === rows.length - 1 || rows[index + 1].group !== item.group ? 12 : 0, borderBottomRightRadius: index === rows.length - 1 || rows[index + 1].group !== item.group ? 12 : 0 }]}>
            {entry && <View style={s.date}><Text style={s.month}>{dated ? day.toLocaleDateString('en-ZA', { month: 'short', timeZone: 'Africa/Johannesburg' }) : 'Date'}</Text><Text style={s.day}>{dated ? day.getUTCDate() : '—'}</Text></View>}
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text numberOfLines={3} style={s.name}>{supportItemTitle(item.label)}</Text><Text style={s.meta}>{[item.detail, item.amount].filter(Boolean).join(' · ')}</Text>{!!item.location && <Text numberOfLines={1} style={s.meta}>{item.location}</Text>}{item.status && <Text style={[s.meta, { color: item.status.color }]}>{item.status.label}</Text>}</View>
            <View style={{ width: 20, alignItems: 'center' }}>{selected && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={18} tintColor={SETTINGS_BLUE} />}</View>
          </Pressable>
        </View>;
      }}
      ListEmptyComponent={<View style={s.empty}><Text style={{ color: b.premium, fontSize: 17, fontWeight: '500' }}>{query.trim() ? 'No matching items' : 'No items available'}</Text><Text style={s.helper}>{query.trim() ? 'Try fewer words or a different tournament name' : 'Go back to Help & enquiries to choose an item'}</Text>{!!query && <HomeAction label="Clear search" onPress={clearSearch} accentColor={SETTINGS_BLUE} />}</View>} />
  </>;
}

const s = StyleSheet.create({
  helper: { color: b.muted, fontSize: 13, lineHeight: 20 },
  meta: { color: b.muted, fontSize: 12, lineHeight: 16 },
  name: { color: b.premium, fontSize: 15, lineHeight: 20, fontWeight: '500' },
  none: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 16, backgroundColor: b.elevated, borderRadius: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, minHeight: 88, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: b.edge },
  group: { color: b.muted, fontSize: 13, lineHeight: 20, fontWeight: '500', paddingTop: 16, paddingBottom: 8, paddingLeft: 4 },
  date: { width: 44, minHeight: 56, paddingVertical: 4, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: b.surface, borderRadius: 8 },
  month: { color: b.muted, fontSize: 11, lineHeight: 16 },
  day: { color: b.premium, fontSize: 20, lineHeight: 24, fontWeight: '500', fontVariant: ['tabular-nums'] },
  empty: { paddingVertical: 32, gap: 8, alignItems: 'center' },
  webSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: b.surface, borderRadius: 12 },
});
