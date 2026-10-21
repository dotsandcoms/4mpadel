import { watchWelcomeEmailRetries } from '@/lib/welcome-email';
import 'react-native-gesture-handler';
import type { Session } from '@supabase/supabase-js';
import { DefaultTheme, Stack, ThemeProvider, usePathname, useRouter, useSegments } from 'expo-router';
import { Observe, ObserveRoot } from 'expo-observe';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, Text, View } from 'react-native';
import { Notice } from '@/components/events/event-ui';
import { StartupRevealedContext } from '@/components/observe-ready';
import { useCallback, useEffect, useRef, useState } from 'react';

import '@/global.css';
import { AnimatedSplash } from '@/components/animated-splash';
import { hasSeenOnboarding } from '@/lib/onboarding';
import {
  addNotificationResponseListener,
  consumeInitialNotificationPath,
  watchPushRegistration,
  syncPushTokenIfGranted,
} from '@/lib/notifications';
import { destinationAfterAuth } from '@/lib/profile';
import { recordAppDevice } from '@/lib/signup-source';
import { supabase } from '@/lib/supabase';
import { lightBrand } from '@/theme/tokens';
import { setCompanionAccount } from '@/lib/companion';
import { watchAuthRefresh } from '@/lib/foreground-task';
import { migrateLegacyDrafts } from '@/lib/profile-draft-storage';
import { withStartupDeadline } from '@/lib/startup';
import { initializeAnalytics, setAnalyticsUser, trackScreen } from '@/lib/analytics';

SplashScreen.preventAutoHideAsync();
Observe.configure({
  integrations: {
    'expo-router': {
      filteredParams: ['id', 'code', 'entry', 'pay_ref', 'payment_return', 'reference', 'registrationId', 'match', 'query', 'email', 'token'],
    },
  },
});

/**
 * Root layout, session gate, and splash handoff.
 *
 * App chrome uses the dark 4M identity. Event overview content follows the
 * website’s white tabs and light accordion surfaces.
 *
 * Launch runs as: static native splash (near-black) → in-app AnimatedSplash
 * (full-bleed court, lime line, wordmark) → app. Native cannot animate, so
 * the overlay is the wow moment. The lime rule then reappears under the mark
 * on onboarding and sign-in so the first screen feels like a continuation.
 *
 * The overlay stays up until three things are true:
 *   - the animation has run its course (so it never truncates mid-motion),
 *   - onboarding state has resolved, plus the saved session for returning users, and
 *   - the router has replaced onto that destination.
 * Expo Router's default screen is Home, so clearing the splash any earlier
 * flashes the tabs for a frame. The fade then lands on the real first screen.
 */
