import React, { useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { buildRankedinTournamentUrl, downloadRankedinSkipReport, formatRankedinSkipReason } from '../../utils/rankedinLink';
import { eventRankedinId, rankedinSyncSummary, runRankedinSync } from './rankedinSync';
import './EventPaymentDialog.css';
import './EventRankedinDialog.css';

const saveSync = ({ event }) => runRankedinSync({ client: supabase, event });

export default function EventRankedinDialog({ event, onClose, save = saveSync }) {
  const dialog = useRef(null), lock = useRef(false), attempted = useRef(false), title = useId();
  const [busy, setBusy] = useState(false), [result, setResult] = useState(null), [error, setError] = useState('');
  const rankedinId = eventRankedinId(event), summary = result ? rankedinSyncSummary(result) : null;
  const close = () => { if (!lock.current) onClose({ refresh: attempted.current }); };
  useEffect(() => {
    const node = dialog.current, trigger = document.activeElement, overflow = document.body.style.overflow;
    node.showModal(); document.body.style.overflow = 'hidden';
    return () => { node.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); };
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (lock.current || attempted.current || !rankedinId || !event.is_manual) return;
    lock.current = true; attempted.current = true; setBusy(true);
    try { setResult(await save({ event })); }
    catch (err) { setError(`${err.message || 'Sync failed.'} Changes may already have reached RankedIn. Close, refresh and review both systems before retrying.`); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="ap-payment-dialog ap-rankedin-dialog" aria-labelledby={title} onCancel={e => { e.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Sync to RankedIn</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Close RankedIn sync">×</button></header>
    <form onSubmit={submit}>
      <div className="ap-payment-person"><strong>{rankedinId ? `RankedIn tournament #${rankedinId}` : 'Tournament not linked'}</strong>{rankedinId && <a href={buildRankedinTournamentUrl(rankedinId)} target="_blank" rel="noreferrer">Open tournament ↗</a>}</div>
      {summary ? <>
        <p role="status"><strong>{summary.needsReview ? 'Sync returned items to review' : 'Sync response received'}</strong></p>
        <dl className="ap-rankedin-summary"><div><dt>Divisions mapped</dt><dd>{summary.mapped}</dd></div><div><dt>Paid teams pushed</dt><dd>{summary.pushed}</dd></div><div><dt>Entries skipped</dt><dd>{summary.skipped.length}</dd></div></dl>
        <p>Details updated: {summary.updated.length ? summary.updated.join(', ') : 'No fields reported as updated'}.</p>
        {summary.missing.length > 0 && <p>Create these divisions on RankedIn: {summary.missing.map(row => row.divisionName).join(', ')}.</p>}
        {summary.errors.length > 0 && <ul role="alert">{summary.errors.map((message, i) => <li key={i}>{String(message)}</li>)}</ul>}
        {summary.messages.map(message => <p key={message}>{message}</p>)}
        {summary.skipped.length > 0 && <section aria-label="Skipped entries"><h3>Skipped entries</h3><ul>{Object.entries(summary.skipped.reduce((counts, row) => { const reason = formatRankedinSkipReason(row.reason); counts[reason] = (counts[reason] || 0) + 1; return counts; }, {})).map(([reason, count]) => <li key={reason}>{count} · {reason}</li>)}</ul><button type="button" className="ap-secondary" onClick={() => downloadRankedinSkipReport(summary.skipped, { eventName: event.event_name, rankedinId: result.rankedinId || rankedinId })}>Download existing skip report (CSV)</button></section>}
        {summary.nextSteps.length > 0 && <section><h3>Next steps</h3><ul>{summary.nextSteps.map((step, i) => <li key={i}>{step}</li>)}</ul></section>}
      </> : <>
        <p>Uses the existing 4M sync: maps divisions, updates tournament details and pushes eligible paid doubles teams. Player eligibility and duplicate checks remain on the existing service.</p>
        <p className="ap-payment-live-note">This is a live sync, not a dry run. Confirming can update the linked tournament on RankedIn and the event’s division mappings in 4M.</p>
        {(!rankedinId || !event.is_manual) && <p role="alert">Select a linked, 4M-hosted event before syncing.</p>}
        {busy && <p role="status">Syncing divisions, details and paid teams… Keep this dialog open until a result is returned.</p>}
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result ? 'Done' : 'Cancel'}</button>{!result && <button className="ap-primary" disabled={busy || Boolean(error) || !rankedinId || !event.is_manual}>{busy ? 'Syncing…' : 'Confirm live sync'}</button>}</footer>
    </form>
  </dialog>;
}
