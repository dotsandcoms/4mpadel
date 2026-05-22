import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useRankedin } from '../hooks/useRankedin';
import { useNavigate } from 'react-router-dom';
import { Calendar, ExternalLink, ChevronRight, CheckCircle2, CreditCard } from 'lucide-react';

const UpcomingEventsWidget = ({ session }) => {
    const navigate = useNavigate();
    const [player, setPlayer] = useState(null);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const { getPlayerEventsAsync } = useRankedin();

    // Fetch logged-in player profile
    useEffect(() => {
        if (!session?.user) {
            setLoading(false);
            return;
        }
        const fetchPlayer = async () => {
            const { data } = await supabase
                .from('players')
                .select('id, name, rankedin_id, email')
                .eq('auth_user_id', session.user.id)
                .maybeSingle();
            setPlayer(data || null);
        };
        fetchPlayer();
    }, [session]);

    // Fetch upcoming events once we have rankedin_id
    useEffect(() => {
        if (!player?.rankedin_id) {
            setLoading(false);
            return;
        }

        const fetchEvents = async () => {
            setLoading(true);
            try {
                const rawEvents = await getPlayerEventsAsync(player.rankedin_id);
                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                const filtered = (rawEvents || [])
                    .filter(e => {
                        const eventEnd = e.end_date ? new Date(e.end_date) : new Date(e.start_date);
                        eventEnd.setHours(23, 59, 59, 999);
                        return eventEnd >= startOfToday && e.state !== 2;
                    })
                    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
                    .slice(0, 4); // Show max 4 on homepage

                if (filtered.length > 0) {
                    // Enrich with DB data
                    const { data: dbEvents } = await supabase
                        .from('calendar')
                        .select('id, slug, rankedin_url, city, venue, sapa_status, entry_fee, category_fees');

                    // Check paid status
                    const { data: paidParticipants } = await supabase
                        .from('tournament_participants')
                        .select('event_id')
                        .or(`email.ilike.${player.email},profile_id.eq.${player.id}`)
                        .eq('is_paid', true);

                    const { data: directPayments } = await supabase
                        .from('payments')
                        .select('event_id')
                        .eq('player_id', player.id)
                        .eq('status', 'success')
                        .eq('payment_type', 'event_entry_fee');

                    const paidEventIds = new Set([
                        ...(paidParticipants || []).map(p => p.event_id),
                        ...(directPayments || []).map(p => p.event_id),
                    ]);

                    if (dbEvents) {
                        filtered.forEach(e => {
                            const match = dbEvents.find(dbE => dbE.rankedin_url?.includes(`/tournament/${e.id}/`));
                            if (match) {
                                e.db_id = match.id;
                                e.slug = match.slug;
                                e.city = match.city;
                                e.venue = match.venue;
                                e.sapa_status = match.sapa_status;
                                e.entry_fee = match.entry_fee;
                                e.category_fees = match.category_fees;
                                e.isPaid = paidEventIds.has(match.id);
                            }
                        });
                    }
                }

                setEvents(filtered);
            } catch (err) {
                console.error('UpcomingEventsWidget error:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();
    }, [player, getPlayerEventsAsync]);

    // Not logged in or no player profile — render nothing
    if (!session?.user || (!loading && !player?.rankedin_id)) return null;

    // Loading skeleton
    if (loading) {
        return (
            <section className="px-4 md:px-6 pb-6">
                <div className="bg-[#0F172A] border border-white/10 rounded-[2rem] p-6 md:p-10 animate-pulse">
                    <div className="h-4 w-48 bg-white/10 rounded-full mb-6" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {[1, 2].map(i => (
                            <div key={i} className="h-32 bg-white/5 rounded-2xl" />
                        ))}
                    </div>
                </div>
            </section>
        );
    }

    // Has events
    if (events.length === 0) return null;

    return (
        <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="px-4 md:px-6 pb-6"
        >
            <div className="bg-[#0F172A]/90 backdrop-blur-xl border border-purple-500/25 rounded-[2rem] p-6 md:p-10 relative overflow-hidden">
                {/* Background glow */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none" />

                {/* Header */}
                <div className="relative z-10 flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center">
                            <Calendar className="text-purple-400" size={18} />
                        </div>
                        <div>
                            <h2 className="font-black text-white text-base uppercase tracking-wider">My Upcoming Events</h2>
                            <p className="text-gray-500 text-[10px] uppercase tracking-widest font-bold">Your registered tournaments</p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/profile')}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-purple-400 hover:text-white transition-colors group"
                    >
                        View all
                        <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                </div>

                {/* Events grid */}
                <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {events.map((event, idx) => {
                        // Colour theme based on SAPA status
                        let accent = 'border-white/10 hover:border-padel-green/40';
                        let glow = 'bg-padel-green/5';
                        let nameColor = 'group-hover:text-padel-green';
                        let dateColor = 'text-padel-green';

                        if (event.sapa_status === 'Major') {
                            accent = 'border-white/10 hover:border-red-500/40';
                            glow = 'bg-red-500/5';
                            nameColor = 'group-hover:text-red-400';
                            dateColor = 'text-red-400';
                        } else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') {
                            accent = 'border-white/10 hover:border-amber-500/40';
                            glow = 'bg-amber-500/5';
                            nameColor = 'group-hover:text-amber-400';
                            dateColor = 'text-amber-400';
                        } else if (event.sapa_status === 'Gold') {
                            accent = 'border-white/10 hover:border-yellow-500/40';
                            glow = 'bg-yellow-500/5';
                            nameColor = 'group-hover:text-yellow-400';
                            dateColor = 'text-yellow-400';
                        }

                        const needsPayment = event.db_id && !event.isPaid &&
                            (event.entry_fee > 0 || (event.category_fees && Object.keys(event.category_fees).length > 0));

                        return (
                            <motion.div
                                key={event.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.07, duration: 0.4 }}
                                className={`relative bg-black/30 border ${accent} rounded-2xl p-5 transition-all group overflow-hidden cursor-pointer`}
                                onClick={() => {
                                    if (event.slug || event.db_id) {
                                        navigate(`/calendar/${event.slug || event.db_id}`);
                                    } else {
                                        window.open(`https://www.rankedin.com/en/tournament/${event.id}`, '_blank');
                                    }
                                }}
                            >
                                {/* Glow */}
                                <div className={`absolute top-0 right-0 w-24 h-24 ${glow} rounded-full blur-3xl -mr-12 -mt-12 group-hover:opacity-100 opacity-50 transition-opacity`} />

                                {/* PAID ribbon */}
                                {event.isPaid && (
                                    <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden rounded-tr-2xl pointer-events-none z-20">
                                        <div className="absolute top-0 right-0 translate-x-[30%] translate-y-[20%] rotate-45 bg-[#ccff00] text-black text-[7px] font-black uppercase tracking-widest py-1 w-[130%] text-center flex items-center justify-center gap-0.5">
                                            <CheckCircle2 size={7} strokeWidth={4} />
                                            PAID
                                        </div>
                                    </div>
                                )}

                                <div className="relative z-10 flex justify-between items-start mb-3">
                                    <div>
                                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] mb-0.5">Date</p>
                                        <p className={`text-xs font-bold ${dateColor}`}>
                                            {new Date(event.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </p>
                                    </div>
                                    <ExternalLink size={13} className="text-gray-600 group-hover:text-gray-400 transition-colors mt-0.5" />
                                </div>

                                <h3 className={`text-sm font-black text-white uppercase tracking-tight line-clamp-2 ${nameColor} transition-colors mb-3`}>
                                    {event.event_name}
                                </h3>

                                {event.city && (
                                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{event.city}</p>
                                )}

                                {needsPayment && (
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            navigate(`/calendar/${event.slug || event.db_id}?register=true`);
                                        }}
                                        className="mt-3 w-full bg-padel-green text-black font-black uppercase tracking-widest text-[9px] py-2 rounded-xl hover:bg-white transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <CreditCard size={12} />
                                        Pay Entry Fee
                                    </button>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </motion.section>
    );
};

export default UpcomingEventsWidget;
