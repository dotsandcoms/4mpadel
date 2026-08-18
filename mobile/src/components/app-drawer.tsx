import { SymbolView } from 'expo-symbols';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { BackHandler, Dimensions, Pressable } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { DrawerMenu } from '@/components/drawer-menu';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { brand, motion } from '@/theme/tokens';

const SPRING = { damping: 28, stiffness: 260, mass: 0.85, overshootClamping: true as const };
const SCREEN_W = Dimensions.get('window').width;
const DRAWER_W = Math.min(SCREEN_W * 0.86, 360);

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
 * Right-edge drawer. Native tabs stay on the scaled card; menu contents
 * match the website hamburger.
 */
export function AppDrawer({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);
  const dragStart = useSharedValue(0);

  const settle = useCallback(
    (next: boolean, fromGesture = false) => {
      setOpen(next);
      if (reduced) {
        progress.value = withTiming(next ? 1 : 0, { duration: motion.duration.fast });
      } else {
        progress.value = withSpring(next ? 1 : 0, SPRING);
      }
      if (fromGesture) hapticLight();
    },
    [progress, reduced]
  );

  const openDrawer = useCallback(() => settle(true), [settle]);
  const closeDrawer = useCallback(() => settle(false), [settle]);
  const toggleDrawer = useCallback(() => settle(!open), [open, settle]);
  const settleFromGesture = useCallback((next: boolean) => settle(next, true), [settle]);

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
          runOnJS(settleFromGesture)(projected > 0.45);
        }),
    [dragStart, progress, reduced, settleFromGesture]
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
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: DRAWER_W,
              pointerEvents: open ? 'auto' : 'none',
            },
            panelStyle,
          ]}>
          <DrawerMenu visible={open} onClose={closeDrawer} />
        </Animated.View>
        <GestureDetector gesture={gestures}>
          <Animated.View
            style={[
              {
                flex: 1,
                backgroundColor: brand.page,
                overflow: 'hidden',
                boxShadow: open ? '8px 0px 24px rgba(0, 0, 0, 0.45)' : 'none',
                elevation: open ? 16 : 0,
              },
              cardStyle,
            ]}
            accessibilityElementsHidden={open}>
            {children}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  backgroundColor: '#000',
                  pointerEvents: open ? 'auto' : 'none',
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

/** 44pt hamburger. Pinned to the trailing edge of the sliding card. */
export function MenuButton() {
  const ctx = useDrawerOptional();
  if (!ctx) return null;

  return (
    <Pressable
      onPress={() => {
        hapticMedium();
        ctx.toggleDrawer();
      }}
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
