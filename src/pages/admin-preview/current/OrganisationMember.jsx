import { useEffect, useState } from 'react';
import { supabase } from '../../../supabaseClient';

export default function OrganisationMember({ organisation }) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    supabase.from('calendar').select('id, event_name, start_date').eq('organisation_id', organisation.id)
      .gte('start_date', new Date().toISOString().slice(0, 10)).order('start_date').order('id').limit(50)
      .abortSignal(controller.signal).then(({ data, error }) => {
        if (!controller.signal.aborted) setResult(error ? { error: true } : { events: data || [] });
      }, () => {
        if (!controller.signal.aborted) setResult({ error: true });
      });
    return () => controller.abort();
  }, [organisation.id]);

  return <section className="space-y-4"><h2 className="text-xl font-bold">{organisation.name}</h2><h3 className="font-semibold">Upcoming events</h3>
    {!result ? <p role="status">Loading organisation events…</p> : result.error ? <p role="alert">Could not load organisation events.</p> : result.events.length
      ? <ul className="divide-y divide-white/15">{result.events.map(event => <li key={event.id} className="flex justify-between gap-4 py-2"><span>{event.event_name}</span><time dateTime={event.start_date}>{event.start_date}</time></li>)}</ul>
      : <p>No upcoming events found.</p>}
  </section>;
}
