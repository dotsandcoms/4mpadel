import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { FadeUp } from '@/components/fade-up';
import { IdentityBadge } from '@/components/home-player-card';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  formatPoints,
  formatRank,
  licenseBadge,
  type PlayerRow,
  type ProfileStats,
  type TempLicense,
} from '@/lib/profile';
import { courtSideLabel, playingHandLabel } from '@/lib/player-preferences';
import { lightBrand as brand, motion } from '@/theme/tokens';

const COUNT_MS = 800;
const countEase = Easing.bezier(
  motion.easing.decelerate[0],
  motion.easing.decelerate[1],
  motion.easing.decelerate[2],
  motion.easing.decelerate[3]
);

/**
 * Count a number up from 0. `playId` restarts the run when Profile is focused
 * again — the tab stays mounted, so target alone would not retrigger.
 */
function useCountTo(target: number, decimals = 0, playId = 0) {
  const reduced = useReducedMotion();
  const sv = useSharedValue(reduced ? target : 0);
  const [shown, setShown] = useState(() => (reduced ? target : 0));
  const [seenPlayId, setSeenPlayId] = useState(playId);

  if (playId !== seenPlayId) {
    setSeenPlayId(playId);
    if (!reduced) setShown(0);
  }

  useEffect(() => {
    if (reduced) {
      sv.value = target;
      setShown(target);
      return;
    }

    sv.value = 0;
    sv.value = withTiming(target, {
      duration: COUNT_MS,
      easing: countEase,
    });
  }, [playId, reduced, sv, target]);

  const factor = 10 ** decimals;
  useAnimatedReaction(
    () => Math.round(sv.value * factor) / factor,
    (next, prev) => {
      if (next !== prev) runOnJS(setShown)(next);
    }
  );

  return { shown, sv };
}


type HeroProps = {
  player: PlayerRow;
  stats: ProfileStats;
  playId?: number;
  fipLinked?: boolean;
  statsReady?: boolean;
};

function rankNumber(label?: string | null) {
  if (!label || label === 'Unranked') return null;
  const n = parseInt(String(label).replace('#', ''), 10);
  return Number.isFinite(n) ? n : null;
}

/** Profile identity card with the same badges and SAPA career heading as Home. */
export function ProfileHero({ player, stats, playId = 0, fipLinked = false, statsReady = true }: HeroProps) {
  const license = licenseBadge(player.license_type);
  const name = player.name?.trim() || 'Player';
  const rankN = rankNumber(player.rank_label);
  const rankCount = useCountTo(rankN ?? 0, 0, playId);
  const pointsCount = useCountTo(player.points ?? 0, 0, playId);
  const matchesCount = useCountTo(stats.matchCount, 0, playId);
  const rankValue = rankN == null ? formatRank(player.rank_label) : `#${rankCount.shown}`;
  const sapaProfile = rankN != null || player.license_type?.toLowerCase() === 'full';
  const photo = 64;
  const side = courtSideLabel(player.court_side);
  const hand = playingHandLabel(player.playing_hand);

  return (
    <View className="rounded-2xl border border-court-edge bg-court-elevated p-3.5">
      <View className="flex-row items-center">
        <View className="relative shrink-0">
          <View
            className="items-center justify-center overflow-hidden rounded-full bg-court-elevated"
            style={{
              width: photo,
              height: photo,
              borderWidth: 3,
              borderColor: '#0a0a0a',
            }}>
            {player.image_url ? (
              <Image
                source={{ uri: player.image_url }}
                style={{ width: photo, height: photo }}
                contentFit="cover"
                accessibilityLabel={`${name} profile photo`}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Text className="text-lg font-bold text-court-muted">
                {name.charAt(0)}
              </Text>
            )}
          </View>
        </View>

        <View className="ml-3 min-w-0 flex-1">
          <View className="mb-1.5 flex-row flex-wrap items-center" style={{ gap: 6 }}>
            {sapaProfile ? <IdentityBadge label="SAPA" color={brand.accent} border={brand.edge} background={brand.glass} /> : null}
            <IdentityBadge label="4M" color="#8D610C" border="#EFDCAA" background="#FFF7E5" />
            {fipLinked ? <IdentityBadge label="FIP" color="#2449D8" border="#CAD8FF" background="#EEF3FF" /> : null}
            {license && !sapaProfile ? <IdentityBadge label={license.label} color={license.color} border={license.border} background={license.bg} /> : null}
          </View>

          <Text
            className="text-lg font-extrabold uppercase leading-tight text-court-ink"
            numberOfLines={2}>
            {name}
          </Text>
          {(side || hand) && <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>{[side && `${side} court`, hand].filter(Boolean).join(' · ')}</Text>}

        </View>
      </View>
      <View className="mt-3 rounded-xl bg-court-surface px-3 py-2.5">
        <Text className="mb-2 text-[11px] font-bold text-court-muted">SAPA Career</Text>
        <View className="flex-row items-stretch">
          <Stat value={rankValue} label="Rank" color={brand.premium} />
          <View className="w-px self-stretch bg-court-edge" />
          <Stat value={player.points == null ? '—' : formatPoints(pointsCount.shown)} label="Points" color={brand.accent} />
          <View className="w-px self-stretch bg-court-edge" />
          <Stat value={statsReady ? String(matchesCount.shown) : '—'} label="Matches" color={brand.premium} />
        </View>
      </View>
    </View>
  );
}