function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const isAuth = segments[0] === '(auth)';
  const recoveryRoute = useRef(false);
  recoveryRoute.current = segments[0] === 'reset-password';
  const brand = lightBrand;
  const navigationTheme = DefaultTheme;
  const [dataReady, setDataReady] = useState(false);
  const [bootError, setBootError] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [animDone, setAnimDone] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const seenRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  const settled = useRef(false);
  const [pendingPushPath, setPendingPushPath] = useState<string | null>(null);

  useEffect(() => { void initializeAnalytics().catch(() => {}); }, []);
  useEffect(() => {
    if (revealed) void trackScreen(segments.join('/'));
  }, [pathname, revealed]);

  useEffect(() => watchWelcomeEmailRetries(), []);
  useEffect(() => Platform.OS === 'web' ? undefined : watchAuthRefresh(supabase.auth), []);
  useEffect(() => {
    // Draft upgrades are independent of sign-in. A failed upgrade retains the old draft.
    void migrateLegacyDrafts().catch(() => Observe.reportError(new Error('Profile draft migration failed')));
  }, []);

  const onSplashFinish = useCallback(() => setAnimDone(true), []);

  const resolvePath = useCallback(async (seen: boolean, session: Session | null) => {
    // Replay the introduction in development; production keeps first-launch onboarding.
    if (__DEV__ || !seen) return '/(auth)/onboarding' as const;
    if (!session) return '/(auth)/sign-in' as const;
    return withStartupDeadline(destinationAfterAuth(session));
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
      const seen = await withStartupDeadline(hasSeenOnboarding());
      if (cancelled) return;
      seenRef.current = seen;
      // A fresh install can show the introduction without opening the keystore
      // or refreshing a previous account. Auth restores independently and its
      // subscription supplies the session when it becomes available.
      if (__DEV__ || !seen) {
        settled.current = true;
        setDataReady(true);
        return;
      }
      const { data, error: sessionError } = await withStartupDeadline(supabase.auth.getSession());
      if (cancelled) return;
      if (sessionError) throw sessionError;
      void setCompanionAccount(data.session?.user.id ?? null);
      void setAnalyticsUser(data.session?.user.id ?? null);

      sessionRef.current = data.session;
      settled.current = true;
      setDataReady(true);
      if (data.session) {
        void syncPushTokenIfGranted().catch(error => console.warn('[push] sync failed', error));
        recordAppDevice();
      }
      } catch {
        if (!cancelled) {
          Observe.reportError(new Error('Startup session restoration failed'));
          setBootError(true);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      void setCompanionAccount(session?.user.id ?? null);
      void setAnalyticsUser(session?.user.id ?? null);
      if (!settled.current) return;
      sessionRef.current = session;
      if (event === 'SIGNED_OUT') router.replace('/(auth)/sign-in');
      if (event === 'SIGNED_IN' && session && seenRef.current && !recoveryRoute.current) {
        void syncPushTokenIfGranted().catch(error => console.warn('[push] sync failed', error));
        recordAppDevice();
        destinationAfterAuth(session).then((path) => { if (!recoveryRoute.current) router.replace(path); }).catch(() => setBootError(true));
      }
    });

    const pushRegistration = watchPushRegistration();
    const tap = addNotificationResponseListener((path) => {
      setPendingPushPath(path);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      tap.remove();
      pushRegistration.remove();
    };
  }, [router, bootAttempt]);

  useEffect(() => {
    if (!dataReady || !animDone || revealed) return;
    let cancelled = false;

    (async () => {
      try {
      const path = await resolvePath(seenRef.current, sessionRef.current);
      if (cancelled) return;
      if (!recoveryRoute.current) router.replace(path);
      // Wait until the destination is on the stack so the splash fade
      // lands on onboarding/sign-in, not a one-frame flash of Home.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) setRevealed(true);
        });
      });
      } catch {
        if (!cancelled) {
          Observe.reportError(new Error('Startup destination could not be resolved'));
          setBootError(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dataReady, animDone, revealed, resolvePath, router]);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    if (!revealed || !sessionRef.current || isAuth || recoveryRoute.current) return;
    const path = pendingPushPath ?? consumeInitialNotificationPath();
    if (path) {
      consumeInitialNotificationPath();
      setPendingPushPath(null);
      router.push(path as never);
    }
  }, [revealed, isAuth, pendingPushPath, router]);

  const showSplash = !revealed;

  return (
    <StartupRevealedContext.Provider value={revealed}>
    <ThemeProvider
      value={{
        ...navigationTheme,
        colors: {
          ...navigationTheme.colors,
          primary: brand.padel,
          background: brand.page,
          card: brand.elevated,
          text: brand.premium,
          border: brand.edge,
        },
      }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: brand.page } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="events/register" />
        <Stack.Screen
          name="search"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.62, 1],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: brand.page },
          }}
        />
        <Stack.Screen
          name="match-result"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.42, 0.78],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: brand.page },
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.42, 0.78],
            sheetGrabberVisible: true,
            sheetCornerRadius: 24,
            contentStyle: { backgroundColor: brand.page },
          }}
        />
        <Stack.Screen
          name="legal"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: brand.page },
          }}
        />
        <Stack.Screen
          name="edit-profile"
          options={{
            animation: 'slide_from_right',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            contentStyle: { backgroundColor: brand.page },
          }}
        />
      </Stack>
      {showSplash ? <AnimatedSplash onFinish={onSplashFinish} /> : null}
      {bootError && <View style={{ position: 'absolute', inset: 0, backgroundColor: brand.page, justifyContent: 'center', padding: 24 }}>
        <Notice title="Could not finish opening the app" onRetry={() => {
          settled.current = false;
          setBootError(false);
          setDataReady(false);
          setRevealed(false);
          setBootAttempt(value => value + 1);
        }}>Check your connection and try again.</Notice>
      </View>}
    </ThemeProvider>
    </StartupRevealedContext.Provider>
  );
}

function ObserveFailure({ onRetry }: { onRetry: () => void }) {
  return <View style={{ flex: 1, backgroundColor: lightBrand.page, justifyContent: 'center', padding: 24, gap: 16 }}>
    <Text accessibilityRole="header" style={{ color: lightBrand.premium, fontSize: 24, fontWeight: '700' }}>Something went wrong</Text>
    <Text style={{ color: lightBrand.muted, fontSize: 15 }}>Please try opening this screen again.</Text>
    <Pressable accessibilityRole="button" onPress={onRetry} style={{ backgroundColor: lightBrand.padel, borderRadius: 12, padding: 15, alignItems: 'center' }}>
      <Text style={{ color: lightBrand.premium, fontWeight: '700' }}>Try again</Text>
    </Pressable>
  </View>;
}

export default function ObservedRootLayout() {
  return <ObserveRoot errorBoundaryFallback={({ resetError }) => <ObserveFailure onRetry={resetError} />}>
    <RootLayout />
  </ObserveRoot>;
}
