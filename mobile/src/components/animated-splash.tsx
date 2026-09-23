import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { lightBrand as brand } from '@/theme/tokens';

const HERO = require('@/assets/images/hero-bg.jpg');
const RULE_W = 72;
const REVEAL_MS = 1200;

/**
 * In-app launch screen.
 *
 * Native splash is a static light frame (storyboards cannot animate).
 * This overlay takes over on the first JS frame: court photograph, lime line
 * draws, wordmark lands, then we hand off. If session lookup is still in
 * flight the line pulses — it is the loading cue, not a spinner.
 *
 * Reveal is 1.2s. Reduce Motion skips scale, keeps a still.
 */
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const reduced = useReducedMotion();
  const ken = useSharedValue(0);
  const ruleDraw = useSharedValue(reduced ? 1 : 0);
  const rulePulse = useSharedValue(1);
  const four = useSharedValue(reduced ? 1 : 0);
  const padel = useSharedValue(reduced ? 1 : 0);
  const promise = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    const done = setTimeout(onFinish, reduced ? 400 : REVEAL_MS);

    if (reduced) return () => clearTimeout(done);

    ken.value = withTiming(1, { duration: 2800, easing: Easing.out(Easing.quad) });
    ruleDraw.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    four.value = withDelay(180, withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }));
    padel.value = withDelay(360, withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }));
    promise.value = withDelay(
      540,
      withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) })
    );
    rulePulse.value = withDelay(
      REVEAL_MS,
      withRepeat(withTiming(0.45, { duration: 700 }), -1, true)
    );

    return () => clearTimeout(done);
  }, [four, ken, onFinish, padel, promise, reduced, ruleDraw, rulePulse]);

  const photoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ken.value * 0.025 }],
  }));

  const fourStyle = useAnimatedStyle(() => ({
    opacity: four.value,
    transform: reduced ? [] : [{ translateY: (1 - four.value) * 10 }],
  }));

  const padelStyle = useAnimatedStyle(() => ({
    opacity: padel.value,
    transform: reduced ? [] : [{ translateY: (1 - padel.value) * 8 }],
  }));

  const ruleStyle = useAnimatedStyle(() => ({
    width: ruleDraw.value * RULE_W,
    opacity: rulePulse.value,
  }));

  const promiseStyle = useAnimatedStyle(() => ({
    opacity: promise.value,
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: brand.page, pointerEvents: 'none' }]}
      exiting={reduced ? undefined : FadeOut.duration(280)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.photo, photoStyle]}>
        <Image
          source={HERO}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={{ top: '38%', left: '52%' }}
          accessible={false}
        />
      </Animated.View>

      <View style={styles.mark} accessibilityLabel="4M Padel. Play local. Follow the world.">
        <View style={styles.cluster}>
          <Animated.Text style={[styles.four, fourStyle]}>4M</Animated.Text>
          <Animated.Text style={[styles.padel, padelStyle]}>PADEL</Animated.Text>
          <Animated.View style={[styles.rule, ruleStyle]} />
          <Animated.Text style={[styles.promise, promiseStyle]}>Play local. Follow the world.</Animated.Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '56%',
    overflow: 'hidden',
  },
  mark: {
    position: 'absolute',
    top: '52%',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: brand.page,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 28,
  },
  cluster: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  four: {
    color: brand.premium,
    fontSize: 72,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 76,
  },
  padel: {
    color: brand.premium,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 8,
    marginTop: 2,
  },
  rule: {
    height: 3,
    borderRadius: 2,
    backgroundColor: brand.padel,
    marginTop: 20,
    alignSelf: 'center',
  },
  promise: {
    color: brand.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.4,
    marginTop: 18,
  },
});
