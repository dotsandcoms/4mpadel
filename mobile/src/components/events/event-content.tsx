import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { EventRichText } from './event-rich-text';
import { Accordion, EventIcon, EventText as Text, useEventAccent } from './website-ui';
import type { EventDetail } from '@/lib/events';
import { fetchEventWeather, type EventWeather } from '@/lib/event-weather';
export function TournamentDetails({ event }: { event: EventDetail }) {
  return <View>{[['Courts', event.courts], ['Balls', event.balls], ['Draw Released', event.draw_released], ['Cut-off Times', event.cut_off_times], ['Tournament Director', event.tournament_director], ['Referees', event.referees]].filter(([, v]) => v).map(([label, value], i) => {
    const text = String(value);
    const fullWidth = /<[a-z][\s\S]*>/i.test(text) || text.length > 100 || text.includes('\n');
    return <View key={label} style={{ borderTopWidth: i ? 1 : 0, borderColor: '#f3f4f6', paddingVertical: fullWidth ? 12 : 8, flexDirection: fullWidth ? 'column' : 'row', justifyContent: 'space-between', gap: fullWidth ? 8 : 16 }}><Text style={{ color: '#64748b', fontSize: 14 }}>{label}</Text>{fullWidth ? <EventRichText html={text} /> : <Text style={{ color: '#0a0a0a', fontSize: 14, flexShrink: 1, textAlign: 'right' }}>{text}</Text>}</View>;
  })}</View>;
}
export function PrizeMoney({ event }: { event: EventDetail }) {
  let parsed: unknown = event.prize_money_breakdown;
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { parsed = []; } }
  const rows = Array.isArray(parsed) ? parsed.map(row => ({ label: String(row?.label || row?.name || '').trim(), amount: row?.amount ?? row?.value ?? '' })).filter(r => r.label && r.amount !== '' && r.amount != null) : [];
  const total = Number(event.prize_money_total || 0);
  if (total <= 0 && !rows.length) return null;
  const money = (amount: unknown) => {
    const raw = String(amount).trim();
    if (raw.startsWith('R')) return raw;
    const n = Number(raw.replace(/[^\d.]/g, ''));
    return `R ${Number.isNaN(n) ? raw : n.toLocaleString('en-GB')}`;
  };
  return <Accordion title="Prize Money" icon="trophy">{total > 0 && <Text style={{ color: '#0f172a', fontSize: 24 }}>{money(total)}</Text>}{rows.length > 0 && <View style={{ gap: 8, paddingTop: total > 0 ? 12 : 0, borderTopWidth: total > 0 ? 1 : 0, borderColor: '#f3f4f6' }}><Text style={{ color: '#64748b', fontSize: 11, letterSpacing: 0.4 }}>PRIZE POOL BREAKDOWN</Text>{rows.map((row, i) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f3f4f6' }}><Text style={{ color: '#475569', fontSize: 14, flex: 1 }}>{row.label}</Text><Text style={{ color: '#0a0a0a', fontSize: 14 }}>{money(row.amount)}</Text></View>)}</View>}</Accordion>;
}
export function EventWeatherSection({ event }: { event: EventDetail }) {
  const accent = useEventAccent();
  const [weather, setWeather] = useState<EventWeather | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setWeather(null); setError(''); setLoading(true);
    void fetchEventWeather(event, controller.signal).then(setWeather).catch(e => { if (!controller.signal.aborted) setError(e.message || 'Weather could not load.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [event.city, event.venue, event.start_date, attempt]);
  if (!event.city && !event.venue) return null;
  return <Accordion title="Weather Forecast" icon="cloud">{loading ? <ActivityIndicator color={accent} /> : weather ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}><View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: `${accent}15`, alignItems: 'center', justifyContent: 'center' }}><EventIcon name="cloud" size={28} color="#0a0a0a" /></View><View><Text style={{ color: '#0f172a', fontSize: 24 }}>{Math.round(weather.temp)}°C</Text><Text style={{ color: '#6b7280', fontSize: 12 }}>{weather.condition}</Text></View></View> : <View style={{ gap: 12 }}><Text style={{ color: '#64748b', fontSize: 12 }}>{error || 'No forecast is available for this location.'}</Text><Pressable accessibilityRole="button" onPress={() => setAttempt(attempt + 1)}><Text style={{ color: '#2563eb', fontSize: 13 }}>Retry forecast</Text></Pressable></View>}</Accordion>;
}
