import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeHeader } from '@/components/home-header';
import { EmptyBlock } from '@/components/home-event-card';
import { MapPin } from '@/components/map-pin';
import { PressableScale } from '@/components/pressable-scale';
import { Toast, type ToastKind } from '@/components/toast';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import { fetchScheduledEventIds, setEventOnSchedule } from '@/lib/calendar';
import {
  eventDayParts,
  eventPath,
  featuredBackgroundSource,
  fetchCalendarEvents,
  formatEventRange,
  parseDay,
  startOfToday,
  type CalendarEvent,
} from '@/lib/home';
import { openSitePath } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import { sapaLabel, sapaTone } from '@/theme/sapa';
import { brand } from '@/theme/tokens';

type Timing = 'upcoming' | 'past';
type EventKind = 'all' | 'tournaments' | 'leagues';
type CalendarRow =
  | { kind: 'month'; id: string; label: string; count: number }
  | { kind: 'event'; id: string; event: CalendarEvent };

const TIER_ORDER = ['Major', 'Super Gold', 'Gold', 'Silver', 'Bronze', 'FIP event'];
const RIPPLE = { color: 'rgba(204,255,0,0.14)' };

function eventEnd(event: CalendarEvent) {
  return parseDay(event.end_date || event.start_date);
}

function isUpcoming(event: CalendarEvent) {
  const end = eventEnd(event);
  if (!end) return false;
  end.setHours(23, 59, 59, 999);
  return end >= startOfToday();
}

function monthRows(events: CalendarEvent[], timing: Timing): CalendarRow[] {
  const groups = new Map<string, { label: string; events: CalendarEvent[] }>();
  for (const event of events) {
    const date = parseDay(event.start_date);
    if (!date) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
    }).format(date);
    const group = groups.get(key);
    if (group) group.events.push(event);
    else groups.set(key, { label, events: [event] });
  }

  const direction = timing === 'upcoming' ? 1 : -1;
  const rows: CalendarRow[] = [];
  [...groups.entries()]
    .sort(([a], [b]) => direction * a.localeCompare(b))
    .forEach(([key, group]) => {
      group.events.sort(
        (a, b) => direction * String(a.start_date || '').localeCompare(String(b.start_date || ''))
      );
      rows.push({ kind: 'month', id: `month-${key}`, label: group.label, count: group.events.length });
      group.events.forEach((event) => rows.push({ kind: 'event', id: `event-${event.id}`, event }));
    });
  return rows;
}

