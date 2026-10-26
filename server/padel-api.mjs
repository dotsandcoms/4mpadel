/** Web requests use the same private Supabase cache/budget as app and cron. */
export function createSharedProviderFetch(fetcher = fetch, env = process.env) {
  const base = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!base) throw new Error('Shared provider cache is not configured.');
  return (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== 'padelapi.org') return fetcher(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const authorization = headers.get('authorization') || (env.PADEL_API_TOKEN ? `Bearer ${env.PADEL_API_TOKEN.trim()}` : '');
    if (!authorization) throw new Error('Shared provider credential is not configured.');
    return fetcher(`${base.replace(/\/$/, '')}/functions/v1/pro-padel-provider`, {
      method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url.href, method: init.method || 'GET', ...(init.body ? { body: init.body } : {}) }),
      redirect: 'manual', signal: init.signal,
    });
  };
}
