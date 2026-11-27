import { Button, GlassEffectContainer, Host, HStack, Image, Namespace, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits, accessibilityHidden, accessibilityLabel, Animation, animation,
  background, buttonStyle, contentShape, font, foregroundStyle, frame, glassEffect, glassEffectId,
  lineLimit, offset, shapes,
} from '@expo/ui/swift-ui/modifiers';
import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useId, useState, type ComponentProps } from 'react';
import { I18nManager, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { hapticLight } from '@/lib/haptics';
import { lightBrand as brand } from '@/theme/tokens';

import type { GlassTabExpansionProps } from './glass-tab-bar';
import { profileShortcuts, useOpenProfileShortcut, type ProfileShortcut } from './profile-tab-shortcuts';

export const supportsExpandableGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

const tabs = [
  { name: 'index', label: 'Home', symbol: 'house.fill' },
  { name: '(calendar)', label: 'Events', symbol: 'calendar' },
  { name: 'rankings', label: 'Players', symbol: 'person.2.fill' },
  { name: 'messages', label: 'Messages', symbol: 'bubble.left.and.bubble.right.fill' },
  { name: 'profile', label: 'Profile', symbol: 'person.crop.circle.fill' },
] as const;

type SymbolName = ComponentProps<typeof Image>['systemName'];
const height = 62;
const gap = 10;
const inset = 4;
const restingInset = 14;
const selectedTabExtraWidth = 10;
const selectedFill = '#38601822';
const restingSelectionFill = '#16251F16';
const glass = glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' });
const collapseMs = 300;
const handoffMs = 90;
const spring = Animation.spring({ duration: 0.42, bounce: 0.10 });
const collapse = Animation.easeOut({ duration: collapseMs / 1000 });

function TabButton({ label, symbol, width, onPress, selected, badge, compact, resting }: {
  label: string; symbol: SymbolName; width: number; onPress?: () => void;
  selected?: boolean; badge?: string; compact?: boolean; resting?: boolean;
}) {
  const ink = selected ? brand.accent : '#131715';
  const content = <VStack spacing={3} modifiers={[
      frame({ width, height: height - inset * 2 }), contentShape(shapes.capsule()),
      ...(selected && !compact && !resting ? [background(selectedFill, shapes.capsule())] : []),
    ]}>
      <ZStack alignment="topTrailing">
        <Image systemName={symbol} modifiers={[
          font({ size: resting ? 23 : 24, weight: 'semibold' }), foregroundStyle(ink), frame({ height: 27 }),
          ...(resting ? [offset({ y: 2 })] : []),
        ]} />
        {badge && <Text modifiers={[
          font({ size: 9, weight: 'bold' }), foregroundStyle(brand.elevated), frame({ minWidth: 15, height: 15 }),
          background(brand.danger, shapes.capsule()), offset({ x: 9, y: -3 }), accessibilityHidden(true),
        ]}>{badge}</Text>}
      </ZStack>
      {!compact && <Text modifiers={[font({ size: 10.5, weight: resting ? 'medium' : 'semibold' }), foregroundStyle(ink), lineLimit(1)]}>{label}</Text>}
  </VStack>;
  if (resting && selected) {
    return <ZStack modifiers={[frame({ width, height: height - inset * 2 })]}>
      <Spacer modifiers={[frame({ width: width + 18, height: height - inset * 2 }), background(restingSelectionFill, shapes.capsule())]} />
      {content}
    </ZStack>;
  }
  if (!onPress) return content;
  return <Button onPress={onPress} modifiers={[
    buttonStyle('plain'), accessibilityLabel(badge ? `${label}, ${badge} unread` : label),
    ...(selected ? [accessibilityAddTraits(['isSelected'])] : []),
  ]}>{content}</Button>;
}

export function GlassTabExpansion({ visible, restoring, activeTab, badge, onClose, onRestore, onCollapsed }: GlassTabExpansionProps) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(reduceMotion && visible);
  const [highlight, setHighlight] = useState(-1);
  const lastDragIndex = useSharedValue(-1);
  const opacity = useSharedValue(1);
  const handoffStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const namespace = useId();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const openShortcut = useOpenProfileShortcut();
  useEffect(() => {
    if (restoring) {
      // Present the system bar underneath the aligned glass before fading it out.
      const frame = requestAnimationFrame(() => {
        opacity.value = withTiming(0, { duration: handoffMs, easing: Easing.inOut(Easing.quad) }, finished => {
          if (finished) scheduleOnRN(onCollapsed);
        });
      });
      return () => { cancelAnimationFrame(frame); cancelAnimation(opacity); };
    }
    if (!visible) {
      setExpanded(false);
      if (reduceMotion) {
        onCollapsed();
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const frame = requestAnimationFrame(() => { timer = setTimeout(onRestore, collapseMs); });
      return () => { cancelAnimationFrame(frame); clearTimeout(timer); };
    }
    if (reduceMotion) {
      setExpanded(true);
      return;
    }

    // Give the native host a frame at the resting bar's size before starting the spring.
    let expansionFrame: number | undefined;
    const mountFrame = requestAnimationFrame(() => {
      expansionFrame = requestAnimationFrame(() => setExpanded(true));
    });
    return () => {
      cancelAnimationFrame(mountFrame);
      if (expansionFrame !== undefined) cancelAnimationFrame(expansionFrame);
    };
  }, [onCollapsed, onRestore, opacity, reduceMotion, restoring, visible]);

  const left = Math.max(20, insets.left);
  const right = Math.max(20, insets.right);
  const rowWidth = width - left - right;
  // iOS insets the end tabs and gives the selected slot a little extra width.
  const tabWidth = (rowWidth - restingInset * 2 - selectedTabExtraWidth) / tabs.length;
  const profileWidth = rowWidth - height - gap;
  const shortcutWidth = (profileWidth - inset * 2) / profileShortcuts.length;
  const bottom = Math.max(8, insets.bottom - 12);
  const rtl = I18nManager.isRTL;
  const selectedTab = tabs.find((tab) => tab.name === activeTab) ?? tabs[0];

  const choose = (shortcut: ProfileShortcut) => {
    hapticLight();
    onClose();
    openShortcut(shortcut);
  };
  const shortcutAt = (x: number, y: number) => {
    'worklet';
    const rowX = rtl ? rowWidth - x : x;
    const index = Math.floor((rowX - height - gap - inset) / shortcutWidth);
    return y >= 0 && y <= height && index >= 0 && index < profileShortcuts.length ? index : -1;
  };
  const drag = Gesture.Pan().maxPointers(1).minDistance(5).enabled(visible && expanded)
    .onUpdate(({ x, y }) => {
      const index = shortcutAt(x, y);
      if (index !== lastDragIndex.value) {
        lastDragIndex.value = index;
        scheduleOnRN(setHighlight, index);
      }
    })
    .onEnd(({ x, y }, success) => {
      const index = shortcutAt(x, y);
      if (success && index >= 0) scheduleOnRN(choose, profileShortcuts[index].id);
    })
    .onFinalize(() => {
      lastDragIndex.value = -1;
      scheduleOnRN(setHighlight, -1);
    });

  return <View pointerEvents="box-none" style={styles.layer}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close Profile shortcuts" accessibilityElementsHidden={!visible}
      style={StyleSheet.absoluteFill} onPress={onClose} />
    <GestureDetector gesture={drag}>
      <View collapsable={false} accessibilityElementsHidden={!visible} pointerEvents={visible ? 'auto' : 'none'}
        onAccessibilityEscape={onClose} style={[styles.bar, { left, right, bottom }]}>
        <Animated.View style={[styles.host, handoffStyle]}>
          <Host colorScheme="light" ignoreSafeArea="all" style={styles.host}>
            <Namespace id={namespace}>
              <GlassEffectContainer spacing={8} modifiers={reduceMotion ? [] : [animation(visible ? spring : collapse, expanded)]}>
                <ZStack alignment="trailing" modifiers={[frame({ width: rowWidth, height })]}>
                  <HStack spacing={0} modifiers={[
                    frame({ width: expanded ? height : rowWidth, height }), glass,
                    glassEffectId('navigation', namespace), frame({ width: rowWidth, alignment: 'leading' }), accessibilityHidden(!expanded),
                  ]}>
                    {expanded
                      ? <TabButton compact label={`Return to tabs, ${selectedTab.label} selected`} symbol={selectedTab.symbol}
                        width={height - inset * 2} selected onPress={() => { hapticLight(); onClose(); }} />
                      : tabs.map(({ name, label, symbol }) => <TabButton key={name} label={label} symbol={symbol}
                        width={tabWidth + (selectedTab.name === name ? selectedTabExtraWidth : 0)} resting
                        badge={name === 'messages' ? badge : undefined} selected={selectedTab.name === name} />)}
                  </HStack>
                  <HStack spacing={0} modifiers={[
                    frame({ width: expanded ? profileWidth : tabWidth, height }),
                    expanded ? glass : glassEffect({ glass: { variant: 'identity' } }),
                    glassEffectId('profile', namespace), accessibilityHidden(!expanded),
                  ]}>
                    {expanded
                      ? profileShortcuts.map(({ id, label, symbol }, index) => <TabButton key={id} label={label} symbol={symbol}
                        width={shortcutWidth} selected={highlight === index} onPress={() => choose(id)} />)
                      : <Spacer />}
                  </HStack>
                </ZStack>
              </GlassEffectContainer>
            </Namespace>
          </Host>
        </Animated.View>
      </View>
    </GestureDetector>
  </View>;
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 1 },
  bar: { position: 'absolute', height },
  host: { flex: 1 },
});
