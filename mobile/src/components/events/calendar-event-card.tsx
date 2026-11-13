import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EventArtwork } from '@/components/event-artwork';
import { HomeAction } from '@/components/home-action';
import { type EventDetail } from '@/lib/events';
import { localDay } from '@/lib/event-rules';
import { formatEventRange } from '@/lib/home';
import { lightSapaTone, sapaLabel } from '@/theme/sapa';
import { lightBrand as b } from '@/theme/tokens';
import { EventNotificationBell } from './follow-tournament';

/** The poster opens the event; alerts and the personal schedule remain separate actions. */
export function CalendarEventCard({ event, saved, saving = false, onPress, onSave }: {
  event: EventDetail; saved: boolean; saving?: boolean; onPress: () => void; onSave: () => void;
}) {
  const tone = lightSapaTone(event.sapa_status);
  const tier = sapaLabel(event.sapa_status);
  const date = event.event_dates || formatEventRange(event.start_date, event.end_date);
  const today = localDay(new Date());
  const onNow = event.event_status !== 'cancelled' && !!event.start_date && event.start_date.slice(0, 10) <= today && (event.end_date || event.start_date).slice(0, 10) >= today;
  return <View style={s.card}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${event.event_name}, ${date}. View event and entry options.`}
      android_ripple={{ color: b.surface }} style={s.main}>
      <EventArtwork uri={event.image || event.custom_image_url || event.poster_image_url || event.image_url} event={event} style={s.poster} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={s.metadata}>
          {!!tier && <><Text style={[s.tier, { color: tone.text, backgroundColor: tone.bg }]}>{tier === 'FIP event' ? 'FIP' : tier}</Text><Text style={s.meta}>SAPA</Text></>}
          {onNow && <Text style={s.live}>On now</Text>}
          {event.event_status === 'cancelled' && <Text style={[s.meta, { color: b.danger }]}>Cancelled</Text>}
          {event.registration_access === 'code' && <Text style={[s.meta, { color: '#87520B' }]}>Code required</Text>}
        </View>
        <Text style={s.name}>{event.event_name}</Text>
        <Text style={s.date}>{date}</Text>
        <Text style={s.location}>{[event.venue, event.city].filter(Boolean).join(' · ')}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={b.faint} style={{ alignSelf: 'center' }} accessible={false} />
    </Pressable>
    <View style={s.footer}>
      <View style={s.entries}><Ionicons name="people-outline" size={16} color={b.muted} accessible={false} />
        <Text style={s.meta}>{event.registered_players == null ? 'View event details' : `${event.registered_players.toLocaleString('en-ZA')} players entered`}</Text>
      </View>
      <EventNotificationBell eventId={event.id} eventName={event.event_name || 'Tournament'} />
      <HomeAction label={saving ? 'Saving…' : saved ? 'Scheduled' : 'Save event'} compact size="small" disabled={saving}
        kind={saved ? 'primary' : 'link'} icon={saved ? 'scheduleCheck' : 'scheduleAdd'}
        accessibilityLabel={`${saved ? 'Remove from' : 'Add to'} My schedule: ${event.event_name}${saving ? ', saving' : ''}`}
        onPress={onSave} />
    </View>
  </View>;
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 8, borderRadius: 16, backgroundColor: b.elevated, borderColor: b.edge, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  main: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'flex-start' },
  poster: { width: 60, height: 84, borderRadius: 6 },
  metadata: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  tier: { fontSize: 10, lineHeight: 14, fontWeight: '500', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  meta: { color: b.muted, fontSize: 11, lineHeight: 16 },
  live: { color: b.danger, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  name: { color: b.premium, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  date: { color: b.accent, fontSize: 11, lineHeight: 16, fontWeight: '500', fontVariant: ['tabular-nums'] },
  location: { color: b.muted, fontSize: 11, lineHeight: 16 },
  footer: { paddingHorizontal: 10, paddingVertical: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: b.edge, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 },
  entries: { flex: 1, minWidth: 96, paddingLeft: 2, flexDirection: 'row', alignItems: 'center', gap: 4 },
});
