import { NOTIFICATION_PATHS, type NotificationType } from './notification-events';

/** Exact route grammar: payloads never choose an external URL or an auth screen. */
export function pathFromNotificationData(data: Record<string, unknown> | undefined): string | null {
  const path = data?.path;
  if (typeof path === 'string') {
    if (Object.values(NOTIFICATION_PATHS).includes(path)) return path;
    if (path === '/(tabs)/calendar') return '/calendar';
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
