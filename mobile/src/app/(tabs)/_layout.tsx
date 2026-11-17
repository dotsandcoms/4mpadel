import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { useNavigation } from 'expo-router';
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
 *   1. Android caps the bar at five tabs. Five are visible, including Messages.
 *   2. Tabs cannot be added or removed at runtime.
 *
 * NativeTabs is still an alpha API. Keeping it wrapped in this one file means
 * a breaking change upstream is a single-file fix.
 */
export default function TabsLayout() {
  const { badge } = useMessagingInbox();
  const navigation = useNavigation();
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
          state: ({ data: { state } }) => {
            const activeTab = typeof state.index === 'number' ? state.routes[state.index] : undefined;
            // A player profile can cover Events without changing the selected tab.
            // Keep the event and its Draws selection until another tab is selected.
            if (!activeTab || activeTab.name === '(calendar)') return;

            const calendarStack = state.routes.find((tab) => tab.name === '(calendar)')?.state;
            if (
              calendarStack?.type === 'stack' &&
              typeof calendarStack.index === 'number' &&
              calendarStack.index > 0
            ) {
              navigation.dispatch({ type: 'POP_TO_TOP', target: calendarStack.key });
            }
          },
        }}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(calendar)">
          <NativeTabs.Trigger.Label>Events</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="rankings">
          <NativeTabs.Trigger.Label>Players</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="person.2.fill" md="group" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="messages">
          <NativeTabs.Trigger.Label>Messages</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" md="chat" />
          {badge > 0 ? <NativeTabs.Trigger.Badge>{badge > 99 ? '99+' : String(badge)}</NativeTabs.Trigger.Badge> : null}
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
