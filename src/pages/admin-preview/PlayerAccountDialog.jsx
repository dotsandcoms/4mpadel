import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from './PlayersWorkspace';
import { deletePlayerProfile, HELD_PLAYER_ACTIONS, sendPlayerLoginInvitation, sendPlayerRecoveryEmail, withPlayerActionDeadline } from './playerAccountActions';
import './PlayerAccountDialog.css';

export default function PlayerAccountDialog({ action, player, client, userId, scopeId, onClose, onDeleted }) {
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [message, setMessage] = useState('');
  const context = useMemo(() => ({ active: true, client, userId, scopeId, playerId: player?.id }), [client, userId, scopeId, player?.id]), lock = useRef(false);
  useLayoutEffect(() => { context.active = true; return () => { context.active = false; }; }, [context]);
  const invite = action === 'Send login invite';
  const recovery = action === 'Reset password';
  const deletion = action === 'Delete player';
  const enabled = invite || recovery || deletion;
  const close = () => { if (!lock.current) onClose(); };
  const confirm = async () => {
    if (lock.current || attempted || !reviewed) return;
    lock.current = true; setBusy(true); setAttempted(true);
    try {
      const result = await withPlayerActionDeadline(guard => {
        if (invite) return sendPlayerLoginInvitation(client, player, window.location.origin, guard);
        if (recovery) return sendPlayerRecoveryEmail(client, player, guard);
        return deletePlayerProfile(client, player, guard);
      }, { userId, scopeId, isCurrent: () => context.active });
      if (context.active && deletion) onDeleted?.(result);
      else if (context.active) setMessage(recovery ? 'Password reset requested. The player can follow the link in their inbox.'
        : 'Invitation requested. Check with the recipient before requesting another link.');
    } catch (error) { if (context.active) setMessage(error.message); }
    finally { lock.current = false; if (context.active) setBusy(false); }
  };
  return <Dialog title={action} onClose={close} busy={busy}><div className="pp-action-form">
    <h3>{player?.name || 'Player'}</h3>
    {enabled ? <>
      <p>{deletion ? 'Player' : 'Recipient'} <strong>{player?.email || player?.name || 'No email recorded'}</strong></p>
      <p>{invite ? 'Send a sign-in link to this address.'
        : recovery ? 'Send a private link so the player can choose a new password.'
          : 'Permanently delete this player profile. The account used to sign in is managed separately.'}</p>
      <label><input type="checkbox" checked={reviewed} disabled={busy || attempted} onChange={event => setReviewed(event.target.checked)} /> I verified the selected player</label>
    </> : <p>{HELD_PLAYER_ACTIONS[action]}</p>}
    {message && <p role="status" className="pp-notice">{message}</p>}
    <footer className="pp-actions">
      <button className="ap-secondary" disabled={busy} onClick={close}>Close</button>
      {enabled && <button className={deletion ? 'ap-danger-button' : 'ap-primary'} disabled={!reviewed || busy || attempted || (!deletion && !player?.email)} onClick={confirm}>
        {busy ? 'Please wait…' : deletion ? 'Delete player profile' : recovery ? 'Send password reset email' : 'Send login invite'}
      </button>}
    </footer>
  </div></Dialog>;
}