export function ProfileStatsCard({
  stats,
  skillRating,
  playId = 0,
}: {
  stats: ProfileStats;
  skillRating?: PlayerRow['skill_rating'];
  playId?: number;
}) {
  const ratioTarget = Math.min(100, Math.max(0, stats.winRatio));
  const played = useCountTo(stats.played, 0, playId);
  const wins = useCountTo(stats.wins, 0, playId);
  const losses = useCountTo(stats.losses, 0, playId);
  const ratio = useCountTo(ratioTarget, 1, playId);
  const trackW = useSharedValue(0);

  const fillStyle = useAnimatedStyle(() => ({
    width: (trackW.value * ratio.sv.value) / 100,
  }));
  return (
    <View className="rounded-2xl border border-court-edge bg-court-elevated p-4">
      <View className="flex-row" style={{ gap: 8 }}>
        <MiniStat label="Matches" value={String(played.shown)} />
        <MiniStat label="Won" value={String(wins.shown)} labelColor={brand.accent} />
        <MiniStat label="Lost" value={String(losses.shown)} labelColor={brand.danger} />
        {skillRating != null && Number.isFinite(Number(skillRating)) ? (
          <MiniStat label="Skill" value={String(skillRating)} labelColor={brand.premium} highlight />
        ) : null}
      </View>

      <View className="mt-4 flex-row items-center justify-between">
        <Text className="text-xs font-semibold text-court-muted">Last 5 matches</Text>
        {stats.lastFive.length ? (
          <View accessible accessibilityLabel={`Last 5 matches: ${stats.lastFive.map(mark => mark === 'W' ? 'win' : 'loss').join(', ')}`} className="flex-row" style={{ gap: 6 }}>
            {stats.lastFive.map((mark, index) => (
              <FadeUp key={`${playId}-${mark}-${index}`} delay={index * motion.stagger}>
                <View className="h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: mark === 'W' ? brand.glass : '#FBECEB' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: mark === 'W' ? brand.accent : brand.danger }}>{mark}</Text>
                </View>
              </FadeUp>
            ))}
          </View>
        ) : <Text className="text-xs text-court-faint">No matches yet</Text>}
      </View>

      <View className="mt-4">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-xs font-semibold text-court-muted">Win ratio</Text>
          <Text className="text-sm font-bold text-court-ink" style={{ fontVariant: ['tabular-nums'] }}>{ratio.shown.toFixed(1)}%</Text>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Win ratio"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(ratioTarget) }}
          className="h-2 w-full overflow-hidden rounded-full bg-court-surface"
          onLayout={event => { trackW.value = event.nativeEvent.layout.width; }}>
          <Animated.View className="h-full rounded-full" style={[{ backgroundColor: brand.accent }, fillStyle]} />
        </View>
      </View>
    </View>
  );
}

export function LicenseCallout({
  licenseType,
  tempLicense,
}: {
  licenseType?: string | null;
  tempLicense: TempLicense | null;
}) {
  const kind = (licenseType || 'none').toLowerCase();
  if (kind === 'full') return null;

  const temporary = kind === 'temporary';
  const eventDate = tempLicense?.event_date
    ? new Date(tempLicense.event_date).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <View
      className="overflow-hidden rounded-3xl border p-4"
      style={{
        borderColor: temporary ? 'rgba(96,165,250,0.3)' : 'rgba(22,37,31,0.1)',
        backgroundColor: '#FFFFFF',
        borderLeftWidth: 2,
        borderLeftColor: temporary ? '#3B82F6' : '#6B7280',
      }}>
      <Text
        className="self-start rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em]"
        style={{
          color: temporary ? '#60A5FA' : brand.faint,
          backgroundColor: temporary ? 'rgba(59,130,246,0.1)' : 'rgba(22,37,31,0.05)',
        }}>
        {temporary ? 'Temporary License Active' : 'License Inactive'}
      </Text>
      {temporary && tempLicense?.event_name ? (
        <Text className="mt-3 text-[13px] font-bold uppercase text-court-ink">
          {tempLicense.event_name}
          {eventDate ? `  ${eventDate}` : ''}
        </Text>
      ) : (
        <Text className="mt-3 text-[10px] leading-5 text-court-muted">
          Activate your elite license to appear on public rankings & track tour statistics.
        </Text>
      )}
    </View>
  );
}

function Stat({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View className="min-w-0 flex-1 items-center px-1">
      <Text
        className="text-[15px] font-extrabold leading-none"
        style={{ color, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-court-faint">
        {label}
      </Text>
    </View>
  );
}

function MiniStat({
  label,
  value,
  labelColor,
  highlight = false,
}: {
  label: string;
  value: string;
  labelColor?: string;
  highlight?: boolean;
}) {
  return (
    <View className="min-h-[64px] min-w-0 flex-1 items-center justify-center rounded-xl p-2" style={{ backgroundColor: highlight ? '#2449D8' : brand.surface }}>
      <Text
        className="w-full text-center text-[11px] font-semibold"
        style={{ color: highlight ? '#FFFFFF' : labelColor ?? brand.faint }}>
        {label}
      </Text>
      <Text
        className="mt-1 w-full text-center text-[22px] font-bold text-court-ink"
        style={{ fontVariant: ['tabular-nums'], color: highlight ? '#FFFFFF' : brand.premium }}>
        {value}
      </Text>
    </View>
  );
}
