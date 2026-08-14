import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuButton } from '@/components/app-drawer';

type ScreenProps = {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
};

/**
 * Standard scrollable screen shell. The hamburger stays pinned on the right;
 * the rest scrolls so the iOS 26 tab bar can still minimize on scroll.
 */
export function Screen({ title, eyebrow, children }: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-page">
      <View
        className="flex-row items-center justify-end px-3"
        style={{ paddingTop: insets.top + 4, minHeight: insets.top + 48 }}>
        <MenuButton />
      </View>
      <ScrollView
        className="flex-1 bg-page"
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: insets.bottom + 120,
          paddingHorizontal: 20,
        }}
        contentInsetAdjustmentBehavior="automatic">
        {eyebrow ? (
          <Text className="mb-1 text-xs font-bold uppercase tracking-widest text-padel">
            {eyebrow}
          </Text>
        ) : null}
        <Text className="mb-6 text-4xl font-extrabold text-premium">{title}</Text>
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * Placeholder used while Phase 1 focuses on auth. Each one states what will
 * live here, so the demo reads as deliberate rather than unfinished.
 */
export function Placeholder({ label }: { label: string }) {
  return (
    <View className="rounded-2xl border border-edge bg-surface p-6">
      <Text className="text-base leading-6 text-muted">{label}</Text>
    </View>
  );
}
