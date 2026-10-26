import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { saveEventPayment } from './saveEventPayment';
import './EventPaymentDialog.css';

export default function EventPaymentDialog({ action, event, divisions, onClose, save = saveEventPayment }) {
  const dialog = useRef(null), titleId = useId(), lock = useRef(false);
  const saveAttempted = useRef(false);
  const close = () => { if (!lock.current) onClose({ refresh: saveAttempted.current }); };
  const [method, setMethod] = useState(action.type === 'comp' ? 'comp' : 'manual');
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState(false);
  const reg = action.registration, unmark = action.type === 'unmark';
  const comp = method === 'comp';
  const division = divisions.find(row => row.name === reg.division || String(row.id) === String(reg.division_id));
  const amount = comp ? 0 : division?.entry_fee;
  const name = reg.full_name || reg.name || reg.email;
  useEffect(() => { const node = dialog.current, trigger = document.activeElement; const overflow = document.body.style.overflow; node.showModal(); document.body.style.overflow = 'hidden'; return () => { node.close(); document.body.style.overflow = overflow; trigger?.isConnected && trigger.focus(); }; }, []);
  async function submit(e) {
    e.preventDefault(); if (lock.current || done || (!unmark && !note.trim())) return;
    lock.current = true; saveAttempted.current = true; setBusy(true); setError('');
    try { await save({ event, registration: reg, type: action.type, method, note }); setDone(true); }
    catch (err) { setError(err.message || 'Payment could not be saved.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="ap-payment-dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); close(); }}>
    <header><div><p>{event.event_name || event.name}</p><h2 id={titleId}>{unmark ? 'Remove admin payment' : comp ? 'Complimentary entry' : 'Mark player as paid'}</h2></div><button className="ap-icon-button" disabled={busy} onClick={close} aria-label="Close payment dialog"><X size={20}/></button></header>
    <form onSubmit={submit}>
      <div className="ap-payment-person"><strong>{name}</strong><span>{reg.division || 'Division not recorded'}</span></div>
      {done ? <p role="status">Payment updated successfully. Close to refresh the event.</p> : <>
        {unmark ? <p>This removes the admin-marked payment or comp and returns this player to pending. It does not issue a refund.</p> : <>
          <label>Payment received via<SearchableDropdown disabled={busy} value={method} onChange={e => setMethod(e.target.value)}><option value="manual">Other manual payment</option><option value="eft">EFT</option><option value="cash">Cash</option><option value="external">External payment provider</option><option value="paystack">Paystack (offline correction)</option><option value="comp">Complimentary (free entry)</option></SearchableDropdown></label>
          <div className="ap-payment-amount">{amount == null ? 'Division fee will be verified before saving' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(amount))}{comp && ' · Complimentary entry'}</div>
          <label>{comp ? 'Reason for complimentary entry' : 'Payment note'} (required)<textarea required maxLength={2000} disabled={busy} value={note} onChange={e => setNote(e.target.value)} placeholder={comp ? 'e.g. Sponsor guest approved by organiser' : 'e.g. EFT received, with reference'}/></label>
        </>}
        <p className="ap-payment-live-note">Confirming updates the live registration and payment ledger.</p>
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{done ? 'Done' : 'Cancel'}</button>{!done && <button className="ap-primary" disabled={busy || (!unmark && !note.trim())} type="submit">{busy ? 'Saving…' : unmark ? 'Confirm removal' : comp ? 'Confirm complimentary entry' : 'Confirm payment'}</button>}</footer>
    </form>
  </dialog>;
}
