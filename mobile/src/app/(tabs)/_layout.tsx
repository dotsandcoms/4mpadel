import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { useFocusEffect, useNavigation, usePathname } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { AppDrawer } from '@/components/app-drawer';
import { GlassTabExpansion, supportsExpandableGlass } from '@/components/glass-tab-bar';
import { ProfileTabPanel } from '@/components/profile-tab-panel';
import { hapticMedium } from '@/lib/haptics';
import { lightBrand as brand } from '@/theme/tokens';

/**
 * NativeTabs owns selection and the resting bar. The SwiftUI expansion takes
 * its place only while Profile shortcuts are open or animating closed.
 */
export default function TabsLayout() {
  const { badge } = useMessagingInbox();
  const navigation = useNavigation();
  const pathname = usePathname();
  const [profilePanel, setProfilePanel] = useState<'closed' | 'open' | 'closing' | 'restoring'>('closed');
  const [activeTab, setActiveTab] = useState<string>();
  const expandableProfile = Platform.OS === 'ios' || Platform.OS === 'android';
  const badgeLabel = badge > 0 ? (badge > 99 ? '99+' : String(badge)) : undefined;
  const showGlassExpansion = supportsExpandableGlass && profilePanel !== 'closed';
  const closeProfilePanel = useCallback(() => setProfilePanel('closed'), []);
  const collapseGlassExpansion = useCallback(() => setProfilePanel(panel => panel === 'open' ? 'closing' : panel), []);
  const restoreNativeBar = useCallback(() => setProfilePanel(panel => panel === 'closing' ? 'restoring' : panel), []);
  useEffect(closeProfilePanel, [closeProfilePanel, pathname]);
  useFocusEffect(useCallback(() => closeProfilePanel, [closeProfilePanel]));

  return (
    <AppDrawer>
      <NativeTabs
        hidden={showGlassExpansion && profilePanel !== 'restoring'}
        // Native system navigation, with explicit legible V2 colors.
        backgroundColor={Platform.OS === 'android' ? 'rgba(255,255,255,0.96)' : brand.elevated}
        iconColor={{ default: brand.muted, selected: brand.accent }}
        tintColor={brand.accent}
        indicatorColor={brand.panel}
        labelVisibilityMode="labeled"
        minimizeBehavior="onScrollDown"
        labelStyle={{ default: { color: brand.muted }, selected: { color: brand.accent } }}
        screenListeners={{
          tabPress: ({ data }) => {
            hapticMedium();
            if (!data?.isPrevented) closeProfilePanel();
          },
          state: ({ data: { state } }) => {
            const selected = typeof state.index === 'number' ? state.routes[state.index] : undefined;
            if (!selected) return;
            if (supportsExpandableGlass) setActiveTab(selected.name);
            // A root screen can cover Draws without changing the selected Events tab.
            if (selected.name === '(calendar)') return;

            const calendarStack = state.routes.find((tab) => tab.name === '(calendar)')?.state;
            if (calendarStack?.type === 'stack' && typeof calendarStack.index === 'number' && calendarStack.index > 0) {
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
          {badgeLabel ? <NativeTabs.Trigger.Badge>{badgeLabel}</NativeTabs.Trigger.Badge> : null}
        </NativeTabs.Trigger>

        {/* Explore is held back from the launch tab bar. */}
        <NativeTabs.Trigger name="explore" hidden>
          <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="safari.fill" md="explore" />
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="profile" disabled={expandableProfile}
          accessibilityLabel={expandableProfile ? 'Profile options' : 'Profile'}
          listeners={expandableProfile ? { tabPress: () => setProfilePanel(panel => panel === 'closed' ? 'open' : 'closed') } : undefined}>
          <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" md="person" />
        </NativeTabs.Trigger>
      </NativeTabs>
      {supportsExpandableGlass
        ? showGlassExpansion && <GlassTabExpansion activeTab={activeTab} badge={badgeLabel} visible={profilePanel === 'open'}
          restoring={profilePanel === 'restoring'} onClose={collapseGlassExpansion} onRestore={restoreNativeBar} onCollapsed={closeProfilePanel} />
        : expandableProfile && <ProfileTabPanel visible={profilePanel === 'open'} onClose={closeProfilePanel} />}
    </AppDrawer>
  );
}
