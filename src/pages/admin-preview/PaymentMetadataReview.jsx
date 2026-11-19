import React, { useEffect, useMemo, useState } from 'react';
import { loadPaymentMetadataReview } from './paymentMetadataReview.js';
import { canReadFinanceOverview } from './financeOverviewData.js';

export default function PaymentMetadataReview({ paymentId, client, session, permissions, scopeId }) {
  const [retry, setRetry] = useState(0), [state, setState] = useState({});
  const token = useMemo(() => ({client, paymentId, userId:session?.user?.id, role:permissions?.role, scopeId, retry}), [client, paymentId, session?.user?.id, permissions?.role, scopeId, retry]);
  const allowed = canReadFinanceOverview(session, permissions, scopeId);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort(); setState({token,error:'Metadata loading timed out. Retry to read it again.'}); }, 30000);
    // The token contains every authority field this SELECT-only boundary uses.
    // Do not restart reads merely because a parent recreates its props objects.
    loadPaymentMetadataReview(token.client,{user:{id:token.userId}},{role:token.role},token.scopeId,token.paymentId,controller.signal).then(data => { if (!controller.signal.aborted) setState({token,data}); }).catch(error => { if (!controller.signal.aborted) setState({token,error:error.message}); }).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [token, allowed]);
  if (!allowed) return null;
  const current = state.token === token ? state : {}, data = current.data;
  return <section aria-label="Recorded coverage and classification"><h3>Recorded coverage & classification</h3><p className="fo-note">Checkout metadata can identify entries or licences covered for another player. It is recorded evidence, not proof of payment, active licence coverage, or organiser settlement. No current-price or amount-based assumptions are applied.</p>
    {current.error ? <div role="alert"><p>{current.error}</p><button className="ap-secondary" onClick={()=>setRetry(n=>n+1)}>Retry metadata</button></div> : !data ? <p role="status">Loading recorded coverage…</p> : <>
      {!!data.warnings.length && <ul className="fo-note" aria-label="Metadata warnings">{data.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>}
      {data.inheritedCovers && <p className="fo-note">The record says coverage was inherited from a sibling checkout. Review the original payment before taking action.</p>}
      <dl>{[['Source',data.source],['Registrant email',data.registrantEmail],['Event recorded in metadata',data.eventName],['Metadata event ID',data.eventId],['Division',data.division],['Paystack reference in metadata',data.paystackReference],['Original transaction reference',data.originalReference],['Recorded classification override',data.classification]].filter(([,value])=>value).map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd style={{margin:'0 0 12px',overflowWrap:'anywhere'}}>{value}</dd></React.Fragment>)}</dl>
      {data.covers.length ? <div className="fo-table-scroll" role="region" aria-label="Recorded payment coverage" tabIndex={0}><table className="fo-detail-table"><thead><tr><th>Recipient email</th><th>Coverage</th><th>Division / event</th><th>Licence kind / year</th></tr></thead><tbody>{data.covers.map((row,index)=><tr key={index}><td style={{overflowWrap:'anywhere'}}>{row.email || 'Not recorded'}</td><td>{row.type || 'Not recorded'}</td><td>{[row.division,row.eventId && `Event #${row.eventId}`].filter(Boolean).join(' · ') || 'Not recorded'}</td><td>{[row.license,row.licenseYear].filter(Boolean).join(' · ') || 'Not recorded'}</td></tr>)}</tbody></table></div> : <p>No per-recipient coverage list is recorded.</p>}
      {!!data.lineItems.length && <><h4>Recorded line items</h4><p className="fo-note">Individual recorded amounts only. They are not summed or used as a refund entitlement; annual licence revenue is not organiser settlement.</p><div className="fo-table-scroll" role="region" aria-label="Recorded payment line items" tabIndex={0}><table className="fo-detail-table"><thead><tr><th>Player</th><th>Type</th><th>Paid by</th><th>Recorded amount</th></tr></thead><tbody>{data.lineItems.map((row,index)=><tr key={index}><td>{row.player || 'Not recorded'}</td><td>{row.type || 'Not recorded'}</td><td>{row.paidBy || 'Not recorded'}</td><td>{row.amount == null ? 'Unavailable' : row.amount.toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>)}</tbody></table></div></>}
    </>}
  </section>;
}
