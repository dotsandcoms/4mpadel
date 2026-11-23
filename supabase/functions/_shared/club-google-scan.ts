import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createClubGoogleScanHandler } from './club-google-scan-handler.mjs';
import { projectGooglePlace, projectGoogleSearch } from './club-google-place-review.mjs';

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function nameScore(clubName: string, googleName: string) {
  const a = new Set(normalize(clubName).split(/\s+/).filter(Boolean));
  const b = new Set(normalize(googleName).split(/\s+/).filter(Boolean));
  let hits = 0;
  for (const word of a) if (b.has(word)) hits += 1;
  const wordScore = a.size ? hits / a.size : 0;
  const ac = [...a].join('');
  const bc = [...b].join('');
  const containment = ac && bc && (ac.includes(bc) || bc.includes(ac))
    ? 0.85 + (0.1 * Math.min(ac.length, bc.length) / Math.max(ac.length, bc.length))
    : 0;
  return Math.max(wordScore, containment);
}

function addressParts(components: Array<{ long_name?: string; types?: string[] }> = []) {
  const find = (type: string) => components.find((item) => item.types?.includes(type))?.long_name || null;
  return {
    city: find('locality') || find('sublocality') || find('postal_town'),
    province: find('administrative_area_level_1'),
    country: find('country'),
  };
}

const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
function openingHours(periods: Array<{open?:{day:number,time:string},close?:{time:string}|null}> = []) {
  if (!periods.length) return null;
  const result: Record<string, unknown> = Object.fromEntries(days.map((day) => [day, { open: '00:00', close: '00:00', closed: true }]));
  for (const period of periods) {
    const day = period.open?.day;
    const rawOpen = period.open?.time;
    if (day == null || !rawOpen || !days[day]) continue;
    const rawClose = period.close?.time || '2359';
    result[days[day]] = {
      open: `${rawOpen.slice(0, 2)}:${rawOpen.slice(2)}`,
      close: `${rawClose.slice(0, 2)}:${rawClose.slice(2)}`,
      closed: false,
    };
  }
  return result;
}

async function googleRequest(path: string, params: Record<string, string>, apiKey: string, signal: AbortSignal) {
  const url = new URL(`https://maps.googleapis.com/maps/api/place/${path}/json`);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
  const data = await response.json();
  if (!response.ok || !['OK', 'ZERO_RESULTS'].includes(data.status)) {
    throw new Error('Google Places is unavailable.');
  }
  return data;
}

const fields = 'place_id,name,formatted_address,address_component,geometry,international_phone_number,website,opening_hours,rating,user_ratings_total,url,business_status';

export function clubGoogleScan(withManualPlaces = false) {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  const worker = createClient(url,serviceKey,{ auth:{persistSession:false,autoRefreshToken:false} });

  function requestGoogle(path: string, params: Record<string,string>, signal: AbortSignal) {
    if (!googleKey) throw new Error('Google Places is unavailable.');
    return googleRequest(path,params,googleKey,signal);
  }
  const places = withManualPlaces ? {
    search: (query: string, signal: AbortSignal) => requestGoogle('textsearch',{query},signal),
    details: (placeId: string, signal: AbortSignal) => requestGoogle('details',{place_id:placeId,fields},signal),
  } : undefined;

  return createClubGoogleScanHandler({
    places,
    connect(authorization: string) {
      const caller = createClient(url,anonKey,{ global:{headers:{Authorization:authorization}} });
      return {
        async identify() {
          const {data,error} = await caller.auth.getUser();
          return error ? null : data?.user?.id;
        },
        async authorised() {
          const { data,error } = await caller.rpc('club_google_scan_authorised');
          return !error && data === true;
        },
      };
    },
    configured: () => Boolean(googleKey),
    async candidates({ after,limit }: {after:string|null,limit:number}) {
      const { data,error } = await worker.rpc('club_google_scan_candidates',{p_after:after,p_limit:limit});
      if (error) throw new Error('Club scanning is unavailable.');
      return data;
    },
    async enqueue(club: {id:string,row_version:string}, match: unknown) {
      const { data,error } = await worker.rpc('club_google_scan_enqueue',{p_club_id:club.id,p_row_version:club.row_version,p_match:match});
      if (error) throw new Error('Club match could not be queued.');
      return data;
    },
    async scan(club: {
      id:string,name:string,city?:string,province?:string,country?:string,address?:string,
      lat?:number,lng?:number,website_url?:string,contact_phone?:string,opening_hours?:Record<string,unknown>,
    }, signal: AbortSignal) {
      const search = await requestGoogle('textsearch',{
        query:[club.name,'padel',club.city,club.province,club.country || 'South Africa'].filter(Boolean).join(' '),
      },signal);
      if (!search.results?.length && search.status === 'ZERO_RESULTS') return {match_status:'no_match'};
      const [best] = projectGoogleSearch({results:[search.results?.[0]]}) || [];
      if (!best) throw new Error('Google Places returned an incomplete result.');
      const placeId = best.place_id;
      const confidence = nameScore(club.name,best.name);
      if (confidence < 0.51) return {
        match_status:'low_confidence',google_place_id:placeId,google_name:best.name,google_address:best.formatted_address,confidence,
      };
      const reply = await requestGoogle('details',{place_id:placeId,fields},signal);
      const details = projectGooglePlace(reply.result,placeId);
      if (!details) throw new Error('Google Places returned a different listing.');
      const parts = addressParts(details.address_components);
      const hours = openingHours(details.opening_hours?.periods);
      const fill: Record<string,unknown> = {};
      if (!club.address && details.formatted_address) fill.address = details.formatted_address;
      if (!club.city && parts.city) fill.city = parts.city;
      if (!club.province && parts.province) fill.province = parts.province;
      if (!club.country && parts.country) fill.country = parts.country;
      if (club.lat == null && details.geometry?.location?.lat != null) fill.lat = details.geometry.location.lat;
      if (club.lng == null && details.geometry?.location?.lng != null) fill.lng = details.geometry.location.lng;
      if (!club.website_url && details.website) fill.website_url = details.website;
      if (!club.contact_phone && details.international_phone_number) fill.contact_phone = details.international_phone_number;
      if ((!club.opening_hours || Object.keys(club.opening_hours).length === 0) && hours) fill.opening_hours = hours;

      const { data: holder,error } = await worker.from('clubs').select('id').eq('google_place_id',placeId).neq('id',club.id).maybeSingle();
      if (error) throw new Error('This Google listing could not be checked for conflicts.');
      return {
        match_status:holder ? 'conflict' : 'matched',
        google_place_id:placeId,google_name:details.name,google_address:details.formatted_address,confidence,
        fill_fields:fill,business_status:details.business_status || null,
        conflict_note:holder ? 'This Google listing is already linked to another club.' : null,
        meta_fields:{google_place_id:placeId,google_maps_url:details.url || null,google_rating:details.rating ?? null,
          google_ratings_total:details.user_ratings_total ?? null,google_synced_at:new Date().toISOString()},
      };
    },
  });
}
