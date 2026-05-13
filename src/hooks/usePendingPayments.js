import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useRankedin } from './useRankedin';

export const usePendingPayments = (email, rankedinId) => {
    const [pendingPayments, setPendingPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const { getPlayerEventsAsync } = useRankedin();

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
                    .select('id, rankedin_id')
                    .ilike('email', email)
                    .maybeSingle();
                
                const profileId = profile?.id;
                const pRankedinId = rankedinId || profile?.rankedin_id;

                // 1. Fetch from Rankedin API if rankedinId is provided
                if (pRankedinId) {
                    const rEvents = await getPlayerEventsAsync(pRankedinId);
                    const upcomingREvents = (rEvents || []).filter(e => new Date(e.start_date) >= today && e.state !== 2);

                    if (upcomingREvents.length > 0) {
                        const { data: dbEvents } = await supabase
                            .from('calendar')
                            .select('id, event_name, start_date, slug, rankedin_url, entry_fee, category_fees');
                        
                        if (dbEvents) {
                            upcomingREvents.forEach(re => {
                                const match = dbEvents.find(dbE => dbE.rankedin_url && dbE.rankedin_url.includes(`/tournament/${re.id}/`));
                                if (match) {
                                    const hasFee = match.entry_fee > 0 || (match.category_fees && Object.keys(match.category_fees).length > 0);
                                    if (hasFee) {
                                        const division = (re.class_name || 'N/A').trim();
                                        unpaidEvents.set(`${match.id}_${division}`, {
                                            id: match.id,
                                            name: match.event_name,
                                            division: re.class_name,
                                            slug: match.slug || match.id,
                                            start_date: match.start_date
                                        });
                                    }
                                }
                            });
                        }
                    }
                }

                // 2. Fetch unpaid participants
                const { data: participants, error: pError } = await supabase
                    .from('tournament_participants')
                    .select(`
                        event_id,
                        class_name,
                        calendar!inner(id, event_name, start_date, entry_fee, category_fees, slug)
                    `)
                    .or(profileId ? `email.ilike.${email},profile_id.eq.${profileId}` : `email.ilike.${email}`)
                    .neq('is_paid', true) // Include false and null
                    .gte('calendar.start_date', todayStr);

                // Fetch pending registrations
                const { data: registrations, error: rError } = await supabase
                    .from('event_registrations')
                    .select(`
                        event_id,
                        division,
                        calendar!inner(id, event_name, start_date, entry_fee, category_fees, slug)
                    `)
                    .ilike('email', email)
                    .in('payment_status', ['pending', 'failed'])
                    .gte('calendar.start_date', todayStr);

                if (pError) console.error("Error fetching participants:", pError);
                if (rError) console.error("Error fetching registrations:", rError);

                const processEvent = (record) => {
                    if (!record.calendar) return;
                    const cal = record.calendar;
                    
                    // Check if event has a fee
                    const hasFee = cal.entry_fee > 0 || (cal.category_fees && Object.keys(cal.category_fees).length > 0);
                    
                    if (hasFee) {
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
                if (registrations) registrations.forEach(processEvent);

                // Now we need to make sure they haven't actually paid for these events in the other tables
                // e.g. they might be in tournament_participants with is_paid=false, but event_registrations payment_status='paid'
                if (unpaidEvents.size > 0) {
                    const eventIds = Array.from(new Set(Array.from(unpaidEvents.values()).map(e => e.id)));
                    
                    const { data: paidRegs } = await supabase
                        .from('event_registrations')
                        .select('event_id, division')
                        .ilike('email', email)
                        .eq('payment_status', 'paid')
                        .in('event_id', eventIds);
                        
                    const { data: paidParts } = await supabase
                        .from('tournament_participants')
                        .select('event_id, class_name')
                        .or(profileId ? `email.ilike.${email},profile_id.eq.${profileId}` : `email.ilike.${email}`)
                        .eq('is_paid', true)
                        .in('event_id', eventIds);

                    // Also check the payments table directly for robustness
                    const { data: directPayments } = await supabase
                        .from('payments')
                        .select('event_id, metadata')
                        .eq('status', 'success')
                        .eq('payment_type', 'event_entry_fee')
                        .in('event_id', eventIds)
                        .or(profileId ? `player_id.eq.${profileId},metadata->>email.ilike.${email}` : `metadata->>email.ilike.${email}`);

                    const findAndRemove = (eventId, divisionName) => {
                        if (!divisionName) return;
                        const normalizedTarget = `${eventId}_${divisionName.trim().toLowerCase()}`;
                        for (const [key, val] of unpaidEvents.entries()) {
                            if (key.toLowerCase() === normalizedTarget) {
                                unpaidEvents.delete(key);
                            }
                        }
                    };

                    if (paidRegs) {
                        paidRegs.forEach(r => findAndRemove(r.event_id, r.division));
                    }
                    if (paidParts) {
                        paidParts.forEach(p => findAndRemove(p.event_id, p.class_name));
                    }
                    if (directPayments) {
                        directPayments.forEach(p => {
                            const division = p.metadata?.division;
                            if (division) {
                                findAndRemove(p.event_id, division);
                            } else {
                                findAndRemove(p.event_id, 'N/A');
                            }
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
    }, [email, rankedinId]);

    return { pendingPayments, loading };
};
