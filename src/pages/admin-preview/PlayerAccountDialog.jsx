import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Facts } from './PlayersWorkspace';
import RecordLoading from './RecordLoading';
import { dateLabel, directoryLicense } from './playersData';
import { deletePlayerProfile, readPlayerAccountPreview, sendPlayerLoginInvitation, sendPlayerRecoveryEmail, withPlayerActionDeadline } from './playerAccountActions';
import './PlayerAccountDialog.css';

export function PlayerAccountPreview({ player, client, userId, scopeId, onClose }) {
  const [state, setState] = useState({ loading: true });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readPlayerAccountPreview(client, player, { userId, scopeId, isCurrent: () => !controller.signal.aborted }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message || 'Could not load the player account preview.' }); });
    return () => controller.abort();
  }, [client, player, userId, scopeId, retry]);
  const { profile, entries, licenses } = state.data || {};
  return <Dialog title="Preview player account" onClose={onClose}>
    <div className="pp-action-form">
      <p className="pp-notice">Read-only view of the selected player’s 4M profile, registrations and recorded licences. You stay signed in as yourself.</p>
      {state.loading && <RecordLoading label="Checking access and loading the player account…" />}
      {state.error && <div role="alert"><p>{state.error}</p><button type="button" className="ap-secondary" onClick={() => { setState({ loading: true }); setRetry(value => value + 1); }}>Try again</button></div>}
      {profile && <>
        <h3>{profile.name || 'Player'}</h3>
        <Facts entries={[[ 'Home club', profile.home_club ], [ 'Region', profile.region ], [ 'Category', profile.category ], [ 'Rank', profile.rank_label ], [ 'Points', profile.points ], [ 'RankedIn ID', profile.rankedin_id ]]} />
        {profile.bio && <p className="pp-prose">{profile.bio}</p>}
        <section>
          <h3>4M event registrations</h3>
          {entries.length ? <ul>{entries.map(entry => <li key={entry.id}><b>{entry.event}</b> · {dateLabel(entry.date)}{entry.division && ` · ${entry.division}`} · {entry.payment || 'Payment status unavailable'}</li>)}</ul>
            : <p>No active 4M registrations are linked to this player.</p>}
        </section>
        <section>
          <h3>Licence status</h3>
          <p>{directoryLicense(profile).label}</p>
          {licenses.length > 0 && <ul>{licenses.map(licence => <li key={licence.id}>{licence.event_name || `Event ${licence.event_id}`} · {dateLabel(licence.event_date)}</li>)}</ul>}
        </section>
      </>}
      <footer className="pp-actions"><button type="button" className="ap-secondary" onClick={onClose}>Close</button></footer>
    </div>
  </Dialog>;
}

export default function PlayerAccountDialog(props) {
  if (props.action === 'Preview player account') return <PlayerAccountPreview {...props} />;
  return <ManagePlayerAccount {...props} />;
}

function ManagePlayerAccount({ action, player, client, userId, scopeId, onClose, onDeleted }) {
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [message, setMessage] = useState('');
  const context = useMemo(() => ({ active: true, client, userId, scopeId, playerId: player?.id }), [client, userId, scopeId, player?.id]), lock = useRef(false);
  useLayoutEffect(() => { context.active = true; return () => { context.active = false; }; }, [context]);
  const invite = action === 'Send login invite';
  const recovery = action === 'Reset password';
  const deletion = action === 'Delete player';
  const close = () => { if (!lock.current) onClose(); };
  const confirm = async () => {
    if (lock.current || attempted || !reviewed) return;
    lock.current = true; setBusy(true); setAttempted(true);
    try {
      const result = await withPlayerActionDeadline(guard => {
        if (invite) return sendPlayerLoginInvitation(client, player, guard);
        if (recovery) return sendPlayerRecoveryEmail(client, player, guard);
        if (deletion) return deletePlayerProfile(client, player, guard);
        throw new Error('Unknown account action.');
      }, { userId, scopeId, isCurrent: () => context.active });
      if (context.active && deletion) onDeleted?.(result);
      else if (context.active) setMessage(recovery ? 'Password reset requested. The player can follow the link in their inbox.'
        : 'Invitation requested. Check with the recipient before requesting another link.');
    } catch (error) { if (context.active) setMessage(error.message); }
    finally { lock.current = false; if (context.active) setBusy(false); }
  };
  return <Dialog title={action} onClose={close} busy={busy}><div className="pp-action-form">
    <h3>{player?.name || 'Player'}</h3>
    <p>{deletion ? 'Player' : 'Recipient'} <strong>{player?.email || player?.name || 'No email recorded'}</strong></p>
    <p>{invite ? 'Send a sign-in link to this address.'
      : recovery ? 'Send a private link so the player can choose a new password.'
        : 'Permanently delete this player profile. The account used to sign in is managed separately.'}</p>
    <label className="pp-account-confirmation"><input type="checkbox" checked={reviewed} disabled={busy || attempted} onChange={event => setReviewed(event.target.checked)} /> I verified the selected player</label>
    {message && <p role="status" className="pp-notice">{message}</p>}
    <footer className="pp-actions">
      <button className="ap-secondary" disabled={busy} onClick={close}>Close</button>
      <button type="button" className={deletion ? 'ap-danger-button' : 'ap-primary'} disabled={!reviewed || busy || attempted || (!deletion && !player?.email)} onClick={confirm}>
        {busy ? 'Please wait…' : deletion ? 'Delete player profile' : recovery ? 'Send password reset email' : 'Send login invite'}
      </button>
    </footer>
  </div></Dialog>;
}
