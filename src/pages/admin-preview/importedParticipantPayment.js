import { verifyImportedParticipantWrite } from './importedParticipantActions.js';

const matching = (row, eventId, id) =>
  String(row?.event_id) === String(eventId) && String(row?.participant_id) === String(id);

async function prepare({ client, eventId, participant, expectedUserId, scopeId = 'all', signal, isCurrent = () => true }) {
  if (!participant?.id || String(participant.event_id) !== String(eventId)) {
    throw new Error('Choose a participant in this event.');
  }
  const { event } = await verifyImportedParticipantWrite({ client, eventId, expectedUserId, scopeId, signal });
  if (event.is_manual === true) throw new Error('Use Registrations to review 4M-hosted event payments.');
  if (signal?.aborted || !isCurrent()) throw new Error('The workspace changed. Reopen this payment.');
  return { p_event_id: Number(eventId), p_participant_id: participant.id, p_scope: scopeId };
}

export async function loadImportedParticipantPayment(options) {
  const args = await prepare(options);
  let request = options.client.rpc('admin_review_imported_participant_payment', args);
  if (options.signal) request = request.abortSignal(options.signal);
  const { data, error } = await request;
  if (['PGRST202','42883'].includes(error?.code)) throw new Error('The imported payment service is unavailable.');
  if (error) throw error;
  if (!matching(data, args.p_event_id, args.p_participant_id)
    || !['mark','unmark'].includes(data.action) || !/^[a-f0-9]{64}$/.test(data.token)) {
    throw new Error('The imported payment review could not be confirmed.');
  }
  return data;
}

export async function saveImportedParticipantPayment({ review, note, onAttempt = () => {}, ...options }) {
  const args = await prepare(options);
  if (!matching(review, args.p_event_id, args.p_participant_id)
    || !['mark','unmark'].includes(review.action) || !/^[a-f0-9]{64}$/.test(review.token)) {
    throw new Error('Open a current payment review for this participant.');
  }
  const paymentNote = String(note ?? '').trim();
  if (paymentNote.length > 2000) throw new Error('Use up to 2,000 characters for the payment note.');
  onAttempt();
  const { data, error } = await options.client.rpc('admin_review_imported_participant_payment', {
    ...args, p_expected: review.token, p_note: paymentNote || null,
  });
  if (error) throw error;
  if (!matching(data, args.p_event_id, args.p_participant_id) || data.action !== review.action
    || data.is_paid !== (review.action === 'mark') || (review.action === 'mark' && !data.payment_id)
    || (review.has_manual_receipt && !data.payment_id) || data.registration_reset !== review.resets_registration) {
    throw new Error('The backend did not confirm this payment. Check the current status before trying again.');
  }
  return data;
}
