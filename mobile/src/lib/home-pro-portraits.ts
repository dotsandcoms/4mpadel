import { fetchProSnapshot } from './pro-padel';
import { fetchPlayerProfile } from './pro-padel-live';

export type HomeProPortrait = { id: number; photoUrl: string | null; nationality: string | null };
const hour = 3600000;
const safe = (player: HomeProPortrait): HomeProPortrait => ({ id: player.id,
  photoUrl: typeof player.photoUrl === 'string' && /^https:\/\//.test(player.photoUrl) ? player.photoUrl : null,
  nationality: /^[A-Z]{2}$/.test(player.nationality ?? '') ? player.nationality : null });

/** Only public sports portraits, never account or player-contact data. */
export function createHomePortraitCache(snapshot: () => Promise<HomeProPortrait[]>, profile: (id: number) => Promise<HomeProPortrait | null>, now = Date.now) {
  const rows = new Map<number, { player: HomeProPortrait; until: number }>();
  const pending = new Map<number, Promise<HomeProPortrait | null>>();
  let snapshotUntil = 0, snapshotRequest: Promise<void> | null = null;
  return {
    read(id: number) { const row = rows.get(id); return row && row.until > now() ? row.player : null; },
    async seed() {
      if (snapshotUntil > now()) return;
      if (snapshotRequest) return snapshotRequest;
      snapshotRequest = snapshot().then(players => {
        for (const player of players) if (Number.isSafeInteger(player.id) && player.id > 0) rows.set(player.id, { player: safe(player), until: now() + hour });
        snapshotUntil = now() + hour;
      }).finally(() => { snapshotRequest = null; });
      return snapshotRequest;
    },
    async load(id: number) {
      if (!Number.isSafeInteger(id) || id <= 0) return null;
      const existing = this.read(id);
      if (existing) return existing;
      if (pending.has(id)) return pending.get(id)!;
      const request = profile(id).then(player => {
        if (!player || player.id !== id) return null;
        const clean = safe(player);
        rows.set(id, { player: clean, until: now() + hour });
        return clean;
      }).finally(() => { pending.delete(id); });
      pending.set(id, request);
      return request;
    },
  };
}

export const homePortraitCache = createHomePortraitCache(async () => {
  const snapshot = await fetchProSnapshot('rankings');
  return [...snapshot.categories.men.players, ...snapshot.categories.women.players];
}, fetchPlayerProfile);
