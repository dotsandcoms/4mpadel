import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useId, useRef, useState } from 'react';
import { eligibleEventPartners } from '../../utils/pairEventEntries';
import { saveEventPair } from './saveEventPair';
import EventPlayerSearch from './EventPlayerSearch';
import './EventPaymentDialog.css';
import './EventPairDialog.css';

export default function EventPairDialog({ event, solo, registrations, onClose, save = saveEventPair, search, directoryOnly = false }) {
  const dialog = useRef(null), lock = useRef(false), attempted = useRef(false), title = useId();
  const [partnerId, setPartnerId] = useState(''), [busy, setBusy] = useState(false), [result, setResult] = useState(null), [error, setError] = useState('');
  const [mode, setMode] = useState(directoryOnly ? 'directory' : 'entered'), [profile, setProfile] = useState(null);
  const candidates = eligibleEventPartners(solo, registrations);
  const partner = candidates.find(row => String(row.id) === partnerId);
  const profileTaken = profile && registrations.some(row => row.division === solo.division && row.status !== 'withdrawn'
    && [row.email, row.partner_email].some(value => String(value || '').trim().toLowerCase() === profile.email.trim().toLowerCase()));
  const valid = mode === 'entered' ? Boolean(partner) : Boolean(profile && !profileTaken);
  const close = () => { if (!lock.current) onClose({ refresh: attempted.current }); };
  useEffect(() => {
    const node = dialog.current, trigger = document.activeElement, overflow = document.body.style.overflow;
    node.showModal(); document.body.style.overflow = 'hidden';
    return () => { node.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); };
  }, []);
  async function submit(e) {
    e.preventDefault(); if (!valid || lock.current || attempted.current) return;
    lock.current = true; attempted.current = true; setBusy(true);
    try { setResult(await save({ event, solo, ...(mode === 'entered' ? { partnerId } : { profileId: profile.id }) }) || { warnings: [] }); }
    catch (err) { setError(`${err.message || 'Pairing failed.'} Some links may have been saved. Close and review the refreshed event before retrying.`); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="ap-payment-dialog ap-pair-dialog" aria-labelledby={title} onCancel={e => { e.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Pair solo entries</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Close pairing dialog">×</button></header>
    <form onSubmit={submit}>
      <div className="ap-payment-person"><strong>{solo.full_name || solo.email}</strong><span>{solo.division}</span></div>
      {result ? <><p role="status">{mode === 'entered' ? 'Players paired.' : 'Partner added with payment pending.'} Close to refresh the event.</p>{result.warnings?.map(warning => <p key={warning} role="status">{warning}</p>)}</> : <>
        {!directoryOnly && <label>Partner source<SearchableDropdown disabled={busy || Boolean(error)} value={mode} onChange={e => { setMode(e.target.value); setPartnerId(''); setProfile(null); }}><option value="entered">Existing solo entry</option><option value="directory">Invite from player directory</option></SearchableDropdown></label>}
        {mode === 'entered' ? <>
        <label>Partner in this division<SearchableDropdown required disabled={busy || Boolean(error)} value={partnerId} onChange={e => setPartnerId(e.target.value)}><option value="">Select a solo entry</option>{candidates.map(row => <option key={row.id} value={row.id}>{row.full_name || row.email} · {row.email} · {row.payment_status === 'paid' ? 'Paid' : 'Pending payment'}</option>)}</SearchableDropdown></label>
        {!candidates.length && <p>No other available solo entries in this division.</p>}
        {partner && <div className="ap-payment-person"><strong>{solo.full_name || solo.email} / {partner.full_name || partner.email}</strong><span>Both registrations keep their current payment status.</span></div>}
        </> : <fieldset disabled={busy || Boolean(error)} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}><EventPlayerSearch selected={profile} onSelect={setProfile} search={search}/>{profileTaken && <p role="alert">This player is already entered or paired in this division. Choose another player.</p>}</fieldset>}
        <p className="ap-payment-live-note">{mode === 'entered' ? 'Confirming links both live registrations and sends partner-assigned emails to both players.' : 'Confirming creates a pending registration in this division, links both players, and emails the new partner an invitation to pay the division entry fee.'} No payment is collected and neither player is marked paid.</p>
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result ? 'Done' : 'Cancel'}</button>{!result && <button className="ap-primary" disabled={!valid || busy || Boolean(error)}>{busy ? 'Saving…' : mode === 'entered' ? 'Confirm pairing' : 'Confirm invitation'}</button>}</footer>
    </form>
  </dialog>;
}
