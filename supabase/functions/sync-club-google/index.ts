import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

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
function openingHours(periods: Array<Record<string, any>> = []) {
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

async function googleRequest(path: string, params: Record<string, string>, apiKey: string) {
  const url = new URL(`https://maps.googleapis.com/maps/api/place/${path}/json`);
  Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || !['OK', 'ZERO_RESULTS'].includes(data.status)) {
    throw new Error(`Google Places ${path} failed: ${data.status || response.status} ${data.error_message || ''}`.trim());
  }
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const url = Deno.env.get('SUPABASE_URL') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY') || '';
    if (!googleKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured for this function');

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.email) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(url, serviceKey);
    const { data: permission } = await admin
      .from('admin_sidebar_permissions')
      .select('role, allowed_tabs')
      .ilike('email', user.email)
      .maybeSingle();
    const allowed = permission?.role === 'super_admin' || permission?.allowed_tabs?.includes('clubs');
    if (!allowed) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 25, 1), 50);
    const force = body.force === true;
    let query = admin
      .from('clubs')
      .select('id, name, city, province, country, address, lat, lng, website_url, contact_phone, opening_hours, google_place_id')
      .order('name')
      .limit(limit);
    if (!force) query = query.is('google_place_id', null);
    const { data: clubs, error: clubsError } = await query;
    if (clubsError) throw clubsError;

    const { data: linked } = await admin.from('clubs').select('id, name, google_place_id').not('google_place_id', 'is', null);
    const linkedByPlace = new Map((linked || []).map((club) => [club.google_place_id, club]));
    const rows = [];
    const errors: Array<{ club: string; message: string }> = [];

    for (const club of clubs || []) {
      try {
        const search = await googleRequest('textsearch', {
          query: [club.name, 'padel', club.city, club.province, 'South Africa'].filter(Boolean).join(' '),
        }, googleKey);
        const best = search.results?.[0];
        if (!best) {
          rows.push({ club_id: club.id, match_status: 'no_match', review_status: 'pending', fill_fields: {}, meta_fields: {} });
          continue;
        }

        const confidence = nameScore(club.name, best.name || '');
        if (confidence < 0.51) {
          rows.push({
            club_id: club.id, match_status: 'low_confidence', review_status: 'pending',
            google_place_id: best.place_id, google_name: best.name, google_address: best.formatted_address,
            confidence, fill_fields: {}, meta_fields: {},
          });
          continue;
        }

        const detailsResponse = await googleRequest('details', {
          place_id: best.place_id,
          fields: 'place_id,name,formatted_address,address_component,geometry,international_phone_number,website,opening_hours,rating,user_ratings_total,url,business_status',
        }, googleKey);
        const details = detailsResponse.result;
        const parts = addressParts(details.address_components);
        const hours = openingHours(details.opening_hours?.periods);
        const fill: Record<string, unknown> = {};
        if (!club.address && details.formatted_address) fill.address = details.formatted_address;
        if (!club.city && parts.city) fill.city = parts.city;
        if (!club.province && parts.province) fill.province = parts.province;
        if (!club.country && parts.country) fill.country = parts.country;
        if (club.lat == null && details.geometry?.location?.lat != null) fill.lat = details.geometry.location.lat;
        if (club.lng == null && details.geometry?.location?.lng != null) fill.lng = details.geometry.location.lng;
        if (!club.website_url && details.website) fill.website_url = details.website;
        if (!club.contact_phone && details.international_phone_number) fill.contact_phone = details.international_phone_number;
        if ((!club.opening_hours || Object.keys(club.opening_hours).length === 0) && hours) fill.opening_hours = hours;

        const meta = {
          google_place_id: best.place_id,
          google_maps_url: details.url || null,
          google_rating: details.rating ?? null,
          google_ratings_total: details.user_ratings_total ?? null,
          google_synced_at: new Date().toISOString(),
        };
        const holder = linkedByPlace.get(best.place_id);
        const conflict = holder && holder.id !== club.id;
        rows.push({
          club_id: club.id,
          match_status: conflict ? 'conflict' : 'matched',
          review_status: club.google_place_id === best.place_id ? 'applied' : 'pending',
          google_place_id: best.place_id, google_name: details.name, google_address: details.formatted_address,
          confidence, fill_fields: fill, meta_fields: meta, business_status: details.business_status || null,
          conflict_note: conflict ? `Same Google listing already assigned to "${holder.name}"` : null,
        });
      } catch (error) {
        errors.push({ club: club.name, message: error instanceof Error ? error.message : String(error) });
      }
    }

    if (rows.length) {
      const { error } = await admin.from('club_google_matches').upsert(rows, { onConflict: 'club_id' });
      if (error) throw error;
    }
    return json({ processed: clubs?.length || 0, queued: rows.length, errors });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Sync failed' }, 500);
  }
});
