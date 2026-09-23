import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuButton } from '@/components/app-drawer';
import { FadeUp } from '@/components/fade-up';
import { EmptyBlock } from '@/components/home-event-card';
import { NotificationBell } from '@/components/home-header';
import {
  PROFILE_SECTIONS,
  ProfileSectionPager,
  SectionSwitcher,
  type AgendaFilter,
  type EventScope,
  type ProfileSection,
} from '@/components/profile-agenda';
import { LicenseCallout, ProfileHero, ProfileStatsCard } from '@/components/profile-hero';
import { PressableScale } from '@/components/pressable-scale';
import { Toast, type ToastKind } from '@/components/toast';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import {
  eventPath,
  fetchHomeBundle,
  type CalendarEvent,
  type HomeBundle,
} from '@/lib/home';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import {
  fetchProfileBundle,
  fetchProfileTransactions,
  galleryOf,
  rankingsOf,
  updateGallery,
  type ProfileBundle,
  type ProfileTransaction,
  type RankingRow,
} from '@/lib/profile';
import { openSitePath } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import { lightBrand as brand } from '@/theme/tokens';

const EMPTY_PROFILE: ProfileBundle = {
  player: null,
  stats: { matchCount: 0, played: 0, wins: 0, losses: 0, lastFive: [], winRatio: 0 },
  tempLicense: null,
};

/** Profile tab. Edit lives on `/edit-profile`, pushed as a native stack page. */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tabPad = useTabScenePadding();
  const { width } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const [pagerH, setPagerH] = useState(0);
  const [bundle, setBundle] = useState<ProfileBundle>(EMPTY_PROFILE);
  const [home, setHome] = useState<HomeBundle | null>(null);
  const [transactions, setTransactions] = useState<ProfileTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [section, setSection] = useState<ProfileSection>('events');
  const [eventView, setEventView] = useState<AgendaFilter>('upcoming');
  const [matchView, setMatchView] = useState<AgendaFilter>('upcoming');
  const [eventScope, setEventScope] = useState<EventScope>('all');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [selectedRanking, setSelectedRanking] = useState<RankingRow | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string; kind: ToastKind } | null>(null);
  const toastSeq = useRef(0);
  const [statsPlayId, setStatsPlayId] = useState(0);

  const dismissToast = useCallback(() => setToast(null), []);
  function flash(message: string, kind: ToastKind = 'error') {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message, kind });
  }

  const load = useCallback(async (soft?: boolean) => {
    if (!soft) setLoading(true);
    try {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email ?? null;
      const [next, homeNext] = await Promise.all([
        fetchProfileBundle(email),
        email ? fetchHomeBundle(email) : Promise.resolve(null),
      ]);
      setBundle(next);
      setHome(homeNext);
      const ranks = rankingsOf(next.player);
      setSelectedRanking((current) => current ?? ranks[0] ?? null);
      if (email) {
        setTxLoading(true);
        fetchProfileTransactions(email)
          .then(setTransactions)
          .catch(() => setTransactions([]))
          .finally(() => setTxLoading(false));
      }
    } catch (err) {
      console.warn('[profile]', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setStatsPlayId((n) => n + 1);
      void load(true);
    }, [load])
  );

  const player = bundle.player;
  const rankings = rankingsOf(player);
  const gallery = galleryOf(player);
  const pendingEvents = (home?.pending ?? []).filter((row) => row.kind === 'payment');
  const upcomingEvents = home?.upcomingSchedule ?? [];
  const pastEvents = home?.pastSchedule ?? [];
  const upcomingMatches = home?.upcomingMatches ?? [];
  const pastMatches = home?.pastMatches ?? [];
  const pendingEventIds = useMemo(() => {
    const ids = new Set<number>();
    for (const event of upcomingEvents) {
      if (pendingEvents.some((row) => row.path.includes(String(event.slug || event.id)))) {
        ids.add(event.id);
      }
    }
    return ids;
  }, [pendingEvents, upcomingEvents]);
  const sectionCounts = {
    events: upcomingEvents.length + pastEvents.length,
    matches: upcomingMatches.length + pastMatches.length,
    rankings: rankings.length,
    payments: transactions.length,
  };

  function goSection(next: ProfileSection, source: 'tap' | 'swipe' = 'tap') {
    if (next === section) return;
    if (source === 'tap') hapticMedium();
    else hapticLight();
    setSection(next);
    if (source === 'tap') {
      const index = PROFILE_SECTIONS.findIndex((item) => item.id === next);
      pagerRef.current?.scrollTo({ x: Math.max(0, index) * width, animated: true });
    }
  }

  function openProfileEdit() {
    router.push('/edit-profile');
  }

  async function openEvent(event: CalendarEvent, action?: 'register' | 'pay' | 'manage') {
    const path = eventPath(event);
    await openSitePath(path);
    void action;
  }

  async function removeGalleryImage(index: number) {
    if (!player) return;
    const next = gallery.filter((_, i) => i !== index);
    try {
      await updateGallery(player.id, next);
      setBundle((current) =>
        current.player
          ? { ...current, player: { ...current.player, additional_images: next } }
          : current
      );
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Unable to remove photo.');
    }
  }

  return (
    <View className="flex-1 bg-court-page">
      <View className="bg-court-page" style={{ paddingTop: insets.top }}>
        <View className="h-[52px] flex-row items-center justify-between px-4">
          <Text accessibilityRole="header" className="text-[20px] font-extrabold text-court-ink">
            Profile
          </Text>
          <View className="flex-row items-center">
            <NotificationBell
              label={
                (home?.pending.length ?? 0) > 0
                  ? `Notifications, ${home?.pending.length} waiting`
                  : 'Notifications'
              }
              onPress={() => router.push('/notifications')}
              ringing={(home?.pending.length ?? 0) > 0}
            />
            <MenuButton />
          </View>
        </View>
      </View>

      {loading && !player ? (
        <View className="px-5 pt-2">
          <View accessibilityLabel="Loading profile" className="rounded-3xl border border-court-edge bg-court-page/70 p-5">
            <View className="flex-row items-center">
              <View className="h-[88px] w-[88px] rounded-full bg-court-elevated" />
              <View className="ml-4 flex-1">
                <View className="h-3 w-24 rounded bg-court-elevated" />
                <View className="mt-2.5 h-6 w-40 rounded bg-court-elevated" />
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {!loading && !player ? (
        <View className="px-5 pt-2">
          <EmptyBlock
            title="No Profile Found"
            body="We couldn't link your account to a player profile."
          />
        </View>
      ) : null}

      {player ? (
        <>
          <View className="px-5 pt-2">
            <FadeUp>
              <ProfileHero
                player={player}
                stats={bundle.stats}
                playId={statsPlayId}
                onEditPhoto={openProfileEdit}
              />
            </FadeUp>
            {(player.license_type || 'none').toLowerCase() !== 'full' ? (
              <FadeUp className="mt-3">
                <LicenseCallout licenseType={player.license_type} tempLicense={bundle.tempLicense} />
                <PressableScale
                  onPress={() => openSitePath('/profile')}
                  accessibilityRole="link"
                  accessibilityLabel="Pay for a license on 4M Padel"
                  className="mt-3 h-[44px] items-center justify-center rounded-xl bg-padel">
                  <Text className="text-[10px] font-black uppercase tracking-widest text-page">
                    {(player.license_type || '').toLowerCase() === 'temporary'
                      ? 'Upgrade to Full License'
                      : 'Pay Now - Full License'}
                  </Text>
                </PressableScale>
              </FadeUp>
            ) : null}
            <FadeUp className="mt-3">
              <ProfileStatsCard stats={bundle.stats} playId={statsPlayId} />
            </FadeUp>
          </View>

          <View className="mt-4 pb-3">
            <SectionSwitcher section={section} counts={sectionCounts} onChange={(next) => goSection(next)} />
          </View>

          <View
            className="flex-1"
            onLayout={(event) => setPagerH(event.nativeEvent.layout.height)}>
            {pagerH > 0 ? (
              <ProfileSectionPager
                width={width}
                height={pagerH}
                section={section}
                pagerRef={pagerRef}
                onSwipe={(next) => goSection(next, 'swipe')}
                counts={sectionCounts}
                eventView={eventView}
                matchView={matchView}
                eventScope={eventScope}
                onEventView={setEventView}
                onMatchView={setMatchView}
                onEventScope={setEventScope}
                upcomingEvents={upcomingEvents}
                completedEvents={pastEvents}
                pendingEventIds={pendingEventIds}
                upcomingMatches={upcomingMatches}
                completedMatches={pastMatches}
                rankings={rankings}
                selectedRanking={selectedRanking}
                onSelectRanking={setSelectedRanking}
                transactions={transactions}
                txLoading={txLoading}
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load(true);
                }}
                onOpenEvent={openEvent}
                bottomPad={tabPad}
                eventsFooter={
                  <>
                    <GalleryBlock
                      gallery={gallery}
                      onOpen={setLightbox}
                      onRemove={removeGalleryImage}
                    />
                  </>
                }
              />
            ) : null}
          </View>
        </>
      ) : null}

      {lightbox ? (
        <Pressable
          onPress={() => setLightbox(null)}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          className="absolute inset-0 items-center justify-center bg-black/80">
          <Image source={{ uri: lightbox }} style={{ width: '90%', height: '70%' }} contentFit="contain" />
        </Pressable>
      ) : null}

      <Toast
        key={toast?.id ?? 'idle'}
        message={toast?.message ?? null}
        kind={toast?.kind}
        onDismiss={dismissToast}
      />
    </View>
  );
}


