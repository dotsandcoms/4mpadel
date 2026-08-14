import { useEffect } from 'react';
import { type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { brand, motion } from '@/theme/tokens';

type Props = {
  width?: number;
  style?: ViewStyle;
  /** Draw the line once on mount, then settle. */
  draw?: boolean;
};

/**
 * The lime court-line. Splash draws it; onboarding and sign-in keep it
 * under the mark so the handoff reads as one sequence, not a new world.
 */
export function LimeRule({ width = 48, style, draw }: Props) {
  const reduced = useReducedMotion();
  const w = useSharedValue(draw && !reduced ? 0 : width);

  useEffect(() => {
    if (!draw || reduced) {
      w.value = width;
      return;
    }
    w.value = 0;
    w.value = withTiming(width, {
      duration: motion.duration.slow,
      easing: Easing.out(Easing.cubic),
    });
  }, [draw, reduced, w, width]);

  const anim = useAnimatedStyle(() => ({ width: w.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[
        {
          height: 3,
          borderRadius: 2,
          backgroundColor: brand.padel,
        },
        anim,
        style,
      ]}
    />
  );
}
