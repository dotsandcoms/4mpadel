import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export function HomeSky({ night, top, scrollY }: { night: boolean; top: number; scrollY: Animated.Value }) {
  const reduceMotion = useReducedMotion();
  const [nightOpacity] = useState(() => new Animated.Value(night ? 1 : 0));

  useEffect(() => {
    const target = night ? 1 : 0;
    if (reduceMotion) {
      nightOpacity.setValue(target);
      return;
    }
    const fade = Animated.timing(nightOpacity, {
      toValue: target,
      duration: 360,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    });
    fade.start();
    return () => fade.stop();
  }, [night, nightOpacity, reduceMotion]);

  const dayOpacity = nightOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const fadeOnScroll = scrollY.interpolate({ inputRange: [0, 104], outputRange: [1, 0], extrapolate: 'clamp' });
  const driftOnScroll = reduceMotion ? undefined : {
    transform: [{ translateY: scrollY.interpolate({ inputRange: [-50, 0, 104], outputRange: [4, 0, -12], extrapolate: 'clamp' }) }],
  };
  return <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[styles.sky, { top, opacity: fadeOnScroll }, driftOnScroll]}>
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: dayOpacity }]}>
      <View style={[StyleSheet.absoluteFill, styles.dayGlow]} />
      <Ionicons name="sunny-outline" size={88} color="#B4873B" style={styles.sun} />
    </Animated.View>
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: nightOpacity }]}>
      <View style={[StyleSheet.absoluteFill, styles.nightGlow]} />
      <Ionicons name="star" size={8} color="#5F7899" style={styles.firstStar} />
      <Ionicons name="star" size={15} color="#5F7899" style={styles.secondStar} />
      <Ionicons name="star" size={10} color="#5F7899" style={styles.thirdStar} />
      <Ionicons name="star" size={7} color="#5F7899" style={styles.fourthStar} />
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  sky: { position: 'absolute', start: -95, width: 320, height: 178 },
  dayGlow: {
    experimental_backgroundImage: 'radial-gradient(164px 80px at 46% 54%, rgba(242, 207, 125, 0.52) 0%, rgba(242, 207, 125, 0.19) 53%, rgba(242, 207, 125, 0) 100%)',
  },
  sun: { position: 'absolute', top: 56, start: 106, opacity: 0.36 },
  nightGlow: {
    experimental_backgroundImage: 'radial-gradient(168px 82px at 47% 54%, rgba(143, 165, 193, 0.41) 0%, rgba(143, 165, 193, 0.15) 53%, rgba(143, 165, 193, 0) 100%)',
  },
  firstStar: { position: 'absolute', top: 83, start: 104, opacity: 0.48 },
  secondStar: { position: 'absolute', top: 63, start: 138, opacity: 0.62 },
  thirdStar: { position: 'absolute', top: 66, start: 178, opacity: 0.51 },
  fourthStar: { position: 'absolute', top: 55, start: 213, opacity: 0.42 },
});
