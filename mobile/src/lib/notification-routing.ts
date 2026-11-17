import { NOTIFICATION_PATHS, type NotificationType } from './notification-events';

/** Exact route grammar: payloads never choose an external URL or an auth screen. */
export function pathFromNotificationData(data: Record<string, unknown> | undefined): string | null {
  const path = data?.path;
  if (typeof path === 'string') {
    if (path === '/(tabs)') return path;
    if (Object.values(NOTIFICATION_PATHS).includes(path)) return path;
    if (path === '/(tabs)/messages') return path;
    if (/^\/messages\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path)) return path;
    if (path === '/(tabs)/calendar') return '/calendar';
    const ranking = /^\/\(tabs\)\/rankings\?(.+)$/.exec(path);
    if (ranking) {
      const query = new URLSearchParams(ranking[1]);
      if ([...query].length === 3 && query.getAll('view').length === 1 && query.get('view') === 'Rankings'
        && query.getAll('source').length === 1 && query.get('source') === '4m'
        && query.getAll('gender').length === 1 && ['men', 'women'].includes(query.get('gender') ?? '')) return path;
      return null;
    }
    const proMatch = /^\/pro\/match\/([1-9]\d*)$/.exec(path);
    if (proMatch && Number(proMatch[1]) <= 2147483647) return path;
    const event = /^\/events\/([1-9]\d*)(?:\?(.+))?$/.exec(path);
    if (event) {
      const query = new URLSearchParams(event[2] ?? '');
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const seen = new Set<string>();
      for (const [key, value] of query) {
        if (seen.has(key)) return null;
        seen.add(key);
        if ((key === 'division' || key === 'match') && uuid.test(value)) continue;
        if (key === 'tab' && ['Draws', 'Results', 'Overview'].includes(value)) continue;
        return null;
      }
      return path;
    }
  }
  const type = data?.type;
  return typeof type === 'string' && Object.hasOwn(NOTIFICATION_PATHS, type) ? NOTIFICATION_PATHS[type as NotificationType] : null;
}
