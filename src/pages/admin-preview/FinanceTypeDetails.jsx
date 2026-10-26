import SearchableDropdown from "../../components/SearchableDropdown";
import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {financeTypeEntries,loadFinancePaymentLinks,financeDate} from './financeOverviewData.js';
import {financeLedgerExcel} from './financeExport.js';
import {saveAs} from 'file-saver';
import {financeStatusTone,financeAmountTone,financeStatusKey,matchesFinanceStatus,sortFinanceRows} from './financePresentation.js';
import FinanceSortHeader from './FinanceSortHeader.jsx';
import FinancePaymentSummary from './FinancePaymentSummary.jsx';

const money=value=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(value/100);
function Player({profile,eventName}) {
  const [failed,setFailed]=useState(false);
  return <div className="fo-player">{profile?.image_url && !failed ? <img src={profile.image_url} alt="" width="32" height="32" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/> : <span className="fo-avatar" aria-hidden="true">{profile?.name?.slice(0,1) || '—'}</span>}<div className="fo-player-copy"><span className="fo-player-name">{profile?.name || 'No linked player'}</span><small>{eventName || 'No linked event'}</small></div></div>;
}
export default function FinanceTypeDetails({type,data,linkCache,period,client,session,permissions,scopeId,onClose,groupedSummary=false,summaryKind='player'}) {
  const typeLabel=type == null ? 'All payment types' : type.replaceAll('_',' ');
  const heading=useRef(null);
  const drawer=useRef(null);
  const titleId=useId();
  const mounted=useRef(false);
  const [exporting,setExporting]=useState(false);
  const [exportStatus,setExportStatus]=useState('');
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  const entries=useMemo(()=>financeTypeEntries(data.payments,data.refunds,type,period.filter),[data,type,period]);
  const [state,setState]=useState({loading:true});
  const [query,setQuery]=useState('');
  const [statusFilter,setStatusFilter]=useState('');
  const [page,setPage]=useState(1);
  const [sort,setSort]=useState({key:'date',direction:'desc'});
  const [retry,setRetry]=useState(0);
  const [selectedGroup,setSelectedGroup]=useState(null);
  const [summaryStatus,setSummaryStatus]=useState('');
  useEffect(()=>{
    const dialog=drawer.current;
    const trigger=document.activeElement;
    const previousOverflow=document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow='hidden';
    heading.current?.focus({preventScroll:true});
    return ()=>{
      dialog.close();
      document.body.style.overflow=previousOverflow;
      if(trigger?.isConnected)trigger.focus({preventScroll:true});
    };
  },[]);
  useEffect(()=>{
    const controller=new AbortController();setState({loading:true});
    const timeout=setTimeout(()=>{controller.abort();setState({error:'Loading took too long. Please try again or choose a shorter reporting period.'});},45000);
    loadFinancePaymentLinks(client,session,permissions,scopeId,entries.map(e=>e.paymentId),controller.signal,progress=>{
      if(!controller.signal.aborted)setState({loading:true,progress});
    },linkCache)
      .then(rows=>{if(!controller.signal.aborted)setState({links:new Map(rows.map(r=>[String(r.id),r]))});})
      .catch(error=>{if(!controller.signal.aborted)setState({error:error.message});})
      .finally(()=>clearTimeout(timeout));
    return ()=>{clearTimeout(timeout);controller.abort();};
  },[entries,client,session?.user?.id,permissions,scopeId,retry,linkCache]);
  const needle=query.trim().toLowerCase();
  const scopedEntries=selectedGroup ? entries.filter(e=>selectedGroup.paymentIds.has(String(e.paymentId))) : entries;
  const statuses=[...new Set(scopedEntries.map(e=>financeStatusKey(e.status)))].sort();
  const filtered=sortFinanceRows(scopedEntries.filter(e=>{if(!matchesFinanceStatus(e,statusFilter))return false;const link=state.links?.get(String(e.paymentId));return !needle || [e.paymentId,e.kind,e.status,e.paymentType,e.paymentType?.replaceAll('_',' '),link?.payment_method,link?.reference,link?.players?.name,link?.calendar?.event_name].some(v=>String(v || '').toLowerCase().includes(needle));}),sort);
  const pages=Math.max(1,Math.ceil(filtered.length/10));const current=Math.min(page,pages);
  return <dialog ref={drawer} className="fo-ledger-drawer" aria-labelledby={titleId} onKeyDown={e=>{
    if(e.key!=='Tab')return;
    const controls=[...e.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(!first){e.preventDefault();heading.current?.focus();return;}
    if(e.shiftKey && (document.activeElement===first || document.activeElement===heading.current)){e.preventDefault();last.focus();}
    else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
  }} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{
    if(e.target!==e.currentTarget)return;
    const rect=e.currentTarget.getBoundingClientRect();
    if(e.clientX<rect.left || e.clientX>rect.right || e.clientY<rect.top || e.clientY>rect.bottom)onClose();
  }}>
    <header className="fo-heading fo-drawer-header"><div><h2 id={titleId} ref={heading} tabIndex={-1}>{groupedSummary ? selectedGroup ? `${selectedGroup.name} — ledger` : summaryKind==='event' ? 'Event payments' : 'Player payments' : `${typeLabel} — ledger details`}</h2><p>{period.label} · Net {money(scopedEntries.filter(e=>matchesFinanceStatus(e,groupedSummary && !selectedGroup ? summaryStatus : statusFilter)).reduce((sum,e)=>sum+e.amount,0))}</p></div><button type="button" className="ap-icon-button" aria-label="Close ledger details" onClick={onClose}><X size={22} aria-hidden="true"/></button></header>
    <div className="fo-drawer-body">
    <p className="fo-note">Receipts and non-failed refunds are separate rows. Refunds link back to the original payment, which may be outside this period. Profile details are shown only where the payment has a linked player.</p>
    {state.loading ? <div role="status" aria-live="polite"><p>Loading payment details… {state.progress ? `${state.progress.completed.toLocaleString()} of ${state.progress.total.toLocaleString()} payments checked` : 'Preparing records'}</p><progress aria-label="Payment details loading progress" value={state.progress?.completed || 0} max={state.progress?.total || 1} style={{width:'100%',height:8,accentColor:'#56732b'}}/><p className="fo-note">Large date ranges take longer. You can close this panel to cancel; totals appear once all records are checked.</p></div> : state.error ? <div role="alert"><p>Linked details could not be loaded: {state.error}</p><button className="ap-secondary" onClick={()=>setRetry(n=>n+1)}>Try again</button></div> : <>
      {groupedSummary && <div hidden={Boolean(selectedGroup)}><FinancePaymentSummary kind={summaryKind} status={summaryStatus} onStatusChange={setSummaryStatus} entries={entries} links={state.links} period={period} onSelect={row=>{setSelectedGroup(row);setQuery('');setStatusFilter(summaryStatus);setPage(1);setExportStatus('');heading.current?.focus();drawer.current.querySelector('.fo-drawer-body').scrollTop=0;}}/></div>}
      {(!groupedSummary || selectedGroup) && <>
      {selectedGroup && <div><button className="ap-secondary" onClick={()=>{setSelectedGroup(null);setExportStatus('');heading.current?.focus();}}>← Back to {summaryKind} payments</button></div>}
      <div className="fo-ledger-filters">
        <label className="fo-search"><input aria-label="Search ledger details" placeholder="Search player, event, reference, type or method…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);setExportStatus('');}}/></label>
        <label className="fo-status-filter">Status<SearchableDropdown value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);setExportStatus('');}}><option value="">All statuses</option>{statuses.map(status=><option key={status} value={status}>{status.charAt(0).toUpperCase()+status.slice(1)}</option>)}</SearchableDropdown></label>
      </div>
      <div className="fo-heading">
        <p className="fo-note">{filtered.length} matching entries · Net {money(filtered.reduce((sum,e)=>sum+e.amount,0))}. Excel includes these results across all pages. Contains linked player names.</p>
        <button type="button" className="ap-secondary" disabled={exporting || !filtered.length} onClick={async()=>{
          setExporting(true);setExportStatus('');
          try {
            const buffer=await financeLedgerExcel(filtered,state.links,{type:typeLabel,period,query,status:statusFilter,player:selectedGroup ? `${selectedGroup.name} (${selectedGroup.key})` : undefined,scopeLabel:summaryKind==='event' ? 'Event scope':'Player scope'});
            if (!mounted.current) return;
            saveAs(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`4m-ledger-${typeLabel.replace(/[^a-z0-9-]+/gi,'-')}.xlsx`);
            setExportStatus(`Excel prepared with ${filtered.length} matching entries for ${period.label}.`);
          } catch(error) {if(mounted.current)setExportStatus(error.message);}
          finally {if(mounted.current)setExporting(false);}
        }}>{exporting ? 'Preparing Excel…' : 'Export ledger Excel'}</button>
      </div>
      {exportStatus && <p className="fo-note" role="status">{exportStatus}</p>}
      <div className="fo-table-scroll" role="region" aria-label="Receipts and refunds" tabIndex={0}>
        <table className="fo-detail-table">
          <colgroup><col style={{width:'14%'}}/><col style={{width:'32%'}}/><col style={{width:'13%'}}/><col style={{width:'27%'}}/><col style={{width:'14%'}}/></colgroup>
          <thead><tr><FinanceSortHeader label="Date" field="date" sort={sort} onSort={next=>{setSort(next);setPage(1);setExportStatus('');}}/><th scope="col">Player / event</th><th scope="col">Entry</th><th scope="col">Reference / method</th><FinanceSortHeader label="Amount" field="amount" sort={sort} onSort={next=>{setSort(next);setPage(1);setExportStatus('');}}/></tr></thead>
          <tbody>{filtered.slice((current-1)*10,current*10).map(entry=>{
            const link=state.links?.get(String(entry.paymentId));
            const date=financeDate(entry.date);
            return <tr key={entry.id}>
              <td>{date ? <time dateTime={date}>{date}</time> : 'Not recorded'}</td>
              <td>{link ? <Player profile={link.players} eventName={link.calendar?.event_name}/> : 'Payment link unavailable'}</td>
              <td>{entry.kind}<div className="fo-status-line"><span className={`ap-status ap-status--${financeStatusTone(entry.status)} fo-ledger-status`}>{entry.status || 'Not recorded'}</span></div>{type == null && <small>{entry.paymentType.replaceAll('_',' ')}</small>}</td>
              <td><span className="fo-reference">{link?.reference || String(entry.paymentId)}</span><small>{link?.payment_method || 'Method not recorded'}</small></td>
              <td className={`fo-entry-amount fo-amount--${financeAmountTone(entry.amount)}`}>{money(entry.amount)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {!filtered.length && <p role="status">No entries match your search and status filter.</p>}
      <nav className="fo-pagination" aria-label="Ledger detail pages"><span role="status">{filtered.length ? `${(current-1)*10+1}–${Math.min(current*10,filtered.length)} of ${filtered.length} entries`:'0 entries'}</span><button className="ap-secondary" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current} of {pages}</span><button className="ap-secondary" disabled={current===pages} onClick={()=>setPage(current+1)}>Next</button></nav>
      </>}
    </>}
    </div>
  </dialog>;
}
