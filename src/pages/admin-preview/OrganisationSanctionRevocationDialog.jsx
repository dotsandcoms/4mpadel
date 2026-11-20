import { useEffect, useId, useState } from 'react';
import RecordLoading from './RecordLoading.jsx';
import { useEventOperation } from './useEventOperation.js';
import { loadOrganisationSanctionReview, saveOrganisationSanctionRevocation } from './organisationSanctionRevocation.js';

export default function OrganisationSanctionRevocationDialog({ client, session, scopeId, organisationId, event, onClose }) {
  const titleId = useId();
  const userId = session?.user?.id, eventId = event.id;
  const [loaded, setLoaded] = useState(null);
  const [reason, setReason] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [validation, setValidation] = useState('');
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, event, session, scopeId, onClose });

  useEffect(() => {
    const controller = new AbortController();
    loadOrganisationSanctionReview({ client, userId, scopeId, organisationId, eventId, signal: controller.signal })
      .then(review => { if (!controller.signal.aborted) setLoaded({ review }); })
      .catch(failure => { if (!controller.signal.aborted) setLoaded({ error: failure.message }); });
    return () => controller.abort();
  }, [client, userId, scopeId, organisationId, eventId]);

  function submit(submission) {
    submission.preventDefault();
    if (!reason.trim()) { setValidation('Enter rejection feedback.'); return; }
    if (reviewing) {
      void run(checks => saveOrganisationSanctionRevocation({
        client, userId, scopeId, organisationId, eventId, review: loaded.review, reason, ...checks,
      }));
    } else setReviewing(true);
  }

  return <dialog ref={bindDialog} className="ap-payment-dialog of-dialog" aria-labelledby={titleId}
    onCancel={submission => { submission.preventDefault(); close(); }}>
    <header><div><p>{loaded?.review?.record.event_name || event.event_name}</p><h2 id={titleId}>Revoke sanction</h2></div>
      <button type="button" className="ap-icon-button" aria-label="Close sanction review" disabled={busy} onClick={close}>×</button></header>
    <form onSubmit={submit}>
      {!loaded ? <RecordLoading label="Checking event sanction…" /> : loaded.error ? <p role="alert">{loaded.error}</p> : result ?
        <p role="status">{result.message}</p> : <>
          <p>Revoking sanction hides this event from the public calendar and records the feedback for the organisation.</p>
          {reviewing ? <dl className="ap-details-list">
            <div><dt>Organisation</dt><dd>{loaded.review.host.name}</dd></div>
            <div><dt>Notification recipient</dt><dd>{loaded.review.recipient || 'No email recorded'}</dd></div>
            <div><dt>Rejection feedback</dt><dd className="of-rejection-feedback">{reason.trim()}</dd></div>
          </dl> : <label className="of-decision-feedback">Rejection feedback<textarea required maxLength={2000} value={reason}
            onChange={change => { setReason(change.target.value); setValidation(''); }} /></label>}
        </>}
      {(validation || error) && <p role="alert">{validation || error}</p>}
      <footer><button className="ap-secondary" type="button" disabled={busy} onClick={close}>{result ? 'Done' : 'Cancel'}</button>
        {reviewing && !busy && !result && !error && <button className="ap-secondary" type="button" onClick={() => setReviewing(false)}>Back to feedback</button>}
        {loaded?.review && !result && <button type="submit" className={reviewing ? 'ap-danger-button' : 'ap-primary'} disabled={busy || Boolean(error)}>
          {busy ? 'Revoking sanction…' : reviewing ? 'Confirm sanction revocation' : 'Review revocation'}</button>}
      </footer>
    </form>
  </dialog>;
}
