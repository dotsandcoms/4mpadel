import SearchableDropdown from "../../components/SearchableDropdown";
import RecordLoading from './RecordLoading.jsx';
import PaystackGateway from './PaystackGateway.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {saveAs} from 'file-saver';
import {recordedPaymentsExcel} from './paymentsExport.js';
import {supabase} from '../../supabaseClient';
import {canReadFinanceOverview,financeDate} from './financeOverviewData.js';
import {loadRecordedPaystackPayments,filterRecordedPayments,sortRecordedPayments} from './paymentsData.js';
import {financeStatusKey,financeStatusTone} from './financePresentation.js';
import DatePicker from './DatePicker.jsx';
import RecordedPaymentDetails from './RecordedPaymentDetails.jsx';
import './FinanceOverview.css';

function PaymentIdentity({row}) {
  const [failed,setFailed]=useState(false);
  const playerName=row.players?.name || (row.player_id!=null ? 'Player details unavailable':'No linked player');
  const eventName=row.calendar?.event_name || (row.event_id!=null ? 'Event details unavailable':'No linked event');
  return <div className="fo-player">
    {row.players?.image_url && !failed ? <img src={row.players.image_url} alt="" width="32" height="32" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/> : <span className="fo-avatar" aria-hidden="true">{row.players?.name?.slice(0,1) || '—'}</span>}
    <div className="fo-player-copy"><span className="fo-player-name">{playerName}</span><small>{eventName}</small><small>{row.player_id!=null && `Player #${row.player_id}`}{row.player_id!=null && row.event_id!=null && ' · '}{row.event_id!=null && `Event #${row.event_id}`}</small></div>
  </div>;
}

export default function PaymentsWorkspace(props) {
  const [view,setView]=useState('recorded');
  return <div><nav className="fo-report-actions" aria-label="Payment views" style={{marginBottom:24}}><button className="ap-secondary" aria-pressed={view==='recorded'} onClick={()=>setView('recorded')}>Recorded payments</button><button className="ap-secondary" aria-pressed={view==='gateway'} onClick={()=>setView('gateway')}>Paystack gateway</button></nav>{view==='gateway' ? <PaystackGateway {...props} client={props.client || supabase}/> : <RecordedPayments {...props}/>}</div>;
}

