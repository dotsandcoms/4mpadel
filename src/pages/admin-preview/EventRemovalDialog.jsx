import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useId, useRef, useState } from 'react';
import { saveEventRemoval } from './saveEventRemoval';
import './EventPaymentDialog.css';

export default function EventRemovalDialog({ event, team, onClose, save = saveEventRemoval }) {
  const dialog = useRef(null), lock = useRef(false), attempted = useRef(false), title = useId();
  const [mode, setMode] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('');
  const close = () => { if (!lock.current) onClose({ refresh: attempted.current }); };
  const [warnings, setWarnings] = useState([]);
  useEffect(() => { const node = dialog.current, trigger = document.activeElement, overflow = document.body.style.overflow; node.showModal(); document.body.style.overflow = 'hidden'; return () => { node.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); }; }, []);
  async function submit(e) {
    e.preventDefault(); if (!mode || lock.current || attempted.current) return;
    lock.current = true; attempted.current = true; setBusy(true);
    try { const result = await save({ event, team, mode }); setWarnings(result?.warnings || []); setDone(true); }
    catch (err) { setError(`${err.message || 'Removal failed.'} Some entries or refunds may already have changed. Close and review the refreshed event before trying again.`); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="ap-payment-dialog" aria-labelledby={title} onCancel={e => { e.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Remove {team.length > 1 ? 'whole team' : 'player'}</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Close removal dialog">×</button></header>
    <form onSubmit={submit}>
      <div className="ap-payment-person"><strong>{team.map(row => row.full_name || row.email).join(' / ')}</strong><span>{team[0].division} · {team.length} {team.length === 1 ? 'entry' : 'entries'} will be withdrawn</span></div>
      {done ? <div role="status"><p>{warnings.length ? 'Removal processed with refund warnings.' : 'Removal request completed.'} Close to reload the registration and refund status. A submitted gateway refund may still be processing.</p>{warnings.map(warning => <p key={warning} role="alert">{warning}</p>)}</div> : <>
        <label>Refund handling<SearchableDropdown required value={mode} disabled={busy || Boolean(error)} onChange={e => setMode(e.target.value)}><option value="">Choose an option</option><option value="no_refund">Remove without refund</option><option value="refund">Remove and request refund</option><option value="cash_refund">Record offline refund and remove</option></SearchableDropdown></label>
        <p className="ap-payment-live-note">{mode === 'cash_refund' ? 'Only choose this if the refund was handled outside Paystack. This records it as refunded; it does not send money through Paystack.' : mode === 'refund' ? 'The existing refund service determines refundable amounts and processes eligible refunds. This can send money back to the payer.' : 'Removing entries withdraws them from the event. No refund will be requested with the no-refund option.'} This applies to every player listed above.</p>
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{done ? 'Done' : 'Cancel'}</button>{!done && <button className="ap-danger-button" disabled={!mode || busy || Boolean(error)}>{busy ? 'Removing…' : 'Confirm removal'}</button>}</footer>
    </form>
  </dialog>;
}
