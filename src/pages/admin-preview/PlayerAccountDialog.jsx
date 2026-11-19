import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from './PlayersWorkspace';
import { HELD_PLAYER_ACTIONS, sendPlayerLoginInvitation, withPlayerActionDeadline } from './playerAccountActions';
import './PlayerAccountDialog.css';

export default function PlayerAccountDialog({ action, player, client, userId, scopeId, onClose }) {
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [attempted, setAttempted] = useState(false), [message, setMessage] = useState('');
  const context = useMemo(() => ({ active: true, client, userId, scopeId, playerId: player?.id }), [client, userId, scopeId, player?.id]), lock = useRef(false);
  useLayoutEffect(() => { context.active = true; return () => { context.active = false; }; }, [context]);
  const invite = action === 'Send login invite';
  const close = () => { if (!lock.current) onClose(); };
  const send = async () => {
    if (lock.current || attempted || !reviewed) return;
    lock.current = true; setBusy(true); setAttempted(true);
    try {
      await withPlayerActionDeadline(guard => sendPlayerLoginInvitation(client, player, window.location.origin, guard), { userId, scopeId, isCurrent: () => context.active });
      if (context.active) setMessage('Invitation request accepted. Email delivery is not confirmed. Check with the recipient before requesting another link.');
    } catch (error) { if (context.active) setMessage(error.message); }
    finally { lock.current = false; if (context.active) setBusy(false); }
  };
  return <Dialog title={action} onClose={close} busy={busy}><div className="pp-action-form">
    <h3>{player?.name || 'Player'}</h3>
    {invite ? <><p>Recipient: <strong>{player?.email || 'No email recorded'}</strong></p><p>This requests a secure sign-in email. It may create a sign-in account if this address is new. It does not set a password or purchase a licence.</p><label className="pp-account-confirmation"><input type="checkbox" checked={reviewed} disabled={busy || attempted} onChange={e => setReviewed(e.target.checked)}/> I have checked the recipient and want to send this sign-in invitation.</label><p>The link returns to this site’s player profile page.</p></> : <p className="pp-notice">{HELD_PLAYER_ACTIONS[action]}</p>}
    {message && <p role="status" className="pp-notice">{message}</p>}
    {attempted && <p>Sending again is locked in this dialog. Reconcile the request before reopening.</p>}
    <footer className="pp-actions"><button className="ap-secondary" disabled={busy} onClick={close}>Close</button>{invite && <button className="ap-primary" disabled={!reviewed || busy || attempted || !player?.email} onClick={send}>{busy ? 'Requesting invitation…' : 'Send login invitation'}</button>}</footer>
  </div></Dialog>;
}
