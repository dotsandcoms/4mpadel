import { useId } from 'react';
import { X } from 'lucide-react';
import { alignRegistrationProfile } from './registrationProfileName.js';
import { useEventOperation } from './useEventOperation.js';
import './EventPaymentDialog.css';

export default function RegistrationProfileNameDialog({ client, event, registration, session, scopeId = 'all', onClose }) {
  const title = useId();
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, event, session, scopeId, onClose });
  const player = registration._player;
  function confirm(form) {
    form.preventDefault();
    run(checks => alignRegistrationProfile({
      client, event, registration, expectedUserId: session?.user?.id, scopeId, ...checks,
    }));
  }
  return <dialog ref={bindDialog} className="ap-payment-dialog" aria-labelledby={title}
    onCancel={form => { form.preventDefault(); close(); }}>
    <header>
      <div><p>{event.event_name}</p><h2 id={title}>Match profile name</h2></div>
      <button type="button" className="ap-icon-button" disabled={busy} onClick={close} aria-label="Close profile name review"><X size={20}/></button>
    </header>
    <form onSubmit={confirm}>
      {result ? <p role="status">The registration now uses {result.full_name}.</p> : <>
        <div className="ap-payment-person"><strong>{registration.full_name}</strong><span>{registration.email}</span></div>
        <p>Use the name <strong>{player.name}</strong> from the player profile with this email.</p>
        {error && <p role="alert">{error}</p>}
      </>}
      <footer>
        <button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result ? 'Done' : 'Cancel'}</button>
        {!result && <button type="submit" className="ap-primary" disabled={busy || Boolean(error)}>
          {busy ? 'Saving…' : 'Confirm profile name'}
        </button>}
      </footer>
    </form>
  </dialog>;
}
