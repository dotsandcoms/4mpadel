import { supabase } from './supabase';
import type { PlayerNotification } from './notification-centre';

export type NotificationSnapshot = { items: PlayerNotification[]; unread: number; through: string };
const listeners = new Set<() => void>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function subscribeNotificationReads(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
async function request(action: 'list' | 'read', ids?: string[], through?: string): Promise<NotificationSnapshot> {
  const { data, error } = await supabase.rpc('player_notification_api', { p_action: action, p_ids: ids ?? null, p_before: through ?? null });
  if (error || !data || !Array.isArray(data.items) || !Number.isSafeInteger(data.unread) || data.unread < 0 || !Number.isFinite(Date.parse(data.through))) throw new Error('Notifications could not be updated. Please try again.');
  return data as NotificationSnapshot;
}
export const fetchNotificationSnapshot = () => request('list');
export async function markNotificationsRead(ids?: string[], through?: string) {
  if (ids && (!ids.length || ids.length > 50 || ids.some(id => !uuid.test(id)))) throw new Error('Choose the notifications to mark read.');
  if (!ids && (!through || !Number.isFinite(Date.parse(through)))) throw new Error('Refresh notifications before marking all read.');
  const result = await request('read', ids, through);
  for (const listener of listeners) listener();
  return result;
}
/** Push payloads carry only an outbox ID; the RPC checks its current owner. */
export async function markNotificationFromPush(data: Record<string, unknown> | undefined) {
  if (data?.type === 'chat_message' || typeof data?.notificationId !== 'string' || !uuid.test(data.notificationId)) return;
  await markNotificationsRead([data.notificationId]);
}
