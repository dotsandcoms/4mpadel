import { useCallback, useEffect, useState } from 'react';

export default function useVisibleRefresh(enabled = true, intervalMs = 5 * 60 * 1000) {
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return undefined;
    const refresh = () => { if (!document.hidden) retry(); };
    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled, intervalMs, retry]);
  return [tick, retry];
}
