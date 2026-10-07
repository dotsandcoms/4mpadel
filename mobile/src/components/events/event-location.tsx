import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import type { EventDetail } from '@/lib/events';
import { EventText as Text, useEventAccent } from './website-ui';
type Coordinate = { latitude: number; longitude: number };
const coordinates = new Map<string, Coordinate>();
export function EventLocation({ event, selectedVenue, onSelectVenue }: { event: EventDetail; selectedVenue: string; onSelectVenue: (venue: string) => void }) {
  const accent = useEventAccent();
  const venues = event.venues?.filter(Boolean).length ? event.venues!.filter(Boolean) : event.venue ? [event.venue] : [];
  const venue = venues.includes(selectedVenue) ? selectedVenue : venues[0] || '';
  const query = [venue, venues.length > 1 ? null : event.address, event.city].filter(Boolean).join(' ');
  const [point, setPoint] = useState<Coordinate | null>(coordinates.get(query) || null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const supported = Platform.OS === 'ios' && !!requireOptionalNativeModule('ExpoAppleMaps') && !!requireOptionalNativeModule('ExpoLocation');
  useEffect(() => {
    if (!supported) return;
    let active = true;
    setError(''); setPoint(coordinates.get(query) || null);
    if (coordinates.has(query)) return;
    void (async () => {
      const { geocodeAsync } = await import('expo-location');
      let matches = await geocodeAsync(query);
      if (!matches.length && venues.length === 1 && event.address) matches = await geocodeAsync(event.address);
      if (!matches.length) throw new Error('The venue could not be located. Use Directions to search the address.');
      const result = { latitude: matches[0].latitude, longitude: matches[0].longitude };
      coordinates.set(query, result);
      if (active) setPoint(result);
    })().catch(e => { if (active) setError(e instanceof Error ? e.message : 'The map could not load.'); });
    return () => { active = false; };
  }, [query, event.address, attempt, supported]);
  const maps = supported ? (require('expo-maps') as typeof import('expo-maps')).AppleMaps : null;
  const AppleMap = maps?.View;
  return <View style={{ margin: -20 }}>
    <View style={{ paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#f9fafb', borderBottomWidth: 1, borderColor: '#f3f4f6', gap: 6 }}>{venues.length > 1 ? <>{venues.map(v => <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: venue === v }} onPress={() => onSelectVenue(v)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: venue === v ? `${accent}20` : 'transparent' }}><Text style={{ color: venue === v ? '#16251f' : '#334155', fontSize: 14, fontWeight: venue === v ? '700' : '400' }}>{v}</Text></Pressable>)}<Text style={{ color: '#64748b', fontSize: 12 }}>{event.city}</Text></> : <Text style={{ color: '#334155', fontSize: 14, lineHeight: 20 }}>{[event.venue, event.address, event.city].filter(Boolean).join(' · ')}</Text>}</View>
    <View style={{ height: 220, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' }}>{AppleMap && point ? <AppleMap key={query} colorScheme={maps?.MapColorScheme.LIGHT} uiSettings={{ myLocationButtonEnabled: false }} style={{ width: '100%', height: 220 }} cameraPosition={{ coordinates: point, zoom: 15 }} markers={[{ id: 'venue', coordinates: point, title: venue || 'Event venue', tintColor: accent }]} properties={{ isMyLocationEnabled: false }} /> : error || !supported ? <View style={{ padding: 24, gap: 12 }}><Text style={{ color: '#64748b', fontSize: 13 }}>{error || 'The native map will be available after the updated iOS build is installed.'}</Text>{supported && <Pressable accessibilityRole="button" onPress={() => setAttempt(attempt + 1)}><Text style={{ color: '#2563eb' }}>Retry map</Text></Pressable>}</View> : <ActivityIndicator color={accent} />}</View>
  </View>;
}
