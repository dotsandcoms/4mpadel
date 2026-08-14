import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { AppDrawer } from '@/components/app-drawer';
import { brand } from '@/theme/tokens';

/**
 * The tab bar is rendered by the OS, not by us — Liquid Glass on iOS 26,
 * Material 3 on Android. That's why icons are specified per-platform:
 * SF Symbols for iOS, Material drawable names for Android.
 *
 * Two constraints to remember before adding anything here:
 *   1. Android caps the bar at five tabs. We are at five.
 *   2. Tabs cannot be added or removed at runtime.
 *
 * NativeTabs is still an alpha API. Keeping it wrapped in this one file means
 * a breaking change upstream is a single-file fix.
 */
export default function TabsLayout() {
  return (
    <AppDrawer>
      <NativeTabs
        // No backgroundColor on purpose: leaving it unset lets iOS 26 render its
        // own Liquid Glass material and Android its Material 3 surface. Setting a
        // flat fill here would paint over both.
        tintColor={brand.padel}
        indicatorColor={brand.panel}
        minimizeBehavior="onScrollDown"
        labelStyle={{ selected: { color: brand.padel } }}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="house.fill" drawable="home" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="calendar">
          <NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="calendar" drawable="calendar_month" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="rankings">
          <NativeTabs.Trigger.Label>Rankings</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="trophy.fill" drawable="emoji_events" />
        </NativeTabs.Trigger>

        {/* Clubs, coaches, organisations and federations all live behind this
            one tab — the consolidation that keeps us inside Android's limit. */}
        <NativeTabs.Trigger name="explore">
          <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="safari.fill" drawable="explore" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" drawable="person" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </AppDrawer>
  );
}
