import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeUp } from '@/components/fade-up';
import { LimeRule } from '@/components/lime-rule';
import {
  EventsPreview,
  PartnerPreview,
  RankingPreview,
} from '@/components/onboarding-previews';
import { PressableScale } from '@/components/pressable-scale';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { markOnboardingSeen } from '@/lib/onboarding';
import { brand, motion } from '@/theme/tokens';

type Slide = {
  eyebrow: string;
  title: string;
  body: string;
  preview: ReactNode;
};

const SLIDES: Slide[] = [
  {
    eyebrow: 'Find your next event',
    title: 'South African padel,\nin one place.',
    body: 'Browse sanctioned tournaments and leagues, then enter without leaving the app.',
    preview: <EventsPreview />,
  },
  {
    eyebrow: 'Play together',
    title: 'Enter with\nyour partner.',
    body: 'Add your partner and lock in the team on one entry.',
    preview: <PartnerPreview />,
  },
  {
    eyebrow: 'Your game',
    title: 'Know exactly\nwhere you stand.',
    body: 'Follow your national ranking and match history, updated after every result.',
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

  const step = useCallback((dir: 1 | -1) => {
    const next = indexRef.current + dir;
    if (next < 0 || next >= SLIDES.length) return;
    setIndex(next);
    hapticLight();
  }, []);

  const goTo = useCallback((next: number) => {
    if (next === indexRef.current) return;
    setIndex(next);
    hapticLight();
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-24, 24])
        .failOffsetY([-20, 20])
        .onEnd((e) => {
          if (e.translationX < -48) runOnJS(step)(1);
          else if (e.translationX > 48) runOnJS(step)(-1);
        }),
    [step]
  );

  const leave = useCallback(
    async (intent: 'signin' | 'signup') => {
      hapticMedium();
      await markOnboardingSeen();
      router.replace(
        intent === 'signup' ? '/(auth)/sign-in?intent=signup' : '/(auth)/sign-in'
      );
    },
    [router]
  );

  const advance = useCallback(() => {
    if (index < SLIDES.length - 1) step(1);
    else leave('signup');
  }, [index, step, leave]);

  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  return (
    <GestureHandlerRootView
      className="flex-1 bg-page"
      style={{ flex: 1, backgroundColor: brand.page, paddingTop: insets.top }}>
      <View className="h-14 flex-row items-center justify-between px-7">
        <View className="items-start">
          <Image
            source={require('@/assets/images/4m-logo.png')}
            style={{ width: 62, height: 46 }}
            contentFit="contain"
            accessibilityLabel="4M Padel"
          />
          <LimeRule width={36} style={{ marginTop: 8 }} />
        </View>
        {!isLast ? (
          <Pressable
            onPress={() => leave('signin')}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding"
            className="min-h-11 justify-center">
            <Text className="text-[15px] font-semibold text-muted">Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <GestureDetector gesture={pan}>
        <View
          className="flex-1"
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
            <FadeUp key={`preview-${index}`}>{slide.preview}</FadeUp>
          </View>
          <View className="px-7 pb-2">
            <FadeUp key={`copy-${index}`} delay={80}>
              <Text
                className="mb-3 text-xs font-bold uppercase text-padel"
                style={{ letterSpacing: 2 }}>
                {slide.eyebrow}
              </Text>
              <Text
                accessibilityRole="header"
                className="mb-4 font-extrabold text-premium"
                style={{ fontSize: 34, lineHeight: 39 }}>
                {slide.title}
              </Text>
              <Text className="text-muted" style={{ fontSize: 17, lineHeight: 26, maxWidth: 320 }}>
                {slide.body}
              </Text>
            </FadeUp>
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
          <Text className="text-base font-bold text-page">
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
            <Text className="text-[14px] text-muted">
              Already have an account?{' '}
              <Text className="font-semibold text-padel">Sign in</Text>
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
      <Animated.View style={style} className="h-2 rounded-full bg-padel" />
    </Pressable>
  );
}
