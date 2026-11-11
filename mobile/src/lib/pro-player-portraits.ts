import { invokeProResource } from './pro-padel-live';
export type ProPortrait = { id: number; photoUrl: string | null; nationality: string | null };
const rows = new Map<number, { value: ProPortrait; until: number }>();
const pending = new Map<number, Promise<ProPortrait>>();
let queued = new Map<number, { resolve: (v: ProPortrait) => void; reject: (e: unknown) => void }>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function parseProPortraits(value: unknown, ids: number[]): ProPortrait[] {
  const raw = (value as any)?.players;
  if (!Array.isArray(raw)) throw new Error('Player pictures could not be loaded.');
  return raw.filter(row => row && Number.isSafeInteger(row.id) && ids.includes(row.id)).map(row => ({ id: row.id,
    photoUrl: typeof row.photo_url === 'string' && row.photo_url.length <= 2048 && /^https:\/\//.test(row.photo_url) ? row.photo_url : null,
    nationality: /^[A-Z]{2}$/.test(row.nationality || '') ? row.nationality : null }));
}
async function flush() {
  timer = undefined;
  const batch = [...queued].slice(0, 32);
  for (const [id] of batch) queued.delete(id);
  const ids = batch.map(([id]) => id);
  try {
    const result = parseProPortraits(await invokeProResource('player-portraits', undefined, undefined, { player_ids: ids }), ids);
    const byId = new Map(result.map(row => [row.id, row]));
    for (const [id, wait] of batch) {
      const value = byId.get(id) || { id, photoUrl: null, nationality: null };
      if (rows.size >= 1000 && !rows.has(id)) rows.delete(rows.keys().next().value!);
      rows.set(id, { value, until: Date.now() + (value.photoUrl ? 3600000 : 300000) });
      wait.resolve(value);
    }
  } catch (error) { for (const [, wait] of batch) wait.reject(error); }
  finally { for (const [id] of batch) pending.delete(id); if (queued.size && !timer) timer = setTimeout(() => void flush(), 50); }
}
/** Coalesce visible match rows into bounded public-photo requests, with no provider calls. */
export function loadProPortraits(ids: number[]): Promise<ProPortrait[]> {
  return Promise.all([...new Set(ids)].filter(id => Number.isSafeInteger(id) && id > 0).map(id => {
    const cached = rows.get(id); if (cached && cached.until > Date.now()) return Promise.resolve(cached.value);
    if (pending.has(id)) return pending.get(id)!;
    const request = new Promise<ProPortrait>((resolve, reject) => queued.set(id, { resolve, reject }));
    pending.set(id, request); if (!timer) timer = setTimeout(() => void flush(), 30);
    return request;
  }));
}
