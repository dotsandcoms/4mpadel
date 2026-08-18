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
import { brand } from '@/theme/tokens';

const HERO = require('@/assets/images/hero-bg.jpg');
const RULE_W = 72;
const REVEAL_MS = 1200;

/**
 * In-app launch screen.
 *
 * Native splash is a static near-black frame (storyboards cannot animate).
 * This overlay takes over on the first JS frame: full-bleed court, lime line
 * draws, wordmark lands, then we hand off. If session lookup is still in
 * flight the line pulses — it is the loading cue, not a spinner.
 *
 * Reveal is 1.2s. Reduce Motion skips scale and bloom, keeps a still.
 */
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const reduced = useReducedMotion();
  const ken = useSharedValue(0);
  const bloom = useSharedValue(reduced ? 0 : 0.08);
  const ruleDraw = useSharedValue(reduced ? 1 : 0);
  const rulePulse = useSharedValue(1);
  const four = useSharedValue(reduced ? 1 : 0);
  const padel = useSharedValue(reduced ? 1 : 0);
  const promise = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    const done = setTimeout(onFinish, reduced ? 400 : REVEAL_MS);

    if (reduced) return () => clearTimeout(done);

    ken.value = withTiming(1, { duration: 2800, easing: Easing.out(Easing.quad) });
    bloom.value = withRepeat(
      withTiming(0.16, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );

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
  }, [bloom, four, ken, onFinish, padel, promise, reduced, ruleDraw, rulePulse]);

  const photoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ken.value * 0.025 }],
  }));

  const bloomStyle = useAnimatedStyle(() => ({
    opacity: bloom.value,
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
      <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
        <Image
          source={HERO}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={{ top: '38%', left: '52%' }}
          accessible={false}
        />
      </Animated.View>

      <Animated.View style={[styles.bloom, bloomStyle]} />

      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <View style={styles.veilTop} />
        <View style={styles.veilMid} />
        <View style={styles.veilBottom} />
      </View>

      <View style={styles.mark} accessibilityLabel="4M Padel. Book. Play. Belong.">
        <View style={styles.cluster}>
          <View style={styles.halo} />
          <Animated.Text style={[styles.four, fourStyle]}>4M</Animated.Text>
          <Animated.Text style={[styles.padel, padelStyle]}>PADEL</Animated.Text>
          <Animated.View style={[styles.rule, ruleStyle]} />
          <Animated.Text style={[styles.promise, promiseStyle]}>Book. Play. Belong.</Animated.Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veilTop: {
    flex: 0.38,
    backgroundColor: 'rgba(10,10,10,0.18)',
  },
  veilMid: {
    flex: 0.36,
    backgroundColor: 'rgba(10,10,10,0.68)',
  },
  veilBottom: {
    flex: 0.26,
    backgroundColor: 'rgba(10,10,10,0.5)',
  },
  bloom: {
    position: 'absolute',
    top: '12%',
    right: '-8%',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  halo: {
    position: 'absolute',
    top: -48,
    bottom: -48,
    left: -64,
    right: -64,
    borderRadius: 160,
    backgroundColor: 'rgba(10,10,10,0.5)',
    boxShadow: '0px 0px 56px rgba(0, 0, 0, 0.95)',
  },
  mark: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
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
