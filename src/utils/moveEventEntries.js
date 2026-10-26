const normEmail = value => String(value || '').trim().toLowerCase();
const fmtR = n => 'R ' + Number(n || 0).toLocaleString('en-ZA');

export async function moveEventEntries({ supabase, event, registrations, payments, divisions, moveTarget, playersToMove, targetDiv, moveTeamTogether, sendEmail, logEventActivity }) {
  const divFee = name => Number(divisions.find(d => d.name === name)?.entry_fee || 0);
  const registrationInDivision = (row, div) => row.division_id === div.id || row.division === div.name;
  const toMove = playersToMove;
  // Keep successive updates to a bundled payment based on the last saved metadata.
  const currentPayments = (payments || []).map(payment => ({ ...payment }));
  const movingIds = toMove.map(row => row.id);
  if (!targetDiv || targetDiv.is_active === false || !toMove.length || toMove.some(row => row.status === 'withdrawn' || registrationInDivision(row, targetDiv))) throw new Error('Choose an active, different division for active registrations.');
  for (const reg of toMove) {
    if (registrations.some(row => !movingIds.includes(row.id) && registrationInDivision(row, targetDiv) && row.status !== 'withdrawn' && (normEmail(row.email) === normEmail(reg.email) || normEmail(row.partner_email) === normEmail(reg.email)))) throw new Error('A moving player already has an active entry in the target division.');
  }
    const archiveConflictSlot = async (rowId) => {
        // RLS allows UPDATE but not DELETE — reassign division to free the unique slot.
        const { error } = await supabase
            .from('event_registrations')
            .update({
                division: `__archived__/${rowId}`,
                division_id: null,
                status: 'withdrawn',
                withdrawn_at: new Date().toISOString(),
            })
            .eq('id', rowId);
        if (error) throw error;
    };

    const releaseDivisionSlotConflicts = async (reg, targetDiv) => {
        const email = normEmail(reg.email);
        const { data: rows, error: fetchErr } = await supabase
            .from('event_registrations')
            .select('id, status, full_name, email, division, division_id, partner_email')
            .eq('event_id', event.id)
            .neq('id', reg.id);

        if (fetchErr) throw fetchErr;

        const conflicts = (rows || []).filter((r) =>
            registrationInDivision(r, targetDiv)
            && (normEmail(r.email) === email || normEmail(r.partner_email) === email)
        );
        for (const row of conflicts) {
            if (String(row.status || '').toLowerCase() === 'withdrawn') {
                await archiveConflictSlot(row.id);
            } else {
                throw new Error(`${reg.full_name || email} already has an active entry in ${targetDiv.name}. Remove it before moving.`);
            }
        }
    };

    const unlinkExternalPartnersInDivision = async (divisionName, movingIds) => {
        const movingSet = new Set(movingIds);
        const toUnlink = registrations.filter((r) =>
            r.division === divisionName
            && r.status !== 'withdrawn'
            && !movingSet.has(r.id)
            && r.partner_email
            && playersToMove.some((m) => (m.email || '').toLowerCase() === (r.partner_email || '').toLowerCase()),
        );

        for (const row of toUnlink) {
            const { error } = await supabase
                .from('event_registrations')
                .update({ partner_name: null, partner_email: null, partner_payment_status: null })
                .eq('id', row.id);
            if (error) throw error;
        }
    };

            const oldFee = divFee(moveTarget.division);
            const newFee = Number(targetDiv.entry_fee || 0);
            const sourceDivision = moveTarget.division;

            if (!moveTeamTogether && moveTarget.partner_email) {
                const { error: unlinkError } = await supabase.from('event_registrations')
                    .update({ partner_name: null, partner_email: null, partner_payment_status: null })
                    .eq('event_id', event.id)
                    .ilike('email', moveTarget.partner_email)
                    .eq('division', sourceDivision)
                    .neq('status', 'withdrawn');
                if (unlinkError) throw unlinkError;
            }

            if (moveTeamTogether && toMove.length > 1) {
                await unlinkExternalPartnersInDivision(sourceDivision, movingIds);
            }

            // Park team rows in unique temporary divisions so simultaneous moves
            // cannot collide on the (event_id, email, division) constraint.
            if (toMove.length > 1) {
                for (const reg of toMove) {
                    const { error: parkErr } = await supabase
                        .from('event_registrations')
                        .update({ division: `__moving__/${reg.id}`, division_id: null })
                        .eq('id', reg.id);
                    if (parkErr) throw parkErr;
                }
            }

            // Withdrawn ghost rows still occupy the unique slot; archive them
            // (DELETE is blocked by RLS — only UPDATE is allowed).
            for (const reg of toMove) {
                await releaseDivisionSlotConflicts(reg, targetDiv);
            }

            for (const reg of toMove) {
                const owesMore = newFee > oldFee && reg.payment_status === 'paid';
                const newStatus = owesMore ? 'pending' : reg.payment_status;

                const updates = {
                    division_id: targetDiv.id,
                    division: targetDiv.name,
                    registered_by: reg.email,
                    payment_status: newStatus,
                };

                if (moveTeamTogether && toMove.length > 1) {
                    const partner = toMove.find((p) => p.id !== reg.id);
                    if (partner) {
                        updates.partner_name = partner.full_name;
                        updates.partner_email = partner.email;
                        updates.partner_payment_status = newFee > oldFee && partner.payment_status === 'paid' ? 'pending' : partner.payment_status;
                    }
                } else {
                    updates.partner_name = null;
                    updates.partner_email = null;
                    updates.partner_payment_status = null;
                }

                // .select() surfaces silent RLS no-ops (0 rows, no error) that left
                // players stuck in the old division on the public Players tab.
                const { data: movedRows, error } = await supabase
                    .from('event_registrations')
                    .update(updates)
                    .eq('id', reg.id)
                    .select('id, division');
                if (error) throw error;
                if (!movedRows?.length) {
                    throw new Error(
                        `Could not move ${reg.full_name || reg.email}. You may not have permission to update this event's registrations — ask a 4M admin to apply the org-admin RLS migration.`,
                    );
                }

                const { error: partErr } = await supabase.rpc('reassign_tournament_participant_division', {
                    p_event_id: event.id,
                    p_email: reg.email || '',
                    p_full_name: reg.full_name || '',
                    p_from_class: sourceDivision,
                    p_to_class: targetDiv.name,
                    p_is_paid: newStatus === 'paid',
                });
                if (partErr) {
                    console.warn('Participant division sync failed:', partErr.message);
                }

                // Keep Paystack covers on the new division so status stays Via Paystack.
                const regEmail = (reg.email || '').toLowerCase();
                const relatedPays = currentPayments.filter((p) => {
                    if (p.status !== 'success') return false;
                    const blob = JSON.stringify(p.metadata || {}).toLowerCase();
                    return regEmail && blob.includes(regEmail);
                });
                await Promise.all(relatedPays.map(async (p) => {
                    let meta = p.metadata || {};
                    if (typeof meta === 'string') {
                        try { meta = JSON.parse(meta); } catch { meta = {}; }
                    }
                    const covers = Array.isArray(meta.covers) ? meta.covers : [];
                    let changed = false;
                    const nextCovers = covers.map((c) => {
                        if (
                            c?.type === 'entry'
                            && (c.email || '').toLowerCase() === regEmail
                            && (c.division || '') === sourceDivision
                        ) {
                            changed = true;
                            return { ...c, division: targetDiv.name };
                        }
                        return c;
                    });
                    if (!changed) return;
                    const fees = { ...(meta.division_entry_fees || {}) };
                    fees[targetDiv.name] = newFee;
                    const { error: payErr } = await supabase
                        .from('payments')
                        .update({
                            metadata: {
                                ...meta,
                                covers: nextCovers,
                                division_entry_fees: fees,
                            },
                        })
                        .eq('id', p.id);
                    if (payErr) console.warn('Payment cover rewrite on move failed:', payErr.message);
                    else p.metadata = { ...meta, covers: nextCovers, division_entry_fees: fees };
                }));

                let feeNote = 'There was no change to your entry fee.';
                if (owesMore) feeNote = `Your new division has a higher entry fee of ${fmtR(newFee)}. Your entry is now marked pending — please complete payment to confirm your spot.`;
                else if (newFee < oldFee) feeNote = 'Your new division has a lower entry fee; any difference will be handled by the organiser.';

                try {
                    await sendEmail(reg.email, 'division_changed', {
                        eventId: event.id,
                        playerName: reg.full_name,
                        eventName: event.event_name,
                        fromDivision: sourceDivision,
                        toDivision: targetDiv.name,
                        division: targetDiv.name,
                        partnerName: moveTeamTogether && toMove.length > 1
                            ? toMove.find((p) => p.id !== reg.id)?.full_name || 'TBD'
                            : 'TBD',
                        paid: newStatus === 'paid',
                        amount: fmtR(newFee),
                        amountDue: newStatus === 'paid' ? 'R 0.00' : fmtR(newFee),
                        feeNote,
                    });
                } catch (mailErr) {
                    console.error('Move email failed:', mailErr);
                }
            }

            const teamLabel = moveTeamTogether && toMove.length > 1
                ? `team (${toMove.map((p) => p.full_name).join(' & ')})`
                : moveTarget.full_name;
            const anyOwesMore = toMove.some((reg) => newFee > oldFee && reg.payment_status === 'paid');

            await logEventActivity({
                eventId: event.id,
                action: 'admin.moved_entries',
                category: 'ADMIN',
                summary: `Moved ${teamLabel} from ${sourceDivision} to ${targetDiv.name}`,
                details: {
                    from_division: sourceDivision,
                    to_division: targetDiv.name,
                    players: toMove.map((p) => p.full_name),
                    registration_ids: movingIds,
                    fee_changed: anyOwesMore,
                },
            });

  return { teamLabel, anyOwesMore };
}
