import { useEffect, useId, useState } from 'react';
import { useEventOperation } from './useEventOperation.js';
import { saveImportedParticipant, searchImportedProfiles } from './importedParticipantActions.js';
import './EventPaymentDialog.css';
import './ImportedParticipantDialog.css';

export default function ImportedParticipantDialog({ client, event, participant, action, session, scopeId = 'all', onClose, onBusyChange }) {
  const title = useId();
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, event, session, scopeId, onClose, onBusyChange });
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState({ rows: [] });
  const [profile, setProfile] = useState(null);
  const linking = action === 'profile';
  const expectedUserId = session?.user?.id;

  useEffect(() => {
    if (!linking || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchImportedProfiles({ client, eventId: event.id, expectedUserId, scopeId, query, signal: controller.signal })
        .then(rows => { if (!controller.signal.aborted) setSearch({ rows }); })
        .catch(issue => { if (!controller.signal.aborted) setSearch({ rows: [], error: issue.message }); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, event.id, expectedUserId, scopeId, query, linking]);

  function submit(submitEvent) {
    submitEvent.preventDefault();
    run(checks => saveImportedParticipant({ client, eventId: event.id, expectedUserId, scopeId, participant, action, profile, ...checks }));
  }

  function updateQuery(event) {
    const value = event.target.value;
    setQuery(value);
    setProfile(null);
    setSearch({ rows: [], loading: value.trim().length >= 2 });
  }

  return <dialog ref={bindDialog} className="ap-payment-dialog ap-imported-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>{linking ? 'Link player profile' : 'Update WhatsApp group record'}</h2></div>
      <button type="button" disabled={busy} onClick={close} aria-label="Close imported action">×</button></header>
    <form onSubmit={submit}>
      <div className="ap-payment-person"><strong>{participant.full_name}</strong><span>{participant.class_name}</span></div>
      {result ? <p role="status">Record updated.</p> : linking ? <>
        <label>Search 4M player profiles<input type="search" value={query} disabled={busy || Boolean(error)} onChange={updateQuery} placeholder="Name or email…" /></label>
        <div className="ap-imported-results" aria-label="Matching profiles">
          {search.loading ? <p role="status">Searching profiles…</p> : query.trim().length < 2 ? <p>Type at least 2 characters.</p>
            : search.error ? <p role="alert">{search.error}</p> : !search.rows.length ? <p>No matching profiles.</p>
              : search.rows.map(row => <label key={row.id}>
                <input type="radio" name="imported-profile" checked={profile?.id === row.id} disabled={busy || Boolean(error)} onChange={() => setProfile(row)} />
                <span><strong>{row.name || 'Name not recorded'}</strong><small>{row.email || 'Email not recorded'}</small></span>
              </label>)}
        </div>
        {profile && <p>Link to <strong>{profile.name || profile.email}</strong>?</p>}
      </> : <p>{participant.whatsapp_added ? 'Mark this participant as off the WhatsApp group?' : 'Mark this participant as already added to the WhatsApp group?'} This updates the internal checklist.</p>}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button className="ap-secondary" type="button" disabled={busy} onClick={close}>{result ? 'Done' : 'Cancel'}</button>
        {!result && <button className="ap-primary" disabled={busy || Boolean(error) || (linking && !profile)}>
          {busy ? 'Saving…' : linking ? 'Confirm profile link' : 'Confirm group record'}
        </button>}
      </footer>
    </form>
  </dialog>;
}
