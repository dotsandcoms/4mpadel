import { useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { loadImportedParticipantPayment, saveImportedParticipantPayment } from './importedParticipantPayment.js';
import { useEventOperation } from './useEventOperation.js';
import './EventPaymentDialog.css';
import './ImportedParticipantDialog.css';

const rand = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

export default function ImportedParticipantPaymentDialog({
  client, event, participant, session, scopeId = 'all', onClose, onSaved, onBusyChange,
}) {
  const title = useId();
  const { bindDialog, busy, error, result, close, run } = useEventOperation({
    client, event, session, scopeId, onClose, onSaved, onBusyChange,
  });
  const [review, setReview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [note, setNote] = useState('');
  const eventId = event.id;
  const expectedUserId = session?.user?.id;
  useEffect(() => {
    const controller = new AbortController();
    loadImportedParticipantPayment({ client, eventId, participant, expectedUserId, scopeId, signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setReview(value); })
      .catch(issue => { if (!controller.signal.aborted) setLoadError(issue.message || 'The recorded payment could not be reviewed.'); });
    return () => controller.abort();
  }, [client, eventId, participant, expectedUserId, scopeId]);

  function submit(event) {
    event.preventDefault();
    if (!review) return;
    run(checks => saveImportedParticipantPayment({ client, eventId, participant, expectedUserId, scopeId, review, note, ...checks }));
  }

  const unmark = review?.action === 'unmark';
  return <dialog ref={bindDialog} className="ap-payment-dialog ap-imported-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); close(); }}>
    <header>
      <div><p>{event.event_name}</p><h2 id={title}>{review ? unmark ? 'Correct imported payment' : 'Mark entry paid' : 'Review recorded payment'}</h2></div>
      <button className="ap-icon-button" type="button" disabled={busy} onClick={close} aria-label="Close imported payment"><X size={20}/></button>
    </header>
    <form onSubmit={submit}>
      <div className="ap-payment-person">
        <strong>{review?.participant_name || participant.full_name}</strong>
        <span>{review?.division || participant.class_name || 'Division not recorded'}</span>
      </div>
      {loadError ? <p role="alert">{loadError}</p> : result ? <p role="status">
        {unmark ? 'Imported payment correction saved.' : 'Manual entry payment recorded.'} Close to refresh the participant list.
      </p> : review ? <>
        {review.is_test && <p role="status">Test participant</p>}
        {review.amount != null && <p className="ap-payment-amount">{rand.format(Number(review.amount))}</p>}
        {unmark ? <>
          <p>{review.has_manual_receipt
            ? 'Mark this participant unpaid and cancel the linked manual receipt.'
            : 'Mark this participant unpaid. The old manual flag has no matching receipt.'}</p>
          {review.resets_registration && <p>The linked registration will also return to unpaid.</p>}
          <p>Use the refund workflow if money must be returned.</p>
        </> : <p>Record a manual payment using the event entry fee. Confirm only after checking what was received.</p>}
        <label>{unmark ? 'Correction note (optional)' : 'Payment note (optional)'}
          <textarea maxLength={2000} disabled={busy || Boolean(error)} value={note} onChange={event => setNote(event.target.value)}/>
        </label>
        {error && <p role="alert">{error}</p>}
      </> : <p role="status">Checking the participant and recorded payments…</p>}
      <footer>
        <button className="ap-secondary" type="button" disabled={busy} onClick={close}>{result ? 'Done' : 'Close'}</button>
        {review && !result && <button className={unmark ? 'ap-danger' : 'ap-primary'} type="submit" disabled={busy || Boolean(error)}>
          {busy ? 'Saving…' : unmark ? 'Confirm correction' : 'Confirm payment'}
        </button>}
      </footer>
    </form>
  </dialog>;
}
