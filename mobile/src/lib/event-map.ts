import type { EventDetail } from './events';

export type VenueCoordinate = { latitude: number; longitude: number };
type VenueEvent = Pick<EventDetail, 'venue' | 'venues' | 'address' | 'city'>;

export function eventMapLocation(event: VenueEvent, selectedVenue: string) {
  const venues = event.venues?.map(value => value.trim()).filter(Boolean) || [];
  if (!venues.length && event.venue?.trim()) venues.push(event.venue.trim());
  const venue = venues.includes(selectedVenue) ? selectedVenue : venues[0] || '';
  // A shared event address must not send visitors to a different selected venue.
  const address = venues.length <= 1 ? event.address?.trim() || '' : '';
  const query = [venue, address, event.city?.trim()].filter(Boolean).join(' ');
  return { venues, venue, query, address };
}

export async function openEventDirections(query: string, platform: string, openURL: (url: string) => Promise<unknown>) {
  if (!query.trim()) throw new Error('This event does not have a venue address yet.');
  const destination = encodeURIComponent(query.trim());
  if (platform === 'android') {
    try {
      // This URI opens Google Maps directly instead of the browser/app chooser.
      await openURL(`google.navigation:q=${destination}&mode=d`);
      return;
    } catch {
      await openURL(`https://www.google.com/maps/dir/?api=1&destination=${destination}`);
      return;
    }
  }
  await openURL(`https://maps.google.com/?q=${destination}`);
}

const coordinates = new Map<string, VenueCoordinate>();
const pending = new Map<string, Promise<VenueCoordinate>>();
export const cachedVenueCoordinate = (query: string) => coordinates.get(query) || null;

export function resolveVenueCoordinate(query: string, address: string, geocode: (value: string) => Promise<VenueCoordinate[]>) {
  const cached = coordinates.get(query);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(query);
  if (existing) return existing;
  const request = (async () => {
    let matches = await geocode(query);
    if (!matches.length && address && address !== query) matches = await geocode(address);
    const point = matches.find(value => Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
      && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180);
    if (!point) throw new Error('The venue could not be located. Use Directions to search the address.');
    const result = { latitude: point.latitude, longitude: point.longitude };
    coordinates.set(query, result);
    if (coordinates.size > 100) coordinates.delete(coordinates.keys().next().value!);
    return result;
  })().finally(() => { pending.delete(query); });
  pending.set(query, request);
  return request;
}
