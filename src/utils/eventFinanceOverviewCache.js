// Memory only: never persist financial figures in browser storage. Partition by
// signed-in account, permission scope and tier filter; clear on sign-out.
const cache = new Map();
const TTL = 120_000;
export function readOverviewCache(key, now = Date.now()) {
    const entry = cache.get(key);
    if (!entry || now - entry.at > TTL) { cache.delete(key); return null; }
    return entry.events;
}
export function writeOverviewCache(key, events) {
    if (!key) return;
    cache.delete(key);
    cache.set(key, { events, at: Date.now() });
    if (cache.size > 8) cache.delete(cache.keys().next().value);
}
export function invalidateOverviewSummary(eventId) {
    for (const [key, entry] of cache) cache.set(key, { ...entry,
        events: entry.events.map(event => Number(event.id) === Number(eventId)
            ? { ...event, stats: undefined, settlement: undefined } : event),
    });
}
export function clearOverviewCache() { cache.clear(); }
