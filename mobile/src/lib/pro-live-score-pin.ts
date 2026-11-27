import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { requireOptionalNativeModule } from 'expo';
import { AppState, Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

import { easProjectId } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';

type Pin = { pin: string; match: number; owner: string; installation: string; stopKey: string; token?: string };
type PinEvent = { pin: string; token?: string; ended?: boolean };
type NativePin = {
  availability(): Promise<'ready' | 'permission' | 'disabled'>;
  current(): Promise<{ pin: string; match: number; token?: string } | null>;
  start(pin: string, match: number, score: string, stopKey: string, endpoint: string): Promise<void>;
  stop(pin: string): Promise<void>;
  addListener(name: 'onPinChange', callback: (event: PinEvent) => void): { remove(): void };
};

const native = Platform.OS === 'ios' || Platform.OS === 'android'
  ? requireOptionalNativeModule<NativePin>('FourMLiveScores') : null;
export const supportsScorePinning = native !== null;
const name = 'pro-live-score-pin';
const endpoint = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/${name}`;
const pinKey = '4m.pro-live-score.pin.v1';
const pendingKey = '4m.pro-live-score.pending.v1';
const installationKey = '4m.pro-live-score.installation.v1';

type Revocation = Pick<Pin, 'pin' | 'stopKey'>;
let localPin: Pin | null = null;
let tail: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const pending = tail.then(fn, fn);
  tail = pending;
  return pending;
}

function publish(value: Pin | null) {
  localPin = value;
  listeners.forEach(listener => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export const usePinnedScore = () => useSyncExternalStore(subscribe, () => localPin?.match ?? null, () => null);

async function read<T>(key: string): Promise<T | null> {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const reply = await supabase.functions.invoke<T>(name, { body });
  if (reply.error) {
    const response = (reply.error as { context?: Response }).context;
    const data = await response?.json?.().catch(() => null);
    throw new Error(typeof data?.error === 'string' ? data.error : 'Pinned scores are temporarily unavailable.');
  }
  if (!reply.data) throw new Error('Pinned scores are temporarily unavailable.');
  return reply.data;
}

async function flushRevocations() {
  const pending = await read<Revocation[]>(pendingKey) ?? [];
  if (!pending.length) return;
  const responses = await Promise.allSettled(pending.map(async pin => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ action: 'revoke', pin: pin.pin, stopKey: pin.stopKey }),
      });
      if (!response.ok) throw new Error('Unpin will retry');
    } finally {
      clearTimeout(timer);
    }
  }));
  const failed = pending.filter((_, index) => responses[index].status === 'rejected');
  if (failed.length) await SecureStore.setItemAsync(pendingKey, JSON.stringify(failed));
  else await SecureStore.deleteItemAsync(pendingKey);
}

async function clearPin(pin: Pin, dismiss = true) {
  if (dismiss) await native?.stop(pin.pin);
  const pending = await read<Revocation[]>(pendingKey) ?? [];
  if (!pending.some(previous => previous.pin === pin.pin)) {
    await SecureStore.setItemAsync(pendingKey, JSON.stringify([...pending, { pin: pin.pin, stopKey: pin.stopKey }].slice(-20)));
  }
  await SecureStore.deleteItemAsync(pinKey);
  publish(null);
}

async function registerToken(pin: Pin, token: string) {
  if (pin.token === token) return;
  const answer = await invoke<{ active: boolean }>({ action: 'token', pin: pin.pin, installation: pin.installation, token });
  if (!answer.active) { await clearPin(pin); return; }
  const next = { ...pin, token };
  await SecureStore.setItemAsync(pinKey, JSON.stringify(next));
  publish(next);
}

async function androidPushToken(devicePushToken?: Notifications.DevicePushToken) {
  const projectId = easProjectId();
  if (!projectId) throw new Error('This device could not register for live scores.');
  return (await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken })).data;
}

async function reconcile(owner: string | null) {
  const pin = await read<Pin>(pinKey);
  if (!pin) {
    const orphan = await native?.current();
    if (orphan) await native?.stop(orphan.pin);
    publish(null);
  } else if (pin.owner !== owner) {
    await clearPin(pin);
  } else {
    const active = await native?.current();
    if (!active || active.pin !== pin.pin) await clearPin(pin, false);
    else {
      publish(pin);
      const token = Platform.OS === 'android' ? await androidPushToken() : active.token;
      if (token) await registerToken(pin, token);
    }
  }
  await flushRevocations();
}

export function watchLiveScorePins() {
  if (!native) return;
  let open = true;
  const refresh = () => void serialize(async () => {
    if (!open) return;
    const { data } = await supabase.auth.getSession();
    await reconcile(data.session?.user.id ?? null);
  }).catch(() => {});
  const wake = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
  const auth = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
    const owner = session?.user.id ?? null;
    // Supabase invokes this callback before releasing its auth lock.
    setTimeout(() => {
      if (open) void serialize(() => reconcile(owner)).catch(() => {});
    }, 0);
  });
  const activity = native.addListener('onPinChange', event => {
    void serialize(async () => {
      const pin = await read<Pin>(pinKey);
      if (pin?.pin !== event.pin) return;
      if (event.ended) { await clearPin(pin, false); await flushRevocations(); }
      else if (event.token) await registerToken(pin, event.token);
    }).catch(() => {});
  });
  const token = Platform.OS === 'android' ? Notifications.addPushTokenListener(value => {
    void serialize(async () => {
      const pin = await read<Pin>(pinKey);
      if (pin && typeof value.data === 'string') await registerToken(pin, await androidPushToken(value));
    }).catch(() => {});
  }) : null;
  return () => {
    open = false;
    wake.remove();
    activity.remove();
    token?.remove();
    auth.data.subscription.unsubscribe();
  };
}

export function pinLiveScore(match: number) {
  return serialize(async () => {
    if (!native) throw new Error('Pinned scores are unavailable on this device.');
    const { data } = await supabase.auth.getSession();
    const owner = data.session?.user.id;
    if (!owner) throw new Error('Sign in to pin a live score.');
    const previous = await read<Pin>(pinKey);
    if (previous?.owner === owner && previous.match === match) return;
    if (previous && previous.owner !== owner) await clearPin(previous);
    let availability = await native.availability();
    if (availability === 'permission') {
      await Notifications.requestPermissionsAsync();
      availability = await native.availability();
    }
    if (availability !== 'ready') {
      throw new Error(Platform.OS === 'ios' ? 'Allow Live Activities for 4M Padel in Settings.' : 'Allow 4M Padel notifications in Settings.');
    }
    const androidToken = Platform.OS === 'android' ? await androidPushToken() : undefined;
    let installation = await read<{ owner: string; id: string }>(installationKey);
    if (installation?.owner !== owner) {
      installation = { owner, id: Crypto.randomUUID() };
      await SecureStore.setItemAsync(installationKey, JSON.stringify(installation));
    }
    const stopKey = Array.from(await Crypto.getRandomBytesAsync(32), value => value.toString(16).padStart(2, '0')).join('');
    const next = { owner, match, installation: installation.id, pin: Crypto.randomUUID(), stopKey };
    const { score } = await invoke<{ score: unknown }>({
      action: 'start', pin: next.pin, installation: next.installation, match, platform: Platform.OS, stopKey,
    });
    try {
      if (previous?.owner === owner) await clearPin(previous);
      await SecureStore.setItemAsync(pinKey, JSON.stringify(next));
      await native.start(next.pin, match, JSON.stringify(score), stopKey, endpoint);
      publish(next);
      const token = androidToken ?? (await native.current())?.token;
      if (token) await registerToken(next, token);
    } catch (error) {
      await clearPin(next);
      try { await flushRevocations(); } catch { /* Retry on the next foreground. */ }
      throw error;
    }
  });
}

export function unpinLiveScore(match: number) {
  return serialize(async () => {
    const pin = await read<Pin>(pinKey);
    if (!pin || pin.match !== match) return;
    await clearPin(pin);
    try { await flushRevocations(); } catch { /* Retry on the next foreground. */ }
  });
}
