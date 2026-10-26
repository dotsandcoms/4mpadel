// Mirrors EventBuilder.normalizeVenues/addVenue and place_changed field mapping.
export function venueNames(value) {
  const names = Array.isArray(value) ? value : String(value || '').split('\n');
  const seen = new Set();
  return names.map(name => String(name || '').trim()).filter(name => name && !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()));
}
export function addEventVenue(draft, clubOrName) {
  const club = typeof clubOrName === 'object' && clubOrName !== null ? clubOrName : null;
  const name = String(club?.name || clubOrName || '').trim();
  if (!name) return {};
  return { venues: venueNames([...venueNames(draft.venues), name]).join('\n'), address: draft.address || club?.address || '', city: draft.city || club?.city || '' };
}
export function eventPlacePatch(draft, place) {
  const get = type => (place.address_components || []).find(component => component.types?.includes(type))?.long_name || '';
  const city = get('locality') || get('administrative_area_level_2') || get('administrative_area_level_1');
  const existing = venueNames(draft.venues);
  return { address: place.formatted_address || draft.address || '', city: city || draft.city || '', venues: (existing.length ? existing : venueNames(place.name ? [place.name] : [])).join('\n') };
}
