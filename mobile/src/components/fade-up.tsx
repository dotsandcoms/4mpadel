import { type ReactNode, useMemo } from 'react';
import Animated, { Easing, withDelay, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { motion } from '@/theme/tokens';

type Props = {
  children: ReactNode;
  delay?: number;
  className?: string;
};

/**
 * Cross-fade plus a short rise. Used for staged reveals (onboarding cards and
 * copy). Reduce Motion keeps the fade and drops the travel.
 */
export function FadeUp({ children, delay = 0, className }: Props) {
  const reduced = useReducedMotion();
  const duration = motion.duration.enter;
  const entering = useMemo(
    () => () => {
      'worklet';
      const easing = Easing.out(Easing.cubic);
      if (reduced) {
        return {
          initialValues: { opacity: 0 },
          animations: {
            opacity: withDelay(delay, withTiming(1, { duration, easing })),
          },
        };
      }
      return {
        initialValues: { opacity: 0, transform: [{ translateY: 12 }] },
        animations: {
          opacity: withDelay(delay, withTiming(1, { duration, easing })),
          transform: [
            { translateY: withDelay(delay, withTiming(0, { duration, easing })) },
          ],
        },
      };
    },
    [delay, duration, reduced]
  );

  return (
    <Animated.View entering={entering} className={className}>
      {children}
    </Animated.View>
  );
}
