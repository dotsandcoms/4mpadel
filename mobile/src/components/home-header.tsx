import { useHelpInbox } from '@/components/help-inbox-provider';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { useNotificationUnread } from '@/hooks/use-notification-unread';
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

import { useDrawerOptional } from '@/components/app-drawer';
import { HomeAction } from '@/components/home-action';
import { PlayerFollowerCount } from '@/components/players/player-follower-count';
import { TourTarget } from '@/components/guided-tour';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useScreenActive } from '@/hooks/use-screen-active';
import { hapticLight } from '@/lib/haptics';
import { lightBrand as brand } from '@/theme/tokens';

type Props = {
  onSearch: () => void;
  onNotifications: () => void;
  followers?: { playerId: string; onPress: () => void };
  transparent?: boolean;
};

export function HomeHeader({ onSearch, onNotifications, followers, transparent }: Props) {
  const drawer = useDrawerOptional();
  const help = useHelpInbox();
  const { owner } = useMessagingInbox();
  const noticeCount = useNotificationUnread(owner) + help.unread;
  const noticeLabel =
    noticeCount > 0
      ? `Notifications, ${noticeCount} waiting`
      : 'Notifications';

  return (
    <View
      className="flex-row items-center justify-between px-4"
      style={{ height: 52, zIndex: 30, elevation: 30, backgroundColor: transparent ? 'transparent' : brand.page }}>
      <View className="flex-row items-center">
        <Image
          source={require('@/assets/images/4m-logo.png')}
          style={{ width: 48, height: 36 }}
          tintColor={brand.premium}
          contentFit="contain"
          accessibilityLabel="4M Padel"
        />
      </View>

      <View className="flex-row items-center">
        <TourTarget id="header.notifications" onActivate={onNotifications}>
          <HomeAction label={noticeLabel} icon="bell" kind="icon" onPress={onNotifications} />
          {noticeCount > 0 && <View pointerEvents="none" style={{ position: 'absolute', top: 8, right: 8, minWidth: 18, height: 18, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#B7352D' }}><Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '600' }}>{noticeCount > 99 ? '99+' : noticeCount}</Text></View>}
        </TourTarget>
        {followers && <PlayerFollowerCount header playerId={followers.playerId} onPress={followers.onPress} />}
        <TourTarget id="header.search" onActivate={onSearch}><HomeAction label="Search" icon="search" kind="icon" onPress={onSearch} /></TourTarget>
        {drawer && <TourTarget id="header.menu" onActivate={drawer.openDrawer}><HomeAction label="Menu" icon="menu" kind="icon" onPress={drawer.openDrawer} /></TourTarget>}
      </View>
    </View>
  );
}

export function NotificationBell({
  label,
  onPress,
  ringing,
}: {
  label: string;
  onPress: () => void;
  ringing: boolean;
}) {
  const reduced = useReducedMotion();
  const active = useScreenActive();
  const rotate = useSharedValue(0);
  const ping = useSharedValue(0);

  useEffect(() => {
    if (!ringing || reduced || !active) {
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
  }, [ping, reduced, ringing, rotate, active]);

  const bellStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));
  const pingStyle = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - ping.value),
    transform: [{ scale: 1 + ping.value * 1.6 }],
  }));

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center">
      <Animated.View style={bellStyle} collapsable={false}>
        <SymbolView name={{ ios: 'bell', android: 'notifications', web: 'notifications' }} size={20} tintColor={brand.premium} />
      </Animated.View>
      {ringing ? (
        <>
          <Animated.View
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
                pointerEvents: 'none',
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
      onPress={() => {
        hapticLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center">
      <SymbolView name={{ ios: name, android: 'search', web: 'search' }} size={20} tintColor={brand.premium} />
    </Pressable>
  );
}
