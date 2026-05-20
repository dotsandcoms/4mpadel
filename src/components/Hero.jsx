import React, { useState, useCallback } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import heroBg from '../assets/hero_bg.png';
import AuthModal from './AuthModal';
import { supabase } from '../supabaseClient';
import { PlayCircle, Calendar, ChevronRight, CheckCircle2, ExternalLink } from 'lucide-react';
import VideoModal from './VideoModal';
import { useEffect } from 'react';
import { useRankedin } from '../hooks/useRankedin';

const Hero = () => {
    const { scrollY } = useScroll();
    const yBackend = useTransform(scrollY, [0, 500], [0, 150]);
    const opacityText = useTransform(scrollY, [0, 300], [1, 0]);
    const navigate = useNavigate();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [liveEvent, setLiveEvent] = useState(null);
    const [videoModal, setVideoModal] = useState({ isOpen: false, url: '', title: '' });
    const [session, setSession] = useState(null);
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const { getPlayerEventsAsync } = useRankedin();

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        const fetchLiveEvent = async () => {
            const { data, error } = await supabase
                .from('calendar')
                .select('*')
                .eq('featured_live', true)
                .neq('is_visible', false)
                .order('start_date', { ascending: true })
                .limit(1)
                .single();

            if (data && !error) {
                setLiveEvent(data);
            }
        };

        fetchLiveEvent();

        return () => subscription.unsubscribe();
    }, []);

    // Fetch upcoming events when session changes
    useEffect(() => {
        if (!session?.user) {
            setUpcomingEvents([]);
            return;
        }

        const CACHE_KEY = `hero_events_${session.user.email}`;
        const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

        // ── Step 1: Show cache immediately so the strip appears on first render ──
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { ts, events } = JSON.parse(cached);
                if (Date.now() - ts < CACHE_TTL && events.length > 0) {
                    setUpcomingEvents(events);
                    // Still refresh in background but don't block render
                }
            }
        } catch (_) {}

        // ── Step 2: Fetch fresh data from RankedIn (in background) ──
        const fetchPlayerEvents = async () => {
            try {
                const { data: playerData } = await supabase
                    .from('players')
                    .select('id, rankedin_id, email')
                    .ilike('email', session.user.email)
                    .maybeSingle();

                if (!playerData?.rankedin_id) return;

                const rawEvents = await getPlayerEventsAsync(playerData.rankedin_id);
                const now = new Date();
                const filtered = (rawEvents || [])
                    .filter(e => new Date(e.start_date) >= now && e.state !== 2)
                    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
                    .slice(0, 3);

                if (filtered.length > 0) {
                    // Run all enrichment queries in parallel
                    const [dbEventsRes, paidParticipantsRes, directPaymentsRes] = await Promise.all([
                        supabase.from('calendar').select('id, slug, rankedin_url, sapa_status, entry_fee, category_fees'),
                        supabase.from('tournament_participants').select('event_id')
                            .or(`email.ilike.${playerData.email},profile_id.eq.${playerData.id}`)
                            .eq('is_paid', true),
                        supabase.from('payments').select('event_id')
                            .eq('player_id', playerData.id)
                            .eq('status', 'success')
                            .eq('payment_type', 'event_entry_fee'),
                    ]);

                    const paidEventIds = new Set([
                        ...(paidParticipantsRes.data || []).map(p => p.event_id),
                        ...(directPaymentsRes.data || []).map(p => p.event_id),
                    ]);

                    if (dbEventsRes.data) {
                        filtered.forEach(e => {
                            const match = dbEventsRes.data.find(dbE => dbE.rankedin_url?.includes(`/tournament/${e.id}/`));
                            if (match) {
                                e.db_id = match.id;
                                e.slug = match.slug;
                                e.sapa_status = match.sapa_status;
                                e.entry_fee = match.entry_fee;
                                e.category_fees = match.category_fees;
                                e.isPaid = paidEventIds.has(match.id);
                            }
                        });
                    }
                }

                // Update UI and cache
                setUpcomingEvents(filtered);
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), events: filtered }));
                } catch (_) {}
            } catch (err) {
                console.error('Hero events error:', err);
            }
        };

        fetchPlayerEvents();
    }, [session, getPlayerEventsAsync]);

    return (
        <div className="relative w-full px-4 md:px-6 pb-2 md:pb-6 bg-black">
            <div className="relative h-[75vh] md:h-[85vh] w-full overflow-hidden rounded-[2rem] border border-white/10">
                {/* Parallax Background */}
                <motion.div
                    style={{ y: yBackend }}
                    animate={{ scale: [1.1, 1.15] }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "linear"
                    }}
                    className="absolute inset-0 z-0"
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/80 z-10" />
                    <img
                        src={heroBg}
                        alt="Premium Padel Court"
                        className="w-full h-full object-cover"
                    />
                </motion.div>

                {/* Hero Content */}
                <motion.div
                    style={{ opacity: opacityText }}
                    className="relative z-20 h-full flex flex-col justify-start pt-28 md:justify-center md:pt-0 px-6 md:px-20 container mx-auto"
                >
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                        className="text-padel-green font-bold tracking-widest uppercase mb-2 text-sm md:text-base"
                    >
                        The Home of 4M Padel
                    </motion.p>

                    <div className="overflow-hidden">
                        <motion.h1
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                            className="text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-none mb-4 max-w-4xl"
                        >
                            FOR THE PLAYERS<br />
                            <span className="text-padel-green text-[12px] sm:text-sm md:text-2xl lg:text-3xl block mt-2 whitespace-nowrap tracking-tighter">Calendar • Tournaments • Players • Leaderboard • Training • Media</span>

                        </motion.h1>
                    </div>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8, duration: 0.8 }}
                        className="text-gray-300 text-lg md:text-xl max-w-xl mb-8 leading-relaxed flex items-center gap-2 flex-wrap"
                    >
                        Your online home for everything padel.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1, duration: 0.8 }}
                        className="flex flex-col sm:flex-row gap-4"
                    >
                        <button
                            onClick={() => navigate('/calendar')}
                            className="group relative px-8 py-4 bg-padel-green rounded-full font-bold !text-black overflow-hidden hover:scale-105 transition-transform duration-300 w-full sm:w-auto flex justify-center items-center"
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                View Tournaments
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="transform group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform">
                                    <path d="M1 11L11 1M11 1H1M11 1V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                        </button>

                        {!session && (
                            <button
                                onClick={() => setIsAuthModalOpen(true)}
                                className="group px-8 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full font-bold text-white hover:bg-white/20 transition-colors w-full sm:w-auto flex justify-center items-center"
                            >
                                Register
                            </button>
                        )}

                        {liveEvent && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                whileHover={{ scale: 1.05 }}
                                onClick={() => {
                                    if (liveEvent.live_youtube_url) {
                                        setVideoModal({
                                            isOpen: true,
                                            url: liveEvent.live_youtube_url,
                                            title: liveEvent.event_name
                                        });
                                    } else {
                                        navigate(`/calendar/${liveEvent.slug || liveEvent.id}`);
                                    }
                                }}
                                className="group px-8 py-4 bg-red-600 rounded-full font-bold text-white border border-red-500/50 shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:bg-red-700 transition-all w-full sm:w-auto flex justify-center items-center gap-3 relative overflow-hidden"
                            >
                                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] pointer-events-none" />
                                {liveEvent.live_youtube_url ? (
                                    <>
                                        <div className="relative">
                                            <PlayCircle className="w-5 h-5 animate-pulse" />
                                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full animate-ping" />
                                        </div>
                                        WATCH LIVE NOW
                                    </>
                                ) : (
                                    <>
                                        <PlayCircle className="w-5 h-5 opacity-50" />
                                        WATCH LIVE SOON
                                    </>
                                )}
                            </motion.button>
                        )}
                    </motion.div>
                </motion.div>

                {/* ── Upcoming Events strip — pinned to the bottom of the hero ── */}
                <AnimatePresence>
                    {session && upcomingEvents.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            transition={{ delay: 1.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                            className="absolute bottom-0 left-0 right-0 z-30 px-4 md:px-8 pb-5"
                        >
                            {/* Glass panel */}
                            <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl p-3 md:p-4">
                                {/* Header row */}
                                <div className="flex items-center justify-between mb-3 px-1">
                                    <div className="flex items-center gap-2">
                                        <Calendar size={13} className="text-purple-400" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/70">My Upcoming Events</span>
                                    </div>
                                    <button
                                        onClick={() => navigate('/profile')}
                                        className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-purple-400 hover:text-white transition-colors group"
                                    >
                                        View all
                                        <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                                    </button>
                                </div>

                                {/* Event cards — horizontal scroll on mobile, row on desktop */}
                                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                                    {upcomingEvents.map((event, idx) => {
                                        // colour accent
                                        let accent = 'border-white/10 hover:border-padel-green/50';
                                        let dateCls = 'text-padel-green';
                                        if (event.sapa_status === 'Major') { accent = 'border-white/10 hover:border-red-500/50'; dateCls = 'text-red-400'; }
                                        else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') { accent = 'border-white/10 hover:border-amber-500/50'; dateCls = 'text-amber-400'; }
                                        else if (event.sapa_status === 'Gold') { accent = 'border-white/10 hover:border-yellow-500/50'; dateCls = 'text-yellow-400'; }

                                        return (
                                            <motion.button
                                                key={event.id}
                                                initial={{ opacity: 0, x: 10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 1.2 + idx * 0.08 }}
                                                onClick={() => {
                                                    if (event.slug || event.db_id) navigate(`/calendar/${event.slug || event.db_id}`);
                                                    else window.open(`https://www.rankedin.com/en/tournament/${event.id}`, '_blank');
                                                }}
                                                className={`relative flex-shrink-0 w-48 md:w-56 bg-white/5 border ${accent} rounded-xl p-3 text-left transition-all group overflow-hidden`}
                                            >
                                                {/* PAID badge */}
                                                {event.isPaid && (
                                                    <span className="absolute top-2 right-2 flex items-center gap-0.5 bg-padel-green/20 border border-padel-green/30 text-padel-green text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full">
                                                        <CheckCircle2 size={7} strokeWidth={4} /> Paid
                                                    </span>
                                                )}
                                                <p className={`text-[9px] font-black uppercase tracking-wider mb-1 ${dateCls}`}>
                                                    {new Date(event.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </p>
                                                <p className="text-xs font-black text-white uppercase tracking-tight line-clamp-2 group-hover:text-padel-green transition-colors">
                                                    {event.event_name}
                                                </p>
                                                <ExternalLink size={10} className="absolute bottom-2.5 right-2.5 text-white/20 group-hover:text-white/50 transition-colors" />
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
            <VideoModal
                isOpen={videoModal.isOpen}
                onClose={() => setVideoModal({ ...videoModal, isOpen: false })}
                videoUrl={videoModal.url}
                title={videoModal.title}
            />
        </div>
    );
};

export default Hero;
