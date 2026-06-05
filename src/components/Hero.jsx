import React, { useState, useCallback } from 'react';
import { motion, useScroll, useTransform, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import heroBg from '../assets/hero_bg.png';
import AuthModal from './AuthModal';
import { supabase } from '../supabaseClient';
import { PlayCircle, Calendar, ChevronRight, CheckCircle2, ExternalLink, Trophy, MapPin, Swords } from 'lucide-react';
import VideoModal from './VideoModal';
import { useEffect } from 'react';
import { useRankedin } from '../hooks/useRankedin';
import HappeningNowWidget from './HappeningNowWidget';

const Hero = () => {
    const { scrollY } = useScroll();
    const yBackend = useTransform(scrollY, [0, 500], [0, 150]);
    const opacityText = useTransform(scrollY, [0, 300], [1, 0]);
    
    // Mouse tracking for desktop light effect
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);
    const smoothMouseX = useSpring(mouseX, { damping: 50, stiffness: 400 });
    const smoothMouseY = useSpring(mouseY, { damping: 50, stiffness: 400 });

    const handleMouseMove = (e) => {
        const { currentTarget, clientX, clientY } = e;
        const { left, top } = currentTarget.getBoundingClientRect();
        mouseX.set(clientX - left);
        mouseY.set(clientY - top);
    };
    const navigate = useNavigate();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [liveEvent, setLiveEvent] = useState(null);
    const [videoModal, setVideoModal] = useState({ isOpen: false, url: '', title: '' });
    const [session, setSession] = useState(null);
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const [nextMatch, setNextMatch] = useState(null);
    const [eventsLoading, setEventsLoading] = useState(false);
    const { getPlayerEventsAsync, getPlayerMatches } = useRankedin();

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

    // Fetch upcoming events and matches when session changes
    useEffect(() => {
        if (!session?.user) {
            setUpcomingEvents([]);
            setNextMatch(null);
            setEventsLoading(false);
            return;
        }

        const controller = new AbortController();
        const signal = controller.signal;

        const CACHE_KEY = `hero_events_${session.user.email}`;
        const MATCH_CACHE_KEY = `hero_match_${session.user.email}`;
        const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

        const fetchPlayerEventsAndMatches = async () => {
            try {
                // Check player details cache
                const PLAYER_METADATA_KEY = `player_metadata_${session.user.email}`;
                let playerData = null;
                try {
                    const cachedPlayer = localStorage.getItem(PLAYER_METADATA_KEY);
                    if (cachedPlayer) {
                        playerData = JSON.parse(cachedPlayer);
                    }
                } catch (_) { }

                if (!playerData || !playerData.rankedin_id) {
                    const { data, error } = await supabase
                        .from('players')
                        .select('id, rankedin_id, email')
                        .ilike('email', session.user.email)
                        .maybeSingle();

                    if (error) throw error;
                    if (data?.rankedin_id) {
                        playerData = data;
                        try {
                            localStorage.setItem(PLAYER_METADATA_KEY, JSON.stringify(data));
                        } catch (_) { }
                    }
                }

                if (!playerData?.rankedin_id) {
                    setEventsLoading(false);
                    return;
                }

                if (signal.aborted) return;

                // Fetch events and matches in parallel using the signal
                const [rawEvents, rawMatches] = await Promise.all([
                    getPlayerEventsAsync(playerData.rankedin_id, signal),
                    getPlayerMatches(playerData.rankedin_id, false, 20, signal)
                ]);

                if (signal.aborted) return;

                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                const filtered = (rawEvents || [])
                    .filter(e => {
                        const eventEnd = e.end_date ? new Date(e.end_date) : new Date(e.start_date);
                        eventEnd.setHours(23, 59, 59, 999);
                        return eventEnd >= startOfToday && e.state !== 2;
                    })
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

                    if (signal.aborted) return;

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

                // Filter & sort matches in ascending chronological order to find next match
                const validMatches = (rawMatches || []).filter(m => m.Info?.EventName && m.Info.EventName !== 'EventName');
                const parseDate = (dateStr) => {
                    if (!dateStr) return new Date(0);
                    if (dateStr.includes('T') || dateStr.includes('-')) {
                        return new Date(dateStr);
                    }
                    const [datePart, timePart] = dateStr.split(' ');
                    const [day, month, year] = datePart.split('/');
                    return new Date(`${year}-${month}-${day}T${timePart || '00:00'}:00`);
                };
                validMatches.sort((a, b) => parseDate(a.Info?.Date) - parseDate(b.Info?.Date));
                const firstNextMatch = validMatches[0] || null;

                if (signal.aborted) return;

                // Update UI and cache
                setUpcomingEvents(filtered);
                setNextMatch(firstNextMatch);
                setEventsLoading(false);

                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), events: filtered }));
                    localStorage.setItem(MATCH_CACHE_KEY, JSON.stringify({ ts: Date.now(), match: firstNextMatch }));
                } catch (_) { }
            } catch (err) {
                if (err.name === 'AbortError') return;
                console.error('Hero events and matches error:', err);
                setEventsLoading(false);
            }
        };

        // ── Step 1: Read cache and render immediately (SWR) ──
        let hasCachedData = false;
        let isCacheExpired = true;

        try {
            const cachedEvents = localStorage.getItem(CACHE_KEY);
            if (cachedEvents) {
                const { ts, events } = JSON.parse(cachedEvents);
                if (events && Array.isArray(events)) {
                    setUpcomingEvents(events);
                    hasCachedData = true;
                    if (Date.now() - ts < CACHE_TTL) {
                        isCacheExpired = false;
                    }
                }
            }
        } catch (_) { }

        try {
            const cachedMatch = localStorage.getItem(MATCH_CACHE_KEY);
            if (cachedMatch) {
                const { ts, match } = JSON.parse(cachedMatch);
                if (match) {
                    setNextMatch(match);
                    hasCachedData = true;
                    if (Date.now() - ts < CACHE_TTL) {
                        isCacheExpired = false;
                    }
                }
            }
        } catch (_) { }

        // If no cache, set loading true to show shimmering skeletons immediately
        if (!hasCachedData) {
            setEventsLoading(true);
        }

        // ── Step 2: Background fetch if missing or expired ──
        if (isCacheExpired || !hasCachedData) {
            fetchPlayerEventsAndMatches();
        } else {
            setEventsLoading(false);
        }

        return () => {
            controller.abort();
        };
    }, [session, getPlayerEventsAsync, getPlayerMatches]);

    return (
        <div className="relative w-full px-0 md:px-6 pb-0 md:pb-6 bg-black">
            <div 
                className="relative w-full overflow-hidden rounded-none md:rounded-[2rem] border-y border-x-0 md:border border-white/10 flex flex-col justify-between lg:block lg:h-[85vh] lg:min-h-0"
                onMouseMove={handleMouseMove}
            >
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
                    className="absolute inset-0 z-0 bg-black"
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-[#060913]/90 via-[#060913]/50 to-[#060913]/95 z-10" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#060913]/90 via-transparent to-[#060913]/90 z-10" />

                    {/* Floating Orbs (Ambient for Mobile) */}
                    <motion.div
                        animate={{
                            scale: [1, 1.5, 1],
                            opacity: [0.3, 0.7, 0.3],
                            x: [0, 300, -150, 0],
                            y: [0, -200, 150, 0]
                        }}
                        transition={{
                            duration: 8,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                        className="absolute lg:hidden top-1/4 left-1/4 w-72 h-72 bg-padel-green/80 rounded-full blur-[80px] mix-blend-screen z-10 pointer-events-none"
                    />
                    
                    {/* Mouse Follow Orb (Desktop only) */}
                    <motion.div
                        style={{
                            x: smoothMouseX,
                            y: smoothMouseY,
                            left: -200,
                            top: -200,
                        }}
                        className="absolute hidden lg:block w-[400px] h-[400px] bg-padel-green/60 rounded-full blur-[100px] mix-blend-screen z-10 pointer-events-none"
                    />
                    <motion.div
                        animate={{
                            scale: [1, 1.8, 1],
                            opacity: [0.2, 0.6, 0.2],
                            x: [0, -300, 200, 0],
                            y: [0, 250, -150, 0]
                        }}
                        transition={{
                            duration: 10,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 1
                        }}
                        className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/80 rounded-full blur-[100px] mix-blend-screen z-10 pointer-events-none"
                    />

                    <img
                        src={heroBg}
                        alt="Premium Padel Court"
                        className="w-full h-full object-cover opacity-50 mix-blend-luminosity"
                    />
                </motion.div>

                {/* Hero Content */}
                <motion.div
                    style={{ opacity: opacityText }}
                    className="relative z-20 flex flex-col justify-start pt-24 pb-8 lg:h-full lg:justify-center lg:pt-0 lg:pb-0 px-6 lg:px-20 container mx-auto"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-padel-green/20 text-padel-green bg-padel-green/5 text-[10px] font-bold uppercase tracking-widest mb-6 max-w-fit"
                    >
                        <Trophy className="w-3.5 h-3.5" />
                        <span>The Home of 4M Padel</span>
                    </motion.div>

                    <div className="overflow-hidden mb-6">
                        <motion.h1
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                            className="text-6xl md:text-8xl lg:text-[110px] xl:text-[130px] font-bold text-white leading-[0.9] tracking-tighter max-w-5xl font-display"
                        >
                            FOR THE <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-300 to-gray-500">
                                PLAYERS.
                            </span>
                        </motion.h1>
                    </div>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8, duration: 0.8 }}
                        className="text-gray-400 text-lg md:text-xl lg:text-2xl max-w-2xl mb-8 leading-relaxed font-light"
                    >
                        The platform connecting the padel community. <strong className="text-white font-medium">Events, rankings, clubs, players and organisers</strong>. — all in one place.
                    </motion.p>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1, duration: 0.8 }}
                        className="flex flex-col sm:flex-row items-center gap-4"
                    >
                        <button
                            onClick={() => navigate('/calendar')}
                            className="group relative px-8 py-4 bg-padel-green rounded-full font-black text-black text-sm tracking-widest uppercase overflow-hidden hover:scale-105 transition-all duration-300 w-full sm:w-auto flex justify-center items-center shadow-[0_0_30px_rgba(46,213,115,0.2)] hover:shadow-[0_0_40px_rgba(46,213,115,0.4)]"
                        >
                            <span className="relative z-10 flex items-center justify-center gap-2">
                                View Tournaments
                                <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                            </span>
                        </button>

                        {!session && (
                            <button
                                onClick={() => setIsAuthModalOpen(true)}
                                className="group relative px-8 py-4 bg-black/40 backdrop-blur-md border border-white/10 hover:border-white/30 rounded-full font-bold text-white text-sm tracking-widest uppercase transition-all duration-300 w-full sm:w-auto flex justify-center items-center overflow-hidden"
                            >
                                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] pointer-events-none" />
                                <span className="relative z-10 flex items-center justify-center gap-2 text-white/80 group-hover:text-white">
                                    Register / Login
                                </span>
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
                
                {/* ── Upcoming Events & Next Match strip — pinned to the bottom of the hero ── */}
                <div className="relative z-30 px-4 pb-5 mt-auto lg:absolute lg:bottom-0 lg:left-0 lg:right-0 lg:px-8 lg:pb-5 flex flex-col gap-4">
                    {/* Happening Now Widget — Global live events */}
                    <HappeningNowWidget />
                    
                    <AnimatePresence>
                        {session && (upcomingEvents.length > 0 || nextMatch || eventsLoading) && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                transition={{ delay: 1.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                                className="w-full"
                            >
                            {/* Glass panel */}
                            <div className="bg-white/5 backdrop-blur-3xl border border-white/10 rounded-3xl p-4 md:p-5 shadow-2xl relative overflow-hidden">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-0 relative z-10">

                                    {eventsLoading && upcomingEvents.length === 0 && !nextMatch ? (
                                        // ── Shimmering Skeleton UI ──
                                        <>
                                            {/* Left Side Skeleton: Upcoming Events */}
                                            <div className="order-2 lg:order-1 lg:col-span-8 lg:pr-5">
                                                <div className="flex items-center justify-between mb-3.5 px-1 animate-pulse">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400" />
                                                        <div className="w-24 h-3 bg-white/10 rounded" />
                                                    </div>
                                                    <div className="w-12 h-3 bg-white/10 rounded" />
                                                </div>

                                                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                                                    {[1, 2, 3].map((item) => (
                                                        <div
                                                            key={item}
                                                            className="relative flex-shrink-0 w-52 md:w-64 h-[130px] bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-left animate-pulse flex flex-col justify-between overflow-hidden shadow-lg"
                                                        >
                                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />

                                                            <div className="flex justify-between items-start mb-2">
                                                                <span className="w-12 h-3.5 bg-purple-500/10 border border-purple-500/20 rounded" />
                                                                <span className="w-6 h-3 bg-white/10 rounded" />
                                                            </div>

                                                            <div className="space-y-1.5 mb-3.5">
                                                                <div className="w-full h-3 bg-white/10 rounded" />
                                                                <div className="w-2/3 h-3 bg-white/10 rounded" />
                                                            </div>

                                                            <div className="flex items-center justify-between mt-auto border-t border-white/5 pt-2">
                                                                <div className="w-20 h-2.5 bg-purple-500/10 rounded" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Right Side Skeleton: My Next Match */}
                                            <div className="order-1 lg:order-2 lg:col-span-4 lg:border-l lg:border-white/10 lg:pl-6">
                                                <div className="flex items-center justify-between mb-3.5 px-1 animate-pulse">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-5 h-5 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-400" />
                                                        <div className="w-24 h-3 bg-white/10 rounded" />
                                                    </div>
                                                    <div className="w-16 h-3 bg-white/10 rounded" />
                                                </div>

                                                <div className="w-full h-[130px] bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 animate-pulse flex flex-col justify-between relative overflow-hidden shadow-lg">
                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />

                                                    <div className="flex justify-between items-start gap-3 border-b border-white/5 pb-2">
                                                        <div className="w-24 h-2.5 bg-orange-500/10 rounded" />
                                                        <div className="w-10 h-2.5 bg-white/10 rounded" />
                                                    </div>

                                                    <div className="flex items-center justify-center gap-4 sm:gap-6 py-2.5">
                                                        <div className="flex-1 flex flex-col items-end space-y-1">
                                                            <div className="w-16 h-2.5 bg-white/10 rounded" />
                                                            <div className="w-10 h-2 bg-white/5 rounded" />
                                                        </div>
                                                        <div className="w-7 h-7 rounded-full bg-orange-500/15 border border-orange-500/20 flex items-center justify-center" />
                                                        <div className="flex-1 flex flex-col items-start space-y-1">
                                                            <div className="w-16 h-2.5 bg-white/10 rounded" />
                                                            <div className="w-10 h-2 bg-white/5 rounded" />
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-auto">
                                                        <div className="w-24 h-2.5 bg-white/10 rounded" />
                                                        <div className="w-10 h-2.5 bg-orange-500/10 rounded" />
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        // ── Actual Data ──
                                        <>
                                            {/* Left Side: Upcoming Events */}
                                            {upcomingEvents.length > 0 && (
                                                <div className={`order-2 lg:order-1 ${nextMatch ? 'lg:col-span-8 lg:pr-5' : 'lg:col-span-12'}`}>
                                                    {/* Header row */}
                                                    <div className="flex items-center justify-between mb-3.5 px-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className="p-1 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.15)]">
                                                                <Calendar size={13} />
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/90">My Next Events</span>
                                                        </div>
                                                        <button
                                                            onClick={() => navigate('/profile')}
                                                            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-purple-400 hover:text-white transition-colors group"
                                                        >
                                                            View all
                                                            <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                                                        </button>
                                                    </div>

                                                    {/* Event cards — horizontal scroll */}
                                                    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
                                                        {upcomingEvents.map((event, idx) => {
                                                            // colour accent
                                                            let accent = 'hover:border-padel-green/40 hover:shadow-[0_0_15px_rgba(46,213,115,0.1)]';
                                                            let dateCls = 'text-padel-green';
                                                            let glowBg = 'from-padel-green/10 to-transparent';
                                                            let ringCls = 'border-padel-green/30 text-padel-green';

                                                            if (event.sapa_status === 'Major') {
                                                                accent = 'hover:border-red-500/40 hover:shadow-[0_0_15px_rgba(239,68,68,0.1)]';
                                                                dateCls = 'text-red-400';
                                                                glowBg = 'from-red-500/10 to-transparent';
                                                                ringCls = 'border-red-500/30 text-red-400';
                                                            } else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') {
                                                                accent = 'hover:border-amber-500/40 hover:shadow-[0_0_15px_rgba(245,158,11,0.1)]';
                                                                dateCls = 'text-amber-400';
                                                                glowBg = 'from-amber-500/10 to-transparent';
                                                                ringCls = 'border-amber-500/30 text-amber-400';
                                                            } else if (event.sapa_status === 'Gold') {
                                                                accent = 'hover:border-yellow-500/40 hover:shadow-[0_0_15px_rgba(234,179,8,0.1)]';
                                                                dateCls = 'text-yellow-400';
                                                                glowBg = 'from-yellow-500/10 to-transparent';
                                                                ringCls = 'border-yellow-500/30 text-yellow-400';
                                                            }

                                                            return (
                                                                <motion.button
                                                                    key={event.id}
                                                                    initial={{ opacity: 0, y: 15 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    transition={{ delay: 1.2 + idx * 0.08, type: 'spring', stiffness: 100 }}
                                                                    onClick={() => {
                                                                        if (event.slug || event.db_id) navigate(`/calendar/${event.slug || event.db_id}`);
                                                                        else window.open(`https://www.rankedin.com/en/tournament/${event.id}`, '_blank');
                                                                    }}
                                                                    className={`relative flex-shrink-0 w-52 md:w-64 bg-white/5 backdrop-blur-md border border-white/10 ${accent} rounded-2xl p-4 text-left transition-all duration-300 group hover:-translate-y-1 hover:scale-[1.02] shadow-lg`}
                                                                >
                                                                    {/* Subtle status top gradient bar */}
                                                                    <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${glowBg}`} />

                                                                    <div className="flex justify-between items-start mb-2">
                                                                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-white/5 border ${ringCls}`}>
                                                                            {event.sapa_status || 'SAPA'}
                                                                        </span>

                                                                        {/* Paid Stamp / Icon */}
                                                                        {event.isPaid ? (
                                                                            <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-padel-green bg-padel-green/10 border border-padel-green/35 px-1.5 py-0.5 rounded-full animate-pulse-slow">
                                                                                <CheckCircle2 size={8} className="shrink-0" /> Paid
                                                                            </span>
                                                                        ) : (
                                                                            <ExternalLink size={9} className="text-white/25 group-hover:text-white/50 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
                                                                        )}
                                                                    </div>

                                                                    <p className="text-[11px] font-black text-white uppercase tracking-tight line-clamp-2 group-hover:text-padel-green transition-colors leading-snug mb-3.5 h-8">
                                                                        {event.event_name}
                                                                    </p>

                                                                    <div className="flex items-center justify-between mt-auto border-t border-white/5 pt-2">
                                                                        <span className={`text-[8px] font-bold ${dateCls} flex items-center gap-1`}>
                                                                            <Calendar size={10} className="shrink-0" />
                                                                            {new Date(event.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                        </span>
                                                                    </div>
                                                                </motion.button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Right Side: My Next Match */}
                                            {nextMatch && (
                                                <div className={`order-1 lg:order-2 ${upcomingEvents.length > 0 ? 'lg:col-span-4 lg:border-l lg:border-white/10 lg:pl-6' : 'lg:col-span-12'}`}>
                                                    {/* Header row */}
                                                    <div className="flex items-center justify-between mb-3.5 px-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className="p-1 rounded-md bg-orange-500/10 border border-orange-500/20 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.15)]">
                                                                <Trophy size={13} />
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-white/90">My Next Match</span>
                                                        </div>
                                                        <button
                                                            onClick={() => navigate('/profile?tab=matches')}
                                                            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-orange-400 hover:text-white transition-colors group"
                                                        >
                                                            View Matches
                                                            <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                                                        </button>
                                                    </div>

                                                    {/* Match Card */}
                                                    {(() => {
                                                        const info = nextMatch.Info || {};

                                                        // Parse partners and names
                                                        const team1P1 = info.Challenger?.Name || 'TBD';
                                                        const team1P2 = info.Challenger1?.Name;
                                                        const team2P1 = info.Challenged?.Name || 'TBD';
                                                        const team2P2 = info.Challenged1?.Name;

                                                        return (
                                                            <div
                                                                onClick={() => navigate('/profile?tab=matches')}
                                                                className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 hover:border-orange-500/40 rounded-xl p-3.5 text-left transition-all duration-300 group overflow-hidden cursor-pointer flex flex-col justify-between h-[125px] relative hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(249,115,22,0.15)]"
                                                            >
                                                                {/* Soft background glow */}
                                                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.08)_0%,transparent_75%)] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                                                {/* Top Bar: Event Name and Date */}
                                                                <div className="flex justify-between items-start gap-3 border-b border-white/5 pb-2">
                                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.8)] shrink-0" />
                                                                        <span className="text-[8px] font-black text-orange-400 uppercase tracking-widest truncate">
                                                                            {info.EventName || 'Next Match'}
                                                                        </span>
                                                                    </div>
                                                                    {info.Date && (
                                                                        <span className="text-[8px] font-bold text-white/50 whitespace-nowrap bg-white/5 border border-white/10 px-1.5 py-0.5 rounded shrink-0">
                                                                            {info.Date}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Centered Matchup Section */}
                                                                <div className="flex items-center justify-center gap-4 sm:gap-6 py-2.5 relative">
                                                                    {/* Team 1 (Challengers) */}
                                                                    <div className="flex-1 flex flex-col items-end text-right min-w-0">
                                                                        <span className="text-[11px] font-black text-white truncate w-full uppercase tracking-tight group-hover:text-orange-400 transition-colors">
                                                                            {team1P1}
                                                                        </span>
                                                                        {team1P2 && (
                                                                            <span className="text-[8px] font-semibold text-white/60 truncate w-full uppercase tracking-wider mt-0.5">
                                                                                {team1P2}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {/* VS Badge */}
                                                                    <div className="relative shrink-0 flex items-center justify-center">
                                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-orange-500 via-amber-500 to-yellow-500 flex items-center justify-center shadow-[0_0_12px_rgba(249,115,22,0.4)] border border-orange-400/30 group-hover:scale-110 transition-transform duration-300">
                                                                            <span className="text-[8px] font-black text-black tracking-widest font-sans scale-90">VS</span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Team 2 (Challenged) */}
                                                                    <div className="flex-1 flex flex-col items-start text-left min-w-0">
                                                                        <span className="text-[11px] font-black text-white truncate w-full uppercase tracking-tight group-hover:text-orange-400 transition-colors">
                                                                            {team2P1}
                                                                        </span>
                                                                        {team2P2 && (
                                                                            <span className="text-[8px] font-semibold text-white/60 truncate w-full uppercase tracking-wider mt-0.5">
                                                                                {team2P2}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Bottom Bar: Location and Court */}
                                                                <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-auto">
                                                                    <div className="flex items-center gap-1.5 min-w-0 max-w-[70%]">
                                                                        <MapPin size={10} className="text-padel-green shrink-0" />
                                                                        <span className="text-[8px] font-bold text-white/50 truncate uppercase tracking-wider">
                                                                            {info.Location || info.Venue || 'Location TBD'}
                                                                        </span>
                                                                    </div>
                                                                    {info.Court && (
                                                                        <span className="text-[7px] font-black bg-orange-500/10 border border-orange-500/25 text-orange-400 px-1.5 py-0.5 rounded uppercase tracking-widest whitespace-nowrap scale-95 shrink-0">
                                                                            {info.Court}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </>
                                    )}

                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                </div>
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
