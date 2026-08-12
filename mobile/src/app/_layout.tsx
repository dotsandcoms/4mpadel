import type { Session } from '@supabase/supabase-js';
import { DarkTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';

import '@/global.css';
import { hasSeenOnboarding } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';
import { brand } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ duration: 320, fade: true });

/**
 * Root layout and session gate.
 *
 * The app is dark-only by design — the 4M Padel identity is electric lime on
 * near-black and has no light counterpart, so we commit to one world rather
 * than ship a washed-out light mode.
 *
 * The native splash is held until we know both whether onboarding has been
 * seen and whether a session was restored from the keychain. That ordering is
 * deliberate: hiding the splash first would flash the signed-out screen at
 * every returning user for the fraction of a second it takes SecureStore to
 * answer.
 */
export default function RootLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const settled = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [seen, { data }] = await Promise.all([
        hasSeenOnboarding(),
        supabase.auth.getSession(),
      ]);
      if (cancelled) return;

      route(seen, data.session);
      settled.current = true;
      setReady(true);
    })();

    // Keeps navigation honest after sign-out, token expiry, or a sign-in that
    // happened on another screen.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!settled.current) return;
      if (event === 'SIGNED_OUT') router.replace('/(auth)/sign-in');
      if (event === 'SIGNED_IN' && session) router.replace('/(tabs)');
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  function route(seen: boolean, session: Session | null) {
    if (!seen) router.replace('/(auth)/onboarding');
    else if (!session) router.replace('/(auth)/sign-in');
    // A restored session needs no redirect — (tabs) is already the initial route.
  }

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

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
