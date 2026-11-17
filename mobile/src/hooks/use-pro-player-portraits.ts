import { useEffect, useState } from 'react';
import { loadProPortraits } from '@/lib/pro-player-portraits';
import { homePortraitCache } from '@/lib/home-pro-portraits';
import { useScreenActive } from './use-screen-active';

export function useProPlayerPortraits(ids: number[], enabled = true) {
  const active = useScreenActive(), key = ids.join(',');
  const [photos, setPhotos] = useState<Record<number, string | null>>({});
  useEffect(() => {
    if (!active || !enabled || !ids.length) return;
    let cancelled = false;
    const seeded = Object.fromEntries(ids.map(id => [id, homePortraitCache.read(id)?.photoUrl || null]));
    setPhotos(seeded);
    void loadProPortraits(ids.filter(id => !seeded[id])).then(rows => {
      if (!cancelled) setPhotos({ ...seeded, ...Object.fromEntries(rows.map(row => [row.id, row.photoUrl])) });
    }).catch(() => { /* Keep real cached photos or initials; never search players by name. */ });
    return () => { cancelled = true; };
  }, [key, active, enabled]);
  return photos;
}
