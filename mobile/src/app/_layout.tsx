import 'react-native-gesture-handler';
import type { Session } from '@supabase/supabase-js';
import { DarkTheme, Stack, ThemeProvider, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';

import '@/global.css';
import { AnimatedSplash } from '@/components/animated-splash';
import { hasSeenOnboarding } from '@/lib/onboarding';
import {
  addNotificationResponseListener,
  syncPushTokenIfGranted,
} from '@/lib/notifications';
import { destinationAfterAuth } from '@/lib/profile';
import { recordAppDevice } from '@/lib/signup-source';
import { supabase } from '@/lib/supabase';
import { brand } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

/**
 * Root layout, session gate, and splash handoff.
 *
 * The app is dark-only by design — the 4M Padel identity is electric lime on
 * near-black and has no light counterpart, so we commit to one world rather
 * than ship a washed-out light mode.
 *
 * Launch runs as: static native splash (near-black) → in-app AnimatedSplash
 * (full-bleed court, lime line, wordmark) → app. Native cannot animate, so
 * the overlay is the wow moment. The lime rule then reappears under the mark
 * on onboarding and sign-in so the first screen feels like a continuation.
 *
 * The overlay stays up until three things are true:
 *   - the animation has run its course (so it never truncates mid-motion),
 *   - onboarding state and the Supabase session have resolved, and
 *   - the router has replaced onto that destination.
 * Expo Router's default screen is Home, so clearing the splash any earlier
 * flashes the tabs for a frame. The fade then lands on the real first screen.
 */
export default function RootLayout() {
  const router = useRouter();
  const [dataReady, setDataReady] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const seenRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const settled = useRef(false);

  const onSplashFinish = useCallback(() => setAnimDone(true), []);

  const resolvePath = useCallback(async (seen: boolean, session: Session | null) => {
    if (!seen) return '/(auth)/onboarding' as const;
    if (!session) return '/(auth)/sign-in' as const;
    return destinationAfterAuth(session);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [seen, { data }] = await Promise.all([
        hasSeenOnboarding(),
        supabase.auth.getSession(),
      ]);
      if (cancelled) return;

      seenRef.current = seen;
      sessionRef.current = data.session;
      settled.current = true;
      setDataReady(true);
      if (data.session) {
        syncPushTokenIfGranted();
        recordAppDevice();
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!settled.current) return;
      sessionRef.current = session;
      if (event === 'SIGNED_OUT') router.replace('/(auth)/sign-in');
      if (event === 'SIGNED_IN' && session && seenRef.current) {
        syncPushTokenIfGranted();
        recordAppDevice();
        destinationAfterAuth(session).then((path) => router.replace(path));
      }
    });

    const tap = addNotificationResponseListener((path) => {
      router.push(path as never);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      tap.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!dataReady || !animDone || revealed) return;
    let cancelled = false;

    (async () => {
      const path = await resolvePath(seenRef.current, sessionRef.current);
      if (cancelled) return;
      router.replace(path);
      // Wait until the destination is on the stack so the splash fade
      // lands on onboarding/sign-in, not a one-frame flash of Home.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setRevealed(true);
        });
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [dataReady, animDone, revealed, resolvePath, router]);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const showSplash = !revealed;

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
      {showSplash ? <AnimatedSplash onFinish={onSplashFinish} /> : null}
    </ThemeProvider>
  );
}
