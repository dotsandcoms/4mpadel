import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EVENT_ACTIVITY_FILTERS, fetchEventActivity, type EventActivityFilter } from '@/lib/event-activity';
import { feedMatchResult, feedTime, type FeedItem, type FeedPage } from '@/lib/following-feed';
import { lightBrand as b } from '@/theme/tokens';

const empty: FeedPage = { items: [], hasMore: false, cursor: null };
const labels = { all: 'All activity', entries: 'Players', matches: 'Matches', updates: 'Updates' };
const icons = { entry: 'people-outline', result: 'trophy-outline', tournament: 'calendar-outline', match_schedule: 'time-outline', match_live: 'play-circle-outline', ranking: 'trending-up-outline', profile: 'person-outline' } as const;

export function EventActivity({ eventId, refreshKey = 0 }: { eventId: number; refreshKey?: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<EventActivityFilter>('all');
  const [page, setPage] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const version = useRef(0), moreLock = useRef(false);
  const load = useCallback(async () => {
    const request = ++version.current;
    moreLock.current = false; setLoadingMore(false); setLoading(true); setError(''); setMoreError(false);
    try {
      const next = await fetchEventActivity(eventId, filter);
      if (version.current === request) setPage(next);
    } catch (e) { if (version.current === request) setError(e instanceof Error ? e.message : 'Activity could not load.'); }
    finally { if (version.current === request) setLoading(false); }
  }, [eventId, filter]);
  useEffect(() => {
    setPage(empty); void load();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 60000);
    return () => { version.current++; clearInterval(timer); listener.remove(); };
  }, [load, refreshKey]);
  const more = async () => {
    if (loading || moreLock.current || !page.hasMore || !page.cursor) return;
    moreLock.current = true; setLoadingMore(true); setMoreError(false);
    const request = version.current;
    try {
      const next = await fetchEventActivity(eventId, filter, page.cursor);
      if (request === version.current) setPage(previous => ({ ...next, items: [...new Map([...previous.items, ...next.items].map(item => [item.id, item])).values()] }));
    } catch { if (request === version.current) setMoreError(true); }
    finally { if (request === version.current) { moreLock.current = false; setLoadingMore(false); } }
  };
  const open = (item: FeedItem) => {
    if (item.path === '/match-result') {
      const match = feedMatchResult(item);
      if (match) router.push({ pathname: '/match-result', params: { match, context: 'following' } });
    } else if (item.kind === 'tournament' || item.kind === 'entry') {
      // Stay on this event and select its relevant details without adding another copy to the stack.
      router.setParams({ tab: item.kind === 'entry' ? 'Players' : item.payload.update_type === 'draw' ? 'Draws' : item.payload.update_type === 'results' ? 'Results' : 'Overview' });
    } else router.push(item.path as Href);
  };
  return <View style={{ gap: 14 }}>
    <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 17, fontWeight: '800' }}>Tournament activity</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{EVENT_ACTIVITY_FILTERS.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 10, backgroundColor: filter === value ? b.premium : b.elevated, borderWidth: 1, borderColor: b.edge }}><Text style={{ fontSize: 12, fontWeight: '700', color: filter === value ? '#fff' : b.muted }}>{labels[value]}</Text></Pressable>)}</ScrollView>
    {loading && !page.items.length && <ActivityIndicator accessibilityLabel="Loading tournament activity" color={b.accent} />}
    {!!error && <View style={{ gap: 8 }}><Text style={{ color: b.muted, fontSize: 13 }}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '700' }}>Retry</Text></Pressable></View>}
    {!loading && !error && !page.items.length && <View style={{ padding: 20, borderRadius: 16, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, gap: 8 }}><Text style={{ color: b.premium, fontWeight: '700' }}>No activity yet</Text><Text style={{ color: b.muted, fontSize: 13, lineHeight: 19 }}>Confirmed entries, tournament updates and published results will appear here.</Text></View>}
    {!!page.items.length && <View style={{ backgroundColor: b.elevated, borderRadius: 16, borderWidth: 1, borderColor: b.edge, overflow: 'hidden' }}>{page.items.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.body}. ${feedTime(item.occurredAt)}`} onPress={() => open(item)} style={{ padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: index ? 1 : 0, borderColor: b.edge }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: b.glass, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={item.payload.update_type === 'withdrawal' ? 'person-remove-outline' : icons[item.kind]} size={18} color={item.payload.update_type === 'withdrawal' ? b.danger : b.accent} /></View>
      <View style={{ flex: 1, gap: 4 }}><Text style={{ color: b.premium, fontSize: 13, fontWeight: '700', lineHeight: 18 }}>{item.title}</Text>{!!item.body && <Text numberOfLines={2} style={{ color: b.muted, fontSize: 11, lineHeight: 16 }}>{item.body}</Text>}</View>
      <Text style={{ color: b.faint, fontSize: 10 }}>{feedTime(item.occurredAt)}</Text>
    </Pressable>)}</View>}
    {page.hasMore && <Pressable accessibilityRole="button" disabled={loadingMore || loading} onPress={() => void more()} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '700' }}>{loadingMore ? 'Loading…' : moreError ? 'Retry loading more' : 'Load more activity'}</Text></Pressable>}
  </View>;
}
