import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

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
let registrationInFlight: Promise<boolean> | null = null;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function easProjectId(): string | undefined {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
  );
}

function appVersion(): string | null {
  return Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? null;
}

/** Safe in-app route from a notification payload. Rejects anything that is not a path. */
export { pathFromNotificationData } from './notification-routing';
import { pathFromNotificationData } from './notification-routing';

// SDK 57 supports Android emulators with Google Play services. Token fetching
// still fails safely on emulator images without FCM support.
function canRegisterPush(): boolean {
  return Platform.OS !== 'web' && (Device.isDevice || Platform.OS === 'android');
}

export async function getPushPermissionStatus(): Promise<Notifications.PermissionStatus | 'unavailable'> {
  if (!canRegisterPush()) return 'unavailable';
  const current = await Notifications.getPermissionsAsync();
  return current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ? Notifications.PermissionStatus.GRANTED : current.status;
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
  if (!canRegisterPush()) return true;
  return registerCurrentToken();
}

/** Refresh the stored token when permission is already granted. Never prompts. */
export async function syncPushTokenIfGranted(): Promise<void> {
  if (!canRegisterPush()) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const status = await getPushPermissionStatus();
  if (status !== 'granted') { await unregisterPushToken(); return; }
  await registerCurrentToken();
}

function registerCurrentToken(): Promise<boolean> {
  if (!registrationInFlight) {
    registrationInFlight = registerCurrentTokenImpl().finally(() => { registrationInFlight = null; });
  }
  return registrationInFlight;
}

async function registerCurrentTokenImpl(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: '4M Padel',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const projectId = easProjectId();
  let token: string;
  if (!projectId) {
    console.warn('[push] Configure EXPO_PUBLIC_EAS_PROJECT_ID or EAS projectId to enable delivery.');
    return false;
  }
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (error) {
    console.warn('[push] token not available:', error);
    return false;
  }

  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    p_token_kind: 'expo',
    p_app_version: appVersion(),
  });
  if (error) {
    console.warn('[push] token not saved:', error.message);
    return false;
  }
  lastToken = token;
  await AsyncStorage.setItem('push_registered_token', token);
  return true;
}

/** Drop this device’s token before sign-out so the next account is not mixed in. */
export async function unregisterPushToken(): Promise<void> {
  if (registrationInFlight) await registrationInFlight;
  if (!canRegisterPush()) return;
  let token = lastToken ?? await AsyncStorage.getItem('push_registered_token');
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
  if (error) throw new Error('Could not disconnect notifications. Please try signing out again.');
  lastToken = null;
  await AsyncStorage.removeItem('push_registered_token');
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

/** Consume the launch response only after authentication and navigation are ready. */
export function consumeInitialNotificationPath(): string | null {
  const response = Notifications.getLastNotificationResponse();
  if (!response) return null;
  const path = pathFromNotificationData(response.notification.request.content.data);
  Notifications.clearLastNotificationResponse();
  return path;
}

/** Refresh after OS permission changes and native token rotation. Never prompts. */
export function watchPushRegistration(): { remove(): void } {
  const sync = () => { void syncPushTokenIfGranted().catch(error => console.warn('[push] sync failed', error)); };
  const state = AppState.addEventListener('change', value => { if (value === 'active') sync(); });
  const token = Notifications.addPushTokenListener(sync);
  return { remove() { state.remove(); token.remove(); } };
}
