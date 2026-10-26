import React, { useEffect, useRef, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { applicationDecisionArguments, claimDecisionArguments, clubDecisionApi } from './clubDecisionRpc.js';
import { clubClaimDecisionArguments } from './clubManagementData.js';

// decisionApi is injectable for synthetic tests; production always uses the
// URL-and-build-flag-gated API above. No component prop can enable production.
export default function ClubApplicationDecision({ record, kind = 'application', client, scopeId, session, onSaved, onBusyChange, onCancel, decisionApi = clubDecisionApi }) {
  const [decision, setDecision] = useState('approved'), [notes, setNotes] = useState(''), [review, setReview] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false), [result, setResult] = useState(null);
  const generation = useRef(0), lock = useRef(false), latest = useRef(null);
  latest.current = { onBusyChange, onSaved, recordId: record?.id, userId: session?.user?.id, scopeId, client };
  useEffect(() => { generation.current++; setReview(null); setResult(null); setBlocked(false); setError(''); setNotes(''); setDecision('approved'); return () => { generation.current++; }; }, [record?.id, scopeId, session?.user?.id, client]);
  const enabled = decisionApi.enabled(client);
  const reviewedContacts = Array.isArray(review?.original?.contacts) ? review.original.contacts : [];
  const reviewedRecipient = kind === 'claim' ? review?.original?.requester_email : review?.original?.contact_email || (reviewedContacts.find(contact => contact?.is_primary) || reviewedContacts[0])?.email;
  const reviewDecision = async () => {
    if (lock.current || blocked) return;
    const token = generation.current; lock.current = true; setBusy(true); latest.current.onBusyChange?.(true);
    try {
      const original = kind === 'application' && enabled ? await decisionApi.load({ client, scopeId, userId: session?.user?.id, clubId: record.id }) : record;
      const args = kind === 'claim' ? (enabled ? claimDecisionArguments(original, decision, notes) : clubClaimDecisionArguments(original, decision, notes)) : applicationDecisionArguments(original, decision, notes);
      if (token === generation.current) { setReview({ original: structuredClone(original), args }); setError(''); }
    } catch (err) { if (token === generation.current) setError(err.message); }
    finally { lock.current = false; setBusy(false); latest.current.onBusyChange?.(false); }
  };
  const confirm = async () => {
    if (!enabled || !review || lock.current || blocked || result) return;
    const token = generation.current, identity = latest.current;
    const isCurrent = () => token === generation.current && latest.current.recordId === identity.recordId && latest.current.userId === identity.userId && latest.current.scopeId === identity.scopeId && latest.current.client === identity.client;
    lock.current = true; setBusy(true); latest.current.onBusyChange?.(true);
    try {
      const outcome = await decisionApi.submit({ client, scopeId, userId: session?.user?.id, kind, args: review.args, isCurrent });
      if (isCurrent()) { setResult(outcome); latest.current.onSaved?.(outcome); }
    } catch (err) { if (isCurrent()) { setError(`${err.message} Reload the record before trying again.`); setBlocked(true); } }
    finally { lock.current = false; setBusy(false); latest.current.onBusyChange?.(false); }
  };
  return <section className="clubs-draft" style={{ padding: 20, display: 'grid', gap: 16, minWidth: 0 }} aria-label={`${kind === 'claim' ? 'Claim' : 'Application'} decision`}>
    <h4 style={{ fontSize: 18, margin: 0 }}>{kind === 'claim' ? `Claim — ${record.full_name || record.requester_email}` : 'Application decision'}</h4>
    <p className="fo-note">{enabled ? 'Staging only. Confirming changes this staging record and queues a notification; it does not mean an email has been sent.' : 'Local preview only. No record, access or notification will change.'}</p>
    {result ? <p role="status">Decision {result.already_applied ? 'already recorded' : 'saved'}. {result.notification === 'not_requested' ? 'No notification was requested.' : 'Notification queued; delivery is not confirmed.'}</p> : <>
      <fieldset disabled={busy || blocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 16 }}>
        <label className="fo-status-filter">Decision<SearchableDropdown value={decision} onChange={event => { setDecision(event.target.value); setNotes(''); setReview(null); setError(''); }}><option value="approved">Approve {kind}</option><option value="rejected">Reject {kind}</option></SearchableDropdown></label>
        {decision === 'rejected' && <label className="clubs-feedback">Rejection feedback<textarea value={notes} maxLength={2000} rows={4} onChange={event => { setNotes(event.target.value); setReview(null); }}/></label>}
        <div className="fo-report-actions"><button type="button" className="ap-secondary" onClick={reviewDecision}>{busy ? 'Checking…' : enabled ? 'Review decision' : 'Review local decision'}</button>{onCancel && <button type="button" className="ap-secondary" onClick={onCancel}>Discard decision</button>}</div>
      </fieldset>
      {review && <div role="status" style={{ display: 'grid', gap: 16, lineHeight: 1.6 }}><dl style={{ margin: 0, overflowWrap: 'anywhere' }}>{kind === 'application' && <><dt>Reviewed club</dt><dd>{review.original.name}</dd></>}<dt>Recorded applicant</dt><dd>{reviewedRecipient || 'No applicant email recorded'}</dd></dl><p>{decision === 'approved' ? kind === 'claim' ? 'Grant owner access to the recorded claimant. Eligible unclaimed, draft or archived clubs will be published.' : 'Publish and verify this club. Owner access is assigned to its recorded applicant when an email is available.' : `Reject this ${kind}. Feedback: ${review.args.p_rejection_notes}`}</p>{enabled ? <button type="button" className="ap-primary" disabled={busy || blocked} onClick={confirm}>{busy ? 'Saving decision…' : 'Confirm staging decision'}</button> : <p>This is a preview only. No record has changed and no email has been queued or sent.</p>}</div>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
