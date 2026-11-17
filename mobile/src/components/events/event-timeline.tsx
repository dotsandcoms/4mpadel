import { onAccent } from '@/theme/tokens';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { EventText as Text, EventIcon, useEventAccent, type EventIconName } from './website-ui';
import type { EventDetail } from '@/lib/events';
import { isEarlyBirdActive } from '@/lib/event-rules';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { useScreenActive } from '@/hooks/use-screen-active';
import { canDownloadPlayerList } from '@/lib/event-documents';
const panel = { borderRadius: 16, borderColor: '#DCE2DA', borderWidth: 1, backgroundColor: '#FFFFFF' };

function ActiveStageIcon({ icon, accent }: { icon: EventIconName; accent: string }) {
  const reduced = useReducedMotion();
  const active = useScreenActive();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduced || !active) { cancelAnimation(pulse); pulse.value = 0; return; }
    pulse.value = 0;
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(pulse);
  }, [pulse, reduced, active]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.65 * (1 - pulse.value), transform: [{ scale: 1 + 0.4 * pulse.value }] }));
  return <View style={{ width: 40, height: 40, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: accent }, halo]} />
    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#386018', alignItems: 'center', justifyContent: 'center' }}><EventIcon name={icon} size={16} color="#FFFFFF" /></View>
  </View>;
}
export function RegistrationCountdown({ event, onRegister, label, onDownloadPlayers, downloadingPlayers = false }: { event: EventDetail; onRegister: () => void; label: string | null; onDownloadPlayers?: () => void; downloadingPlayers?: boolean }) {
  const accent = useEventAccent();
  const now = useForegroundClock();
  const { width } = useWindowDimensions();
  const opening = !!event.registration_opens_at && new Date(event.registration_opens_at).getTime() > now;
  const raw = opening ? event.registration_opens_at : event.registration_closes_at;
  const end = raw ? new Date(raw) : null;
  const diff = end ? Math.max(0, end.getTime() - now) : 0;
  if (!end && !label) return null;
  const values = [Math.floor(diff / 86400000), Math.floor(diff / 3600000) % 24, Math.floor(diff / 60000) % 60, Math.floor(diff / 1000) % 60];
  const compact = width < 420;
  const dateLabel = end ? `${end.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][end.getMonth()]}, ${end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}` : '';
  const managing = label === 'Manage Entry';
  return <View style={{ ...panel, marginTop: 8, paddingHorizontal: 12, paddingVertical: 12, minHeight: 60, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
    <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: compact ? 7 : 8 }}>
      <View style={{ width: compact ? 32 : 36, height: compact ? 32 : 36, borderRadius: 18, borderWidth: 1, borderColor: `${accent}66`, backgroundColor: `${accent}20`, alignItems: 'center', justifyContent: 'center' }}><EventIcon name="clock" size={16} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: '#65726B', fontSize: 9, fontWeight: '600', letterSpacing: 0.3 }}>{`REGISTRATION ${opening ? 'OPENS' : end && diff === 0 ? 'CLOSED' : end ? 'CLOSES' : 'OPEN'}`}</Text>
        {end && <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ color: "#386018", fontSize: 12, fontWeight: '700', marginTop: 2 }}>{dateLabel}</Text>}
      </View>
    </View>
    {diff > 0 && <View style={{ flexDirection: 'row', gap: compact ? 4 : 6, flexShrink: 0 }}>
      {values.map((n, i) => <View key={i} style={{ minWidth: compact ? 20 : 24, alignItems: 'center' }}>
        <Text style={{ fontSize: compact ? 14 : 16, lineHeight: compact ? 17 : 19, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{String(n).padStart(2, '0')}</Text>
        <Text style={{ fontSize: compact ? 7 : 8, lineHeight: 10, color: '#65726B', marginTop: 3 }}>{['DAYS', 'HRS', 'MINS', 'SECS'][i]}</Text>
      </View>)}
    </View>}
    {label && <Pressable accessibilityRole="button" onPress={onRegister} hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }} style={managing ? { flexShrink: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: compact ? 9 : 12, paddingVertical: 8, borderRadius: 12, borderColor: '#B9CDB0', borderWidth: 1, backgroundColor: '#F0F6EA' } : { flexShrink: 0, minHeight: 44, justifyContent: 'center', paddingHorizontal: compact ? 10 : 12, paddingVertical: 8, borderRadius: 24, borderColor: accent, borderWidth: 1, backgroundColor: accent, boxShadow: `0px 1px 6px ${accent}59`, experimental_backgroundImage: `linear-gradient(145deg, ${accent} 0%, ${accent} 50%, ${accent}cc 100%)` } as ViewStyle}><Text style={{ color: managing ? '#244A16' : onAccent(accent), fontSize: compact ? 10 : 11, fontWeight: '700' }}>{managing ? 'Manage entry' : label.toUpperCase()}</Text>{managing && <EventIcon name="chevron.right" size={12} color="#244A16" />}</Pressable>}
    {onDownloadPlayers && canDownloadPlayerList(event, new Date(now)) && <Pressable accessibilityRole="button" accessibilityLabel="Players list. Download PDF" accessibilityState={{ disabled: downloadingPlayers, busy: downloadingPlayers }} disabled={downloadingPlayers} onPress={onDownloadPlayers} hitSlop={4} style={{ minHeight: 36, paddingHorizontal: 10, flexShrink: 0, borderRadius: 10, backgroundColor: '#F0F6EA', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }}>{downloadingPlayers ? <ActivityIndicator size="small" color="#386018" /> : <EventIcon name="arrow.down.document" size={17} color="#386018" />}<Text style={{ color: '#386018', fontSize: 11, fontWeight: '600' }}>{downloadingPlayers ? 'Preparing…' : 'Players list'}</Text></Pressable>}
  </View>;
}
/** Dates and step ordering mirror website TournamentProgressBar. */
export function EventTimeline({ event, hasDraw }: { event: EventDetail; hasDraw: boolean }) {
  const accent = useEventAccent();
  const now = useForegroundClock(60000);
  const [showDateNote, setShowDateNote] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const { width, fontScale } = useWindowDimensions();
  const parse = (raw?: string | null) => raw ? new Date(raw.includes('T') ? raw : `${raw.slice(0, 10)}T00:00:00`).getTime() : 0;
  const opens = parse(event.registration_opens_at), closes = parse(event.registration_closes_at), early = parse(event.early_bird_ends_at);
  const start = parse(event.start_date), end = parse(event.end_date || event.start_date) + 86400000 - 1;
  const steps: { label: string; at: number; until?: number; icon: EventIconName; time?: boolean; published?: boolean }[] = [
    ...(opens ? [{ label: 'Registration Open', at: opens, until: closes || undefined, icon: 'person.2' as const }] : []),
    ...(early && event.early_bird_fee != null ? [{ label: 'Early Bird Entries', at: opens || 1, until: early, icon: 'bolt' as const, time: true }] : []),
    ...(closes ? [{ label: 'Registration Closed', at: closes, icon: 'person.crop.circle.badge.xmark' as const, time: true }] : []),
    ...(event.draw_released ? [{ label: 'Draw Published', at: parse(event.draw_released), icon: 'list.bullet.rectangle' as const, published: hasDraw }] : []),
    ...(start ? [{ label: 'Tournament Live', at: start, until: end, icon: 'circle.inset.filled' as const }, { label: 'Tournament Finished', at: end, icon: 'trophy' as const }] : []),
    ...(event.rankings_updated_at ? [{ label: 'Rankings Updated', at: parse(event.rankings_updated_at), icon: 'chart.bar' as const }] : []),
  ];
  let active = -1;
  steps.forEach((step, i) => { if (now >= step.at || (step.label === 'Draw Published' && hasDraw)) active = i; });
  const windowIndex = steps.findIndex(s => s.until && now >= s.at && now <= s.until);
  if (windowIndex >= 0) active = windowIndex;
  if (isEarlyBirdActive(event, new Date(now))) { const index = steps.findIndex(s => s.label === 'Early Bird Entries'); if (index >= 0 && now >= steps[index].at) active = index; }

  const stageCount = steps.length;
  const availableWidth = viewportWidth || width - 66;
  const minimumStageWidth = 108 * Math.max(1, fontScale);
  const visibleCount = Math.max(1, Math.min(stageCount, Math.floor(availableWidth / minimumStageWidth)));
  const stageWidth = Math.max(minimumStageWidth, availableWidth / visibleCount);
  const focusIndex = Math.max(0, active);
  const focusLabel = steps[focusIndex]?.label;
  useEffect(() => {
    // Wait until the native track is laid out. Preserve manual scrolling until
    // the event, current stage or layout changes.
    if (!focusLabel || !viewportWidth || trackWidth < stageWidth * stageCount - 1) return;
    const firstVisibleIndex = Math.max(0, focusIndex - Math.floor(visibleCount / 2));
    const x = Math.max(0, Math.min(firstVisibleIndex * stageWidth, trackWidth - viewportWidth));
    scroll.current?.scrollTo({ x, animated: false });
  }, [event.id, focusIndex, focusLabel, stageCount, stageWidth, trackWidth, viewportWidth, visibleCount]);

  if (!stageCount) return null;
  return <View style={{ ...panel, marginTop: 12, paddingHorizontal: 12, paddingVertical: 16 }}>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 16 }}><EventIcon name="bolt" size={14} /><Text style={{ flex: 1, fontSize: 10, letterSpacing: 0.4 }}>TOURNAMENT PROGRESS</Text><Pressable accessibilityRole="button" accessibilityLabel="Dates and times are subject to change" accessibilityState={{ expanded: showDateNote }} onPress={() => setShowDateNote(!showDateNote)} hitSlop={10}><EventIcon name="info.circle" size={16} color="#65726B" /></Pressable></View>
    {showDateNote && <Text style={{ fontSize: 11, color: '#65726B', marginBottom: 8 }}>Dates and times are subject to change</Text>}
    <ScrollView ref={scroll} horizontal nestedScrollEnabled scrollEnabled={stageWidth * stageCount > viewportWidth + 1}
      onLayout={({ nativeEvent }) => setViewportWidth(nativeEvent.layout.width)}
      onContentSizeChange={width => setTrackWidth(width)}
      contentContainerStyle={{ flexGrow: 1, alignItems: 'flex-start', paddingVertical: 6 }}>
      {steps.length > 1 && <View pointerEvents="none" style={{ position: 'absolute', top: 26, left: stageWidth / 2, right: stageWidth / 2, height: 1, backgroundColor: '#DCE2DA' }} />}
      {steps.map((step, i) => {
        const live = i === active && (!step.until || now <= step.until);
        const showLive = live && ['Registration Open', 'Early Bird Entries', 'Tournament Live'].includes(step.label);
        const done = i < active || !!step.published || (!!step.until && now > step.until);
        const color = live || done ? '#386018' : '#65726B';
        const dateLabel = step.label === 'Early Bird Entries' && now > (step.until || 0) ? 'ENDED' : step.label === 'Tournament Live' ? `${new Date(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`.toUpperCase().replace(/\bSEP\b/g, 'SEPT') : step.label === 'Registration Open' ? '' : new Date(step.until && step.label === 'Early Bird Entries' ? step.until : step.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(step.time ? { hour: '2-digit', minute: '2-digit' } : {}) }).toUpperCase().replace(/\bSEP\b/g, 'SEPT').replace(' AT ', ' · ');
        return <View key={step.label} accessible accessibilityLabel={`${step.label}. ${live ? 'Current stage.' : done ? 'Completed.' : 'Upcoming.'} ${showLive ? 'Live.' : dateLabel}`} style={{ width: stageWidth, flexShrink: 0, alignItems: 'center', paddingHorizontal: 3 }}>
          {live ? <ActiveStageIcon icon={step.icon} accent={accent} /> : <View style={{ width: 40, height: 40, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 32, height: 32, borderRadius: 16, borderColor: color, borderWidth: 1, backgroundColor: '#EDF0EB', alignItems: 'center', justifyContent: 'center' }}><EventIcon name={step.icon} size={14} color={color} /></View></View>}
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9} style={{ alignSelf: 'stretch', color: live ? '#173909' : color, fontSize: 10, lineHeight: 14, textAlign: 'center', fontWeight: live ? '800' : '600', marginTop: 8 }}>{step.label}</Text>
          {showLive ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9, backgroundColor: '#386018' }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#D7E7C5' }} /><Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 }}>LIVE</Text></View> : <Text style={{ color, fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 4 }}>{dateLabel}</Text>}
        </View>;
      })}
    </ScrollView>
  </View>;
}
