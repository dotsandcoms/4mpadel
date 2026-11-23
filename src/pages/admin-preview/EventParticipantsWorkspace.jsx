import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, RefreshCw, Search } from 'lucide-react';
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
import { importedParticipantSettlement, loadImportedFinance, prepareImportedParticipantExport } from './importedParticipantFinance.js';
import RecordLoading from './RecordLoading.jsx';
import { filterEventParticipants, linkedParticipant, participantLicence, participantName, participantSnapshot, PARTICIPANT_LICENCES, publicParticipantTournament, readEventParticipants } from './eventParticipants.js';
import './PlayersWorkspace.css';
import './EventParticipantsWorkspace.css';

const EMPTY_FILTERS = { query: '', division: '', profile: '', licence: '', payment: '', whatsapp: '' };
const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

export default function EventParticipantsWorkspace({ event, go, client = supabase, session, scopeId = 'all', onRefresh, initialView = 'table' }) {
  const [retry, setRetry] = useState(0);
  const userId = session?.user?.id;
  const [identity, setIdentity] = useState({ client, eventId: event.id, userId, scopeId, retry, initialView, generation: 0 });
  if (identity.client !== client || identity.eventId !== event.id || identity.userId !== userId || identity.scopeId !== scopeId
    || identity.retry !== retry || identity.initialView !== initialView) {
    setIdentity({ client, eventId: event.id, userId, scopeId, retry, initialView, generation: identity.generation + 1 });
    return null;
  }
  return <EventParticipantsContent key={identity.generation} {...{ event, go, client, session, scopeId, onRefresh, setRetry, initialView }} />;
}

