import React, { useState, useCallback } from 'react';
import { motion, useScroll, useTransform, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import heroBg from '../assets/herobg.jpeg';
import AuthModal from './AuthModal';
import { supabase } from '../supabaseClient';
import { PlayCircle, Calendar, ChevronRight, CheckCircle2, ExternalLink, Trophy, MapPin, Swords, Star } from 'lucide-react';
import VideoModal from './VideoModal';
import { useEffect } from 'react';
import { useRankedin } from '../hooks/useRankedin';
import HappeningNowWidget from './HappeningNowWidget';

const Hero = () => {
    const { scrollY } = useScroll();
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
    const [matchesCount, setMatchesCount] = useState(0);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [activeHeroTab, setActiveHeroTab] = useState('matches'); // 'events' | 'matches'
    const [player, setPlayer] = useState(null);
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
            setMatchesCount(0);
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
                        .select('id, rankedin_id, email, name')
                        .ilike('email', session.user.email)
                        .maybeSingle();

                    if (error) throw error;
                    if (data?.email) {
                        playerData = data;
                        try {
                            localStorage.setItem(PLAYER_METADATA_KEY, JSON.stringify(data));
                        } catch (_) { }
                    }
                }

                if (!playerData?.email) {
                    setEventsLoading(false);
                    return;
                }

                if (signal.aborted) return;

                // Fetch events and matches in parallel using the signal
                const [rawEvents, rawMatches] = await Promise.all([
                    playerData.rankedin_id ? getPlayerEventsAsync(playerData.rankedin_id, signal) : Promise.resolve([]),
                    playerData.rankedin_id ? getPlayerMatches(playerData.rankedin_id, false, 20, signal) : Promise.resolve([])
                ]);

                if (signal.aborted) return;

                const localRegsRes = await supabase
                    .from('event_registrations')
                    .select('*, calendar(*)')
                    .or(`email.ilike.${playerData.email},partner_email.ilike.${playerData.email}`)
                    .neq('status', 'withdrawn');
                const localRegs = localRegsRes.data || [];

                const activeManualEventIds = new Set(
                    localRegs.map((r) => r.event_id || r.calendar?.id).filter(Boolean),
                );
                const paidManualEventIds = new Set(
                    localRegs
                        .filter((r) => {
                            const isRegistrant = r.email?.toLowerCase() === playerData.email?.toLowerCase();
                            const isPartner = r.partner_email?.toLowerCase() === playerData.email?.toLowerCase();
                            if (isRegistrant && r.payment_status === 'paid') return true;
                            if (isPartner && r.partner_payment_status === 'paid') return true;
                            return false;
                        })
                        .map((r) => r.event_id || r.calendar?.id)
                        .filter(Boolean),
                );

                const allEvents = rawEvents || [];
                localRegs.forEach(reg => {
                    const cal = reg.calendar;
                    if (!cal) return;
                    const rankedinMatch = cal.rankedin_url ? cal.rankedin_url.match(/\/tournament\/(\d+)/) : null;
                    const rId = rankedinMatch ? rankedinMatch[1] : null;
                    const isDuplicate = allEvents.some(e => e.id?.toString() === rId);

                    if (!isDuplicate && !allEvents.some(e => e.db_id === cal.id || e.id === `local_${cal.id}`)) {
                        const isRegistrant = reg.email?.toLowerCase() === playerData.email?.toLowerCase();
                        const userPaymentStatus = isRegistrant ? reg.payment_status : reg.partner_payment_status;
                        allEvents.push({
                            id: `local_${cal.id}`,
                            db_id: cal.id,
                            start_date: cal.start_date,
                            end_date: cal.end_date,
                            event_name: cal.event_name,
                            state: 1,
                            payment_status: userPaymentStatus,
                            isPaid: userPaymentStatus === 'paid',
                        });
                    }
                });

                const startOfToday = new Date();
                startOfToday.setHours(0, 0, 0, 0);
                const currentMonth = startOfToday.getMonth();
                const currentYear = startOfToday.getFullYear();

                const uniqueEventsMap = new Map();
                allEvents.forEach(e => {
                    if (e.id?.toString().startsWith('local_') && !activeManualEventIds.has(e.db_id)) {
                        return;
                    }
                    const key = e.id?.toString().startsWith('local_') ? `local_${e.db_id}` : `rankedin_${e.id}`;
                    if (!uniqueEventsMap.has(key)) {
                        uniqueEventsMap.set(key, e);
                    }
                });
                const uniqueEvents = Array.from(uniqueEventsMap.values());

                let filtered = uniqueEvents
                    .filter(e => {
                        const eventEnd = e.end_date ? new Date(e.end_date) : new Date(e.start_date);
                        eventEnd.setHours(23, 59, 59, 999);
                        return eventEnd >= startOfToday && e.state !== 2;
                    })
                    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

                const currentMonthEvents = filtered.filter(e => {
                    const eventEnd = e.end_date ? new Date(e.end_date) : new Date(e.start_date);
                    return eventEnd.getMonth() === currentMonth && eventEnd.getFullYear() === currentYear;
                });

                if (currentMonthEvents.length > 0) {
                    filtered = currentMonthEvents;
                } else {
                    filtered = filtered.slice(0, 3);
                }

                if (filtered.length > 0) {
                    const [dbEventsRes, paidParticipantsRes] = await Promise.all([
                        supabase.from('calendar').select('id, slug, rankedin_url, sapa_status, entry_fee, category_fees, venue, city'),
                        supabase.from('tournament_participants').select('event_id')
                            .or(`email.ilike.${playerData.email},profile_id.eq.${playerData.id}`)
                            .eq('is_paid', true),
                    ]);

                    if (signal.aborted) return;

                    const paidEventIds = new Set([
                        ...paidManualEventIds,
                        ...(paidParticipantsRes.data || []).map(p => p.event_id),
                    ]);

                    if (dbEventsRes.data) {
                        filtered.forEach(e => {
                            const match = e.id?.toString().startsWith('local_')
                                ? dbEventsRes.data.find(dbE => dbE.id === e.db_id)
                                : dbEventsRes.data.find(dbE => dbE.rankedin_url?.includes(`/tournament/${e.id}/`));
                            if (match) {
                                e.db_id = match.id;
                                e.slug = match.slug;
                                e.sapa_status = match.sapa_status;
                                e.entry_fee = match.entry_fee;
                                e.category_fees = match.category_fees;
                                e.venue = match.venue;
                                e.city = match.city;
                                e.isPaid = e.id?.toString().startsWith('local_')
                                    ? paidManualEventIds.has(match.id)
                                    : paidEventIds.has(match.id);
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
                setMatchesCount(validMatches.length);
                setEventsLoading(false);

                if (firstNextMatch) {
                    setActiveHeroTab('matches');
                } else if (filtered.length > 0) {
                    setActiveHeroTab('events');
                }

                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), events: filtered }));
                    localStorage.setItem(MATCH_CACHE_KEY, JSON.stringify({ ts: Date.now(), match: firstNextMatch, count: validMatches.length }));
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
        let hasCachedMatch = false;

        try {
            const cachedMatch = localStorage.getItem(MATCH_CACHE_KEY);
            if (cachedMatch) {
                const { ts, match, count } = JSON.parse(cachedMatch);
                if (match) {
                    setNextMatch(match);
                    setMatchesCount(count || 1);
                    hasCachedData = true;
                    hasCachedMatch = true;
                    if (Date.now() - ts < CACHE_TTL) {
                        isCacheExpired = false;
                    }
                    setActiveHeroTab('matches');
                }
            }
        } catch (_) { }

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
                    if (!hasCachedMatch && events.length > 0) {
                        setActiveHeroTab('events');
                    }
                }
            }
        } catch (_) { }

        // If no cache, set loading true to show shimmering skeletons immediately
        if (!hasCachedData) {
            setEventsLoading(true);
        }

        // ── Step 2: Always refresh in background (cache is display-only) ──
        fetchPlayerEventsAndMatches();

        const handleRegistrationsChanged = () => {
            try {
                localStorage.removeItem(CACHE_KEY);
                localStorage.removeItem(MATCH_CACHE_KEY);
            } catch (_) { }
            fetchPlayerEventsAndMatches();
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') fetchPlayerEventsAndMatches();
        };
        window.addEventListener('4m:registrations-changed', handleRegistrationsChanged);
        window.addEventListener('visibilitychange', handleVisibility);

        return () => {
            controller.abort();
            window.removeEventListener('4m:registrations-changed', handleRegistrationsChanged);
            window.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [session, getPlayerEventsAsync, getPlayerMatches]);

    // Fetch lightweight player profile (name, ranking, points) for the personalized greeting/stats
    useEffect(() => {
        if (!session?.user) {
            setPlayer(null);
            return;
        }

        const email = session.user.email;
        const CACHE_KEY = `hero_player_stats_${email}`;

        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) setPlayer(JSON.parse(cached));
        } catch (_) { }

        supabase
            .from('players')
            .select('name, rank_label, points, region')
            .ilike('email', email)
            .maybeSingle()
            .then(({ data, error }) => {
                if (data && !error) {
                    setPlayer(data);
                    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) { }
                }
            });
    }, [session]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    };

    const firstName = player?.name ? player.name.split(' ')[0] : null;

    return (
        <div className="relative w-full bg-black">
            <div
                className="relative w-full overflow-hidden border-y border-white/10 flex flex-col justify-center min-h-[90vh] lg:min-h-[80vh]"
                onMouseMove={handleMouseMove}
            >
                {/* Solid base background — text sits on this, never on the photo */}
                <div className="absolute inset-0 z-0 bg-[#060913]" />

                {/* Photo panel — anchored to the right, shown in the space the text doesn't use (not stretched as a full-bleed cover) */}
                <div
                    className="absolute top-0 right-0 z-0 w-[34%] sm:w-[36%] lg:w-[38%] xl:w-[40%] h-[52%] sm:h-[58%] lg:h-[65%] overflow-hidden"
                >
                    <img
                        src={heroBg}
                        alt="Premium Padel Court"
                        className="w-full h-full object-cover saturate-[0.45] contrast-[1.08]"
                    />
                    {/* Navy colour tint so the photo reads as part of the dark theme rather than its own warm/teal palette */}
                    <div className="absolute inset-0 bg-[#0B1730]/35 mix-blend-multiply" />
                    <div className="absolute inset-0 bg-[#060913]/10" />
                    {/* Fade the panel's left edge into the solid background so the crop doesn't read as a hard rectangle */}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#060913] from-0% via-[#060913]/40 via-25% to-transparent to-65%" />
                    {/* Fade the bottom edge so it dissolves into the solid background instead of ending abruptly */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#060913]" />
                </div>

                {/* Floating Orbs (Ambient for Mobile) */}
                {false && (
                    <>
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
                    </>
                )}

                {/* Hero Content */}
                <motion.div
                    style={{ opacity: opacityText }}
                    className="relative z-20 flex flex-col flex-none justify-start pt-24 pb-2 lg:pt-28 lg:pb-4 px-4 lg:px-8 container mx-auto"
                >
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-padel-green/20 text-padel-green bg-padel-green/5 text-[10px] md:text-[11px] font-bold uppercase tracking-widest mb-6 max-w-fit"
                    >
                        <Trophy className="w-3 h-3" />
                        <span>The Home of 4M Padel</span>
                    </motion.div>

                    <div className="overflow-hidden mb-6">
                        <motion.h1
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                            className="text-4xl sm:text-6xl md:text-8xl lg:text-[110px] xl:text-[130px] font-bold text-white leading-[1.1] md:leading-[0.9] tracking-tighter max-w-[100vw] font-display whitespace-nowrap lg:whitespace-normal"
                        >
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-300 to-gray-500">FOR THE PLAYERS.</span>
                        </motion.h1>
                    </div>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8, duration: 0.8 }}
                        className="text-gray-200 text-sm md:text-lg lg:text-xl max-w-[15rem] sm:max-w-sm md:max-w-md mb-8 leading-relaxed font-light whitespace-normal tracking-tight sm:tracking-normal"
                    >
                        <strong className="text-white font-medium">Events, rankings, clubs, players and organisers — all in one place</strong>.
                    </motion.p>

                    {/* Personalized Greeting + Stats — visible only when logged in */}
                    {session && player && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.9, duration: 0.8 }}
                            className="mb-6"
                        >
                            <p className="text-white text-base md:text-lg font-bold mb-3">
                                {getGreeting()}{firstName && <>, <span className="text-padel-green">{firstName}</span></>} <span aria-hidden="true">👋</span>
                            </p>
                            <div className="grid grid-cols-2 divide-x divide-white/10 max-w-[14rem] sm:max-w-[15.5rem] bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden">
                                <div className="flex flex-col items-center text-center gap-1 px-3 py-3">
                                    <div className="w-8 h-8 rounded-full bg-padel-green/10 flex items-center justify-center mb-0.5 shadow-[0_0_10px_rgba(204,255,0,0.15)]">
                                        <Trophy size={14} strokeWidth={1.75} className="text-padel-green" />
                                    </div>
                                    <p className="text-white/60 text-[9px] font-semibold leading-none">Ranking</p>
                                    <p className="text-padel-green font-black text-base leading-none">
                                        {player.rank_label && player.rank_label !== 'Unranked' ? `#${player.rank_label}` : '—'}
                                    </p>
                                    <p className="text-white/40 text-[8px] font-medium leading-none truncate">{player.region || 'National Ranking'}</p>
                                </div>
                                <div className="flex flex-col items-center text-center gap-1 px-3 py-3">
                                    <div className="w-8 h-8 rounded-full bg-padel-green/10 flex items-center justify-center mb-0.5 shadow-[0_0_10px_rgba(204,255,0,0.15)]">
                                        <Star size={14} strokeWidth={1.75} className="text-padel-green" />
                                    </div>
                                    <p className="text-white/60 text-[9px] font-semibold leading-none">Points</p>
                                    <p className="text-padel-green font-black text-base leading-none">
                                        {player.points !== undefined && player.points !== null ? player.points.toLocaleString() : '—'}
                                    </p>
                                    <p className="text-white/40 text-[8px] font-medium leading-none">Total Points</p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1, duration: 0.8 }}
                        className="flex flex-col sm:flex-row items-center gap-4 max-w-[15rem] sm:max-w-none"
                    >



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
                <div className="relative z-30 px-4 pb-20 lg:pb-5 mt-4 lg:mt-6 w-full lg:px-8 flex flex-col gap-4 container mx-auto">
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
                                <div className="bg-white/5 backdrop-blur-xl border-t border-l border-white/20 border-r border-b border-white/5 rounded-3xl p-4 md:p-5 shadow-2xl relative overflow-hidden">
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


                                            </>
                                        ) : (
                                            // ── Actual Data ──
                                            <div className="lg:col-span-12">
                                                {/* Tabs */}
                                                <div className="flex w-full mb-6 bg-transparent border border-white/10 rounded-xl p-1">
                                                    <button
                                                        onClick={() => setActiveHeroTab('matches')}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all text-xs sm:text-sm font-bold ${activeHeroTab === 'matches' ? 'border border-white/40 bg-white/5 text-white shadow-md' : 'text-white/50 hover:text-white'}`}
                                                    >
                                                        <Trophy size={16} /> Matches
                                                        {matchesCount > 0 && (
                                                            <span className="bg-orange-500 text-black text-[11px] font-black px-1.5 py-0.5 rounded-full flex items-center justify-center min-w-[20px] leading-none">
                                                                {matchesCount}
                                                            </span>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => setActiveHeroTab('events')}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-all text-xs sm:text-sm font-bold ${activeHeroTab === 'events' ? 'border border-white/40 bg-white/5 text-white shadow-md' : 'text-white/50 hover:text-white'}`}
                                                    >
                                                        <Calendar size={16} /> Events
                                                        {upcomingEvents.length > 0 && (
                                                            <span className="bg-padel-green text-black text-[11px] font-black px-1.5 py-0.5 rounded-full flex items-center justify-center min-w-[20px] leading-none">
                                                                {upcomingEvents.length}
                                                            </span>
                                                        )}
                                                    </button>
                                                </div>

                                                {/* Left Side: Upcoming Events */}
                                                {activeHeroTab === 'events' && (
                                                    upcomingEvents.length > 0 ? (
                                                        <div className="w-full bg-white/5 border border-white/10 rounded-2xl overflow-hidden animate-fade-in">
                                                            <div className="flex flex-col">
                                                                {upcomingEvents.map((event, idx) => {
                                                                    const startDate = new Date(event.start_date);
                                                                    const day = startDate.getDate();
                                                                    const month = startDate.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
                                                                    const weekday = startDate.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();
                                                                    const location = [event.venue, event.city].filter(Boolean).join(', ');

                                                                    let statusColors = { border: 'border-padel-green/40', text: 'text-padel-green' };
                                                                    if (event.sapa_status === 'Major') {
                                                                        statusColors = { border: 'border-red-500/40', text: 'text-red-500' };
                                                                    } else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') {
                                                                        statusColors = { border: 'border-amber-500/40', text: 'text-amber-500' };
                                                                    } else if (event.sapa_status === 'Gold') {
                                                                        statusColors = { border: 'border-yellow-400/40', text: 'text-yellow-400' };
                                                                    } else if (event.sapa_status === 'Silver') {
                                                                        statusColors = { border: 'border-gray-400/40', text: 'text-gray-400' };
                                                                    } else if (event.sapa_status === 'Bronze') {
                                                                        statusColors = { border: 'border-orange-700/40', text: 'text-orange-700' };
                                                                    }

                                                                    return (
                                                                        <button
                                                                            key={event.id}
                                                                            onClick={() => {
                                                                                if (event.slug || event.db_id) navigate(`/calendar/${event.slug || event.db_id}`);
                                                                                else if (!event.id.toString().startsWith('local_')) window.open(`https://www.rankedin.com/en/tournament/${event.id}`, '_blank');
                                                                            }}
                                                                            className={`flex items-center gap-4 p-4 hover:bg-white/5 transition-colors text-left group ${idx !== upcomingEvents.length - 1 ? 'border-b border-white/10' : ''}`}
                                                                        >
                                                                            <div className="flex items-center gap-3 shrink-0">
                                                                                <Calendar size={18} strokeWidth={1.75} className="text-padel-green" />
                                                                                <div className="flex flex-col items-center leading-none">
                                                                                    <span className="text-white font-bold text-xl leading-none">{day}</span>
                                                                                    <span className="text-padel-green text-[9px] font-black uppercase tracking-widest mt-1.5">{month}</span>
                                                                                    <span className="text-white/40 text-[8px] font-bold uppercase tracking-widest mt-0.5">{weekday}</span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="text-white text-sm font-bold uppercase truncate">{event.event_name}</p>
                                                                                <p className="text-[11px] text-white/50 mt-1 flex items-center gap-1.5 flex-wrap min-w-0">
                                                                                    {location && (
                                                                                        <span className="flex items-center gap-1 min-w-0">
                                                                                            <MapPin size={12} className="text-white/40 shrink-0" />
                                                                                            <span className="truncate">{location}</span>
                                                                                        </span>
                                                                                    )}
                                                                                    {location && <span className="text-white/20 font-light">|</span>}
                                                                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${statusColors.border} ${statusColors.text} bg-transparent`}>
                                                                                        {event.sapa_status || 'SAPA'}
                                                                                    </span>
                                                                                </p>
                                                                            </div>
                                                                            <ChevronRight size={18} className="text-padel-green shrink-0 transition-transform group-hover:translate-x-0.5" />
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center animate-fade-in">
                                                            <Calendar size={32} strokeWidth={1.5} className="text-white/20 mb-4" />
                                                            <h3 className="text-white font-bold text-sm mb-1">You have no upcoming events.</h3>
                                                            <p className="text-white/50 text-[11px] font-medium mb-6">Explore the calendar to find your next event.</p>
                                                            <button
                                                                onClick={() => navigate('/calendar')}
                                                                className="text-padel-green text-xs font-bold flex items-center gap-1 hover:text-padel-green/80 transition-colors"
                                                            >
                                                                Explore Calendar <ChevronRight size={14} />
                                                            </button>
                                                        </div>
                                                    )
                                                )}

                                                {/* Right Side: My Next Match */}
                                                {activeHeroTab === 'matches' && (
                                                    nextMatch ? (
                                                        <div className="w-full animate-fade-in bg-white/5 border border-white/10 rounded-2xl overflow-hidden p-4">
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
                                                                        className="w-full bg-white/[0.03] backdrop-blur-md border border-white/10 hover:border-orange-500/40 rounded-xl p-3.5 text-left transition-all duration-300 group overflow-hidden cursor-pointer flex flex-col justify-between min-h-[125px] relative hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(249,115,22,0.15)]"
                                                                    >
                                                                        {/* Soft background glow */}
                                                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.08)_0%,transparent_75%)] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                                                        {/* Top Bar: Event Name and Date */}
                                                                        <div className="flex justify-between items-start gap-3 border-b border-white/5 pb-2">
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shadow-[0_0_8px_rgba(249,115,22,0.8)] shrink-0" />
                                                                                <span className="text-xs font-bold text-orange-400 uppercase tracking-widest truncate">
                                                                                    {info.EventName || 'Next Match'}
                                                                                </span>
                                                                            </div>
                                                                            {info.Date && (
                                                                                <span className="text-xs font-medium text-white/70 whitespace-nowrap bg-white/5 border border-white/10 px-1.5 py-0.5 rounded shrink-0">
                                                                                    {info.Date}
                                                                                </span>
                                                                            )}
                                                                        </div>

                                                                        {/* Centered Matchup Section */}
                                                                        <div className="flex items-center justify-center gap-4 sm:gap-6 py-2.5 relative">
                                                                            {/* Team 1 (Challengers) */}
                                                                            <div className="flex-1 flex flex-col items-end text-right min-w-0">
                                                                                <span className="text-sm font-semibold text-white truncate w-full uppercase tracking-tight group-hover:text-orange-400 transition-colors">
                                                                                    {team1P1}
                                                                                </span>
                                                                                {team1P2 && (
                                                                                    <span className="text-xs font-medium text-white/70 truncate w-full uppercase tracking-wider mt-0.5">
                                                                                        {team1P2}
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            {/* VS Badge */}
                                                                            <div className="relative shrink-0 flex items-center justify-center">
                                                                                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-orange-500 via-amber-500 to-yellow-500 flex items-center justify-center shadow-[0_0_12px_rgba(249,115,22,0.4)] border border-orange-400/30 group-hover:scale-110 transition-transform duration-300">
                                                                                    <span className="text-[10px] font-bold text-black tracking-widest font-sans scale-90">VS</span>
                                                                                </div>
                                                                            </div>

                                                                            {/* Team 2 (Challenged) */}
                                                                            <div className="flex-1 flex flex-col items-start text-left min-w-0">
                                                                                <span className="text-sm font-semibold text-white truncate w-full uppercase tracking-tight group-hover:text-orange-400 transition-colors">
                                                                                    {team2P1}
                                                                                </span>
                                                                                {team2P2 && (
                                                                                    <span className="text-xs font-medium text-white/70 truncate w-full uppercase tracking-wider mt-0.5">
                                                                                        {team2P2}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        {/* Bottom Bar: Location and Court */}
                                                                        <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-auto">
                                                                            <div className="flex items-center gap-1.5 min-w-0 max-w-[70%]">
                                                                                <MapPin size={12} className="text-padel-green shrink-0" />
                                                                                <span className="text-xs font-medium text-white/70 truncate uppercase tracking-wider">
                                                                                    {info.Location || info.Venue || 'Location TBD'}
                                                                                </span>
                                                                            </div>
                                                                            {info.Court && (
                                                                                <span className="text-[10px] font-bold bg-orange-500/10 border border-orange-500/25 text-orange-400 px-1.5 py-0.5 rounded uppercase tracking-widest whitespace-nowrap scale-95 shrink-0">
                                                                                    {info.Court}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    ) : (
                                                        <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center animate-fade-in">
                                                            <Trophy size={32} strokeWidth={1.5} className="text-white/20 mb-4" />
                                                            <h3 className="text-white font-bold text-sm mb-1">You have no upcoming matches.</h3>
                                                            <p className="text-white/50 text-[11px] font-medium mb-6">Your next match will appear here when draws are published.</p>
                                                        </div>
                                                    )
                                                )}
                                            </div>
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
