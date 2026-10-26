import SearchableDropdown from "../../components/SearchableDropdown";
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {financePlayerSummary,financeEventSummary} from './financeOverviewData.js';
import {financeSummaryExcel} from './financeExport.js';
import {saveAs} from 'file-saver';
import {sortFinanceRows,financeStatusKey,matchesFinanceStatus} from './financePresentation.js';
import FinanceSortHeader from './FinanceSortHeader.jsx';

const money=value=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(value/100);
function Avatar({profile}) {
  const [failed,setFailed]=useState(false);
  return profile?.image_url && !failed
    ? <img src={profile.image_url} alt="" width="32" height="32" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>
    : <span className="fo-avatar" aria-hidden="true">{profile?.name?.slice(0,1) || '—'}</span>;
}
export default function FinancePaymentSummary({entries,links,period,onSelect,status='',onStatusChange,kind='player'}) {
  const label=kind==='event' ? 'Event' : 'Player';
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const [sort,setSort]=useState({key:'name',direction:'asc'});
  const [exporting,setExporting]=useState(false);
  const [exportStatus,setExportStatus]=useState('');
  const active=useRef(false);
  useEffect(()=>{active.current=true;return ()=>{active.current=false;};},[]);
  const groups=useMemo(()=>(kind==='event' ? financeEventSummary : financePlayerSummary)(entries.filter(entry=>matchesFinanceStatus(entry,status)),links),[entries,links,kind,status]);
  const completeGroups=useMemo(()=>new Map((kind==='event' ? financeEventSummary : financePlayerSummary)(entries,links).map(row=>[row.key,row])),[entries,links,kind]);
  const statuses=[...new Set(entries.map(entry=>financeStatusKey(entry.status)))].sort();
  const needle=query.trim().toLowerCase();
  const rows=sortFinanceRows(groups.filter(row=>[row.name,row.profile?.id,...row.paymentIds].some(value=>String(value || '').toLowerCase().includes(needle))),sort);
  const pages=Math.max(1,Math.ceil(rows.length/10));
  const current=Math.min(page,pages);
  return <div className="fo-player-summary">
    <p className="fo-note">{label}s with receipts or refunds in this period. Unlinked payments are listed separately, not assigned by name or email. Open a record to review and export its ledger.{kind==='event' && ' Includes all linked payment types, including licences—not just event entry fees. Net receipts are not organiser settlement or payouts.'}</p>
    <div className="fo-ledger-filters"><label className="fo-search"><input aria-label={`Search ${kind} payments`} placeholder={`Search ${kind} name, ${kind} ID or payment ID…`} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);setExportStatus('');}}/></label>
    <label className="fo-status-filter">Status<SearchableDropdown aria-label={`${label} summary status`} value={status} onChange={e=>{onStatusChange(e.target.value);setPage(1);setExportStatus('');}}><option value="">All statuses</option>{statuses.map(value=><option key={value} value={value}>{value.charAt(0).toUpperCase()+value.slice(1)}</option>)}</SearchableDropdown></label></div>
    <div className="fo-heading"><p className="fo-note">{rows.length} matching records · Net {money(rows.reduce((sum,row)=>sum+row.net,0))}. Totals and Excel reflect the selected status across all pages.</p><button type="button" className="ap-secondary" disabled={exporting || !rows.length} onClick={async()=>{
      setExporting(true);setExportStatus('');
      try {
        const buffer=await financeSummaryExcel(rows,{period,query,kind,status});
        if(!active.current)return;
        saveAs(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`4m-${kind}-payments-${period.label.replace(/[^a-z0-9-]+/gi,'-')}.xlsx`);
        setExportStatus(`Excel prepared with ${rows.length} records for ${period.label}.`);
      } catch(error){if(active.current)setExportStatus(error.message);}
      finally {if(active.current)setExporting(false);}
    }}>{exporting ? 'Preparing Excel…':`Export ${kind} summary Excel`}</button></div>
    {exportStatus && <p className="fo-note" role="status">{exportStatus}</p>}
    <div className="fo-table-scroll" role="region" aria-label={`${label} payment summary`} tabIndex={0}>
      <table><thead><tr>{[[label,'name'],['Receipts','count'],['Gross','gross'],['Refunds','refunds'],['Net','net']].map(([title,field])=><FinanceSortHeader key={field} label={title} field={field} sort={sort} onSort={next=>{setSort(next);setPage(1);setExportStatus('');}}/>)}</tr></thead>
        <tbody>{rows.slice((current-1)*10,current*10).map(row=><tr key={row.key}>
          <th scope="row"><button type="button" className="fo-type-link fo-player" onClick={()=>onSelect(completeGroups.get(row.key))}>{kind==='player' && <Avatar profile={row.profile}/>}<span className="fo-player-copy">{row.name}<small>{row.profile?.id!=null ? `${label} ID: ${row.profile.id}` : `Payment ID: ${[...row.paymentIds][0]}`} · View ledger →</small></span></button></th>
          <td>{row.count}</td><td>{money(row.gross)}</td><td>{money(row.refunds)}</td><td className="fo-entry-amount">{money(row.net)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {!rows.length && <p role="status">{query || status ? `No ${kind} payments match your filters.` : 'No receipts or refunds in this period.'}</p>}
    <nav className="fo-pagination" aria-label={`${label} payment pages`}><span role="status">{rows.length ? `${(current-1)*10+1}–${Math.min(current*10,rows.length)} of ${rows.length} records` : '0 records'}</span><button className="ap-secondary" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current} of {pages}</span><button className="ap-secondary" disabled={current===pages} onClick={()=>setPage(current+1)}>Next</button></nav>
  </div>;
}
