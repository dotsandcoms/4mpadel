export type { NotificationType } from './notification-events';
export { NOTIFICATION_PATHS, NOTIFICATION_TYPES, pushCopy } from './notification-events';

/**
 * Web stubs. expo-notifications warns on every token listener on web, so
 * native push stays in notifications.ts and never loads here.
 */

export function pathFromNotificationData(
  _data: Record<string, unknown> | undefined
): string | null {
  return null;
}

export async function getPushPermissionStatus() {
  return 'unavailable' as const;
}

export async function markPushPromptSeen() {}

export async function shouldPromptForPush() {
  return false;
}

export async function requestPushPermission() {
  return false;
}

export async function syncPushTokenIfGranted() {}

export async function unregisterPushToken() {}

export function addNotificationResponseListener(_onPath: (path: string) => void): {
  remove: () => void;
} {
  return { remove() {} };
}
