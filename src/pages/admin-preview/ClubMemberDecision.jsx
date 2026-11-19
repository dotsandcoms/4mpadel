import React, { useEffect, useRef, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { clubMemberApi, clubMemberArguments, CLUB_MEMBER_ROLES } from './clubMemberRpc.js';

export default function ClubMemberDecision({ record, ownerCount, client, session, scopeId, onBusyChange, onSaved, onCancel, memberApi = clubMemberApi }) {
  const [action, setAction] = useState('change_role'), [role, setRole] = useState(record.role), [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false), [blocked, setBlocked] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null);
  const generation = useRef(0), lock = useRef(false), latest = useRef(null);
  latest.current = { record, client, scopeId, userId: session?.user?.id, onBusyChange, onSaved };
  useEffect(() => { generation.current++; setReview(null); setResult(null); setBlocked(false); setError(''); setAction('change_role'); setRole(record.role); return () => { generation.current++; }; }, [record, client, scopeId, session?.user?.id]);
  const enabled = memberApi.enabled(client);
  const reviewChange = () => {
    if (lock.current || blocked) return;
    try { setReview(clubMemberArguments(record, action, role, crypto.randomUUID())); setError(''); } catch (err) { setError(err.message); }
  };
  const confirm = async () => {
    if (!enabled || !review || lock.current || blocked || result) return;
    const token = generation.current, identity = latest.current;
    const isCurrent = () => token === generation.current && latest.current.record === identity.record && latest.current.client === identity.client && latest.current.scopeId === identity.scopeId && latest.current.userId === identity.userId;
    lock.current = true; setBusy(true); latest.current.onBusyChange?.(true);
    try {
      const outcome = await memberApi.submit({ client, scopeId, userId: session?.user?.id, args: review, isCurrent });
      if (isCurrent()) { setResult(outcome); latest.current.onSaved?.(outcome); }
    } catch (err) { if (isCurrent()) { setError(`${err.message} Reload members before trying again.`); setBlocked(true); } }
    finally { lock.current = false; setBusy(false); latest.current.onBusyChange?.(false); }
  };
  return <section className="clubs-draft" aria-label="Member access review" style={{ padding: 20, display: 'grid', gap: 16, minWidth: 0, overflowWrap: 'anywhere' }}>
    <h4 style={{ fontSize: 18, margin: 0 }}>Manage member — {record.players?.name || record.user_email}</h4>
    <p className="fo-note">{enabled ? 'Staging only. Review the access change before confirming. No email is sent.' : 'Local review preview only. No member access will change and no email is sent.'}</p>
    {result ? <p role="status">{result.removed ? 'Member removed from this club.' : 'Member role updated.'} No email was sent.</p> : <>
      <fieldset disabled={busy || blocked} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 16, minWidth: 0 }}>
        <label className="fo-status-filter">Member action<SearchableDropdown value={action} onChange={event => { setAction(event.target.value); setReview(null); }}><option value="change_role">Change role</option><option value="remove">Remove member</option></SearchableDropdown></label>
        {action === 'change_role' && <label className="fo-status-filter">New role<SearchableDropdown value={role} onChange={event => { setRole(event.target.value); setReview(null); }}>{CLUB_MEMBER_ROLES.map(value => <option key={value} value={value}>{value}</option>)}</SearchableDropdown></label>}
        <button type="button" className="ap-secondary" onClick={reviewChange}>Review member change</button>
      </fieldset>
      {review && <div role="status" style={{ display: 'grid', gap: 16 }}><p><strong>{review.p_expected_member.user_email || 'Member without a recorded email'}</strong><br/>{review.p_action === 'remove' ? `Remove this ${review.p_expected_member.role} membership from this club. The player account is not deleted.` : `Change this member’s role from ${review.p_expected_member.role} to ${review.p_role}.`}</p>
        {record.role === 'owner' && ownerCount <= 1 && (action === 'remove' || role !== 'owner') && <p className="fo-note">Warning: this is the last recorded owner. This change will leave this club without an owner unless another owner has been added since this list loaded.</p>}
        {enabled ? <button type="button" className={action === 'remove' ? 'ap-danger-button' : 'ap-primary'} disabled={busy || blocked} onClick={confirm}>{busy ? 'Saving member change…' : 'Confirm staging member change'}</button> : <p>Preview only — nothing has been saved.</p>}
      </div>}
    </>}
    {error && <p role="alert">{error}</p>}
    <button type="button" className="ap-secondary" disabled={busy} onClick={() => onCancel?.(blocked)}>{blocked ? 'Close and reload members' : result ? 'Close member review' : 'Discard member change'}</button>
  </section>;
}
