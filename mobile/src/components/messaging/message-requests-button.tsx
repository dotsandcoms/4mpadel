import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useScreenActive } from '@/hooks/use-screen-active';
import { lightBrand as b } from '@/theme/tokens';

export function MessageRequestsButton({ count, selected, onPress }: { count: number; selected: boolean; onPress: () => void }) {
  const pending = count > 0;
  const reduced = useReducedMotion(), active = useScreenActive();
  const rotate = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(rotate);
    rotate.value = 0;
    if (!pending || selected || reduced || !active) return;
    // The bell's short swing, once on arrival/return or a changed request count.
    // No loop continues while the user is browsing or answering requests.
    rotate.value = withSequence(
      withTiming(-14, { duration: 70, easing: Easing.inOut(Easing.quad) }),
      withTiming(12, { duration: 80 }),
      withTiming(-9, { duration: 70 }),
      withTiming(7, { duration: 70 }),
      withTiming(0, { duration: 90 }),
    );
    return () => { cancelAnimation(rotate); rotate.value = 0; };
  }, [count, pending, selected, reduced, active, rotate]);

  const iconStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));
  return <Pressable accessibilityRole="button" accessibilityLabel={pending ? `Message requests, ${count} pending` : 'Message requests'} accessibilityHint="Review invitations and decide who can message you" accessibilityState={{ selected }} onPress={onPress} android_ripple={{ color: b.panel }} style={{ flex: 1, minHeight: 44, paddingHorizontal: selected ? 12 : 0, borderRadius: 12, borderWidth: 1, borderColor: selected ? b.edge : 'transparent', backgroundColor: selected ? b.surface : 'transparent', overflow: 'hidden' }}>
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
      <Animated.View accessible={false} style={iconStyle}><Ionicons name="mail-unread-outline" size={19} color={b.accent} /></Animated.View>
      <Text accessibilityLiveRegion="polite" style={{ flexShrink: 1, color: b.accent, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>Message requests{pending && <Text style={{ color: b.danger, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}> ({count.toLocaleString('en-ZA')})</Text>}</Text>
    </View>
  </Pressable>;
}
