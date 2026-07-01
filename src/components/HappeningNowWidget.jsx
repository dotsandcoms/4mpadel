import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MapPin, Users } from 'lucide-react';

// Same status → color mapping used across the Featured Tournaments cards, kept local
// here so this widget's cards line up visually with "Upcoming Featured Tournaments"
const getStatusColors = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('major')) return { border: 'border-red-500/40', text: 'text-red-500' };
    if (s.includes('super gold') || s === 's gold') return { border: 'border-amber-500/40', text: 'text-amber-500' };
    if (s.includes('gold')) return { border: 'border-yellow-400/40', text: 'text-yellow-400' };
    if (s.includes('silver')) return { border: 'border-gray-400/40', text: 'text-gray-400' };
    if (s.includes('bronze')) return { border: 'border-orange-700/40', text: 'text-orange-700' };
    if (s.includes('fip')) return { border: 'border-blue-500/40', text: 'text-blue-500' };
    return { border: 'border-padel-green/40', text: 'text-padel-green' };
};

const HappeningNowWidget = () => {
    const [liveEvents, setLiveEvents] = useState([]);
    const [isLive, setIsLive] = useState(true);
    const [loading, setLoading] = useState(true);
    const [activePage, setActivePage] = useState(0);
    const scrollRef = useRef(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchLiveEvents = async () => {
            setLoading(true);
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);

                const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                endOfMonth.setHours(23, 59, 59, 999);

                const { data, error } = await supabase
                    .from('calendar')
                    .select('*')
                    .neq('is_visible', false)
                    .gte('start_date', yesterday.toISOString())
                    .lte('start_date', endOfMonth.toISOString())
                    .order('start_date', { ascending: true });

                if (error) throw error;

                let eventsData = data || [];

                // Manual events register players directly on the site (stored in event_registrations),
                // not through RankedIn, so their registered_players column is stale/0 — count live instead.
                const manualEventIds = eventsData.filter(e => e.is_manual).map(e => e.id);
                if (manualEventIds.length > 0) {
                    const { data: regs } = await supabase
                        .from('event_registrations')
                        .select('event_id, full_name, partner_name')
                        .in('event_id', manualEventIds)
                        .neq('status', 'withdrawn');

                    if (regs) {
                        const counts = {};
                        regs.forEach(reg => {
                            if (!counts[reg.event_id]) counts[reg.event_id] = new Set();
                            if (reg.full_name) counts[reg.event_id].add(reg.full_name.toLowerCase());
                            if (reg.partner_name) counts[reg.event_id].add(reg.partner_name.toLowerCase());
                        });

                        eventsData = eventsData.map(event =>
                            event.is_manual
                                ? { ...event, registered_players: counts[event.id] ? counts[event.id].size : 0 }
                                : event
                        );
                    }
                }

                const happeningNow = [];
                const upcomingThisMonth = [];

                eventsData.forEach(e => {
                    if (!e.start_date) return;
                    const start = new Date(e.start_date);
                    start.setHours(0, 0, 0, 0);

                    let end = new Date(e.start_date);
                    if (e.end_date) {
                        end = new Date(e.end_date);
                    }
                    end.setHours(23, 59, 59, 999);

                    if (today.getTime() >= start.getTime() && today.getTime() <= end.getTime()) {
                        happeningNow.push(e);
                    } else if (start.getTime() > today.getTime() && start.getTime() <= endOfMonth.getTime()) {
                        upcomingThisMonth.push(e);
                    }
                });

                const sortByFeatured = (a, b) => {
                    if (a.featured_event && !b.featured_event) return -1;
                    if (!a.featured_event && b.featured_event) return 1;
                    return 0;
                };

                happeningNow.sort(sortByFeatured);
                upcomingThisMonth.sort(sortByFeatured);

                if (happeningNow.length > 0) {
                    setLiveEvents(happeningNow);
                    setIsLive(true);
                } else if (upcomingThisMonth.length > 0) {
                    setLiveEvents(upcomingThisMonth);
                    setIsLive(false);
                } else {
                    setLiveEvents([]);
                }
            } catch (err) {
                console.error('HappeningNowWidget error:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchLiveEvents();
    }, []);

    // Group events into pages of 3 so the widget shows 3 at a time, swipeable/scrollable to the next set
    const eventPages = [];
    for (let i = 0; i < liveEvents.length; i += 3) {
        eventPages.push(liveEvents.slice(i, i + 3));
    }

    // Track which page is in view so the dots below reflect the current swipe position
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handleScroll = () => {
            const pageWidth = el.clientWidth || 1;
            setActivePage(Math.round(el.scrollLeft / pageWidth));
        };
        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [eventPages.length]);

    const scrollToPage = (direction) => {
        const el = scrollRef.current;
        if (!el) return;
        const pageWidth = el.clientWidth || 1;
        const targetPage = direction === 'left' ? activePage - 1 : activePage + 1;
        el.scrollTo({ left: targetPage * pageWidth, behavior: 'smooth' });
    };

    if (loading || liveEvents.length === 0) return null;

    return (
        <AnimatePresence>
            {liveEvents.length > 0 && (
                <motion.section
                    initial={{ opacity: 0, y: 24, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -24, height: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="relative z-40 w-full"
                >
                    <div className="bg-[#12161E] border border-white/10 rounded-2xl p-4 md:p-6 relative overflow-hidden shadow-2xl w-full">
                        {/* Header */}
                        <div className="relative z-10 flex items-center justify-between mb-5">
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                <div className="relative flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/10 shrink-0">
                                    <span className="text-base sm:text-lg relative z-10 leading-none">🎾</span>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                                    <h2 className="font-black text-white text-sm sm:text-lg md:text-xl uppercase tracking-wide sm:tracking-wider truncate leading-none">
                                        {isLive ? 'Happening Now!' : 'Happening Next'}
                                    </h2>
                                    {isLive && (
                                        <span className="bg-red-600 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-widest px-1.5 sm:px-2 py-1 rounded animate-pulse-slow flex items-center gap-1 shrink-0">
                                            <span className="w-1.5 h-1.5 bg-white rounded-full"></span> LIVE
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Events List — matches the "Upcoming Featured Tournaments" card layout, paged 3-at-a-time */}
                        <div ref={scrollRef} className="relative z-10 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth">
                            {eventPages.map((page, pageIdx) => (
                                <div key={pageIdx} className="flex-none w-full snap-start flex flex-col gap-3">
                                    {page.map((event) => {
                                        const statusColors = getStatusColors(event.sapa_status);
                                        const statusLabel = event.sapa_status || 'SAPA';

                                        let day = '';
                                        let month = '';
                                        let weekday = 'TBD';
                                        if (event.start_date) {
                                            const d = new Date(event.start_date);
                                            if (!isNaN(d.getTime())) {
                                                day = String(d.getDate()).padStart(2, '0');
                                                month = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d).toUpperCase();
                                                weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(d).toUpperCase();
                                            }
                                        }

                                        return (
                                            <div key={event.id} className="group relative rounded-[16px] p-[1px] overflow-hidden bg-white/5 shadow-xl">
                                                {/* Rotating shimmer along the border */}
                                                <div
                                                    className="absolute inset-0 animate-spin opacity-60 group-hover:opacity-100 transition-opacity duration-300 [animation-duration:6s] pointer-events-none"
                                                    style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 78%, rgba(204,255,0,0.9) 88%, transparent 96%)' }}
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (event.slug || event.id) {
                                                            navigate(`/calendar/${event.slug || event.id}`);
                                                        } else if (event.rankedin_url) {
                                                            window.open(event.rankedin_url, '_blank');
                                                        }
                                                    }}
                                                    className="relative z-10 flex items-center py-3 px-4 w-full text-left bg-[#0A0F1C] rounded-[15px] transition-colors duration-300"
                                                >
                                                    <div className="flex flex-col items-center justify-center w-14 sm:w-16 shrink-0 border-r border-white/10 pr-3 sm:pr-4 mr-3 sm:mr-4">
                                                        <span className="text-[9px] sm:text-[10px] font-black text-padel-green uppercase tracking-widest mb-0.5">{month}</span>
                                                        <span className="text-xl sm:text-2xl font-bold text-white leading-none mb-0.5">{day}</span>
                                                        <span className="text-[8px] sm:text-[9px] font-bold text-padel-green uppercase tracking-widest">{weekday}</span>
                                                    </div>

                                                    <div className="flex-1 min-w-0 pr-2 sm:pr-4">
                                                        <div className="hidden sm:flex items-center gap-2 mb-1.5">
                                                            {isLive && (
                                                                <span className="inline-flex items-center gap-1 text-red-400 text-[8px] font-black uppercase tracking-widest">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
                                                                </span>
                                                            )}
                                                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${statusColors.border} ${statusColors.text} bg-transparent`}>
                                                                {statusLabel}
                                                            </span>
                                                        </div>
                                                        <h3 className="text-xs sm:text-sm font-bold text-white mb-1.5 uppercase tracking-tight truncate group-hover:text-padel-green transition-colors">
                                                            {event.event_name}
                                                        </h3>
                                                        {(event.venue || event.city) && (
                                                            <div className="flex items-center gap-1.5 text-gray-400">
                                                                <MapPin className="w-3 h-3 shrink-0 text-gray-500" />
                                                                <span className="text-[9px] sm:text-[10px] font-medium truncate uppercase tracking-widest">
                                                                    {[event.venue, event.city].filter(Boolean).join(', ')}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {event.registered_players > 0 && (
                                                            <div className="flex items-center gap-1.5 text-gray-400 mt-1">
                                                                <Users className={`w-3 h-3 shrink-0 ${statusColors.text}`} />
                                                                <span className="text-[9px] sm:text-[10px] font-medium truncate">
                                                                    {event.registered_players} Registered
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0 pl-2">
                                                        <div className="sm:hidden flex flex-col items-end gap-1">
                                                            {isLive && (
                                                                <span className="inline-flex items-center gap-1 text-red-400 text-[8px] font-black uppercase tracking-widest">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
                                                                </span>
                                                            )}
                                                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${statusColors.border} ${statusColors.text} bg-transparent`}>
                                                                {statusLabel}
                                                            </span>
                                                        </div>
                                                        <ChevronRight className="w-4 h-4 text-padel-green shrink-0 group-hover:translate-x-1 transition-all" />
                                                    </div>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>

                        {/* Prev/next switcher — only shown when there's more than one set of 3 to swipe through */}
                        {eventPages.length > 1 && (
                            <div className="relative z-10 flex items-center justify-center gap-4 mt-5">
                                <button
                                    onClick={() => scrollToPage('left')}
                                    disabled={activePage === 0}
                                    className={`w-11 h-11 rounded-full border flex items-center justify-center transition-all duration-300 ${activePage === 0
                                        ? 'opacity-30 cursor-not-allowed border-white/5 bg-white/5 text-white/50'
                                        : 'bg-white/5 border-white/10 text-white hover:bg-padel-green hover:text-black cursor-pointer'
                                        }`}
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>

                                <button
                                    onClick={() => scrollToPage('right')}
                                    disabled={activePage === eventPages.length - 1}
                                    className={`w-11 h-11 rounded-full border flex items-center justify-center transition-all duration-300 ${activePage === eventPages.length - 1
                                        ? 'opacity-30 cursor-not-allowed border-white/5 bg-white/5 text-white/50'
                                        : 'bg-white/5 border-white/10 text-white hover:bg-padel-green hover:text-black cursor-pointer'
                                        }`}
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        )}
                    </div>
                </motion.section>
            )}
        </AnimatePresence>
    );
};

export default HappeningNowWidget;
