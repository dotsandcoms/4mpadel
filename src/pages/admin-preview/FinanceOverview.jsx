import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, RotateCcw, WalletCards, RefreshCw, ShieldCheck, Search } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { canReadFinanceOverview, createFinanceLinkCache, loadFinanceOverview, financeOverview, financePeriod, financeDate } from './financeOverviewData.js';
import './FinanceOverview.css';
import MonthPicker from './MonthPicker.jsx';
import DatePicker from './DatePicker.jsx';
import { financeReportExcel } from './financeExport.js';
import { saveAs } from 'file-saver';
import FinanceTypeDetails from './FinanceTypeDetails.jsx';
import RecordLoading from './RecordLoading.jsx';

const money = cents => new Intl.NumberFormat('en-ZA', {style:'currency',currency:'ZAR'}).format(cents / 100);
export default function FinanceOverview({session, permissions, scopeId, client = supabase, refreshRevision = 0}) {
  const [state,setState] = useState({loading:true});
  const [reload,setReload] = useState(0);
  const [draft,setDraft] = useState({mode:'all',year:String(new Date().getFullYear()),month:financeDate(new Date().toISOString()).slice(0,7),from:'',to:''});
  const [period,setPeriod] = useState({filter:'',label:'All time'});
  const [periodError,setPeriodError] = useState('');
  const [exportStatus,setExportStatus] = useState('');
  const [exporting,setExporting] = useState(false);
  const [search,setSearch] = useState('');
  const [page,setPage] = useState(1);
  const [detailType,setDetailType] = useState(null);
  const [summaryView,setSummaryView] = useState(null);
  const allowed = canReadFinanceOverview(session,permissions,scopeId);
  const linkCache = useMemo(()=>createFinanceLinkCache(client,session,permissions,scopeId),[state.data,reload,refreshRevision,client,session?.user?.id,permissions?.role,scopeId]);
  const exportContext = useRef(null);
  useEffect(() => {
    const context = {active:allowed};
    exportContext.current = context;
    return () => { context.active=false; };
  }, [allowed,session?.user?.id,scopeId,client,refreshRevision,reload]);
  useEffect(() => {
    if (!allowed) { setState({loading:false}); return; }
    const controller = new AbortController();
    setState({loading:true}); setDetailType(null); setSummaryView(null); setExportStatus(''); setExporting(false);
    loadFinanceOverview(client,session,permissions,scopeId,controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({loading:false,data}); })
      .catch(error => { if (!controller.signal.aborted) setState({loading:false,error:error.message}); });
    return () => controller.abort();
  }, [allowed,session?.user?.id,reload,client,refreshRevision,scopeId,permissions?.role]);
  const result = useMemo(() => {
    if (!state.data) return null;
    try { return {...financeOverview(state.data.payments,state.data.refunds,period.filter), previous:period.previous ? financeOverview(state.data.payments,state.data.refunds,period.previous).totals : null}; }
    catch (error) { return {error:error.message}; }
  }, [state.data,period]);
  if (!allowed) return <section className="ap-section"><ShieldCheck aria-hidden="true"/><h1>Finance reports</h1><p>This first platform-wide overview is available to super admins in the All 4M Padel workspace. Event-scoped Finance reports are still being rebuilt.</p><p>No financial records have been requested by this screen.</p></section>;
  const error = state.error || result?.error;
  const rows = (result?.rows || []).filter(row => row.type.replaceAll('_',' ').toLowerCase().includes(search.trim().toLowerCase()));
  const pages = Math.max(1,Math.ceil(rows.length/5));
  const current = Math.min(page,pages);
  return <div className="fo-root">
    <header className="fo-heading"><div><p className="ap-kicker">Money / Finance reports</p><h1>Finance overview</h1><p>Successful payment receipts, less recorded refunds.</p></div><button className="ap-secondary" onClick={() => setReload(n=>n+1)} disabled={state.loading}><RefreshCw size={16}/> Refresh figures</button></header>
    <p className="fo-scope">All 4M Padel · Read-only · Payment ledger, not Paystack balance or organiser settlement</p>
    {state.loading ? <section className="ap-section"><RecordLoading label="Loading receipts and refunds…" detail="Reading recorded receipts and refunds for your finance reports. Larger histories may take longer."/></section> : error ? <section className="ap-section" role="alert"><h2>Figures could not be loaded</h2><p>{error}</p><button className="ap-secondary" onClick={()=>setReload(n=>n+1)}>Try again</button></section> : result && <>
      <form className="fo-period-panel" onSubmit={e=>{e.preventDefault();try {setPeriod(financePeriod(draft));setPeriodError('');setPage(1);} catch(error){setPeriodError(error.message);}}}>
        <div className="fo-toolbar"><label>Reporting period<SearchableDropdown value={draft.mode} onChange={e=>setDraft({...draft,mode:e.target.value})}><option value="all">All time</option><option value="year">Year</option><option value="month">Month on month</option><option value="range">Custom date range</option></SearchableDropdown></label>
          {draft.mode==='year' && <label>Year<SearchableDropdown value={draft.year} onChange={e=>setDraft({...draft,year:e.target.value})}>{[...new Set([draft.year,...result.years])].sort().reverse().map(y=><option key={y}>{y}</option>)}</SearchableDropdown></label>}
          {draft.mode==='month' && <MonthPicker value={draft.month} onChange={month=>setDraft({...draft,month})}/>}
          {draft.mode==='range' && <><DatePicker label="Start date" value={draft.from} onChange={from=>setDraft({...draft,from,to:draft.to && draft.to<from ? '' : draft.to})}/><DatePicker label="End date" value={draft.to} min={draft.from} onChange={to=>setDraft({...draft,to})}/></>}
          <button className="ap-primary" type="submit">Apply period</button>
        </div>
        {periodError && <p role="alert">{periodError}</p>}
        <p className="fo-note">South African dates, inclusive of both endpoints. Receipts use payment date; refunds use processed date, falling back to recorded date.</p>
      </form>
      <div className="fo-heading"><p className="fo-period-label" role="status">Showing {period.label}{period.previous ? ' · compared with the previous calendar month (full months, not month-to-date)' : ''}</p><div className="fo-report-actions" role="group" aria-label="Finance report actions"><button className="ap-secondary" type="button" disabled={exporting} onClick={async()=>{
        const context=exportContext.current;
        if(!context?.active)return;
        setExporting(true);
        try {
          const buffer=await financeReportExcel(result,period);
          if(!context.active)return;
          saveAs(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`4m-finance-${period.label.replace(/[^a-z0-9-]+/gi,'-').toLowerCase()}.xlsx`);
          setExportStatus(`Excel export prepared for ${period.label}. Includes all payment types, not just this page or search.`);
        } catch(error){if(context.active)setExportStatus(error.message);}
        finally {if(context.active)setExporting(false);}
      }}>{exporting ? 'Preparing Excel…' : 'Export Excel'}</button>
        <button type="button" className="ap-secondary" aria-expanded={detailType===undefined} onClick={()=>setDetailType(undefined)}>View combined ledger</button>
        <button type="button" className="ap-secondary" aria-expanded={summaryView==='player'} onClick={()=>setSummaryView('player')}>View player payments</button>
        <button type="button" className="ap-secondary" aria-expanded={summaryView==='event'} onClick={()=>setSummaryView('event')}>View event payments</button>
      </div></div>
      {exportStatus && <p className="fo-note" role="status">{exportStatus}</p>}
      <section key={`${JSON.stringify(period)}-${reload}`} className="fo-cards" aria-label="Finance totals">{[['Gross receipts',result.totals.gross,Banknote,'positive','gross'],['Recorded refunds',result.totals.refunds,RotateCcw,'refund','refunds'],['Net receipts',result.totals.net,WalletCards,'net','net']].map(([label,value,Icon,tone,field])=><article key={label} className={`fo-card fo-${tone}`}><h2>{label}</h2><strong>{money(value)}</strong>{result.previous && <div className="fo-comparison"><span>Previous month {money(result.previous[field])}</span><span>{value-result.previous[field]>=0?'+':'−'}{money(Math.abs(value-result.previous[field]))} change</span></div>}<Icon className="fo-watermark" aria-hidden="true"/></article>)}</section>
      <section className="ap-section fo-breakdown"><div className="fo-heading"><div><h2>Payment type breakdown</h2><p>{result.totals.count} successful payments in this period</p></div><label className="fo-search"><Search size={18} aria-hidden="true"/><input aria-label="Search payment types" placeholder="Search payment types…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label></div>
        <p className="fo-note">Matches the existing dashboard’s refund basis: all non-failed refunds, including pending refunds. Test payments are excluded. Types below are the recorded payment types, not inferred licence categories.</p>
        <div className="fo-table-scroll" tabIndex={0} role="region" aria-label="Payment type totals"><table><thead><tr><th scope="col">Payment type</th><th scope="col">Payments</th><th scope="col">Gross</th><th scope="col">Refunds</th><th scope="col">Net</th></tr></thead><tbody>{rows.slice((current-1)*5,current*5).map(row=><tr key={row.type}><th scope="row"><button type="button" className="fo-type-link" aria-expanded={detailType===row.type} onClick={()=>setDetailType(row.type)}>{row.type.replaceAll('_',' ')} <span aria-hidden="true">→</span></button></th><td>{row.count}</td><td>{money(row.gross)}</td><td>{money(row.refunds)}</td><td>{money(row.net)}</td></tr>)}</tbody></table></div>
        {!rows.length && <p role="status">{search ? 'No payment types match your search.' : 'No successful receipts or linked refunds in this period.'}</p>}
        <nav className="fo-pagination" aria-label="Payment type pages"><span role="status">{rows.length ? `${(current-1)*5+1}–${Math.min(current*5,rows.length)} of ${rows.length} types` : '0 types'}</span><button className="ap-secondary" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current} of {pages}</span><button className="ap-secondary" disabled={current===pages} onClick={()=>setPage(current+1)}>Next</button></nav>
      </section>
      {summaryView && <FinanceTypeDetails groupedSummary summaryKind={summaryView==='event' ? 'event':'player'} key={`${summaryView}-${JSON.stringify(period)}-${reload}`} data={state.data} linkCache={linkCache} period={period} client={client} session={session} permissions={permissions} scopeId={scopeId} onClose={()=>setSummaryView(null)}/>}
      {detailType!==null && <FinanceTypeDetails key={`${detailType}-${JSON.stringify(period)}-${reload}`} type={detailType} data={state.data} linkCache={linkCache} period={period} client={client} session={session} permissions={permissions} scopeId={scopeId} onClose={()=>setDetailType(null)}/>}
    </>}
  </div>;
}
