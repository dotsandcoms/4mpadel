import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { gatewayPageExcel } from './gatewayExport.js';
import { canReadFinanceOverview, financeDate } from './financeOverviewData.js';
import { loadGatewayPage } from './paystackGatewayData.js';
import { loadGatewayLinks, gatewayLinkLabel } from './gatewayLinks.js';
import { financeStatusTone } from './financePresentation.js';
import GatewayComparisonCell from './GatewayComparisonCell.jsx';
import RecordLoading from './RecordLoading.jsx';
import DatePicker from './DatePicker.jsx';
import './FinanceOverview.css';

export default function PaystackGateway({ client, session, permissions, scopeId, refreshRevision = 0 }) {
  const allowed = canReadFinanceOverview(session, permissions, scopeId);
  const staging = client?.supabaseUrl?.replace(/\/$/, '') === 'https://cefmzkwabdqqoagxhekc.supabase.co';
  const [filters, setFilters] = useState({ from: '', to: '', status: '' });
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ loading: true });
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const exportContext = useRef(null);
  const key = JSON.stringify([session?.user?.id, scopeId, permissions?.role, filters, page, reload, refreshRevision]);
  useEffect(() => {
    const context = { active: allowed && staging };
    exportContext.current = context;
    setExporting(false); setExportStatus('');
    return () => { context.active = false; };
  }, [key, client, allowed, staging]);
  useEffect(() => {
    if (!allowed || !staging) return;
    const controller = new AbortController();
    setState({ key, loading: true });
    loadGatewayPage(client, session, permissions, scopeId, { ...filters, mode: 'test', page, perPage: 10 }, controller.signal)
      .then(async data => ({ ...data, transactions: await loadGatewayLinks(client, session, permissions, scopeId, data.transactions, controller.signal) }))
      .then(data => { if (!controller.signal.aborted) setState({ key, data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, error: error.message }); });
    return () => controller.abort();
  }, [client, allowed, staging, key]);
  if (!allowed) return <section className="ap-section" style={{ padding: 24 }}><h2>Paystack gateway</h2><p>Platform super-admin access in All 4M Padel is required.</p></section>;
  if (!staging) return <section className="ap-section" style={{ padding: 24 }}><h2>Paystack gateway · Staging only</h2><p>The read-only gateway is verified in staging. This preview is connected to a different project, so gateway requests are disabled here.</p><p className="fo-note">Use Recorded payments to review existing 4M records. No live gateway request has been made.</p></section>;
  const loading = state.key !== key || state.loading;
  const data = state.key === key ? state.data : null;
  const update = (name, value) => { setFilters(current => ({ ...current, [name]: value })); setPage(1); };
  const exportPage = async () => {
    const context = exportContext.current;
    if (!context?.active || exporting || loading || !data?.transactions.length) return;
    setExporting(true); setExportStatus('');
    try {
      const buffer = await gatewayPageExcel(data, filters);
      if (!context.active) return;
      saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `4m-paystack-test-page-${page}.xlsx`);
      setExportStatus(`Excel prepared: ${data.transactions.length} transactions from page ${page} only.`);
    } catch (error) { if (context.active) setExportStatus(error.message); }
    finally { if (context.active) setExporting(false); }
  };
  return <section className="fo-root">
    <header className="fo-heading"><div><p className="ap-kicker">Money / Payments / Gateway</p><h1>Paystack gateway</h1><p>Test environment · Read-only transactions directly from Paystack.</p></div><div className="fo-report-actions"><button className="ap-secondary" disabled={loading || exporting || !data?.transactions.length} onClick={exportPage}>{exporting ? 'Preparing Excel…' : 'Export page to Excel'}</button><button className="ap-secondary" disabled={loading} onClick={() => setReload(n => n + 1)}>Refresh gateway</button></div></header>
    {exportStatus && <p className="fo-note" role="status">{exportStatus}</p>}
    <p className="fo-note">These are gateway transactions, not a balance or settlement report. Names and comparisons use one exact reference match to a 4M test payment. Comparisons check recorded status, currency and ZAR amounts; agreement is not bank verification. Sync and refunds are disabled.</p>
    <div className="fo-ledger-filters">
      <DatePicker label="Start date" value={filters.from} onChange={value => update('from', value)}/>
      <DatePicker label="End date" value={filters.to} onChange={value => update('to', value)}/>
      <label className="fo-status-filter">Gateway status<SearchableDropdown value={filters.status} onChange={event => update('status', event.target.value)}><option value="">All statuses</option><option value="success">Success</option><option value="failed">Failed</option><option value="abandoned">Abandoned</option></SearchableDropdown></label>
      <button className="ap-secondary" onClick={() => { setFilters({ from: '', to: '', status: '' }); setPage(1); }}>Reset filters</button>
    </div>
    <p className="fo-note">Dates use South African time and include both selected days. Status filters apply across all gateway pages.</p>
    {loading ? <section className="ap-section"><RecordLoading label="Loading Paystack transactions…" detail="Requesting one page securely from the test gateway. Larger histories remain available through pagination."/></section> : state.error ? <section className="ap-section" role="alert" style={{ padding: 24 }}><h2>Gateway could not be loaded</h2><p>{state.error}</p><button className="ap-secondary" onClick={() => setReload(n => n + 1)}>Try again</button></section> : data && <>
      <p role="status">{data.pagination.total.toLocaleString()} matching test transactions</p>
      <p className="fo-note">On this page: {data.transactions.filter(row => row.link?.comparison?.state === 'different').length} with differences · {data.transactions.filter(row => row.link?.comparison?.state === 'incomplete').length} incomplete comparisons. These counts do not cover other pages.</p>
      <div className="fo-table-scroll" role="region" aria-label="Paystack gateway transactions" tabIndex={0}><table className="fo-detail-table"><thead><tr><th>Date</th><th>Reference</th><th>Player / event in 4M</th><th>Status</th><th>Channel / 4M comparison</th><th>Amount</th></tr></thead><tbody>{data.transactions.map(row => <tr key={row.reference}><td>{financeDate(row.createdAt) || 'Not provided'}</td><td>{row.reference}</td><td><div className="fo-player-copy">{row.link?.state === 'matched' && <><span className="fo-player-name">{row.link.playerName || 'Player details unavailable'}</span><small>{row.link.eventName || 'Event details unavailable'}</small></>}<small>{gatewayLinkLabel(row.link)}</small></div></td><td><span className={`ap-status ap-status--${financeStatusTone(row.status)}`}>{row.status}</span></td><td>{row.channel || 'Not provided'}<div style={{marginTop:8}}><GatewayComparisonCell link={row.link}/></div></td><td>{(row.amountMinor / 100).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.currency}</td></tr>)}</tbody></table></div>
      {!data.transactions.length && <p>No gateway transactions match these filters.</p>}
      <nav className="fo-pagination" aria-label="Gateway pages"><span>Page {page} of {Math.max(1, data.pagination.pageCount)}</span><button className="ap-secondary" disabled={page === 1} onClick={() => setPage(n => n - 1)}>Previous</button><button className="ap-secondary" disabled={!data.pagination.hasMore} onClick={() => setPage(n => n + 1)}>Next</button></nav>
    </>}
  </section>;
}
