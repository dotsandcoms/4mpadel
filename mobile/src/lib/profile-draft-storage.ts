import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const legacyKey = (email = '') => `player_profile_draft_v1:${email.trim().toLowerCase()}`;
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
type Manifest = { generation: string; count: number };
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, action: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}
async function secureKey(email = '') {
  // Key names contain no email or ID number, and use SecureStore-safe characters.
  return 'profile-draft-' + await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, email.trim().toLowerCase());
}
async function manifest(key: string): Promise<Manifest | null> {
  const raw = await SecureStore.getItemAsync(key, options);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!/^[a-f0-9-]{36}$/i.test(value.generation) || !Number.isInteger(value.count) || value.count < 1 || value.count > 256) {
    throw new Error('Your saved profile draft could not be read.');
  }
  return value;
}
const partKey = (key: string, value: Manifest, index: number) => `${key}-${value.generation}-${index}`;
async function removeParts(key: string, value: Manifest | null) {
  if (value) await Promise.all(Array.from({ length: value.count }, (_, index) => SecureStore.deleteItemAsync(partKey(key, value, index), options)));
}
async function write(key: string, text: string) {
  const old = await manifest(key);
  // At most 500 Unicode code points (2000 UTF-8 bytes) per native value.
  const points = Array.from(text);
  if (points.length > 128000) throw new Error('Your profile draft is too large to save.');
  const parts = Array.from({ length: Math.max(1, Math.ceil(points.length / 500)) }, (_, index) => points.slice(index * 500, (index + 1) * 500).join(''));
  const value = { generation: Crypto.randomUUID(), count: parts.length };
  try {
    const writes = await Promise.allSettled(parts.map((part, index) => SecureStore.setItemAsync(partKey(key, value, index), part, options)));
    const failure = writes.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
    // Commit after every part succeeds. A failed write retains the previous draft.
    await SecureStore.setItemAsync(key, JSON.stringify(value), options);
  } catch (error) { await removeParts(key, value).catch(() => {}); throw error; }
  await removeParts(key, old).catch(() => {});
}
export async function saveDraftText(email: string | undefined, text: string) {
  if (Platform.OS === 'web') return AsyncStorage.setItem(legacyKey(email), text);
  const key = await secureKey(email);
  return serial(key, async () => { await write(key, text); await AsyncStorage.removeItem(legacyKey(email)); });
}
export async function loadDraftText(email?: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(legacyKey(email));
  const key = await secureKey(email);
  return serial(key, async () => {
    const saved = await manifest(key);
    if (saved) {
      const parts = await Promise.all(Array.from({ length: saved.count }, (_, index) => SecureStore.getItemAsync(partKey(key, saved, index), options)));
      if (parts.some(part => part === null)) throw new Error('Your saved profile draft is incomplete.');
      await AsyncStorage.removeItem(legacyKey(email));
      return parts.join('');
    }
    const legacy = await AsyncStorage.getItem(legacyKey(email));
    if (legacy !== null) { await write(key, legacy); await AsyncStorage.removeItem(legacyKey(email)); }
    return legacy;
  });
}
export async function clearDraftText(email?: string) {
  if (Platform.OS === 'web') return AsyncStorage.removeItem(legacyKey(email));
  const key = await secureKey(email);
  return serial(key, async () => {
    const saved = await manifest(key);
    await SecureStore.deleteItemAsync(key, options);
    await removeParts(key, saved);
    await AsyncStorage.removeItem(legacyKey(email));
  });
}

/** Upgrade drafts belonging to previously used accounts, not just the current one. */
export async function migrateLegacyDrafts() {
  if (Platform.OS === 'web') return;
  const prefix = 'player_profile_draft_v1:';
  const keys = await AsyncStorage.getAllKeys();
  for (const key of keys) {
    if (key.startsWith(prefix)) await loadDraftText(key.slice(prefix.length));
  }
}
