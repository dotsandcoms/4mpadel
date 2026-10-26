import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { subscribeForegroundClock } from '@/lib/foreground-task';

/** Countdown updates stop when their route is hidden or the app is backgrounded. */
export function useForegroundClock(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(Date.now);
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    return subscribeForegroundClock(setNow, intervalMs);
  }, [enabled, intervalMs]));
  return now;
}
