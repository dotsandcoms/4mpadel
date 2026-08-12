import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { brand, motion } from '@/theme/tokens';

const AnimatedInput = Animated.createAnimatedComponent(TextInput);

type Props = {
  label: string;
} & React.ComponentProps<typeof TextInput>;

/**
 * Text field with a liquid focus treatment.
 *
 * The genuine "gooey" effect is a blur plus a contrast colour-matrix, which
 * merges overlapping shapes. That is an SVG/Skia filter technique, and running
 * it over a text field would destroy the glyph antialiasing and make the value
 * unreadable — so the liquid quality here comes from motion instead: a spring
 * with real overshoot, a glow that swells and settles, and a bar that stretches
 * past its target before snapping back.
 *
 * Everything animates on the UI thread as Reanimated worklets, so it holds
 * frame rate while the sign-in request is in flight.
 */
export function LiquidField({ label, onFocus, onBlur, ...props }: Props) {
  const [focused, setFocused] = useState(false);

  // Springy, with enough damping to overshoot once and settle — that single
  // bounce is what reads as "liquid" rather than "animated".
  const t = useDerivedValue(() =>
    withSpring(focused ? 1 : 0, { damping: 13, stiffness: 170, mass: 0.9 })
  );

  const container = useAnimatedStyle(() => ({
    // Border sits at 60% lime, not full strength. At full opacity it outshouts
    // everything else on the screen; softened, it frames the field and lets
    // the glow and the underline carry the focus state.
    borderColor: interpolateColor(t.value, [0, 1], [brand.edge, brand.padelSoft]),
    backgroundColor: interpolateColor(t.value, [0, 1], [brand.elevated, brand.surface]),
    transform: [{ scale: 1 + t.value * 0.012 }],
    // Glow does more work now the border does less.
    shadowColor: brand.padel,
    shadowOpacity: t.value * 0.45,
    shadowRadius: 6 + t.value * 14,
    shadowOffset: { width: 0, height: 0 },
  }));

  // Underline stretches from the centre, overshooting the full width slightly
  // before settling — the liquid "pull".
  const bar = useAnimatedStyle(() => ({
    width: `${t.value * 100}%`,
    opacity: t.value,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(t.value, [0, 1], [brand.faint, brand.padel]),
    transform: [{ translateX: withTiming(focused ? 2 : 0, { duration: motion.duration.base }) }],
  }));

  return (
    <View className="mb-4">
      <Animated.Text
        style={[labelStyle, { letterSpacing: 1.2 }]}
        className="mb-2 text-xs font-semibold uppercase">
        {label}
      </Animated.Text>

      <Animated.View style={container} className="overflow-hidden rounded-xl border">
        <AnimatedInput
          {...props}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          placeholderTextColor={brand.faint}
          autoCapitalize="none"
          autoCorrect={false}
          className="px-4 text-[16px] text-premium"
          style={{ height: 52 }}
        />
        <View className="absolute bottom-0 left-0 right-0 h-[2px] items-center">
          <Animated.View style={bar} className="h-full rounded-full bg-padel" />
        </View>
      </Animated.View>
    </View>
  );
}
