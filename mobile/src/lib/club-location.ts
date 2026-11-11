import * as Location from 'expo-location';
import { coordinate, type Coordinate } from './clubs';

type LocationApi = Pick<typeof Location, 'hasServicesEnabledAsync' | 'getForegroundPermissionsAsync' | 'requestForegroundPermissionsAsync' | 'getCurrentPositionAsync'>;
export type ClubLocationResult = { kind: 'located'; coordinate: Coordinate; accuracy: number | null } | { kind: 'denied'; canAskAgain: boolean } | { kind: 'unavailable' };
/** Called only after the user chooses Near me. One foreground fix; no tracking or storage. */
export async function locateNearbyClubs(api: LocationApi = Location, timeoutMs = 12000): Promise<ClubLocationResult> {
  if (!await api.hasServicesEnabledAsync()) return { kind: 'unavailable' };
  let permission = await api.getForegroundPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await api.requestForegroundPermissionsAsync();
  if (!permission.granted) return { kind: 'denied', canAskAgain: permission.canAskAgain };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fix = await Promise.race([
      api.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Location timed out')), timeoutMs); }),
    ]);
    const point = coordinate(fix.coords.latitude, fix.coords.longitude);
    return point ? { kind: 'located', coordinate: point, accuracy: fix.coords.accuracy } : { kind: 'unavailable' };
  } catch { return { kind: 'unavailable' }; }
  finally { if (timer) clearTimeout(timer); }
}
