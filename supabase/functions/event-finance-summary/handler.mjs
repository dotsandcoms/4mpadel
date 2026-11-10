export function createSummaryHandler({ createClient, url, key, summarize, reportError = () => {} }) {
    const headers = { 'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store' };
    const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
    return async (req) => {
        if (req.method === 'OPTIONS') return new Response('ok', { headers });
        if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
        const authorization = req.headers.get('Authorization');
        if (!/^Bearer\s+\S+$/i.test(authorization || '')) return json({ error: 'Sign in to view event summaries' }, 401);
        const body = await req.json().catch(() => null);
        if (!Array.isArray(body?.event_ids) || !body.event_ids.length || body.event_ids.length > 25
            || body.event_ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
            return json({ error: 'Choose between 1 and 25 events' }, 400);
        }
        // All data reads retain the caller's RLS. No service key or shared cache.
        const ids = [...new Set(body.event_ids)];
        try {
            const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
            const { data: auth, error: authError } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
            if (authError || !auth?.user?.id) return json({ error: 'Sign in to view event summaries' }, 401);
            const summaries = [];
            for (let offset = 0; offset < ids.length; offset += 5) {
                const batch = ids.slice(offset, offset + 5);
                const { data, error } = await client.rpc('event_finance_overview_source', { p_event_ids: batch });
                if (error) {
                    if (error.code !== '42501') reportError('event_summary_source_failed', error);
                    return json({ error: error.code === '42501' ? 'Event finance access denied' : 'Could not load event summaries' }, error.code === '42501' ? 403 : 500);
                }
                if (!data || !Array.isArray(data.events) || data.events.length !== batch.length
                    || new Set(data.events.map(event => Number(event.id))).size !== batch.length
                    || data.events.some(event => !batch.includes(Number(event.id)))) throw new Error('Incomplete summary source');
                summaries.push(...summarize(data));
            }
            return json({ summaries, calculated_at: new Date().toISOString() });
        } catch (error) {
            reportError('event_summary_calculation_failed', error);
            return json({ error: 'Could not calculate event summaries' }, 500);
        }
    };
}