function GalleryBlock({
  gallery,
  onOpen,
  onRemove,
}: {
  gallery: string[];
  onOpen: (url: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <View className="mt-4 rounded-3xl border border-court-edge bg-court-elevated p-5">
      <View className="mb-3 flex-row items-center">
        <SymbolView name="photo.on.rectangle" size={18} tintColor={brand.accent} />
        <Text className="ml-2 text-base font-bold text-court-ink">
          Player Gallery
        </Text>
        <View className="ml-2 rounded-full border border-court-edge bg-court-surface px-2 py-0.5">
          <Text className="text-xs font-semibold text-court-muted">{gallery.length} / 5</Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: 12 }}>
        {gallery.map((url, index) => (
          <View key={`${url}-${index}`} className="relative">
            <Pressable
              onPress={() => onOpen(url)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Gallery photo ${index + 1}`}>
              <Image
                source={{ uri: url }}
                style={{ width: 72, height: 72, borderRadius: 16 }}
                contentFit="cover"
              />
            </Pressable>
            <Pressable
              onPress={() => onRemove(index)}
              accessibilityRole="button"
              accessibilityLabel={`Remove gallery photo ${index + 1}`}
              hitSlop={6}
              className="absolute items-center justify-center rounded-full bg-red-500/80"
              style={{ top: 4, right: 4, width: 18, height: 18 }}>
              <SymbolView name="xmark" size={8} tintColor="#fff" />
            </Pressable>
          </View>
        ))}
        {gallery.length < 5 ? (
          <Pressable
            onPress={() => openSitePath('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Add gallery photo on 4M Padel"
            className="h-[72px] w-[72px] items-center justify-center rounded-2xl border border-dashed border-court-edge bg-court-surface">
            <SymbolView name="plus" size={18} tintColor={brand.faint} />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

