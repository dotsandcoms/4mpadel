import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { EventText as Text, EventIcon } from './website-ui';
import { eventImage, type EventDetail } from '@/lib/events';
import { formatEventRange } from '@/lib/home';
import { lightSapaTone, sapaLabel } from '@/theme/sapa';
import { lightBrand as brand } from '@/theme/tokens';

/** Separate event discovery and schedule actions, with room for real event names. */
export function CalendarEventCard({ event, saved, onPress, onSave }: {
  event: EventDetail; saved: boolean; onPress: () => void; onSave: () => void;
}) {
  const tone = lightSapaTone(event.sapa_status);
  const tier = sapaLabel(event.sapa_status);
  const date = event.event_dates || formatEventRange(event.start_date, event.end_date);
  return <View style={{ marginHorizontal: 16, marginBottom: 12, borderRadius: 18, backgroundColor: brand.elevated, borderColor: brand.edge, borderWidth: 1, overflow: 'hidden' }}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${event.event_name}, ${date}. View event and entry options.`}
      style={{ flexDirection: 'row', gap: 14, padding: 16, alignItems: 'flex-start' }}>
      <Image source={eventImage(event)} style={{ width: 64, height: 88, borderRadius: 10 }} contentFit="cover" />
      <View style={{ flex: 1, gap: 7 }}>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {!!tier && <Text style={{ fontSize: 11, fontWeight: '700', color: tone.text }}>{tier.toUpperCase()}</Text>}
          {event.event_status === 'cancelled' && <Text style={{ color: brand.danger, fontSize: 11, fontWeight: '700' }}>CANCELLED</Text>}
          {event.registration_access === 'code' && <Text style={{ color: '#87520B', fontSize: 11, fontWeight: '700' }}>CODE REQUIRED</Text>}
        </View>
        <Text style={{ fontSize: 16, fontWeight: '700', lineHeight: 21 }}>{event.event_name}</Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: brand.accent }}>{date}</Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: brand.muted }}>{[event.venue, event.city].filter(Boolean).join(' · ')}</Text>
      </View>
    </Pressable>
    <View style={{ paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: brand.edge, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
        <EventIcon name="person.2" size={14} color={brand.muted} />
        <Text style={{ fontSize: 12, color: brand.muted }}>{event.registered_players == null ? 'View event details' : `${event.registered_players} players entered`}</Text>
      </View>
      <Pressable onPress={onSave} accessibilityRole="button" accessibilityLabel={`${saved ? 'Remove from' : 'Add to'} My Schedule: ${event.event_name}`} accessibilityState={{ selected: saved }}
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
        <EventIcon name={saved ? 'checkmark' : 'plus'} size={16} color={brand.accent} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: brand.accent }}>{saved ? 'Scheduled' : 'Save event'}</Text>
      </Pressable>
    </View>
  </View>;
}
