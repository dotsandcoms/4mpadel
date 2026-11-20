import { useEffect, useRef, useState } from 'react';
import EntityProfileReviewValue from './EntityProfileReviewValue';
import { loadEntityDecision, loadEntityDecisionTargets, saveEntityDecision } from './entityDecisions';

const options = [
  ['applications','application','Organisation applications','Review application'],
  ['sanctions','sanction','Event sanction requests','Review sanction'],
  ['amendments','amendment','Event amendments','Review amendment'],
];

function AmendmentChanges({ fields }) {
  return <dl>{Object.entries(fields).map(([field, { from, to }])=><div key={field}><dt>{field.replaceAll('_',' ')}</dt>
    <dd className="of-review-pair">
      <div><small>Current</small><EntityProfileReviewValue field={field} value={from}/></div>
      <div><small>Proposed</small><EntityProfileReviewValue field={field} value={to}/></div>
    </dd>
  </div>)}</dl>;
}

export default function EntityDecisionPanel({ kind, client, session, scopeId, entity, profileBusy, onBusyChange, onSaved }) {
  const [snapshot, setSnapshot] = useState(null);
  const [revision, setRevision] = useState(0);
  const [review, setReview] = useState(null);
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState({});
  const lifecycle = useRef(null);
  const attempt = useRef(false);
  const userId = session?.user?.id;

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, [client, kind, entity.id, userId, scopeId]);

  useEffect(() => {
    const controller = new AbortController();
    loadEntityDecisionTargets(client,kind,entity,{userId,scopeId,signal:controller.signal}).then(data=>{
      if (!controller.signal.aborted) setSnapshot({revision,data});
    }).catch(error=>{
      if (!controller.signal.aborted) setSnapshot({revision,error:error.message});
    });
    return () => controller.abort();
  },[client,kind,entity,userId,scopeId,revision]);

  async function inspect(action,target) {
    const signal = lifecycle.current?.signal;
    if (profileBusy || status.busy || signal?.aborted) return;
    attempt.current = false;
    setStatus({busy:true});
    setOutcome('');
    setNotes('');
    try {
      const item = await loadEntityDecision(client,kind,entity,action,target,{userId,scopeId,signal});
      if (!signal?.aborted) { setReview(item); setStatus({}); }
    } catch (error) {
      if (!signal?.aborted) setStatus({error:error.message});
    }
  }

  async function confirm() {
    const signal = lifecycle.current?.signal;
    if (!review || !outcome || profileBusy || status.busy || attempt.current || signal?.aborted) return;
    setStatus({busy:true});
    onBusyChange?.(true);
    try {
      const result = await saveEntityDecision(client,kind,entity,review,outcome,notes,{
        userId,scopeId,signal,onAttempt:()=>{attempt.current=true;},
      });
      if (!signal?.aborted) {
        setReview(null);
        setStatus({message:result.message});
        setRevision(value=>value+1);
        onSaved?.(result);
      }
    } catch (error) {
      if (!signal?.aborted) setStatus({error:error.message});
    } finally {
      onBusyChange?.(false);
    }
  }

  const data = snapshot?.revision === revision ? snapshot.data : null;
  if (!data && !snapshot?.error && !status.message) return <p role="status">Loading pending decisions…</p>;
  if (snapshot?.error) return <p role="alert">{snapshot.error} <button type="button" className="ap-secondary" onClick={()=>setRevision(value=>value+1)}>Retry decisions</button></p>;
  if (data?.reviewer === false) return null;
  const disabled = profileBusy || status.busy;
  const close = () => {
    setReview(null);
    setStatus({});
    setRevision(value=>value+1);
  };
  return <details className="of-related" open={review ? true : undefined}>
    <summary>Pending decisions ({data ? data.applications.length + data.sanctions.length + data.amendments.length : '…'})</summary>
    {status.message && <p className="of-notice" role="status">{status.message}</p>}
    {status.error && <p className="of-notice" role="alert">{status.error}</p>}
    {status.busy && !review && <p role="status">Checking review access…</p>}
    {review ? <section className="of-notice" aria-label="Decision review"><h3>{review.name}</h3>
      {review.action === 'application' && <p>Approve the organisation for public listing and grant the applicant owner access.</p>}
      {review.action === 'sanction' && <p>Approval publishes the sanctioned event.</p>}
      {review.action === 'amendment' && <><p>Review the proposed field changes. The current event stays live during review.</p>
        {review.approvalBlock && <p role="status">{review.approvalBlock}</p>}
        <AmendmentChanges fields={review.plan?.fields ?? Object.fromEntries(Object.entries(review.patch || {})
          .map(([field,to])=>[field,{from:review.row[field],to}]))}/>
        {review.plan?.divisions.length > 0 && <section aria-label="Division changes"><h4>Division changes</h4>
          {review.plan.divisions.map(({action,id,name,changes},index)=><div key={id ?? index}>
            <h5>{({add:'Add',update:'Update',remove:'Remove'})[action]} {name}</h5>
            {changes && <AmendmentChanges fields={changes}/>}
          </div>)}
        </section>}
      </>}
      <div className="of-decision-actions">
        <button type="button" className="ap-secondary" aria-pressed={outcome==='approve'} disabled={disabled || attempt.current || Boolean(review.approvalBlock)} onClick={()=>setOutcome('approve')}>Approve</button>
        <button type="button" className="ap-secondary" aria-pressed={outcome==='reject'} disabled={disabled || attempt.current} onClick={()=>setOutcome('reject')}>Reject</button>
      </div>
      {outcome==='reject' && <label className="of-decision-feedback"><span>Rejection feedback</span><textarea value={notes} maxLength={2000} disabled={disabled} onChange={e=>setNotes(e.target.value)}/></label>}
      <div className="of-decision-actions">
        <button type="button" className="ap-primary" disabled={disabled || attempt.current || !outcome || (outcome==='reject' && !notes.trim())} onClick={confirm}>
          {status.busy?'Saving decision…':outcome==='reject'?'Confirm rejection':'Confirm approval'}
        </button>
        <button type="button" className="ap-secondary" disabled={disabled} onClick={close}>{attempt.current?'Close and refresh':'Back to decisions'}</button>
      </div>
    </section> : data && options.map(([list,type,label,button])=><section className="of-decision-list" key={list}><h3>{label} ({data[list].length})</h3>
      {data[list].length ? <ul>{data[list].map(row=><li key={row.id}><span>{row.name || row.event_name}</span>
        <button type="button" className="ap-secondary" disabled={disabled} onClick={()=>inspect(type,row)}>{button}</button></li>)}</ul> : <p>No pending requests.</p>}
    </section>)}
  </details>;
}
