import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBanner } from '@/components/error-banner';
import { FieldColors } from '@/components/field-colors';
import { HomeAction } from '@/components/home-action';
import { HomeSourcePicker } from '@/components/home-source-picker';
import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { SelectField } from '@/components/select-field';
import { CalendarEventCard } from '@/components/events/calendar-event-card';
import { DiscoveryChoices, DiscoveryFilterGroup, DiscoveryFilterSheet, DiscoverySearch, discoveryStyles as s } from '@/components/events/discovery-controls';
import { ProTourCalendar } from '@/components/events/pro-tour-calendar';
import { WebsiteHeader } from '@/components/events/website-ui';
import { useAnalyticsSearch } from '@/hooks/use-analytics-search';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import { trackEvent } from '@/lib/analytics';
import { currentEmail, fetchCalendarEvents, fetchScheduledIds, setEventScheduled, type EventDetail } from '@/lib/events';
import { filterEvents, type EventFilters } from '@/lib/event-rules';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

const defaultFilters: EventFilters = { search: '', timing: 'upcoming', city: '', tier: '' };
const timings = [{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'saved', label: 'My schedule' }];
const fieldColors = { ...b, soft: b.glass, selection: '#38601833' };

export default function CalendarScreen() {
  const { circuit, timing } = useLocalSearchParams<{ circuit?: string; timing?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pro = circuit === 'pro';
  return <View style={{ flex: 1, backgroundColor: b.page, paddingTop: insets.top }}>
    <WebsiteHeader />
    <View style={{ marginHorizontal: 16, marginTop: 8, marginBottom: 4 }}>
      <HomeSourcePicker value={pro ? 'international' : '4m'} onChange={next => {
        const value = next === 'international' ? 'pro' : 'sa';
        void trackEvent('feature_interaction', { feature: 'event_calendar', action: 'tab', selection: value });
        router.setParams({ circuit: value });
      }} />
    </View>
    {pro ? <ProTourCalendar initialTiming={timing === 'past' ? 'past' : 'upcoming'} /> : <SouthAfricaCalendar />}
  </View>;
}

function SouthAfricaCalendar() {
  const router = useRouter();
  const bottom = useTabScenePadding();
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const saving = useRef(new Set<number>());
  const [savingIds, setSavingIds] = useState<number[]>([]);
  const [filters, setFilters] = useState<EventFilters>(defaultFilters);
  const [eventType, setEventType] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true); setError('');
    try {
      const [rows, email] = await Promise.all([fetchCalendarEvents(), currentEmail()]);
      const ids = email ? await fetchScheduledIds(email) : [];
      if (id !== request.current) return;
      setEvents(rows); setSaved(ids);
    } catch (e) { if (id === request.current) setError(e instanceof Error ? e.message : 'Could not load events. Please try again.'); }
    finally { if (id === request.current) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { request.current++; }; }, [load]));
  const rows = useMemo(() => filterEvents(events, filters, saved).filter(e => eventType === 'All' || (eventType === 'Leagues' ? e.is_league : !e.is_league)), [events, filters, saved, eventType]);
  useAnalyticsSearch(filters.search, rows.length, 'events', !loading);
  const cities = useMemo(() => [...new Set(events.map(e => e.city).filter((s): s is string => !!s))].sort(), [events]);
  const toggleSaved = async (id: number) => {
    if (saving.current.has(id)) return;
    saving.current.add(id); setSavingIds([...saving.current]); setSaveError('');
    const next = !saved.includes(id);
    try { await setEventScheduled(id, next); setSaved(ids => next ? [...ids, id] : ids.filter(value => value !== id)); }
    catch (e) { setSaveError(e instanceof Error ? e.message : 'Could not update your schedule.'); }
    finally { saving.current.delete(id); setSavingIds([...saving.current]); }
  };
  const changeTiming = (value: string) => {
    if (value !== 'upcoming' && value !== 'past' && value !== 'saved') return;
    void trackEvent('feature_interaction', { feature: 'event_calendar', action: 'filter', selection: value });
    setFilters(f => ({ ...f, timing: value }));
  };
  const clear = () => { setFilters(defaultFilters); setEventType('All'); };
  const count = Number(!!filters.city) + Number(eventType !== 'All');
  return <View style={{ flex: 1 }}>
    <FlatList style={{ flex: 1 }} data={rows} keyExtractor={item => String(item.id)} refreshing={loading && events.length > 0} onRefresh={load}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: bottom }}
      ListHeaderComponent={<>
        <View style={s.headingBlock}>
          <Text accessibilityRole="header" style={s.heading}>Tournaments</Text>
          <Text style={s.description}>Find tournaments, enter and earn ranking points</Text>
        </View>
        <View style={s.searchBlock}><DiscoverySearch value={filters.search} onChange={search => setFilters(f => ({ ...f, search }))}
          placeholder="Event, city or venue" filterCount={count} onFilters={() => setShowFilters(true)} /></View>
        <DiscoveryChoices label="Tier" value={filters.tier} options={['', 'Major', 'Super Gold', 'Gold', 'Silver', 'Bronze'].map(tier => ({ value: tier, label: tier || 'All tiers' }))}
          onChange={tier => {
            void trackEvent('feature_interaction', { feature: 'event_calendar', action: 'filter', selection: tier ? tier.toLowerCase().replaceAll(' ', '_') : 'all_tiers' });
            setFilters(f => ({ ...f, tier }));
          }} />
        <View style={s.timing}><NativeSegmentedControl label="Event dates" value={filters.timing} options={timings} onChange={changeTiming} /></View>
        <View style={s.results}>
          <Text accessibilityLiveRegion="polite" style={s.caption}>{loading && !events.length ? 'Loading events…' : `${rows.length} ${rows.length === 1 ? 'event' : 'events'}${filters.city ? ` · ${filters.city}` : ''}${eventType !== 'All' ? ` · ${eventType}` : ''}`}</Text>
        </View>
        {!!error && <View style={s.empty}><Text style={s.emptyTitle}>Calendar unavailable</Text><Text style={s.caption}>{error}</Text><HomeAction label="Retry" onPress={() => void load()} /></View>}
      </>}
      ListEmptyComponent={!error ? loading ? <ActivityIndicator color={loadingBlue} style={{ margin: 32 }} /> : <View style={s.empty}>
        <Text style={s.emptyTitle}>{filters.timing === 'saved' && !saved.length ? 'Your schedule starts here' : 'No matching events'}</Text>
        <Text style={s.caption}>{filters.timing === 'saved' && !saved.length ? 'Save an event to keep it in My schedule' : 'Try another search, or clear your filters'}</Text>
        <HomeAction label="Clear filters" onPress={clear} />
      </View> : null}
      renderItem={({ item }) => <CalendarEventCard event={item} saved={saved.includes(item.id)} saving={savingIds.includes(item.id)}
        onSave={() => void toggleSaved(item.id)} onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(item.id) } })} />} />
    <DiscoveryFilterSheet visible={showFilters} onClose={() => setShowFilters(false)} onClear={() => { setFilters(f => ({ ...f, city: '' })); setEventType('All'); }} resultLabel={`Show ${rows.length} ${rows.length === 1 ? 'event' : 'events'}`}>
      <DiscoveryFilterGroup title="Event type"><NativeSegmentedControl label="Event type" value={eventType}
        options={['All', 'Leagues', 'Tournaments'].map(value => ({ value, label: value }))} onChange={value => {
          void trackEvent('feature_interaction', { feature: 'event_calendar', action: 'filter', selection: value.toLowerCase() }); setEventType(value);
        }} /></DiscoveryFilterGroup>
      <FieldColors.Provider value={fieldColors}><SelectField label="City" value={filters.city} searchable options={[{ value: '', label: 'All cities' }, ...cities.map(city => ({ value: city, label: city }))]}
        onChange={city => { void trackEvent('feature_interaction', { feature: 'event_calendar', action: 'filter', selection: city ? 'specific_city' : 'all_cities' }); setFilters(f => ({ ...f, city })); }} /></FieldColors.Provider>
    </DiscoveryFilterSheet>
    <ErrorBanner message={saveError || error || null} top={8} />
  </View>;
}
