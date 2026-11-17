/** Memory only. An account change invalidates values AND pending responses. */
export function createHomeFeedCache(now: () => number = Date.now) {
  let owner: string | null = null, epoch = 0;
  const values = new Map<string, { data: unknown; at: number }>();
  const pending = new Map<string, Promise<unknown>>();
  const revisions = new Map<string, number>();
  return {
    setOwner(next: string | null) {
      if (next === owner) return;
      owner = next; epoch++; values.clear(); pending.clear(); revisions.clear();
    },
    invalidate(prefixes: string[]) {
      for (const key of new Set([...values.keys(), ...pending.keys()])) if (prefixes.some(prefix => key.startsWith(prefix))) {
        values.delete(key); pending.delete(key); revisions.set(key, (revisions.get(key) || 0) + 1);
      }
    },
    read<T>(account: string, key: string): T | undefined {
      return account === owner ? values.get(key)?.data as T | undefined : undefined;
    },
    async load<T>(account: string, key: string, ttl: number, fetcher: () => Promise<T>, force = false): Promise<T | undefined> {
      if (account !== owner) return undefined;
      const existing = values.get(key);
      if (!force && existing && now() - existing.at < ttl) return existing.data as T;
      if (pending.has(key)) return pending.get(key) as Promise<T | undefined>;
      const version = epoch, revision = revisions.get(key) || 0;
      const request = Promise.resolve().then(fetcher).then(data => {
        if (version !== epoch || account !== owner || revision !== (revisions.get(key) || 0)) return undefined;
        values.set(key, { data, at: now() });
        return data;
      }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
      pending.set(key, request);
      return request;
    },
  };
}

export const homeFeedCache = createHomeFeedCache();
