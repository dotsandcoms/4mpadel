import { ErrorBanner } from '@/components/error-banner';
import { HomeAction } from '@/components/home-action';
import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { DiscoveryChoices, DiscoverySearch, discoveryStyles as d } from './discovery-controls';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { fetchProSnapshot, proDate, type ProTour, type ProTournament } from '@/lib/pro-padel';
import { fetchProSeasons, fetchSeasonTournaments, type ProSeason } from '@/lib/pro-padel-live';
import { proTournamentDestination } from '@/lib/pro-tournament';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import { loadingBlue, lightBrand as brand } from '@/theme/tokens';

const premierLevels = ['', 'major', 'p1', 'p2', 'finals'];
const currentTourSeasons = (items: ProSeason[]) => items.filter(item => {
  const year = Number(item.name.match(/\b20\d{2}\b/)?.[0] || item.startDate.slice(0, 4));
  return year >= new Date().getFullYear();
});
const initialSeasons = currentTourSeasons([
  { id: 5, name: 'Premier Padel 2026', startDate: '', endDate: '', status: 'active' },
  { id: 6, name: 'Cupra FIP Tour 2026', startDate: '', endDate: '', status: 'active' },
  { id: -1, name: 'FIP Promises 2026', startDate: '', endDate: '', status: 'active' },
]);
const dateDay = (date: string) => date.slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const finished = (event: ProTournament) => event.status === 'finished' || dateDay(event.endDate) < today();
const levelName = (value?: string | null) => value ? value === 'major' ? 'Major' : value === 'finals' ? 'Finals' : value.replaceAll('_', ' ').toUpperCase() : 'International';
function Artwork({ event }: { event: ProTournament }) {
  const [failed, setFailed] = useState(false);
  return <Image source={event.photoUrl && !failed ? { uri: event.photoUrl } : require('@/assets/images/calendar-hero.png')}
    onError={() => setFailed(true)} contentFit="contain" cachePolicy="memory-disk" style={s.thumbnail} />;
}

