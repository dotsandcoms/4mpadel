import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { usePathname, useRouter } from 'expo-router';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Pressable,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LegalSheet } from '@/components/legal-sheet';
import { LimeRule } from '@/components/lime-rule';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { signOut } from '@/lib/auth';
import { nameFromUser } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { brand, motion } from '@/theme/tokens';

const SPRING = { damping: 28, stiffness: 260, mass: 0.85, overshootClamping: true as const };
const SCREEN_W = Dimensions.get('window').width;
const DRAWER_W = Math.min(SCREEN_W * 0.82, 340);

type DrawerCtx = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const DrawerContext = createContext<DrawerCtx | null>(null);

export function useDrawer(): DrawerCtx {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer must be used inside AppDrawer');
  return ctx;
}

export function useDrawerOptional(): DrawerCtx | null {
  return useContext(DrawerContext);
}

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, n));
}

/**
 * ChatGPT-style side drawer, mirrored to the right: hamburger, right-edge
 * swipe, main screen scales back into a rounded card. Native tabs stay on
 * the card.
 */
export function AppDrawer({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);
  const dragStart = useSharedValue(0);

  const settle = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (reduced) {
        progress.value = withTiming(next ? 1 : 0, { duration: motion.duration.fast });
      } else {
        progress.value = withSpring(next ? 1 : 0, SPRING);
      }
      Haptics.selectionAsync();
    },
    [progress, reduced]
  );

  const openDrawer = useCallback(() => settle(true), [settle]);
  const closeDrawer = useCallback(() => settle(false), [settle]);
  const toggleDrawer = useCallback(() => settle(!open), [open, settle]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!open) return false;
      closeDrawer();
      return true;
    });
    return () => sub.remove();
  }, [closeDrawer, open]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-16, 16])
        .failOffsetY([-20, 20])
        .onBegin(() => {
          dragStart.value = progress.value;
        })
        .onUpdate((e) => {
          if (reduced) return;
          progress.value = clamp(dragStart.value - e.translationX / DRAWER_W, 0, 1);
        })
        .onEnd((e) => {
          const projected = progress.value - e.velocityX / 1800;
          runOnJS(settle)(projected > 0.45);
        }),
    [dragStart, progress, reduced, settle]
  );

  const tapCard = useMemo(
    () =>
      Gesture.Tap()
        .enabled(open)
        .onEnd(() => {
          runOnJS(closeDrawer)();
        }),
    [closeDrawer, open]
  );

  const gestures = useMemo(() => Gesture.Exclusive(pan, tapCard), [pan, tapCard]);

  const panelStyle = useAnimatedStyle(() => {
    if (reduced) {
      return {
        opacity: progress.value,
        zIndex: 4,
        transform: [{ translateX: interpolate(progress.value, [0, 1], [12, 0]) }],
      };
    }
    return { opacity: 1, zIndex: 0 };
  });

  const cardStyle = useAnimatedStyle(() => {
    if (reduced) {
      return {
        transform: [{ translateX: 0 }, { scale: 1 }],
        borderRadius: 0,
      };
    }
    const p = progress.value;
    return {
      transform: [
        { translateX: interpolate(p, [0, 1], [0, -DRAWER_W * 0.92]) },
        { scale: interpolate(p, [0, 1], [1, 0.94]) },
      ],
      borderRadius: interpolate(p, [0, 1], [0, 22]),
    };
  });

  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, reduced ? 0.45 : 0.2]),
  }));

  const ctx = useMemo(
    () => ({ open, openDrawer, closeDrawer, toggleDrawer }),
    [open, openDrawer, closeDrawer, toggleDrawer]
  );

  return (
    <DrawerContext.Provider value={ctx}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: brand.page }}>
        <Animated.View
          pointerEvents={open ? 'auto' : 'none'}
          style={[{ position: 'absolute', top: 0, bottom: 0, right: 0, width: DRAWER_W }, panelStyle]}>
          <DrawerPanel visible={open} />
        </Animated.View>
        <GestureDetector gesture={gestures}>
          <Animated.View
            style={[
              {
                flex: 1,
                backgroundColor: brand.page,
                overflow: 'hidden',
                shadowColor: '#000',
                shadowOffset: { width: 8, height: 0 },
                shadowOpacity: open ? 0.45 : 0,
                shadowRadius: 24,
                elevation: open ? 16 : 0,
              },
              cardStyle,
            ]}
            accessibilityElementsHidden={open}>
            {children}
            <Animated.View
              pointerEvents={open ? 'auto' : 'none'}
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  backgroundColor: '#000',
                },
                dimStyle,
              ]}
            />
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </DrawerContext.Provider>
  );
}

const NAV: {
  label: string;
  href: string;
  match: (path: string) => boolean;
  ios: string;
  android: string;
}[] = [
  {
    label: 'Home',
    href: '/',
    match: (p) => p === '/' || p === '/index',
    ios: 'house.fill',
    android: 'home',
  },
  {
    label: 'Calendar',
    href: '/calendar',
    match: (p) => p.includes('calendar'),
    ios: 'calendar',
    android: 'calendar_month',
  },
  {
    label: 'Rankings',
    href: '/rankings',
    match: (p) => p.includes('rankings'),
    ios: 'trophy.fill',
    android: 'emoji_events',
  },
  {
    label: 'Explore',
    href: '/explore',
    match: (p) => p.includes('explore'),
    ios: 'safari.fill',
    android: 'explore',
  },
  {
    label: 'Profile',
    href: '/profile',
    match: (p) => p.includes('profile'),
    ios: 'person.crop.circle.fill',
    android: 'person',
  },
];

