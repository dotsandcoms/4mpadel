import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { coordinate, type Coordinate } from '@/lib/clubs';
import { areaLabel, fetchHomeWeather, profileRegionLabel, type HomeWeather } from '@/lib/home-weather';
import { useForegroundClock } from './use-foreground-clock';
import { useScreenActive } from './use-screen-active';

type Place = { label: string; point: Coordinate | null };
type ClubArea = { city: string; country: string; point: Coordinate | null };
const supportsLocation = Platform.OS === 'ios' || Platform.OS === 'android';
const weatherRefreshMs = 15 * 60_000;

async function currentPoint(): Promise<Coordinate | null> {
  const cached = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000, requiredAccuracy: 5000 }).catch(() => null);
  if (cached) return coordinate(cached.coords.latitude, cached.coords.longitude);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 8000); }),
    ]);
    return position ? coordinate(position.coords.latitude, position.coords.longitude) : null;
  } finally {
    clearTimeout(timer);
  }
}

export function useHomeConditions(enabled: boolean, region?: string | null, club?: ClubArea | null) {
  const active = useScreenActive();
  const now = useForegroundClock(weatherRefreshMs, enabled);
  const [attempt, setAttempt] = useState(0);
  const [device, setDevice] = useState<Place | null>(null);
  const [conditions, setConditions] = useState<{ area: string; weather: HomeWeather | null; expiresAt: number }>();
  const requesting = useRef(false);

  useEffect(() => {
    if (!active || !enabled || !supportsLocation) return;
    let current = true;
    void (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!current) return;
      const point = permission.granted && await Location.hasServicesEnabledAsync() ? await currentPoint() : null;
      if (!current) return;
      if (!point) { setDevice(null); return; }
      const [address] = await Location.reverseGeocodeAsync({ latitude: +point.latitude.toFixed(2), longitude: +point.longitude.toFixed(2) }).catch(() => []);
      if (current) setDevice({ label: areaLabel(address?.city || address?.subregion || address?.region, address?.country) || 'Near you', point });
    })().catch(() => { if (current) setDevice(null); });
    return () => { current = false; };
  }, [active, enabled, now, attempt]);

  const savedLabel = club?.city ? areaLabel(club.city, club.country) : profileRegionLabel(region);
  const place = enabled ? device ?? { label: savedLabel, point: club?.point ?? null } : null;
  const useDeviceArea = !!device && place === device;
  const latitude = place?.point?.latitude, longitude = place?.point?.longitude;
  const area = latitude != null && longitude != null ? `${latitude.toFixed(1)},${longitude.toFixed(1)}` : '';

  useEffect(() => {
    if (!active || latitude == null || longitude == null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    void (async () => {
      if (useDeviceArea) {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted || !await Location.hasServicesEnabledAsync()) return null;
      }
      return controller.signal.aborted ? null : fetchHomeWeather(latitude, longitude, controller.signal);
    })().then(weather => {
      if (!controller.signal.aborted) setConditions({ area, weather, expiresAt: Date.now() + 3 * weatherRefreshMs });
    }).catch(() => {}).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, area, latitude, longitude, now, useDeviceArea]);

  const requestLocation = async () => {
    if (requesting.current) return;
    requesting.current = true;
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) await Location.requestForegroundPermissionsAsync();
      else if (!permission.granted || !await Location.hasServicesEnabledAsync()) await Linking.openSettings();
    } catch {} finally {
      requesting.current = false;
      setAttempt(value => value + 1);
    }
  };
  return {
    location: place?.label || null,
    weather: conditions?.area === area && conditions.expiresAt > now ? conditions.weather : null,
    onEnableLocation: supportsLocation && enabled && !device ? requestLocation : undefined,
  };
}
