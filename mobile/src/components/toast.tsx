import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { brand, motion } from '@/theme/tokens';

export type ToastKind = 'error' | 'success';

type Props = {
  message: string | null;
  kind?: ToastKind;
  onDismiss: () => void;
};

const HOLD_MS: Record<ToastKind, number> = {
  error: 5200,
  success: 4000,
};

const easeOut = Easing.bezier(0, 0, 0, 1);

/**
 * Floating status chip. Field errors stay on the field; this repeats them
 * above the keyboard. Soft enter, shorter exit. Dismiss does not steal focus.
 */
export function Toast({ message, kind = 'error', onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const drain = useSharedValue(1);
  const error = kind === 'error';
  const accent = error ? brand.danger : brand.padel;

  useEffect(() => {
    if (!message) {
      cancelAnimation(drain);
      return;
    }
    drain.value = 1;
    if (!reduced) {
      drain.value = withTiming(0, {
        duration: HOLD_MS[kind],
        easing: Easing.linear,
      });
    }
    const id = setTimeout(onDismiss, HOLD_MS[kind]);
    return () => {
      clearTimeout(id);
      cancelAnimation(drain);
    };
  }, [drain, kind, message, onDismiss, reduced]);

  const bar = useAnimatedStyle(() => ({
    width: `${drain.value * 100}%`,
  }));

  if (!message) return null;

  const enter = reduced
    ? FadeIn.duration(motion.duration.fast)
    : FadeInDown.duration(motion.duration.enter).easing(easeOut);
  const exit = reduced
    ? FadeOut.duration(motion.duration.instant)
    : FadeOutUp.duration(motion.duration.fast).easing(easeOut);

  return (
    <Animated.View
      entering={enter}
      exiting={exit}
      accessibilityRole={error ? 'alert' : 'text'}
      accessibilityLiveRegion={error ? 'assertive' : 'polite'}
      style={{
        position: 'absolute',
        top: insets.top + 10,
        left: 16,
        right: 16,
        zIndex: 50,
        pointerEvents: 'box-none',
      }}>
      <View
        className="overflow-hidden rounded-[18px] bg-surface"
        style={{
          borderWidth: 1,
          borderColor: brand.edge,
          boxShadow: '0px 10px 24px rgba(0, 0, 0, 0.5)',
          elevation: 12,
        }}>
        <View className="flex-row items-center px-3.5 py-3">
          <View
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: error ? 'rgba(230,133,119,0.16)' : 'rgba(204,255,0,0.14)' }}>
            <SymbolView
              name={{
                ios: error ? 'exclamationmark.circle' : 'checkmark.circle',
                android: error ? 'error_outline' : 'check_circle',
                web: error ? 'error_outline' : 'check_circle',
              }}
              size={18}
              tintColor={accent}
              accessibilityElementsHidden
            />
          </View>

          <Text className="mx-3 flex-1 text-[14px] font-medium leading-5 text-premium">
            {message}
          </Text>

          <Pressable
            onPress={onDismiss}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            className="h-11 w-11 items-center justify-center">
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={12}
              tintColor={brand.faint}
            />
          </Pressable>
        </View>

        <View className="h-0.5 overflow-hidden" style={{ backgroundColor: brand.glass }}>
          <Animated.View
            style={[
              bar,
              {
                height: 2,
                backgroundColor: accent,
                opacity: 0.7,
              },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}
