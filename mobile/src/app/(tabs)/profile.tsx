import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Linking,
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
  rankingKey,
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
  setPreferredRanking,
  sponsorsOf,
  updateGallery,
  type PlayerRow,
  type ProfileBundle,
  type ProfileTransaction,
  type RankingRow,
} from '@/lib/profile';
import { openSitePath } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import { brand } from '@/theme/tokens';

const EMPTY_PROFILE: ProfileBundle = {
  player: null,
  stats: { matchCount: 0, played: 0, wins: 0, losses: 0, lastFive: [], winRatio: 0 },
  tempLicense: null,
};

function instagramUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://instagram.com/${trimmed.replace(/^@/, '')}`;
}

function instagramHandle(value: string) {
  if (value.startsWith('@')) return value;
  return `@${value.split('/').pop()?.replace('@', '') || value}`;
}

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
  const [careerOpen, setCareerOpen] = useState(false);
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
  const sponsors = sponsorsOf(player);
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

  async function chooseRanking(row: RankingRow) {
    if (!player) return;
    try {
      await setPreferredRanking(player.id, row);
      flash(`Primary ranking updated to ${row.org} - ${row.age_group || 'Open'}`, 'success');
      await load(true);
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Unable to update ranking.');
    }
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
    <View className="flex-1 bg-page">
      <View className="bg-page" style={{ paddingTop: insets.top }}>
        <View className="h-[52px] flex-row items-center justify-between px-4">
          <Text accessibilityRole="header" className="text-[20px] font-extrabold text-premium">
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
          <View accessibilityLabel="Loading profile" className="rounded-3xl border border-white/10 bg-page/70 p-5">
            <View className="flex-row items-center">
              <View className="h-[88px] w-[88px] rounded-full bg-elevated" />
              <View className="ml-4 flex-1">
                <View className="h-3 w-24 rounded bg-elevated" />
                <View className="mt-2.5 h-6 w-40 rounded bg-elevated" />
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
                    <CareerBlock
                      player={player}
                      rankings={rankings}
                      open={careerOpen}
                      onToggle={() => setCareerOpen((current) => !current)}
                      onChoose={chooseRanking}
                      onShowDetails={(row) => {
                        setSelectedRanking(row);
                        goSection('rankings');
                      }}
                    />
                    <GalleryBlock
                      gallery={gallery}
                      onOpen={setLightbox}
                      onRemove={removeGalleryImage}
                    />
                    <View className="mt-4">
                      <MyProfilePanel player={player} sponsors={sponsors} onEdit={openProfileEdit} />
                    </View>
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


function CareerBlock({
  player,
  rankings,
  open,
  onToggle,
  onChoose,
  onShowDetails,
}: {
  player: PlayerRow;
  rankings: RankingRow[];
  open: boolean;
  onToggle: () => void;
  onChoose: (row: RankingRow) => void;
  onShowDetails: (row: RankingRow) => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel="Career Overview"
      className="mt-4 rounded-3xl border border-white/10 bg-[#0a0a0a]/70 p-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-xl border border-padel/20 bg-padel/10">
            <SymbolView name="trophy.fill" size={16} tintColor={brand.padel} />
          </View>
          <Text className="ml-3 text-xs font-black uppercase tracking-wider text-premium">
            Career Overview
          </Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <SymbolView name="chevron.down" size={16} tintColor={brand.padel} />
        </View>
      </View>
      {open ? (
        <View className="mt-4">
          {player.skill_rating ? (
            <View className="mb-4 flex-row items-center rounded-2xl border border-padel/20 bg-padel/10 p-4">
              <View className="h-14 min-w-[4.5rem] items-center justify-center rounded-xl bg-padel px-3">
                <Text className="text-[8px] font-black uppercase text-page">Skill</Text>
                <Text className="text-xl font-black text-page">{player.skill_rating}</Text>
              </View>
              <View className="ml-4 flex-1">
                <Text className="text-[10px] font-black uppercase tracking-widest text-padel">
                  Rankedin Rating
                </Text>
                <View className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <View
                    className="h-full bg-padel"
                    style={{ width: `${Math.min(Number(player.skill_rating) * 3.33, 100)}%` }}
                  />
                </View>
              </View>
            </View>
          ) : null}
          {rankings.length ? (
            <View className="mb-4 rounded-2xl border border-white/5 bg-white/5 p-4">
              <Text className="mb-4 text-[10px] font-black uppercase tracking-widest text-faint">
                Organizational Rankings
              </Text>
              {rankings.map((row, index) => {
                const preferred = player.preferred_ranking
                  ? player.preferred_ranking === rankingKey(row) &&
                    rankings.findIndex((item) => rankingKey(item) === player.preferred_ranking) === index
                  : index === 0;
                const broll = (row.org || '').toLowerCase().includes('broll');
                return (
                  <Pressable
                    key={`${rankingKey(row)}-${index}`}
                    onPress={() => onChoose(row)}
                    accessibilityRole="button"
                    accessibilityLabel={`${row.org || 'SAPA ranking'}, ${row.age_group || 'Open'}`}
                    className="relative mb-2 rounded-xl border p-3"
                    style={{
                      backgroundColor: preferred ? 'rgba(204,255,0,0.1)' : 'rgba(0,0,0,0.2)',
                      borderColor: preferred ? 'rgba(204,255,0,0.3)' : 'rgba(255,255,255,0.05)',
                    }}>
                    <View className="flex-row justify-between">
                      <View className="min-w-0 flex-1">
                        <Text
                          className="text-[8px] font-black uppercase tracking-widest"
                          style={{ color: broll ? '#EF4444' : brand.padel }}>
                          {row.org || 'SAPA RANKING'}
                        </Text>
                        <Text className="text-xs font-bold uppercase text-premium">
                          {row.age_group || row.division || 'Open'}
                        </Text>
                        <Text className="text-[8px] font-bold uppercase text-faint">
                          {row.match_type}
                        </Text>
                      </View>
                      <View className="items-end">
                        <Text className="text-sm font-black text-premium">#{row.rank}</Text>
                        <Text className="text-[8px] font-black uppercase tracking-widest text-faint">
                          {row.points} PTS
                        </Text>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => onShowDetails(row)}
                      accessibilityRole="button"
                      accessibilityLabel="Show ranking details"
                      className="mt-2 min-h-11 justify-center self-end">
                      <Text className="text-[8px] font-black uppercase tracking-widest text-padel">
                        Show Details →
                      </Text>
                    </Pressable>
                  </Pressable>
                );
              })}
              <Text className="mt-2 text-center text-[8px] font-bold uppercase tracking-widest text-white/40">
                Tap a ranking to set as primary
              </Text>
            </View>
          ) : null}
          {player.match_form ? (
            <View className="mb-4 rounded-2xl border border-white/5 bg-white/5 p-4">
              <Text className="mb-2 text-[10px] font-black uppercase tracking-widest text-faint">
                Recent Form
              </Text>
              <View className="flex-row" style={{ gap: 6 }}>
                {player.match_form
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((mark, index) => (
                    <View
                      key={`${mark}-${index}`}
                      className="h-6 w-6 items-center justify-center rounded-md"
                      style={{
                        backgroundColor: mark === 'W' ? brand.padel : '#EF4444',
                      }}>
                      <Text
                        className="text-[10px] font-black"
                        style={{ color: mark === 'W' ? '#000' : '#fff' }}>
                        {mark}
                      </Text>
                    </View>
                  ))}
              </View>
            </View>
          ) : null}
          <View className="mb-4 rounded-2xl border border-white/5 bg-white/5 p-4">
            <Text className="mb-1 text-[10px] font-black uppercase tracking-widest text-faint">
              Current Points
            </Text>
            <Text className="text-3xl font-black text-premium">{player.points ?? '—'}</Text>
          </View>
          <View className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <Text className="mb-1 text-[10px] font-black uppercase tracking-widest text-faint">
              Division
            </Text>
            <Text className="text-xl font-bold uppercase text-padel">
              {player.category || 'Unassigned'}
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
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
    <View className="mt-4 rounded-3xl border border-white/10 bg-[#0a0a0a]/70 p-5">
      <View className="mb-3 flex-row items-center">
        <SymbolView name="photo.on.rectangle" size={12} tintColor={brand.padel} />
        <Text className="ml-1.5 text-[10px] font-black uppercase tracking-[0.25em] text-padel">
          Player Gallery
        </Text>
        <View className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
          <Text className="text-[8px] font-bold text-white/50">{gallery.length} / 5</Text>
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
            className="h-[72px] w-[72px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/5">
            <SymbolView name="plus" size={18} tintColor={brand.faint} />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

function MyProfilePanel({
  player,
  sponsors,
  onEdit,
}: {
  player: PlayerRow;
  sponsors: string[];
  onEdit: () => void;
}) {
  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-faint">
          Player Profile Details
        </Text>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
          className="min-h-11 flex-row items-center rounded-xl border border-padel/30 bg-padel/10 px-3">
          <SymbolView name="pencil" size={10} tintColor={brand.padel} />
          <Text className="ml-1 text-[8.5px] font-black uppercase tracking-wider text-padel">Edit</Text>
        </Pressable>
      </View>
      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        <InfoTile label="Contact" value={player.contact_number || 'Not Set'} />
        <InfoTile label="Age" value={player.age ? `${player.age} Years` : 'Not Set'} />
        <InfoTile label="Home Club" value={player.home_club || 'Not Set'} />
        <InfoTile label="Racket" value={player.racket_brand || 'Not Set'} />
        <InfoTile label="Region" value={player.region || 'Not Set'} />
        <InfoTile label="Division" value={player.category || 'Not Set'} />
      </View>
      <View className="mt-3 rounded-3xl border border-white/10 bg-[#0a0a0a]/70 p-4">
        <Text className="mb-2 text-[7.5px] font-black uppercase tracking-[0.2em] text-padel">
          Player Biography
        </Text>
        <Text className="text-[10px] font-medium leading-5 text-gray-300">
          {player.bio || 'No biography added yet. Update your profile to tell us about your padel journey!'}
        </Text>
      </View>
      {player.instagram_link ? (
        <Pressable
          onPress={() => {
            const url = instagramUrl(player.instagram_link || '');
            if (url) Linking.openURL(url);
          }}
          accessibilityRole="link"
          accessibilityLabel="Instagram handle"
          className="mt-3 flex-row items-center justify-between rounded-2xl border border-white/10 bg-[#0a0a0a]/70 p-3.5">
          <Text className="text-[10px] font-bold text-gray-300">Instagram Handle</Text>
          <Text className="text-[9.5px] font-extrabold uppercase tracking-wider text-padel">
            {instagramHandle(player.instagram_link)}
          </Text>
        </Pressable>
      ) : null}
      <View className="mt-3 rounded-3xl border border-white/10 bg-[#0a0a0a]/70 p-4">
        <Text className="mb-3 text-[7.5px] font-black uppercase tracking-[0.2em] text-padel">
          Sponsors & Partners
        </Text>
        {sponsors.length ? (
          <View className="flex-row flex-wrap" style={{ gap: 6 }}>
            {sponsors.map((sponsor) => (
              <Text
                key={sponsor}
                className="rounded-lg border border-padel/25 bg-padel/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-padel">
                {sponsor}
              </Text>
            ))}
          </View>
        ) : (
          <Text className="text-[9.5px] font-bold uppercase tracking-wider text-faint">
            No active sponsors listed
          </Text>
        )}
      </View>
    </View>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-h-[75px] w-[47%] justify-between rounded-2xl border border-white/10 bg-[#0a0a0a]/70 p-3.5">
      <Text className="text-[7.5px] font-black uppercase tracking-widest text-padel">{label}</Text>
      <Text numberOfLines={2} className="mt-1 text-[11px] font-black text-premium">
        {value}
      </Text>
    </View>
  );
}

