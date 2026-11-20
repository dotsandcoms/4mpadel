import { useEffect, useId, useRef, useState } from 'react';
import { applyImportedRosterBatch, hasImportedRosterChanges, importedRosterChangeCounts, reviewImportedRosterBatch } from './importedParticipantBulkSync.js';
import { useEventOperation } from './useEventOperation.js';
import RecordLoading from './RecordLoading.jsx';
import './EventPaymentDialog.css';
import './ImportedParticipantDialog.css';

const workspaceEvent = { id: 'rankedin-roster-batch' };
const statusText = event => event.event_name || `Event ${event.id}`;
const actionLabels = { add: 'Add', update: 'Update', remove: 'Remove', retain: 'Keep linked entry' };

export default function ImportedParticipantBulkSyncDialog({ client, session, scopeId, events, onClose, gateway }) {
  const title = useId();
  const userId = session?.user?.id;
  const [selected, setSelected] = useState(() => events.map(event => String(event.id)));
  const [targets, setTargets] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewError, setReviewError] = useState('');
  const [progress, setProgress] = useState('');
  const request = useRef(null);
  const { bindDialog, close, run, busy, result, error } = useEventOperation({ client, session, scopeId, onClose, event: workspaceEvent, timeoutMs: 180000 });

  useEffect(() => {
    if (!targets) return undefined;
    const controller = new AbortController();
    request.current = controller;
    reviewImportedRosterBatch({ client, events: targets, expectedUserId: userId, scopeId, gateway, signal: controller.signal,
      onProgress: (complete, total) => { if (!controller.signal.aborted) setProgress(`${complete} of ${total} events reviewed.`); } })
      .then(rows => { if (!controller.signal.aborted) setReview(rows); })
      .catch(issue => { if (!controller.signal.aborted) setReviewError(issue.message || 'The import review could not be loaded.'); });
    return () => controller.abort();
  }, [targets, client, userId, scopeId, gateway]);

  const planned = review?.filter(row => hasImportedRosterChanges(row.review)) || [];
  const skipped = review?.filter(row => row.error) || [];
  const change = eventId => setSelected(previous => previous.includes(String(eventId)) ? previous.filter(id => id !== String(eventId)) : [...previous, String(eventId)]);
  const startReview = form => {
    form.preventDefault();
    if (selected.length) setTargets(events.filter(event => selected.includes(String(event.id))));
  };
  const chooseEvents = () => { setReview(null); setProgress(''); setReviewError(''); setTargets(null); };
  const submitReview = form => {
    form.preventDefault();
    if (planned.length && !busy) run(checks => applyImportedRosterBatch({ client, batch: planned, expectedUserId: userId,
      scopeId, signal: request.current.signal, ...checks,
      onProgress: (complete, total) => { if (checks.isCurrent()) setProgress(`${complete} of ${total} events finished.`); } }));
  };

  return <dialog ref={bindDialog} className="ap-payment-dialog ap-imported-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>Event Manager</p><h2 id={title}>Bulk sync RankedIn rosters</h2></div>
      <button type="button" className="ap-icon-button" aria-label="Close bulk RankedIn sync" disabled={busy} onClick={close}>×</button></header>
    {result ? <form>
      <p role="status">{result.saved.length} {result.saved.length === 1 ? 'roster updated' : 'rosters updated'}. {result.failures.length} could not be confirmed.
        {skipped.length > 0 && ` ${skipped.length} skipped during review.`}</p>
      <ul className="ap-imported-results">{result.saved.map(({ event, result }) => <li key={event.id}><b>{statusText(event)}</b> · {result.inserted} added, {result.updated} updated, {result.removed} removed</li>)}
        {result.failures.map(({ event, attempted, error }) => <li key={event.id}><b>{statusText(event)}</b> · {error}{attempted && ' Refresh this event before retrying.'}</li>)}
        {skipped.map(({ event, error }) => <li key={event.id}><b>{statusText(event)}</b> · {error}</li>)}</ul>
      <footer><button type="button" className="ap-secondary" onClick={close}>Done</button></footer>
    </form> : !targets ? <form onSubmit={startReview}>
      <p>Select the imported events to check in the current Event Manager view.</p>
      <fieldset className="ap-imported-results"><legend>{selected.length} of {events.length} events selected</legend>
        {events.map(event => <label key={event.id}><input type="checkbox" checked={selected.includes(String(event.id))} onChange={() => change(event.id)} /> {statusText(event)}</label>)}
      </fieldset>
      <footer><button type="button" className="ap-secondary" onClick={close}>Cancel</button>
        <button type="submit" className="ap-primary" disabled={!selected.length}>Review selected rosters</button></footer>
    </form> : <form onSubmit={submitReview}>
      {!review && !reviewError && <RecordLoading label="Reviewing every RankedIn division…" detail={progress} />}
      {reviewError && <p role="alert">{reviewError}</p>}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">{progress}</p>}
      {review && <><p>{planned.length} {planned.length === 1 ? 'event has' : 'events have'} roster changes ready to apply.</p><ul className="ap-imported-results">
        {review.map(({ event, review, error }) => {
          const counts = importedRosterChangeCounts(review);
          return <li key={event.id}><b>{statusText(event)}</b>
            {error ? <p>{error}</p> : <><p>{counts.add} to add, {counts.update} to update, {counts.remove} to remove, {counts.retain} protected.</p>
              {review.plan.changes.length > 0 && <details><summary>View roster changes</summary><ul>
                {review.plan.changes.map((row, index) => <li key={`${index}:${row.source_id || ''}`}>{actionLabels[row.action]} · {row.name} · {row.division}</li>)}
              </ul></details>}</>}
          </li>;
        })}
      </ul></>}
      <footer><button type="button" className="ap-secondary" onClick={close} disabled={busy}>Close</button>
        {!busy && !error && <button type="button" className="ap-secondary" onClick={chooseEvents}>Choose events</button>}
        <button type="submit" className="ap-primary" disabled={busy || Boolean(error) || !planned.length}>{busy ? 'Saving rosters…' : 'Confirm roster imports'}</button>
      </footer>
    </form>}
  </dialog>;
}
