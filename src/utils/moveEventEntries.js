import { hasVerifiedPaymentEntryTransfers, normalizePaymentMetadata } from './paymentRegistrationMatch.js';
import { registrationMatchesDivision, resolveRegistrationDivision } from './registrationDivision.js';

const normEmail = value => String(value || '').trim().toLowerCase();
const fmtR = n => 'R ' + Number(n || 0).toLocaleString('en-ZA');

export async function moveEventEntries({ supabase, event, registrations, payments, divisions, moveTarget, playersToMove, targetDiv, sendEmail, logEventActivity }) {
  const knownDivisions = [...divisions, ...(targetDiv && !divisions.some(div => String(div.id) === String(targetDiv.id)) ? [targetDiv] : [])];
  const movingIds = playersToMove.map(row => row.id);
  if (!targetDiv || targetDiv.is_active === false || !movingIds.length || playersToMove.some(row =>
    row.status === 'withdrawn' || registrationMatchesDivision(row, targetDiv, knownDivisions))) {
    throw new Error('Choose an active, different division for active registrations.');
  }
  for (const entry of playersToMove) {
    if (registrations.some(row => !movingIds.includes(row.id) && row.status !== 'withdrawn'
      && registrationMatchesDivision(row, targetDiv, knownDivisions)
      && [normEmail(row.email), normEmail(row.partner_email)].includes(normEmail(entry.email)))) {
      throw new Error('A moving player already has an active entry in the target division.');
    }
  }

  const oldFee = Number(resolveRegistrationDivision(moveTarget, knownDivisions)?.entry_fee || 0);
  const newFee = Number(targetDiv.entry_fee || 0);
  const sourceDivision = moveTarget.division;
  const { error: moveError } = await supabase.rpc('admin_reviewed_move_registration_division', {
    p_event_id: event.id, p_target_division_id: targetDiv.id, p_source_fee: oldFee, p_target_fee: newFee,
    p_entries: playersToMove.map(row => ({ id: row.id, email: normEmail(row.email), partner_email: normEmail(row.partner_email),
      division: row.division, division_id: row.division_id ?? null, status: row.status ?? null, payment_status: row.payment_status ?? null })),
  });
  if (moveError) throw moveError;

  // The transaction already projects verified allocations. Read the receipt
  // again before applying the older metadata format to unverified receipts.
  const movingEmails = new Set(playersToMove.map(row => normEmail(row.email)));
  for (const payment of payments || []) {
    if (payment.status !== 'success' || hasVerifiedPaymentEntryTransfers(payment)) continue;
    const oldCovers = normalizePaymentMetadata(payment.metadata).covers;
    if (!Array.isArray(oldCovers) || !oldCovers.some(cover => cover?.type === 'entry'
      && movingEmails.has(normEmail(cover.email)) && cover.division === sourceDivision)) continue;
    const { data: receipt, error: receiptError } = await supabase.from('payments').select('metadata')
      .eq('id', payment.id).eq('event_id', event.id).eq('status', 'success').maybeSingle();
    if (receiptError || !receipt || hasVerifiedPaymentEntryTransfers(receipt)) continue;
    const meta = normalizePaymentMetadata(receipt.metadata);
    if (!Array.isArray(meta.covers)) continue;
    const covers = meta.covers.map(cover => cover?.type === 'entry'
      && movingEmails.has(normEmail(cover.email)) && cover.division === sourceDivision
      ? { ...cover, division: targetDiv.name } : cover);
    if (!covers.some((cover, index) => cover !== meta.covers[index])) continue;
    const { error: paymentError } = await supabase.from('payments').update({
      metadata: { ...meta, covers, division_entry_fees: { ...meta.division_entry_fees, [targetDiv.name]: newFee } },
    }).eq('id', payment.id).eq('event_id', event.id).eq('metadata', JSON.stringify(receipt.metadata));
    if (paymentError) console.warn('Payment cover rewrite on move failed:', paymentError.message);
  }

  for (const reg of playersToMove) {
    const owesMore = newFee > oldFee && reg.payment_status === 'paid';
    const paid = !owesMore && reg.payment_status === 'paid';
    const partner = playersToMove.find(row => row.id !== reg.id);
    const { error: participantError } = await supabase.rpc('reassign_tournament_participant_division', {
      p_event_id: event.id, p_email: reg.email || '', p_full_name: reg.full_name || '',
      p_from_class: sourceDivision, p_to_class: targetDiv.name, p_is_paid: paid,
    });
    if (participantError) console.warn('Participant division sync failed:', participantError.message);

    let feeNote = 'There was no change to your entry fee.';
    if (owesMore) feeNote = `Your new division has a higher entry fee of ${fmtR(newFee)}. Your entry is pending payment. Review the amount due before paying.`;
    else if (newFee < oldFee) feeNote = 'Your new division has a lower entry fee. The organiser will handle any difference.';

    try {
      await sendEmail(reg.email, 'division_changed', {
        eventId: event.id, playerName: reg.full_name, eventName: event.event_name, fromDivision: sourceDivision,
        toDivision: targetDiv.name, division: targetDiv.name, partnerName: partner?.full_name || 'TBD', paid,
        amount: fmtR(newFee), amountDue: paid ? 'R 0.00' : fmtR(newFee), feeNote,
      });
    } catch (error) {
      console.error('Move email failed:', error);
    }
  }

  const teamLabel = playersToMove.length > 1 ? `team (${playersToMove.map(row => row.full_name).join(' & ')})` : moveTarget.full_name;
  const anyOwesMore = playersToMove.some(reg => newFee > oldFee && reg.payment_status === 'paid');
  await logEventActivity({
    eventId: event.id, action: 'admin.moved_entries', category: 'ADMIN',
    summary: `Moved ${teamLabel} from ${sourceDivision} to ${targetDiv.name}`,
    details: { from_division: sourceDivision, to_division: targetDiv.name, players: playersToMove.map(row => row.full_name),
      registration_ids: movingIds, fee_changed: anyOwesMore },
  });
  return { teamLabel, anyOwesMore };
}
