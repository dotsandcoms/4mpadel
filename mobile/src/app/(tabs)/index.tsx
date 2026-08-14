import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
} from '@/components/home-event-card';
import { HomeHeader } from '@/components/home-header';
import { HomeGreeting, HomePlayerCard } from '@/components/home-player-card';
import { PressableScale } from '@/components/pressable-scale';
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
  const [scheduleKind, setScheduleKind] = useState<'matches' | 'events'>('matches');

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
            style={styles.heroImage}
            contentFit="cover"
            pointerEvents="none"
            accessibilityElementsHidden
          />
          <View pointerEvents="none" style={styles.heroScrim} />

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
            <View className="mb-3 flex-row items-end">
              <View accessibilityRole="tablist" className="flex-row items-end">
                <KindTab
                  label="Matches"
                  count={bundle.upcomingMatches.length}
                  selected={scheduleKind === 'matches'}
                  onPress={() => setScheduleKind('matches')}
                />
                <KindTab
                  label="Events"
                  count={bundle.upcomingSchedule.length}
                  selected={scheduleKind === 'events'}
                  onPress={() => setScheduleKind('events')}
                />
              </View>
              <View className="mb-0.5 ml-auto flex-row rounded-lg border border-white/15 p-0.5">
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
                  title={
                    schedulePast ? 'No past matches yet' : 'You have no upcoming matches'
                  }
                  body={
                    schedulePast
                      ? 'Match history will appear here after you play.'
                      : 'Your next match will appear here when draws are published.'
                  }
                />
              )
            ) : schedule.length ? (
              <View className="overflow-hidden rounded-2xl border border-edge bg-white/5">
                {schedule.map((event, i) => (
                  <View key={event.id}>
                    {i > 0 ? <View className="h-px bg-edge" /> : null}
                    <EventRow event={event} onPress={() => openEvent(event)} />
                  </View>
                ))}
              </View>
            ) : (
              <EmptyBlock
                title={schedulePast ? 'No past events yet' : 'You have no upcoming events'}
                body={
                  schedulePast
                    ? 'Finished events you enter will collect here.'
                    : 'Explore the calendar to find your next event.'
                }
                actionLabel="Find tournaments"
                onAction={() => router.push('/(tabs)/calendar')}
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
              <View className="gap-3">
                {bundle.featured.map((event) => (
                  <FeaturedCard
                    key={event.id}
                    event={event}
                    onPress={() => openEvent(event)}
                  />
                ))}
              </View>
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
              <View className="overflow-hidden rounded-2xl border border-edge bg-white/5">
                {bundle.recentResults.map((event, i) => (
                  <View key={event.id}>
                    {i > 0 ? <View className="h-px bg-edge" /> : null}
                    <EventRow event={event} onPress={() => openEvent(event)} />
                  </View>
                ))}
              </View>
            ) : (
              <EmptyBlock
                title="Results will appear here"
                body="Finished Gold, Super Gold and Major events collect in this list."
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

function KindTab({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      className="relative mr-5 min-h-11 justify-end pb-2">
      <View className="flex-row items-baseline">
        <Text
          className={`text-[15px] font-semibold ${selected ? 'text-premium' : 'text-white/45'}`}>
          {label}
        </Text>
        {count > 0 ? (
          <Text
            className="ml-1.5 text-[12px] font-semibold"
            style={{
              color: selected ? brand.padel : 'rgba(255,255,255,0.35)',
              fontVariant: ['tabular-nums'],
            }}>
            {count}
          </Text>
        ) : null}
      </View>
      <View
        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
        style={{ backgroundColor: selected ? brand.padel : 'transparent' }}
      />
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
