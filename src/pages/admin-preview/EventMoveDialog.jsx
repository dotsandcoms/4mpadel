import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useId, useRef, useState } from 'react';
import { saveEventMove } from './saveEventMove';
import './EventPaymentDialog.css';

export default function EventMoveDialog({ event, team, divisions, onClose, save = saveEventMove }) {
  const dialog = useRef(null), lock = useRef(false), attempted = useRef(false), title = useId();
  const [targetId, setTargetId] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('');
  const target = divisions.find(row => String(row.id) === targetId);
  const close = () => { if (!lock.current) onClose({ refresh: attempted.current }); };
  useEffect(() => { const node = dialog.current, trigger = document.activeElement, overflow = document.body.style.overflow; node.showModal(); document.body.style.overflow = 'hidden'; return () => { node.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); }; }, []);
  async function submit(e) {
    e.preventDefault(); if (!target || lock.current || attempted.current) return;
    lock.current = true; attempted.current = true; setBusy(true);
    try { await save({ event, team, targetId }); setDone(true); }
    catch (err) { setError(`${err.message || 'Move failed.'} Some changes may have been saved. Close and review the refreshed event before retrying.`); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="ap-payment-dialog" aria-labelledby={title} onCancel={e => { e.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Move {team.length > 1 ? 'whole team' : 'player'}</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Close move dialog">×</button></header>
    <form onSubmit={submit}>
      <div className="ap-payment-person"><strong>{team.map(row => row.full_name || row.email).join(' / ')}</strong><span>From {team[0].division}</span></div>
      {done ? <p role="status">Entries moved. Close to refresh the event.</p> : <>
        <label>New division<SearchableDropdown required disabled={busy || Boolean(error)} value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">Select a division</option>{divisions.filter(row => row.is_active !== false && row.name !== team[0].division).map(row => <option key={row.id} value={row.id}>{row.name} · R {Number(row.entry_fee || 0)}</option>)}</SearchableDropdown></label>
        {target && <p>New entry fee: R {Number(target.entry_fee || 0)} per player. Moving to a higher fee returns paid entries to pending; a lower-fee difference is handled by the organiser. No automatic refund is issued.</p>}
        <p className="ap-payment-live-note">Confirming changes live registrations and sends division-change emails. {team.length > 1 ? 'Both players stay paired.' : 'The existing pairing is cleared.'} Duplicate entries are checked before moving.</p>
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{done ? 'Done' : 'Cancel'}</button>{!done && <button className="ap-primary" disabled={!target || busy || Boolean(error)}>{busy ? 'Moving…' : 'Confirm move'}</button>}</footer>
    </form>
  </dialog>;
}
