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
import { MotionBorder } from '@/components/motion-border';
import { PulseDot } from '@/components/pulse-dot';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  formatPoints,
  formatRank,
  licenseBadge,
  type PlayerRow,
  type ProfileStats,
  type TempLicense,
} from '@/lib/profile';
import { brand, motion } from '@/theme/tokens';

const KNOB = 14;
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

const RANK_GOLD = '#EAB308';
const LOSS_RED = '#EF4444';

type HeroProps = {
  player: PlayerRow;
  stats: ProfileStats;
  onEditPhoto: () => void;
  playId?: number;
};

function rankNumber(label?: string | null) {
  if (!label || label === 'Unranked') return null;
  const n = parseInt(String(label).replace('#', ''), 10);
  return Number.isFinite(n) ? n : null;
}

/** Website mobile identity card: photo + pencil, license, name, rank / points / matches. */
export function ProfileHero({ player, stats, onEditPhoto, playId = 0 }: HeroProps) {
  const license = licenseBadge(player.license_type);
  const name = player.name?.trim() || 'Player';
  const rankN = rankNumber(player.rank_label);
  const rankCount = useCountTo(rankN ?? 0, 0, playId);
  const pointsCount = useCountTo(player.points ?? 0, 0, playId);
  const matchesCount = useCountTo(stats.matchCount, 0, playId);
  const rankValue = rankN == null ? formatRank(player.rank_label) : `#${rankCount.shown}`;
  const photo = 64;

  return (
    <View className="rounded-2xl border border-white/10 bg-[#0a0a0a]/70 p-3.5">
      <View className="flex-row items-center">
        <View className="relative shrink-0">
          <View
            className="items-center justify-center overflow-hidden rounded-full bg-elevated"
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
              <Text className="text-lg font-bold text-white/20">
                {name.charAt(0)}
              </Text>
            )}
          </View>
          <Pressable
            onPress={onEditPhoto}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            hitSlop={8}
            className="absolute items-center justify-center rounded-full bg-padel"
            style={{
              width: 22,
              height: 22,
              bottom: 0,
              right: 0,
              borderWidth: 1,
              borderColor: '#000',
            }}>
            <SymbolView name="pencil" size={10} tintColor="#000" />
          </Pressable>
        </View>

        <View className="ml-3 min-w-0 flex-1">
          {license ? (
            <View
              className="mb-1 flex-row items-center self-start rounded-full border px-2 py-0.5"
              style={{ borderColor: license.border, backgroundColor: license.bg }}>
              {license.pulse ? <PulseDot color={brand.padel} size={5} /> : null}
              <Text
                className="text-[7px] font-black uppercase tracking-wider"
                style={{
                  color: license.color,
                  marginLeft: license.pulse ? 5 : 0,
                }}>
                {license.label}
              </Text>
            </View>
          ) : null}

          <Text
            className="text-lg font-extrabold uppercase leading-tight text-premium"
            numberOfLines={2}>
            {name}
          </Text>

          <View className="mt-1.5 flex-row items-stretch">
            <Stat value={rankValue} label="Rank" color={RANK_GOLD} />
            <View className="h-7 w-px self-center bg-white/10" />
            <Stat value={player.points == null ? '—' : formatPoints(pointsCount.shown)} label="Points" color={brand.padel} />
            <View className="h-7 w-px self-center bg-white/10" />
            <Stat value={String(matchesCount.shown)} label="Matches" color={brand.premium} />
          </View>
        </View>
      </View>
    </View>
  );
}

