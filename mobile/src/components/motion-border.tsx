import { Image } from 'expo-image';
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { brand } from '@/theme/tokens';

const GLOW = require('@/assets/images/motion-border-glow.png');
const CYCLE_MS = 6000;
const OUTER_R = 16;
const INNER_R = 15;

type Props = {
  children: ReactNode;
};

/**
 * Website Recent Results border: 1px frame, spinning conic lime behind an
 * opaque inner card. The PNG is a blurred wedge so the visible segment
 * feathers instead of clipping as a hard bar.
 */
export function MotionBorder({ children }: Props) {
  'use no memo';
  const reduced = useReducedMotion();
  const spin = useSharedValue(0);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (reduced) {
      cancelAnimation(spin);
      spin.value = 0;
      return;
    }
    spin.value = 0;
    spin.value = withRepeat(
      withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(spin);
  }, [reduced, spin]);

  const rotate = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const spinner = Math.max(box.w, box.h, 1) * 2;

  return (
    <View
      style={styles.frame}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox({ w: width, h: height });
      }}>
      {reduced || box.w < 2 ? null : (
        <Animated.View
          style={[
            styles.sweep,
            { pointerEvents: 'none' },
            {
              width: spinner,
              height: spinner,
              left: (box.w - spinner) / 2,
              top: (box.h - spinner) / 2,
            },
            rotate,
          ]}>
          <Image source={GLOW} contentFit="cover" style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: OUTER_R,
    padding: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  sweep: {
    position: 'absolute',
    opacity: 0.65,
  },
  inner: {
    borderRadius: INNER_R,
    backgroundColor: brand.elevated,
    overflow: 'hidden',
    zIndex: 1,
  },
});
