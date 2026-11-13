import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { homeFeedCache } from '@/lib/home-feed-cache';
import { fetchEventWinners, type CalendarEvent } from '@/lib/home';
import { fetchEventWinnerDetails } from '@/lib/event-winner-details';
import { resultHighlightKey } from '@/lib/home-results';

/** Home already loaded the winners. Only refetch if its account-scoped cache is absent. */
export function useEventWinners(eventId: number) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ event?: CalendarEvent | null; loading: boolean; error: boolean; detailsLoading?: boolean; detailsError?: boolean }>({ loading: true, error: false });
  useEffect(() => {
    let active = true, generation = 0, received = false, owner: string | undefined;
    const receive = (user: { id: string; email?: string } | null) => {
      received = true;
      const key = user ? `${user.id}:${user.email?.trim().toLowerCase() || ''}` : 'guest';
      if (!active || owner === key) return;
      owner = key;
      homeFeedCache.setOwner(key);
      const version = ++generation;
      if (!Number.isSafeInteger(eventId) || eventId <= 0) {
        setState({ event: null, loading: false, error: false });
        return;
      }
      const cached = homeFeedCache.read<CalendarEvent[]>(key, 'results:all-divisions')?.find(event => event.id === eventId);
      setState({ event: cached, loading: !cached, error: false, detailsLoading: true });
      // Leave the auth callback before making any data request.
      void Promise.resolve().then(async () => {
        let event = cached;
        try {
          event ??= await fetchEventWinners(eventId) ?? undefined;
          if (!active || generation !== version) return;
          if (!event) { setState({ event: null, loading: false, error: false }); return; }
          setState({ event, loading: false, error: false, detailsLoading: true });
          const results = event.resultDivisions ?? (event.resultHighlight ? [event.resultHighlight] : []);
          const detailsKey = `winner-details:v1:${eventId}:${results.map(resultHighlightKey).join(':')}`;
          const details = await homeFeedCache.load(key, detailsKey, 300000, () => fetchEventWinnerDetails(event!), attempt > 0);
          if (active && generation === version && details) setState({ event: { ...event, resultDivisions: details.results }, loading: false, error: false, detailsLoading: false, detailsError: details.warning });
        } catch {
          if (active && generation === version) setState({ event, loading: false, error: !event, detailsError: !!event });
        }
      });
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => receive(session?.user ?? null));
    void supabase.auth.getSession().then(({ data }) => {
      if (!received) receive(data.session?.user ?? null);
    }).catch(() => {
      if (active && !received) setState({ loading: false, error: true });
    });
    return () => { active = false; generation++; data.subscription.unsubscribe(); };
  }, [eventId, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
