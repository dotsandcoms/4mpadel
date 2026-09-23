import { type ReactNode, useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { hapticLight } from '@/lib/haptics';
import { lightBrand as brand, motion } from '@/theme/tokens';

type Badge = { label: string; count?: boolean; color?: string };

type Props = {
  title: string;
  titleCount?: number;
  countColor?: string;
  open: boolean;
  onToggle: () => void;
  badges?: Badge[];
  children: ReactNode;
};

/**
 * Website home accordion: uppercase label, count pills when collapsed,
 * chevron points trailing when closed and down when open.
 */
export function HomeAccordion({ title, titleCount, countColor, open, onToggle, badges, children }: Props) {
  const reduced = useReducedMotion();
  const rot = useSharedValue(open ? 0 : -90);

  useEffect(() => {
    rot.value = withTiming(open ? 0 : -90, {
      duration: reduced ? 1 : motion.duration.base,
      easing: Easing.bezier(0.2, 0, 0, 1),
    });
  }, [open, reduced, rot]);

  const chevron = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }));

  return (
    <View className="border-t border-court-edge py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={titleCount == null ? title : `${title} (${titleCount})`}
        onPress={() => {
          hapticLight();
          onToggle();
        }}
        className="min-h-11 flex-row items-center justify-between px-1">
        <Text className="text-[19px] font-bold tracking-tight text-court-ink">
          {title}
          {titleCount != null && <Text style={{ color: countColor }}> ({titleCount})</Text>}
        </Text>
        <View className="flex-row items-center">
          {!open && badges?.length
            ? badges.map((badge) => (
                <View
                  key={badge.label}
                  style={badge.color ? { borderColor: badge.color } : undefined}
                  className="ml-1.5 rounded-full border border-court-edge px-2 py-0.5">
                  <Text
                    className="text-[9px] font-bold uppercase tracking-wider text-court-muted"
                    style={[badge.count ? { fontVariant: ['tabular-nums'] } : undefined, badge.color ? { color: badge.color } : undefined]}>
                    {badge.label}
                  </Text>
                </View>
              ))
            : null}
          <Animated.View style={[{ marginLeft: 6 }, chevron]}>
            <SymbolView name="chevron.down" size={14} tintColor={brand.faint} />
          </Animated.View>
        </View>
      </Pressable>

      {open ? (
        <Animated.View
          entering={
            reduced
              ? FadeIn.duration(1)
              : FadeIn.duration(motion.duration.base).easing(Easing.out(Easing.cubic))
          }
          exiting={
            reduced
              ? FadeOut.duration(1)
              : FadeOut.duration(motion.duration.fast)
          }
          className="pt-3">
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}
