import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { supabase } from '../../supabaseClient';
import ImportedParticipantDialog from './ImportedParticipantDialog.jsx';
import ImportedParticipantPaymentDialog from './ImportedParticipantPaymentDialog.jsx';
import ImportedParticipantSyncDialog from './ImportedParticipantSyncDialog.jsx';
import { importedRankedinId } from './importedParticipantSync.js';
import EventCompletionControl from './EventCompletionControl.jsx';
import { loadManagedEventCompletions } from './eventManagementCompletion.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';
import { verifyImportedParticipantWrite } from './importedParticipantActions.js';
import RecordLoading from './RecordLoading.jsx';
import { readEventParticipants, participantSnapshot, participantLicence } from './eventParticipants.js';
import './PlayersWorkspace.css';

export default function EventParticipantsWorkspace({ event, go, client = supabase, session, scopeId = 'all', onRefresh }) {
  const [retry, setRetry] = useState(0);
  const userId = session?.user?.id;
  const [identity, setIdentity] = useState({ client, eventId: event.id, userId, scopeId, retry, generation: 0 });
  if (identity.client !== client || identity.eventId !== event.id || identity.userId !== userId || identity.scopeId !== scopeId || identity.retry !== retry) {
    setIdentity({ client, eventId: event.id, userId, scopeId, retry, generation: identity.generation + 1 });
    return null;
  }
  return <EventParticipantsContent key={identity.generation} {...{ event, go, client, session, scopeId, onRefresh, setRetry }} />;
}

