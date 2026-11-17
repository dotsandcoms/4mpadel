import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { bannerSwipeCompletes, type BannerSwipeDirection } from '@/lib/banner-swipe';

export function SwipeDismissibleBanner({ children, direction, onDismiss, top, bottom }: {
  children: ReactNode;
  direction: BannerSwipeDirection;
  onDismiss: () => void;
  top?: number;
  bottom?: number;
}) {
  const offset = useSharedValue(0), dismissing = useSharedValue(false);
  const mounted = useRef(true), reduced = useReducedMotion();
  const finish = useCallback(() => { if (mounted.current) onDismiss(); }, [onDismiss]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelAnimation(offset); };
  }, [offset]);
  const gesture = useMemo(() => {
    const pan = Gesture.Pan().maxPointers(1);
    if (direction === 'up') pan.activeOffsetY(-8).failOffsetX([-22, 22]);
    else pan.activeOffsetX([-8, 8]).failOffsetY([-22, 22]);
    return pan.onUpdate(event => {
      'worklet';
      if (!reduced && !dismissing.value) offset.value = direction === 'up' ? Math.min(0, event.translationY) : event.translationX;
    }).onEnd((event, success) => {
      'worklet';
      const translation = direction === 'up' ? event.translationY : event.translationX;
      const velocity = direction === 'up' ? event.velocityY : event.velocityX;
      if (success && !dismissing.value && bannerSwipeCompletes(direction, translation, velocity)) {
        dismissing.value = true;
        // Commit at release: native host layout changes can interrupt animations.
        runOnJS(finish)();
      } else if (!dismissing.value) offset.value = withTiming(0, { duration: reduced ? 0 : 140 });
    }).onFinalize(() => { 'worklet'; if (!dismissing.value) offset.value = withTiming(0, { duration: reduced ? 0 : 140 }); });
  }, [direction, dismissing, finish, offset, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [direction === 'up' ? { translateY: offset.value } : { translateX: offset.value }] }));
  return <GestureHandlerRootView style={{ position: 'absolute', top, bottom, left: 12, right: 12, zIndex: 2000 }}>
    <GestureDetector gesture={gesture}>
      <Animated.View collapsable={false} style={style}>
        {children}
      </Animated.View>
    </GestureDetector>
  </GestureHandlerRootView>;
}
