import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { trackScreen, trackScreenEngagement } from '@/lib/analytics';

export function useScreenAnalytics(pathname: string, segments: string, revealed: boolean) {
  const lastView = useRef<string | null>(null);

  useEffect(() => {
    if (!revealed) {
      lastView.current = null;
      return;
    }
    if (lastView.current !== pathname) {
      lastView.current = pathname;
      void trackScreen(segments);
    }

    let started = AppState.currentState === 'active' ? performance.now() : null;
    const pause = () => {
      if (started === null) return;
      const seconds = Math.round((performance.now() - started) / 1000);
      started = null;
      if (seconds > 0) void trackScreenEngagement(segments, seconds);
    };
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') pause();
      else if (started === null) started = performance.now();
    });

    return () => {
      pause();
      subscription.remove();
    };
  }, [pathname, segments, revealed]);
}
