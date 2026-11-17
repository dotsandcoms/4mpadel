import { useEffect, useState } from 'react';
import { homePortraitCache, type HomeProPortrait } from '@/lib/home-pro-portraits';
import { useScreenActive } from './use-screen-active';

/** Seed from one small public snapshot; look up only this rail's current match. */
export function useHomeResultPortraits(ids: number[], current: boolean) {
  const active = useScreenActive(), key = ids.join(',');
  const [portraits, setPortraits] = useState<Record<number, HomeProPortrait>>({});
  useEffect(() => {
    if (!active || !current) return;
    let cancelled = false;
    const update = () => {
      if (cancelled) return;
      setPortraits(Object.fromEntries(ids.map(id => [id, homePortraitCache.read(id)]).filter((entry): entry is [number, HomeProPortrait] => entry[1] !== null)));
    };
    update();
    void (async () => {
      try { await homePortraitCache.seed(); } catch { /* Cached portraits and initials remain visible. */ }
      update();
      for (const id of ids.slice(0, 4)) {
        if (cancelled) return;
        if (homePortraitCache.read(id)) continue;
        try { await homePortraitCache.load(id); update(); } catch { /* Retry on a later visit. */ }
      }
    })();
    return () => { cancelled = true; };
  }, [key, current, active]);
  return portraits;
}
