import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventArtwork } from '@/components/event-artwork';
import { ErrorBanner } from '@/components/error-banner';
import { HomeAction } from '@/components/home-action';
import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { findShareEvents, SHARE_EVENT_PAGE_SIZE, shareEventCard, shareEventDate, type ShareEvent } from '@/lib/message-event-share';
import type { ChatCard } from '@/lib/messaging';
import { lightBrand as b, loadingBlue } from '@/theme/tokens';

export function EventSharePicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (card: ChatCard) => void }) {
  const safe = useSafeAreaInsets();
  const [query, setQuery] = useState(''), [past, setPast] = useState(false);
  const [events, setEvents] = useState<ShareEvent[]>([]), [loading, setLoading] = useState(false), [more, setMore] = useState(false), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0), request = useRef<AbortController | null>(null), fetching = useRef(false), offset = useRef(0);
  const load = async (append: boolean, version: number, controller: AbortController) => {
    if (fetching.current) return;
    fetching.current = true; setLoading(true); setError('');
    try {
      const rows = await findShareEvents(query, past, append ? offset.current : 0, controller.signal);
      if (controller.signal.aborted || generation.current !== version) return;
      offset.current = (append ? offset.current : 0) + rows.length;
      setEvents(previous => append ? [...new Map([...previous, ...rows].map(row => [row.id, row])).values()] : rows);
      setMore(rows.length === SHARE_EVENT_PAGE_SIZE);
    } catch (e) {
      if (!controller.signal.aborted && generation.current === version) setError(e instanceof Error ? e.message : 'The event calendar could not load. Please try again.');
    } finally {
      if (generation.current === version) { fetching.current = false; setLoading(false); }
    }
  };
  useEffect(() => {
    const version = ++generation.current;
    request.current?.abort(); fetching.current = false; offset.current = 0;
    setEvents([]); setMore(false); setError(''); setLoading(visible);
    if (!visible) { setQuery(''); setPast(false); return; }
    const controller = new AbortController(); request.current = controller;
    const timer = setTimeout(() => { void load(false, version, controller); }, query.trim() ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); request.current?.abort(); generation.current++; };
  }, [visible, query, past, retry]);
  const next = () => {
    if (!more || fetching.current || error) return;
    const controller = new AbortController(); request.current = controller;
    void load(true, generation.current, controller);
  };
  return <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'} onRequestClose={onClose} onDismiss={onClose}>
    <View style={[s.screen, { paddingTop: Platform.OS === 'ios' ? 12 : safe.top }]}>
      <View style={s.heading}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={s.title}>Attach an event</Text><Text style={s.explanation}>Choose an event to add to your message.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close event calendar" onPress={onClose} style={s.close}><Ionicons name="close" size={23} color={b.premium} /></Pressable></View>
      <View style={s.search}><Ionicons name="search" size={20} color={b.muted} /><TextInput accessibilityLabel="Search events by name, city or venue" value={query} onChangeText={setQuery} placeholder="Event, city or venue" placeholderTextColor={b.placeholder} returnKeyType="search" autoCorrect={false} style={s.input} clearButtonMode="while-editing" />{Platform.OS !== 'ios' && !!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={s.clear}><Ionicons name="close-circle" size={20} color={b.muted} /></Pressable>}</View>
      <View style={s.tabs}><NativeSegmentedControl label="Event calendar" options={[{ value: 'upcoming', label: 'Current & upcoming' }, { value: 'past', label: 'Past events' }]} value={past ? 'past' : 'upcoming'} onChange={value => setPast(value === 'past')} /></View>
      <FlatList data={events} keyExtractor={item => String(item.id)} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(safe.bottom, 20), flexGrow: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" onEndReached={next} onEndReachedThreshold={0.4}
        ListHeaderComponent={<Text style={s.hint}>They can tap the event card to see details and register.</Text>}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Attach ${item.event_name}, ${shareEventDate(item.start_date)}`} onPress={() => onSelect(shareEventCard(item))} style={s.event} android_ripple={{ color: b.surface }}>
          <EventArtwork uri={item.poster_image_url || item.custom_image_url || item.image_url} event={item} style={s.poster} />
          <View style={s.details}><Text style={s.date}>{shareEventDate(item.start_date)}</Text><Text numberOfLines={2} style={s.eventName}>{item.event_name}</Text><Text numberOfLines={1} style={s.venue}>{[item.venue, item.city].filter(Boolean).join(' · ') || 'Venue to be confirmed'}</Text></View>
          <View style={s.add}><Ionicons name="add" size={22} color={b.messagingAction} /></View>
        </Pressable>}
        ListEmptyComponent={!loading && !error ? <View style={s.empty}><Ionicons name="calendar-outline" size={30} color={b.muted} /><Text style={s.emptyTitle}>{query.trim() ? 'No matching events' : past ? 'No past events' : 'No upcoming events'}</Text><Text style={s.emptyBody}>{query.trim() ? 'Try another name, city or venue.' : 'Try the other calendar tab or search for an event.'}</Text></View> : null}
        ListFooterComponent={loading ? <ActivityIndicator accessibilityLabel="Loading events" color={loadingBlue} style={{ marginVertical: 24 }} /> : error ? <View style={{ paddingVertical: 24 }}><HomeAction label="Try again" kind="outline" onPress={() => setRetry(value => value + 1)} /></View> : null} />
      <ErrorBanner message={error} />
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: b.page },
  heading: { padding: 20, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: b.premium, fontSize: 23, fontWeight: '700', lineHeight: 30 },
  explanation: { color: b.muted, fontSize: 14, lineHeight: 21, marginTop: 4 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: b.surface, alignItems: 'center', justifyContent: 'center' },
  search: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 8, backgroundColor: b.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: b.edge, borderRadius: 14 },
  input: { flex: 1, minHeight: 48, fontSize: 16, color: b.premium, paddingVertical: 12 },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabs: { marginHorizontal: 20, marginTop: 16, marginBottom: 8 },
  hint: { color: b.muted, fontSize: 12, lineHeight: 18, marginBottom: 12, marginTop: 8 },
  event: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: b.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: b.edge, borderRadius: 14 },
  poster: { width: 52, height: 72, borderRadius: 7 },
  details: { flex: 1, minWidth: 0, gap: 4 },
  date: { color: b.messagingAction, fontSize: 12, fontWeight: '600' },
  eventName: { color: b.premium, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  venue: { color: b.muted, fontSize: 12, lineHeight: 18 },
  add: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E7EFF7', alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 20, gap: 12 },
  emptyTitle: { color: b.premium, fontSize: 16, fontWeight: '600' },
  emptyBody: { color: b.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
