import { Chip } from '@/components/events/event-ui';
import { EventIcon } from '@/components/events/website-ui';
import { addToDeviceCalendar } from '@/lib/device-calendar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchProSnapshot, proDate, proStale, type ProTour, type ProFixtures, type ProTournament } from '@/lib/pro-padel';
import { MatchCard } from '@/components/pro-padel-feed';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import { lightBrand as brand } from '@/theme/tokens';

const levels = ['', 'major', 'p1', 'p2', 'finals'];
const dateDay = (date: string) => date.slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const finished = (event: ProTournament) => event.status === 'finished' || dateDay(event.endDate) < today();
const levelName = (value?: string | null) => value ? value === 'major' ? 'Major' : value === 'finals' ? 'Finals' : value.toUpperCase() : 'Premier Padel';
function Button({ label, onPress, selected = false }: { label: string; onPress: () => void; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.button, selected && { backgroundColor: brand.padel, borderColor: brand.padel }]}>
    <Text style={[s.buttonText, selected && { color: '#000' }]}>{label}</Text>
  </Pressable>;
}
function Artwork({ event, large = false }: { event: ProTournament; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <Image source={event.photoUrl && !failed ? { uri: event.photoUrl } : require('@/assets/images/calendar-hero.png')}
    onError={() => setFailed(true)} contentFit="cover" style={large ? s.cover : s.thumbnail} />;
}

export function ProTourCalendar() {
  const bottom = useTabScenePadding();
  const insets = useSafeAreaInsets();
  const [showFilters, setShowFilters] = useState(false);
  const [tour, setTour] = useState<ProTour | null>(null);
  const [fixtures, setFixtures] = useState<ProFixtures | null>(null);
  const [error, setError] = useState('');
  const [fixtureError, setFixtureError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [timing, setTiming] = useState<'upcoming' | 'past'>('upcoming');
  const [selected, setSelected] = useState<ProTournament | null>(null);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    const [tourResult, fixtureResult] = await Promise.allSettled([fetchProSnapshot('tour'), fetchProSnapshot('fixtures')]);
    if (id !== request.current) return;
    if (tourResult.status === 'fulfilled') { setTour(tourResult.value); setError(''); }
    else setError('Could not refresh the tour calendar. Please try again.');
    if (fixtureResult.status === 'fulfilled') { setFixtures(fixtureResult.value); setFixtureError(''); }
    else setFixtureError('Published fixtures could not refresh.');
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));
  const rows = useMemo(() => [...new Map((tour?.tournaments || []).map(e => [e.id, e])).values()]
    .filter(e => (timing === 'past' ? finished(e) : !finished(e)) && (!level || e.level?.toLowerCase() === level)
      && `${e.name} ${e.location || ''} ${e.country || ''} ${e.venue || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => timing === 'past' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)), [tour, timing, level, search]);
  const resultMatches = selected ? tour?.matches.filter(m => m.tournamentId === selected.id) || [] : [];
  const fixtureMatches = selected ? fixtures?.matches.filter(m => m.tournamentId === selected.id) || [] : [];
  const lookup = useMemo(() => new Map(), []);
  return <View style={{ flex: 1 }}>
    <FlatList data={rows} keyExtractor={e => String(e.id)} refreshing={loading} onRefresh={load}
      keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottom }}
      ListHeaderComponent={<View style={s.header}>
        <Text style={s.kicker}>PREMIER PADEL</Text>
        <Text accessibilityRole="header" style={s.heading}>PRO TOUR</Text>
        <Text style={s.body}>Follow the international tour. Majors, P1, P2 and Finals.</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={[s.search, { flex: 1 }]}>
            <Ionicons name="search" size={18} color={brand.faint} />
            <TextInput accessibilityLabel="Search tour tournaments or locations" value={search} onChangeText={setSearch} placeholder="Search tournaments or locations" placeholderTextColor={brand.faint} autoCorrect={false} style={s.input} />
          </View>
          <Pressable onPress={() => setShowFilters(true)} accessibilityRole="button" accessibilityLabel={`Filters, 1 active, ${timing}`} style={s.filterButton}>
            <EventIcon name="line.3.horizontal.decrease" color="#65726B" />
            <View style={s.filterBadge}><Text style={{ color: '#000', fontSize: 10, fontWeight: '800' }}>1</Text></View>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {levels.map(value => <Button key={value} label={value ? levelName(value) : 'All levels'} selected={level === value} onPress={() => setLevel(value)} />)}
        </ScrollView>
        <Text style={s.caption}>Premier Padel coverage only · Full FIP calendar not yet included.</Text>
        <Text style={{ color: brand.premium, fontSize: 11, fontWeight: '600', letterSpacing: 0.7 }}>{timing === 'past' ? 'PAST TOURNAMENTS' : 'UPCOMING TOURNAMENTS'}</Text>
        {tour && <Text style={s.caption}>Updated {proDate(tour.updatedAt)} · {rows.length} tournaments{proStale(tour.updatedAt) ? ' · Update overdue' : ''}</Text>}
        {!!error && <View style={{ gap: 8 }}><Text style={{ color: brand.danger }}>{error}</Text><Button label="Retry" onPress={() => void load()} /></View>}
      </View>}
      ListEmptyComponent={!loading ? <View style={s.header}><Text style={s.body}>{error ? 'Tour data is unavailable.' : 'No tournaments match these filters in the available calendar.'}</Text></View> : !tour ? <ActivityIndicator color={brand.accent} style={{ margin: 30 }} /> : null}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name}, ${proDate(item.startDate)}`} onPress={() => setSelected(item)} style={s.card}>
        <Artwork key={item.id} event={item} />
        <View style={{ flex: 1, gap: 7 }}>
          <Text style={s.kicker}>{levelName(item.level)}{finished(item) ? ' · Completed' : item.status === 'ongoing' || item.status === 'live' ? ' · In progress' : ''}</Text>
          <Text style={s.name} numberOfLines={3}>{item.name}</Text>
          <Text style={s.date}>{proDate(item.startDate)} – {proDate(item.endDate)}</Text>
          <Text style={s.caption} numberOfLines={2}>{[item.location, item.country].filter(Boolean).join(' · ') || 'Location to be confirmed'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={brand.accent} />
      </Pressable>} />
    <Modal visible={showFilters} animationType="slide" transparent onRequestClose={() => setShowFilters(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setShowFilters(false)} style={{ flex: 1 }} />
        <View accessibilityViewIsModal style={{ maxHeight: '85%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24, gap: 20 }}>
          <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 20, fontWeight: '700' }}>Filters</Text>
          <ScrollView contentContainerStyle={{ gap: 18 }}>
            <Text style={{ color: '#65726B', fontSize: 12 }}>WHEN</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{(['upcoming', 'past'] as const).map(value => <Chip key={value} label={value === 'past' ? 'Past' : 'Upcoming'} selected={timing === value} onPress={() => setTiming(value)} />)}</View>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable accessibilityRole="button" onPress={() => { setSearch(''); setLevel(''); setTiming('upcoming'); }} style={{ padding: 14 }}><Text style={{ color: brand.premium }}>Clear</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setShowFilters(false)} style={{ flex: 1, backgroundColor: brand.padel, padding: 14, alignItems: 'center', borderRadius: 12 }}><Text style={{ color: '#000', fontWeight: '700' }}>Show Results</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
    <Modal visible={!!selected} presentationStyle="fullScreen" animationType="slide" onRequestClose={() => setSelected(null)}>
      <SafeAreaProvider><SafeAreaView style={s.modal}>
        <View style={{ paddingHorizontal: 20, paddingVertical: 8, alignItems: 'flex-start' }}><Button label="Back to tour calendar" onPress={() => setSelected(null)} /></View>
        {selected && <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
          <Artwork key={selected.id} event={selected} large />
          <Text style={s.kicker}>{levelName(selected.level)} · PREMIER PADEL</Text>
          <Text accessibilityRole="header" style={s.detailTitle}>{selected.name}</Text>
          <Text style={s.date}>{proDate(selected.startDate)} – {proDate(selected.endDate)}</Text>
          <Text style={s.body}>{[selected.venue, selected.location, selected.country].filter(Boolean).join(' · ') || 'Venue to be confirmed'}</Text>
          <Button label="Add to calendar" selected onPress={() => {
            void addToDeviceCalendar({ title: selected.name, startDate: selected.startDate, endDate: selected.endDate,
              location: [selected.venue, selected.location, selected.country].filter(Boolean).join(' · '),
            }).catch(error => Alert.alert('Calendar unavailable', error instanceof Error ? error.message : 'Please try again.'));
          }} />
          <Text style={s.caption}>Tour information only. Entry registration is not available through 4M for this tournament.</Text>
          <Text style={s.section}>Published fixtures</Text>
          {!!fixtureError && <View style={{ gap: 8 }}><Text style={{ color: brand.danger }}>{fixtureError}</Text><Button label="Retry fixtures" onPress={() => void load()} /></View>}
          {fixtures && <Text style={s.caption}>Updated {proDate(fixtures.updatedAt)}{proStale(fixtures.updatedAt) ? ' · Update overdue' : ''}</Text>}
          {fixtureMatches.length ? fixtureMatches.map(m => <MatchCard key={m.id} match={m} lookup={lookup} onPlayer={() => {}} />)
            : <Text style={s.body}>{fixtures?.tournament?.id === selected.id && !fixtures.drawPublished ? 'The main draw has not been published yet.' : 'No fixtures available in the current feed. Fixture coverage is limited to the next tour event.'}</Text>}
          <Text style={s.section}>Results</Text>
          {tour && <Text style={s.caption}>{tour.coverage} · Updated {proDate(tour.updatedAt)}</Text>}
          {resultMatches.length ? resultMatches.map(m => <MatchCard key={m.id} match={m} lookup={lookup} onPlayer={() => {}} />)
            : <Text style={s.body}>No results for this tournament in the current feed.</Text>}
        </ScrollView>}
      </SafeAreaView></SafeAreaProvider>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  header: { padding: 20, gap: 14 }, modal: { flex: 1, backgroundColor: brand.page },
  kicker: { color: brand.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  heading: { color: brand.premium, fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  detailTitle: { color: brand.premium, fontSize: 28, fontWeight: '700' },
  body: { color: brand.muted, fontSize: 14, lineHeight: 21 },
  caption: { color: brand.muted, fontSize: 11, lineHeight: 17 },
  search: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, borderRadius: 24, backgroundColor: brand.elevated, alignItems: 'center' },
  filterButton: { paddingHorizontal: 20, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#16251f0d', borderRadius: 30 },
  filterBadge: { backgroundColor: brand.padel, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 48, fontSize: 13, color: brand.premium },
  button: { minHeight: 44, borderRadius: 22, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderColor: brand.edge },
  buttonText: { color: brand.premium, fontSize: 12, fontWeight: '600' },
  card: { marginHorizontal: 20, marginBottom: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: brand.elevated, borderRadius: 20, borderColor: brand.edge, borderWidth: 1 },
  thumbnail: { width: 66, height: 90, borderRadius: 10 }, cover: { width: '100%', height: 190, borderRadius: 20 },
  name: { color: brand.premium, fontSize: 16, lineHeight: 21, fontWeight: '700' },
  date: { color: brand.accent, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  section: { color: brand.premium, fontSize: 20, fontWeight: '700' },
});
