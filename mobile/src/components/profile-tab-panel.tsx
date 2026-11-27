import { Ionicons } from '@expo/vector-icons';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { hapticLight } from '@/lib/haptics';
import { lightBrand as brand } from '@/theme/tokens';

import { profileShortcuts as shortcuts, useOpenProfileShortcut, type ProfileShortcut } from './profile-tab-shortcuts';

const inset = 6;
const anchorWidth = 52;
const spring = { damping: 26, stiffness: 280, mass: 0.85, overshootClamping: true };

function shortcutIndex(x: number, y: number, width: number, rowHeight: number) {
  'worklet';
  const index = Math.floor((y - inset) / rowHeight);
  return x >= 0 && x <= width && index >= 0 && index < shortcuts.length ? index : -1;
}

export function ProfileTabPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const openShortcut = useOpenProfileShortcut();
  const safe = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const glass = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  const progress = useSharedValue(0);
  const highlightIndex = useSharedValue(-1);

  // Leave the native bar's touch area free so Profile can toggle the menu and other tabs still work.
  const bottom = safe.bottom + (Platform.OS === 'ios' ? 65 : 72);
  const right = safe.right + 16;
  const panelWidth = Math.min(260, width - safe.left - right - 16);
  const rowHeight = Math.max(52, 26 + 24 * Math.min(fontScale, 1.8));
  const panelHeight = rowHeight * shortcuts.length + inset * 2;
  const anchorRight = safe.right + (width - safe.left - safe.right) / 10 - anchorWidth / 2 + 10;

  useEffect(() => {
    progress.value = reduceMotion ? Number(visible) : withSpring(Number(visible), spring);
  }, [progress, reduceMotion, visible]);
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, visible]);

  const panelStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [anchorWidth, panelWidth]),
    right: interpolate(progress.value, [0, 1], [anchorRight, right]),
    height: progress.value * panelHeight,
  }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [0.30, 1], [0, 1], 'clamp') }));
  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlightIndex.value < 0 ? 0 : 1,
    top: inset + highlightIndex.value * rowHeight,
  }));

  const choose = (id: ProfileShortcut) => {
    hapticLight();
    onClose();
    openShortcut(id);
  };

  const drag = Gesture.Pan()
    .minDistance(4)
    .maxPointers(1)
    .enabled(visible)
    .onUpdate(({ x, y }) => { highlightIndex.value = shortcutIndex(x, y, panelWidth, rowHeight); })
    .onEnd(({ x, y }, success) => {
      const index = shortcutIndex(x, y, panelWidth, rowHeight);
      if (success && index >= 0) scheduleOnRN(choose, shortcuts[index].id);
    })
    .onFinalize(() => { highlightIndex.value = -1; });

  return <View pointerEvents="box-none" style={styles.layer}>
    {visible && <Pressable accessibilityRole="button" accessibilityLabel="Close profile options"
      style={[StyleSheet.absoluteFill, { bottom }]} onPress={onClose} />}
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} onAccessibilityEscape={onClose}
      style={[styles.panel, { bottom }, panelStyle]}>
      {glass ? <GlassView glassEffectStyle="clear" tintColor="rgba(255,255,255,0.60)" colorScheme="light"
        pointerEvents="none" style={styles.glass} /> : <View pointerEvents="none" style={styles.solid} />}
      <GestureDetector gesture={drag}>
        <Animated.View style={[styles.content, { width: panelWidth, height: panelHeight }, contentStyle]}>
          <Animated.View pointerEvents="none" style={[styles.highlight, { height: rowHeight }, highlightStyle]} />
          {shortcuts.map(({ id, label, icon }) => <Pressable key={id} accessibilityRole="button" accessibilityLabel={label}
            style={[styles.row, { height: rowHeight }]} onPress={() => choose(id)} android_ripple={{ color: brand.panel }}>
            <View style={styles.icon} accessible={false}><Ionicons name={icon} color={brand.accent} size={20} /></View>
            <Text style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.8}>{label}</Text>
            <Ionicons name={id === 'coaches' ? 'open-outline' : 'chevron-forward'} color={brand.muted} size={16} accessible={false} />
          </Pressable>)}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 1 },
  panel: { position: 'absolute', borderRadius: 24, overflow: 'hidden' },
  glass: { ...StyleSheet.absoluteFill, borderRadius: 24 },
  solid: { ...StyleSheet.absoluteFill, backgroundColor: brand.elevated, borderRadius: 24, borderWidth: 1, borderColor: brand.edge },
  content: { position: 'absolute', right: 0, bottom: 0, padding: inset },
  highlight: { position: 'absolute', left: inset, right: inset, borderRadius: 16, backgroundColor: brand.panel },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 12, borderRadius: 16, overflow: 'hidden' },
  icon: { width: 34, height: 34, borderRadius: 12, backgroundColor: brand.glass, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, color: brand.premium, fontSize: 15, fontWeight: '700' },
});