function FilterChip({
  label,
  selected,
  onPress,
  count,
  icon = 'trophy',
  accent,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
  icon?: 'calendar' | 'trophy' | 'bookmark';
  accent?: string;
}) {
  const color = selected ? brand.page : accent || brand.muted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={count == null ? label : `${label}, ${count}`}
      android_ripple={RIPPLE}
      className="mr-2 min-h-11 flex-row items-center justify-center rounded-full border px-4"
      style={{
        backgroundColor: selected ? brand.padel : 'rgba(255,255,255,0.03)',
        borderColor: selected ? brand.padel : brand.edge,
      }}>
      <SymbolView name={icon} size={14} tintColor={color} />
      <Text
        className="ml-2 text-[10px] font-extrabold tracking-wide"
        style={{ color: selected ? brand.page : brand.premium }}>
        {label}
      </Text>
      {count != null ? (
        <View
          className="ml-1.5 min-w-5 items-center rounded-full px-1.5 py-0.5"
          style={{ backgroundColor: selected ? 'rgba(0,0,0,0.12)' : 'rgba(204,255,0,0.1)' }}>
          <Text
            className="text-[9px] font-black"
            style={{ color: selected ? brand.page : brand.padel, fontVariant: ['tabular-nums'] }}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function TimingControl({ value, onChange }: { value: Timing; onChange: (value: Timing) => void }) {
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row rounded-2xl border border-edge bg-elevated p-1">
      {(['upcoming', 'past'] as const).map((item) => {
        const selected = item === value;
        return (
          <Pressable
            key={item}
            onPress={() => onChange(item)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className="min-h-11 flex-1 items-center justify-center rounded-xl"
            style={{ backgroundColor: selected ? brand.padel : 'transparent' }}>
            <Text
              className="text-[10px] font-black uppercase tracking-widest"
              style={{ color: selected ? brand.page : brand.muted }}>
              {item}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EventCard({
  event,
  scheduled,
  busy,
  onOpen,
  onToggle,
}: {
  event: CalendarEvent;
  scheduled: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const parts = eventDayParts(event.start_date);
  const tone = sapaTone(event.sapa_status);
  const tier = sapaLabel(event.sapa_status) || 'Open';
  const venue = event.venue || 'Venue to be confirmed';
  const registered = Number(event.registered_players || 0);
  const dateRange = formatEventRange(event.start_date, event.end_date);
  const poster = event.custom_image_url || event.poster_image_url || event.image_url;

  return (
    <View
      className="mx-4 mb-3 overflow-hidden rounded-[20px] bg-elevated"
      style={{
        borderWidth: 1,
        borderColor: scheduled ? tone.border : brand.edge,
        backgroundColor: scheduled ? 'rgba(38,31,31,0.96)' : brand.elevated,
      }}>
      <PressableScale
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${event.event_name || 'Event'}, ${dateRange}, ${venue}`}>
        <View className="min-h-[142px] flex-row items-center px-3 py-3.5">
              <View className="w-12 shrink-0 items-center border-r border-edge pr-2.5">
                <Text
                  className="text-[22px] font-black leading-none text-premium"
                  style={{ fontVariant: ['tabular-nums'] }}>
                  {parts.day}
                </Text>
                <Text className="mt-1.5 text-[10px] font-black uppercase tracking-widest text-padel">
                  {parts.month}
                </Text>
                <Text className="mt-1 text-[9px] font-bold uppercase tracking-widest text-muted">
                  {parts.weekday}
                </Text>
              </View>

              <View className="ml-3 h-[100px] w-[72px] overflow-hidden rounded-xl border border-white/10 bg-page">
                <Image
                  source={poster ? { uri: poster } : featuredBackgroundSource(event)}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  transition={180}
                  accessibilityLabel={`${event.event_name || 'Event'} poster`}
                />
              </View>

              <View className="ml-3 min-w-0 flex-1 pr-7">
                <View className="self-start rounded-full border px-2.5 py-1" style={{ borderColor: tone.border, backgroundColor: tone.bg }}>
                  <Text className="text-[8px] font-black uppercase tracking-[0.16em]" style={{ color: tone.text }}>
                    {tier}
                  </Text>
                </View>

                <View className="mt-2 flex-row items-center">
                  <SymbolView name="calendar" size={11} tintColor={brand.padel} />
                  <Text className="ml-1.5 text-[9.5px] font-black uppercase tracking-wide text-padel">
                    {dateRange}
                  </Text>
                </View>

                <Text
                  numberOfLines={2}
                  className="mt-1.5 text-[12px] font-extrabold uppercase leading-[16px] text-premium">
                  {event.event_name || 'Tournament'}
                </Text>

                <View className="mt-2 flex-row items-center">
                  <MapPin size={11} color={brand.padel} />
                  <Text
                    numberOfLines={1}
                    className="ml-1.5 min-w-0 flex-1 text-[9.5px] font-semibold text-muted">
                    {venue}
                  </Text>
                </View>

                <View className="mt-1.5 flex-row items-center">
                  {event.city ? (
                    <View className="mr-3 flex-row items-center">
                      <SymbolView name="map" size={10} tintColor={brand.padel} />
                      <Text numberOfLines={1} className="ml-1 text-[9px] font-bold text-padel">{event.city}</Text>
                    </View>
                  ) : null}
                  <View className="flex-row items-center rounded-md border px-1.5 py-0.5" style={{ borderColor: 'rgba(204,255,0,0.28)', backgroundColor: 'rgba(204,255,0,0.08)' }}>
                    <SymbolView name="person.2.fill" size={10} tintColor={brand.padel} />
                    <Text className="ml-1 text-[9px] font-bold text-premium">{registered}</Text>
                  </View>
                </View>
              </View>

              <View className="absolute bottom-5 right-3">
                <SymbolView name="chevron.right" size={16} tintColor={brand.padel} />
              </View>
        </View>
      </PressableScale>

      <View className="absolute right-3 top-3" style={{ zIndex: 5, elevation: 5 }}>
        <PressableScale
            onPress={onToggle}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ selected: scheduled, busy }}
            accessibilityLabel={scheduled ? 'Remove from My Schedule' : 'Add to My Schedule'}>
          <View
            className="h-10 w-10 items-center justify-center rounded-full border"
            style={{
              opacity: busy ? 0.45 : 1,
              borderColor: scheduled ? brand.padel : brand.edge,
              backgroundColor: scheduled ? brand.padel : 'rgba(5,5,5,0.8)',
            }}>
            <SymbolView
              name={scheduled ? 'checkmark' : 'plus'}
              size={18}
              tintColor={scheduled ? brand.page : brand.padel}
            />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}

function LoadingCalendar() {
  return (
    <View className="px-4 pt-3">
      {[0, 1, 2, 3].map((item) => (
        <View key={item} className="mb-2 h-28 rounded-2xl border border-edge bg-elevated" />
      ))}
    </View>
  );
}

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabPad = useTabScenePadding();
  const searchRef = useRef<TextInput>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [scheduledIds, setScheduledIds] = useState<Set<number>>(new Set());
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [timing, setTiming] = useState<Timing>('upcoming');
  const [kind, setKind] = useState<EventKind>('tournaments');
  const [tier, setTier] = useState('All');
  const [scheduleOnly, setScheduleOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string; kind: ToastKind } | null>(null);
  const toastId = useRef(0);
  const loadedOnce = useRef(false);

  const flash = useCallback((message: string, toastKind: ToastKind = 'error') => {
    toastId.current += 1;
    setToast({ id: toastId.current, message, kind: toastKind });
  }, []);

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getUser();
      const nextEmail = data.user?.email ?? null;
      const [nextEvents, nextSchedule] = await Promise.all([
        fetchCalendarEvents(),
        fetchScheduledEventIds(nextEmail),
      ]);
      setEmail(nextEmail);
      setEvents(nextEvents);
      setScheduledIds(nextSchedule);
      loadedOnce.current = true;
    } catch (err) {
      console.warn('[calendar]', err);
      setError('We could not load the calendar. Pull down to try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(loadedOnce.current);
    }, [load])
  );

  const tiers = useMemo(() => {
    const present = new Set(events.map((event) => sapaLabel(event.sapa_status)).filter(Boolean));
    return ['All', ...TIER_ORDER.filter((label) => present.has(label))];
  }, [events]);

  const scheduleCount = useMemo(
    () => events.filter((event) => scheduledIds.has(event.id) && isUpcoming(event)).length,
    [events, scheduledIds]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const next = events.filter((event) => {
      const upcoming = isUpcoming(event);
      if (timing === 'upcoming' ? !upcoming : upcoming) return false;
      if (kind === 'tournaments' && event.is_league) return false;
      if (kind === 'leagues' && !event.is_league) return false;
      if (tier !== 'All' && sapaLabel(event.sapa_status) !== tier) return false;
      if (scheduleOnly && !scheduledIds.has(event.id)) return false;
      if (!q) return true;
      return [event.event_name, event.venue, event.city, event.sapa_status, event.organiser_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    return next.sort((a, b) => {
      const result = String(a.start_date || '').localeCompare(String(b.start_date || ''));
      return timing === 'upcoming' ? result : -result;
    });
  }, [events, kind, query, scheduleOnly, scheduledIds, tier, timing]);

  const rows = useMemo(() => monthRows(filtered, timing), [filtered, timing]);
  const activeFilterCount =
    (timing !== 'upcoming' ? 1 : 0)
    + (kind !== 'tournaments' ? 1 : 0)
    + (scheduleOnly ? 1 : 0);

  async function toggleSchedule(event: CalendarEvent) {
    if (!email) {
      flash('Sign in to add events to My Schedule.');
      return;
    }
    const wasScheduled = scheduledIds.has(event.id);
    setBusyId(event.id);
    setScheduledIds((current) => {
      const next = new Set(current);
      if (wasScheduled) next.delete(event.id);
      else next.add(event.id);
      return next;
    });
    try {
      await setEventOnSchedule(email, event.id, !wasScheduled);
      flash(wasScheduled ? 'Removed from My Schedule.' : 'Added to My Schedule.', 'success');
    } catch (err) {
      setScheduledIds((current) => {
        const next = new Set(current);
        if (wasScheduled) next.add(event.id);
        else next.delete(event.id);
        return next;
      });
      flash(err instanceof Error ? err.message : 'Could not update My Schedule.');
    } finally {
      setBusyId(null);
    }
  }

  function openEvent(event: CalendarEvent) {
    void openSitePath(eventPath(event));
  }

  const header = (
    <View className="pb-3">
      <View className="overflow-hidden border-b border-edge pb-5">
        <Image
          source={require('@/assets/images/calbg-hero.png')}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' }}
          contentFit="cover"
          contentPosition="center"
          accessibilityElementsHidden
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.42)' }}
        />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', backgroundColor: 'rgba(0,0,0,0.72)' }}
        />

        <View className="px-4 pt-6">
          <View className="self-start flex-row items-center rounded-full border px-3.5 py-2" style={{ borderColor: 'rgba(204,255,0,0.44)', backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <SymbolView name="calendar" size={14} tintColor={brand.padel} />
            <Text className="ml-2 text-[10px] font-black uppercase tracking-[0.18em] text-padel">
              Events schedule
            </Text>
          </View>
          <Text accessibilityRole="header" className="mt-5 text-[39px] font-black uppercase leading-[42px] tracking-tight text-premium">
            Calendar
          </Text>
          <Text className="mt-2 max-w-[260px] text-[16px] font-medium leading-[22px] text-premium">
            Find and explore padel events across South Africa.
          </Text>

          <View className="mt-6 flex-row">
            <View className="h-14 min-w-0 flex-1 flex-row items-center rounded-full border border-edge bg-elevated px-4">
              <SymbolView name="magnifyingglass" size={18} tintColor={brand.faint} />
              <TextInput
                ref={searchRef}
                value={query}
                onChangeText={setQuery}
                placeholder="Search events or venues…"
                placeholderTextColor={brand.faint}
                accessibilityLabel="Search calendar"
                autoCorrect={false}
                returnKeyType="search"
                className="ml-3 min-w-0 flex-1 text-[13px] font-semibold text-premium"
                cursorColor={brand.padel}
                selectionColor="rgba(204,255,0,0.35)"
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" className="h-11 w-9 items-center justify-center">
                  <SymbolView name="xmark.circle.fill" size={17} tintColor={brand.faint} />
                </Pressable>
              ) : null}
            </View>
            <PressableScale
              onPress={() => setFiltersOpen((current) => !current)}
              accessibilityRole="button"
              accessibilityState={{ expanded: filtersOpen }}
              accessibilityLabel={`Calendar filters${activeFilterCount ? `, ${activeFilterCount} active` : ''}`}
              className="ml-2 h-14 w-16 flex-row items-center justify-center rounded-full border border-edge bg-elevated">
              <SymbolView name="line.3.horizontal.decrease" size={19} tintColor={brand.muted} />
              {activeFilterCount ? (
                <View className="ml-1 min-w-6 items-center justify-center rounded-full bg-padel px-1.5 py-1">
                  <Text className="text-[10px] font-black text-page">{activeFilterCount}</Text>
                </View>
              ) : null}
            </PressableScale>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 mt-5" contentContainerStyle={{ paddingHorizontal: 16 }}>
            {tiers.map((label) => {
              const tone = sapaTone(label);
              return (
                <FilterChip
                  key={label}
                  label={label === 'FIP event' ? 'FIP' : label}
                  icon={label === 'All' ? 'calendar' : 'trophy'}
                  accent={label === 'All' ? brand.padel : tone.text}
                  selected={!scheduleOnly && tier === label}
                  onPress={() => {
                    setScheduleOnly(false);
                    setTier(label);
                  }}
                />
              );
            })}
          </ScrollView>
        </View>
      </View>

      {filtersOpen ? (
        <View className="mx-4 mt-3 rounded-[20px] border border-edge bg-elevated p-3">
          <View className="flex-row items-center justify-between px-1 pb-2">
            <Text className="text-[11px] font-black uppercase tracking-[0.16em] text-premium">Filters</Text>
            <Pressable
              onPress={() => {
                setTiming('upcoming');
                setKind('tournaments');
                setScheduleOnly(false);
              }}
              accessibilityRole="button"
              className="min-h-11 justify-center px-2">
              <Text className="text-[9px] font-black uppercase tracking-wider text-padel">Reset</Text>
            </Pressable>
          </View>
          <TimingControl value={timing} onChange={setTiming} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-3 mt-3" contentContainerStyle={{ paddingHorizontal: 12 }}>
            <FilterChip
              label="My Schedule"
              count={scheduleCount}
              icon="bookmark"
              selected={scheduleOnly}
              onPress={() => setScheduleOnly((current) => !current)}
            />
            {(['tournaments', 'leagues', 'all'] as const).map((item) => (
              <FilterChip
                key={item}
                label={item === 'all' ? 'All types' : item}
                icon="calendar"
                selected={kind === item}
                onPress={() => setKind(item)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View className="mt-5 flex-row items-end justify-between px-4">
        <View>
          <Text className="text-[17px] font-extrabold text-premium">
            {scheduleOnly ? 'My Schedule' : timing === 'upcoming' ? 'Upcoming events' : 'Past events'}
          </Text>
          <Text className="mt-0.5 text-[11px] font-semibold text-muted">
            {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
          </Text>
        </View>
        {(query || tier !== 'All' || scheduleOnly || kind !== 'tournaments' || timing !== 'upcoming') ? (
          <Pressable
            onPress={() => {
              setQuery('');
              setTier('All');
              setScheduleOnly(false);
              setKind('tournaments');
              setTiming('upcoming');
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear calendar filters"
            className="min-h-11 justify-center px-1">
            <Text className="text-[10px] font-black uppercase tracking-wider text-padel">Clear filters</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-page">
      <View className="bg-page" style={{ paddingTop: insets.top, zIndex: 100, elevation: 100 }}>
        <HomeHeader
          onSearch={() => searchRef.current?.focus()}
          onNotifications={() => router.push('/notifications')}
        />
      </View>

      {loading && !events.length ? (
        <ScrollView contentContainerStyle={{ paddingBottom: tabPad }}>
          {header}
          <LoadingCalendar />
        </ScrollView>
      ) : error && !events.length ? (
        <View className="flex-1 px-4 pt-4">
          <EmptyBlock title="Calendar unavailable" body={error} />
          <PressableScale
            onPress={() => void load()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading calendar"
            className="mt-4 min-h-11 items-center justify-center rounded-xl bg-padel">
            <Text className="text-[10px] font-black uppercase tracking-widest text-page">Try again</Text>
          </PressableScale>
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: tabPad }}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true);
          }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View className="px-4 pt-4">
              <EmptyBlock
                title="No events found"
                body={scheduleOnly ? 'Add events with the bookmark button to build your schedule.' : 'Try changing or clearing your filters.'}
              />
            </View>
          }
          renderItem={({ item }) =>
            item.kind === 'month' ? (
              <View className="flex-row items-center px-4 pb-2 pt-4">
                <Text className="text-[11px] font-black uppercase tracking-[0.18em] text-faint">
                  {item.label}
                </Text>
                <Text className="ml-2 text-[10px] font-bold text-faint">{item.count}</Text>
                <View className="ml-3 h-px flex-1 bg-edge" />
              </View>
            ) : (
              <EventCard
                event={item.event}
                scheduled={scheduledIds.has(item.event.id)}
                busy={busyId === item.event.id}
                onOpen={() => openEvent(item.event)}
                onToggle={() => void toggleSchedule(item.event)}
              />
            )
          }
        />
      )}

      <Toast
        key={toast?.id ?? 'idle'}
        message={toast?.message ?? null}
        kind={toast?.kind}
        onDismiss={() => setToast(null)}
      />
    </View>
  );
}
