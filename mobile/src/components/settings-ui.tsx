import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightBrand as brand } from '@/theme/tokens';

export const SETTINGS_BLUE = '#2449D8';

export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <>
    <Stack.Screen options={{ headerShown: true, title, headerBackTitle: 'Back', headerTintColor: brand.premium, headerStyle: { backgroundColor: brand.page }, headerShadowVisible: false }} />
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flex: 1, backgroundColor: brand.page }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 32 }}>{children}</ScrollView>
  </>;
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ marginTop: 24 }}>
    <Text accessibilityRole="header" style={{ color: brand.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginLeft: 4, marginBottom: 10 }}>{title}</Text>
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E4E8E5', overflow: 'hidden' }}>{children}</View>
  </View>;
}

export function SettingsRow({ title, detail, icon, onPress, danger = false, disabled = false }: {
  title: string;
  detail?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const accent = danger ? brand.danger : SETTINGS_BLUE;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={detail} disabled={disabled} onPress={onPress} onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}>
    {/* Keep layout on a plain View: the native style callback was being dropped by interop. */}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 15, minHeight: detail ? 78 : 64, backgroundColor: pressed ? '#F3F5FC' : '#FFFFFF', opacity: disabled ? 0.45 : 1 }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: danger ? '#FFF0F0' : '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: danger ? brand.danger : brand.premium, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{title}</Text>
        {detail && <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 17, marginTop: 3 }}>{detail}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={15} color="#8C9891" />
      <View style={{ position: 'absolute', bottom: 0, left: 62, right: 14, height: 0.5, backgroundColor: '#EDF0ED' }} />
    </View>
  </Pressable>;
}
