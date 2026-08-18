import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { hapticLight } from '@/lib/haptics';
import { motion } from '@/theme/tokens';

type Props = PressableProps & {
  children: React.ReactNode;
};

/**
 * Primary-control press. Scales to 0.96 — anything smaller reads as a squash.
 * Reduce Motion skips the scale; colour and haptics remain the static cue.
 */
export function PressableScale({ children, onPressIn, onPressOut, ...props }: Props) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animated}>
      <Pressable
        {...props}
        onPressIn={(e) => {
          if (!props.disabled) hapticLight();
          if (!reduced) scale.value = withTiming(0.96, { duration: motion.duration.instant });
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withTiming(1, { duration: motion.duration.fast });
          onPressOut?.(e);
        }}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
