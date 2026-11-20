import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import SearchableDropdown from '../../components/SearchableDropdown';
import { southAfricanToday } from '../../utils/licenseReporting';
import { gatewayPageExcel } from './gatewayExport.js';
import { financeDate } from './financeOverviewData.js';
import { loadGatewayPage } from './paystackGatewayData.js';
import { loadGatewayLinks, loadGatewayPayerNames, loadGatewayReceiptTypes, gatewayLinkLabel, gatewayReceiptTypeLabels } from './gatewayLinks.js';
import { canConfirmGatewayCheckout, canReadPlatformPaystack, confirmGatewayCheckout, loadPlatformGatewayTransactions } from './platformPaystack.js';
import { financeStatusTone } from './financePresentation.js';
import { canReviewGatewayBackfill } from './paystackBackfill.js';
import { canSelectGatewayBackfill, selectMissingGatewayReceipts } from './gatewayBackfillSelection.js';
import GatewayBackfillReview from './GatewayBackfillReview.jsx';
import GatewayComparisonCell from './GatewayComparisonCell.jsx';
import RecordLoading from './RecordLoading.jsx';
import DatePicker from './DatePicker.jsx';
import './FinanceOverview.css';

const STAGING_URL = 'https://cefmzkwabdqqoagxhekc.supabase.co';
const PER_PAGE = 10;
const ago = days => new Date(Date.now() - days * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });
const baseFilters = staging => ({ from: staging ? '' : ago(30), to: '', status: '', query: '', payerName:'', receiptType:'', missingOnly:false });