export function ProTourCalendar({ initialTiming = 'upcoming' }: { initialTiming?: 'upcoming' | 'past' } = {}) {
  const router = useRouter();
  const bottom = useTabScenePadding();
  const [official, setOfficial] = useState<ProTournament[]>([]);
  const [officialUpdated, setOfficialUpdated] = useState('');
  const [tour, setTour] = useState<ProTour | null>(null);
  const [seasons, setSeasons] = useState<ProSeason[]>(initialSeasons);
  const [seasonId, setSeasonId] = useState(initialSeasons[0]?.id ?? 0);
  const [seasonEvents, setSeasonEvents] = useState<ProTournament[] | null>(null);
  const [seasonPage, setSeasonPage] = useState(0);
  const [seasonMore, setSeasonMore] = useState(false);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonError, setSeasonError] = useState('');
  const [seasonReload, setSeasonReload] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('');
  const [timing, setTiming] = useState<'upcoming' | 'past'>(initialTiming);
  useEffect(() => { setTiming(initialTiming); }, [initialTiming]);
  const request = useRef(0);
  const seasonRequest = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    const [tourResult, seasonsResult, officialResult] = await Promise.allSettled([fetchProSnapshot('tour'), fetchProSeasons(), fetchProSnapshot('fip-calendar')]);
    if (id !== request.current) return;
    if (tourResult.status === 'fulfilled') { setTour(tourResult.value); setError(''); }
    else setError('Could not refresh the tour calendar. Please try again.');
    if (officialResult.status === 'fulfilled') { setOfficial(officialResult.value.tournaments); setOfficialUpdated(officialResult.value.updatedAt); }
    if (seasonsResult.status === 'fulfilled') {
      const currentSeasons = [...currentTourSeasons(seasonsResult.value), initialSeasons.find(item => item.id === -1)!];
      setSeasons(currentSeasons);
      setSeasonId(selected => currentSeasons.some(item => item.id === selected) ? selected : currentSeasons[0]?.id ?? 0);
    }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));
  useEffect(() => {
    let active = true;
    const version = ++seasonRequest.current;
    setSeasonEvents(null); setSeasonPage(0); setSeasonMore(false); setSeasonError(''); setSeasonLoading(true);
    if (seasonId === -1) { setSeasonEvents(official.filter(event => event.level === 'fip_promises')); setSeasonLoading(false); return; }
    if (!seasonId) { setSeasonLoading(false); return; }
    void (async () => {
      let page = 1;
      let tournaments: ProTournament[] = [];
      while (page <= 20) {
        const result = await fetchSeasonTournaments(seasonId, page);
        if (!active || version !== seasonRequest.current) return;
        tournaments = [...new Map([...tournaments, ...result.tournaments].map(event => [event.id, event])).values()];
        setSeasonEvents(tournaments); setSeasonPage(page); setSeasonMore(result.hasMore && page < 20);
        if (!result.hasMore || tournaments.some(event => !finished(event))) return;
        page++;
      }
    })().catch(e => { if (active && version === seasonRequest.current) setSeasonError(e instanceof Error ? e.message : 'Season could not be loaded.'); })
      .finally(() => { if (active && version === seasonRequest.current) setSeasonLoading(false); });
    return () => { active = false; seasonRequest.current++; };
  }, [seasonId, seasonReload, official]);
  const loadMoreSeason = async () => {
    if (!seasonId || !seasonMore || seasonLoading || seasonPage >= 20) return;
    const version = seasonRequest.current;
    setSeasonLoading(true); setSeasonError('');
    try {
      const result = await fetchSeasonTournaments(seasonId, seasonPage + 1);
      if (version !== seasonRequest.current) return;
      setSeasonEvents(previous => [...new Map([...(previous || []), ...result.tournaments].map(event => [event.id, event])).values()]);
      setSeasonPage(seasonPage + 1); setSeasonMore(result.hasMore && seasonPage + 1 < 20);
    } catch (e) { if (version === seasonRequest.current) setSeasonError(e instanceof Error ? e.message : 'More tournaments could not be loaded.'); }
    finally { if (version === seasonRequest.current) setSeasonLoading(false); }
  };
  const season = seasons.find(item => item.id === seasonId);
  const providerEvents = seasonEvents ?? (tour?.tournaments || []).filter(event => seasonId === 5 ? premierLevels.includes(event.level || '') : !premierLevels.includes(event.level || ''));
  const availableEvents = !season ? [] : seasonId === 6 ? [...providerEvents, ...official.filter(event => event.level === 'fip_bronze')] : providerEvents;
  const levels = seasonId === 5 ? premierLevels : ['', ...new Set(availableEvents.map(event => event.level?.toLowerCase()).filter((value): value is string => !!value))];
  const rows = useMemo(() => [...new Map(availableEvents.map(e => [e.id, e])).values()]
    .filter(e => (timing === 'past' ? finished(e) : !finished(e)) && (!level || e.level?.toLowerCase() === level)
      && `${e.name} ${e.location || ''} ${e.country || ''} ${e.venue || ''}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => timing === 'past' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)), [availableEvents, timing, level, search]);
  const timings = [{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }];
  const changeTiming = (value: string) => { if (value === 'upcoming' || value === 'past') setTiming(value); };
  const clear = () => { setSearch(''); setLevel(''); setTiming('upcoming'); };
  return <View style={{ flex: 1 }}>
    <FlatList style={{ flex: 1 }} data={rows} keyExtractor={e => String(e.id)} refreshing={loading || seasonLoading} onRefresh={() => { void load(); setSeasonReload(value => value + 1); }}
      keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottom }}
      ListHeaderComponent={<>
        <View style={d.headingBlock}>
          <Text accessibilityRole="header" style={d.heading}>International events</Text>
          <Text style={d.description}>Seasons, tournaments and published matches</Text>
        </View>
        <DiscoveryChoices label="Season" value={String(seasonId)} options={seasons.map(item => ({ value: String(item.id), label: item.name }))}
          onChange={value => { setSeasonId(Number(value)); setLevel(''); setTiming('upcoming'); }} />
        {!seasons.length && <Text style={[d.caption, { marginHorizontal: 16 }]}>No current tour season has been published yet</Text>}
        <View style={[d.searchBlock, { paddingTop: 4 }]}><DiscoverySearch value={search} onChange={setSearch} placeholder="Tournament or location" /></View>
        <DiscoveryChoices label="Level" value={level} options={levels.map(value => ({ value, label: value ? levelName(value) : 'All levels' }))} onChange={setLevel} />
        <View style={d.timing}><NativeSegmentedControl label="Tournament dates" value={timing} options={timings} onChange={changeTiming} /></View>
        <View style={d.results}>
          <Text accessibilityLiveRegion="polite" style={d.caption}>{rows.length} {rows.length === 1 ? 'tournament' : 'tournaments'}{seasonMore ? ' · More available' : ''}</Text>
          <Text style={s.source}>{seasonId === -1 ? `Official FIP calendar · Updated ${proDate(officialUpdated)}` : seasonEvents ? `${season?.name || 'Tour'} · Shared season directory` : tour && seasonId === 5 ? `Snapshot updated ${proDate(tour.updatedAt)}` : season?.name}</Text>
        </View>
        {!!seasonError && <View style={d.empty}><Text style={d.caption}>{seasonError}{seasonId === 5 && !seasonEvents ? ' Showing the last published Premier Padel calendar.' : ''}</Text><HomeAction label="Retry season" onPress={() => setSeasonReload(value => value + 1)} /></View>}
        {!!error && <View style={d.empty}><Text style={d.caption}>{error}</Text><HomeAction label="Retry" onPress={() => void load()} /></View>}
      </>}
      ListEmptyComponent={seasonLoading ? <ActivityIndicator color={loadingBlue} style={{ margin: 32 }} /> : !seasonError && !error ? <View style={d.empty}>
        <Text style={d.emptyTitle}>No matching tournaments</Text><Text style={d.caption}>Try another search or season, or clear your filters</Text><HomeAction label="Clear filters" onPress={clear} />
      </View> : null}
      ListFooterComponent={seasonMore ? <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}>
        {seasonLoading ? <ActivityIndicator color={loadingBlue} /> : <HomeAction label="Load more tournaments" fullWidth onPress={() => void loadMoreSeason()} />}
      </View> : null}
      renderItem={({ item }) => {
        const live = !finished(item) && (item.status === 'ongoing' || item.status === 'live');
        return <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name}, ${proDate(item.startDate)}${live ? ', in progress' : ''}`}
          onPress={() => router.push(proTournamentDestination(item))} android_ripple={{ color: brand.surface }} style={s.card}>
          <Artwork key={item.id} event={item} />
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <View style={s.metadata}><Text style={s.level}>{levelName(item.level)}</Text>{finished(item) ? <Text style={d.caption}>Completed</Text> : live ? <Text style={s.live}>In progress</Text> : null}</View>
            <Text style={s.name}>{item.name}</Text>
            <Text style={s.date}>{proDate(item.startDate)} – {proDate(item.endDate)}</Text>
            <Text style={d.caption}>{[item.location, item.country].filter(Boolean).join(' · ') || 'Location to be confirmed'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={brand.faint} accessible={false} />
        </Pressable>;
      }} />
    <ErrorBanner message={seasonError || error || null} top={8} />
  </View>;
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: brand.elevated, borderRadius: 16, borderColor: brand.edge, borderWidth: StyleSheet.hairlineWidth },
  thumbnail: { width: 72, height: 100, borderRadius: 8, backgroundColor: brand.surface },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  level: { color: brand.accent, backgroundColor: brand.glass, fontSize: 11, lineHeight: 16, fontWeight: '500', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  live: { color: brand.danger, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  name: { color: brand.premium, fontSize: 16, lineHeight: 21, fontWeight: '600' },
  date: { color: brand.accent, fontSize: 12, lineHeight: 18, fontWeight: '500', fontVariant: ['tabular-nums'] },
  source: { color: brand.faint, fontSize: 11, lineHeight: 16 },
});