function EventParticipantsContent({ event, go, client, session, scopeId, onRefresh, setRetry, initialView }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [writeAccess, setWriteAccess] = useState(false);
  const [completion, setCompletion] = useState({ loading: true });
  const [finance, setFinance] = useState({ loading: true });
  const [view, setView] = useState(initialView === 'dashboard' ? 'dashboard' : 'table');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);
  const pendingExport = useRef(null);
  const expectedUserId = session?.user?.id;

  useEffect(() => {
    const controller = new AbortController();
    const access = { client, eventId: event.id, expectedUserId, scopeId, signal: controller.signal };
    async function load() {
      await verifyEventOperationAccess(access);
      const rows = await readEventParticipants(client, event.id, controller.signal);
      if (controller.signal.aborted) return;
      setState({ loading: false, rows, error: '' });
      await Promise.all([
        verifyImportedParticipantWrite(access).then(() => { if (!controller.signal.aborted) setWriteAccess(true); }).catch(() => {}),
        loadManagedEventCompletions(client, [event.id])
          .then(map => { if (!controller.signal.aborted) setCompletion({ loading: false, value: map.get(Number(event.id)) || null }); })
          .catch(error => { if (!controller.signal.aborted) setCompletion({ loading: false, error: error.message }); }),
        loadImportedFinance(access).then(data => { if (!controller.signal.aborted) setFinance({ data }); })
          .catch(error => { if (!controller.signal.aborted) setFinance({ error: error.message }); }),
      ]);
    }
    load().catch(error => { if (!controller.signal.aborted) setState({ loading: false, rows: [], error: error.message }); });
    return () => { controller.abort(); pendingExport.current?.abort(); };
  }, [client, event.id, expectedUserId, scopeId]);

  const snapshot = useMemo(() => participantSnapshot(event, state.rows), [event, state.rows]);
  const settlement = useMemo(() => finance.data ? importedParticipantSettlement(event, state.rows, finance.data) : null, [event, state.rows, finance.data]);
  const canSync = writeAccess && Boolean(importedRankedinId(event)) && event.event_status !== 'cancelled';
  const rankedin = publicParticipantTournament(event);
  const divisions = [...new Set(state.rows.map(row => row.class_name).filter(Boolean))].sort();
  const rows = filterEventParticipants(state.rows, event.id, filters);
  const locked = busy || exporting;
  const reload = () => setRetry(value => value + 1);
  const changeFilter = (key, value) => setFilters(previous => ({ ...previous, [key]: value }));
  const closeAction = result => {
    setAction(null);
    if (result?.refresh) { reload(); onRefresh?.(); }
  };
  const ActionDialog = action?.type === 'sync' ? ImportedParticipantSyncDialog
    : action?.type === 'payment' ? ImportedParticipantPaymentDialog : ImportedParticipantDialog;

  async function exportWorkbook() {
    if (!finance.data || !rows.length || pendingExport.current) return;
    const request = new AbortController();
    pendingExport.current = request;
    const isCurrent = () => !request.signal.aborted && pendingExport.current === request;
    setExporting(true);
    setExportMessage(null);
    try {
      const report = await prepareImportedParticipantExport({ client, eventId: event.id, expectedUserId, scopeId, signal: request.signal, filters });
      const { downloadImportedParticipantWorkbook } = await import('./importedParticipantWorkbook.js');
      await downloadImportedParticipantWorkbook(event, report, isCurrent);
      if (isCurrent()) setExportMessage({ message: 'Filtered participant workbook downloaded.' });
    } catch (error) {
      if (isCurrent()) setExportMessage({ error: error.message || 'The Excel report could not be prepared.' });
    } finally {
      if (isCurrent()) { pendingExport.current = null; setExporting(false); }
    }
  }

  return <>
    <button disabled={locked} className="ap-back-button" onClick={() => go('events')}><ArrowLeft size={16} /> Events</button>
    <header className="ap-page-heading">
      <div><p className="ap-kicker">RankedIn event · Imported participants</p><h1>{event.event_name}</h1><p>{event.venue}</p></div>
      <div className="ap-imported-actions">
        {event.finance_managed === true && !completion.loading && !completion.error && <EventCompletionControl
          client={client} event={{ ...event, management_completed_at: completion.value }} session={session} scopeId={scopeId}
          disabled={locked} onBusyChange={setBusy} onSaved={receipt => setCompletion({ loading: false, value: receipt.completed_at })} onClose={closeAction} />}
        <button className="ap-secondary" disabled={state.loading || locked} onClick={reload}><RefreshCw size={16} /> Reload records</button>
        {rankedin && <a className="ap-secondary" href={rankedin} target="_blank" rel="noopener noreferrer">View on RankedIn <ExternalLink size={16} /></a>}
        {canSync && <button className="ap-secondary" disabled={locked} onClick={() => setAction({ type: 'sync' })}>Review RankedIn sync</button>}
      </div>
    </header>
    {state.loading ? <section className="ap-section"><RecordLoading label="Loading event participants…" /></section>
      : state.error ? <section className="ap-section ap-live-loading" role="alert">
        <h2>Participants could not be loaded</h2><p>{state.error}</p>
        <button className="ap-secondary" onClick={reload}>Try again</button>
      </section> : <>
        <div className="ap-record-tabs" role="group" aria-label="Participant views">
          <button type="button" disabled={locked} aria-pressed={view === 'dashboard'} onClick={() => setView('dashboard')}>Dashboard cards</button>
          <button type="button" disabled={locked} aria-pressed={view === 'table'} onClick={() => setView('table')}>Participant table</button>
        </div>
        <section className="ap-section"><div className="ap-health-grid">
          <div><strong>{snapshot.entries}</strong><span>Imported entries</span></div>
          <div><strong>{snapshot.paid}</strong><span>Recorded paid</span></div>
          <div><strong>{divisions.length}</strong><span>Divisions</span></div>
        </div></section>
        {view === 'dashboard' ? <ParticipantDashboard snapshot={snapshot} finance={finance} settlement={settlement} /> : <>
          <div className="ap-imported-filter-tools">
            <label className="ap-filter-search"><Search size={17} aria-hidden="true" /><span className="ap-visually-hidden">Search participants</span>
              <input disabled={locked} value={filters.query} onChange={event => changeFilter('query', event.target.value)} placeholder="Search participant, email or division" />
            </label>
            <ParticipantFilter label="Participant profile" name="profile" filters={filters} disabled={locked} change={changeFilter}
              options={{ '': 'All profiles', linked: 'Linked profiles', unlinked: 'Unlinked profiles' }} />
            <ParticipantFilter label="Participant division" name="division" filters={filters} disabled={locked} change={changeFilter}
              options={{ '': 'All divisions', ...Object.fromEntries(divisions.map(division => [division, division])) }} />
            <ParticipantFilter label="Participant licence" name="licence" filters={filters} disabled={locked} change={changeFilter}
              options={{ '': 'All licences', ...PARTICIPANT_LICENCES }} />
            <ParticipantFilter label="Participant payment" name="payment" filters={filters} disabled={locked} change={changeFilter}
              options={{ '': 'All payment states', paid: 'Paid', unpaid: 'Unpaid' }} />
            <ParticipantFilter label="Participant WhatsApp" name="whatsapp" filters={filters} disabled={locked} change={changeFilter}
              options={{ '': 'All WhatsApp states', added: 'Added to WhatsApp', pending: 'WhatsApp pending' }} />
          </div>
          <div className="ap-imported-actions ap-imported-toolbar">
            {finance.data && <button type="button" className="ap-secondary" disabled={locked || !rows.length} onClick={exportWorkbook}><Download size={16} /> {exporting ? 'Verifying receipts…' : 'Export Excel'}</button>}
            {Object.values(filters).some(Boolean) && <button type="button" className="ap-secondary" disabled={locked} onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>}
            {exportMessage?.message && <p role="status">{exportMessage.message}</p>}
            {exportMessage?.error && <p role="alert">{exportMessage.error}</p>}
          </div>
          <section className="ap-section pp-table-wrap">
            <table className="pp-table">
              <thead><tr><th scope="col">Participant</th><th scope="col">Profile</th><th scope="col">Division</th><th scope="col">Recorded payment</th>
                <th scope="col">Licence</th><th scope="col">WhatsApp group</th>{writeAccess && <th scope="col">Actions</th>}</tr></thead>
              <tbody>{rows.map(row => <tr key={row.id}>
                <td><b>{participantName(row)}</b><small>{row.email || row.players?.email || 'Email not recorded'}</small></td>
                <td>{linkedParticipant(row) ? row.players?.name || 'Linked' : 'Unlinked'}</td>
                <td>{row.class_name || 'Division not recorded'}</td>
                <td><span className={`ap-status ap-status--${row.is_paid ? 'positive' : 'neutral'}`}>{row.is_paid ? 'Recorded paid' : 'Not marked paid'}</span></td>
                <td>{participantLicence(row, event.id)}</td>
                <td>{row.whatsapp_added ? 'Recorded on group' : 'Not recorded on group'}</td>
                {writeAccess && <td><div className="ap-imported-actions">
                  <button className="ap-secondary" disabled={locked} onClick={() => setAction({ type: 'profile', participant: row })}>{row.profile_id ? 'Change profile' : 'Link profile'}</button>
                  <button className="ap-secondary" disabled={locked} onClick={() => setAction({ type: 'whatsapp', participant: row })}>Update group record</button>
                  <button className="ap-secondary" disabled={locked} onClick={() => setAction({ type: 'payment', participant: row })}>Review payment</button>
                </div></td>}
              </tr>)}</tbody>
            </table>
            {!rows.length && <p className="ap-empty-inline">No participants match these filters.</p>}
          </section>
          <p className="ap-table-foot">Showing {rows.length} of {state.rows.length} imported entries.</p>
        </>}
      </>}
    {action && <ActionDialog key={`${action.type}:${action.participant?.id || ''}`} client={client} event={event} session={session}
      scopeId={scopeId} action={action.type} participant={action.participant} onBusyChange={setBusy} onClose={closeAction} />}
  </>;
}

