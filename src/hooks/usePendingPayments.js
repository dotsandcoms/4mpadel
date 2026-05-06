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

                // 1. Fetch from Rankedin API if rankedinId is provided
                if (rankedinId) {
                    const rEvents = await getPlayerEventsAsync(rankedinId);
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
                                        unpaidEvents.set(match.id, {
                                            id: match.id,
                                            name: match.event_name,
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
                        calendar!inner(id, event_name, start_date, entry_fee, category_fees, slug)
                    `)
                    .ilike('email', email)
                    .neq('is_paid', true) // Include false and null
                    .gte('calendar.start_date', todayStr);

                // Fetch pending registrations
                const { data: registrations, error: rError } = await supabase
                    .from('event_registrations')
                    .select(`
                        event_id,
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
                        unpaidEvents.set(cal.id, {
                            id: cal.id,
                            name: cal.event_name,
                            slug: cal.slug || cal.id,
                            start_date: cal.start_date
                        });
                    }
                };

                if (participants) participants.forEach(processEvent);
                if (registrations) registrations.forEach(processEvent);

                // Now we need to make sure they haven't actually paid for these events in the other table
                // e.g. they might be in tournament_participants with is_paid=false, but event_registrations payment_status='paid'
                if (unpaidEvents.size > 0) {
                    const eventIds = Array.from(unpaidEvents.keys());
                    
                    const { data: paidRegs } = await supabase
                        .from('event_registrations')
                        .select('event_id')
                        .ilike('email', email)
                        .eq('payment_status', 'paid')
                        .in('event_id', eventIds);
                        
                    const { data: paidParts } = await supabase
                        .from('tournament_participants')
                        .select('event_id')
                        .ilike('email', email)
                        .eq('is_paid', true)
                        .in('event_id', eventIds);

                    if (paidRegs) {
                        paidRegs.forEach(r => unpaidEvents.delete(r.event_id));
                    }
                    if (paidParts) {
                        paidParts.forEach(p => unpaidEvents.delete(p.event_id));
                    }
                }

                // Sort by date ascending
                const sortedPending = Array.from(unpaidEvents.values()).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
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
