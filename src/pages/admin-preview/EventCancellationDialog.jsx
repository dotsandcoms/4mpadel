import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { cancelEventScope } from './eventCancellation';
import './EventPaymentDialog.css';
import './EventCancellationDialog.css';

export default function EventCancellationDialog({ event, divisions, scope, onClose, save = cancelEventScope, client = supabase }) {
  const node = useRef(null), lock = useRef(false), attempted = useRef(false), title = useId();
  const [divisionId, setDivisionId] = useState(''), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [result, setResult] = useState(null), [error, setError] = useState('');
  const wholeEvent = scope === 'event';
  const close = () => { if (!lock.current) onClose({ refresh: attempted.current }); };
  useEffect(() => { const dialog = node.current, trigger = document.activeElement, overflow = document.body.style.overflow; dialog.showModal(); document.body.style.overflow = 'hidden'; return () => { dialog.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); }; }, []);
  async function submit(e) {
    e.preventDefault(); if (lock.current || attempted.current || !confirmed || (!wholeEvent && !divisionId)) return;
    attempted.current = true; lock.current = true; setBusy(true);
    try { setResult(await save({ client, event, divisionId: wholeEvent ? undefined : divisionId, reason })); }
    catch (err) { setError(`${err.message} Changes or refunds may already have occurred. Close and review the refreshed records before trying again.`); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={node} className="ap-payment-dialog" aria-labelledby={title} onCancel={e => { e.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Cancel {wholeEvent ? 'event' : 'division'}</h2></div><button type="button" className="ap-icon-button" disabled={busy} onClick={close} aria-label="Close cancellation dialog">×</button></header>
    <form onSubmit={submit}>
      {result ? <div role="status"><h3>{wholeEvent ? 'Event cancelled' : 'Division cancelled'}</h3><p>{result.registrations_processed} entries processed. Refund status: {String(result.refund_status).replaceAll('_', ' ')}.</p><p>{result.refund_status === 'needs_attention' ? 'Some refunds need administrator attention. Review the refund ledger.' : 'Gateway refunds may take time to reach the payer. Review the refund ledger for individual results.'}</p></div> : <>
        {!wholeEvent && <label>Division<SearchableDropdown required disabled={busy || Boolean(error)} value={divisionId} onChange={e => { setDivisionId(e.target.value); setConfirmed(false); }}><option value="">Select a division</option>{divisions.filter(division => !division.cancelled_at).map(division => <option key={division.id} value={division.id}>{division.name}{division.is_active === false ? ' · closed' : ''}</option>)}</SearchableDropdown></label>}
        <p className="ap-payment-live-note">{wholeEvent ? 'This withdraws every active entry, requests eligible refunds, removes the event from player schedules and marks the event cancelled publicly. Registered players receive the existing cancellation notification.' : 'This closes the selected division, withdraws its active players and initiates eligible Paystack refunds using the existing division cancellation service. Registered players receive the division cancellation notification. Other divisions remain unchanged.'}</p>
        {!wholeEvent && <p className="ap-payment-live-note">The existing division cancellation service records cancellation and refund status. Cash and EFT payments require manual refund handling. Do not repeat cancellation to retry a refund.</p>}
        <label>Reason for cancellation (optional)<textarea value={reason} disabled={busy || Boolean(error)} onChange={e => setReason(e.target.value)} placeholder="Explain the cancellation to registered players" rows={3}/></label>
        <label className="ap-cancellation-confirm"><input type="checkbox" checked={confirmed} disabled={busy || Boolean(error)} onChange={e => setConfirmed(e.target.checked)}/><span>I understand this changes live entries and can refund money to payers.</span></label>
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result || error ? 'Close' : 'Keep unchanged'}</button>{!result && <button className="ap-danger-button" disabled={busy || Boolean(error) || !confirmed || (!wholeEvent && !divisionId)}>{busy ? 'Processing cancellation…' : `Cancel ${wholeEvent ? 'event' : 'division'} and refund players`}</button>}</footer>
    </form>
  </dialog>;
}
