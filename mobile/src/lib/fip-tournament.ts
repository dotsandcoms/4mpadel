import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { ProTournament } from './pro-padel';
import type { DrawSection } from './tournament-draw';

export type FipDocument = { id: string; title: string; kind: 'draw' | 'schedule'; url: string };
export type FipTournament = { version: 1; event: ProTournament; info: { label: string; value: string }[];
  documents: FipDocument[]; sections: DrawSection[]; updatedAt: string | null; stale: boolean; pending: boolean };
const requests = new Map<number, Promise<FipTournament>>();
const memory = new Map<number, { value: FipTournament; at: number }>();
const storageKey = (id: number) => `fip-tournament-v1:${id}`;
export function isFipDocumentUrl(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.padelfip.com' && !url.port && !url.username && !url.password && /^\/wp-content\/uploads\/[a-zA-Z0-9_./%()-]+\.pdf$/i.test(url.pathname) && !url.search && !url.hash && !url.pathname.includes('..'); } catch { return false; }
}
function valid(value: any, id: number): value is FipTournament {
  return value?.version === 1 && value?.event?.id === id && Array.isArray(value.info) && Array.isArray(value.documents)
    && value.documents.every((d: any) => typeof d.id === 'string' && typeof d.title === 'string' && ['draw', 'schedule'].includes(d.kind) && isFipDocumentUrl(d.url)) && Array.isArray(value.sections);
}
export async function fetchFipTournament(id: number, refresh = false): Promise<FipTournament> {
  if (!Number.isSafeInteger(id) || id >= 0) throw new Error('Invalid official tournament.');
  const cached = memory.get(id);
  if (!refresh && cached && !cached.value.pending && Date.now() - cached.at < 300000) return cached.value;
  if (requests.has(id)) return requests.get(id)!;
  const request = (async () => {
    const { data, error } = await supabase.functions.invoke('fip-tournament', { body: { eventId: id } });
    if (!error && valid(data, id)) {
      memory.set(id, { value: data, at: Date.now() });
      if (memory.size > 8) memory.delete(memory.keys().next().value!);
      if (!data.pending) await AsyncStorage.setItem(storageKey(id), JSON.stringify(data)).catch(() => {});
      return data;
    }
    const saved = cached?.value || await AsyncStorage.getItem(storageKey(id)).then(value => value ? JSON.parse(value) : null).catch(() => null);
    if (valid(saved, id) && !saved.pending) return { ...saved, stale: true };
    throw new Error('Tournament details could not load. Please try again.');
  })().finally(() => requests.delete(id));
  requests.set(id, request);
  return request;
}
