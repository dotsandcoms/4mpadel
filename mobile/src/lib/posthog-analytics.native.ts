import { Platform } from 'react-native';
import { PostHog } from 'posthog-react-native';
import { posthogHost } from './telemetry-privacy';

const lifecycleEvents = new Set(['Application Installed', 'Application Updated', 'Application Opened',
  'Application Became Active', 'Application Backgrounded']);
const sdkFields = new Set(['$anon_distinct_id', '$device_id', '$session_id', '$lib', '$lib_version',
  '$app_version', '$app_build', '$os_name', '$os_version', '$device_type', '$screen_name', '$is_identified',
  '$prev_app_version', '$prev_app_build', '$process_person_profile']);
const analyticsFields = new Set(['method', 'photo_changed', 'item_category', 'currency', 'value',
  'payment_state', 'item_count', 'enabled', 'content_type', 'notify', 'permission', 'result_count',
  'query_length', 'content_id', 'feature', 'action', 'selection', 'step', 'flow', 'status', 'preference',
  'timing_field', 'destination', 'engagement_seconds', 'screen', 'transaction_id', 'items']);
let client: PostHog | undefined;
let accountId: string | undefined;

export function initializePostHog() {
  const token = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  if (client || !token?.startsWith('phc_')) return;
  try {
    const environment = process.env.EXPO_PUBLIC_TELEMETRY_ENV || (__DEV__ ? 'development' : 'production');
    client = new PostHog(token, {
      host: posthogHost(process.env.EXPO_PUBLIC_POSTHOG_HOST),
      personProfiles: 'identified_only',
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      disableGeoip: false,
      before_send: event => {
        if (!event || event.event === '$exception' || event.event === '$snapshot') return null;
        const properties = Object.fromEntries(Object.entries(event.properties ?? {})
          .filter(([key]) => sdkFields.has(key) || analyticsFields.has(key)));
        return { ...event, properties: { ...properties, platform: Platform.OS, environment },
          $set: undefined, $set_once: undefined };
      },
    });
  } catch { /* Analytics must not affect app startup. */ }
}

export function capturePostHogEvent(event: string, properties: Record<string, unknown> = {}) {
  if (lifecycleEvents.has(event)) return;
  try { client?.capture(event, properties as Parameters<PostHog['capture']>[1]); } catch { /* Independent of the user action. */ }
}

export function capturePostHogScreen(name: string) {
  try { void client?.screen(name, { screen: name }).catch(() => {}); } catch { /* Independent of navigation. */ }
}

export async function identifyPostHogAccount(id: string | null) {
  const readyClient = client;
  if (!readyClient || (id !== null && accountId === id)) return;
  try {
    // A fresh SDK instance returns an empty ID until it loads the persisted identity.
    await readyClient.ready();
    const currentId = readyClient.getDistinctId();
    if ((accountId || /^[a-f0-9]{64}$/.test(currentId)) && currentId !== id) readyClient.reset();
    if (id) readyClient.identify(id);
    accountId = id ?? undefined;
  } catch { /* Independent of authentication. */ }
}

export function resetPostHogAccount() {
  accountId = undefined;
  try { client?.reset(); } catch { /* Independent of account deletion. */ }
}
