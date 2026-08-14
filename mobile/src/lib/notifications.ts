import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { NOTIFICATION_PATHS, type NotificationType } from './notification-events';
import { supabase } from './supabase';

export type { NotificationType } from './notification-events';
export { NOTIFICATION_PATHS, NOTIFICATION_TYPES, pushCopy } from './notification-events';

/**
 * Native push helper.
 *
 * Onboarding and sign-in stay quiet. Home asks once via the OS dialog
 * (iOS notification alert / Android POST_NOTIFICATIONS). No custom sheet.
 * `syncPushTokenIfGranted` only refreshes a token when the OS has already
 * said yes.
 */

const PROMPT_KEY = 'push_prompt_native_v1';

let lastToken: string | null = null;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function easProjectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  );
}

function appVersion(): string | null {
  return Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? null;
}

/** Safe in-app route from a notification payload. Rejects anything that is not a path. */
export function pathFromNotificationData(
  data: Record<string, unknown> | undefined
): string | null {
  const path = data?.path;
  if (typeof path === 'string' && path.startsWith('/')) return path;
  const type = data?.type;
  if (typeof type === 'string' && type in NOTIFICATION_PATHS) {
    return NOTIFICATION_PATHS[type as NotificationType];
  }
  return null;
}

export async function getPushPermissionStatus(): Promise<Notifications.PermissionStatus | 'unavailable'> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  const current = await Notifications.getPermissionsAsync();
  return current.status;
}

export async function markPushPromptSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPT_KEY, 'true');
  } catch {
    /* non-fatal */
  }
}

/**
 * True when Home should fire the native OS permission dialog.
 * Skips if we already asked, if the OS already decided, or on web.
 */
export async function shouldPromptForPush(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if ((await AsyncStorage.getItem(PROMPT_KEY)) === 'true') return false;
  } catch {
    /* still decide from OS status */
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted' || status === 'denied') {
    await markPushPromptSeen();
    return false;
  }
  return true;
}

/** System permission dialog. Returns whether a token was saved. */
export async function requestPushPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '4M Padel',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const next = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    status = next.status;
  }
  if (status !== 'granted') return false;
  if (!Device.isDevice) return true;
  return registerCurrentToken();
}

/** Refresh the stored token when permission is already granted. Never prompts. */
export async function syncPushTokenIfGranted(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  await registerCurrentToken();
}

async function registerCurrentToken(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '4M Padel',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = easProjectId();
  let token: string;
  let tokenKind: 'expo' | 'apns' | 'fcm' = 'expo';

  try {
    if (projectId) {
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      token = result.data;
    } else {
      const result = await Notifications.getDevicePushTokenAsync();
      token = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
      tokenKind = Platform.OS === 'ios' ? 'apns' : 'fcm';
      console.warn(
        '[push] No EAS projectId — stored a device token. Run eas init before Expo Push can deliver.'
      );
    }
  } catch (error) {
    console.warn('[push] token not available:', error);
    return false;
  }

  lastToken = token;
  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    p_token_kind: tokenKind,
    p_app_version: appVersion(),
  });
  if (error) {
    console.warn('[push] token not saved:', error.message);
    return false;
  }
  return true;
}

/** Drop this device’s token before sign-out so the next account is not mixed in. */
export async function unregisterPushToken(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  let token = lastToken;
  if (!token) {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      const projectId = easProjectId();
      if (!projectId) return;
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch {
      return;
    }
  }
  if (!token) return;
  const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
  if (error) console.warn('[push] token not removed:', error.message);
  lastToken = null;
}

export function addNotificationResponseListener(
  onPath: (path: string) => void
): { remove: () => void } {
  if (Platform.OS === 'web') return { remove() {} };
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const path = pathFromNotificationData(data);
    if (path) onPath(path);
  });
  return sub;
}
