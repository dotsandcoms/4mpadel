import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { FadeUp } from '@/components/fade-up';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useOnboardingEvents } from '@/lib/onboarding-events';
import { sapaLabel, lightSapaTone } from '@/theme/sapa';
import { lightBrand as brand, motion } from '@/theme/tokens';


/**
 * Believable product snapshots for onboarding. Decorative — the slide copy
 * already explains the value, so these stay out of the accessibility tree.
 */
const a11yHide = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
};

export function EventsPreview() {
  const { events, loading } = useOnboardingEvents();

  return (
    <View {...a11yHide} style={{ gap: 10 }}>
      {loading || !events ? (
        <>
          <EventCardSkeleton />
          <EventCardSkeleton />
        </>
      ) : (
        events.map((event, i) => (
          <FadeUp key={event.id} delay={i * motion.stagger * 2}>
            <EventCard
              date={event.date}
              place={event.place}
              location={event.location}
              sapaStatus={event.sapaStatus}
            />
          </FadeUp>
        ))
      )}
    </View>
  );
}

export function TournamentFollowPreview() {
  const reduced = useReducedMotion();
  const { events } = useOnboardingEvents();
  const event = events?.[0];
  const followed = useSharedValue(reduced ? 1 : 0);
  const alert = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      followed.value = 1;
      alert.value = 1;
      return;
    }
    followed.value = withDelay(550, withSpring(1, { damping: 13, stiffness: 190 }));
    alert.value = withDelay(1050, withTiming(1, { duration: 360 }));
    return () => {
      cancelAnimation(followed);
      cancelAnimation(alert);
    };
  }, [alert, followed, reduced]);

  const followStyle = useAnimatedStyle(() => ({
    opacity: followed.value,
    transform: [{ scale: 0.85 + followed.value * 0.15 }],
  }));
  const alertStyle = useAnimatedStyle(() => ({
    opacity: alert.value,
    transform: [{ translateY: (1 - alert.value) * 18 }],
  }));

  return (
    <View {...a11yHide} style={{ gap: 12 }}>
      <View style={{ padding: 18, borderRadius: 22, borderWidth: 1, borderColor: brand.edge, backgroundColor: brand.elevated, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 54, height: 62, borderRadius: 12, backgroundColor: brand.glass, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="calendar-outline" size={25} color={brand.accent} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: brand.premium, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>{event?.place || 'Your next tournament'}</Text>
            <Text style={{ color: brand.muted, fontSize: 12 }} numberOfLines={1}>{event ? `${event.date} · ${event.location}` : 'Follow for event updates'}</Text>
          </View>
        </View>
        <View style={{ height: 1, backgroundColor: brand.edge }} />
        <Animated.View style={[followStyle, { minHeight: 46, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderRadius: 12, backgroundColor: brand.padel }]}>
          <Ionicons name="notifications" size={19} color={brand.premium} />
          <Text style={{ color: brand.premium, fontSize: 14, fontWeight: '800' }}>Following tournament</Text>
        </Animated.View>
      </View>
      <Animated.View style={[alertStyle, { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: brand.edge, backgroundColor: brand.elevated }]}>
        <View style={{ width: 35, height: 35, borderRadius: 9, backgroundColor: brand.padel, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="notifications" size={18} color={brand.premium} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ color: brand.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.1 }}>4M PADEL · NOW</Text>
          <Text style={{ color: brand.premium, fontSize: 14, fontWeight: '800' }}>Draws are ready</Text>
          <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>{event ? `${event.place} has published its draw.` : 'Your tournament has published its draw.'}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

function EventCardSkeleton() {
  return (
    <View className="rounded-2xl border border-court-edge bg-court-elevated px-5 py-4">
      <View className="h-3 w-20 rounded bg-edge" />
      <View className="mt-2.5 h-4 w-3/4 rounded bg-edge" />
      <View className="mt-3 h-3.5 w-28 rounded bg-edge" />
    </View>
  );
}

function EventCard({
  date,
  place,
  location,
  sapaStatus,
}: {
  date: string;
  place: string;
  location: string;
  sapaStatus: string | null;
}) {
  const tone = lightSapaTone(sapaStatus);
  const label = sapaLabel(sapaStatus);

  return (
    <View className="overflow-hidden rounded-3xl border border-court-edge bg-court-elevated">
      <View className="px-5 py-4">
        <View className="flex-row items-center justify-between">
          <Text
            className="text-[11px] font-bold uppercase text-court-faint"
            style={{ letterSpacing: 1.4 }}>
            {date}
          </Text>
          {label ? (
            <View
              className="rounded-full px-2 py-0.5"
              style={{ backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.border }}>
              <Text
                className="text-[9px] font-extrabold uppercase"
                style={{ color: tone.text, letterSpacing: 1.2 }}>
                {label}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="mt-1.5 text-[16px] font-semibold text-court-ink" numberOfLines={1}>
          {place}
        </Text>
        {location ? (
          <Text className="mt-3 text-[14px] text-court-muted" numberOfLines={1}>
            {location}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function PartnerPreview() {
  const reduced = useReducedMotion();
  const checkScale = useSharedValue(0);

  useEffect(() => {
    checkScale.value = reduced
      ? 1
      : withDelay(600, withSpring(1, { damping: 10, stiffness: 220, mass: 0.7 }));
    return () => cancelAnimation(checkScale);
  }, [checkScale, reduced]);

  const checkStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : Math.min(1, checkScale.value),
    transform: [{ scale: reduced ? 1 : checkScale.value }],
  }));

  return (
    <View {...a11yHide}>
      <View className="overflow-hidden rounded-3xl border border-court-edge bg-court-elevated">
        <View className="px-5 py-5">
          <Text className="text-[16px] font-semibold text-court-ink">Cape Town Open</Text>
          <Text className="mt-1 text-[13px] text-court-muted">Men's Open</Text>

          <Text
            className="mb-2 mt-5 text-[11px] font-bold uppercase text-court-faint"
            style={{ letterSpacing: 1.4 }}>
            Add a partner
          </Text>
          <View className="flex-row items-center rounded-xl border border-padel bg-court-surface px-3 py-3">
            <View className="h-9 w-9 items-center justify-center rounded-full border border-court-edge bg-court-elevated">
            <Text className="text-[12px] font-bold text-court-ink">PN</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-[15px] font-semibold text-court-ink">Partner Name</Text>
              <Text className="mt-0.5 text-[12px] text-court-muted">Linked to your entry</Text>
            </View>
            <Animated.View style={checkStyle}>
              <SymbolView name="checkmark.circle.fill" size={22} tintColor={brand.accent} />
            </Animated.View>
          </View>
        </View>
      </View>
    </View>
  );
}

export function RankingPreview() {
  const reduced = useReducedMotion();
  const [points, setPoints] = useState(0);

  useEffect(() => {
    if (reduced) {
      setPoints(3606);
      return;
    }
    setPoints(0);
    let frame = 0;
    const delay = setTimeout(() => {
      let started: number | undefined;
      const tick = (now: number) => {
        started ??= now;
        const progress = Math.min((now - started) / 1200, 1);
        setPoints(Math.round(3606 * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, 500);
    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return (
    <View {...a11yHide}>
      <View className="overflow-hidden rounded-3xl border border-court-edge bg-court-elevated">
        <View className="flex-row items-stretch px-3.5 py-3.5">
          <View
            className="h-20 w-20 shrink-0 self-center overflow-hidden rounded-full bg-glass"
            style={{ borderWidth: 2, borderColor: brand.edge }}>
            <Image
              source={require('@/assets/images/hero-bg.jpg')}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              contentPosition={{ top: '42%', left: '48%' }}
            />
          </View>

          <View className="ml-4 min-w-0 flex-1 justify-start" style={{ gap: 6 }}>
            <View
              className="flex-row items-center self-start rounded-full px-2 py-0.5"
              style={{
                backgroundColor: 'rgba(204,255,0,0.10)',
                borderWidth: 1,
                borderColor: 'rgba(204,255,0,0.30)',
              }}>
              <LicenseDot />
              <Text
                allowFontScaling={false}
                className="ml-1.5 uppercase text-court-accent"
                style={{ fontSize: 8, fontWeight: '800', letterSpacing: 0.8 }}>
                SAPA Registered
              </Text>
            </View>

            <Text
              allowFontScaling={false}
              className="uppercase text-court-ink"
              numberOfLines={1}
              style={{ fontSize: 18, fontWeight: '800', letterSpacing: -0.4, lineHeight: 18 }}>
              Your Name
            </Text>

            <View className="flex-row items-stretch pt-0.5">
              <Stat value="#1" label="Rank" color={brand.premium} pad="start" hint="—" />
              <View className="w-px self-stretch bg-edge" style={{ marginVertical: 2 }} />
              <Stat value={(reduced ? 3606 : points).toLocaleString('en-US')} label="Points" color={brand.accent} pad="middle" />
              <View className="w-px self-stretch bg-edge" style={{ marginVertical: 2 }} />
              <Stat value="30-0" label="W-L" color={brand.premium} pad="end" />
            </View>
          </View>

        </View>
      </View>
    </View>
  );
}

function Stat({
  value,
  label,
  color,
  pad,
  hint,
}: {
  value: string;
  label: string;
  color: string;
  pad: 'start' | 'middle' | 'end';
  hint?: string;
}) {
  const padding =
    pad === 'start' ? { paddingRight: 12 } : pad === 'end' ? { paddingLeft: 12 } : { paddingHorizontal: 12 };

  return (
    <View className="min-w-0 flex-1" style={padding}>
      <Text
        allowFontScaling={false}
        style={{
          color,
          fontSize: 16,
          fontWeight: '800',
          lineHeight: 16,
          fontVariant: ['tabular-nums'],
        }}>
        {value}
      </Text>
      {hint ? (
        <Text
          allowFontScaling={false}
          className="text-court-faint"
          style={{ marginTop: 2, fontSize: 9, fontWeight: '800', lineHeight: 9 }}>
          {hint}
        </Text>
      ) : null}
      <Text
        allowFontScaling={false}
        className="uppercase text-court-faint"
        style={{ marginTop: 2, fontSize: 8, fontWeight: '800', letterSpacing: 1.6, lineHeight: 8 }}>
        {label}
      </Text>
    </View>
  );
}

function LicenseDot() {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withTiming(0.5, { duration: 2000 }), -1, true);
  }, [pulse, reduced]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[
        {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: brand.padel,
        },
        reduced ? null : style,
      ]}
    />
  );
}

/** Feature illustration; no invented scores or implied live coverage. */
export function WorldPadelPreview() {
  return (
    <View {...a11yHide} className="overflow-hidden rounded-3xl border border-court-edge bg-court-elevated">
      <View className="flex-row items-center border-b border-court-edge px-5 py-4" style={{ gap: 12 }}>
        <View className="h-11 w-11 items-center justify-center rounded-full bg-court-glass">
          <Ionicons name="globe-outline" size={28} color={brand.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text className="text-[17px] font-extrabold text-court-ink">World padel</Text>
          <Text className="mt-1 text-[12px] text-court-muted">From your court to the world tour</Text>
        </View>
      </View>
      <View className="px-5 py-4" style={{ gap: 18 }}>
        <FadeUp delay={180}>
          <WorldPreviewRow icon="people-outline" title="Your favourite players" detail="Profiles and world rankings" />
        </FadeUp>
        <FadeUp delay={320}>
          <WorldPreviewRow icon="trophy-outline" title="Tournaments worldwide" detail="Follow the tour, stop by stop" />
        </FadeUp>
        <FadeUp delay={460}>
          <WorldPreviewRow icon="tennisball-outline" title="Every match matters" detail="Schedules, scores and results" />
        </FadeUp>
      </View>
    </View>
  );
}

function WorldPreviewRow({ icon, title, detail }: {
  icon: 'people-outline' | 'trophy-outline' | 'tennisball-outline'; title: string; detail: string;
}) {
  return (
    <View className="flex-row items-center" style={{ gap: 12 }}>
      <Ionicons name={icon} size={20} color={brand.accent} />
      <View style={{ flex: 1 }}>
        <Text className="text-[14px] font-bold text-court-ink">{title}</Text>
        <Text className="mt-1 text-[12px] text-court-muted">{detail}</Text>
      </View>
    </View>
  );
}
