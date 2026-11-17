import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Pressable, ScrollView, Text, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useFocusEffect, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GUIDES, tourPathMatches, type GuideId } from '@/lib/guided-tour';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useGuidedTour, type TourTargetHandle } from './context';

const RevealContext = createContext<((target: View) => void) | null>(null);

export function TourTarget({ id, children, style, enabled = true, onActivate, onReveal }: {
  id: string; children: ReactNode; style?: StyleProp<ViewStyle>; enabled?: boolean; onActivate?: () => void; onReveal?: () => void;
}) {
  const guide = useGuidedTour(), scrollReveal = useContext(RevealContext), node = useRef<View>(null);
  const callbacks = useRef({ onActivate, onReveal, scrollReveal }); callbacks.current = { onActivate, onReveal, scrollReveal };
  const target = useMemo<TourTargetHandle>(() => ({
    node,
    reveal() { if (callbacks.current.onReveal) callbacks.current.onReveal(); else if (node.current) callbacks.current.scrollReveal?.(node.current); },
    measure: () => new Promise(resolve => {
      if (!node.current) { resolve(null); return; }
      const timer = setTimeout(() => resolve(null), 250);
      node.current.measureInWindow((x, y, width, height) => { clearTimeout(timer); resolve(width > 0 && height > 0 ? { x, y, width, height } : null); });
    }),
  }), []);
  target.activate = onActivate ? () => callbacks.current.onActivate?.() : undefined;
  const register = guide?.register;
  useFocusEffect(useCallback(() => {
    if (enabled && register) return register(id, target);
  }, [enabled, register, id, target]));
  return <View ref={node} collapsable={false} style={style}>{children}</View>;
}

/** Uses native content coordinates without changing a screen's sticky-header structure. */
export function TourScrollScope({ children, scroll, content }: { children: ReactNode; scroll: RefObject<ScrollView | null>; content: RefObject<View | null> }) {
  const reduced = useReducedMotion();
  const reveal = useCallback((target: View) => {
    if (!content.current) return;
    target.measureLayout(content.current, (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - 16), animated: !reduced }), () => {});
  }, [content, scroll, reduced]);
  return <RevealContext.Provider value={reveal}>{children}</RevealContext.Provider>;
}

/** Native measurement relative to the scroll content keeps long settings pages reachable. */
export function TourScrollView({ children, contentContainerStyle, ...props }: ScrollViewProps) {
  const scroll = useRef<ScrollView>(null), content = useRef<View>(null);
  return <TourScrollScope scroll={scroll} content={content}><ScrollView {...props} ref={scroll}><View ref={content} collapsable={false} style={contentContainerStyle}>{children}</View></ScrollView></TourScrollScope>;
}

export function ContextualTip({ chapter, ready = true, style, matchPath = true, replayLabel, label = 'Show me around this page', mode = 'both' }: { chapter: GuideId; ready?: boolean; style?: StyleProp<ViewStyle>; matchPath?: boolean; replayLabel?: string; label?: string; mode?: 'both' | 'tip' | 'replay' }) {
  const guide = useGuidedTour(), path = usePathname();
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  if (!guide?.ready || !ready || !focused || guide.active || guide.welcomeVisible || guide.progress.welcome === 'unseen'
    || matchPath && !tourPathMatches(GUIDES[chapter].steps[0].path, path)) return null;
  if (guide.progress.seen.includes(chapter)) return mode !== 'tip' && replayLabel ? <Pressable accessibilityRole="button" onPress={() => guide.start(chapter)} style={[{ minHeight: 44, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6 }, style]}>
    <Ionicons name="information-circle-outline" size={16} color="#526A80" accessible={false} /><Text style={{ color: '#526A80', fontSize: 12, fontWeight: '500', flexShrink: 1 }}>{replayLabel}</Text>
  </Pressable> : null;
  if (mode === 'replay') return null;
  return <View style={[{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EAF1F8', borderWidth: 1, borderColor: '#D4E1ED', borderRadius: 14, minHeight: 44 }, style]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${GUIDES[chapter].title}`} onPress={() => guide.start(chapter)}
      style={{ flex: 1, minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
      <Ionicons name="sparkles-outline" size={17} color="#27517B" accessible={false} />
      <Text style={{ color: '#27517B', fontSize: 13, lineHeight: 19, fontWeight: '600', flexShrink: 1 }}>{label}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss tips: ${GUIDES[chapter].title}`} onPress={() => guide.dismissTip(chapter)}
      style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={17} color="#526A80" accessible={false} /></Pressable>
  </View>;
}