function DrawerPanel({ visible }: { visible: boolean }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { closeDrawer } = useDrawer();
  const [legal, setLegal] = useState<'terms' | 'privacy' | null>(null);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<{ name: string; email: string }>({ name: '', email: '' });

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      const email = user?.email ?? '';
      const names = nameFromUser(user ?? null);
      const fromMeta = [names.firstName, names.lastName].filter(Boolean).join(' ');
      setAccount({ name: fromMeta || (email ? email.split('@')[0] : 'Player'), email });
      if (!email) return;
      const { data: row } = await supabase
        .from('players')
        .select('name')
        .ilike('email', email)
        .maybeSingle();
      if (row?.name) setAccount({ name: row.name, email });
    });
  }, []);

  function go(href: string) {
    closeDrawer();
    router.push(href as never);
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      closeDrawer();
      await signOut();
    } finally {
      setBusy(false);
    }
  }

  const initials = account.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <View
      accessibilityRole="menu"
      accessibilityViewIsModal={visible}
      accessibilityLabel="Menu"
      style={{
        flex: 1,
        backgroundColor: brand.page,
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 12,
        paddingHorizontal: 18,
      }}>
      <Text className="text-[11px] font-bold uppercase text-padel" style={{ letterSpacing: 1.6 }}>
        4M Padel
      </Text>
      <View className="mt-3 mb-6">
        <LimeRule width={28} />
      </View>

      {NAV.map((item) => {
        const active = item.match(pathname);
        return (
          <Pressable
            key={item.href}
            onPress={() => go(item.href)}
            accessibilityRole="menuitem"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            className="mb-1 min-h-12 flex-row items-center rounded-[14px] px-3"
            style={{
              backgroundColor: active ? 'rgba(204,255,0,0.12)' : 'transparent',
            }}>
            <SymbolView
              name={{ ios: item.ios, android: item.android, web: item.android }}
              size={20}
              tintColor={active ? brand.padel : brand.muted}
              accessibilityElementsHidden
            />
            <Text
              className="ml-3 text-[16px]"
              style={{
                color: active ? brand.padel : brand.premium,
                fontWeight: active ? '700' : '500',
              }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}

      <View className="mt-5 mb-2">
        <Text className="mb-2 px-3 text-[11px] font-bold uppercase" style={{ color: brand.faint, letterSpacing: 1.2 }}>
          Account
        </Text>
        <Pressable
          onPress={() => setLegal('terms')}
          accessibilityRole="menuitem"
          accessibilityLabel="Terms"
          className="min-h-12 justify-center px-3">
          <Text className="text-[16px] text-premium">Terms</Text>
        </Pressable>
        <Pressable
          onPress={() => setLegal('privacy')}
          accessibilityRole="menuitem"
          accessibilityLabel="Privacy Policy"
          className="min-h-12 justify-center px-3">
          <Text className="text-[16px] text-premium">Privacy Policy</Text>
        </Pressable>
      </View>

      <View className="flex-1" />

      <Pressable
        onPress={() => go('/profile')}
        accessibilityRole="menuitem"
        accessibilityLabel={`${account.name}, profile`}
        className="mb-2 min-h-14 flex-row items-center rounded-[14px] px-2">
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(204,255,0,0.12)' }}>
          <Text className="text-[13px] font-extrabold" style={{ color: brand.padel }}>
            {initials || '•'}
          </Text>
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-[15px] font-bold text-premium" numberOfLines={1}>
            {account.name || 'Player'}
          </Text>
          {account.email ? (
            <Text className="text-[13px] text-muted" numberOfLines={1}>
              {account.email}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <Pressable
        onPress={logout}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ busy }}
        accessibilityLabel="Sign out"
        className="min-h-12 flex-row items-center px-2">
        {busy ? <ActivityIndicator color={brand.muted} style={{ marginRight: 8 }} /> : null}
        <Text className="text-[15px] font-semibold text-muted">Sign out</Text>
      </Pressable>

      <LegalSheet kind={legal} onClose={() => setLegal(null)} />
    </View>
  );
}

/** 44pt hamburger. Pinned to the trailing edge of the sliding card. */
export function MenuButton() {
  const ctx = useDrawerOptional();
  if (!ctx) return null;

  return (
    <Pressable
      onPress={ctx.toggleDrawer}
      accessibilityRole="button"
      accessibilityLabel={ctx.open ? 'Close menu' : 'Open menu'}
      accessibilityState={{ expanded: ctx.open }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
      className="h-11 w-11 items-center justify-center"
      style={{ marginRight: -8 }}>
      <SymbolView
        name={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }}
        size={22}
        tintColor={brand.premium}
      />
    </Pressable>
  );
}
