import { HomeShortcuts } from '@/components/home-shortcuts';
import { type Href, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorBanner } from '@/components/error-banner';
import { HomeAction } from '@/components/home-action';
import { HomeHeader } from '@/components/home-header';
import { HomeSourcePicker } from '@/components/home-source-picker';
import { FeedSection, FollowingRail, HomeIdentity, LocalNowRail, LocalResults, MediaRail, OfficialFipRail, SectionState, SpotlightRail, TourLiveRail, TourResults, TourSpotlight, UpcomingEntries } from '@/components/home-feed';
import { ObserveReady } from '@/components/observe-ready';
import { useHomeFeed, type HomeSource } from '@/hooks/use-home-feed';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import { EMPTY_HOME, profileGaps, resolveFeaturedCta, resolveScheduleEntryCta, type CalendarEvent, type PendingAction } from '@/lib/home';
import { homeEventState, homeOfficialFipEvents, homeTourEvents, tourPath } from '@/lib/home-feed';
import { upcomingTourEvents } from '@/lib/home-tour-presentation';
import { selectProMatches, type ProTournament } from '@/lib/pro-padel';
import { makeCompanionSchedule } from '@/lib/companion-schedule';
import { publishCompanionSchedule } from '@/lib/companion';
import { markPushPromptSeen, requestPushPermission, shouldPromptForPush } from '@/lib/notifications';
import { openSitePath } from '@/lib/site';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

type Section = 'spotlight' | 'shortcuts' | 'now' | 'following' | 'upcoming' | 'results' | 'media' | 'fip';