function ParticipantFilter({ label, name, filters, disabled, change, options }) {
  return <SearchableDropdown aria-label={label} disabled={disabled} value={filters[name]} onChange={event => change(name, event.target.value)}>
    {Object.entries(options).map(([value, text]) => <option value={value} key={value}>{text}</option>)}
  </SearchableDropdown>;
}

function ParticipantDashboard({ snapshot, finance, settlement }) {
  const breakdown = [
    ['Entry fees received by 4M', settlement?.collected4M], ['Entry fees received directly', settlement?.organiserRetained],
    ['Entry refunds', settlement?.entryFeesRefunded], ['Net entry income', settlement?.entryFeeBalance],
    ['Platform fees', settlement?.commission], ['Interim payments', settlement?.interimPaid],
    ['Unconfirmed payment recipient', settlement?.unconfirmedCollected], ['Balance due to organiser', settlement?.dueToOrg],
  ];
  return <div className="ap-imported-dashboard">
    <section className="ap-section ap-settlement"><div className="ap-section-heading"><h2>Player licences</h2></div><div className="ap-health-grid">
      <div><strong>{snapshot.full}</strong><span>Full licences</span></div>
      <div><strong>{snapshot.temp}</strong><span>Temporary licences</span></div>
      <div><strong>{snapshot.none}</strong><span>No licence</span></div>
    </div></section>
    {finance.loading && <section className="ap-section"><RecordLoading label="Checking event finance access…" /></section>}
    {finance.error && <section className="ap-section ap-live-loading" role="alert"><h2>Finance summary unavailable</h2><p>{finance.error}</p></section>}
    {settlement && <section className="ap-section ap-settlement">
      <div className="ap-section-heading"><h2>Financial summary</h2></div>
      <dl className="ap-finance-breakdown">{breakdown.map(([label, value]) => <div key={label} className={label === 'Balance due to organiser' ? 'is-total' : undefined}><dt>{label}</dt><dd>{money.format(value)}</dd></div>)}</dl>
      {settlement.issues.length > 0 && <ul role="status">{settlement.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    </section>}
  </div>;
}
