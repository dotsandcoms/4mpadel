import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { lightBrand as b } from '@/theme/tokens';

const SIZE = 64;
const STROKE = 5;
const circle = { width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: STROKE, borderColor: b.accent } as const;

/** Two clipped native semicircles keep the fill on the UI thread without reloading an image. */
export function SkillRing({ rating }: { rating?: number | null }) {
  const value = rating == null || !Number.isFinite(Number(rating)) ? null : Number(rating);
  const target = Math.max(0, Math.min(30, value ?? 0)) / 30;
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    progress.value = reduced ? target : withTiming(target, { duration: 1100, easing: Easing.out(Easing.cubic) });
    return () => cancelAnimation(progress);
  }, [target, reduced, progress]);
  const right = useAnimatedStyle(() => ({ transform: [{ rotate: `${-180 + Math.min(progress.value * 2, 1) * 180}deg` }] }));
  const left = useAnimatedStyle(() => ({ transform: [{ rotate: `${-180 + Math.max(0, progress.value * 2 - 1) * 180}deg` }] }));
  const cap = useAnimatedStyle(() => ({ opacity: progress.value > 0 ? 1 : 0, transform: [{ rotate: `${progress.value * 360}deg` }] }));
  const start = useAnimatedStyle(() => ({ opacity: progress.value > 0 ? 1 : 0 }));
  return <View accessible accessibilityLabel={`Rankedin skill rating: ${value ?? 'not published'}`} style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <View accessible={false} style={{ ...circle, position: 'absolute', borderColor: b.edge }} />
    <View accessible={false} style={{ position: 'absolute', left: SIZE / 2, top: 0, width: SIZE / 2, height: SIZE, overflow: 'hidden' }}>
      <Animated.View style={[{ position: 'absolute', left: -SIZE / 2, width: SIZE, height: SIZE }, right]}>
        <View style={{ position: 'absolute', left: SIZE / 2, width: SIZE / 2, height: SIZE, overflow: 'hidden' }}><View style={{ ...circle, marginLeft: -SIZE / 2 }} /></View>
      </Animated.View>
    </View>
    <View accessible={false} style={{ position: 'absolute', left: 0, top: 0, width: SIZE / 2, height: SIZE, overflow: 'hidden' }}>
      <Animated.View style={[{ width: SIZE, height: SIZE }, left]}>
        <View style={{ width: SIZE / 2, height: SIZE, overflow: 'hidden' }}><View style={circle} /></View>
      </Animated.View>
    </View>
    <Animated.View accessible={false} style={[{ position: 'absolute', width: SIZE, height: SIZE }, cap]}><View style={{ position: 'absolute', left: (SIZE - STROKE) / 2, top: 0, width: STROKE, height: STROKE, borderRadius: STROKE / 2, backgroundColor: b.accent }} /></Animated.View>
    <Animated.View accessible={false} style={[{ position: 'absolute', left: (SIZE - STROKE) / 2, top: 0, width: STROKE, height: STROKE, borderRadius: STROKE / 2, backgroundColor: b.accent }, start]} />
    <Text style={{ color: b.premium, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value == null ? '—' : Number(value.toFixed(2))}</Text>
  </View>;
}
