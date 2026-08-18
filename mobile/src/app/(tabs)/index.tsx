import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
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
import { HomeGreeting, HomePlayerCard } from '@/components/home-player-card';
import { PressableScale } from '@/components/pressable-scale';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import {
  EMPTY_HOME,
  eventPath,
  fetchHomeBundle,
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
import { brand, motion } from '@/theme/tokens';

const MATCH_ORANGE = '#F97316';

const QUICK_LINKS = [
  {
    key: 'rankings',
    label: 'Player Rankings',
    icon: 'chart.bar.fill' as const,
    tab: '/(tabs)/rankings' as const,
  },
  {
    key: 'calendar',
    label: 'Find Tournaments',
    icon: 'magnifyingglass' as const,
    tab: '/(tabs)/calendar' as const,
  },
  {
    key: 'profile',
    label: 'My Profile',
    icon: 'person.fill' as const,
    tab: '/(tabs)/profile' as const,
  },
  {
    key: 'help',
    label: 'Help & Support',
    icon: 'questionmark.circle' as const,
    href: '/contact',
  },
];

type OpenMap = {
  pending: boolean;
  schedule: boolean;
  featured: boolean;
  results: boolean;
  links: boolean;
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabPad = useTabScenePadding();
  const [bundle, setBundle] = useState<HomeBundle>(EMPTY_HOME);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<OpenMap>({
    pending: false,
    schedule: false,
    featured: false,
    results: false,
    links: false,
  });
  const [schedulePast, setSchedulePast] = useState(false);
  const [scheduleKind, setScheduleKind] = useState<'matches' | 'events'>('events');
  const scheduleKindTouched = useRef(false);

  const load = useCallback(async (soft?: boolean) => {
    if (!soft) setLoading(true);
    try {
      const { data } = await supabase.auth.getUser();
      setBundle(await fetchHomeBundle(data.user?.email));
    } catch (err) {
      console.warn('[home]', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    <View className="flex-1 bg-page">
      <View
        className="bg-page"
        style={{ paddingTop: insets.top, zIndex: 30, elevation: 30 }}>
        <HomeHeader
          onSearch={() => router.push('/search')}
          onNotifications={() => router.push('/notifications')}
          noticeCount={bundle.pending.length}
        />
      </View>

      <ScrollView
        className="flex-1 bg-page"
        contentContainerStyle={{
          paddingBottom: tabPad,
        }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(true);
            }}
            tintColor={brand.padel}
          />
        }>
        <View>
          <Image
            source={require('@/assets/images/hero-bg.jpg')}
            style={[styles.heroImage, { pointerEvents: 'none' }]}
            contentFit="cover"
            accessibilityElementsHidden
          />
          <View style={[styles.heroScrim, { pointerEvents: 'none' }]} />

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

        <View className="px-4">
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
              title={`Pending Actions (${bundle.pending.length})`}
              open={open.pending}
              onToggle={() => toggle('pending')}
              badges={[{ label: String(bundle.pending.length), count: true }]}>
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
              <View className="ml-auto shrink-0 flex-row rounded-lg border border-white/15 p-0.5">
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
                    className={`min-h-10 justify-center px-2.5 ${
                      schedulePast === tab.key ? 'rounded-md bg-white/10' : ''
                    }`}>
                    <Text
                      className={`text-[11px] font-semibold ${
                        schedulePast === tab.key ? 'text-premium' : 'text-white/45'
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
                      className={`overflow-hidden rounded-2xl border border-edge bg-white/5 ${
                        schedulePast ? '' : 'mt-3'
                      }`}>
                      {(schedulePast ? matches : matches.slice(1)).map((match, i) => (
                        <View key={matchKey(match, i)}>
                          {i > 0 ? <View className="h-px bg-edge" /> : null}
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
              <View className="overflow-hidden rounded-2xl border border-edge bg-white/5">
                {schedule.map((event, i) => (
                  <View key={event.id}>
                    {i > 0 ? <View className="h-px bg-edge" /> : null}
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
                onAction={schedulePast ? undefined : () => router.push('/(tabs)/calendar')}
              />
            )}
          </HomeAccordion>

          <HomeAccordion
            title="Featured Events"
            open={open.featured}
            onToggle={() => toggle('featured')}
            badges={
              bundle.featured.length
                ? [{ label: String(bundle.featured.length), count: true }]
                : undefined
            }>
            {bundle.featured.length ? (
              <EventSlide events={bundle.featured} onOpen={openEvent} />
            ) : (
              <EmptyBlock
                title="No featured events right now"
                body="Spotlight tournaments will appear here when they are announced."
                actionLabel="Browse calendar"
                onAction={() => router.push('/(tabs)/calendar')}
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

          <HomeAccordion
            title="Quick Links"
            open={open.links}
            onToggle={() => toggle('links')}>
            <View className="overflow-hidden rounded-2xl border border-edge bg-elevated">
              {QUICK_LINKS.map((link, i) => (
                <View key={link.key}>
                  {i > 0 ? <View className="h-px bg-edge" /> : null}
                  <PressableScale
                    onPress={() => {
                      if ('tab' in link && link.tab) router.push(link.tab);
                      else if ('href' in link && link.href) openSitePath(link.href);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={link.label}
                    className="min-h-[52px] flex-row items-center px-4">
                    <SymbolView name={link.icon} size={18} tintColor={brand.faint} />
                    <Text className="ml-3.5 flex-1 text-[14px] font-medium text-premium">
                      {link.label}
                    </Text>
                    <SymbolView name="chevron.right" size={14} tintColor={brand.faint} />
                  </PressableScale>
                </View>
              ))}
            </View>
          </HomeAccordion>
        </FadeUp>
        </View>
      </ScrollView>
    </View>
  );
}

function EventSlide({
  events,
  onOpen,
}: {
  events: CalendarEvent[];
  onOpen: (event: CalendarEvent) => void;
}) {
  const [page, setPage] = useState(0);
  const ids = events.map((event) => event.id).join(',');

  useEffect(() => {
    setPage(0);
  }, [ids]);

  const last = Math.max(0, events.length - 1);
  const index = Math.min(page, last);
  const event = events[index];
  if (!event) return null;

  const many = events.length > 1;

  return (
    <View>
      <FeaturedCard event={event} onPress={() => onOpen(event)} />
      {many ? (
        <>
          <Pressable
            onPress={() => setPage((current) => Math.max(0, current - 1))}
            disabled={index === 0}
            accessibilityRole="button"
            accessibilityLabel="Previous featured event"
            accessibilityState={{ disabled: index === 0 }}
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              marginTop: -22,
              width: 44,
              height: 44,
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 10,
            }}>
            <SymbolView
              name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
              size={18}
              tintColor={index === 0 ? 'rgba(255,255,255,0.28)' : brand.premium}
            />
          </Pressable>
          <Pressable
            onPress={() => setPage((current) => Math.min(last, current + 1))}
            disabled={index === last}
            accessibilityRole="button"
            accessibilityLabel="Next featured event"
            accessibilityState={{ disabled: index === last }}
            style={{
              position: 'absolute',
              top: '50%',
              right: 0,
              marginTop: -22,
              width: 44,
              height: 44,
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 10,
            }}>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={18}
              tintColor={index === last ? 'rgba(255,255,255,0.28)' : brand.premium}
            />
          </Pressable>
        </>
      ) : null}
    </View>
  );
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
      className={`mr-1.5 min-h-11 shrink-0 flex-row items-center rounded-lg px-2.5 ${
        selected ? 'border border-white/40 bg-white/5' : ''
      }`}>
      <SymbolView
        name={icon}
        size={14}
        tintColor={selected ? brand.premium : 'rgba(255,255,255,0.5)'}
      />
      <Text
        className={`ml-1.5 text-[13px] font-bold ${
          selected ? 'text-premium' : 'text-white/50'
        }`}>
        {label}
      </Text>
      {count > 0 ? (
        <View
          className="ml-1.5 min-h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5"
          style={{ backgroundColor: badgeColor }}>
          <Text
            className="text-[10px] font-black text-black"
            style={{ fontVariant: ['tabular-nums'] }}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 340,
  },
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 340,
    backgroundColor: 'rgba(10,10,10,0.48)',
  },
});
