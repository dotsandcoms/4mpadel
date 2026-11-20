const placeId = /^[A-Za-z0-9_-]{1,255}$/;
const control = /[\u0000-\u001f\u007f]/u;
const addressTypes = new Set(['locality','sublocality','postal_town','administrative_area_level_1','country']);
const businessStatuses = new Set(['OPERATIONAL','CLOSED_TEMPORARILY','CLOSED_PERMANENTLY']);

export function googlePlaceSearchQuery(value) {
  if (typeof value !== 'string') return null;
  const query = value.trim();
  return query.length >= 2 && query.length <= 160 && !control.test(query) ? query : null;
}

export const validGooglePlaceId = value => typeof value === 'string' && placeId.test(value);

const text = (value,max) => typeof value === 'string' && !control.test(value) ? value.trim().slice(0,max) || null : null;
const bounded = (value,min,max) => Number.isFinite(value) && value >= min && value <= max ? value : null;

function webUrl(value, maps = false) {
  if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value) || control.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || !['http:','https:'].includes(url.protocol)) return null;
    if (maps && (url.protocol !== 'https:' || url.port
      || !(['maps.google.com','maps.app.goo.gl'].includes(url.hostname)
        || (['www.google.com','google.com'].includes(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname))))) return null;
    return url.href;
  } catch { return null; }
}

export function projectGoogleSearch(reply) {
  if (!Array.isArray(reply?.results)) return null;
  const distinct = new Map();
  for (const result of reply.results.slice(0,50)) {
    const id = result?.place_id;
    const title = text(result?.name,240);
    if (validGooglePlaceId(id) && title && !distinct.has(id)) {
      distinct.set(id,{place_id:id,name:title,formatted_address:text(result.formatted_address,512) || ''});
      if (distinct.size === 12) break;
    }
  }
  return [...distinct.values()];
}

function schedulePoint(value) {
  return Number.isInteger(value?.day) && value.day >= 0 && value.day <= 6
    && typeof value.time === 'string' && /^(?:[01]\d|2[0-3])[0-5]\d$/.test(value.time)
    ? { day:value.day,time:value.time } : null;
}

export function projectGooglePlace(details, expectedPlaceId) {
  if (!validGooglePlaceId(expectedPlaceId) || details?.place_id !== expectedPlaceId) return null;
  const name = text(details.name,240);
  if (!name) return null;
  const coords = details.geometry?.location;
  const lat = bounded(coords?.lat,-90,90), lng = bounded(coords?.lng,-180,180);
  const addressComponents = Array.isArray(details.address_components) ? details.address_components.slice(0,24) : [];
  const rawSchedule = Array.isArray(details.opening_hours?.periods) ? details.opening_hours.periods.slice(0,21) : [];
  const periods = rawSchedule.flatMap(period => {
    const open = schedulePoint(period?.open);
    return open ? [{open,close:schedulePoint(period?.close)}] : [];
  });
  return {
    place_id:expectedPlaceId,name,formatted_address:text(details.formatted_address,512),
    address_components:addressComponents.flatMap(component => {
      const name = text(component?.long_name,200);
      const types = Array.isArray(component?.types) ? component.types.slice(0,10).filter(type => addressTypes.has(type)) : [];
      return name && types.length ? [{long_name:name,types}] : [];
    }),
    geometry:lat === null || lng === null ? null : {location:{lat,lng}},
    opening_hours:periods.length ? {periods} : null,
    international_phone_number:text(details.international_phone_number,80),
    website:webUrl(details.website),
    rating:bounded(details.rating,0,5),
    user_ratings_total:Number.isSafeInteger(details.user_ratings_total) && details.user_ratings_total >= 0 ? details.user_ratings_total : null,
    url:webUrl(details.url,true),
    business_status:businessStatuses.has(details.business_status) ? details.business_status : null,
  };
}
