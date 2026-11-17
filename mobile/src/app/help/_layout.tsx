import { Stack } from 'expo-router';
import { SupportRelatedProvider } from '@/components/support-related-picker';
import { lightBrand as b } from '@/theme/tokens';

export default function HelpLayout() {
  return <SupportRelatedProvider><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: b.page } }}>
    <Stack.Screen name="index" />
    <Stack.Screen name="related" options={{ headerShown: true, title: 'Choose an entry', headerTitleStyle: { fontSize: 17, fontWeight: '600' }, headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false, presentation: 'formSheet', sheetAllowedDetents: [0.85, 1], sheetGrabberVisible: true, sheetCornerRadius: 24 }} />
  </Stack></SupportRelatedProvider>;
}
