import { verifyPlatformClubAction } from './liveClubOperations.js';

const placeIdPattern = /^[A-Za-z0-9_-]{1,255}$/;
const googleMapsLinkPattern = /^https:\/\/(maps\.app\.goo\.gl\/|maps\.google\.com\/|(www\.)?google\.com\/maps([/?]|$))/i;
const dayKeys = ['sun','mon','tue','wed','thu','fri','sat'];
const clock = value => /^\d{4}$/.test(value || '') ? `${value.slice(0,2)}:${value.slice(2)}` : null;

export function googleMapsReviewLink(value) {
  const input = String(value || '').trim();
  if (input.length > 2048 || /\s/.test(input) || !googleMapsLinkPattern.test(input)) return null;
  try {
    const url = new URL(input);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? input : null;
  } catch {
    return null;
  }
}

async function requestPlaces({ client, scopeId, userId, signal }, body) {
  const current = () => !signal?.aborted;
  signal?.throwIfAborted();
  await verifyPlatformClubAction(client, scopeId, userId, current);
  const { data, error } = await client.functions.invoke('scan-club-google-reviewed', { body, signal });
  signal?.throwIfAborted();
  await verifyPlatformClubAction(client, scopeId, userId, current);
  if (error || data?.place_version !== 1) throw new Error('Google Places is unavailable. Try again or paste a Google Maps link.');
  return data;
}

export async function findClubGooglePlaces(context, value) {
  const query = value.trim();
  if (query.length < 2 || query.length > 160) throw new Error('Enter 2 to 160 characters to search Google Places.');
  const { results } = await requestPlaces(context, { action: 'search', query });
  if (!Array.isArray(results)) throw new Error('Google Places did not return a valid results list. Try again.');
  const valid = results.filter(place => placeIdPattern.test(place?.place_id || '') && typeof place.name === 'string');
  return [...new Map(valid.map(place => [place.place_id, { id:place.place_id, name:place.name, address:place.formatted_address || '' }])).values()].slice(0,12);
}

function openingHours(periods) {
  if (!Array.isArray(periods) || !periods.length) return null;
  const hours = Object.fromEntries(dayKeys.map(day => [day,{open:'00:00',close:'00:00',closed:true}]));
  let recorded = false;
  for (const period of periods) {
    const day = dayKeys[period.open?.day], open = clock(period.open?.time);
    if (!day || !open) continue;
    hours[day] = {open,close:clock(period.close?.time) || '23:59',closed:false};
    recorded = true;
  }
  return recorded ? hours : null;
}

export async function selectClubGooglePlace(context, placeId) {
  if (!placeIdPattern.test(placeId || '')) throw new Error('Choose a Google Places result.');
  const { place: details } = await requestPlaces(context, { action: 'details', place_id: placeId });
  if (details?.place_id !== placeId || !details.name?.trim()) throw new Error('Google returned a different listing. Search again.');
  const addressPart = type => details.address_components?.find(component => component.types?.includes(type))?.long_name;
  const { lat, lng } = details.geometry?.location || {};
  const fields = Object.fromEntries(Object.entries({
    address: details.formatted_address,
    city: addressPart('locality') || addressPart('sublocality') || addressPart('postal_town'),
    province: addressPart('administrative_area_level_1'),
    country: addressPart('country'),
    lat,
    lng,
    website_url: details.website,
    contact_phone: details.international_phone_number,
    opening_hours: openingHours(details.opening_hours?.periods),
  }).filter(([,value]) => value != null && value !== ''));
  return { kind:'place', place_id:placeId, name:details.name, address:details.formatted_address || null, fields,
    url:googleMapsReviewLink(details.url), rating:details.rating ?? null, review_count:details.user_ratings_total ?? null,
    business_status:details.business_status || null };
}
