import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, Notice } from '@/components/events/event-ui';
import { EventText as Text, EventIcon, Fade, WebsiteHeader, lime } from '@/components/events/website-ui';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import { currentEmail, fetchCalendarEvents, fetchScheduledIds, setEventScheduled, eventImage, type EventDetail } from '@/lib/events';
import { filterEvents, type EventFilters } from '@/lib/event-rules';
import { formatEventRange } from '@/lib/home';
import { CalendarEventCard } from '@/components/events/calendar-event-card';
import { ProTourCalendar } from '@/components/events/pro-tour-calendar';
import { lightSapaTone as sapaTone } from '@/theme/sapa';

export default function CalendarScreen() {
  const { circuit } = useLocalSearchParams<{ circuit?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pro = circuit === 'pro';
  return <View style={{ flex: 1, backgroundColor: '#F5F6F3', paddingTop: insets.top }}>
    <WebsiteHeader />
    <View style={{ flexDirection: 'row', marginHorizontal: 20, marginVertical: 12, padding: 4, borderRadius: 28, backgroundColor: '#FFFFFF', gap: 4 }}>
      {(['sa', 'pro'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: pro === (value === 'pro') }}
        onPress={() => router.setParams({ circuit: value })} style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: pro === (value === 'pro') ? lime : 'transparent' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: pro === (value === 'pro') ? '#000' : '#52625A' }}>{value === 'sa' ? 'South Africa' : 'Premier Padel & FIP'}</Text>
      </Pressable>)}
    </View>
    {pro ? <ProTourCalendar /> : <SouthAfricaCalendar />}
  </View>;
}

