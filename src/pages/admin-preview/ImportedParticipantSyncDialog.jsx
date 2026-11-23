import { useEffect, useId, useState } from 'react';
import { useEventOperation } from './useEventOperation.js';
import { reviewRankedinParticipantSync, saveRankedinParticipantSync } from './importedParticipantSync.js';
import RecordLoading from './RecordLoading.jsx';
import './EventPaymentDialog.css';
import './ImportedParticipantDialog.css';

const actionLabels = { add: 'Add', update: 'Update', remove: 'Remove', retain: 'Keep linked record' };

export default function ImportedParticipantSyncDialog({ client, event, session, scopeId, onClose, onBusyChange }) {
  const title = useId();
  const expectedUserId = session?.user?.id;
  const [state, setState] = useState({ loading: true });
  const [revision, setRevision] = useState(0);
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, event, session, scopeId, onClose, onBusyChange });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      setState({ error: 'RankedIn did not return the complete roster in time. Try loading it again.' });
    }, 30000);
    reviewRankedinParticipantSync({ client, event, expectedUserId, scopeId, signal: controller.signal }).then(preview => {
      if (!controller.signal.aborted) setState({ preview });
    }).catch(issue => {
      if (!controller.signal.aborted) setState({ error: issue.message || 'Unable to load the RankedIn roster.' });
    }).finally(() => clearTimeout(timeout));
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [client, event, expectedUserId, scopeId, revision]);

  const { preview } = state;
  const changes = preview?.plan.changes || [];
  const counts = Object.fromEntries(Object.keys(actionLabels).map(action => [
    action, changes.filter(row => row.action === action).length,
  ]));
  const canConfirm = counts.add + counts.update + counts.remove > 0;
  const reload = () => { setState({ loading: true }); setRevision(value => value + 1); };

  function confirm(submitEvent) {
    submitEvent.preventDefault();
    if (canConfirm) run(checks => saveRankedinParticipantSync({ client, event, preview, expectedUserId, scopeId, ...checks }));
  }

  return <dialog ref={bindDialog} className="ap-payment-dialog ap-imported-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Review RankedIn sync</h2></div>
      <button type="button" disabled={busy} onClick={close} aria-label="Close RankedIn sync">×</button></header>
    <form onSubmit={confirm}>
      {state.loading && <RecordLoading label="Reading every RankedIn division…" />}
      {state.error && <p role="alert">{state.error}</p>}
      {result ? <p role="status">Roster updated. {result.inserted} added, {result.updated} updated and {result.removed} removed.</p> : preview && <>
        <p><strong>{preview.entries.length}</strong> entries in the complete RankedIn snapshot.</p>
        <p>{counts.add} to add, {counts.update} to update, {counts.remove} to remove and {counts.retain} linked records to keep.</p>
        {changes.length > 0 && <details><summary>View roster changes</summary>
          <ul className="ap-imported-results">{changes.map(({ action, name, division, source_id }, index) => (
            <li key={JSON.stringify([action, source_id, name, division, index])}>
              <strong>{actionLabels[action]}</strong> · {name} · {division || 'No division'}
            </li>
          ))}</ul>
        </details>}
        {!canConfirm && <p role="status">There are no roster changes to save.</p>}
        {counts.retain > 0 && <p>Entries linked to local profiles, group records, registrations or payments stay available in 4M.</p>}
      </>}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result ? 'Done' : 'Close'}</button>
        {state.error && <button type="button" className="ap-secondary" onClick={reload}>Reload roster</button>}
        {preview && canConfirm && !result && <button className="ap-primary" disabled={busy || Boolean(error)}>{busy ? 'Saving roster…' : 'Confirm roster changes'}</button>}
      </footer>
    </form>
  </dialog>;
}
