import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { MenuButton } from '@/components/app-drawer';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { brand } from '@/theme/tokens';

type Props = {
  onSearch: () => void;
  onNotifications: () => void;
  noticeCount?: number;
};

/**
 * Home chrome on a solid page fill so icons stay readable. Safe-area padding
 * lives on the parent — this row is 52pt of tappable header only.
 */
export function HomeHeader({ onSearch, onNotifications, noticeCount = 0 }: Props) {
  const noticeLabel =
    noticeCount > 0
      ? `Notifications, ${noticeCount} waiting`
      : 'Notifications';

  return (
    <View
      className="flex-row items-center justify-between bg-page px-4"
      style={{ height: 52, zIndex: 30, elevation: 30 }}>
      <View className="flex-row items-center">
        <Image
          source={require('@/assets/images/4m-logo.png')}
          style={{ width: 48, height: 36 }}
          contentFit="contain"
          accessibilityLabel="4M Padel"
        />
        <Text
          accessibilityLabel="South Africa"
          className="ml-2 text-[15px] leading-[18px]">
          🇿🇦
        </Text>
      </View>

      <View className="flex-row items-center">
        <BellButton
          label={noticeLabel}
          onPress={onNotifications}
          ringing={noticeCount > 0}
        />
        <HeaderIcon name="magnifyingglass" label="Search" onPress={onSearch} />
        <MenuButton />
      </View>
    </View>
  );
}

function BellButton({
  label,
  onPress,
  ringing,
}: {
  label: string;
  onPress: () => void;
  ringing: boolean;
}) {
  const reduced = useReducedMotion();
  const rotate = useSharedValue(0);
  const ping = useSharedValue(0);

  useEffect(() => {
    if (!ringing || reduced) {
      cancelAnimation(rotate);
      cancelAnimation(ping);
      rotate.value = 0;
      ping.value = 0;
      return;
    }

    const swing = withSequence(
      withTiming(-14, { duration: 70, easing: Easing.inOut(Easing.quad) }),
      withTiming(12, { duration: 80 }),
      withTiming(-9, { duration: 70 }),
      withTiming(7, { duration: 70 }),
      withTiming(0, { duration: 90 })
    );
    rotate.value = withRepeat(
      withSequence(swing, withDelay(2800, withTiming(0, { duration: 1 }))),
      -1,
      false
    );
    ping.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 1 }),
        withDelay(1700, withTiming(0, { duration: 1 }))
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(rotate);
      cancelAnimation(ping);
    };
  }, [ping, reduced, ringing, rotate]);

  const bellStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));
  const pingStyle = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - ping.value),
    transform: [{ scale: 1 + ping.value * 1.6 }],
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center">
      <Animated.View style={bellStyle} collapsable={false}>
        <SymbolView name="bell" size={20} tintColor={brand.premium} />
      </Animated.View>
      {ringing ? (
        <>
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            style={[
              {
                position: 'absolute',
                top: 8,
                right: 8,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#EF4444',
              },
              pingStyle,
            ]}
          />
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: '#EF4444',
              borderWidth: 1.5,
              borderColor: brand.page,
            }}
          />
        </>
      ) : null}
    </Pressable>
  );
}

function HeaderIcon({
  name,
  label,
  onPress,
}: {
  name: 'magnifyingglass';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center">
      <SymbolView name={name} size={20} tintColor={brand.premium} />
    </Pressable>
  );
}