function RecordedPayments({session,permissions,scopeId,client=supabase,refreshRevision=0}) {
  const [state,setState]=useState({loading:true});
  const [reload,setReload]=useState(0);
  const [filters,setFilters]=useState({query:'',status:'',environment:'live',from:'',to:''});
  const [page,setPage]=useState(1);
  const [selectedPayment,setSelectedPayment]=useState(null);
  const [sort,setSort]=useState('date-desc');
  const [exporting,setExporting]=useState(false);
  const [exportStatus,setExportStatus]=useState('');
  const exportContext=useRef(null);
  const allowed=canReadFinanceOverview(session,permissions,scopeId);
  useEffect(()=>{
    const context={active:allowed};exportContext.current=context;
    setExporting(false);setExportStatus('');
    return ()=>{context.active=false;};
  },[allowed,session?.user?.id,permissions?.role,scopeId,client,reload,refreshRevision]);
  useEffect(()=>{
    if(!allowed)return;
    const controller=new AbortController();setState({loading:true});setSelectedPayment(null);
    const timeout=setTimeout(()=>{controller.abort();setState({error:'Loading took too long. Refresh to try again.'});},45000);
    loadRecordedPaystackPayments(client,session,permissions,scopeId,controller.signal,count=>{
      if(!controller.signal.aborted)setState({loading:true,loaded:count});
    })
      .then(rows=>{if(!controller.signal.aborted)setState({rows});})
      .catch(error=>{if(!controller.signal.aborted)setState({error:error.message});})
      .finally(()=>clearTimeout(timeout));
    return ()=>{clearTimeout(timeout);controller.abort();};
  },[allowed,client,session?.user?.id,permissions?.role,scopeId,reload,refreshRevision]);
  if(!allowed)return <section className="ap-section"><h1>Payments / Paystack</h1><p>This first batch requires super-admin access in All 4M Padel. Delegated Payments access is not yet enabled. No payment records have been requested.</p></section>;
  const invalid=filters.from && filters.to && filters.from>filters.to;
  const rows=invalid ? []:sortRecordedPayments(filterRecordedPayments(state.rows || [],filters),sort);
  const pages=Math.max(1,Math.ceil(rows.length/10)),current=Math.min(page,pages);
  const update=(key,value)=>{setFilters(f=>({...f,[key]:value}));setPage(1);setExportStatus('');};
  const exportPayments=async()=>{
    const context=exportContext.current;
    if(!context?.active || exporting || state.loading || state.error || invalid || !rows.length)return;
    setExporting(true);setExportStatus('');
    try {
      const buffer=await recordedPaymentsExcel(rows,{...filters,sort});
      if(!context.active)return;
      saveAs(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'4m-recorded-paystack-payments.xlsx');
      setExportStatus(`Excel prepared with ${rows.length} records using the filters selected when export started.`);
    } catch(error){if(context.active)setExportStatus(error.message);}
    finally{if(context.active)setExporting(false);}
  };
  const statuses=[...new Set((state.rows || []).map(row=>financeStatusKey(row.status)))].sort();
  return <section className="fo-root">
    <header className="fo-heading"><div><p className="ap-kicker">Money / Payments</p><h1>Payments / Paystack</h1><p>Review payment records stored in 4M.</p></div><div className="fo-report-actions"><button className="ap-secondary" disabled={state.loading || Boolean(state.error) || Boolean(invalid) || !rows.length || exporting} onClick={exportPayments}>{exporting ? 'Preparing Excel…':'Export Excel'}</button><button className="ap-secondary" disabled={state.loading} onClick={()=>setReload(n=>n+1)}>Refresh records</button></div></header>
    {exportStatus && <p role="status" className="fo-note">{exportStatus}</p>}
    <p className="fo-scope">Read-only · Recorded Paystack payments, not a live gateway balance or complete gateway history. Only records explicitly marked with payment method “paystack” are included.</p>
    <p className="fo-note">Gateway verification, single/bulk sync and refunds are not enabled in this preview yet. The existing admin remains unchanged. Legacy records with no test/live flag are available under “Unspecified”.</p>
    <div className="fo-ledger-filters">
      <label className="fo-search"><input aria-label="Search recorded payments" placeholder="Search player, event, reference, payment type or ID…" value={filters.query} onChange={e=>update('query',e.target.value)}/></label>
      <label className="fo-status-filter">Status<SearchableDropdown value={filters.status} onChange={e=>update('status',e.target.value)}><option value="">All statuses</option>{statuses.map(status=><option key={status} value={status}>{status}</option>)}</SearchableDropdown></label>
      <label className="fo-status-filter">Environment<SearchableDropdown value={filters.environment} onChange={e=>update('environment',e.target.value)}><option value="live">Live</option><option value="test">Test</option><option value="unknown">Unspecified</option><option value="all">All environments</option></SearchableDropdown></label>
    </div>
    <div className="fo-ledger-filters"><DatePicker label="Start date" value={filters.from} onChange={value=>update('from',value)}/><DatePicker label="End date" value={filters.to} onChange={value=>update('to',value)}/><label className="fo-status-filter">Sort by<SearchableDropdown value={sort} onChange={e=>{setSort(e.target.value);setPage(1);setExportStatus('');}}><option value="date-desc">Newest first</option><option value="date-asc">Oldest first</option><option value="amount-desc">Highest amount</option><option value="amount-asc">Lowest amount</option><option value="player-asc">Player A–Z</option><option value="player-desc">Player Z–A</option><option value="event-asc">Event A–Z</option><option value="event-desc">Event Z–A</option></SearchableDropdown></label><button className="ap-secondary" onClick={()=>{setFilters({query:'',status:'',environment:'live',from:'',to:''});setSort('date-desc');setPage(1);setExportStatus('');}}>Reset filters</button></div>
    {invalid && <p role="alert">End date must be on or after start date.</p>}
    {state.loading ? <RecordLoading label="Loading recorded payments…" count={state.loaded ?? 0} detail="Reading payments and linked player/event details in batches. The list will appear when loading is complete. Larger histories may take longer."/> : state.error ? <div role="alert"><p>Payments could not be loaded: {state.error}</p><button className="ap-secondary" onClick={()=>setReload(n=>n+1)}>Try again</button></div> : <>
      <p role="status">{rows.length} matching payment records · Amounts shown are recorded transaction amounts, not confirmed receipts for unsuccessful payments.</p>
      <div className="fo-table-scroll" role="region" aria-label="Recorded Paystack payments" tabIndex={0}><table className="fo-detail-table"><colgroup>{[12,23,32,10,10,13].map((width,index)=><col key={index} style={{width:`${width}%`}}/>)}</colgroup><thead><tr><th>Date</th><th>Reference / payment ID</th><th>Player / event</th><th>Status</th><th>Environment</th><th>Amount</th></tr></thead><tbody>{rows.slice((current-1)*10,current*10).map(row=><tr key={row.id}>
        <td>{financeDate(row.created_at) || 'Not recorded'}</td><td><button className="fo-type-link" onClick={()=>setSelectedPayment(row)}>{row.reference || `Payment #${row.id}`}</button><small className="fo-note" style={{display:'block'}}>Payment {row.id} · {row.payment_type || 'Unspecified type'} · View details →</small></td><td><PaymentIdentity key={`${row.player_id}-${row.players?.image_url}`} row={row}/></td>
        <td><span className={`ap-status ap-status--${financeStatusTone(row.status)}`}>{financeStatusKey(row.status)}</span></td><td>{row.is_test===true ? 'Test':row.is_test===false ? 'Live':'Unspecified'}</td><td>{row.amount!=null && Number.isFinite(Number(row.amount)) ? new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(Number(row.amount)):'Not recorded'}</td>
      </tr>)}</tbody></table></div>
      {!rows.length && !invalid && <p>No payments match these filters.</p>}
      <nav className="fo-pagination" aria-label="Recorded payment pages"><span>{rows.length ? (current-1)*10+1:0}–{Math.min(current*10,rows.length)} of {rows.length}</span><button className="ap-secondary" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current} of {pages}</span><button className="ap-secondary" disabled={current===pages} onClick={()=>setPage(current+1)}>Next</button></nav>
      {selectedPayment && <RecordedPaymentDetails key={`${selectedPayment.id}-${reload}`} payment={selectedPayment} client={client} session={session} permissions={permissions} scopeId={scopeId} onClose={()=>setSelectedPayment(null)}/>}
    </>}
  </section>;
}
