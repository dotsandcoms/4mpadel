import { supabase } from './supabase';
import type { PlayerNotification } from './notification-centre';

export type NotificationSnapshot = { items: PlayerNotification[]; unread: number; through: string; drawerReadAvailable?: boolean };
type NotificationAction = 'list' | 'read' | 'list_drawer' | 'read_drawer' | 'read_drawer_items';
const listeners = new Set<() => void>();
const drawerListeners = new Set<() => void>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function subscribeNotificationReads(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function subscribeDrawerNotificationReads(listener: () => void) { drawerListeners.add(listener); return () => { drawerListeners.delete(listener); }; }

const request = (action: NotificationAction, ids?: string[], through?: string) =>
  supabase.rpc('player_notification_api', { p_action: action, p_ids: ids ?? null, p_before: through ?? null });

function snapshot({ data, error }: Awaited<ReturnType<typeof request>>): NotificationSnapshot {
  if (error || !data || !Array.isArray(data.items) || !Number.isSafeInteger(data.unread) || data.unread < 0 || !Number.isFinite(Date.parse(data.through))) {
    throw new Error('Notifications could not be updated. Please try again.');
  }
  return data as NotificationSnapshot;
}

export async function fetchNotificationSnapshot() {
  const result = await request('list_drawer');
  if (result.error?.code === 'P0001' && result.error.message === 'Unsupported notification action.') {
    return snapshot(await request('list'));
  }
  return snapshot(result);
}

async function markRead(action: 'read' | 'read_drawer' | 'read_drawer_items', ids?: string[], through?: string) {
  if (ids && (!ids.length || ids.length > 50 || ids.some(id => !uuid.test(id)))) throw new Error('Choose the notifications to mark read.');
  if (!ids && (!through || !Number.isFinite(Date.parse(through)))) throw new Error('Refresh notifications before marking all read.');
  const result = snapshot(await request(action, ids, through));
  if (action !== 'read_drawer') for (const listener of listeners) listener();
  for (const listener of drawerListeners) listener();
  return result;
}

export const markNotificationsRead = (ids?: string[], through?: string) => markRead('read', ids, through);
export const markDrawerNotificationsRead = (through: string) => markRead('read_drawer', undefined, through);
export const markDrawerItemsRead = (ids: string[]) => markRead('read_drawer_items', ids);

/** Push payloads carry only an outbox ID; the RPC checks its current owner. */
export async function markNotificationFromPush(data: Record<string, unknown> | undefined) {
  if (data?.type === 'chat_message' || typeof data?.notificationId !== 'string' || !uuid.test(data.notificationId)) return;
  await markNotificationsRead([data.notificationId]);
}
