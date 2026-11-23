import { useId, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import EventPlayerSearch from './EventPlayerSearch';
import { useEventOperation } from './useEventOperation.js';
import { saveEventReplacement } from './saveEventReplacement.js';
import './EventPaymentDialog.css';

export default function EventReplacementDialog({ client, event, team, initialRegistrationId, session, scopeId, onClose, search, verifyAccess }) {
  const title = useId();
  const [registrationId, setRegistrationId] = useState(String(initialRegistrationId || team[0].id));
  const [replacement, setReplacement] = useState(null);
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, event, session, scopeId, onClose });
  const registration = team.find(row => String(row.id) === registrationId);
  const duplicate = replacement && team.some(row => row.email?.trim().toLowerCase() === replacement.email?.trim().toLowerCase());

  function submit(formEvent) {
    formEvent.preventDefault();
    if (!registration || !replacement || duplicate) return;
    run(checks => saveEventReplacement({
      client, event, registration, replacement, expectedUserId: session?.user?.id, scopeId, verifyAccess, ...checks,
    }));
  }

  return <dialog ref={bindDialog} className="ap-payment-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Replace player</h2></div><button type="button" className="ap-icon-button" disabled={busy} onClick={close} aria-label="Close replacement dialog">×</button></header>
    <form onSubmit={submit}>
      {result ? <p role="status">{result.new_name || replacement.name} has taken over this entry.</p> : <>
        <p>The replacement keeps the existing place, division and payment status. No payment or refund is made here.</p>
        <label>Player leaving<SearchableDropdown value={registrationId} disabled={busy || Boolean(error)} onChange={event => setRegistrationId(event.target.value)}>
          {team.map(row => <option key={row.id} value={row.id}>{row.full_name || row.email}</option>)}
        </SearchableDropdown></label>
        <div aria-label="Find the replacement player"><EventPlayerSearch selected={replacement} onSelect={setReplacement} search={search} disabled={busy || Boolean(error)} /></div>
        {duplicate && <p role="alert">Choose a player outside the current team.</p>}
        <p className="ap-payment-live-note">The replacement must meet the division’s licence requirements. An existing draw must be cleared or archived first.</p>
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result ? 'Done' : 'Cancel'}</button>
        {!result && <button type="submit" className="ap-primary" disabled={!replacement || duplicate || busy || Boolean(error)}>{busy ? 'Replacing…' : 'Confirm replacement'}</button>}
      </footer>
    </form>
  </dialog>;
}
