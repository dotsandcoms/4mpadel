import { useId } from 'react';
import { saveRegistrationRefundReview } from './registrationRefundReview.js';
import { useEventOperation } from './useEventOperation.js';
import './EventPaymentDialog.css';

const amountFormat = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const resultLabels = {
  failed: 'Paystack reports that the refund failed.',
  needs_attention: 'Paystack requires additional information for this refund.',
  processing: 'Paystack is processing this refund.',
  processed: 'The refund is recorded as processed.',
};

export default function RegistrationRefundReview({ client, event, session, scopeId, row, refund, action, onClose }) {
  const titleId = useId();
  const retry = action === 'retry';
  const cash = ['cash', 'manual'].includes(refund._paymentMethod);
  const reference = refund.metadata?.reviewed_retry?.reference;
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, event, session, scopeId, onClose });
  const title = retry ? cash ? 'Record cash refund' : 'Retry failed refund' : 'Check Paystack status';
  const submit = form => {
    form.preventDefault();
    run(checks => saveRegistrationRefundReview({
      client, eventId: event.id, registration: row, refund, action, scopeId, expectedUserId: session?.user?.id, ...checks,
    }));
  };
  return <dialog ref={bindDialog} className="ap-payment-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>{event.event_name || event.title}</p><h2 id={titleId}>{title}</h2></div><button type="button" className="ap-icon-button" disabled={busy} onClick={close} aria-label="Close refund review">×</button></header>
    <form onSubmit={submit}>
      {result ? <p role="status">{resultLabels[result.status]}</p> : <>
        <p>{row.full_name || row.email} · {amountFormat.format(refund.amount)}</p>
        {!retry && reference && <p>Paystack refund reference <code>{reference}</code></p>}
        <p>{retry ? cash ? 'Confirm the cash refund has already been made before updating this record.' : 'Confirm a retry of this amount against the original payment.' : 'Look up the recorded refund reference and update its status if Paystack confirms it.'}</p>
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result ? 'Done' : error ? 'Close' : 'Cancel'}</button>
        {!result && <button type="submit" className="ap-primary" disabled={busy || !!error}>{busy ? 'Checking…' : retry ? cash ? 'Confirm cash refund' : 'Confirm refund retry' : 'Check status'}</button>}
      </footer>
    </form>
  </dialog>;
}
