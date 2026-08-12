import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ScreenProps = {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
};

/**
 * Standard scrollable screen shell. Scrolling is what drives the iOS 26 tab
 * bar's minimize-on-scroll behaviour, so screens should scroll rather than
 * being fixed-height wherever there's a choice.
 */
export function Screen({ title, eyebrow, children }: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      className="flex-1 bg-page"
      contentContainerStyle={{
        paddingTop: insets.top + 12,
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
