import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EventsPreview,
  TournamentFollowPreview,
  WorldPadelPreview,
  PartnerPreview,
  RankingPreview,
} from '@/components/onboarding-previews';
import { PressableScale } from '@/components/pressable-scale';
import { ObserveReady } from '@/components/observe-ready';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { markOnboardingSeen } from '@/lib/onboarding';
import { lightBrand as brand, motion } from '@/theme/tokens';

type Slide = {
  eyebrow: string;
  title: string;
  body: string;
  preview: ReactNode;
};

const SLIDES: Slide[] = [
  {
    eyebrow: 'Ready to compete',
    title: 'Find your event.\nBring your game.',
    body: 'Explore South African tournaments and leagues, choose your competition and secure your place.',
    preview: <EventsPreview />,
  },
  {
    eyebrow: 'Your players. One community.',
    title: 'Local heroes.\nGlobal stars.',
    body: 'Follow local 4M players and international pros. Discover tournaments, rankings and results in one place.',
    preview: <WorldPadelPreview />,
  },
  {
    eyebrow: 'Never miss a moment',
    title: 'Follow the action.\nStay in the know.',
    body: 'Follow a tournament for live push alerts when registration opens, draws are published and match or event details change.',
    preview: <TournamentFollowPreview />,
  },
  {
    eyebrow: 'Play together',
    title: 'Enter with\nyour partner.',
    body: 'Add your partner and lock in the team on one entry.',
    preview: <PartnerPreview />,
  },
  {
    eyebrow: 'Your padel journey',
    title: 'Every match is part\nof your story.',
    body: 'Keep your results, match history and national ranking together in one place.',
    preview: <RankingPreview />,
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;

  const direction = useSharedValue(1);
  const transitionUntil = useRef(0);
  const leaving = useRef(false);
  const goTo = useCallback((next: number) => {
    if (next < 0 || next >= SLIDES.length || next === indexRef.current || Date.now() < transitionUntil.current) return;
    direction.value = next > indexRef.current ? 1 : -1;
    transitionUntil.current = Date.now() + (reduced ? 0 : 650);
    indexRef.current = next;
    setIndex(next);
    hapticLight();
  }, [direction, reduced]);
  const step = useCallback((dir: 1 | -1) => goTo(indexRef.current + dir), [goTo]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-20, 20])
        .onEnd((e) => {
          if ((e.translationX < -48 || e.velocityX < -500)) runOnJS(step)(1);
          else if ((e.translationX > 48 || e.velocityX > 500)) runOnJS(step)(-1);
        }),
    [step]
  );

  const leave = useCallback(
    async (intent: 'signin' | 'signup') => {
      if (leaving.current) return;
      leaving.current = true;
      hapticMedium();
      await markOnboardingSeen();
      router.replace(
        intent === 'signup' ? '/(auth)/sign-in?intent=signup' : '/(auth)/sign-in'
      );
    },
    [router]
  );

  const advance = useCallback(() => {
    if (Date.now() < transitionUntil.current) return;
    if (index < SLIDES.length - 1) step(1);
    else leave('signup');
  }, [index, step, leave]);

  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  return (
    <GestureHandlerRootView
      className="flex-1 bg-court-page"
      style={{ flex: 1, backgroundColor: brand.page, paddingTop: insets.top }}>
      <ObserveReady />
      <View className="h-20 flex-row items-center justify-between px-7">
        <View className="items-start self-start py-2" style={{ flex: 1 }}>
          <Image
            source={require('@/assets/images/4m-logo.png')}
            style={{ width: 68, height: 51 }}
            tintColor={brand.premium}
            contentFit="contain"
            accessibilityLabel="4M Padel"
          />
        </View>
        {!isLast ? (
          <Pressable
            onPress={() => leave('signin')}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            className="min-h-11 justify-center">
            <Text className="text-[15px] font-semibold text-court-muted">Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <GestureDetector gesture={pan}>
        <View
          className="flex-1"
          style={{ overflow: 'hidden' }}
          accessibilityRole="adjustable"
          accessibilityLabel={`Onboarding, slide ${index + 1} of ${SLIDES.length}`}
          accessibilityValue={{ min: 1, max: SLIDES.length, now: index + 1 }}
          accessibilityActions={[
            { name: 'increment', label: 'Next slide' },
            { name: 'decrement', label: 'Previous slide' },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'increment') step(1);
            if (e.nativeEvent.actionName === 'decrement') step(-1);
          }}>
          <View className="flex-1 justify-center px-7">
            <OnboardingMotion key={`preview-${index}`} direction={direction} reduced={reduced} illustration>{slide.preview}</OnboardingMotion>
          </View>
          <View className="px-7 pb-2" style={{ minHeight: 222 }}>
            <OnboardingMotion key={`eyebrow-${index}`} direction={direction} reduced={reduced} delay={80}>
              <Text className="mb-3 text-xs font-bold uppercase text-court-accent" style={{ letterSpacing: 2 }}>{slide.eyebrow}</Text>
            </OnboardingMotion>
            <OnboardingMotion key={`title-${index}`} direction={direction} reduced={reduced} delay={130}>
              <Text accessibilityRole="header" className="mb-4 font-extrabold text-court-ink" style={{ fontSize: 34, lineHeight: 39 }}>{slide.title}</Text>
            </OnboardingMotion>
            <OnboardingMotion key={`body-${index}`} direction={direction} reduced={reduced} delay={180}>
              <Text className="text-court-muted" style={{ fontSize: 17, lineHeight: 26, maxWidth: 340 }}>{slide.body}</Text>
            </OnboardingMotion>
          </View>
        </View>
      </GestureDetector>

      <View className="px-7" style={{ paddingBottom: insets.bottom + 20 }}>
        <View
          accessible
          accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}
          accessibilityLiveRegion="polite"
          className="mb-6 mt-6 flex-row items-center"
          style={{ gap: 8 }}>
          {SLIDES.map((s, i) => (
            <Dot
              key={s.eyebrow}
              active={i === index}
              reduced={reduced}
              onPress={() => goTo(i)}
              label={`Go to slide ${i + 1} of ${SLIDES.length}`}
            />
          ))}
        </View>

        <PressableScale
          onPress={advance}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Build my player profile' : 'Next'}
          className="h-14 items-center justify-center rounded-2xl bg-padel">
          <Text className="text-base font-bold text-court-ink">
            {isLast ? 'Build my player profile' : 'Next'}
          </Text>
        </PressableScale>

        {isLast ? (
          <Pressable
            onPress={() => leave('signin')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            className="mt-4 min-h-11 items-center justify-center">
            <Text className="text-[14px] text-court-muted">
              Already have an account?{' '}
              <Text className="font-semibold text-court-accent">Sign in</Text>
            </Text>
          </Pressable>
        ) : (
          <View className="mt-4 h-11" />
        )}
      </View>
    </GestureHandlerRootView>
  );
}

