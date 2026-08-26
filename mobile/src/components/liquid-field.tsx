import { SymbolView } from 'expo-symbols';
import { forwardRef, type ReactNode, useEffect, useId, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { brand, motion, padelGlow } from '@/theme/tokens';

export type FieldIcon =
  | 'envelope.fill'
  | 'lock.fill'
  | 'person.fill'
  | 'phone.fill';

type Props = {
  label: string;
  icon?: FieldIcon;
  error?: string;
  hint?: string;
  invalid?: boolean;
  valid?: boolean;
  compact?: boolean;
  labelAccessory?: ReactNode;
} & React.ComponentProps<typeof TextInput>;

const ANDROID_ICON: Record<FieldIcon, string> = {
  'envelope.fill': 'mail',
  'lock.fill': 'lock',
  'person.fill': 'person',
  'phone.fill': 'phone',
};

/**
 * Auth field. Persistent label above the input. Lime 2px ring + restrained
 * glow on focus; 2px danger ring + text after blur/submit. Valid fields
 * cross-fade a lime check. Never colour alone.
 */
export const LiquidField = forwardRef<TextInput, Props>(function LiquidField(
  {
    label,
    icon,
    error,
    hint,
    invalid,
    valid,
    compact = false,
    labelAccessory,
    onFocus,
    onBlur,
    secureTextEntry,
    placeholder,
    autoCapitalize,
    autoCorrect,
    spellCheck,
    multiline,
    ...props
  },
  ref
) {
  const reduced = useReducedMotion();
  const uid = useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secureTextEntry);
  const [heldError, setHeldError] = useState(error);

  const ms = reduced ? 1 : motion.duration.base;
  const focusT = useSharedValue(0);
  const errorT = useSharedValue(0);
  const limeT = useSharedValue(0);
  const checkT = useSharedValue(0);

  useEffect(() => {
    if (error) setHeldError(error);
  }, [error]);

  useEffect(() => {
    focusT.value = withTiming(focused ? 1 : 0, { duration: ms });
  }, [focusT, focused, ms]);

  useEffect(() => {
    errorT.value = withTiming(invalid ? 1 : 0, { duration: ms });
  }, [errorT, invalid, ms]);

  useEffect(() => {
    const lime = !invalid && (focused || !!valid);
    limeT.value = withTiming(lime ? 1 : 0, { duration: ms });
    checkT.value = withTiming(valid && !invalid ? 1 : 0, {
      duration: reduced ? 1 : 300,
    });
  }, [checkT, focused, invalid, limeT, ms, reduced, valid]);

  const container = useAnimatedStyle(() => {
    const rest = interpolateColor(limeT.value, [0, 1], [brand.edge, brand.padel]);
    const active = interpolateColor(focusT.value, [0, 1], [rest, brand.padel]);
    const glow = (1 - errorT.value) * Math.max(focusT.value, limeT.value);
    return {
      borderColor: interpolateColor(errorT.value, [0, 1], [active, brand.danger]),
      boxShadow: padelGlow(0, 10, reduced ? 0 : glow * 0.32),
      elevation: reduced ? 0 : glow * 6,
    };
  });

  const mutedIcon = useAnimatedStyle(() => ({
    opacity: 1 - limeT.value,
  }));
  const limeIcon = useAnimatedStyle(() => ({
    opacity: limeT.value,
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkT.value,
    transform: [{ scale: 0.25 + checkT.value * 0.75 }],
    filter: [{ blur: 4 * (1 - checkT.value) }],
  }));
  const errorStyle = useAnimatedStyle(() => ({
    opacity: errorT.value,
    maxHeight: errorT.value * 32,
    marginTop: errorT.value * 8,
  }));

  const describedBy = [invalid && heldError ? errorId : null, !invalid && hint ? hintId : null]
    .filter(Boolean)
    .join(' ');

  function focusInput() {
    if (ref && typeof ref !== 'function') ref.current?.focus();
  }

  const symbol = icon
    ? {
        ios: icon,
        android: ANDROID_ICON[icon],
        web: ANDROID_ICON[icon],
      }
    : null;

  return (
    <View className="mb-3">
      <View
        className={`mb-1.5 flex-row items-center justify-between ${labelAccessory ? 'min-h-[44px]' : ''}`}>
        <Pressable
          onPress={focusInput}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          accessible={false}
          className="justify-center pr-3">
          <Text
            nativeID={labelId}
            className={`${compact ? 'text-[11px] font-bold uppercase tracking-wider' : 'text-[14px] font-semibold'}`}
            style={{ color: brand.label }}>
            {label}
          </Text>
        </Pressable>
        {labelAccessory}
      </View>

      <Animated.View
        style={[
          container,
          {
            borderWidth: 2,
          },
        ]}
        className={`flex-row items-center rounded-[14px] bg-elevated px-3.5 ${multiline ? 'min-h-[120px] items-start py-3' : 'h-[52px]'}`}>
        {symbol ? (
          <View style={{ width: 18, height: 18 }}>
            <Animated.View style={[{ position: 'absolute', width: 18, height: 18 }, mutedIcon]}>
              <SymbolView name={symbol} size={18} tintColor={brand.placeholder} accessibilityElementsHidden />
            </Animated.View>
            <Animated.View style={[{ position: 'absolute', width: 18, height: 18 }, limeIcon]}>
              <SymbolView name={symbol} size={18} tintColor={brand.padel} accessibilityElementsHidden />
            </Animated.View>
          </View>
        ) : null}
        <TextInput
          {...props}
          ref={ref}
          secureTextEntry={secureTextEntry ? hidden : false}
          placeholder={placeholder}
          placeholderTextColor={brand.placeholder}
          accessibilityLabel={label}
          accessibilityLabelledBy={labelId}
          accessibilityState={{ invalid: !!invalid }}
          aria-invalid={!!invalid}
          accessibilityDescribedBy={describedBy || undefined}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          autoCapitalize={autoCapitalize ?? 'none'}
          autoCorrect={autoCorrect ?? false}
          spellCheck={spellCheck ?? false}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          importantForAutofill="yes"
          cursorColor={brand.padel}
          selectionColor="rgba(204,255,0,0.35)"
          keyboardAppearance="dark"
          className="flex-1"
          style={{
            color: brand.premium,
            fontSize: compact ? 13 : 16,
            fontWeight: compact ? '600' : '400',
            marginLeft: icon ? 10 : 0,
            minHeight: multiline ? 96 : 52,
            height: multiline ? undefined : 52,
          }}
        />
        {valid !== undefined ? (
          <Animated.View
            style={[checkStyle, { width: 22, alignItems: 'center', pointerEvents: 'none' }]}>
            <SymbolView
              name={{ ios: 'checkmark', android: 'check', web: 'check' }}
              size={16}
              tintColor={brand.padel}
              accessibilityElementsHidden
            />
          </Animated.View>
        ) : null}
        {secureTextEntry ? (
          <Pressable
            onPress={() => setHidden((v) => !v)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            className="h-11 w-11 items-center justify-center">
            <SymbolView
              name={{
                ios: hidden ? 'eye' : 'eye.slash',
                android: hidden ? 'visibility' : 'visibility_off',
                web: hidden ? 'visibility' : 'visibility_off',
              }}
              size={18}
              tintColor={brand.placeholder}
            />
          </Pressable>
        ) : null}
      </Animated.View>

      <Animated.View style={[errorStyle, { pointerEvents: 'none' }]}>
        <Text
          nativeID={invalid ? errorId : undefined}
          accessibilityLiveRegion="polite"
          accessibilityElementsHidden={!invalid}
          className={`px-1 leading-5 text-danger ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
          {heldError}
        </Text>
      </Animated.View>
      {!invalid && hint ? (
        <Text nativeID={hintId} className={`mt-2 px-1 leading-5 ${compact ? 'text-[11px]' : 'text-[13px]'}`} style={{ color: brand.label }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
