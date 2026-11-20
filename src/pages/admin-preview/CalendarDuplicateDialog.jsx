import { useEffect, useId, useState } from 'react';
import { loadCalendarDuplicateReview, prepareCalendarDuplicate, saveCalendarDuplicate } from './calendarDuplicate.js';
import { useEventOperation } from './useEventOperation.js';
import './EventPaymentDialog.css';

export default function CalendarDuplicateDialog({ client, event, session, scopeId, onClose }) {
  const title = useId();
  const expectedUserId = session?.user?.id;
  const [preview, setPreview] = useState(null);
  const [form, setForm] = useState(null);
  const [review, setReview] = useState(null);
  const [validation, setValidation] = useState('');
  const { bindDialog, busy, error, result, close, run } = useEventOperation({
    client, event, session, scopeId, onClose: response => onClose({ ...response, eventId: result?.id }),
  });

  useEffect(() => {
    const controller = new AbortController();
    loadCalendarDuplicateReview({ client, event, expectedUserId, scopeId, isCurrent: () => !controller.signal.aborted })
      .then(data => {
        if (controller.signal.aborted) return;
        setPreview(data);
        setForm({ title: data.event_name + ' (copy)', start: data.start_date || '', end: data.end_date || '' });
      })
      .catch(problem => { if (!controller.signal.aborted) setValidation(problem.message); });
    return () => controller.abort();
  }, [client, event, expectedUserId, scopeId]);

  const change = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = submitEvent => {
    submitEvent.preventDefault();
    if (!review) {
      try {
        setReview({ ...prepareCalendarDuplicate(form), requestId: crypto.randomUUID() });
        setValidation('');
      } catch (problem) { setValidation(problem.message); }
      return;
    }
    run(checks => saveCalendarDuplicate({ client, event, review: preview, form: review, requestId: review.requestId, expectedUserId, scopeId, ...checks }));
  };

  return <dialog ref={bindDialog} className="ap-payment-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Duplicate event</h2></div>
      <button type="button" className="ap-icon-button" disabled={busy} aria-label="Close duplicate event" onClick={close}>×</button></header>
    <form onSubmit={submit}>
      {result ? <p role="status">{result.created ? 'Hidden event copy created.' : 'This event copy already exists.'}</p> : <>
        {!preview && !validation && <p role="status">Checking source event and divisions…</p>}
        {preview && (review ? <>
          <div><strong>{review.title}</strong><p>{review.start}{review.end && ' – ' + review.end}</p></div>
          <p>{preview.division_count} division{preview.division_count === 1 ? '' : 's'} will be copied.</p>
          <p>The copy uses the source organiser and event setup. It starts hidden with registrations closed.</p>
          {preview.has_access_code && <p>Set a new access code when preparing this event for registration.</p>}
        </> : <>
          <label>Event name<input required value={form.title} onChange={event => change('title', event.target.value)} /></label>
          <div className="pp-form-grid">
            <label>Start date<input type="date" required value={form.start} onChange={event => change('start', event.target.value)} /></label>
            <label>End date<input type="date" min={form.start || undefined} value={form.end} onChange={event => change('end', event.target.value)} /></label>
          </div>
        </>)}
        {(validation || error) && <p role="alert">{validation || error}</p>}
      </>}
      <footer>
        <button className="ap-secondary" type="button" disabled={busy} onClick={close}>{result ? 'Open copied event' : 'Cancel'}</button>
        {review && !busy && !error && !result && <button className="ap-secondary" type="button" onClick={() => setReview(null)}>Back</button>}
        {preview && !result && <button className="ap-primary" type="submit" disabled={busy || Boolean(error)}>
          {busy ? 'Creating copy…' : review ? 'Confirm duplicate' : 'Review copy'}
        </button>}
      </footer>
    </form>
  </dialog>;
}
