import type { PendingAction } from './home';
import { pathFromNotificationData } from './notification-routing';

export type PlayerNotification = { id: string; type: string; title: string; body: string; path: string | null; created_at: string; read_at?: string | null };
export type NotificationEvent = { id: number; event_name: string | null; start_date: string | null; city: string | null; custom_image_url: string | null; poster_image_url: string | null; image_url: string | null; sapa_status?: string | null };
export type NotificationGroup = { key: string; eventId: number | null; title: string; event?: NotificationEvent; actions: PendingAction[]; notifications: PlayerNotification[] };

export function notificationEventId(notification: PlayerNotification): number | null {
  const path = pathFromNotificationData({ type: notification.type, path: notification.path });
  const match = /^\/events\/([1-9]\d*)(?:\?|$)/.exec(path ?? '');
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id <= 2147483647 ? id : null;
}

export function notificationEventIds(actions: PendingAction[], notifications: PlayerNotification[]): number[] {
  return [...new Set([...actions.map(action => action.eventId), ...notifications.map(notificationEventId)].filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0 && id <= 2147483647))];
}

/** Group by stable event IDs, never by titles that unrelated events can share. */
export function groupNotifications(actions: PendingAction[], notifications: PlayerNotification[], events: NotificationEvent[]): NotificationGroup[] {
  const metadata = new Map(events.map(event => [event.id, event]));
  const groups = new Map<string, NotificationGroup>();
  const get = (key: string, eventId: number | null, fallback: string) => {
    let group = groups.get(key);
    if (!group) {
      const event = eventId == null ? undefined : metadata.get(eventId);
      group = { key, eventId, event, title: event?.event_name || fallback, actions: [], notifications: [] };
      groups.set(key, group);
    }
    return group;
  };
  for (const action of actions) {
    const id = action.eventId && Number.isSafeInteger(action.eventId) ? action.eventId : null;
    const key = id ? `event:${id}` : action.kind === 'profile' ? 'account' : `action:${action.key}`;
    get(key, id, id ? action.subtitle : action.kind === 'profile' ? 'My account' : action.subtitle).actions.push(action);
  }
  for (const notification of notifications) {
    const id = notificationEventId(notification);
    const path = pathFromNotificationData({ type: notification.type, path: notification.path }) ?? '';
    const general = path.startsWith('/messages') || path === '/(tabs)/messages' ? ['messages', 'My messages']
      : path.startsWith('/pro/') ? ['international', 'International padel'] : path.includes('profile') || path.includes('rankings') ? ['account', 'My account'] : ['updates', '4M updates'];
    get(id ? `event:${id}` : general[0], id, id ? `Event #${id}` : general[1]).notifications.push(notification);
  }
  for (const group of groups.values()) group.notifications.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return [...groups.values()].sort((a, b) => Number(b.actions.length > 0) - Number(a.actions.length > 0)
    || (a.actions.length && b.actions.length ? (a.event?.start_date || '9999').localeCompare(b.event?.start_date || '9999') : 0)
    || (b.notifications[0]?.created_at ?? '').localeCompare(a.notifications[0]?.created_at ?? '') || a.title.localeCompare(b.title));
}