export function ProfileStatsCard({
  stats,
  playId = 0,
}: {
  stats: ProfileStats;
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
  const knobStyle = useAnimatedStyle(() => {
    const x = (trackW.value * ratio.sv.value) / 100 - KNOB / 2;
    const max = Math.max(0, trackW.value - KNOB);
    return { transform: [{ translateX: Math.min(max, Math.max(0, x)) }] };
  });

  return (
    <MotionBorder>
      <View className="p-3.5">
      <View className="flex-row" style={{ gap: 6 }}>
        <MiniStat label="Total Match" value={String(played.shown)} />
        <MiniStat label="Won" value={String(wins.shown)} labelColor={brand.padel} />
        <MiniStat label="Lost" value={String(losses.shown)} labelColor="#F87171" />
        <View className="min-h-[52px] flex-1 items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] px-1 py-1">
          <Text className="mb-1 w-full text-center text-[7px] font-black uppercase tracking-widest text-faint">
            Last 5
          </Text>
          {stats.lastFive.length ? (
            <View
              accessible
              accessibilityLabel={`Last 5 matches, ${stats.lastFive.join(', ')}`}
              className="flex-row items-center"
              style={{ gap: 2 }}>
              {stats.lastFive.map((mark, index) => {
                const win = mark === 'W';
                return (
                  <FadeUp key={`${playId}-${mark}-${index}`} delay={index * motion.stagger}>
                    <View
                      accessibilityElementsHidden
                      className="h-2 w-2 items-center justify-center rounded-full"
                      style={{ backgroundColor: win ? brand.padel : LOSS_RED }}>
                      <View
                        className="rounded-full"
                        style={{
                          width: 3.5,
                          height: 3.5,
                          backgroundColor: win ? '#000' : '#fff',
                        }}
                      />
                    </View>
                  </FadeUp>
                );
              })}
            </View>
          ) : (
            <Text className="text-[7px] font-bold uppercase tracking-widest text-faint">
              None
            </Text>
          )}
        </View>
      </View>

      <View className="mt-3">
        <View className="mb-1.5 flex-row items-center justify-between">
          <Text className="text-[8px] font-black uppercase tracking-widest text-muted">
            Win Ratio
          </Text>
          <Text
            className="text-[8px] font-extrabold text-padel"
            style={{ fontVariant: ['tabular-nums'] }}>
            {ratio.shown.toFixed(1)}%
          </Text>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(ratioTarget) }}
          className="relative mt-1 h-2.5 w-full justify-center"
          onLayout={(event) => {
            trackW.value = event.nativeEvent.layout.width;
          }}>
          <View className="h-1.5 w-full rounded-full bg-white/5">
            <Animated.View className="h-full rounded-full bg-padel" style={fillStyle} />
          </View>
          <Animated.View
            accessibilityElementsHidden
            className="absolute items-center justify-center rounded-full border border-black bg-padel"
            style={[
              {
                width: KNOB,
                height: KNOB,
                top: -2,
              },
              knobStyle,
            ]}>
            <View className="h-1.5 w-1.5 rounded-full bg-black" />
          </Animated.View>
        </View>
      </View>
      </View>
    </MotionBorder>
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
        borderColor: temporary ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(10,10,10,0.7)',
        borderLeftWidth: 2,
        borderLeftColor: temporary ? '#3B82F6' : '#6B7280',
      }}>
      <Text
        className="self-start rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em]"
        style={{
          color: temporary ? '#60A5FA' : brand.faint,
          backgroundColor: temporary ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.05)',
        }}>
        {temporary ? 'Temporary License Active' : 'License Inactive'}
      </Text>
      {temporary && tempLicense?.event_name ? (
        <Text className="mt-3 text-[13px] font-bold uppercase text-premium">
          {tempLicense.event_name}
          {eventDate ? `  ${eventDate}` : ''}
        </Text>
      ) : (
        <Text className="mt-3 text-[10px] leading-5 text-muted">
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
      <Text className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-faint">
        {label}
      </Text>
    </View>
  );
}

function MiniStat({
  label,
  value,
  labelColor,
}: {
  label: string;
  value: string;
  labelColor?: string;
}) {
  return (
    <View className="min-h-[52px] flex-1 items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-1">
      <Text
        className="w-full text-center text-[7px] font-black uppercase tracking-widest"
        style={{ color: labelColor ?? brand.faint }}>
        {label}
      </Text>
      <Text
        className="mt-0.5 w-full text-center text-[15px] font-black text-premium"
        style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}
