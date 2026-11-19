import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import { recordedPayoutsExcel } from './payoutsExport.js';
import PayoutDetails from './PayoutDetails.jsx';
import { supabase } from '../../supabaseClient';
import { canReadFinanceOverview } from './financeOverviewData.js';
import { loadRecordedPayouts, filterRecordedPayouts } from './payoutsData.js';
import RecordLoading from './RecordLoading.jsx';
import DatePicker from './DatePicker.jsx';
import './FinanceOverview.css';

export default function PayoutsWorkspace({ session, permissions, scopeId, client = supabase, refreshRevision = 0 }) {
  const allowed = canReadFinanceOverview(session, permissions, scopeId);
  const [state, setState] = useState({ loading: true });
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState({ query: '', from: '', to: '', reviewOnly: false });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const exportContext = useRef(null);
  const context = `${session?.user?.id}-${permissions?.role}-${scopeId}-${reload}-${refreshRevision}`;
  useEffect(() => {
    const token = { active: allowed };
    exportContext.current = token; setExporting(false); setExportStatus(''); setSelected(null);
    return () => { token.active = false; };
  }, [context, client, allowed]);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setState({ context, loading: true });
    const timer = setTimeout(() => { controller.abort(); setState({ context, error: 'Loading took too long. Try again.' }); }, 45000);
    loadRecordedPayouts(client, session, permissions, scopeId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ context, data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ context, error: error.message }); })
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, allowed, context]);
  if (!allowed) return <section className="ap-section" style={{ padding: 24 }}><h1>Payouts</h1><p>Platform super-admin access in All 4M Padel is required. Delegated Payouts access is not yet enabled.</p></section>;
  const loading = state.context !== context || state.loading;
  const data = state.context === context ? state.data : null;
  const invalid = filters.from && filters.to && filters.from > filters.to;
  const rows = invalid ? [] : filterRecordedPayouts(data?.rows || [], filters);
  const pages = Math.max(1, Math.ceil(rows.length / 10)), current = Math.min(page, pages);
  const update = (field, value) => {
    setFilters(previous => ({ ...previous, [field]: value }));
    setPage(1);
    setExportStatus('');
  };
  const exportRows = async () => {
    const token = exportContext.current;
    if (!token?.active || loading || exporting || invalid || !data || (!rows.length && !data.issues.length)) return;
    setExporting(true); setExportStatus('');
    try {
      const buffer = await recordedPayoutsExcel(rows, data.issues, filters);
      if (!token.active) return;
      saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), '4m-recorded-organiser-payouts.xlsx');
      setExportStatus(`Excel prepared with ${rows.length} matching records across all pages, using filters at export start.`);
    } catch (error) { if (token.active) setExportStatus(error.message); }
    finally { if (token.active) setExporting(false); }
  };
  return <section className="fo-root">
    <header className="fo-heading"><div><p className="ap-kicker">Money / Payouts</p><h1>Recorded organiser payouts</h1><p>Review organiser payments recorded against events.</p></div><div className="fo-report-actions"><button className="ap-secondary" disabled={loading || exporting || Boolean(invalid) || !data || (!rows.length && !data.issues.length)} onClick={exportRows}>{exporting ? 'Preparing Excel…' : 'Export Excel'}</button><button className="ap-secondary" disabled={loading} onClick={() => setReload(n => n + 1)}>Refresh payouts</button></div></header>
    {exportStatus && <p role="status" className="fo-note">{exportStatus}</p>}
    <p className="fo-note">Read-only · These manually recorded payments are not verified bank transfers or Paystack settlements. Payout requests and approvals are not included. No remaining balance is inferred.</p>
    <div className="fo-ledger-filters"><label className="fo-search"><input aria-label="Search recorded payouts" placeholder="Search event, organiser, note or record ID…" value={filters.query} onChange={event => update('query', event.target.value)}/></label><label className="fo-status-filter">Record quality<SearchableDropdown value={filters.reviewOnly ? 'review' : 'all'} onChange={event => update('reviewOnly', event.target.value === 'review')}><option value="all">All records</option><option value="review">Needs review</option></SearchableDropdown></label></div>
    <div className="fo-ledger-filters"><DatePicker label="Start date" value={filters.from} onChange={value => update('from', value)}/><DatePicker label="End date" value={filters.to} onChange={value => update('to', value)}/><button className="ap-secondary" onClick={() => { setFilters({ query: '', from: '', to: '', reviewOnly: false }); setPage(1); }}>Reset filters</button></div>
    <p className="fo-note">Date filters include both selected payment dates. Undated records are excluded when a date filter is applied; reset dates to review them.</p>
    {invalid && <p role="alert">End date must be on or after start date.</p>}
    {loading ? <section className="ap-section"><RecordLoading label="Loading recorded payouts…" detail="Reading recorded organiser payments from accessible events. Larger event histories may take longer."/></section> : state.error ? <section className="ap-section" style={{ padding: 24 }} role="alert"><h2>Payouts could not be loaded</h2><p>{state.error}</p><button className="ap-secondary" onClick={() => setReload(n => n + 1)}>Try again</button></section> : data && <>
      {data.issues.length > 0 && <section className="ap-section" style={{ padding: 24 }} role="alert"><h2>Some event records need review</h2><p>{data.issues.length} events contain unreadable payout lists. Their payments are not included below.</p><details><summary>Show affected events</summary><ul>{data.issues.map((issue, index) => <li key={`${issue.eventId}-${index}`}>{issue.eventName || `Event #${issue.eventId}`} — {issue.message}</li>)}</ul></details></section>}
      <p role="status">Matching records: {rows.length} · Records needing review across all loaded events: {data.rows.filter(row => row.warnings.length).length}.</p>
      <div className="fo-table-scroll" role="region" aria-label="Recorded organiser payouts" tabIndex={0}><table className="fo-detail-table"><colgroup>{[13,27,23,22,15].map((width, index) => <col key={index} style={{ width: `${width}%` }}/>)}</colgroup><thead><tr><th>Payment date</th><th>Event / organiser</th><th>Record / note</th><th>Record quality</th><th>Recorded amount</th></tr></thead><tbody>{rows.slice((current - 1) * 10, current * 10).map(row => <tr key={row.key}><td>{row.paidAt || 'Date unavailable'}</td><td><span className="fo-player-name">{row.eventName}</span><small>{row.organiserName}</small><small>Event #{row.eventId}</small></td><td><button className="fo-type-link" onClick={() => setSelected(row)} aria-label={`View payout details for ${row.eventName}`}>{row.recordId || 'View record'} →</button><small>{row.note || 'No note recorded'}</small></td><td><span className={`ap-status ap-status--${row.warnings.length ? 'warning' : 'neutral'}`}>{row.warnings.length ? 'Needs review' : 'Recorded'}</span>{row.warnings.map(warning => <small key={warning}>{warning}</small>)}</td><td>{row.amountCents == null ? 'Amount unavailable' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(row.amountCents / 100)}</td></tr>)}</tbody></table></div>
      {!rows.length && !invalid && <p>No recorded payouts match these filters.</p>}
      <nav className="fo-pagination" aria-label="Payout pages"><span>{rows.length ? (current - 1) * 10 + 1 : 0}–{Math.min(current * 10, rows.length)} of {rows.length}</span><button className="ap-secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current} of {pages}</span><button className="ap-secondary" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></nav>
      {selected && <PayoutDetails row={selected} onClose={() => setSelected(null)}/>}
    </>}
  </section>;
}
