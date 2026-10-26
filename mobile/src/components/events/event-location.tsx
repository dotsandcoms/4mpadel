import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import type { EventDetail } from '@/lib/events';
import { cachedVenueCoordinate, eventMapLocation, resolveVenueCoordinate, type VenueCoordinate } from '@/lib/event-map';
import { EventText as Text, useEventAccent } from './website-ui';

export function EventLocation({ event, selectedVenue, onSelectVenue, onDirections }: {
  event: EventDetail;
  selectedVenue: string;
  onSelectVenue: (venue: string) => void;
  onDirections: () => unknown;
}) {
  const accent = useEventAccent();
  const { venues, venue, query, address } = eventMapLocation(event, selectedVenue);
  const [result, setResult] = useState<{ query: string; point: VenueCoordinate } | null>(null);
  const point = result?.query === query ? result.point : cachedVenueCoordinate(query);
  const [failure, setFailure] = useState<{ query: string; message: string } | null>(null);
  const error = failure?.query === query ? failure.message : '';
  const [attempt, setAttempt] = useState(0);
  const [loadedQuery, setLoadedQuery] = useState('');
  const android = Platform.OS === 'android';
  const moduleName = android ? 'ExpoGoogleMaps' : Platform.OS === 'ios' ? 'ExpoAppleMaps' : null;
  // An absent API key crashes the native Google Maps view, so keep directions usable.
  const configured = !android || !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const supported = !!moduleName && configured && !!requireOptionalNativeModule(moduleName) && !!requireOptionalNativeModule('ExpoLocation');
  const maps = supported ? require('expo-maps') as typeof import('expo-maps') : null;

  useEffect(() => {
    if (!supported || !query) return;
    let active = true;
    setFailure(null);
    setLoadedQuery('');
    const cached = cachedVenueCoordinate(query);
    if (cached) { setResult({ query, point: cached }); return; }
    void (async () => {
      const location = await import('expo-location');
      if (android) {
        let permission = await location.getForegroundPermissionsAsync();
        if (!active) return;
        if (!permission.granted && permission.canAskAgain) permission = await location.requestForegroundPermissionsAsync();
        if (!permission.granted) throw new Error('Allow location access to preview the venue, or use Directions to open Google Maps.');
      }
      if (!active) return;
      const coordinate = await resolveVenueCoordinate(query, address, location.geocodeAsync);
      if (active) setResult({ query, point: coordinate });
    })().catch(error => {
      if (!active) return;
      const message = error instanceof Error && (error.message.startsWith('Allow location access') || error.message.startsWith('The venue could not be located'))
        ? error.message : 'The map preview could not load. Use Directions to find the venue, or try again.';
      setFailure({ query, message });
    });
    return () => { active = false; };
  }, [query, address, attempt, supported, android]);

  useEffect(() => {
    if (!android || !supported || !point || error || loadedQuery === query) return;
    const timer = setTimeout(() => setFailure({ query, message: 'The map preview could not load. Open Google Maps for directions.' }), 15000);
    return () => clearTimeout(timer);
  }, [android, supported, point, query, error, loadedQuery, attempt]);

  const GoogleMap = maps?.GoogleMaps.View;
  const AppleMap = maps?.AppleMaps.View;
  const fallback = !query ? 'The organiser has not added a venue address yet.' : 'The map preview is unavailable. Use Directions to find the venue.';
  return <View style={{ margin: -20 }}>
    <View style={{ paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#f9fafb', borderBottomWidth: 1, borderColor: '#f3f4f6', gap: 6 }}>
      {venues.length > 1 ? <>
        {venues.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: venue === value }} onPress={() => onSelectVenue(value)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: venue === value ? `${accent}20` : 'transparent' }}><Text style={{ color: venue === value ? '#16251f' : '#334155', fontSize: 14, fontWeight: venue === value ? '700' : '400' }}>{value}</Text></Pressable>)}
        <Text style={{ color: '#64748b', fontSize: 12 }}>{event.city}</Text>
      </> : <Text style={{ color: '#334155', fontSize: 14, lineHeight: 20 }}>{[venue, address, event.city].filter(Boolean).join(' · ')}</Text>}
    </View>
    <View style={{ height: 220, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' }}>
      {error || !supported || !query ? <View style={{ padding: 24, gap: 12 }}>
        <Text style={{ color: '#64748b', fontSize: 13 }}>{error || fallback}</Text>
        {query && <Pressable accessibilityRole="button" onPress={onDirections} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: accent, fontWeight: '700' }}>{android ? 'Open Google Maps' : 'Open directions'}</Text></Pressable>}
        {supported && query && <Pressable accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: '#2563eb' }}>Retry map</Text></Pressable>}
      </View> : point && android && GoogleMap ? <GoogleMap key={`${query}:${attempt}`} colorScheme={maps?.GoogleMaps.MapColorScheme.LIGHT} uiSettings={{ myLocationButtonEnabled: false, mapToolbarEnabled: true, zoomControlsEnabled: true }} style={{ width: '100%', height: 220 }} cameraPosition={{ coordinates: point, zoom: 15 }} markers={[{ id: 'venue', coordinates: point, title: venue || 'Event venue' }]} properties={{ isMyLocationEnabled: false }} onMapLoaded={() => setLoadedQuery(query)} />
        : point && AppleMap ? <AppleMap key={query} colorScheme={maps?.AppleMaps.MapColorScheme.LIGHT} uiSettings={{ myLocationButtonEnabled: false }} style={{ width: '100%', height: 220 }} cameraPosition={{ coordinates: point, zoom: 15 }} markers={[{ id: 'venue', coordinates: point, title: venue || 'Event venue', tintColor: accent }]} properties={{ isMyLocationEnabled: false }} />
          : <ActivityIndicator color={accent} />}
    </View>
  </View>;
}