function Dot({
  active,
  reduced,
  onPress,
  label,
}: {
  active: boolean;
  reduced: boolean;
  onPress: () => void;
  label: string;
}) {
  const style = useAnimatedStyle(() => ({
    width: reduced
      ? active
        ? 26
        : 8
      : withTiming(active ? 26 : 8, { duration: motion.duration.base }),
    opacity: reduced
      ? active
        ? 1
        : 0.3
      : withTiming(active ? 1 : 0.3, { duration: motion.duration.base }),
  }));

  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      className="justify-center py-2">
      <Animated.View style={[style, { height: 8, borderRadius: 4, backgroundColor: brand.accent }]} />
    </Pressable>
  );
}

/** Separate layers keep artwork and copy moving together without replacing the whole screen. */
function OnboardingMotion({ children, direction, reduced, delay = 0, illustration = false }: {
  children: ReactNode; direction: SharedValue<number>; reduced: boolean; delay?: number; illustration?: boolean;
}) {
  const { width } = useWindowDimensions();
  const entering = useMemo(() => () => {
    'worklet';
    const distance = reduced ? 0 : width * (illustration ? 0.8 : 0.22) * direction.value;
    return {
      initialValues: { opacity: reduced ? 1 : 0, transform: [{ translateX: distance }] },
      animations: {
        opacity: withDelay(reduced ? 0 : delay, withTiming(1, { duration: reduced ? 0 : 300 })),
        transform: [{ translateX: withDelay(reduced ? 0 : delay, withTiming(0, { duration: reduced ? 0 : 460, easing: Easing.out(Easing.cubic) })) }],
      },
    };
  }, [width, illustration, direction, reduced, delay]);
  const exiting = useMemo(() => () => {
    'worklet';
    return {
      initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
      animations: {
        opacity: withTiming(0, { duration: reduced ? 0 : 160 }),
        transform: [{ translateX: withTiming(reduced ? 0 : -direction.value * width * (illustration ? 0.45 : 0.12), { duration: reduced ? 0 : 240, easing: Easing.in(Easing.cubic) }) }],
      },
    };
  }, [width, illustration, direction, reduced]);
  return <Animated.View entering={entering} exiting={exiting}>{children}</Animated.View>;
}
