import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export const usePendingPayments = (email) => {
    const [pendingPayments, setPendingPayments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPending = async () => {
            if (!email) {
                setPendingPayments([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                // Get today's date at start of day
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayStr = today.toISOString();

                const unpaidEvents = new Map();
                
                // 0. Fetch profile to get profile_id for more accurate matching
                const { data: profile } = await supabase
                    .from('players')
                    .select('id, rankedin_id, name')
                    .ilike('email', email)
                    .maybeSingle();
                
                const profileId = profile?.id;
                const profileName = profile?.name?.toLowerCase().trim();
                const normalizedEmail = email.toLowerCase().trim();

                // Do NOT bulk-add Rankedin API events as unpaid — Rankedin registration ≠ 4M payment status.
                // Unpaid entries come only from local DB rows below, then we subtract confirmed payments.

                // 1. Fetch unpaid participants
                const { data: participants, error: pError } = await supabase
                    .from('tournament_participants')
                    .select(`
                        event_id,
                        class_name,
                        calendar!inner(id, event_name, start_date, entry_fee, category_fees, slug, allow_payments, is_manual)
                    `)
                    .or(profileId ? `email.ilike.${email},profile_id.eq.${profileId}` : `email.ilike.${email}`)
                    .neq('is_paid', true) // Include false and null
                    .gte('calendar.start_date', todayStr);

                // Fetch pending registrations
                const { data: rawRegistrations, error: rError } = await supabase
                    .from('event_registrations')
                    .select(`
                        event_id,
                        division,
                        email,
                        partner_email,
                        payment_status,
                        partner_payment_status,
                        calendar!inner(id, event_name, start_date, entry_fee, category_fees, slug, allow_payments, is_manual)
                    `)
                    .or(`email.ilike.${email},partner_email.ilike.${email}`)
                    .neq('status', 'withdrawn')
                    .gte('calendar.start_date', todayStr);

                const registrations = (rawRegistrations || []).filter(r => {
                    const isRegistrant = r.email?.toLowerCase() === email.toLowerCase();
                    const isPartner = r.partner_email?.toLowerCase() === email.toLowerCase();
                    const userPending =
                        (isRegistrant && ['pending', 'failed'].includes(r.payment_status)) ||
                        (isPartner && ['pending', 'failed'].includes(r.partner_payment_status));
                    return userPending;
                });

                // Paid participant rows override stale pending registration status
                const { data: paidParticipantRows } = await supabase
                    .from('tournament_participants')
                    .select('event_id, class_name, calendar!inner(start_date)')
                    .or(profileId ? `email.ilike.${email},profile_id.eq.${profileId}` : `email.ilike.${email}`)
                    .eq('is_paid', true)
                    .gte('calendar.start_date', todayStr);

                const normalizeDivision = (name) => {
                    if (!name || name === 'N/A' || name === 'null' || name === 'undefined') return '';
                    return name.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
                };

                const paidParticipantKeys = new Set(
                    (paidParticipantRows || []).map((p) => `${p.event_id}_${normalizeDivision(p.class_name)}`),
                );

                if (pError) console.error("Error fetching participants:", pError);
                if (rError) console.error("Error fetching registrations:", rError);

                const processEvent = (record) => {
                    if (!record.calendar) return;
                    const cal = record.calendar;
                    
                    // Check if event has a fee AND allows payments
                    const hasFee = cal.entry_fee > 0 || (cal.category_fees && Object.keys(cal.category_fees).length > 0) || cal.is_manual === true;
                    
                    if (hasFee && cal.allow_payments) {
                        const division = (record.class_name || record.division || 'N/A').trim();
                        unpaidEvents.set(`${cal.id}_${division}`, {
                            id: cal.id,
                            name: cal.event_name,
                            division: division,
                            slug: cal.slug || cal.id,
                            start_date: cal.start_date
                        });
                    }
                };

                if (participants) participants.forEach(processEvent);
                if (registrations) {
                    registrations.forEach((record) => {
                        const division = (record.division || 'N/A').trim();
                        const paidKey = `${record.event_id}_${normalizeDivision(division)}`;
                        if (paidParticipantKeys.has(paidKey)) return;
                        processEvent(record);
                    });
                }

                // Now we need to make sure they haven't actually paid for these events in the other tables
                // e.g. they might be in tournament_participants with is_paid=false, but event_registrations payment_status='paid'
                if (unpaidEvents.size > 0) {
                    const eventIds = Array.from(new Set(Array.from(unpaidEvents.values()).map(e => e.id)));
                    
                    const { data: rawPaidRegs } = await supabase
                        .from('event_registrations')
                        .select('event_id, division, email, partner_email, payment_status, partner_payment_status')
                        .or(`email.ilike.${email},partner_email.ilike.${email}`)
                        .neq('status', 'withdrawn')
                        .in('event_id', eventIds);

                    const paidRegs = (rawPaidRegs || []).filter(r => {
                        const isRegistrant = r.email?.toLowerCase() === email.toLowerCase();
                        const isPartner = r.partner_email?.toLowerCase() === email.toLowerCase();
                        if (isRegistrant && r.payment_status === 'paid') return true;
                        if (isPartner && r.partner_payment_status === 'paid') return true;
                        return false;
                    });
                        
                    const { data: paidParts } = await supabase
                        .from('tournament_participants')
                        .select('event_id, class_name')
                        .or(profileId ? `email.ilike.${email},profile_id.eq.${profileId}` : `email.ilike.${email}`)
                        .eq('is_paid', true)
                        .in('event_id', eventIds);

                    // Also check the payments table directly for robustness
                    let paymentsQuery = supabase
                        .from('payments')
                        .select('event_id, metadata, player_id')
                        .eq('status', 'success')
                        .eq('payment_type', 'event_entry_fee')
                        .in('event_id', eventIds);

                    if (profileId) {
                        paymentsQuery = paymentsQuery.or(`player_id.eq.${profileId},metadata->>email.ilike.${normalizedEmail}`);
                    } else {
                        paymentsQuery = paymentsQuery.filter('metadata->>email', 'ilike', normalizedEmail);
                    }

                    const { data: directPayments } = await paymentsQuery;

                    const findAndRemove = (eventId, divisionName) => {
                        const normTarget = normalizeDivision(divisionName);
                        if (!normTarget) {
                            const keysToRemove = [];
                            for (const [key, val] of unpaidEvents.entries()) {
                                if (val.id === eventId) keysToRemove.push(key);
                            }
                            keysToRemove.forEach(k => unpaidEvents.delete(k));
                            return;
                        }

                        for (const [key, val] of unpaidEvents.entries()) {
                            if (val.id === eventId) {
                                const normVal = normalizeDivision(val.division);
                                if (normVal === normTarget || normVal.includes(normTarget) || normTarget.includes(normVal)) {
                                    unpaidEvents.delete(key);
                                }
                            }
                        }
                    };

                    // Remove generic/N/A entries for any event where we have division-specific records in the database
                    const dbEventIds = new Set([
                        ...(participants || []).map(p => p.event_id),
                        ...(registrations || []).map(r => r.event_id),
                        ...(paidRegs || []).map(r => r.event_id),
                        ...(paidParts || []).map(p => p.event_id),
                        ...(directPayments || []).map(p => p.event_id)
                    ]);

                    for (const [key, val] of unpaidEvents.entries()) {
                        const isGeneric = !val.division || val.division === 'N/A' || val.division === 'null' || val.division === 'undefined';
                        if (isGeneric && dbEventIds.has(val.id)) {
                            unpaidEvents.delete(key);
                        }
                    }

                    if (paidRegs) {
                        paidRegs.forEach(r => findAndRemove(r.event_id, r.division));
                    }
                    if (paidParts) {
                        paidParts.forEach(p => findAndRemove(p.event_id, p.class_name));
                    }
                    if (directPayments) {
                        directPayments.forEach(p => {
                            const meta = p.metadata || {};
                            const paymentBelongsToUser =
                                (profileId && p.player_id === profileId) ||
                                (meta.email && String(meta.email).toLowerCase().trim() === normalizedEmail) ||
                                (meta.registrant_email && String(meta.registrant_email).toLowerCase().trim() === normalizedEmail);

                            if (!paymentBelongsToUser && meta.line_items && Array.isArray(meta.line_items)) {
                                const lineMatch = meta.line_items.some((item) => {
                                    const player = String(item.player || item.label || '').toLowerCase();
                                    return profileName && player.includes(profileName);
                                });
                                if (lineMatch) {
                                    meta.line_items.forEach((item) => {
                                        const div = item.division || meta.division;
                                        if (div) findAndRemove(p.event_id, div);
                                    });
                                    if (!meta.line_items.some((item) => item.division || meta.division)) {
                                        findAndRemove(p.event_id, null);
                                    }
                                    return;
                                }
                            }

                            if (!paymentBelongsToUser) return;

                            if (meta.covers && Array.isArray(meta.covers)) {
                                meta.covers.forEach((c) => {
                                    if (c.type === 'entry' && c.email?.toLowerCase() === normalizedEmail && c.division) {
                                        findAndRemove(p.event_id, c.division);
                                    }
                                });
                                return;
                            }

                            if (meta.line_items && Array.isArray(meta.line_items)) {
                                let removedSpecific = false;
                                meta.line_items.forEach((item) => {
                                    if (item.type === 'entry_fee' || item.type === 'entry') {
                                        const div = item.division || meta.division;
                                        if (div) {
                                            findAndRemove(p.event_id, div);
                                            removedSpecific = true;
                                        }
                                    }
                                });
                                if (!removedSpecific) findAndRemove(p.event_id, meta.division);
                                return;
                            }

                            findAndRemove(p.event_id, meta.division);
                        });
                    }
                }

                // Deduplicate: If an event appears both with a division and without, 
                // prioritize the one WITH the division to avoid redundant notifications.
                const deduplicated = new Map();
                unpaidEvents.forEach((val, key) => {
                    const eventId = val.id;
                    const hasDiv = val.division && val.division !== 'N/A' && val.division !== 'null';
                    
                    if (!deduplicated.has(eventId)) {
                        deduplicated.set(eventId, val);
                    } else if (hasDiv) {
                        // If we already have a record but it doesn't have a division, replace it with this one
                        const existing = deduplicated.get(eventId);
                        const existingHasDiv = existing.division && existing.division !== 'N/A' && existing.division !== 'null';
                        if (!existingHasDiv) {
                            deduplicated.set(eventId, val);
                        } else if (existing.division !== val.division) {
                            // If both have DIFFERENT divisions, we keep both by using a composite key for the map
                            // This is a rare case but ensures we don't hide real multi-division entry fees
                            deduplicated.set(`${eventId}_${val.division}`, val);
                        }
                    }
                });

                // Sort by date ascending
                const sortedPending = Array.from(deduplicated.values()).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
                setPendingPayments(sortedPending);
            } catch (error) {
                console.error("Error in usePendingPayments:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchPending();
    }, [email]);

    return { pendingPayments, loading };
};
