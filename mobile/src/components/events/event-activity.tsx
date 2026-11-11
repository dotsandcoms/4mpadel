import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { EVENT_ACTIVITY_FILTERS, fetchEventActivity, type EventActivityFilter } from '@/lib/event-activity';
import { feedMatchResult, feedTime, type FeedItem, type FeedPage } from '@/lib/following-feed';
import { lightBrand as b } from '@/theme/tokens';
import { eventActivityTones } from '@/theme/event-activity';
import { HomeAction } from '@/components/home-action';
import { ErrorBanner } from '@/components/error-banner';
import { EventMatchUpdates } from './event-match-updates';
import type { EventDetail } from '@/lib/events';
import type { RankedPlayer } from '@/lib/event-teams';

const empty: FeedPage = { items: [], hasMore: false, cursor: null, followedPlayers: [] };
const labels = { all: 'All activity', entries: 'Players', matches: 'Match updates', updates: 'Updates' };
const icons = { entry: 'people-outline', result: 'trophy-outline', tournament: 'calendar-outline', match_schedule: 'time-outline', match_live: 'play-circle-outline', ranking: 'trending-up-outline', profile: 'person-outline' } as const;
const categoryOf = (item: FeedItem): EventActivityFilter => ['entry', 'profile', 'ranking'].includes(item.kind) ? 'entries' : ['result', 'match_live', 'match_schedule'].includes(item.kind) ? 'matches' : 'updates';
const activityLabel = (item: FeedItem) => item.payload.update_type === 'withdrawal' ? 'Player withdrawal' : ({ entry: 'Player entry', profile: 'Player update', ranking: 'Ranking update', result: 'Match result', match_live: 'Live match', match_schedule: 'Match schedule', tournament: 'Event update' })[item.kind];

export function EventActivity({ event, directory, refreshKey = 0 }: { event: EventDetail; directory: RankedPlayer[]; refreshKey?: number }) {
  const eventId = event.id;
  const router = useRouter();
  const [filter, setFilter] = useState<EventActivityFilter>('all');
  const [page, setPage] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const activityItems = page.items.filter(item => !['result', 'match_live', 'match_schedule'].includes(item.kind));
  const version = useRef(0), moreLock = useRef(false);
  const load = useCallback(async () => {
    const request = ++version.current;
    moreLock.current = false; setLoadingMore(false); setLoading(true); setError(''); setMoreError(false);
    if (filter === 'matches') { setPage(empty); setLoading(false); return; }
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
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 18, fontWeight: '600' }}>Tournament activity</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, height: 52 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>{EVENT_ACTIVITY_FILTERS.map(value => <HomeAction key={value} label={labels[value]} compact
      kind={filter === value ? 'primary' : 'link'} accentColor={eventActivityTones[value].ink}
      accessibilityLabel={`${labels[value]}${filter === value ? ', selected' : ''}`} onPress={() => setFilter(value)} />)}</ScrollView>
    {(filter === 'all' || filter === 'matches') && <EventMatchUpdates key={eventId} event={event} directory={directory} preview={filter === 'all'} refreshKey={refreshKey}
      onShowAll={() => setFilter('matches')} onView={tab => router.setParams({ tab, match: '', division: '', drawChoice: '', drawSource: '' })}
      onOpen={item => router.setParams({ tab: item.match.completed ? 'Results' : 'Draws', match: item.match.id, division: item.choice.classId, drawChoice: item.choice.id, drawSource: item.choice.source })} />}
    {filter !== 'matches' && <>
    {loading && !activityItems.length && <ActivityIndicator accessibilityLabel="Loading tournament activity" color={b.messagingAction} />}
    {!!error && <View style={{ gap: 8 }}><Text style={{ color: b.muted, fontSize: 13 }}>{error}</Text><HomeAction label="Retry" onPress={() => void load()} /></View>}
    {!loading && !error && !activityItems.length && <View style={{ padding: 20, borderRadius: 16, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, gap: 8 }}><Text style={{ color: b.premium, fontWeight: '600' }}>{filter === 'entries' ? 'No player activity yet' : filter === 'updates' ? 'No event updates yet' : 'No player or event updates yet'}</Text><Text style={{ color: b.muted, fontSize: 13, lineHeight: 19 }}>{filter === 'entries' ? 'Confirmed entries and player withdrawals will appear here.' : filter === 'updates' ? 'Published changes to this event will appear here.' : 'Published event changes and confirmed player entries will appear here.'}</Text></View>}
    {!!activityItems.length && <View style={{ backgroundColor: b.elevated, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: b.edge, overflow: 'hidden' }}>{activityItems.map((item, index) => {
      const tone = eventActivityTones[categoryOf(item)];
      const warning = item.payload.update_type === 'withdrawal' || item.kind === 'match_live';
      const ink = warning ? b.danger : tone.ink;
      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${activityLabel(item)}. ${item.title}. ${item.body}. ${feedTime(item.occurredAt)}`} onPress={() => open(item)}
        android_ripple={{ color: b.surface }} style={{ padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderTopWidth: index ? StyleSheet.hairlineWidth : 0, borderColor: b.edge }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: warning ? '#FCEDEA' : tone.surface, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
          <Ionicons name={item.payload.update_type === 'withdrawal' ? 'person-remove-outline' : icons[item.kind]} size={18} color={ink} accessible={false} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 8, rowGap: 2 }}>
            <Text style={{ color: ink, fontSize: 11, lineHeight: 16, fontWeight: '500' }}>{activityLabel(item)}</Text>
            <Text style={{ color: b.faint, fontSize: 11, lineHeight: 16 }}>{feedTime(item.occurredAt)}</Text>
          </View>
          <Text style={{ color: b.premium, fontSize: 13, fontWeight: '600', lineHeight: 18 }}>{item.title}</Text>
          {!!item.body && <Text numberOfLines={2} style={{ color: b.muted, fontSize: 12, lineHeight: 18 }}>{item.body}</Text>}
        </View>
      </Pressable>;
    })}</View>}
    {page.hasMore && <HomeAction label={loadingMore ? 'Loading…' : moreError ? 'Retry loading more' : 'Load more activity'} disabled={loadingMore || loading} fullWidth onPress={() => void more()} />}
    </>}
    <ErrorBanner message={error || (moreError ? 'More activity could not load. Please retry.' : null)} top={8} />
  </View>;
}
