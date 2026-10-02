import { SymbolView } from 'expo-symbols';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Notice } from '@/components/events/event-ui';
import { FadeUp } from '@/components/fade-up';
import { HomeAccordion } from '@/components/home-accordion';
import {
  EmptyBlock,
  EventRow,
  FeaturedCard,
  MatchRow,
  NextMatchCard,
  NowOnCard,
  PendingRow,
  RecentResultCard,
} from '@/components/home-event-card';
import { HomeHeader } from '@/components/home-header';
import { ProPadelFeed } from '@/components/pro-padel-feed';
import { usePlayerHub } from '@/hooks/use-player-hub';
import { makeCompanionSchedule } from '@/lib/companion-schedule';
import { publishCompanionSchedule } from '@/lib/companion';
import { HomeGreeting, HomePlayerCard } from '@/components/home-player-card';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import {
  EMPTY_HOME,
  eventPath,
  fetchHomeBundle,
  fetchHomePlayerExtras,
  resolveFeaturedCta,
  type CalendarEvent,
  type HomeBundle,
  type PendingAction,
} from '@/lib/home';
import { matchKey } from '@/lib/matches';
import {
  markPushPromptSeen,
  requestPushPermission,
  shouldPromptForPush,
} from '@/lib/notifications';
import { openSitePath } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import { lightBrand as brand, motion } from '@/theme/tokens';

const MATCH_ORANGE = '#F97316';

type OpenMap = {
  pending: boolean;
  schedule: boolean;
  featured: boolean;
  results: boolean;
};

