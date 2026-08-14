import { type ReactNode } from 'react';
import Animated, { Easing, FadeIn, FadeOut } from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { motion } from '@/theme/tokens';

type Props = {
  open: boolean;
  children: ReactNode;
};

/**
 * Mounts children when open and fades them in. No absolute overlay — that
 * previously sat on top of the screen and ate every tap.
 */
export function ExpandReveal({ open, children }: Props) {
  const reduced = useReducedMotion();
  if (!open) return null;

  return (
    <Animated.View
      entering={
        reduced
          ? FadeIn.duration(1)
          : FadeIn.duration(motion.duration.slow).easing(Easing.bezier(0.2, 0, 0, 1))
      }
      exiting={
        reduced
          ? FadeOut.duration(1)
          : FadeOut.duration(motion.duration.fast).easing(Easing.out(Easing.cubic))
      }>
      {children}
    </Animated.View>
  );
}
