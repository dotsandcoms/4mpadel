import React,{useEffect,useId,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {loadRecordedRefunds,recordedRefundReason} from './paymentsData.js';
import {financeDate} from './financeOverviewData.js';
import {financeStatusKey,financeStatusTone} from './financePresentation.js';
import PaymentMetadataReview from './PaymentMetadataReview.jsx';

const money=value=>value!=null && String(value).trim()!=='' && Number.isFinite(Number(value)) ? new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(Number(value)):'Not recorded';
export default function RecordedPaymentDetails({payment,client,session,permissions,scopeId,onClose}) {
  const drawer=useRef(null),heading=useRef(null),titleId=useId();
  const [state,setState]=useState({loading:true}),[retry,setRetry]=useState(0),[page,setPage]=useState(1);
  useEffect(()=>{
    const dialog=drawer.current,trigger=document.activeElement,overflow=document.body.style.overflow;
    dialog.showModal();document.body.style.overflow='hidden';heading.current.focus({preventScroll:true});
    return ()=>{dialog.close();document.body.style.overflow=overflow;if(trigger?.isConnected)trigger.focus({preventScroll:true});};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();setState({loading:true});
    const timeout=setTimeout(()=>{controller.abort();setState({error:'Loading took too long. Please try again.'});},45000);
    loadRecordedRefunds(client,session,permissions,scopeId,payment.id,controller.signal)
      .then(rows=>{if(!controller.signal.aborted)setState({rows});})
      .catch(error=>{if(!controller.signal.aborted)setState({error:error.message});})
      .finally(()=>clearTimeout(timeout));
    return ()=>{clearTimeout(timeout);controller.abort();};
  },[client,session?.user?.id,permissions?.role,scopeId,payment.id,retry]);
  const rows=state.rows || [],pages=Math.max(1,Math.ceil(rows.length/10)),current=Math.min(page,pages);
  return <dialog className="fo-ledger-drawer" ref={drawer} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{
    if(e.target!==e.currentTarget)return;const rect=e.currentTarget.getBoundingClientRect();
    if(e.clientX<rect.left || e.clientX>rect.right || e.clientY<rect.top || e.clientY>rect.bottom)onClose();
  }} onKeyDown={e=>{
    if(e.key!=='Tab')return;
    const controls=[...e.currentTarget.querySelectorAll('button:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(e.shiftKey && (document.activeElement===first || document.activeElement===heading.current)){e.preventDefault();last?.focus();}
    else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
  }}>
    <header className="fo-heading fo-drawer-header"><div><h2 id={titleId} ref={heading} tabIndex={-1}>Payment details</h2><p style={{overflowWrap:'anywhere'}}>{payment.reference || `Payment #${payment.id}`}</p></div><button className="ap-icon-button" aria-label="Close payment details" onClick={onClose}><X size={22}/></button></header>
    <div className="fo-drawer-body" style={{gridAutoRows:'max-content'}}>
      <p className="fo-note">Read-only 4M record · No gateway verification, sync or refund action is performed.</p>
      <dl style={{display:'grid',gridTemplateColumns:'minmax(110px, 1fr) minmax(0, 3fr)',gap:'12px 24px',margin:0,overflowWrap:'anywhere'}}>{[
        ['Player',payment.players?.name || (payment.player_id!=null ? 'Player details unavailable':'No linked player')],
        ['Event',payment.calendar?.event_name || (payment.event_id!=null ? 'Event details unavailable':'No linked event')],
        ['Payment ID',payment.id],['Recorded date',financeDate(payment.created_at) || 'Not recorded'],
        ['Payment type',payment.payment_type || 'Not recorded'],['Environment',payment.is_test===true ? 'Test':payment.is_test===false ? 'Live':'Unspecified'],
        ['Recorded amount',money(payment.amount)],
      ].map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd style={{margin:0}}>{value}</dd></React.Fragment>)}<dt>Status</dt><dd style={{margin:0}}><span className={`ap-status ap-status--${financeStatusTone(payment.status)}`}>{financeStatusKey(payment.status)}</span></dd></dl>
      <PaymentMetadataReview paymentId={payment.id} client={client} session={session} permissions={permissions} scopeId={scopeId}/>
      <h3>Recorded refund history</h3><p className="fo-note">All recorded statuses for this payment, across all dates. Pending or failed refunds are not confirmed money returned. This is not a gateway reconciliation or refundable-balance calculation.</p>
      {state.loading ? <p role="status">Loading refund history…</p>:state.error ? <div role="alert"><p>Refund history unavailable: {state.error}</p><button className="ap-secondary" onClick={()=>setRetry(n=>n+1)}>Try again</button></div>:!rows.length ? <p>No refund records returned for this payment.</p>:<>
        <div className="fo-table-scroll" role="region" aria-label="Payment refund history" tabIndex={0}><table className="fo-detail-table"><thead><tr><th>Refund / references</th><th>Reason</th><th>Created</th><th>Processed</th><th>Status</th><th>Recorded amount</th></tr></thead><tbody>{rows.slice((current-1)*10,current*10).map(row=><tr key={row.id}><td style={{overflowWrap:'anywhere'}}><strong>{row.id}</strong><small style={{display:'block'}}>Paystack refund: {row.paystack_refund_id || 'Not recorded'}</small><small style={{display:'block'}}>Original transaction: {row.paystack_reference || 'Not recorded'}</small></td><td>{recordedRefundReason(row.reason)}</td><td>{financeDate(row.created_at) || 'Not recorded'}</td><td>{financeDate(row.processed_at) || 'Not recorded'}</td><td><span className={`ap-status ap-status--${financeStatusTone(row.status)}`}>{financeStatusKey(row.status)}</span></td><td>{money(row.amount)}</td></tr>)}</tbody></table></div>
        <nav className="fo-pagination" aria-label="Refund history pages"><span>{rows.length} refund records · Page {current} of {pages}</span><button className="ap-secondary" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><button className="ap-secondary" disabled={current===pages} onClick={()=>setPage(current+1)}>Next</button></nav>
      </>}
    </div>
  </dialog>;
}
