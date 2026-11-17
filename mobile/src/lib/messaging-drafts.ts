import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { saveDraftText, loadDraftText, clearDraftText } from './profile-draft-storage';
import { conversationId } from './messaging';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const queues = new Map<string, Promise<unknown>>(), disabled = new Set<string>();
const key = (owner: string) => `message-drafts-${conversationId(owner)}`;
const textKey = (owner: string, id: string) => `message:${owner}:${id}`;
function serial<T>(owner: string, fn: () => Promise<T>) {
  const next = (queues.get(owner) || Promise.resolve()).catch(() => {}).then(fn);
  queues.set(owner, next); void next.finally(() => { if (queues.get(owner) === next) queues.delete(owner); }).catch(() => {});
  return next;
}
async function index(owner: string): Promise<string[]> {
  const values: unknown = JSON.parse(await SecureStore.getItemAsync(key(owner), options) || '[]');
  return Array.isArray(values) ? values.slice(0, 20).filter((id): id is string => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id)) : [];
}
export function activateMessageDrafts(owner: string) { disabled.delete(owner); }
export function saveMessageDraft(owner: string, id: string, text: string) {
  if (Platform.OS === 'web' || disabled.has(owner)) return Promise.resolve();
  conversationId(id);
  return serial(owner, async () => {
    if (disabled.has(owner)) return;
    let ids = await index(owner);
    if (!text) { await clearDraftText(textKey(owner, id)); ids = ids.filter(value => value !== id); }
    else {
      if (!ids.includes(id) && ids.length === 20) { await clearDraftText(textKey(owner, ids[0])); ids = ids.slice(1); }
      // Register first so a crash/logout can clean an interrupted chunked write.
      ids = [...ids.filter(value => value !== id), id];
      await SecureStore.setItemAsync(key(owner), JSON.stringify(ids), options);
      await saveDraftText(textKey(owner, id), JSON.stringify({ text, expires: Date.now() + 86400000 }));
    }
    await SecureStore.setItemAsync(key(owner), JSON.stringify(ids), options);
  });
}
export async function loadMessageDraft(owner: string, id: string): Promise<string> {
  if (Platform.OS === 'web' || disabled.has(owner)) return '';
  conversationId(id);
  return serial(owner, async () => {
    if (disabled.has(owner)) return '';
    const raw = await loadDraftText(textKey(owner, id)); if (!raw) return '';
    const draft = JSON.parse(raw);
    if (typeof draft.text !== 'string' || draft.text.length > 16000 || !(draft.expires > Date.now())) { await clearDraftText(textKey(owner, id)); return ''; }
    return draft.text;
  });
}
export function clearMessageDrafts(owner: string) {
  disabled.add(owner);
  if (Platform.OS === 'web') return Promise.resolve();
  return serial(owner, async () => {
    const ids = await index(owner);
    await Promise.all(ids.map(id => clearDraftText(textKey(owner, id))));
    await SecureStore.deleteItemAsync(key(owner), options);
  });
}
