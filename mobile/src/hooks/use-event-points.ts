import { useEffect, useState } from 'react';
import { canCheckEventPoints, fetchEventPointsSheet, type PointsSheet } from '@/lib/event-documents';
import type { EventDetail } from '@/lib/events';

export function useEventPoints(event: EventDetail) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ eventId: number; sheet: PointsSheet | null; loading: boolean; error: string }>({ eventId: event.id, sheet: null, loading: true, error: '' });
  const eligible = canCheckEventPoints(event);
  useEffect(() => {
    let live = true;
    setState({ eventId: event.id, sheet: null, loading: eligible, error: '' });
    if (eligible) void fetchEventPointsSheet(event, revision > 0).then(sheet => { if (live) setState({ eventId: event.id, sheet, loading: false, error: '' }); })
      .catch(() => { if (live) setState({ eventId: event.id, sheet: null, loading: false, error: 'Ranking points could not load. Please retry.' }); });
    return () => { live = false; };
  }, [event, eligible, revision]);
  return { ...(state.eventId === event.id ? state : { sheet: null, loading: eligible, error: '' }), refresh: () => setRevision(value => value + 1) };
}
