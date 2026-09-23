import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { EventText as Text, EventIcon, useEventAccent, type EventIconName } from './website-ui';
import type { EventDetail } from '@/lib/events';
import { isEarlyBirdActive } from '@/lib/event-rules';
const panel = { borderRadius: 16, borderColor: '#DCE2DA', borderWidth: 1, backgroundColor: '#FFFFFF' };
export function RegistrationCountdown({ event, onRegister, label }: { event: EventDetail; onRegister: () => void; label: string | null }) {
  const accent = useEventAccent();
  const [now, setNow] = useState(Date.now());
  const { width } = useWindowDimensions();
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const opening = !!event.registration_opens_at && new Date(event.registration_opens_at).getTime() > now;
  const raw = opening ? event.registration_opens_at : event.registration_closes_at;
  const end = raw ? new Date(raw) : null;
  const diff = end ? Math.max(0, end.getTime() - now) : 0;
  if (!end && !label) return null;
  const values = [Math.floor(diff / 86400000), Math.floor(diff / 3600000) % 24, Math.floor(diff / 60000) % 60, Math.floor(diff / 1000) % 60];
  const compact = width < 420;
  const dateLabel = end ? `${end.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'][end.getMonth()]}, ${end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}` : '';
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
    {label && <Pressable accessibilityRole="button" onPress={onRegister} hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }} style={{ flexShrink: 0, minHeight: 44, justifyContent: 'center', paddingHorizontal: compact ? 10 : 12, paddingVertical: 8, borderRadius: 24, borderColor: accent, borderWidth: 1, backgroundColor: accent, boxShadow: `0px 1px 6px ${accent}59`, experimental_backgroundImage: `linear-gradient(145deg, ${accent} 0%, ${accent} 50%, ${accent}cc 100%)` } as ViewStyle}><Text style={{ color: '#000', fontSize: compact ? 9 : 10, fontWeight: '700' }}>{label.toUpperCase()}</Text></Pressable>}
  </View>;
}
/** Dates and step ordering mirror website TournamentProgressBar. */
export function EventTimeline({ event, hasDraw }: { event: EventDetail; hasDraw: boolean }) {
  const accent = useEventAccent();
  const [now, setNow] = useState(Date.now());
  const { width } = useWindowDimensions();
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
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
  steps.forEach((step, i) => { if (now >= step.at) active = i; });
  const windowIndex = steps.findIndex(s => s.until && now >= s.at && now <= s.until);
  if (windowIndex >= 0) active = windowIndex;
  if (isEarlyBirdActive(event, new Date(now))) { const index = steps.findIndex(s => s.label === 'Early Bird Entries'); if (index >= 0 && now >= steps[index].at) active = index; }
  if (!steps.length) return null;
  return <View style={{ ...panel, marginTop: 12, paddingHorizontal: 12, paddingVertical: 16 }}>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 16 }}><EventIcon name="bolt" size={14} /><Text style={{ fontSize: 10, letterSpacing: 0.4 }}>TOURNAMENT PROGRESS</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
      {steps.map((step, i) => {
        const live = i === active && (!step.until || now <= step.until);
        const done = i < active || !!step.published || (!!step.until && now > step.until);
        const color = live || done ? '#386018' : '#65726B';
        return <View key={step.label} style={{ width: (width - 66) / steps.length, alignItems: 'center', paddingHorizontal: 4 }}>
          {i < steps.length - 1 && <View style={{ position: 'absolute', top: 16, left: '70%', width: '60%', height: 1, backgroundColor: done ? accent : '#65726B' }} />}
          <View style={{ width: 32, height: 32, borderRadius: 16, borderColor: color, borderWidth: 1, backgroundColor: live ? `${accent}20` : '#EDF0EB', alignItems: 'center', justifyContent: 'center' }}><EventIcon name={step.icon} size={14} color={color} /></View>
          <Text style={{ color, fontSize: 9, lineHeight: 12, textAlign: 'center', fontWeight: '600', marginTop: 8 }}>{step.label}</Text>
          <Text style={{ color, fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 4 }}>{live ? '● LIVE' : step.label === 'Early Bird Entries' && now > (step.until || 0) ? 'ENDED' : step.label === 'Tournament Live' ? `${new Date(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`.toUpperCase().replace(/\bSEP\b/g, 'SEPT') : step.label === 'Registration Open' ? '' : new Date(step.until && step.label === 'Early Bird Entries' ? step.until : step.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(step.time ? { hour: '2-digit', minute: '2-digit' } : {}) }).toUpperCase().replace(/\bSEP\b/g, 'SEPT').replace(' AT ', '\n')}</Text>
        </View>;
      })}
    </ScrollView>
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 14 }}><EventIcon name="info.circle" size={12} color="#65726B" /><Text style={{ fontSize: 9, color: '#65726B' }}>Dates and times are subject to change</Text></View>
  </View>;
}
