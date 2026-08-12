import { Stack } from 'expo-router';

/**
 * Pre-authentication group: onboarding now, sign-in and registration next.
 * Headers are off because each screen owns its own chrome.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
