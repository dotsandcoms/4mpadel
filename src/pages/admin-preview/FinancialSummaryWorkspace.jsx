import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { filteredFinancialSummary, financialSummaryScope, loadFinancialSummary, verifyFinancialSummaryScope } from './financialSummaryData.js';
import { buildFinancialSummaryWorkbook, downloadFinancialSummary, eventColumns, eventReportRow, financialSummaryCsv, playerColumns, playerReportRow } from './financialSummaryExport.js';
import RecordLoading from './RecordLoading.jsx';

const PAGE_SIZE = 25;
const formatter = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const defaultEventHref = eventId => `/admin-preview/event?event=${encodeURIComponent(eventId)}&tab=statement`;

export default function FinancialSummaryWorkspace({ client, session, permissions, scopeId, refreshRevision = 0, eventHref = defaultEventHref }) {
  const scopeKey = JSON.stringify(financialSummaryScope(permissions, scopeId));
  const identity = JSON.stringify([session?.user?.id, scopeKey, refreshRevision]);
  return <Summary key={identity} {...{ client, expectedUserId: session?.user?.id, scopeKey, eventHref }} />;
}

function Summary({ client, expectedUserId, scopeKey, eventHref }) {
  const [response, setResponse] = useState(null);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState('events');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [exportState, setExportState] = useState(null);
  const exporting = exportState?.client === client && exportState.revision === revision ? exportState.format : '';
  const [feedback, setFeedback] = useState(null);
  const activeExport = useRef(null);
  const current = response?.client === client && response.revision === revision ? response : null;
  const data = current?.data;

  useEffect(() => {
    const scope = JSON.parse(scopeKey);
    if (!scope) return undefined;
    const controller = new AbortController();
    loadFinancialSummary({ client, expectedUserId, scope, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResponse({ client, revision, data }); })
      .catch(error => { if (!controller.signal.aborted) setResponse({ client, revision, error: error.message }); });
    return () => { controller.abort(); activeExport.current?.abort(); activeExport.current = null; };
  }, [client, expectedUserId, scopeKey, revision]);

  if (scopeKey === 'null') return <section className="ap-section ap-live-loading"><h2>Finance report access is required</h2></section>;
  const filtered = data ? filteredFinancialSummary(data, view, query) : [];
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const eventView = view === 'events';

  async function download(format) {
    if (!data || activeExport.current || (format === 'csv' && !filtered.length)) return;
    const controller = new AbortController();
    activeExport.current = controller;
    const isCurrent = () => !controller.signal.aborted && activeExport.current === controller;
    const verify = () => verifyFinancialSummaryScope({ client, expectedUserId, scope: data.scope, reports: data.reports, signal: controller.signal });
    setExportState({ format, client, revision });
    setFeedback(null);
    try {
      await verify();
      if (!isCurrent()) return;
      const name = format === 'csv' ? `4m-${eventView ? 'event' : 'player'}-financial-summary.csv` : '4m-consolidated-financial-report.xlsx';
      let blob;
      if (format === 'csv') blob = new Blob([financialSummaryCsv(view, filtered)], { type: 'text/csv;charset=utf-8;' });
      else {
        const workbook = await buildFinancialSummaryWorkbook(data);
        const buffer = await workbook.xlsx.writeBuffer();
        blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        await verify();
      }
      if (isCurrent()) {
        downloadFinancialSummary(blob, name);
        setFeedback({ message: format === 'csv' ? `Downloaded ${filtered.length} filtered ${filtered.length === 1 ? 'row' : 'rows'}.` : `Downloaded the consolidated workbook for ${data.scope.label}.` });
      }
    } catch (error) {
      if (isCurrent()) setFeedback({ error: error.message || 'Could not prepare this report.' });
    } finally {
      if (activeExport.current === controller) {
        activeExport.current = null;
        if (!controller.signal.aborted) setExportState(null);
      }
    }
  }

  return <section className="fo-root">
    <header className="fo-heading"><div><p className="ap-kicker">Money / Finance reports</p><h1>Financial summary</h1><p>{data?.scope.label || 'Event entries and player receipts'}</p></div>
      <button type="button" className="ap-secondary" disabled={!current || !!exporting} onClick={() => { setFeedback(null); setRevision(value => value + 1); }}><RefreshCw size={16} /> Refresh report</button>
    </header>
    {!current && <section className="ap-section"><RecordLoading label="Loading the financial summary…" detail="Reading scoped event entries, receipts and refunds." /></section>}
    {current?.error && <section className="ap-section ap-live-loading" role="alert"><h2>The report could not be loaded</h2><p>{current.error}</p><button className="ap-secondary" onClick={() => setRevision(value => value + 1)}>Try again</button></section>}
    {data && <>
      <div className="fo-report-actions" role="group" aria-label="Summary report view">
        {['events', 'players'].map(mode => <button key={mode} type="button" className={`ap-${view === mode ? 'primary' : 'secondary'}`} aria-pressed={view === mode} disabled={!!exporting}
          onClick={() => { setView(mode); setPage(1); setFeedback(null); }}>{mode === 'events' ? 'Events' : 'Players'}</button>)}
      </div>
      <div className="fo-ledger-filters">
        <label className="fo-search"><Search size={16} aria-hidden="true" /><input aria-label={`Search ${view} report`} value={query} disabled={!!exporting}
          onChange={event => { setQuery(event.target.value); setPage(1); setFeedback(null); }} placeholder={eventView ? 'Search event, player or division…' : 'Search player or email…'} /></label>
        <button type="button" className="ap-secondary" onClick={() => download('csv')} disabled={!!exporting || !filtered.length}>
          <Download size={16} /> {exporting === 'csv' ? 'Preparing CSV…' : 'Export filtered CSV'}
        </button>
        <button type="button" className="ap-secondary" onClick={() => download('excel')} disabled={!!exporting}>
          <FileSpreadsheet size={16} /> {exporting === 'excel' ? 'Preparing Excel…' : 'Export consolidated Excel'}
        </button>
      </div>
      {feedback?.message && <p role="status">{feedback.message}</p>}
      {feedback?.error && <p role="alert">{feedback.error}</p>}
      <p className="fo-note">CSV follows this search across all pages. The consolidated workbook covers every event and player in {data.scope.label}.</p>
      <div className="fo-table-scroll" role="region" aria-label={eventView ? 'Event entries' : 'Player receipts'} tabIndex={0}>
        <table className="fo-detail-table"><thead><tr>{(eventView ? eventColumns : playerColumns).map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>{(eventView ? eventReportRow(row) : playerReportRow(row)).map((value, index) =>
            <td key={index}>{eventView && index === 2 ? <Link className="fo-type-link" to={eventHref(row.eventId)}>{value}</Link>
              : typeof value === 'number' ? formatter.format(value) : value || '—'}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {!filtered.length && <p role="status">No {eventView ? 'event entries' : 'players'} match this search.</p>}
      {pageCount > 1 && <nav className="fo-pagination" aria-label="Summary report pages">
        <span>Page {currentPage} of {pageCount}</span><button type="button" className="ap-secondary" disabled={currentPage === 1 || !!exporting} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <button type="button" className="ap-secondary" disabled={currentPage === pageCount || !!exporting} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>}
    </>}
  </section>;
}
