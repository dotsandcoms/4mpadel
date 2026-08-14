import { type ReactNode, useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { motion } from '@/theme/tokens';

type Props = {
  open: boolean;
  children: ReactNode;
};

const ease = Easing.bezier(0.2, 0, 0, 1);

/**
 * Height + fade reveal. Fields stay mounted (so iOS autofill still works)
 * and the space opens with the court-line easing instead of popping in.
 */
export function ExpandReveal({ open, children }: Props) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(open ? 1 : 0);
  const contentH = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: reduced ? 1 : motion.duration.slow,
      easing: ease,
    });
  }, [open, progress, reduced]);

  const clip = useAnimatedStyle(() => ({
    height: contentH.value * progress.value,
  }));

  const inner = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 10 }],
  }));

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[{ width: '100%', overflow: 'hidden' }, clip]}>
      <Animated.View
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, inner]}
        onLayout={(e) => {
          const next = e.nativeEvent.layout.height;
          if (next <= 0) return;
          const prev = contentH.value;
          if (Math.abs(prev - next) < 0.5) return;
          if (prev === 0 || !open || reduced) {
            contentH.value = next;
            return;
          }
          contentH.value = withTiming(next, {
            duration: motion.duration.base,
            easing: ease,
          });
        }}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}
