import { useId, useState } from 'react';
import { useEventOperation } from './useEventOperation.js';
import { saveCalendarRecordAction } from './calendarRecordActions.js';
import { useRankedin } from '../../hooks/useRankedin';
import './EventPaymentDialog.css';

export default function CalendarRecordAction({ client, event, action, session, scopeId, onClose, save = saveCalendarRecordAction }) {
  const title = useId();
  const rankedin = useRankedin();
  const [confirmation, setConfirmation] = useState('');
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, event, session, scopeId, onClose });
  const deleting = action === 'delete';
  const visibility = action === 'visibility';
  const syncing = action === 'sync-source';
  const label = deleting ? 'Delete event' : visibility ? (event.is_visible === false ? 'Show on website' : 'Hide from website')
    : syncing ? 'Refresh RankedIn cache' : event.finance_managed ? 'Remove from Event Manager' : 'Add to Event Manager';
  const confirmed = !deleting || confirmation === event.event_name;
  return <dialog ref={bindDialog} className="ap-payment-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>{label}</h2></div>
      <button type="button" className="ap-icon-button" disabled={busy} aria-label="Close event action" onClick={close}>×</button></header>
    <form onSubmit={formEvent => { formEvent.preventDefault(); if (confirmed) run(checks => save({ client, event, action, rankedin, expectedUserId: session?.user?.id, scopeId, ...checks })); }}>
      {result ? <p role="status">{result.message}</p> : <>
        <p>{deleting ? 'Deleting the event also permanently deletes its payout requests and saved banking details.'
          : syncing ? 'Refresh draws, published results and upcoming matches from the event’s existing RankedIn link.'
            : visibility ? event.is_weekly && event.series_id ? 'This changes website visibility for every event in the weekly series.' : 'This changes where the event appears on the website.'
            : 'The event and its records stay on the calendar. This changes whether it is managed through the Event Manager.'}</p>
        {deleting && <label>Type the event name to confirm<input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy || Boolean(error)} /></label>}
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result ? 'Done' : 'Cancel'}</button>
        {!result && <button type="submit" className={deleting ? 'ap-danger-button' : 'ap-primary'} disabled={!confirmed || busy || Boolean(error)}>{busy ? 'Saving…' : label}</button>}
      </footer>
    </form>
  </dialog>;
}
