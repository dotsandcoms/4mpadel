import { SymbolView } from 'expo-symbols';
import { type ReactNode, useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { FadeUp } from '@/components/fade-up';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { brand, motion } from '@/theme/tokens';

/** Slim two-step track. Lime fills the completed portion; dots mark arrival. */
export function ProgressTrack({
  step,
  step1Done,
  step2Done,
  onPersonalPress,
}: {
  step: 1 | 2;
  step1Done: boolean;
  step2Done: boolean;
  onPersonalPress?: () => void;
}) {
  const reduced = useReducedMotion();
  const fill = useSharedValue(step === 1 ? (step1Done ? 0.5 : 0.12) : step2Done ? 1 : 0.55);

  useEffect(() => {
    const next = step === 1 ? (step1Done ? 0.5 : 0.12) : step2Done ? 1 : 0.55;
    fill.value = withTiming(next, {
      duration: reduced ? 1 : motion.duration.slow,
      easing: Easing.out(Easing.cubic),
    });
  }, [fill, reduced, step, step1Done, step2Done]);

  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 2, now: step }}>
      <View className="mb-2 flex-row justify-between">
        <Pressable
          onPress={step === 2 ? onPersonalPress : undefined}
          disabled={step !== 2}
          accessibilityRole={step === 2 ? 'button' : 'text'}
          accessibilityLabel="Personal details"
          accessibilityHint={step === 2 ? 'Returns to personal details' : undefined}
          hitSlop={{ top: 8, bottom: 10, left: 4, right: 8 }}
          className="min-h-6 justify-center">
          <Text
            className="text-[11px] font-bold"
            style={{ color: step === 1 || step1Done ? brand.padel : brand.faint }}>
            Personal details
          </Text>
        </Pressable>
        <Text
          className="text-[11px] font-bold"
          style={{ color: step === 2 ? brand.padel : brand.faint }}>
          Padel profile
        </Text>
      </View>
      <View className="h-[3px] flex-row items-center overflow-hidden rounded-full bg-edge">
        <Animated.View style={[{ height: 3, backgroundColor: brand.padel, borderRadius: 2 }, bar]} />
      </View>
      <View className="mt-[-7px] flex-row justify-between">
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: step1Done || step === 2 ? brand.padel : brand.premium,
          }}
        />
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: step2Done ? brand.padel : brand.edge,
            borderWidth: step2Done ? 0 : 1,
            borderColor: brand.placeholder,
          }}
        />
      </View>
    </View>
  );
}

export function VerifiedEmail({ email }: { email: string }) {
  return (
    <View
      className="mb-4 flex-row items-center rounded-[14px] px-3.5"
      style={{
        minHeight: 52,
        backgroundColor: 'rgba(204,255,0,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(204,255,0,0.28)',
      }}
      accessibilityLabel={`Verified account ${email}`}>
      <SymbolView
        name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }}
        size={18}
        tintColor={brand.padel}
        accessibilityElementsHidden
      />
      <View className="ml-3 flex-1">
        <Text className="text-[11px] font-bold uppercase" style={{ color: brand.padel, letterSpacing: 0.8 }}>
          Verified account
        </Text>
        <Text className="text-[15px] font-semibold text-premium" numberOfLines={1}>
          {email}
        </Text>
      </View>
    </View>
  );
}

export function SectionLabel({ children, first }: { children: string; first?: boolean }) {
  return (
    <Text
      className={`mb-2.5 text-[11px] font-bold uppercase ${first ? 'mt-1' : 'mt-5'}`}
      style={{ color: brand.faint, letterSpacing: 1.4 }}>
      {children}
    </Text>
  );
}

