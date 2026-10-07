import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { AppDrawer } from '@/components/app-drawer';
import { hapticMedium } from '@/lib/haptics';
import { lightBrand as brand } from '@/theme/tokens';

/**
 * The tab bar is rendered by the OS, not by us — Liquid Glass on iOS 26,
 * Material 3 on Android. Icons use SF Symbols on iOS and Material Symbols on
 * Android; drawable names only work for resources bundled into the app.
 *
 * Two constraints to remember before adding anything here:
 *   1. Android caps the bar at five tabs. Four are visible for launch.
 *   2. Tabs cannot be added or removed at runtime.
 *
 * NativeTabs is still an alpha API. Keeping it wrapped in this one file means
 * a breaking change upstream is a single-file fix.
 */
export default function TabsLayout() {
  return (
    <AppDrawer>
      <NativeTabs
        // Native system navigation, with explicit legible V2 colors.
        backgroundColor={Platform.OS === 'android' ? 'rgba(255,255,255,0.96)' : brand.elevated}
        iconColor={{ default: brand.muted, selected: brand.accent }}
        tintColor={brand.accent}
        indicatorColor={brand.panel}
        labelVisibilityMode="labeled"
        minimizeBehavior="onScrollDown"
        labelStyle={{ default: { color: brand.muted }, selected: { color: brand.accent } }}
        screenListeners={{
          tabPress: () => {
            hapticMedium();
          },
        }}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger
          name="(calendar)"
          listeners={({ navigation }) => ({
            blur: () => {
              const calendarStack = navigation.getState()?.routes.find(
                (tab: { name: string }) => tab.name === '(calendar)'
              )?.state;
              if (
                calendarStack?.type === 'stack' &&
                typeof calendarStack.index === 'number' &&
                calendarStack.index > 0
              ) {
                navigation.dispatch({ type: 'POP_TO_TOP', target: calendarStack.key });
              }
            },
          })}>
          <NativeTabs.Trigger.Label>Tournaments</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="rankings">
          <NativeTabs.Trigger.Label>Players</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="person.2.fill" md="group" />
        </NativeTabs.Trigger>

        {/* Explore is held back from the launch tab bar. */}
        <NativeTabs.Trigger name="explore" hidden>
          <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="safari.fill" md="explore" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" md="person" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </AppDrawer>
  );
}