function SouthAfricaCalendar() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = useTabScenePadding();
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [saved, setSaved] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const saving = useRef(new Set<number>());
  const [filters, setFilters] = useState<EventFilters>({ search: '', timing: 'upcoming', city: '', tier: '' });
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
  const cities = useMemo(() => [...new Set(events.map(e => e.city).filter((s): s is string => !!s))].sort(), [events]);
  const toggleSaved = async (id: number) => {
    if (saving.current.has(id)) return;
    saving.current.add(id); setSaveError('');
    const next = !saved.includes(id);
    try { await setEventScheduled(id, next); setSaved(ids => next ? [...ids, id] : ids.filter(value => value !== id)); }
    catch (e) { setSaveError(e instanceof Error ? e.message : 'Could not update your schedule.'); }
    finally { saving.current.delete(id); }
  };
  const count = 1 + Number(!!filters.city) + Number(eventType !== 'All');
  return <View style={{ flex: 1, backgroundColor: '#F5F6F3' }}>
    <FlatList data={rows} keyExtractor={item => String(item.id)} refreshing={loading && events.length > 0} onRefresh={load}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: bottom }}
      ListHeaderComponent={<>
        <View style={{ paddingTop: 28, paddingBottom: 16 }}>
          <View style={{ marginLeft: 20, marginRight: 20 }}>
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, borderColor: '#CCFF0033', borderWidth: 1, backgroundColor: '#CCFF000d', paddingHorizontal: 10, paddingVertical: 5 }}>
              <EventIcon name="calendar" size={12} /><Text style={{ fontSize: 10, fontWeight: '600', color: "#386018", letterSpacing: 1 }}>EVENTS SCHEDULE</Text>
            </View>
            <Text accessibilityRole="header" style={{ fontSize: 32, fontWeight: '700', lineHeight: 40, letterSpacing: -1.4, marginTop: 12 }}>Find your next match.</Text>
            <Text style={{ fontSize: 14, lineHeight: 19, marginTop: 4 }}>Find and explore padel{ '\n' }events across South Africa.</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 20 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, backgroundColor: '#FFFFFF', borderColor: '#16251f0d', borderWidth: 1, borderRadius: 30, height: 46 }}>
                <EventIcon name="magnifyingglass" size={16} color="#6b7280" />
                <TextInput value={filters.search} onChangeText={search => setFilters(f => ({ ...f, search }))} accessibilityLabel="Search events or venues" placeholder="Search events or venues..." placeholderTextColor="#6b7280" returnKeyType="search" autoCorrect={false} style={{ flex: 1, paddingLeft: 12, paddingRight: 12, color: '#16251F', fontSize: 14, height: 46 }} />
              </View>
              <Pressable onPress={() => setShowFilters(true)} accessibilityRole="button" accessibilityLabel={`Filters, ${count} active`} style={{ paddingHorizontal: 20, height: 46, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#16251f0d', borderRadius: 30 }}>
                <EventIcon name="line.3.horizontal.decrease" color="#65726B" /><View style={{ backgroundColor: lime, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#000', fontSize: 10, fontWeight: '800' }}>{count}</Text></View>
              </Pressable>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 32, gap: 8, paddingTop: 12, paddingBottom: 32 }}>
          {['', 'Major', 'Super Gold', 'Gold', 'Silver', 'Bronze', 'FIP event'].map(tier => <Pressable key={tier} onPress={() => setFilters(f => ({ ...f, tier }))} accessibilityRole="button" accessibilityState={{ selected: filters.tier === tier }} hitSlop={{ top: 5, bottom: 5 }} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 16, minHeight: 44, borderRadius: 20, borderWidth: 1, borderColor: filters.tier === tier ? lime : '#16251f1a', backgroundColor: filters.tier === tier ? lime : 'transparent' }}>
            <EventIcon name={tier ? tier === 'FIP event' ? 'globe' : 'trophy' : 'calendar'} color={filters.tier === tier ? '#000' : sapaTone(tier).text} size={14} /><Text style={{ fontSize: 11, color: filters.tier === tier ? '#000' : '#52625A' }}>{tier === 'FIP event' ? 'FIP' : tier || 'All'}</Text>
          </Pressable>)}
        </ScrollView>
        <View style={{ marginHorizontal: 20, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 11, color: '#16251fcc', fontWeight: '600' }}>{filters.timing === 'past' ? 'PAST EVENTS' : filters.timing === 'saved' ? 'MY SCHEDULE' : 'UPCOMING EVENTS'}</Text>
          <Text style={{ color: "#386018", backgroundColor: '#CCFF001a', borderColor: '#CCFF0033', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, fontSize: 10, fontWeight: '800' }}>{rows.length}</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: filters.timing === 'saved' }} onPress={() => setFilters(f => ({ ...f, timing: f.timing === 'saved' ? 'upcoming' : 'saved' }))} hitSlop={10}><Text style={{ fontSize: 10, color: filters.timing === 'saved' ? lime : '#65726B' }}>♡ My Schedule</Text></Pressable>
        </View>
        {!!error && <View style={{ margin: 16 }}><Notice title="Calendar unavailable" onRetry={load}>{error}</Notice></View>}
        {!!saveError && <View style={{ margin: 16 }}><Notice title="Schedule not updated">{saveError}</Notice></View>}
      </>}
      ListEmptyComponent={!error ? loading ? <ActivityIndicator color={lime} style={{ margin: 40 }} /> : <View style={{ margin: 16 }}><Notice title="No events found matching your criteria.">Try another search or clear your filters.</Notice></View> : null}
      renderItem={({ item }) => <CalendarEventCard event={item} saved={saved.includes(item.id)} onSave={() => void toggleSaved(item.id)} onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(item.id) } })} />} />
    <Modal visible={showFilters} animationType="slide" transparent onRequestClose={() => setShowFilters(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0009' }}>
        <Pressable accessibilityLabel="Close filters" onPress={() => setShowFilters(false)} style={{ flex: 1 }} />
        <View style={{ maxHeight: '85%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: insets.bottom + 24, gap: 20 }}>
          <Text style={{ fontSize: 20, fontWeight: '700' }}>Filters</Text>
          <ScrollView contentContainerStyle={{ gap: 18 }}>
            <Text style={{ color: '#65726B', fontSize: 12 }}>EVENT TYPE</Text><View style={{ flexDirection: 'row', gap: 8 }}>{['All', 'Leagues', 'Tournaments'].map(value => <Chip key={value} label={value} selected={eventType === value} onPress={() => setEventType(value)} />)}</View>
            <Text style={{ color: '#65726B', fontSize: 12 }}>WHEN</Text><View style={{ flexDirection: 'row', gap: 8 }}>{(['upcoming', 'past', 'saved'] as const).map(timing => <Chip key={timing} label={timing === 'saved' ? 'My Schedule' : timing === 'past' ? 'Past' : 'Upcoming'} selected={filters.timing === timing} onPress={() => setFilters(f => ({ ...f, timing }))} />)}</View>
            <Text style={{ color: '#65726B', fontSize: 12 }}>CITY</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['', ...cities].map(city => <Chip key={city} label={city || 'All cities'} selected={filters.city === city} onPress={() => setFilters(f => ({ ...f, city }))} />)}</View>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 12 }}><Pressable onPress={() => { setFilters({ search: '', timing: 'upcoming', city: '', tier: '' }); setEventType('All'); }} style={{ padding: 14 }}><Text>Clear</Text></Pressable><Pressable onPress={() => setShowFilters(false)} style={{ flex: 1, backgroundColor: lime, padding: 14, alignItems: 'center', borderRadius: 12 }}><Text style={{ color: '#000', fontWeight: '700' }}>Show Results</Text></Pressable></View>
        </View>
      </View>
    </Modal>
  </View>;
}