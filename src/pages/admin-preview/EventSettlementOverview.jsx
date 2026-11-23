import { useEffect, useMemo, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { fetchAllRows } from '../../utils/fetchAllRows';
import { loadFinanceOverviewSummaries } from '../../utils/eventFinanceOverviewData';
import { financeDate } from './financeOverviewData';
import RecordLoading from './RecordLoading';

const PAGE_SIZE = 10;
const rand = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
const defaultEventHref = id => `/admin-preview/event?event=${encodeURIComponent(id)}&tab=statement`;

function financeEventScope(permissions, scopeId) {
  const platform = permissions?.role === 'super_admin';
  if (scopeId?.startsWith('org:')) {
    const organisationId = scopeId.slice(4);
    const owner = permissions?.orgs?.some(org => org.id === organisationId && ['admin','owner'].includes(org.member_role));
    if (organisationId && (platform || owner)) return { organisationId, platform };
  }
  if (scopeId === 'all' && platform) return { platform };
  if (scopeId === 'all' && permissions?.allowed_tabs?.includes('finance')
      && ![permissions.orgs, permissions.clubs, permissions.federations].some(rows => rows?.length)) {
    const finance = permissions.module_permissions?.finance?.allowedEvents;
    const manager = permissions.module_permissions?.['event-mgmt']?.allowedEvents;
    const assigned = finance?.length ? finance : manager;
    const eventIds = Array.isArray(assigned) ? [...new Set(assigned.filter(value => typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))
      .map(Number).filter(value => Number.isSafeInteger(value) && value > 0))] : [];
    if (eventIds.length) return { eventIds };
  }
  return null;
}

async function loadSettlementEvents(client, session, scope, signal) {
  if (!session?.user?.id || !scope) throw new Error('Access to these event finances is required.');
  const auth = await client.auth.getUser();
  signal?.throwIfAborted();
  if (auth.error || auth.data?.user?.id !== session.user.id) throw new Error('Sign in again to view finance reports.');
  if (scope.organisationId && !scope.platform) {
    const result = await client.rpc('is_organisation_admin', { p_organisation_id: scope.organisationId });
    signal?.throwIfAborted();
    if (result.error || result.data !== true) throw new Error('Current organisation owner or admin access is required.');
  }
  return fetchAllRows(() => {
    signal?.throwIfAborted();
    let query = client.from('calendar').select('id,event_name,start_date,organiser_name,organisation_id');
    if (scope.organisationId) query = query.eq('organisation_id', scope.organisationId);
    else if (scope.eventIds?.length) query = query.in('id', scope.eventIds);
    else query = query.eq('finance_managed', true);
    return query.order('start_date', { ascending: false }).order('id');
  });
}

export default function EventSettlementOverview({ client, session, permissions, scopeId, eventHref = defaultEventHref, refreshRevision = 0 }) {
  const scope = financeEventScope(permissions, scopeId);
  const scopeKey = JSON.stringify(scope);
  const [reply, setReply] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [date, setDate] = useState('latest');
  const [retry, setRetry] = useState(0);
  const userId = session?.user?.id;
  const key = JSON.stringify([userId, scopeKey, retry, refreshRevision]);
  const loaded = reply?.key === key ? reply : null;
  useEffect(() => {
    const controller = new AbortController();
    loadSettlementEvents(client, { user: { id: userId } }, JSON.parse(scopeKey), controller.signal)
      .then(events => { if (!controller.signal.aborted) setReply({ key, events }); })
      .catch(error => { if (!controller.signal.aborted) setReply({ key, error: error.message }); });
    return () => controller.abort();
  }, [key, scopeKey, client, userId]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let found = (loaded?.events || []).filter(row => [row.event_name, row.organiser_name, String(row.id)]
      .some(value => String(value || '').toLowerCase().includes(normalized)));
    if (date === 'oldest') found = [...found].reverse();
    return found;
  }, [loaded, query, date]);
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const slice = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const eventKey = JSON.stringify(slice.map(event => Number(event.id)));
  const ledgerKey = JSON.stringify([key, eventKey]);
  const activeLedger = ledger?.key === ledgerKey ? ledger : null;
  useEffect(() => {
    const ids = JSON.parse(eventKey);
    if (!ids.length) return;
    let active = true;
    const summaries = {};
    loadFinanceOverviewSummaries(client, ids, batch => {
      for (const row of batch) summaries[row.id] = row.settlement;
    }).then(() => {
      if (active) setLedger({ key: ledgerKey, summaries });
    }).catch(error => {
      if (active) setLedger({ key: ledgerKey, error: error.message });
    });
    return () => { active = false; };
  }, [client, eventKey, ledgerKey]);

  if (!scope) return <section className="ap-section"><h1>Event settlements</h1><p>Event Finance access is required.</p></section>;
  const lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  return <section className="fo-root">
    <header className="fo-heading"><div><p className="ap-kicker">Money / Finance reports</p><h1>Event settlements</h1><p>Current entry funds, organiser payments and balances by event.</p></div><button type="button" className="ap-secondary" onClick={() => setRetry(n => n + 1)}>Refresh settlements</button></header>
    <div className="fo-ledger-filters"><label className="fo-search"><input aria-label="Search event settlements" placeholder="Search by event or organiser…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} /></label>
      <label className="fo-status-filter">Event date<SearchableDropdown value={date} onChange={e => { setDate(e.target.value); setPage(1); }}><option value="latest">Latest first</option><option value="oldest">Oldest first</option></SearchableDropdown></label>
    </div>
    {!loaded && <section className="ap-section"><RecordLoading label="Loading event settlements…" detail="Checking event finance access and loading matching events." /></section>}
    {loaded?.error && <p role="alert">{loaded.error}</p>}
    {activeLedger?.error && <p role="alert">Settlement figures could not be verified. {activeLedger.error}</p>}
    {loaded?.events && <><div className="fo-table-scroll" tabIndex={0} role="region" aria-label="Event settlement figures">
      <table className="fo-detail-table"><thead><tr><th>Event / organiser</th><th>Entries</th><th>Current entry payments</th><th>Refund history</th><th>Direct to organiser</th><th>4M fees</th><th>Paid out</th><th>Balance</th></tr></thead>
      <tbody>{slice.map(event => {
        const settlement = activeLedger?.summaries?.[event.id];
        return <tr key={event.id}><td><a className="fo-type-link" href={eventHref(event.id)}>{event.event_name}</a><small>{event.organiser_name || 'Organiser unavailable'}</small><small>{financeDate(event.start_date)}</small></td>
          <td>{settlement?.activeEntries ?? '—'}</td>{['grossEntryFees','entryFeesRefunded','organiserRetained','commission','interimPaid','dueToOrg'].map(field => <td key={field}>
            {settlement ? rand(settlement[field]) : '—'}{field === 'dueToOrg' && Boolean(settlement?.issues.length) && <small>Needs review</small>}
          </td>)}</tr>;
      })}</tbody></table>
    </div>{!rows.length && <p>No events match these filters.</p>}
      {!!slice.length && !activeLedger && <p role="status">Verifying settlement figures for this page…</p>}
      <nav className="fo-pagination" aria-label="Event settlement pages"><span>{rows.length} events · Page {current} of {lastPage}</span>
        <button className="ap-secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button>
        <button className="ap-secondary" disabled={current === lastPage} onClick={() => setPage(current + 1)}>Next</button>
      </nav>
    </>}
  </section>;
}
