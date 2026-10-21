type Database = { from(name: string): any; rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: any }> };

/** Runs in the existing minute worker. A scheduled time alone never causes a live alert. */
export async function refreshProMatchAlerts(client: Database, token: string | undefined, fetcher: typeof fetch = fetch) {
  if (!token) return;
  const { data, error } = await client.from('pro_match_bookmarks').select('match_id').eq('bookmarked', true).eq('notify_enabled', true).is('notified_at', null).gt('expires_at', new Date().toISOString()).limit(1);
  if (error) throw new Error('Could not check match subscriptions');
  if (!data?.length) return;
  const live = new Set<number>();
  for (let page = 1; page <= 20; page++) {
    const response = await fetcher(`https://padelapi.org/api/live?per_page=50&page=${page}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (response.headers.get('x-4m-cache') === 'stale') return;
    if (!response.ok) throw new Error('Live match status is unavailable');
    const value = await response.json();
    if (!Array.isArray(value?.data)) throw new Error('Invalid live match status');
    for (const row of value.data) if (Number.isSafeInteger(row.id) && row.id > 0 && ['live', 'ongoing'].includes(row.status)) live.add(row.id);
    if (!(Number(value.meta?.last_page) > page)) {
      if (live.size) { const result = await client.rpc('notify_pro_matches_live', { p_match_ids: [...live] }); if (result.error) throw new Error('Could not queue live match alerts'); }
      return;
    }
  }
  throw new Error('Incomplete live match status');
}
