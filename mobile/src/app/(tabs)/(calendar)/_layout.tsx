import { Stack } from 'expo-router';
import { lightBrand as brand } from '@/theme/tokens';

// Keep a calendar screen behind event deep links and the native tab bar around details.
export const unstable_settings = { initialRouteName: 'calendar' };

export default function CalendarLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: brand.page } }}>
    <Stack.Screen name="calendar" />
    <Stack.Screen name="events/[id]" />
  </Stack>;
}