export default function PaystackGateway({ client, session, permissions, scopeId, refreshRevision = 0 }) {
  const allowed = canReadPlatformPaystack(session, permissions, scopeId);
  const staging = client?.supabaseUrl?.replace(/\/$/, '') === STAGING_URL;
  const [mode, setMode] = useState(staging ? 'test' : 'live');
  const [filters, setFilters] = useState(() => baseFilters(staging));
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [records, setRecords] = useState(null);
  const [linked, setLinked] = useState(null);
  const [classified, setClassified] = useState(null);
  const [payerNames, setPayerNames] = useState(null);
  const [missing, setMissing] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [review, setReview] = useState(null);
  const [backfill, setBackfill] = useState(null);
  const [recordingKey, setRecordingKey] = useState(null);
  const [selection, setSelection] = useState(null);
  const bulkRequest = useRef(null);
  const [action, setAction] = useState(null);
  const lifetime = useRef(null);
  const running = useRef(false);
  const userId = session?.user?.id;
  const actor = useMemo(() => ({ user: { id: userId } }), [userId]);
  const permissionsKey = JSON.stringify(permissions ?? null);
  const grant = useMemo(() => JSON.parse(permissionsKey), [permissionsKey]);
  const { from, to, status, query, payerName, receiptType, missingOnly } = filters;
  const canReviewMissing = !staging && mode === 'live' && canSelectGatewayBackfill(actor, grant, scopeId);
  const missingEnabled = canReviewMissing && missingOnly;
  const stageStatus = staging ? status : '';
  const stagePage = staging ? page : 1;
  const filterKey = JSON.stringify([userId, scopeId, permissionsKey, mode, from, to, stageStatus, stagePage, reload, refreshRevision]);
  const response = records?.key === filterKey ? records : null;
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const request = staging
      ? loadGatewayPage(client, actor, grant, scopeId, { mode: 'test', from, to, status:stageStatus, page:stagePage, perPage: PER_PAGE }, controller.signal)
      : loadPlatformGatewayTransactions(client, actor, grant, scopeId, { mode, from, to }, controller.signal);
    request.then(data => {
      if (!controller.signal.aborted) setRecords({ key: filterKey, data });
    }).catch(error => {
      if (!controller.signal.aborted) setRecords({ key: filterKey, error: error.message });
    });
    return () => controller.abort();
  }, [client, allowed, filterKey, actor, grant, scopeId, mode, from, to, stageStatus, stagePage, staging]);

  const referenceRows = useMemo(() => {
    if (staging || !response?.data) return null;
    const filter = query.trim().toLowerCase();
    return response.data.filter(row => (!status || (status === 'pending' ? row.status !== 'success' : row.status === status))
      && (!filter || [row.reference, row.payerEmail].some(value => String(value).toLowerCase().includes(filter))));
  }, [response, query, staging, status]);
  const nameKey = JSON.stringify([filterKey, status, query]);
  const nameFilter = payerName.trim().toLowerCase();
  const nameEnabled = !staging && Boolean(nameFilter);
  const nameResult = nameEnabled && payerNames?.key === nameKey ? payerNames : null;
  useEffect(() => {
    if (!allowed || !nameEnabled || !referenceRows) return;
    const controller = new AbortController();
    loadGatewayPayerNames(client, actor, grant, scopeId, referenceRows, controller.signal)
      .then(data => { if (!controller.signal.aborted) setPayerNames({ key:nameKey, data }); })
      .catch(error => { if (!controller.signal.aborted) setPayerNames({ key:nameKey, error:error.message }); });
    return () => controller.abort();
  }, [allowed, nameEnabled, nameKey, referenceRows, client, actor, grant, scopeId]);
  const filteredRows = useMemo(() => {
    if (!nameEnabled) return referenceRows;
    return nameResult?.data ? referenceRows?.filter(row => nameResult.data.get(row.reference)?.toLowerCase().includes(nameFilter)) : null;
  }, [nameEnabled, nameResult, referenceRows, nameFilter]);
  const typeKey = JSON.stringify([nameKey, nameFilter]);
  const typeEnabled = !staging && Boolean(receiptType);
  const typeResult = typeEnabled && classified?.key === typeKey ? classified : null;
  useEffect(() => {
    if (!allowed || !typeEnabled || !filteredRows) return;
    const controller = new AbortController();
    loadGatewayReceiptTypes(client, actor, grant, scopeId, filteredRows, controller.signal)
      .then(data => { if (!controller.signal.aborted) setClassified({ key:typeKey, data }); })
      .catch(error => { if (!controller.signal.aborted) setClassified({ key:typeKey, error:error.message }); });
    return () => controller.abort();
  }, [allowed, typeEnabled, filteredRows, client, actor, grant, scopeId, typeKey]);
  const typeRows = useMemo(() => {
    if (!typeEnabled) return filteredRows;
    if (typeResult?.data) return filteredRows?.filter(row => typeResult.data.get(row.reference) === receiptType);
    return null;
  }, [typeEnabled, typeResult, filteredRows, receiptType]);
  const missingKey = JSON.stringify([typeKey, receiptType]);
  const missingResult = missingEnabled && missing?.key === missingKey ? missing : null;
  useEffect(() => {
    if (!missingEnabled || !typeRows) return;
    const controller = new AbortController();
    selectMissingGatewayReceipts(client, actor, grant, scopeId, typeRows, controller.signal)
      .then(data => { if (!controller.signal.aborted) setMissing({ key:missingKey, data }); })
      .catch(error => { if (!controller.signal.aborted) setMissing({ key:missingKey, error:error.message }); });
    return () => controller.abort();
  }, [missingEnabled, missingKey, typeRows, client, actor, grant, scopeId]);
  const matchingRows = missingEnabled ? missingResult?.data : typeRows;
  const screen = useMemo(() => {
    if (!response?.data) return null;
    const filter = query.trim().toLowerCase();
    if (staging) return {
      ...response.data,
      transactions: response.data.transactions.filter(row => !filter || row.reference.toLowerCase().includes(filter)),
    };
    const rows = matchingRows;
    if (!rows) return null;
    const pageCount = Math.ceil(rows.length / PER_PAGE);
    const currentPage = Math.min(page, Math.max(1, pageCount));
    return { environment: mode, transactions: rows.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE), pagination: {
      page: currentPage, perPage: PER_PAGE, total: rows.length, pageCount, hasMore: currentPage < pageCount,
    } };
  }, [response, query, staging, matchingRows, mode, page]);
  const resultKey = JSON.stringify([missingKey, missingEnabled]);
  const linkKey = JSON.stringify([resultKey, screen?.pagination.page, screen?.transactions.map(row => row.reference)]);
  useEffect(() => {
    if (!allowed || missingEnabled || !screen) return;
    const controller = new AbortController();
    loadGatewayLinks(client, actor, grant, scopeId, screen.transactions, controller.signal)
      .then(transactions => { if (!controller.signal.aborted) setLinked({ key: linkKey, data: { ...screen, transactions } }); })
      .catch(error => { if (!controller.signal.aborted) setLinked({ key: linkKey, error: error.message }); });
    return () => controller.abort();
  }, [client, allowed, linkKey, screen, actor, grant, scopeId, missingEnabled]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller.signal;
    return () => controller.abort();
  }, [client, userId, scopeId, allowed, mode]);
  useEffect(() => {
    const controller = new AbortController();
    bulkRequest.current = controller;
    return () => controller.abort();
  }, [resultKey, client, allowed]);
  if (!allowed) return <section className="ap-section"><h2>Paystack gateway</h2><p>Platform Paystack access is required.</p></section>;

  const result = missingEnabled && screen ? { data:screen } : linked?.key === linkKey ? linked : null;
  const data = result?.data;
  const activePage = data?.pagination.page || 1;
  const pageCount = Math.max(1, data?.pagination.pageCount || 0);
  const visiblePages = [...new Set([1, activePage - 1, activePage, activePage + 1, pageCount])]
    .filter(number => number >= 1 && number <= pageCount).sort((a, b) => a - b);
  const eligible = (data?.transactions || []).filter(canConfirmGatewayCheckout);
  const backfillReview = backfill && (backfill.bulk ? backfill.key === resultKey : backfill.key === linkKey) ? backfill : null;
  const bulkLookup = selection?.key === resultKey ? selection : null;
  const backfillBusy = Boolean(recordingKey && recordingKey === backfillReview?.key);
  const trackRecording = busy => setRecordingKey(previous => busy ? backfillReview.key : previous === backfillReview.key ? null : previous);
  const canLookup = canReviewMissing
    && (!receiptType || receiptType === 'other') && matchingRows?.some(row => row.status === 'success');
  const openBackfill = rows => { setReview(null); setBackfill({ key:linkKey, rows }); };
  async function reviewAllMissing() {
    const controller = bulkRequest.current;
    if (!controller || controller.signal.aborted || !canLookup || bulkLookup?.busy || backfillReview) return;
    setReview(null);
    setNotice('');
    setSelection({ key:resultKey, busy:true });
    try {
      const rows = await selectMissingGatewayReceipts(client, actor, grant, scopeId, matchingRows, controller.signal);
      if (controller.signal.aborted) return;
      if (rows.length) {
        setBackfill({ key:resultKey, rows, bulk:true });
        setSelection(null);
      } else setSelection({ key:resultKey, message:'There are no unmatched successful receipts in these results.' });
    } catch (failure) {
      if (!controller.signal.aborted) setSelection({ key:resultKey, error:failure.message });
    }
  }
  const error = response?.error || nameResult?.error || typeResult?.error || missingResult?.error || result?.error;
  const loading = !error && (!response || !result);
  const update = (name, value) => {
    if (filters[name] !== value) setMissing(null);
    if (filters[name] !== value && (['query', 'status'].includes(name) || (name === 'payerName' && !value.trim()))) setPayerNames(null);
    setFilters(current => ({ ...current, [name]: value })); setPage(1); setReview(null); setNotice('');
  };
  const setRange = bounds => {
    if (bounds.from !== from || bounds.to !== to) { setMissing(null); setPayerNames(null); }
    setFilters(current => ({ ...current, ...bounds })); setPage(1); setReview(null); setNotice('');
  };
  const goToPage = number => { setPage(number); setReview(null); };
  async function exportPage() {
    const signal = lifetime.current;
    if (exporting || !data?.transactions.length || signal?.aborted) return;
    setExporting(true);
    try {
      const buffer = await gatewayPageExcel(data, filters);
      if (signal.aborted) return;
      saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `4m-paystack-${mode}-page-${activePage}.xlsx`);
      setNotice(`Excel prepared with ${data.transactions.length} transactions from this page.`);
    } catch (failure) { if (!signal.aborted) setNotice(failure.message); }
    finally { if (!signal.aborted) setExporting(false); }
  }
  async function reconcile() {
    if (!review || running.current || staging || mode !== 'live') return;
    const signal = lifetime.current;
    running.current = true;
    const reports = [];
    setAction({ rows: reports, busy: true });
    try {
      for (const row of review) {
        if (signal.aborted) return;
        try {
          const outcome = await confirmGatewayCheckout(client, session, permissions, scopeId, row, signal);
          reports.push({ reference: row.reference, ...outcome });
        } catch (failure) {
          reports.push({ reference: row.reference, status: 'failed', message: failure.message });
        }
        if (!signal.aborted) setAction({ rows: [...reports], busy: true });
      }
    } finally {
      running.current = false;
      if (!signal.aborted) {
        setAction({ rows: [...reports], busy: false });
        setReview(null);
        setReload(n => n + 1);
      }
    }
  }

  return <section className="fo-root">
    <header className="fo-heading"><div><p className="ap-kicker">Money / Payments / Gateway</p><h1>Paystack gateway</h1><p>{mode === 'live' ? 'Live' : 'Test'} transactions from Paystack.</p></div>
      <div className="fo-report-actions"><button className="ap-secondary" disabled={loading || exporting || !data?.transactions.length} onClick={exportPage}>{exporting ? 'Preparing Excel…' : 'Export page to Excel'}</button>
        <button className="ap-secondary" disabled={loading || action?.busy || backfillBusy} onClick={() => setReload(n => n + 1)}>Refresh gateway</button>
      </div>
    </header>
    {notice && <p className="fo-note" role="status">{notice}</p>}
    {bulkLookup?.message && <p className="fo-note" role="status">{bulkLookup.message}</p>}
    {bulkLookup?.error && <p className="fo-note" role="alert">{bulkLookup.error}</p>}
    <fieldset disabled={backfillBusy} style={{ border:0, padding:0, margin:0, minWidth:0 }}>
    <div className="fo-ledger-filters">
      {!staging && <label className="fo-status-filter">Environment<SearchableDropdown value={mode} onChange={event => {
        setMode(event.target.value); update('missingOnly', false); setAction(null); setExporting(false);
      }} disabled={action?.busy || backfillBusy}><option value="live">Live</option><option value="test">Test</option></SearchableDropdown></label>}
      <DatePicker label="Start date" value={from} onChange={value => update('from', value)} />
      <DatePicker label="End date" value={to} onChange={value => update('to', value)} />
      <label className="fo-status-filter">Gateway status<SearchableDropdown value={status} onChange={event => update('status', event.target.value)}><option value="">All statuses</option><option value="success">Success</option><option value="failed">Failed</option><option value="abandoned">Abandoned</option>{!staging && <option value="pending">Unsuccessful or pending</option>}</SearchableDropdown></label>
      {!staging && <label className="fo-status-filter">Receipt type<SearchableDropdown aria-label="Receipt type" value={receiptType}
        onChange={event => update('receiptType', event.target.value)}><option value="">All receipt types</option>
        {Object.entries(gatewayReceiptTypeLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</SearchableDropdown></label>}
      {canReviewMissing && <label className="lw-check"><input type="checkbox" checked={missingEnabled}
        disabled={action?.busy} onChange={event => update('missingOnly', event.target.checked)} />Missing in 4M</label>}
      <button className="ap-secondary" onClick={() => { setMissing(null); setPayerNames(null); setFilters(baseFilters(staging)); setPage(1); setReview(null); }}>Reset filters</button>
    </div>
    <div className="fo-ledger-filters"><label className="fo-search"><input aria-label="Search gateway transactions" value={query} onChange={event => update('query', event.target.value)} placeholder={staging ? 'Search references on this page…' : 'Search reference or payer…'} /></label>
      {!staging && <label className="fo-search"><input aria-label="Search payer name" value={payerName} onChange={event => update('payerName', event.target.value)} placeholder="Search linked 4M payer name…" /></label>}
      {!staging && <div className="fo-report-actions" aria-label="Common date ranges">
        <button className="ap-secondary" onClick={() => setRange({ from: ago(30), to: southAfricanToday() })}>Last 30 days</button>
        <button className="ap-secondary" onClick={() => setRange({ from: ago(90), to: southAfricanToday() })}>Last 90 days</button>
      </div>}
    </div>
    </fieldset>
    <p className="fo-note">Date filters use South African time. {staging ? 'Test gateway access is read-only.' : 'The gateway returns a bounded history. Narrow the date range to review more transactions.'}</p>
    {receiptType && <p className="fo-note">Licence types come from the matching payment stored in 4M.</p>}
    {backfillReview && <GatewayBackfillReview key={backfillReview.key} client={client} session={actor} permissions={grant} scopeId={scopeId}
      rows={backfillReview.rows} bulk={backfillReview.bulk} onBusyChange={trackRecording} onClose={() => setBackfill(null)}
      onRecorded={() => { setBackfill(null); setReload(value => value + 1); }}/>}
    {review && <section className="ap-section" style={{ padding: 18 }} aria-label="Review checkout reconciliation"><h2>Confirm checkout reconciliation</h2>
      <p>4M verifies each chosen reference against its saved event checkout and Paystack.</p><ul>{review.map(row => <li key={row.reference}>{row.reference}</li>)}</ul>
      <div className="fo-report-actions"><button className="ap-primary" disabled={action?.busy} onClick={reconcile}>{action?.busy ? 'Reconciling…' : 'Confirm reconciliation'}</button>
        <button className="ap-secondary" disabled={action?.busy} onClick={() => setReview(null)}>Cancel</button></div>
    </section>}
    {Boolean(action?.rows.length) && <section className="ap-section" style={{ padding: 18 }} aria-live="polite"><h2>Reconciliation results</h2>
      <ul>{action.rows.map(row => <li key={row.reference}><strong>{row.reference}</strong> · {row.message}</li>)}</ul></section>}
    {loading && <section className="ap-section"><RecordLoading label="Loading Paystack transactions…" detail="Fetching Paystack history and matching saved 4M references." /></section>}
    {error && <section className="ap-section" role="alert" style={{ padding: 18 }}><h2>Gateway could not be loaded</h2><p>{error}</p><button className="ap-secondary" onClick={() => setReload(n => n + 1)}>Try again</button></section>}
    {data && <>
      <div className="fo-actions fo-report-actions"><p role="status">{data.pagination.total.toLocaleString()} matching {mode} transactions</p>{!staging && mode === 'live' && <button className="ap-secondary" disabled={!eligible.length || action?.busy || backfillBusy || bulkLookup?.busy || Boolean(backfillReview)} onClick={() => { setBackfill(null); setReview(eligible); }}>Review page reconciliation</button>}
        {canLookup && <button className="ap-secondary" disabled={backfillBusy || action?.busy || bulkLookup?.busy || Boolean(backfillReview)}
          onClick={reviewAllMissing}>{bulkLookup?.busy ? 'Checking ledger matches…' : 'Review all missing receipts'}</button>}</div>
      <div className="fo-table-scroll" role="region" aria-label="Paystack gateway transactions" tabIndex={0}><table className="fo-detail-table"><thead><tr><th>Date</th><th>Reference</th><th>Player / event in 4M</th><th>Status</th><th>4M comparison</th><th>Amount</th>{!staging && mode === 'live' && <th>Actions</th>}</tr></thead>
        <tbody>{data.transactions.map(row => <tr key={row.reference}><td>{financeDate(row.createdAt) || 'Not provided'}</td><td>{row.reference}</td>
          <td><div className="fo-player-copy">{row.link?.state === 'matched' && <><span className="fo-player-name">{row.link.playerName || 'Player details unavailable'}</span><small>{row.link.eventName || 'Event details unavailable'}</small></>}<small>{gatewayLinkLabel(row.link)}</small></div></td>
          <td><span className={`ap-status ap-status--${financeStatusTone(row.status)}`}>{row.status}</span></td><td>{row.channel && <small>{row.channel}</small>}<GatewayComparisonCell link={row.link}/></td>
          <td>{(row.amountMinor / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.currency}</td>
          {!staging && mode === 'live' && <td>{canConfirmGatewayCheckout(row) ? <button className="fo-type-link" disabled={action?.busy || backfillBusy || bulkLookup?.busy || Boolean(backfillReview)} onClick={() => { setBackfill(null); setReview([row]); }}>Verify checkout</button>
            : canReviewGatewayBackfill(actor, grant, scopeId, row) ? <button className="fo-type-link" disabled={action?.busy || backfillBusy || bulkLookup?.busy || Boolean(backfillReview)}
              onClick={() => openBackfill([row])}>{row.link.unallocated ? 'Review allocation' : 'Review missing receipt'}</button> : <small>—</small>}</td>}
        </tr>)}</tbody></table></div>
      {!data.transactions.length && <p>No gateway transactions match these filters.</p>}
      <nav className="fo-pagination" aria-label="Gateway pages"><span>Page {activePage} of {pageCount}</span>
        <button type="button" className="ap-secondary" disabled={activePage === 1 || action?.busy || bulkLookup?.busy || Boolean(backfillReview)}
          onClick={() => goToPage(activePage - 1)}>Previous</button>
        {pageCount > 1 && visiblePages.map((number, index) => <Fragment key={number}>
          {index > 0 && number - visiblePages[index - 1] > 1 && <span aria-hidden="true">…</span>}
          <button type="button" className={number === activePage ? 'ap-primary' : 'ap-secondary'} aria-label={`Page ${number}`}
            aria-current={number === activePage ? 'page' : undefined} disabled={action?.busy || bulkLookup?.busy || Boolean(backfillReview)}
            onClick={() => goToPage(number)}>{number}</button>
        </Fragment>)}
        <button type="button" className="ap-secondary" disabled={!data.pagination.hasMore || action?.busy || bulkLookup?.busy || Boolean(backfillReview)}
          onClick={() => goToPage(activePage + 1)}>Next</button>
      </nav>
    </>}
  </section>;
}