export default function HomeScreen() {
  const playerHub = usePlayerHub();
  const proPadel = playerHub.pro;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabPad = useTabScenePadding();
  const [bundle, setBundle] = useState<HomeBundle>(EMPTY_HOME);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<OpenMap>({
    pending: false,
    schedule: false,
    featured: true,
    results: false,
  });
  const [schedulePast, setSchedulePast] = useState(false);
  const [scheduleKind, setScheduleKind] = useState<'matches' | 'events'>('events');
  const scheduleKindTouched = useRef(false);
  const loadId = useRef(0);

  const load = useCallback(async (soft?: boolean) => {
    const currentLoad = ++loadId.current;
    if (!soft) setLoading(true);
    setLoadError(false);
    try {
      const { data } = await supabase.auth.getUser();
      if (currentLoad !== loadId.current) return;
      const next = await fetchHomeBundle(data.user?.email, {
        strictSchedule: true,
        deferPlayerExtras: true,
        onPlayer: player => {
          if (currentLoad === loadId.current) {
            setBundle(previous => ({ ...previous, player }));
          }
        },
      });
      if (currentLoad !== loadId.current) return;
      setBundle(next);
      if (next.player?.rankedin_id) {
        void fetchHomePlayerExtras(next.player).then(extras => {
          if (currentLoad !== loadId.current) return;
          const enriched: HomeBundle = {
            ...next,
            player: next.player ? { ...next.player, winLoss: extras.winLoss, rankingChange: extras.rankingChange } : null,
            upcomingMatches: extras.upcomingMatches,
            pastMatches: extras.pastMatches,
          };
          setBundle(enriched);
          if (data.user) void publishCompanionSchedule(data.user.id, makeCompanionSchedule(enriched));
        }).catch(error => console.warn('[home] Optional player details', error));
      } else if (data.user) {
        void publishCompanionSchedule(data.user.id, makeCompanionSchedule(next));
      }
    } catch (err) {
      if (currentLoad === loadId.current) setLoadError(true);
      console.warn('[home]', err);
    } finally {
      if (currentLoad === loadId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load(true);
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') void load(true);
    });
    return () => {
      loadId.current += 1;
      foreground.remove();
    };
  }, [load]));

  useEffect(() => {
    if (bundle.pending.length > 0) {
      setOpen((current) => (current.pending ? current : { ...current, pending: true }));
    }
  }, [bundle.pending.length]);

  useEffect(() => {
    if (loading || scheduleKindTouched.current) return;
    setScheduleKind(bundle.upcomingMatches.length > 0 ? 'matches' : 'events');
  }, [loading, bundle.upcomingMatches.length]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await shouldPromptForPush()) || cancelled) return;
      await requestPushPermission();
      if (!cancelled) await markPushPromptSeen();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const schedule = schedulePast ? bundle.pastSchedule : bundle.upcomingSchedule;
  const matches = schedulePast ? bundle.pastMatches : bundle.upcomingMatches;

  async function openEvent(event: CalendarEvent) {
    await openSitePath(eventPath(event));
  }

  function openFeaturedAction(event: CalendarEvent) {
    const cta = resolveFeaturedCta(event);
    if (event.is_manual && (cta.action === 'pay' || cta.action === 'register')) {
      router.push({ pathname: '/events/register', params: { id: String(event.id), ...(cta.action === 'pay' ? { mode: 'pay' } : {}) } });
    } else {
      void openEvent(event);
    }
  }

  function openPending(action: PendingAction) {
    if (action.kind === 'profile') {
      router.push('/(tabs)/profile');
      return;
    }
    openSitePath(action.path);
  }

  function toggle(key: keyof OpenMap) {
    setOpen((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <View className="flex-1 bg-court-page">
      <View
        className="bg-court-page"
        style={{ paddingTop: insets.top, zIndex: 30, elevation: 30 }}>
        <HomeHeader
          onSearch={() => router.push('/search')}
          onNotifications={() => router.push('/notifications')}
          noticeCount={bundle.pending.length}
        />
      </View>

      <ScrollView
        className="flex-1 bg-court-page"
        contentContainerStyle={{
          paddingBottom: tabPad,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing || proPadel.loading}
            onRefresh={() => {
              setRefreshing(true);
              void Promise.all([load(true), playerHub.refresh()]);
            }}
            tintColor={brand.accent}
          />
        }>
        <View style={{ overflow: 'hidden' }}>
          <View className="px-4 pt-3 pb-2">
            <FadeUp>
              <HomeGreeting player={bundle.player} />
              <HomePlayerCard
                player={bundle.player}
                loading={loading}
                onPress={() => router.push('/(tabs)/profile')}
              />
            </FadeUp>
          </View>
        </View>

        <View className="px-4 bg-court-page">
        <Pressable accessibilityRole="button" accessibilityLabel="Find and enter a tournament" onPress={() => router.push('/calendar')}
          style={{ marginTop: 16, marginBottom: 20, backgroundColor: brand.padel, padding: 20, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 104 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#386018', fontSize: 11, fontWeight: '700', letterSpacing: 1.4 }}>GET ON COURT</Text>
            <Text style={{ color: brand.premium, fontSize: 26, fontWeight: '800', letterSpacing: -0.8, marginTop: 5 }}>Your next tournament.</Text>
            <Text style={{ color: '#34473D', fontSize: 13, lineHeight: 19, marginTop: 5 }}>Find an event. Pick your partner. Play.</Text>
          </View>
          <SymbolView name={{ ios: 'arrow.up.right', android: 'north_east', web: 'north_east' }} size={23} tintColor={brand.premium} />
        </Pressable>
        {loadError && <Notice title="Your latest activity couldn’t load" onRetry={() => void load(true)}>Please try again to refresh your entries, payments and schedule.</Notice>}
        {bundle.happeningNow.length ? (
          <FadeUp delay={motion.stagger * 6} className="mt-6">
            {bundle.happeningNow.slice(0, 3).map((event, i) => (
              <View key={event.id} className={i > 0 ? 'mt-3' : undefined}>
                <NowOnCard
                  event={event}
                  showLabel={i === 0}
                  onPress={() => openEvent(event)}
                />
              </View>
            ))}
          </FadeUp>
        ) : null}

        <FadeUp delay={motion.stagger * 8} className="mt-4">
          {bundle.pending.length ? (
            <HomeAccordion
              title="Complete your entry"
              titleCount={bundle.pending.length}
              countColor={brand.danger}
              open={open.pending}
              onToggle={() => toggle('pending')}
              badges={[{ label: String(bundle.pending.length), count: true, color: brand.danger }]}>
              {bundle.pending.map((action) => (
                <PendingRow
                  key={action.key}
                  title={action.title}
                  subtitle={action.subtitle}
                  detail={action.detail}
                  kind={action.kind}
                  onPress={() => openPending(action)}
                />
              ))}
            </HomeAccordion>
          ) : null}

          <HomeAccordion
            title="My Schedule"
            open={open.schedule}
            onToggle={() => toggle('schedule')}
            badges={[
              bundle.upcomingSchedule.length
                ? {
                    label: `${bundle.upcomingSchedule.length} ${
                      bundle.upcomingSchedule.length === 1 ? 'Event' : 'Events'
                    }`,
                  }
                : null,
              bundle.upcomingMatches.length
                ? {
                    label: `${bundle.upcomingMatches.length} ${
                      bundle.upcomingMatches.length === 1 ? 'Match' : 'Matches'
                    }`,
                  }
                : null,
            ].filter(Boolean) as { label: string }[]}>
            <View className="mb-3 flex-row items-center">
              <View accessibilityRole="tablist" className="min-w-0 flex-1 flex-row items-center">
                <KindTab
                  label="Matches"
                  icon="trophy"
                  count={bundle.upcomingMatches.length}
                  badgeColor={MATCH_ORANGE}
                  selected={scheduleKind === 'matches'}
                  onPress={() => {
                    scheduleKindTouched.current = true;
                    setScheduleKind('matches');
                  }}
                />
                <KindTab
                  label="Events"
                  icon="calendar"
                  count={bundle.upcomingSchedule.length}
                  badgeColor={brand.padel}
                  selected={scheduleKind === 'events'}
                  onPress={() => {
                    scheduleKindTouched.current = true;
                    setScheduleKind('events');
                  }}
                />
              </View>
              <View className="ml-auto shrink-0 flex-row rounded-lg border border-court-edge p-0.5">
                {(
                  [
                    { key: false, label: 'Upcoming' },
                    { key: true, label: 'Past' },
                  ] as const
                ).map((tab) => (
                  <Pressable
                    key={String(tab.key)}
                    onPress={() => setSchedulePast(tab.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: schedulePast === tab.key }}
                    hitSlop={6}
                    className={`min-h-8 justify-center px-2 ${
                      schedulePast === tab.key ? 'rounded-md bg-court-surface' : ''
                    }`}>
                    <Text
                      className={`text-[10px] font-normal ${
                        schedulePast === tab.key ? 'text-court-ink' : 'text-court-muted'
                      }`}>
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {scheduleKind === 'matches' ? (
              matches.length ? (
                <View>
                  {!schedulePast ? (
                    <NextMatchCard
                      match={matches[0]}
                      onPress={() => router.push('/(tabs)/profile')}
                    />
                  ) : null}
                  {(schedulePast ? matches : matches.slice(1)).length ? (
                    <View
                      className={`overflow-hidden rounded-2xl border border-court-edge bg-court-elevated ${
                        schedulePast ? '' : 'mt-3'
                      }`}>
                      {(schedulePast ? matches : matches.slice(1)).map((match, i) => (
                        <View key={matchKey(match, i)}>
                          {i > 0 ? <View className="h-px bg-court-edge" /> : null}
                          <MatchRow
                            match={match}
                            showResult={schedulePast}
                            onPress={() => router.push('/(tabs)/profile')}
                          />
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : (
                <EmptyBlock
                  icon="trophy"
                  title={
                    schedulePast ? 'No past matches yet.' : 'You have no upcoming matches.'
                  }
                  body={
                    schedulePast
                      ? 'Your match history will appear here.'
                      : 'Your next match will appear here when draws are published.'
                  }
                />
              )
            ) : schedule.length ? (
              <View className="overflow-hidden rounded-2xl border border-court-edge bg-court-elevated">
                {schedule.map((event, i) => (
                  <View key={event.id}>
                    {i > 0 ? <View className="h-px bg-court-edge" /> : null}
                    <EventRow
                      event={event}
                      showStartCountdown={!schedulePast}
                      onPress={() => openEvent(event)}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <EmptyBlock
                icon="calendar"
                title={schedulePast ? 'No past events yet.' : 'You have no upcoming events.'}
                body={
                  schedulePast
                    ? 'Your completed events will appear here.'
                    : 'Explore the calendar to find your next event.'
                }
                actionLabel={schedulePast ? undefined : 'Explore Calendar'}
                onAction={schedulePast ? undefined : () => router.push('/calendar')}
              />
            )}
          </HomeAccordion>

          <HomeAccordion
            title="Tournament spotlight"
            open={open.featured}
            onToggle={() => toggle('featured')}
            badges={
              bundle.featured.length
                ? [{ label: String(bundle.featured.length), count: true }]
                : undefined
            }>
            {bundle.featured.length ? (
              <EventSlide events={bundle.featured} onOpen={openEvent} onAction={openFeaturedAction} />
            ) : (
              <EmptyBlock
                title="No featured events right now"
                body="Spotlight tournaments will appear here when they are announced."
                actionLabel="Browse calendar"
                onAction={() => router.push('/calendar')}
              />
            )}
          </HomeAccordion>

          <HomeAccordion
            title="Recent Results"
            open={open.results}
            onToggle={() => toggle('results')}
            badges={
              bundle.recentResults.length
                ? [{ label: String(bundle.recentResults.length), count: true }]
                : undefined
            }>
            {bundle.recentResults.length ? (
              <ResultSwipe events={bundle.recentResults} onOpen={openEvent} />
            ) : (
              <EmptyBlock
                title="Results will appear here"
                body="Finished Gold, Super Gold and Major events appear here."
              />
            )}
          </HomeAccordion>

          <ProPadelFeed state={proPadel} localState={playerHub} />

        </FadeUp>

        </View>
      </ScrollView>
    </View>
  );
}

function EventSlide({
  events,
  onOpen,
  onAction,
}: {
  events: CalendarEvent[];
  onOpen: (event: CalendarEvent) => void;
  onAction: (event: CalendarEvent) => void;
}) {
  const [width, setWidth] = useState(0);
  const rail = useRef<ScrollView>(null);
  const ids = events.map(event => event.id).join(',');
  const cardWidth = events.length > 1 ? Math.min(340, width * 0.86) : width;
  useEffect(() => { rail.current?.scrollTo({ x: 0, animated: false }); }, [ids, width]);
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {width > 0 && <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false}
      decelerationRate="fast" snapToInterval={cardWidth + 12} snapToAlignment="start"
      disableIntervalMomentum directionalLockEnabled
      contentContainerStyle={{ gap: 12, paddingRight: Math.max(0, width - cardWidth) }}>
      {events.map(event => <View key={event.id} style={{ width: cardWidth }}>
        <FeaturedCard event={event} onPress={() => onOpen(event)} onCta={() => onAction(event)} />
      </View>)}
    </ScrollView>}
  </View>;
}

function ResultSwipe({
  events,
  onOpen,
}: {
  events: CalendarEvent[];
  onOpen: (event: CalendarEvent) => void;
}) {
  const reduced = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const nudge = useSharedValue(0);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const many = events.length > 1;
  const ids = events.map((event) => event.id).join(',');

  useEffect(() => {
    setPage(0);
    scroller.current?.scrollTo({ x: 0, animated: false });
  }, [ids]);

  useEffect(() => {
    if (reduced || !many) return;
    nudge.value = 0;
    nudge.value = withSequence(
      withDelay(
        320,
        withTiming(16, { duration: 180, easing: Easing.out(Easing.cubic) })
      ),
      withTiming(-12, { duration: 150 }),
      withTiming(8, { duration: 140 }),
      withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) })
    );
    return () => cancelAnimation(nudge);
  }, [many, nudge, reduced]);

  const jiggle = useAnimatedStyle(() => ({
    transform: [{ translateX: nudge.value }],
  }));

  const dots = Math.min(3, events.length);
  const activeDot =
    events.length <= 3
      ? page
      : page === 0
        ? 0
        : page >= events.length - 1
          ? dots - 1
          : 1;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={`Recent results, card ${page + 1} of ${events.length}. Swipe for more.`}>
      <Animated.View style={jiggle}>
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          directionalLockEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={() => cancelAnimation(nudge)}
          onMomentumScrollEnd={(e) => {
            const w = e.nativeEvent.layoutMeasurement.width;
            if (!w) return;
            setPage(Math.round(e.nativeEvent.contentOffset.x / w));
          }}
          accessibilityRole="adjustable"
          accessibilityActions={
            many
              ? [
                  { name: 'increment', label: 'Next result' },
                  { name: 'decrement', label: 'Previous result' },
                ]
              : undefined
          }
          onAccessibilityAction={(e) => {
            if (!width) return;
            if (e.nativeEvent.actionName === 'increment') {
              const next = Math.min(events.length - 1, page + 1);
              scroller.current?.scrollTo({ x: next * width, animated: true });
              setPage(next);
            }
            if (e.nativeEvent.actionName === 'decrement') {
              const next = Math.max(0, page - 1);
              scroller.current?.scrollTo({ x: next * width, animated: true });
              setPage(next);
            }
          }}>
          {events.map((event) => (
            <View key={event.id} style={{ width: width || undefined }}>
              <RecentResultCard event={event} onPress={() => onOpen(event)} />
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      {many ? (
        <View
          className="mt-2.5 flex-row items-center justify-center"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {Array.from({ length: dots }).map((_, i) => (
            <View
              key={i}
              style={{
                width: i === activeDot ? 7 : 6,
                height: i === activeDot ? 7 : 6,
                borderRadius: 4,
                marginHorizontal: 4,
                backgroundColor: i === activeDot ? brand.padel : 'rgba(204,255,0,0.28)',
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function KindTab({
  label,
  icon,
  count,
  badgeColor,
  selected,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof SymbolView>['name'];
  count: number;
  badgeColor: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      hitSlop={6}
      className={`mr-1.5 min-h-8 shrink-0 flex-row items-center rounded-lg px-2 ${
        selected ? 'border border-court-edge bg-court-surface' : ''
      }`}>
      <SymbolView
        name={icon}
        size={14}
        tintColor={selected ? brand.premium : 'rgba(22,37,31,0.5)'}
      />
      <Text
        className={`ml-1.5 text-[12px] font-normal ${
          selected ? 'text-court-ink' : 'text-court-muted'
        }`}>
        {label}
      </Text>
      {count > 0 ? (
        <View
          className="ml-1.5 min-h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5"
          style={{ backgroundColor: badgeColor }}>
          <Text
            className="text-[9px] font-normal text-black"
            style={{ fontVariant: ['tabular-nums'] }}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
