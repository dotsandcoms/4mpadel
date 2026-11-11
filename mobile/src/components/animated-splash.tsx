import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { lightBrand as brand } from '@/theme/tokens';

const REVEAL_MS = 1200;

/**
 * In-app launch screen.
 *
 * Native splash is a static light frame (storyboards cannot animate).
 * This overlay takes over on the first JS frame. One short serve crosses a
 * small court beneath the wordmark. It settles rather than looping or implying
 * a percentage of network progress. Startup routing owns the actual handoff.
 *
 * Reveal is 1.2s. Reduce Motion skips movement and keeps a still.
 */
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const reduced = useReducedMotion();
  const serve = useSharedValue(reduced ? 1 : 0);
  const four = useSharedValue(reduced ? 1 : 0);
  const padel = useSharedValue(reduced ? 1 : 0);
  const promise = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    const done = setTimeout(onFinish, reduced ? 400 : REVEAL_MS);

    if (reduced) return () => clearTimeout(done);

    serve.value = withDelay(360, withTiming(1, { duration: 560, easing: Easing.inOut(Easing.cubic) }));
    four.value = withDelay(180, withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }));
    padel.value = withDelay(360, withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) }));
    promise.value = withDelay(
      540,
      withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) })
    );
    return () => clearTimeout(done);
  }, [four, onFinish, padel, promise, reduced, serve]);

  const fourStyle = useAnimatedStyle(() => ({
    opacity: four.value,
    transform: reduced ? [] : [{ translateY: (1 - four.value) * 10 }],
  }));

  const padelStyle = useAnimatedStyle(() => ({
    opacity: padel.value,
    transform: reduced ? [] : [{ translateY: (1 - padel.value) * 8 }],
  }));

  const serveStyle = useAnimatedStyle(() => ({
    opacity: reduced ? 1 : padel.value,
    transform: reduced ? [] : [
      { translateX: -20 + serve.value * 40 },
      { translateY: -Math.sin(serve.value * Math.PI) * 12 },
    ],
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
      <View style={styles.mark} accessibilityLabel="4M Padel. Play local. Follow the world.">
        <View style={styles.cluster}>
          <Animated.Text style={[styles.four, fourStyle]}>4M</Animated.Text>
          <Animated.Text style={[styles.padel, padelStyle]}>PADEL</Animated.Text>
          <View style={styles.court}>
            <View style={styles.net} />
            <View style={[styles.serviceLine, { left: 14 }]} />
            <View style={[styles.serviceLine, { right: 14 }]} />
            <View style={styles.centreLine} />
            <Animated.View style={[styles.ball, serveStyle]} />
          </View>
          <Animated.Text style={[styles.promise, promiseStyle]}>Play local. Follow the world.</Animated.Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  mark: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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
  court: {
    width: 64,
    height: 32,
    marginTop: 24,
    borderWidth: 1,
    borderRadius: 4,
    borderColor: '#C7D1C5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  net: {
    position: 'absolute',
    width: 1,
    height: 30,
    backgroundColor: '#A7B8A3',
  },
  serviceLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: brand.edge,
  },
  centreLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: brand.edge,
  },
  ball: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: brand.messagingAction,
  },
  promise: {
    color: brand.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 16,
  },
});
