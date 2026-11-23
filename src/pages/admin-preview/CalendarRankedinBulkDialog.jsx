import { useEffect, useId, useRef, useState } from 'react';
import { useEventOperation } from './useEventOperation.js';
import { createCalendarRankedinGateway } from './calendarRankedinGateway.js';
import { applyRankedinCalendarImport, loadRankedinCalendarImport, pastRankedinCalendarEvents, refreshPastRankedinCache } from './calendarRankedinBulk.js';
import './EventPaymentDialog.css';

const provider = createCalendarRankedinGateway();
const bulkScope = { id: 'rankedin-calendar-bulk' };

export default function CalendarRankedinBulkDialog({ client, session, scopeId, mode, events, onClose, gateway = provider }) {
  const title = useId();
  const previewAbort = useRef(null);
  const importing = mode === 'import-rankedin';
  const label = importing ? 'Import RankedIn events' : 'Refresh past RankedIn draws and results';
  const [plan, setPlan] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [excluded, setExcluded] = useState([]);
  const [progress, setProgress] = useState('');
  const [pastEvents] = useState(() => pastRankedinCalendarEvents(events));
  const expectedUserId = session?.user?.id;
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, session, scopeId, event: bulkScope, onClose, timeoutMs: 600000 });

  useEffect(() => {
    const controller = new AbortController();
    previewAbort.current = controller;
    if (importing) {
      loadRankedinCalendarImport({ client, gateway, expectedUserId, scopeId, signal: controller.signal })
        .then(review => { if (!controller.signal.aborted) setPlan(review); })
        .catch(issue => { if (!controller.signal.aborted) setPreviewError(issue.message); });
    }
    return () => controller.abort();
  }, [client, gateway, expectedUserId, importing, scopeId]);

  const selected = plan?.actions.filter(row => !excluded.includes(row.event.rankedin_id)) || [];
  const ready = importing ? selected.length > 0 : pastEvents.length > 0;
  const confirm = formEvent => {
    formEvent.preventDefault();
    if (!ready) return;
    run(checks => {
      const context = {
        client, gateway, expectedUserId, scopeId, signal: previewAbort.current.signal, ...checks,
        onProgress: (complete, total) => { if (checks.isCurrent()) setProgress(complete + ' of ' + total + ' checked'); },
      };
      return importing ? applyRankedinCalendarImport({ ...context, plan: selected }) : refreshPastRankedinCache({ ...context, events: pastEvents });
    });
  };
  const toggle = id => setExcluded(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);

  return <dialog ref={bindDialog} className="ap-payment-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>Calendar</p><h2 id={title}>{label}</h2></div><button type="button" className="ap-icon-button" disabled={busy} aria-label={'Close ' + label} onClick={close}>×</button></header>
    <form onSubmit={confirm}>
      {result ? <>
        <p role="status">{importing ? 'Added ' + result.inserted + ', updated ' + result.updated + ', already current ' + result.unchanged + '.'
          : 'Refreshed ' + result.refreshed + ' event caches.'}{result.failures.length > 0 && ' ' + result.failures.length + ' could not be confirmed.'}</p>
        {result.failures.length > 0 && <ul>{result.failures.map(row => <li key={row.name}>{row.name} · {row.message}</li>)}</ul>}
        {Boolean(result.detailWarnings?.length) && <p>Details were unavailable for {result.detailWarnings.length} events. The import used the event list for those records.</p>}
      </> : <>
        <p>{importing ? 'Review the latest finished and upcoming SAPA events from RankedIn. New events will appear on the public calendar. Existing imported records receive provider updates.'
          : 'Refresh published draw and result data for the listed RankedIn events. This changes the public cache and may take several minutes.'}</p>
        {importing && !plan && !previewError && <p role="status">Checking the federation event list…</p>}
        {previewError && <p role="alert">{previewError}</p>}
        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">{progress || 'Starting the confirmed request…'}</p>}
        {plan && <>
          {plan.actions.length > 0 ? <fieldset disabled={busy} className="cw-bulk-rankedin-list"><legend>{selected.length} events selected</legend>
            {plan.actions.map(({ event, existing }) => <label key={event.rankedin_id}><input type="checkbox" checked={!excluded.includes(event.rankedin_id)} onChange={() => toggle(event.rankedin_id)} /><span><b>{event.event_name}</b><small>{existing ? 'Update imported event' : 'Add public event'} · {event.start_date} · RankedIn #{event.rankedin_id}</small></span></label>)}
          </fieldset> : <p>There are no events ready to import.</p>}
          {plan.invalid > 0 && <p>{plan.invalid} provider records had missing names, IDs or dates.</p>}
          {plan.skipped.length > 0 && <details><summary>{plan.skipped.length} events need manual review</summary><ul>{plan.skipped.map(({ event, reason }) => <li key={event.rankedin_id}>{event.event_name} · {reason}</li>)}</ul></details>}
        </>}
        {!importing && (pastEvents.length > 0
          ? <ul className="cw-bulk-rankedin-list" aria-label="Past RankedIn events">{pastEvents.map(event => <li key={event.id}>{event.event_name}</li>)}</ul>
          : <p>There are no past linked events to refresh.</p>)}
      </>}
      <footer><button type="button" className="ap-secondary" onClick={close} disabled={busy}>{result ? 'Done' : 'Cancel'}</button>
        {!result && <button type="submit" className="ap-primary" disabled={!ready || busy || Boolean(error || previewError)}>{busy ? 'Working…' : importing ? 'Confirm event import' : 'Confirm cache refresh'}</button>}
      </footer>
    </form>
  </dialog>;
}