function EventParticipantsContent({ event, go, client, session, scopeId, onRefresh, setRetry }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [writeAccess, setWriteAccess] = useState(false);
  const [completion, setCompletion] = useState({ loading: true });
  const [query, setQuery] = useState('');
  const [division, setDivision] = useState('');
  const expectedUserId = session?.user?.id;

  useEffect(() => {
    const controller = new AbortController();
    const access = { client, eventId: event.id, expectedUserId, scopeId, signal: controller.signal };
    async function load() {
      await verifyEventOperationAccess(access);
      const rows = await readEventParticipants(client, event.id, controller.signal);
      if (controller.signal.aborted) return;
      setState({ loading: false, rows, error: '' });
      try {
        await verifyImportedParticipantWrite(access);
        if (!controller.signal.aborted) setWriteAccess(true);
      } catch {
        // Delegated Event Manager access permits the scoped participant list.
      }
      try {
        const map = await loadManagedEventCompletions(client, [event.id]);
        if (!controller.signal.aborted) setCompletion({ loading: false, value: map.get(Number(event.id)) || null });
      } catch (error) {
        if (!controller.signal.aborted) setCompletion({ loading: false, error: error.message });
      }
    }
    load().catch(error => { if (!controller.signal.aborted) setState({ loading: false, rows: [], error: error.message }); });
    return () => controller.abort();
  }, [client, event.id, expectedUserId, scopeId]);

  const snapshot = participantSnapshot(event, state.rows);
  const canSync = writeAccess && Boolean(importedRankedinId(event)) && event.event_status !== 'cancelled';
  const divisions = [...new Set(state.rows.map(row => row.class_name).filter(Boolean))].sort();
  const rows = state.rows.filter(row => (!division || row.class_name === division)
    && [row.full_name, row.email, row.players?.name, row.players?.email, row.class_name].some(value => String(value || '').toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => String(a.class_name || '').localeCompare(String(b.class_name || '')) || String(a.full_name || '').localeCompare(String(b.full_name || '')));
  const reload = () => setRetry(value => value + 1);
  const closeAction = result => {
    setAction(null);
    if (result?.refresh) {
      reload();
      onRefresh?.();
    }
  };
  const ActionDialog = action?.type === 'sync' ? ImportedParticipantSyncDialog
    : action?.type === 'payment' ? ImportedParticipantPaymentDialog : ImportedParticipantDialog;

  return <>
    <button disabled={busy} className="ap-back-button" onClick={() => go('events')}><ArrowLeft size={16} /> Events</button>
    <header className="ap-page-heading">
      <div><p className="ap-kicker">RankedIn event · Imported participants</p><h1>{event.event_name}</h1><p>{event.venue}</p></div>
      <div className="ap-imported-actions">
        {event.finance_managed === true && !completion.loading && !completion.error && <EventCompletionControl
          client={client} event={{ ...event, management_completed_at: completion.value }} session={session} scopeId={scopeId}
          disabled={busy} onBusyChange={setBusy} onSaved={receipt => setCompletion({ loading: false, value: receipt.completed_at })} onClose={closeAction} />}
        <button className="ap-secondary" disabled={state.loading || busy} onClick={reload}><RefreshCw size={16} /> Reload records</button>
        {canSync && <button className="ap-secondary" disabled={busy} onClick={() => setAction({ type: 'sync' })}>Review RankedIn sync</button>}
      </div>
    </header>
    {state.loading ? <section className="ap-section"><RecordLoading label="Loading event participants…" /></section>
      : state.error ? <section className="ap-section ap-live-loading" role="alert">
        <h2>Participants could not be loaded</h2><p>{state.error}</p>
        <button className="ap-secondary" onClick={reload}>Try again</button>
      </section> : <>
        <section className="ap-section"><div className="ap-health-grid">
          <div><strong>{snapshot.entries}</strong><span>Imported entries</span></div>
          <div><strong>{snapshot.paid}</strong><span>Recorded paid</span></div>
          <div><strong>{divisions.length}</strong><span>Divisions</span></div>
        </div></section>
        <div className="ap-filter-bar">
          <label className="ap-filter-search"><Search size={17} aria-hidden="true" /><span className="ap-visually-hidden">Search participants</span>
            <input disabled={busy} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search participant, email or division" />
          </label>
          <label>Division <SearchableDropdown disabled={busy} value={division} onChange={event => setDivision(event.target.value)}>
            <option value="">All divisions</option>{divisions.map(name => <option key={name}>{name}</option>)}
          </SearchableDropdown></label>
        </div>
        <section className="ap-section pp-table-wrap">
          <table className="pp-table">
            <thead><tr><th scope="col">Participant</th><th scope="col">Division</th><th scope="col">Recorded payment</th>
              <th scope="col">Licence</th><th scope="col">WhatsApp group</th>{writeAccess && <th scope="col">Actions</th>}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.id}>
              <td><b>{row.full_name || row.players?.name || 'Name not recorded'}</b><small>{row.email || row.players?.email || 'Email not recorded'}</small></td>
              <td>{row.class_name || 'Division not recorded'}</td>
              <td><span className={`ap-status ap-status--${row.is_paid ? 'positive' : 'neutral'}`}>{row.is_paid ? 'Recorded paid' : 'Not marked paid'}</span></td>
              <td>{participantLicence(row, event.id)}</td>
              <td>{row.whatsapp_added ? 'Recorded on group' : 'Not recorded on group'}</td>
              {writeAccess && <td><div className="ap-imported-actions">
                <button className="ap-secondary" disabled={busy} onClick={() => setAction({ type: 'profile', participant: row })}>{row.profile_id ? 'Change profile' : 'Link profile'}</button>
                <button className="ap-secondary" disabled={busy} onClick={() => setAction({ type: 'whatsapp', participant: row })}>Update group record</button>
                <button className="ap-secondary" disabled={busy} onClick={() => setAction({ type: 'payment', participant: row })}>Review payment</button>
              </div></td>}
            </tr>)}</tbody>
          </table>
          {!rows.length && <p className="ap-empty-inline">No participants match these filters.</p>}
        </section>
        <p className="ap-table-foot">Showing {rows.length} of {state.rows.length} imported entries.</p>
      </>}
    {action && <ActionDialog key={`${action.type}:${action.participant?.id || ''}`} client={client} event={event} session={session}
      scopeId={scopeId} action={action.type} participant={action.participant} onBusyChange={setBusy} onClose={closeAction} />}
  </>;
}
