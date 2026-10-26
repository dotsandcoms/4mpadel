import { findAdminMarkedPayment } from './paymentRegistrationMatch.js';

// Shared legacy persistence. Multiple database requests: callers must surface partial failures.
export async function saveManualEntryPayment({ supabase, event, reg, method, note, fee, logEventActivity }) {
 const isComp = method === 'comp';
 if (!note?.trim()) throw new Error('A payment note is required.');
 if (!['comp','manual','cash','eft','external','paystack'].includes(method)) throw new Error('Invalid payment method.');
 if (String(reg.status).toLowerCase() === 'withdrawn') throw new Error('Cannot change a withdrawn entry.');
 if (!isComp && (!Number.isFinite(fee) || fee < 0)) throw new Error('Entry fee is unavailable.');
            // Comp is stored as a plain manual payment of R0 — 'comp' is a UI-only
            // selection that flags the payment row as complimentary via metadata.
            const storedMethod = isComp ? 'manual' : method;
            const { error } = await supabase
                .from('event_registrations')
                .update({
                    payment_status: 'paid',
                    payment_method: storedMethod,
                })
                .eq('id', reg.id);
            if (error) throw error;

            const reference = isComp ? `MANUAL-ADMIN-COMP-${reg.id}` : `MANUAL-ADMIN-${reg.id}`;
            const amount = isComp ? 0 : fee;
            const paymentMetadata = {
                source: isComp ? 'admin_add_player' : 'manual_event_admin',
                division: reg.division,
                email: reg.email,
                registration_id: reg.id,
                marked_by_admin: true,
                note,
                payment_note: note,
                ...(isComp ? { free_entry: true, comp_entry: true } : {}),
            };
            const { data: existing, error: lookupError } = await supabase.from('payments').select('id, metadata').eq('reference', reference).maybeSingle();
            if (lookupError) throw lookupError;
            if (existing) {
                const { error: payErr } = await supabase
                    .from('payments')
                    .update({
                        status: 'success',
                        payment_method: storedMethod,
                        amount,
                        metadata: { ...(existing.metadata || {}), ...paymentMetadata },
                    })
                    .eq('id', existing.id);
                if (payErr) throw payErr;
            } else {
                const { error: payErr } = await supabase.from('payments').insert([{
                    event_id: event.id,
                    amount,
                    currency: 'ZAR',
                    status: 'success',
                    payment_type: 'event_entry_fee',
                    payment_method: storedMethod,
                    reference,
                    metadata: paymentMetadata,
                }]);
                if (payErr) throw payErr;
            }

            await logEventActivity({
                eventId: event.id,
                action: isComp ? 'admin.comped_entry' : 'admin.marked_paid',
                category: 'ADMIN',
                summary: isComp
                    ? `Comped entry for ${reg.full_name} (${reg.division})`
                    : `Marked ${reg.full_name} as paid (${method})`,
                details: {
                    registration_id: reg.id,
                    player_name: reg.full_name,
                    player_email: reg.email,
                    division: reg.division,
                    note,
                    ...(isComp ? { free_entry: true } : { method: method }),
                },
            });

}

export async function unmarkManualEntryPayment({ supabase, event, reg, payments, logEventActivity }) {
            const { error } = await supabase
                .from('event_registrations')
                .update({
                    payment_status: 'pending',
                    payment_method: null,
                })
                .eq('id', reg.id);
            if (error) throw error;

            const reference = `MANUAL-ADMIN-${reg.id}`;
            const compReference = `MANUAL-ADMIN-COMP-${reg.id}`;
            const payment = findAdminMarkedPayment(payments, reg)
                || payments.find((p) => p.reference === reference)
                || payments.find((p) => p.reference === compReference);
            if (payment) {
                const { error: payErr } = await supabase
                    .from('payments')
                    .update({
                        status: 'cancelled',
                        metadata: {
                            ...(payment.metadata || {}),
                            unmarked_by_admin: true,
                            unmarked_at: new Date().toISOString(),
                        },
                    })
                    .eq('id', payment.id);
                if (payErr) throw payErr;
            }

            await logEventActivity({
                eventId: event.id,
                action: 'admin.unmarked_paid',
                category: 'ADMIN',
                summary: `Unmarked ${reg.full_name} as paid`,
                details: {
                    registration_id: reg.id,
                    player_name: reg.full_name,
                    player_email: reg.email,
                    division: reg.division,
                },
            });

}
