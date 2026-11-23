import { googlePlaceSearchQuery, projectGooglePlace, projectGoogleSearch, validGooglePlaceId } from './club-google-place-review.mjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...corsHeaders, 'Content-Type':'application/json', 'Cache-Control':'no-store' },
});
const scanVersion = 1;
const requestLimit = 24;
const scanFields = new Set(['action','after','limit','force']);
const providerConcurrency = 3;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createClubGoogleScanHandler({ connect, candidates, scan, enqueue, configured, places }) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:corsHeaders });
    if (request.method !== 'POST') return json({ error:'Method not allowed.' },405);
    const authorization = request.headers.get('Authorization');
    if (!/^Bearer \S+$/i.test(authorization || '')) return json({ error:'Sign in to scan club listings.' },401);
    try {
      const caller = connect(authorization);
      const actor = await caller.identify();
      if (!actor) return json({ error:'Sign in to scan club listings.' },401);
      if (!(await caller.authorised())) return json({ error:'Active platform Clubs access is required.' },403);
      const input = await request.json().catch(() => null);
      if (input && ['search','details'].includes(input.action)) {
        if (!places) return json({ error:'Choose a supported Google scan action.' },400);
        if (!configured()) return json({ error:'Google Places is currently unavailable.' },503);
        const search = input.action === 'search';
        const key = search ? 'query' : 'place_id';
        const value = search ? googlePlaceSearchQuery(input.query) : input.place_id;
        if (Object.keys(input).some(field => field !== 'action' && field !== key)
          || (search ? !value : !validGooglePlaceId(value))) {
          return json({ error:search ? 'Enter 2 to 160 characters to search Google Places.' : 'Select an exact Google Place ID.' },400);
        }
        const reply = await (search ? places.search : places.details)(value,request.signal);
        if (!(await caller.authorised())) return json({ error:'Active platform Clubs access is required.' },403);
        const result = search ? projectGoogleSearch(reply) : projectGooglePlace(reply?.result,value);
        if (!result) return json({ error:'Google Places returned an unverified result.' },502);
        return json({ place_version:1,...(search ? {results:result} : {place:result}) });
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(field => !scanFields.has(field))
        || (input.action != null && input.action !== 'scan') || (input.force != null && input.force !== false)
        || (input.after != null && (typeof input.after !== 'string' || !uuid.test(input.after)))
        || (input.limit != null && (!Number.isSafeInteger(input.limit) || input.limit < 1))) {
        return json({ error:'Choose a valid batch of unlinked club listings.' },400);
      }
      if (!configured()) return json({ error:'Google club scanning is currently unavailable.' },503);
      const limit = Math.min(input.limit ?? 12, requestLimit);
      const after = input.after?.toLowerCase() ?? null;
      const entries = await candidates({ after, limit });
      if (!Array.isArray(entries) || entries.length > limit + 1 || entries.some((entry,index) => !uuid.test(entry?.id || '')
        || typeof entry.row_version !== 'string' || typeof entry.name !== 'string'
        || (index === 0 ? after && entry.id <= after : entry.id <= entries[index - 1].id))) {
        return json({ error:'Current clubs could not be verified for this scan.' },503);
      }
      const batch = entries.slice(0,limit);
      let queued = 0, skipped = 0;
      const errors = [];
      for (let offset = 0; offset < batch.length; offset += providerConcurrency) {
        if (request.signal.aborted) return json({ error:'The scan was interrupted.' },499);
        if (offset && !(await caller.authorised())) return json({ error:'Active platform Clubs access is required.' },403);
        const clubs = batch.slice(offset, offset + providerConcurrency);
        const matches = await Promise.allSettled(clubs.map(club => scan(club,request.signal)));
        if (!(await caller.authorised())) return json({ error:'Active platform Clubs access is required.' },403);
        for (let position = 0; position < clubs.length; position += 1) {
          const club = clubs[position];
          const match = matches[position];
          if (match.status === 'rejected') {
            errors.push({ club:club.name, message:'Google returned no usable response for this club.' });
            continue;
          }
          if (request.signal.aborted) return json({ error:'The scan was interrupted.' },499);
          const written = await enqueue(club,match.value).catch(() => null);
          if (written === true) queued += 1;
          else if (written === false) skipped += 1;
          else errors.push({ club:club.name, message:'The review result could not be queued.' });
        }
      }
      return json({ scan_version:scanVersion, processed:batch.length, queued, skipped, errors,
        next_cursor:entries.length > limit ? batch.at(-1).id : null });
    } catch {
      return json({ error:'Google club scanning is currently unavailable.' },503);
    }
  };
}
