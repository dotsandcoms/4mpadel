import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import SearchableDropdown from '../../components/SearchableDropdown';
import { summarizeEventSettlements } from '../../utils/eventSettlement.js';
import { filterCollectionEvents, loadFinanceCollections } from '../../utils/financeCollections.js';
import RecordLoading from './RecordLoading.jsx';

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const integer = new Intl.NumberFormat('en-ZA');
const pageSize = 10;

async function verifyAuthority(client, userId, scopeId) {
  if (!userId || scopeId !== 'all') throw new Error('Platform Finance access is required.');
  const { data, error } = await client.auth.getUser();
  if (error || data?.user?.id !== userId) throw new Error('Sign in again to open Collections.');
  const [active, platform] = await Promise.all([
    client.rpc('account_is_active'),
    client.rpc('is_super_admin', { user_email: data.user.email }),
  ]);
  if (active.error || platform.error || active.data !== true || platform.data !== true) {
    throw new Error('Current platform Finance access is required.');
  }
}

export default function FinanceCollectionsWorkspace({ client, session, scopeId, refreshRevision = 0 }) {
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const userId = session?.user?.id;
  const key = JSON.stringify([userId, scopeId, revision, refreshRevision]);
  const [state, setState] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      await verifyAuthority(client, userId, scopeId);
      controller.signal.throwIfAborted();
      const result = await loadFinanceCollections(client, [], controller.signal);
      await verifyAuthority(client, userId, scopeId);
      if (!controller.signal.aborted) setState({ key, result });
    }
    load().catch(error => {
      if (!controller.signal.aborted) setState({ key, error: error.message || 'Collections could not be loaded.' });
    });
    return () => controller.abort();
  }, [client, key, scopeId, userId]);

  const current = state?.key === key ? state : null;
  const collections = current?.result;
  const events = collections ? filterCollectionEvents(collections.statements, filter) : [];
  const totals = summarizeEventSettlements(events);
  const pages = Math.max(1, Math.ceil(events.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = events.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const refresh = () => setRevision(value => value + 1);
  const figures = collections ? [
    ['Events', integer.format(totals.events)], ['Entries', integer.format(totals.entries)],
    ['Current entry payments', money.format(totals.collected)], ['Balance owed', money.format(totals.balanceOwed)],
    ['Full licence collections', money.format(collections.fullLicRev)], ['Temporary licence collections', money.format(collections.tempLicRev)],
    ['Active players', integer.format(collections.activePlayers)], ['Transactions', integer.format(collections.totalTransactions)],
  ] : [];

  return <section className="fo-root">
    <header className="fo-heading">
      <div><h1>Collections</h1><p>Event entry collections, licence revenue and organiser balances.</p></div>
      <button className="ap-secondary" type="button" onClick={refresh} disabled={!current}><RefreshCw size={16} aria-hidden="true" /> Refresh collections</button>
    </header>
    {!current && <section className="ap-section"><RecordLoading label="Loading collection and settlement records…" /></section>}
    {current?.error && <section className="ap-section" role="alert"><h2>Collections could not be loaded</h2>
      <p>{current.error}</p><button className="ap-secondary" type="button" onClick={refresh}>Try again</button>
    </section>}
    {collections && <>
      <section className="fo-cards" aria-label="Collection totals">{figures.map(([label, value]) => <article className="fo-card" key={label}><h2>{label}</h2><strong>{value}</strong></article>)}</section>
      <section className="ap-section fo-breakdown">
        <header className="fo-heading">
          <div><h2>Event finance summary</h2><p>Balances marked for review are provisional.</p></div>
          <label className="fo-status-filter">Events
            <SearchableDropdown aria-label="Filter collection events" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
              <option value="all">All events</option><option value="outstanding">Outstanding</option>
              <option value="settled">Settled</option><option value="month">This month</option>
            </SearchableDropdown>
          </label>
        </header>
        <div className="fo-table-scroll" role="region" aria-label="Event collection figures" tabIndex={0}>
          <table className="fo-detail-table">
            <thead><tr>{['Event', 'Entries', 'Current entry payments', 'Refund history', '4M fees', 'Direct to organiser', 'Paid out', 'Balance'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{visible.map(event => <tr key={event.id}>
              <th scope="row"><Link className="fo-type-link" to={`/admin-preview/event?event=${encodeURIComponent(event.id)}&tab=statement`}>{event.event_name}</Link>
                {!!event.settlement.issues.length && <small>Needs review</small>}
                {event.settlement.unallocatedCredit4M > 0 && <small>{money.format(event.settlement.unallocatedCredit4M)} unallocated credit</small>}
              </th>
              <td>{integer.format(event.settlement.activeEntries)}</td>
              {['grossEntryFees', 'entryFeesRefunded', 'commission', 'organiserRetained', 'interimPaid', 'dueToOrg'].map(key => <td key={key}>{money.format(event.settlement[key])}</td>)}
            </tr>)}</tbody>
            <tfoot><tr><th scope="row">Totals · {events.length} events</th><td>{integer.format(totals.entries)}</td>
              {[totals.collected, totals.refunds, totals.commission, totals.direct, totals.paid, totals.balanceOwed - totals.overpaid].map((value, index) =>
                <td key={index}>{money.format(value)}</td>)}</tr></tfoot>
          </table>
        </div>
        {!events.length && <p role="status">No events match this filter.</p>}
        {totals.overpaid > 0 && <p>Amounts owed back to 4M {money.format(totals.overpaid)}.</p>}
        {pages > 1 && <nav className="fo-pagination" aria-label="Collection event pages">
          <span>Page {currentPage} of {pages}</span>
          <button className="ap-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <button className="ap-secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button>
        </nav>}
      </section>
      <section className="ap-section fo-breakdown">
        <header className="fo-heading"><div><h2>Collections by month · {collections.year}</h2><p>{money.format(collections.totalRevenue)} total event and licence collections across all years.</p></div></header>
        <div className="fo-table-scroll" role="region" aria-label="Monthly collection figures" tabIndex={0}>
          <table className="fo-detail-table"><thead><tr>{['Month', 'Entries', 'Licences', 'Collections'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{collections.monthly.map(row => <tr key={row.name}><th scope="row">{row.name}</th>
              <td>{money.format(row.entries)}</td><td>{money.format(row.licenses)}</td><td>{money.format(row.revenue)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>}
  </section>;
}