export default function HomeScreen() {
  const router = useRouter(), insets = useSafeAreaInsets(), tabPadding = useTabScenePadding();
  const [source, setSource] = useState<HomeSource>('4m'), [refreshing, setRefreshing] = useState(false);
  const feed = useHomeFeed(source);
  const list = useRef<FlatList<Section>>(null), mounted = useRef(true);
  const local = source === '4m';
  const followedPlayers = (feed.following.data?.followedPlayers ?? []).filter(player => player.source === (local ? 'local' : 'pro'));
  const pending = useMemo(() => [...(feed.payments.data ?? []), ...profileGaps(feed.profile.data ?? null)], [feed.payments.data, feed.profile.data]);
  const registrationState = feed.schedule.data?.registrationByEvent;
  const decorate = (event: CalendarEvent) => homeEventState(event, registrationState, feed.payments.data);
  const spotlight = (feed.spotlight.data ?? []).map(decorate);
  const upcoming = (feed.schedule.data?.upcoming ?? []).map(event => ({ ...decorate(event), fromSchedule: event.fromSchedule }));
  const internationalEvents = homeTourEvents([...(feed.fixtures.data?.tournament ? [feed.fixtures.data.tournament] : []), ...(feed.tour.data?.tournaments ?? [])]);
  const presentTour = (event: ProTournament) => ({ ...event, ...(feed.tourPresentation.data?.[event.id] ? { photoUrl: feed.tourPresentation.data[event.id].photoUrl || event.photoUrl, name: feed.tourPresentation.data[event.id].name } : {}) });
  const liveEvents = (feed.live.data || []).map(presentTour);
  const comingUpEvents = upcomingTourEvents(internationalEvents, liveEvents).map(presentTour);
  const officialEvents = homeOfficialFipEvents(feed.fip.data?.tournaments ?? []);
  const internationalResults = selectProMatches(feed.tour.data?.matches ?? [], null).filter(match => match.status === 'finished' && match.score.length > 0);
  const sections: Section[] = local ? ['spotlight', 'shortcuts', 'now', 'following', 'upcoming', 'results', 'media'] : ['now', 'shortcuts', 'spotlight', 'following', 'results', 'fip'];

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [source]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!(await shouldPromptForPush()) || cancelled) return;
      await requestPushPermission();
      if (!cancelled) await markPushPromptSeen();
    })();
    return () => { cancelled = true; };
  }, []);
  // Keep the Watch/widget schedule without loading career results or the player directory.
  useEffect(() => {
    if (!feed.active || !feed.owner?.id || !feed.schedule.data || !feed.payments.data || feed.schedule.error || feed.payments.error || feed.matches.loading || feed.matches.error) return;
    void publishCompanionSchedule(feed.owner.id, makeCompanionSchedule({ ...EMPTY_HOME,
      player: feed.profile.data ?? null, upcomingSchedule: upcoming, pending,
      upcomingMatches: feed.matches.data?.upcoming ?? [],
    }));
  }, [feed.active, feed.owner?.id, feed.schedule.data, feed.payments.data, feed.profile.data, feed.matches.data, feed.matches.loading, feed.matches.error]);

  const open = (path: string) => router.push(path as Href);
  const openEvent = (event: CalendarEvent, results = false) => router.push({ pathname: '/events/[id]', params: { id: event.slug || String(event.id), ...(results ? { tab: 'Results' } : {}) } });
  const openAction = (event: CalendarEvent, schedule = false) => {
    const balance = feed.payments.data?.find(action => action.eventId === event.id && (action.balanceDue ?? 0) > 0);
    if (event.hasEntryBalance && balance) { void openSitePath(balance.path); return; }
    const cta = schedule ? resolveScheduleEntryCta(event) : resolveFeaturedCta(event);
    if (event.is_manual && (cta.action === 'register' || cta.action === 'pay')) {
      router.push({ pathname: '/events/register', params: { id: String(event.id), ...(cta.action === 'pay' ? { mode: 'pay' } : {}) } });
    } else openEvent(event);
  };
  const openPending = (action: PendingAction) => action.kind === 'profile' ? open('/(tabs)/profile') : void openSitePath(action.path);
  const openTour = (event: ProTournament) => open(tourPath(event));
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { await feed.refresh(); } finally { if (mounted.current) setRefreshing(false); }
  };
  const errors = [feed.profile, feed.schedule, feed.payments, feed.following, ...(local ? [feed.spotlight, feed.happening, feed.results, feed.media] : [feed.tour, feed.fixtures, feed.live, feed.fip])].some(resource => resource.error);
  const state = (resource: { loading: boolean; error: boolean; refresh: (force?: boolean) => Promise<void> }, empty: string) => <SectionState loading={resource.loading} error={resource.error} empty={empty} onRetry={() => void resource.refresh(true)} />;

  function renderSection(section: Section) {
    switch (section) {
      case 'spotlight':
        if (local) return <View style={{ marginBottom: 24 }}>
          {spotlight.length ? <SpotlightRail events={spotlight} onOpen={openEvent} onAction={event => openAction(event)} /> : state(feed.spotlight, 'New spotlight events will appear here.')}
        </View>;
        if (!comingUpEvents.length) return null;
        return <FeedSection title="Coming up" onMore={() => open('/calendar?circuit=pro')}>
          <TourSpotlight events={comingUpEvents} onOpen={openTour} />
        </FeedSection>;
      case 'shortcuts':
        return <View style={s.shortcuts}><HomeShortcuts source={source} onOpen={open} /></View>;
      case 'now':
        if (local && feed.happening.data?.length === 0 && !feed.happening.loading && !feed.happening.error) return null;
        if (!local && feed.live.data?.length === 0 && !feed.live.loading && !feed.live.error) return null;
        return local ? <FeedSection title="On now" onMore={() => open('/calendar')}>
          {feed.happening.data?.length ? <LocalNowRail events={feed.happening.data} onOpen={openEvent} /> : state(feed.happening, 'No 4M events are on court right now.')}
        </FeedSection> : <FeedSection title="Live now" onMore={() => open('/pro/live')}>
          {liveEvents.length ? <TourLiveRail events={liveEvents} matches={[...(feed.fixtures.data?.matches || []), ...(feed.tour.data?.matches || [])]} onOpen={event => router.push({ pathname: '/pro/tournament/[id]', params: { id: String(event.id), tab: 'matches' } })} /> : state(feed.live, 'No live tournaments at the latest update.')}
        </FeedSection>;
      case 'following':
        return <FeedSection title="Following" onMore={() => open(`/rankings?view=Following&source=${local ? '4m' : 'pro'}`)}>
          {followedPlayers.length ? <FollowingRail players={followedPlayers} onPlayer={player => open(`${player.source === 'pro' ? '/pro/player' : '/players'}/${player.id}`)} /> : state(feed.following, feed.signedIn ? 'Follow players to see their current rankings here.' : 'Sign in to follow players.')}
        </FeedSection>;
      case 'upcoming':
        if (!feed.signedIn) return null;
        return <FeedSection title="My next events" onMore={() => open('/my-entries')}>
          {upcoming.length ? <UpcomingEntries events={upcoming} onOpen={openEvent} onAction={event => openAction(event, true)} /> : state(feed.schedule, 'Your upcoming entries and saved events will appear here.')}
        </FeedSection>;
      case 'results':
        return local ? <FeedSection title="Latest results" onMore={() => open('/calendar')}>
          {feed.results.data?.length ? <LocalResults events={feed.results.data} onOpen={event => openEvent(event, true)} /> : state(feed.results, 'Results will appear after events finish.')}
        </FeedSection> : <FeedSection title="Latest results" onMore={() => open('/calendar?circuit=pro&timing=past')}>
          {internationalResults.length ? <TourResults matches={internationalResults} onOpen={match => open(`/pro/match/${match.id}`)} /> : state(feed.tour, 'Published tour results will appear here.')}
        </FeedSection>;
      case 'media':
        return <FeedSection title="Around the courts" onMore={() => open('/media')}>
          {feed.media.data?.some(album => !!album.cover_image_url) ? <MediaRail albums={feed.media.data} onOpen={album => open(`/media/${album.id}`)} /> : state(feed.media, 'Event photos and highlights will appear here.')}
        </FeedSection>;
      case 'fip':
        return <FeedSection title="FIP Promises & Bronze">
          {officialEvents.length ? <OfficialFipRail events={officialEvents} updatedAt={feed.fip.data?.updatedAt} onOpen={openTour} /> : state(feed.fip, 'New FIP Promises and Bronze events will appear here.')}
        </FeedSection>;
    }
  }

  return <View style={s.page}>
    <ObserveReady ready={local ? !feed.spotlight.loading : !feed.tour.loading} />
    <View style={{ paddingTop: insets.top, backgroundColor: b.page }}><HomeHeader onSearch={() => open(local ? '/search' : '/search?source=international')} onNotifications={() => open('/notifications')} noticeCount={pending.length} /></View>
    <FlatList ref={list} data={sections} extraData={feed} keyExtractor={section => `${source}:${section}`} renderItem={({ item }) => renderSection(item)}
      initialNumToRender={3} maxToRenderPerBatch={2} windowSize={5} showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 32 : tabPadding }}
      refreshControl={<RefreshControl colors={[loadingBlue]} refreshing={refreshing} onRefresh={() => void refresh()} tintColor={loadingBlue} />}
      ListHeaderComponent={<View style={{ flexShrink: 0 }}>
        <HomeIdentity player={feed.profile.data} loading={feed.profile.loading} onProfile={() => open('/(tabs)/profile')} onRankings={() => open('/rankings?view=Rankings&source=4m')} />
        <View style={{ marginBottom: 16, flexShrink: 0 }}><HomeSourcePicker value={source} onChange={setSource} /></View>
        {pending.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`${pending.length} pending actions. ${pending[0].title}. ${pending.length > 1 ? 'Review all actions' : 'Review action'}`} onPress={() => pending.length > 1 ? open('/notifications') : openPending(pending[0])} style={s.pending}>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={s.pendingHeading}>
              <Text style={s.pendingTitle}>{pending[0].title}</Text>
              {pending.length > 1 && <View style={s.pendingBadge}><Text style={s.pendingBadgeText}>+{pending.length - 1} more {pending.length === 2 ? 'action' : 'actions'}</Text></View>}
            </View>
            <Text numberOfLines={1} style={s.pendingText}>{pending[0].subtitle}</Text>
          </View>
          <Text style={[s.pendingTitle, { flexShrink: 0 }]}>{pending.length > 1 ? 'Review all →' : 'Review →'}</Text>
        </Pressable>}
      </View>} />
    <ErrorBanner message={errors ? 'Some Home updates couldn’t load. Pull to refresh or retry a section.' : null} top={insets.top + 56} bottom={tabPadding} />
  </View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: b.page },
  shortcuts: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: b.elevated, borderRadius: 16, paddingHorizontal: 4, marginBottom: 20 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 16, backgroundColor: '#FFF5DD', borderRadius: 12 },
  pendingHeading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  pendingBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#78521A' },
  pendingBadgeText: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: '#FFFFFF' },
  pendingTitle: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#78521A' },
  pendingText: { fontSize: 11, lineHeight: 16, color: '#78521A' },
});