/** Faint court grid in the upper third; a profile-card ghost grows as they finish. */
export function CourtBackdrop({ completeness }: { completeness: number }) {
  const reduced = useReducedMotion();
  const card = useSharedValue(completeness);
  useEffect(() => {
    card.value = withTiming(completeness, { duration: reduced ? 1 : motion.duration.slow });
  }, [card, completeness, reduced]);
  const ghost = useAnimatedStyle(() => ({
    opacity: 0.04 + card.value * 0.1,
    transform: [{ scale: 0.96 + card.value * 0.04 }],
  }));

  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '38%', overflow: 'hidden' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <View
          key={`h${i}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: i * 22,
            height: 1,
            backgroundColor: 'rgba(204,255,0,0.045)',
          }}
        />
      ))}
      {Array.from({ length: 6 }).map((_, i) => (
        <View
          key={`v${i}`}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 18 + i * 62,
            width: 1,
            backgroundColor: 'rgba(204,255,0,0.04)',
          }}
        />
      ))}
      <Animated.View
        style={[
          ghost,
          {
            position: 'absolute',
            right: 28,
            top: 28,
            width: 118,
            height: 148,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: 'rgba(204,255,0,0.22)',
            backgroundColor: 'rgba(204,255,0,0.03)',
          },
        ]}
      />
    </View>
  );
}

export function PlayerSetupPreview({
  name,
  region,
  category,
  club,
}: {
  name: string;
  region: string;
  category: string;
  club: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <View
      className="mb-6 overflow-hidden rounded-[16px] px-4 py-3.5"
      style={{
        backgroundColor: brand.elevated,
        borderWidth: 1,
        borderColor: 'rgba(204,255,0,0.18)',
      }}
      accessibilityLabel="Player card preview">
      <View className="flex-row items-center">
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(204,255,0,0.12)' }}>
          <Text className="text-[15px] font-extrabold" style={{ color: brand.padel }}>
            {initials || '•'}
          </Text>
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-[16px] font-extrabold text-premium" numberOfLines={1}>
            {name || 'Your name'}
          </Text>
          <Text className="mt-0.5 text-[13px]" style={{ color: region ? brand.padel : brand.placeholder }}>
            {region || 'Region'}
          </Text>
        </View>
      </View>
      <View className="mt-3 flex-row" style={{ gap: 8 }}>
        <PreviewChip filled={!!category} label={category || 'Level'} />
        <PreviewChip filled={!!club} label={club || 'Club'} />
      </View>
    </View>
  );
}

function PreviewChip({ filled, label }: { filled: boolean; label: string }) {
  return (
    <View
      className="rounded-full px-2.5 py-1"
      style={{
        backgroundColor: filled ? 'rgba(204,255,0,0.12)' : brand.surface,
        borderWidth: 1,
        borderColor: filled ? 'rgba(204,255,0,0.35)' : brand.edge,
      }}>
      <Text
        className="text-[11px] font-semibold"
        style={{ color: filled ? brand.padel : brand.placeholder }}
        numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Thin lime court-line that travels while details save. */
export function CourtLine({
  tone = 'onLime',
  width = 72,
}: {
  tone?: 'onLime' | 'onDark';
  width?: number;
}) {
  const reduced = useReducedMotion();
  const x = useSharedValue(-40);
  useEffect(() => {
    if (reduced) return;
    x.value = withRepeat(withTiming(width + 48, { duration: 700, easing: Easing.linear }), -1, false);
  }, [reduced, width, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View
      accessibilityElementsHidden
      style={{
        width,
        height: 3,
        marginRight: tone === 'onLime' ? 10 : 0,
        overflow: 'hidden',
        borderRadius: 2,
        backgroundColor: tone === 'onDark' ? 'rgba(204,255,0,0.16)' : 'rgba(10,10,10,0.2)',
      }}>
      <Animated.View
        style={[
          {
            width: 28,
            height: 3,
            backgroundColor: tone === 'onDark' ? brand.padel : brand.page,
            borderRadius: 2,
          },
          style,
        ]}
      />
    </View>
  );
}

/** Held while a saved draft is loaded so empty fields never flash first. */
export function DraftRestore({ mode }: { mode: 'pending' | 'restoring' }) {
  const title = mode === 'restoring' ? 'Welcome back' : 'Your profile';
  const body =
    mode === 'restoring'
      ? 'Retrieving your saved details so you can finish your profile.'
      : 'Checking for details you saved earlier.';

  return (
    <View
      className="flex-1 items-center justify-center px-10"
      accessibilityRole="progressbar"
      accessibilityLabel={body}>
      <CourtLine tone="onDark" width={120} />
      <FadeUp>
        <Text
          accessibilityRole="header"
          className="mt-6 text-center font-extrabold text-premium"
          style={{ fontSize: 28, lineHeight: 33 }}>
          {title}
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          className="mt-3 text-center text-muted"
          style={{ fontSize: 16, lineHeight: 24 }}>
          {body}
        </Text>
      </FadeUp>
    </View>
  );
}

/**
 * Step change for the form body only. 12px lateral fade — not a full swipe.
 * First paint stays still so the screen does not slide in on arrival.
 */
export function StepSlide({
  step,
  animate,
  children,
}: {
  step: 1 | 2;
  animate: boolean;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const entering = useMemo(
    () => {
      if (!animate) return undefined;
      return () => {
        'worklet';
        const duration = motion.duration.enter;
        const easing = Easing.out(Easing.cubic);
        const from = step === 2 ? 12 : -12;
        if (reduced) {
          return {
            initialValues: { opacity: 0 },
            animations: { opacity: withTiming(1, { duration, easing }) },
          };
        }
        return {
          initialValues: { opacity: 0, transform: [{ translateX: from }] },
          animations: {
            opacity: withTiming(1, { duration, easing }),
            transform: [{ translateX: withTiming(0, { duration, easing }) }],
          },
        };
      };
    },
    [animate, reduced, step]
  );

  return (
    <Animated.View entering={entering}>
      {children}
    </Animated.View>
  );
}
