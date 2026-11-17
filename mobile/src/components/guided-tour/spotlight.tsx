import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View, findNodeHandle, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { tourCardPosition, visibleTourRect, type TourRect } from '@/lib/guided-tour';
import { useGuidedTour } from './context';

const BLUE = '#27517B', INK = '#16251F', SCRIM = 'rgba(7,18,28,0.68)';
const sameRect = (a: TourRect | null, b: TourRect | null) => a === b || !!a && !!b && ['x','y','width','height'].every(key => Math.abs(a[key as keyof TourRect] - b[key as keyof TourRect]) < 0.75);

export function GuidedTourOverlay() {
  const tour = useGuidedTour(), { width, height, fontScale } = useWindowDimensions(), safe = useSafeAreaInsets(), reduced = useReducedMotion();
  const overlay = useRef<View>(null), heading = useRef<Text>(null), revealed = useRef(''), positioned = useRef(false);
  const [frame, setFrame] = useState<TourRect | null>(null), [cardHeight, setCardHeight] = useState(250), [keyboard, setKeyboard] = useState(0), [waiting, setWaiting] = useState(false);
  const x = useSharedValue(0), y = useSharedValue(0), w = useSharedValue(0), h = useSharedValue(0);
  const opacity = useSharedValue(0);
  const visible = !!tour?.visible, welcome = !!tour?.welcomeVisible, step = tour?.step, serial = tour?.active?.serial;
  const usableHeight = height - keyboard;
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', event => setKeyboard(event.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    if (!visible || !step || !tour) { setFrame(null); setWaiting(false); return; }
    let alive = true, inFlight = false;
    setFrame(null); setWaiting(false);
    const measure = async () => {
      if (!alive || inFlight) return;
      const target = tour.targets.get(step.target);
      if (!target) return;
      const revealKey = `${serial}:${step.target}`;
      if (revealed.current !== revealKey) { revealed.current = revealKey; target.reveal(); }
      inFlight = true;
      const measured = await target.measure();
      if (alive) {
        const origin = await new Promise<{ x: number; y: number }>(resolve => {
          if (!overlay.current) { resolve({ x: 0, y: 0 }); return; }
          const timer = setTimeout(() => resolve({ x: 0, y: 0 }), 200);
          overlay.current.measureInWindow((ox, oy) => { clearTimeout(timer); resolve({ x: ox, y: oy }); });
        });
        if (alive) {
          const next = measured ? visibleTourRect({ ...measured, x: measured.x - origin.x, y: measured.y - origin.y }, width, usableHeight, safe.top, keyboard ? 0 : safe.bottom) : null;
          setFrame(previous => sameRect(previous, next) ? previous : next);
        }
      }
      inFlight = false;
    };
    void measure();
    const interval = setInterval(() => { void measure(); }, 120), timeout = setTimeout(() => setWaiting(true), step.optional ? 1000 : 3000);
    return () => { alive = false; clearInterval(interval); clearTimeout(timeout); };
  }, [visible, serial, step?.target, step?.optional, tour?.targetsVersion, width, usableHeight, safe.top, safe.bottom, keyboard]);
  useEffect(() => { if (visible && waiting && !frame && step?.optional) tour?.next(); }, [visible, waiting, frame, step?.optional, tour?.next]);
  useEffect(() => {
    if (!frame) { positioned.current = false; return; }
    const duration = reduced || !positioned.current ? 0 : 220;
    positioned.current = true;
    const options = { duration, easing: Easing.bezier(0.2, 0, 0, 1) };
    x.value = withTiming(frame.x, options); y.value = withTiming(frame.y, options);
    w.value = withTiming(frame.width, options); h.value = withTiming(frame.height, options);
  }, [frame, reduced, x, y, w, h]);
  useEffect(() => { opacity.value = 0; opacity.value = withTiming(1, { duration: reduced ? 0 : 180 }); }, [serial, welcome, reduced, opacity]);
  const topShade = useAnimatedStyle(() => ({ left: 0, top: 0, width, height: Math.max(0, y.value) }));
  const leftShade = useAnimatedStyle(() => ({ left: 0, top: y.value, width: Math.max(0, x.value), height: h.value }));
  const rightShade = useAnimatedStyle(() => ({ left: x.value + w.value, top: y.value, right: 0, height: h.value }));
  const bottomShade = useAnimatedStyle(() => ({ left: 0, top: y.value + h.value, right: 0, bottom: 0 }));
  const ring = useAnimatedStyle(() => ({ left: x.value, top: y.value, width: w.value, height: h.value }));
  const enter = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: reduced ? 0 : (1 - opacity.value) * 6 }] }));
  const show = welcome || visible && (frame || waiting);
  useEffect(() => {
    if (!show) return;
    let alive = true;
    const timer = setTimeout(() => { void AccessibilityInfo.isScreenReaderEnabled().then(enabled => {
      if (!alive || !enabled || Platform.OS === 'web' || !heading.current) return;
      const handle = findNodeHandle(heading.current); if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
    }); }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [!!show, serial, welcome]);
  if (!tour || !show) return null;
  const viewport = { width, height: usableHeight, top: safe.top, bottom: keyboard ? 0 : safe.bottom };
  const position = tourCardPosition(welcome ? null : frame, viewport, cardHeight);
  const cardMax = Math.max(200, usableHeight - safe.top - (keyboard ? 0 : safe.bottom) - 32);
  const target = step ? tour.targets.get(step.target) : null;
  const last = !!tour.guide && tour.active?.index === tour.guide.steps.length - 1;
  return <View ref={overlay} collapsable={false} pointerEvents="box-none" style={s.overlay} accessibilityViewIsModal importantForAccessibility="yes">
    {frame && !welcome ? <>
      {[topShade, leftShade, rightShade, bottomShade].map((style, index) => <Animated.View key={index} style={[s.shade, style]} onStartShouldSetResponder={() => true} accessible={false} />)}
      <Animated.View pointerEvents="none" style={[s.ring, ring]} />
    </> : <View style={[StyleSheet.absoluteFill, { backgroundColor: SCRIM }]} onStartShouldSetResponder={() => true} accessible={false} />}
    <Animated.View onLayout={event => { const measured = event.nativeEvent.layout.height; if (Math.abs(measured - cardHeight) > 1) setCardHeight(measured); }}
      style={[s.card, { left: position.left, top: position.top, width: position.width, maxHeight: cardMax }, enter]}>
      <View style={s.topline}>
        <View style={s.eyebrow}><Ionicons name={welcome ? 'compass-outline' : tour.guide?.icon || 'sparkles-outline'} size={16} color={BLUE} accessible={false} />
          <Text style={s.kicker}>{welcome ? 'WELCOME TO 4M' : `${(tour.active?.index ?? 0) + 1} OF ${tour.guide?.steps.length ?? 1}`}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={welcome ? 'Maybe later' : 'Skip tour'} onPress={welcome ? tour.later : tour.stop} style={s.close}>
          <Ionicons name="close" size={20} color="#526A80" accessible={false} />
        </Pressable>
      </View>
      <ScrollView bounces={false} style={{ flexGrow: 0, maxHeight: Math.max(100, cardMax - 150) }} contentContainerStyle={{ gap: 10 }}>
        <Text ref={heading} accessibilityRole="header" style={s.title}>{welcome ? 'Find your way.\nMake it your game.' : step?.title}</Text>
        <Text style={s.body}>{welcome ? 'A quick look at your feed, players, events and settings. Explore at your own pace, and skip whenever you like.' : !frame && waiting ? 'This part of the page is still loading. You can continue to the next tip or close the tour.' : step?.body}</Text>
        {!welcome && target?.activate && <Pressable accessibilityRole="button" accessibilityLabel={`Try it: ${step?.title}`} onPress={target.activate} style={s.tryButton}>
          <Text style={s.tryLabel}>Try it <Ionicons name="arrow-forward" size={13} /></Text>
        </Pressable>}
      </ScrollView>
      {!welcome && <View style={s.track} accessibilityRole="progressbar" accessibilityLabel="Tour progress" accessibilityValue={{ min: 1, max: tour.guide?.steps.length || 1, now: (tour.active?.index || 0) + 1 }}><View style={[s.progress, { width: `${((tour.active?.index || 0) + 1) / (tour.guide?.steps.length || 1) * 100}%` }]} /></View>}
      <View style={[s.footer, fontScale > 1.4 && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={welcome ? 'Maybe later' : 'Back: previous tip'} disabled={!welcome && tour.active?.index === 0}
          onPress={welcome ? tour.later : tour.back} style={[s.back, !welcome && tour.active?.index === 0 && { opacity: 0.35 }]}>
          <Text style={s.backLabel}>{welcome ? 'Maybe later' : 'Back'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={welcome ? () => tour.start('overview') : tour.next}
          style={s.next}><Text style={s.nextLabel}>{welcome ? 'Show me around' : step?.nextLabel || (last ? 'Finish guide' : 'Next')}</Text><Ionicons name={last && !welcome ? 'checkmark' : 'arrow-forward'} size={17} color="#FFFFFF" accessible={false} /></Pressable>
      </View>
    </Animated.View>
  </View>;
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', inset: 0, zIndex: 10000, elevation: 10000 },
  shade: { position: 'absolute', backgroundColor: SCRIM },
  ring: { position: 'absolute', borderWidth: 2, borderRadius: 14, borderColor: '#8DB9E0', boxShadow: '0px 0px 0px 3px rgba(141,185,224,0.15)' },
  card: { position: 'absolute', backgroundColor: '#FFFFFF', borderRadius: 24, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 18, borderWidth: 1, borderColor: '#DDE7F0', boxShadow: '0px 16px 40px rgba(2,12,22,0.22)' },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  kicker: { color: BLUE, fontSize: 10, lineHeight: 15, letterSpacing: 1.2, fontWeight: '700' },
  close: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  title: { color: INK, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5 },
  body: { color: '#52625F', fontSize: 15, lineHeight: 23 },
  tryButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  tryLabel: { color: BLUE, fontSize: 14, fontWeight: '600' },
  track: { height: 3, borderRadius: 2, backgroundColor: '#EAF0F5', overflow: 'hidden', marginTop: 18 },
  progress: { height: 3, borderRadius: 2, backgroundColor: '#8DB9E0' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  back: { minHeight: 48, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  backLabel: { color: '#526A80', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  next: { flexGrow: 1, flexShrink: 1, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: BLUE, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  nextLabel: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
});
