import { useEffect, useRef } from 'react';
import { trackEvent } from '@/lib/analytics';

/** Count settled searches, including live search without keyboard submission. Never send the text. */
export function useAnalyticsSearch(query: string, resultCount: number, contentType: 'events' | 'players' | 'rankings' | 'media', ready = true) {
  const last = useRef('');
  useEffect(() => {
    const value = query.trim();
    if (!value) { last.current = ''; return; }
    if (!ready || value.length < 2 || last.current === value) return;
    const timer = setTimeout(() => {
      last.current = value;
      void trackEvent('search_performed', { content_type: contentType, query_length: Math.min(value.length, 200), result_count: resultCount });
    }, 1200);
    return () => clearTimeout(timer);
  }, [query, resultCount, contentType, ready]);
}
