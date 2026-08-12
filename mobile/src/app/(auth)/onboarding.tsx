import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { markOnboardingSeen } from '@/lib/onboarding';
import { motion } from '@/theme/tokens';

const { width } = Dimensions.get('window');

/**
 * Three cards, written around what a player gets rather than how the platform
 * works. Kept to three deliberately — skip rates climb sharply past that.
 */
const SLIDES = [
  {
    eyebrow: 'Every event',
    title: 'One place for\nSouth African padel',
    body: 'Browse every sanctioned tournament and league, and enter without leaving the app.',
  },
  {
    eyebrow: 'Your partner',
    title: 'Enter together,\npay separately',
    body: 'Nominate your partner, split the entry fee, and see at a glance who still owes what.',
  },
  {
    eyebrow: 'Your game',
    title: 'Know exactly\nwhere you stand',
    body: 'National rankings and your full match history, updated after every result.',
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      if (next !== index) {
        setIndex(next);
        Haptics.selectionAsync();
      }
    },
    [index]
  );

  const finish = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await markOnboardingSeen();
    router.replace('/(auth)/sign-in');
  }, [router]);

  const advance = useCallback(() => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    } else {
      finish();
    }
  }, [index, finish]);

  const isLast = index === SLIDES.length - 1;

  return (
    <View className="flex-1 bg-page" style={{ paddingTop: insets.top }}>
      {/* Skip stays available on every slide — onboarding must never be a wall
          between a player and the app. */}
      <View className="h-14 flex-row items-center justify-between px-6">
        <Animated.View entering={FadeIn.duration(motion.duration.slow)}>
          <Image
            source={require('@/assets/images/4m-logo.png')}
            style={{ width: 62, height: 46 }}
            contentFit="contain"
          />
        </Animated.View>
        {!isLast ? (
          <Pressable
            onPress={finish}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Skip onboarding">
            <Text className="text-[15px] font-semibold text-muted">Skip</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        className="flex-1">
        {SLIDES.map((slide, i) => (
          <View key={slide.eyebrow} style={{ width }} className="flex-1 justify-center px-7">
            <Animated.View
              entering={FadeInDown.delay(i === 0 ? 120 : 0)
                .duration(motion.duration.slow)
                .easing(Easing.out(Easing.cubic))}>
              <Text
                className="mb-3 text-xs font-bold uppercase text-padel"
                style={{ letterSpacing: 2 }}>
                {slide.eyebrow}
              </Text>
              <Text
                className="mb-5 font-extrabold text-premium"
                style={{ fontSize: 36, lineHeight: 41 }}>
                {slide.title}
              </Text>
              <Text className="text-muted" style={{ fontSize: 17, lineHeight: 27, maxWidth: 320 }}>
                {slide.body}
              </Text>
            </Animated.View>
          </View>
        ))}
      </ScrollView>

      <View className="px-7" style={{ paddingBottom: insets.bottom + 24 }}>
        <View className="mb-7 flex-row" style={{ gap: 8 }}>
          {SLIDES.map((s, i) => (
            <Dot key={s.eyebrow} active={i === index} />
          ))}
        </View>

        <Pressable
          onPress={advance}
          accessibilityRole="button"
          className="h-14 items-center justify-center rounded-2xl bg-padel active:opacity-80">
          <Text className="text-base font-bold text-page">{isLast ? 'Get started' : 'Next'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Progress dot. Widens rather than only brightening, so position reads at a glance. */
function Dot({ active }: { active: boolean }) {
  const style = useAnimatedStyle(() => ({
    width: withTiming(active ? 26 : 8, { duration: motion.duration.base }),
    opacity: withTiming(active ? 1 : 0.3, { duration: motion.duration.base }),
  }));

  return <Animated.View style={style} className="h-2 rounded-full bg-padel" />;
}
