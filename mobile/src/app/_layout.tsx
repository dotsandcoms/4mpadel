import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import '@/global.css';
import { brand } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

/**
 * Root layout. The app is dark-only by design — the 4M Padel identity is
 * electric lime on near-black and has no light counterpart, so we commit
 * rather than ship a washed-out light mode.
 *
 * The (auth) group will sit alongside (tabs) here once sign-in lands; the
 * root layout is where the session gate will decide which group to show.
 */
export default function RootLayout() {
  // Held open by preventAutoHideAsync above. Once the session gate lands this
  // moves behind "session restored", so the app never flashes signed-out
  // content before deciding which group to show.
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

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
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </ThemeProvider>
  );
}
