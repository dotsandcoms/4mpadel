import { useEffect, useRef, useState } from 'react';
import { Dialog, Facts } from './PlayersWorkspace';
import { dateLabel } from './playersData';
import { coachLink } from './coachesData';
import { saveCoachStatus } from './coachStatus';
import { parseCoachingLocation } from '../../components/CoachClubsPicker';
import CoachProfileEditForm from './CoachProfileEditForm';

export default function CoachApplicationDrawer({ row, client, scopeId, onClose, onSaved }) {
  const [decision, setDecision] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [blocked, setBlocked] = useState(false);
  const lock = useRef(false), mounted = useRef(false);
  const [editing, setEditing] = useState(false), [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const close = () => { if (!lock.current) onClose(); };
  const confirm = async () => {
    if (lock.current || blocked || !decision) return;
    lock.current = true; setBusy(true); setError('');
    try { const saved = await saveCoachStatus(client, row, decision, scopeId); if (mounted.current) { setDecision(''); onSaved(saved); } }
    catch (err) { if (mounted.current) { setError(err.message); setBlocked(true); } }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const revoking = row.status === 'approved' && decision === 'rejected';
  return <Dialog kicker="4M Padel · Coach profile" title={editing ? `Edit ${row.full_name || 'coach'}` : row.full_name || 'Coach profile'} className="co-profile-dialog" busy={busy} onClose={close}>
    {editing ? <CoachProfileEditForm row={row} client={client} scopeId={scopeId} onCancel={() => { if (!lock.current) setEditing(false); }} onBusyChange={value => { lock.current = value; setBusy(value); }} onSaved={saved => { setEditing(false); setPhotoFailed(false); onSaved(saved); }}/> : <div className="co-panel co-profile-layout">
      <aside className="co-profile-summary">
        {coachLink(row.profile_pic_url) && !photoFailed ? <img className="co-profile-portrait" src={coachLink(row.profile_pic_url)} alt={`${row.full_name || 'Coach'} profile`} width={160} height={160} onError={() => setPhotoFailed(true)}/> : <span className="co-profile-placeholder" aria-hidden="true">{(row.full_name || '?').slice(0, 1)}</span>}
        <span className={`ap-status ap-status--${({ approved: 'positive', pending: 'warning', rejected: 'danger' })[row.status] || 'neutral'}`}>{row.status || 'Not recorded'}</span>
        <button type="button" className="ap-primary" disabled={busy || blocked} onClick={() => { setDecision(''); setEditing(true); }}>Edit coach profile</button>
        <p>Applied {dateLabel(row.created_at)}</p>
        <div className="co-links">{[['Website', row.website_link], ['Instagram', row.instagram_link], ['YouTube', row.youtube_link]].map(([label, value]) => coachLink(value) && <a className="ap-secondary" key={label} href={coachLink(value)} target="_blank" rel="noreferrer">{label} ↗</a>)}</div>
      </aside>
      <div className="co-profile-content"><section className="co-profile-section"><h3>Contact & location</h3><Facts entries={[["Email", row.email], ['Phone', row.contact_number], ['Gender', row.gender], ['City', row.city]]}/></section>
      <section className="co-profile-section"><h3>Clubs I coach at</h3><div className="co-club-chips">{parseCoachingLocation(row.coaching_location).map(name => <span key={name}>{name}</span>)}{!row.coaching_location && <p>No clubs recorded.</p>}</div></section>
      <section className="co-profile-section co-about"><h3>About the coach</h3><div className="co-bio">{String(row.bio || '').trim() ? String(row.bio).split(/\r?\n\s*\r?\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>) : <p>No biography recorded.</p>}</div></section>
      <section className="co-decision" aria-label="Application decision">
        <h3>{row.status === 'approved' ? 'Approval status' : 'Application decision'}</h3>
        {error && <p role="alert" className="pp-notice">{error}</p>}
        {decision ? <><p>{revoking ? 'Revoke approval for' : decision === 'approved' ? 'Approve' : 'Reject'} {row.full_name || 'this coach'}?</p><p>{revoking ? 'This changes the existing application status from approved to rejected. The coach will no longer be listed as approved.' : 'This saves the application status to the existing coach record.'}</p><div className="co-links"><button type="button" className="ap-secondary" disabled={busy || blocked} onClick={() => setDecision('')}>Back</button><button type="button" className={decision === 'rejected' ? 'ap-danger-button' : 'ap-primary'} disabled={busy || blocked} onClick={confirm}>{busy ? 'Saving…' : revoking ? 'Confirm revoke approval' : decision === 'approved' ? 'Confirm approval' : 'Confirm rejection'}</button></div></> : row.status === 'approved' ? <><p>This coach is approved.</p><details className="co-status-management"><summary>Manage approval</summary><p>Only revoke approval if this coach should no longer be approved.</p><button type="button" className="ap-danger-button" disabled={blocked} onClick={() => setDecision('rejected')}>Revoke approval</button></details></> : <div className="co-links"><button type="button" className="ap-primary" disabled={blocked} onClick={() => setDecision('approved')}>Approve application</button>{row.status !== 'rejected' && <button type="button" className="ap-danger-button" disabled={blocked} onClick={() => setDecision('rejected')}>Reject application</button>}</div>}
      </section>
      </div>
    </div>}
  </Dialog>;
}
