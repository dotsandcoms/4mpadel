import { DarkTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import '@/global.css';
import { hasSeenOnboarding } from '@/lib/onboarding';
import { brand } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

// Fade the native splash out rather than cutting, so launch feels continuous.
SplashScreen.setOptions({ duration: 320, fade: true });

/**
 * Root layout. The app is dark-only by design — the 4M Padel identity is
 * electric lime on near-black and has no light counterpart, so we commit to
 * one world rather than ship a washed-out light mode.
 *
 * The splash is held open until we know where the user belongs. Once sign-in
 * lands, the Supabase session check joins this same gate, so the app never
 * flashes signed-out content before deciding which group to show.
 */
export default function RootLayout() {
  const router = useRouter();
  const [routed, setRouted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const seen = await hasSeenOnboarding();
      if (cancelled) return;

      if (!seen) router.replace('/(auth)/onboarding');

      setRouted(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (routed) SplashScreen.hideAsync();
  }, [routed]);

  return (
    <ThemeProvider
      value={{
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: brand.padel,
          background: brand.page,
          card: brand.elevated,
          text: brand.premium,
          border: brand.edge,
        },
      }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: brand.page } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
      </Stack>
    </ThemeProvider>
  );
}
