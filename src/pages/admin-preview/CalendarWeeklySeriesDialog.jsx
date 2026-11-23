import { useEffect, useId, useState } from 'react';
import { dateLabel } from './playersData.js';
import { loadCalendarWeeklySeries, saveCalendarWeeklyVisibility } from './calendarWeeklySeriesActions.js';
import { useEventOperation } from './useEventOperation.js';
import './EventPaymentDialog.css';

export default function CalendarWeeklySeriesDialog({ client, event, session, scopeId, onClose, onEdit }) {
  const title = useId();
  const expectedUserId = session?.user?.id;
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [visible, setVisible] = useState(null);
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, event, session, scopeId, onClose });
  useEffect(() => {
    const controller = new AbortController();
    setPreview(null);
    setLoadError('');
    setVisible(null);
    loadCalendarWeeklySeries({ client, event, expectedUserId, scopeId, isCurrent: () => !controller.signal.aborted })
      .then(data => { if (!controller.signal.aborted) setPreview(data); })
      .catch(problem => { if (!controller.signal.aborted) setLoadError(problem.message || 'The weekly series could not be loaded.'); });
    return () => controller.abort();
  }, [client, event, expectedUserId, scopeId]);

  const confirm = submitEvent => {
    submitEvent.preventDefault();
    if (visible !== null) run(checks => saveCalendarWeeklyVisibility({
      client, event, review: preview, visible, expectedUserId, scopeId, ...checks,
    }));
  };
  const editingBlocked = preview?.occurrences.some(row => row.event_status === 'cancelled');

  return <dialog ref={bindDialog} className="ap-payment-dialog" aria-labelledby={title} onCancel={cancelEvent => { cancelEvent.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Weekly series</h2></div>
      <button type="button" className="ap-icon-button" disabled={busy} aria-label="Close weekly series" onClick={close}>×</button></header>
    <form onSubmit={confirm}>
      {!preview && !loadError && <p role="status">Checking the linked weeks…</p>}
      {preview && !result && <>
        <ul aria-label="Linked weekly events">
          {preview.occurrences.map(row => <li key={row.id}>
            {dateLabel(row.start_date)} · {row.event_name} · {row.is_visible === false ? 'Hidden' : 'Visible'}{row.event_status === 'cancelled' && ' · Cancelled'}
          </li>)}
        </ul>
        {editingBlocked && visible === null && <p>A cancelled week must be reviewed before editing the series settings.</p>}
        {visible !== null && <p>{visible ? 'Show' : 'Hide'} all {preview.occurrences.length} reviewed weekly events on the public Calendar?</p>}
      </>}
      {result && <p role="status">{result.updated_count} weekly events are now {result.is_visible ? 'visible' : 'hidden'} on the public Calendar.</p>}
      {(loadError || error) && <p role="alert">{loadError || error}</p>}
      <footer>
        <button className="ap-secondary" type="button" disabled={busy} onClick={close}>{result || error || loadError ? 'Close' : 'Cancel'}</button>
        {preview && visible === null && !result && !error && <>
          {onEdit && !editingBlocked && <button className="ap-secondary" type="button" onClick={onEdit}>Edit weekly series</button>}
          {preview.occurrences.some(row => row.is_visible !== false) && <button className="ap-secondary" type="button" onClick={() => setVisible(false)}>Hide weekly series</button>}
          {preview.occurrences.some(row => row.is_visible === false) && <button className="ap-secondary" type="button" onClick={() => setVisible(true)}>Show weekly series</button>}
        </>}
        {visible !== null && !result && !error && <>
          <button className="ap-secondary" type="button" disabled={busy} onClick={() => setVisible(null)}>Back</button>
          <button className="ap-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : visible ? 'Confirm show series' : 'Confirm hide series'}</button>
        </>}
      </footer>
    </form>
  </dialog>;
}
