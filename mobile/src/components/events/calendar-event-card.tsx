import { Image } from 'expo-image';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { EventText as Text, EventIcon, lime } from './website-ui';
import { eventImage, type EventDetail } from '@/lib/events';
import { formatEventRange } from '@/lib/home';
import { sapaTone } from '@/theme/sapa';

/** Website CalendarEventItem: date rail, portrait, badges, metadata, independent schedule action. */
export function CalendarEventCard({ event, saved, onPress, onSave }: { event: EventDetail; saved: boolean; onPress: () => void; onSave: () => void }) {
  const { width } = useWindowDimensions();
  const small = width < 420;
  const date = event.start_date ? new Date(`${event.start_date.slice(0, 10)}T12:00:00`) : null;
  const tone = sapaTone(event.sapa_status);
  return <View style={{ marginHorizontal: 16, marginBottom: 12, borderRadius: 16, backgroundColor: '#141414', borderColor: '#ffffff1a', borderWidth: 1, boxShadow: '0px 4px 6px rgba(0,0,0,0.1)' }}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${event.event_name}, ${event.event_dates || formatEventRange(event.start_date, event.end_date)}`} style={{ flexDirection: 'row', gap: small ? 10 : 12, paddingHorizontal: small ? 12 : 16, paddingVertical: 16, minHeight: 116, alignItems: 'center' }}>
      <View style={{ width: small ? 34 : 48, paddingRight: small ? 8 : 12, borderRightWidth: 1, borderRightColor: '#ffffff1a', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 18, lineHeight: 22, fontWeight: '700' }}>{date ? String(date.getDate()).padStart(2, '0') : '—'}</Text>
        <Text style={{ color: lime, fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 1 }}>{date?.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</Text>
        <Text style={{ color: '#9ca3af', fontSize: 8, lineHeight: 12, letterSpacing: 1 }}>{date?.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}</Text>
      </View>
      <Image source={eventImage(event)} style={{ width: 64, height: 80, borderRadius: 8, borderWidth: 1, borderColor: '#ffffff0d' }} contentFit="cover" />
      <View style={{ flex: 1, minWidth: 0, gap: 7, paddingRight: 19 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <View style={{ borderColor: tone.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ fontSize: 8, lineHeight: 10, fontWeight: '800', color: tone.text, letterSpacing: 0.8 }}>{(event.sapa_status || 'None').toUpperCase()}</Text></View>
          {event.event_status === 'cancelled' && <View style={{ backgroundColor: '#ef444426', borderColor: '#ef444480', borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: '#fca5a5', fontSize: 9, fontWeight: '700' }}>CANCELLED</Text></View>}
          {event.registration_access === 'code' && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: '#fb923c66', backgroundColor: '#fb923c1a', borderWidth: 1, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 3 }}><EventIcon name="lock" size={9} color="#fdba74" /><Text style={{ fontSize: 8, lineHeight: 10, fontWeight: '800', letterSpacing: 0.7, color: '#fdba74' }}>CODE REQUIRED</Text></View>}
        </View>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><EventIcon name="calendar" size={12} /><Text numberOfLines={1} style={{ flex: 1, fontSize: 9, fontWeight: '600', color: lime }}>{event.event_dates || formatEventRange(event.start_date, event.end_date)}</Text></View>
        <Text numberOfLines={2} style={{ fontSize: 12, fontWeight: '600', lineHeight: 16, letterSpacing: -0.15 }}>{event.event_name?.toUpperCase()}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 24 }}><EventIcon name="mappin.and.ellipse" size={12} color="#839c20" /><Text numberOfLines={1} style={{ flex: 1, fontSize: 9, color: '#9ca3af' }}>{event.venue}</Text></View>
          {!!event.city && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}><EventIcon name="map" size={12} color="#a3cc00" /><Text numberOfLines={1} style={{ maxWidth: small ? 64 : 80, fontSize: 9, color: '#a3cc00' }}>{event.city}</Text></View>}
          {event.registered_players != null && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: '#CCFF0033', backgroundColor: '#CCFF001a', borderRadius: 6 }}><EventIcon name="person.2" size={12} /><Text style={{ fontSize: 9, lineHeight: 10, fontWeight: '700' }}>{event.registered_players}</Text></View>}
        </View>
      </View>
      <View style={{ position: 'absolute', right: 14, top: '50%' }}><EventIcon name="chevron.right" size={20} color="#718900" /></View>
    </Pressable>
    <Pressable onPress={onSave} accessibilityRole="button" accessibilityLabel={`${saved ? 'Remove from' : 'Add to'} My Schedule: ${event.event_name}`} accessibilityState={{ selected: saved }} hitSlop={8} style={{ position: 'absolute', right: 8, top: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: saved ? lime : '#0008', borderColor: saved ? lime : '#ffffff1a', borderWidth: 1, alignItems: 'center', justifyContent: 'center' }}><EventIcon name={saved ? 'checkmark' : 'plus'} size={16} color={saved ? '#000' : lime} /></Pressable>
  </View>;
}
