import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, MapPin, Filter, Search, ChevronRight, X, ChevronDown, Award, ArrowRight, Users, ChevronLeft, LayoutGrid, List, Loader, AlertCircle, Trophy, Layers, User, PlayCircle, Video, Shield, Check, Star, Globe } from 'lucide-react';
import Navbar from '../components/Navbar';
import { supabase } from '../supabaseClient';
import { getEventImage } from '../utils/imageUtils';
import { Link, useSearchParams } from 'react-router-dom';
import { useRankedin } from '../hooks/useRankedin';

import { GitBranch, Map } from 'lucide-react';
import featuredBg from '../assets/featuredbg.jpeg';

const extractRankedinId = (url) => {
    if (!url) return null;
    const match = url.match(/\/(?:tournament|clubleague|draws|results)\/(\d+)/) || url.match(/\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
};

// Same status → color mapping used across the home page's Featured Tournaments cards,
// kept local here so this page's cards line up visually with the home page.
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

const formatTournamentDate = (startDate, endDate) => {
    if (!startDate) return null;

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;

    const dayFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric' });
    const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'short' });

    const startDay = dayFormatter.format(start);
    const startMonth = monthFormatter.format(start);

    if (!end || startDate === endDate) {
        return `${startDay} ${startMonth}`;
    }

    const endDay = dayFormatter.format(end);
    const endMonth = monthFormatter.format(end);

    if (startMonth === endMonth) {
        return `${startDay}-${endDay} ${startMonth}`;
    }

    return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
};

// Same "Featured Tournament" hero card design used on the home page — ambient
// featuredbg photo, with the event's own uploaded poster (if any) shown as an insert.
const FeaturedTournamentSpotlight = ({ event }) => {
    if (!event) return null;

    const statusColors = getStatusColors(event.sapa_status);
    const dateLabel = formatTournamentDate(event.start_date, event.end_date);
    const location = [event.venue || event.clubName, event.city].filter(Boolean).join(', ');
    const locationWords = location.split(' ');
    const locationShort = locationWords.length > 3 ? `${locationWords.slice(0, 3).join(' ')}…` : location;
    const posterImage = event.image || event.custom_image_url;
    const linkPath = `/calendar/${event.slug || event.id}`;

    return (
        <div className="relative rounded-[28px] p-[1px] overflow-hidden bg-white/5 shadow-2xl group">
            {/* Rotating shimmer along the border */}
            <div
                className="absolute inset-0 animate-spin opacity-60 group-hover:opacity-100 transition-opacity duration-300 [animation-duration:6s] pointer-events-none"
                style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 78%, rgba(204,255,0,0.9) 88%, transparent 96%)' }}
            />
            <div
                onClick={() => { window.location.href = linkPath; }}
                className="relative z-10 w-full min-h-[170px] sm:min-h-[200px] md:min-h-[260px] rounded-[27px] overflow-hidden cursor-pointer border border-white/10"
            >
                <img src={featuredBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-black/20" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

                <div className="relative z-10 flex flex-col h-full p-5 sm:p-6 md:p-8 justify-center max-w-[58%] sm:max-w-md">
                    {event.sapa_status && (
                        <span className={`inline-flex w-fit px-3 py-1 rounded-full border ${statusColors.border} ${statusColors.text} bg-transparent text-[10px] font-black uppercase tracking-widest mb-4`}>
                            {event.sapa_status}
                        </span>
                    )}
                    <h3 className="text-base sm:text-lg md:text-2xl font-bold text-white mb-3 uppercase tracking-tight leading-tight line-clamp-2">
                        {event.event_name}
                    </h3>
                    {dateLabel && (
                        <div className="flex items-center gap-2 text-padel-green font-bold text-xs sm:text-sm md:text-base mb-2">
                            <CalendarIcon className="w-4 h-4 shrink-0" /> {dateLabel}
                        </div>
                    )}
                    {location && (
                        <div className="flex items-center gap-2 text-white/60 text-[11px] sm:text-xs md:text-sm truncate">
                            <MapPin className="w-4 h-4 shrink-0 text-padel-green" />
                            <span className="truncate sm:hidden">{locationShort}</span>
                            <span className="hidden sm:inline truncate">{location}</span>
                        </div>
                    )}
                    <Link
                        to={linkPath}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1.5 bg-[#CCFF00] hover:bg-[#b3ff00] text-black! font-black px-5 py-2 rounded-full transition-colors text-[10px] sm:text-xs uppercase tracking-wide w-fit mt-4"
                    >
                        View Event <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                </div>

                {posterImage && (
                    <div className="absolute right-0 sm:right-3 md:right-0 top-2 bottom-2 sm:top-3 sm:bottom-3 md:top-0 md:bottom-0 aspect-[4/5] rounded-xl md:rounded-none overflow-hidden shadow-2xl md:shadow-none border border-white/10 md:border-0 group-hover:scale-105 md:group-hover:scale-100 transition-transform duration-500">
                        <img src={posterImage} alt={event.event_name} className="w-full h-full object-cover" />
                        <div className="hidden md:block absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-black/80 to-transparent pointer-events-none" />
                    </div>
                )}
            </div>
        </div>
    );
};

const FeaturedEventCard = ({ event, index }) => {
    const { getTournamentClasses } = useRankedin();
    const [hasDraw, setHasDraw] = useState(false);
    const [hasResults, setHasResults] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {
            const rId = event.rankedin_id || event.eventId || extractRankedinId(event.rankedin_url);
            if (rId) {
                const classes = await getTournamentClasses(rId);
                const drawAvailable = classes && classes.some(c =>
                    c.IsPublished &&
                    Array.isArray(c.TournamentDraws) &&
                    c.TournamentDraws.length > 0
                );
                setHasDraw(drawAvailable);

                const resultsAvailable = classes && classes.some(c =>
                    c.IsPublished &&
                    c.HasResults === true
                );
                setHasResults(resultsAvailable);
            }
        };
        checkStatus();
    }, [event, getTournamentClasses]);

    let tierColor = 'border-white/10';
    let badgeColor = 'bg-white/10 text-gray-400';
    let accentColor = 'text-padel-green';
    let glowColor = 'shadow-padel-green/20';
    let glowBgColor = 'bg-white/5';

    if (event.sapa_status === 'Major') { tierColor = 'border-red-500/30 hover:border-red-500/50'; badgeColor = 'bg-red-500/20 text-red-400 border border-red-500/30'; accentColor = 'text-red-500'; glowColor = 'shadow-red-500/15'; glowBgColor = 'bg-red-500/30'; }
    else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') { tierColor = 'border-amber-500/30 hover:border-amber-500/50'; badgeColor = 'bg-amber-500/20 text-amber-400 border border-amber-500/30'; accentColor = 'text-amber-500'; glowColor = 'shadow-amber-500/15'; glowBgColor = 'bg-amber-500/30'; }
    else if (event.sapa_status === 'Gold') { tierColor = 'border-yellow-500/30 hover:border-yellow-500/50'; badgeColor = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'; accentColor = 'text-yellow-500'; glowColor = 'shadow-yellow-500/15'; glowBgColor = 'bg-yellow-500/30'; }
    else if (event.sapa_status === 'Silver') { tierColor = 'border-gray-400/30 hover:border-gray-400/50'; badgeColor = 'bg-gray-500/20 text-gray-300 border border-gray-400/30'; accentColor = 'text-gray-400'; glowColor = 'shadow-gray-400/15'; glowBgColor = 'bg-gray-400/30'; }
    else if (event.sapa_status === 'Bronze') { tierColor = 'border-orange-700/30 hover:border-orange-700/50'; badgeColor = 'bg-orange-700/20 text-orange-400 border border-orange-700/30'; accentColor = 'text-orange-700'; glowColor = 'shadow-orange-700/15'; glowBgColor = 'bg-orange-700/30'; }
    else if (event.sapa_status === 'FIP event') { tierColor = 'border-blue-500/30 hover:border-blue-500/50'; badgeColor = 'bg-blue-500/20 text-blue-400 border border-blue-500/30'; accentColor = 'text-blue-500'; glowColor = 'shadow-blue-500/15'; glowBgColor = 'bg-blue-500/30'; }

    const detailsPath = event.slug ? `/calendar/${event.slug}` : (event.eventId ? `https://rankedin.com/tournament/${event.eventId}` : `/calendar/${event.id}`);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="w-full relative group"
        >
            {/* Soft Glow Behind the Card */}
            <div className={`absolute -inset-1 sm:-inset-1.5 rounded-[28px] blur-xl opacity-20 sm:opacity-30 group-hover:opacity-50 transition-opacity duration-700 ${glowBgColor} -z-10`} />

            <div className={`relative flex flex-row items-stretch min-h-[180px] sm:min-h-[220px] bg-[#0F1420] rounded-[24px] overflow-hidden border ${tierColor} shadow-2xl [transform:translateZ(0)]`}>

                {/* Shimmer Effect */}
                <motion.div
                    className="absolute top-0 bottom-0 left-0 w-[150%] z-30 pointer-events-none"
                    style={{
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
                        transform: 'skewX(-20deg)',
                    }}
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: "linear", repeatDelay: 2 }}
                />

                {/* Left Content */}
                <div className="flex flex-col justify-center flex-1 p-4 sm:p-6 z-20 overflow-hidden">
                    <div className="mb-2 sm:mb-3">
                        <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-widest border ${badgeColor}`}>
                            {event.sapa_status}
                        </span>
                    </div>

                    <h3 className="text-sm sm:text-2xl font-display font-semibold text-white mb-2 sm:mb-4 uppercase tracking-tight leading-tight line-clamp-3">
                        {event.event_name || event.eventName}
                    </h3>

                    <div className="space-y-1 sm:space-y-2 mb-3 sm:mb-6">
                        <div className="flex items-center gap-1.5 sm:gap-2 text-[#CCFF00]">
                            <CalendarIcon className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
                            <span className="text-[10px] sm:text-sm font-bold truncate">
                                {event.event_dates ||
                                    (event.startDate && `${new Date(event.startDate).toLocaleDateString()} - ${new Date(event.endDate || event.startDate).toLocaleDateString()}`) ||
                                    (event.start_date && `${new Date(event.start_date).toLocaleDateString()}${event.end_date && event.end_date !== event.start_date ? ` - ${new Date(event.end_date).toLocaleDateString()}` : ''}`)}
                            </span>
                        </div>

                        {(event.venue || event.city) && (
                            <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400">
                                <MapPin className="w-3 h-3 sm:w-4 sm:h-4 shrink-0 text-[#CCFF00]" />
                                <span className="text-[10px] sm:text-sm font-medium truncate">
                                    {[event.venue || event.clubName, event.city].filter(Boolean).join(', ')}
                                </span>
                            </div>
                        )}
                    </div>

                    <div>
                        <Link
                            to={detailsPath}
                            target={event.slug ? "_self" : (event.eventId ? "_blank" : "_self")}
                            className="inline-flex items-center gap-1.5 sm:gap-2 bg-[#CCFF00] hover:bg-[#b3ff00] text-[#000000] font-black px-4 sm:px-6 py-1.5 sm:py-2.5 rounded-full transition-colors text-[9px] sm:text-sm uppercase tracking-wide w-fit shrink-0"
                        >
                            <span className="text-[#000000]">View Event</span>
                            <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-[#000000]" />
                        </Link>
                    </div>
                </div>

                {/* Gradient overlay for fade effect to image */}
                <div className="absolute inset-y-0 right-[100px] sm:right-[280px] w-16 sm:w-32 bg-gradient-to-l from-transparent to-[#0F1420] z-10 pointer-events-none" />

                {/* Right Image Container */}
                <div className="relative w-[110px] sm:w-[320px] shrink-0 bg-black overflow-hidden rounded-r-[24px] z-0 flex items-center justify-center p-0">
                    {getEventImage(event) ? (
                        <>
                            <img
                                src={getEventImage(event)}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-125"
                                aria-hidden="true"
                            />
                            <img
                                src={getEventImage(event)}
                                alt={event.event_name || event.eventName}
                                className="relative w-full h-full object-cover sm:object-contain drop-shadow-2xl"
                            />
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <CalendarIcon className="w-8 sm:w-12 h-8 sm:h-12 text-white/10" />
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

const FeaturedCarousel = ({ events }) => {
    const scrollRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);

    const checkScroll = () => {
        if (scrollRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 10);
            setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
        }
    };

    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            el.addEventListener('scroll', checkScroll);
            checkScroll();
            window.addEventListener('resize', checkScroll);
            return () => {
                el.removeEventListener('scroll', checkScroll);
                window.removeEventListener('resize', checkScroll);
            };
        }
    }, [events]);

    const scroll = (direction) => {
        if (scrollRef.current) {
            const { scrollLeft, clientWidth } = scrollRef.current;
            const scrollAmount = clientWidth * 0.8;
            const scrollTo = direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount;
            scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

    if (!events || events.length === 0) return null;

    return (
        <div className="mb-6 relative">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-4 sm:gap-0">
                <div className="flex flex-row items-center gap-3 sm:gap-4 text-left">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-padel-green/10 border border-padel-green/20 flex items-center justify-center shrink-0">
                        <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-padel-green" />
                    </div>
                    <div>
                        <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-black text-white uppercase tracking-tight leading-none mb-0.5 sm:mb-1">
                            Featured <span className="text-padel-green">Events</span>
                        </h2>
                        <p className="text-[10px] sm:text-xs text-gray-500 font-bold uppercase tracking-widest">Handpicked highlights for you</p>
                    </div>
                </div>

                {events.length > 3 && (
                    <div className="hidden sm:flex gap-3">
                        <button
                            onClick={() => scroll('left')}
                            disabled={!canScrollLeft}
                            className={`w-12 h-12 rounded-2xl border border-white/10 flex items-center justify-center transition-all ${canScrollLeft ? 'bg-white/5 text-white hover:bg-padel-green hover:text-black hover:border-padel-green' : 'opacity-20 cursor-not-allowed'}`}
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                        <button
                            onClick={() => scroll('right')}
                            disabled={!canScrollRight}
                            className={`w-12 h-12 rounded-2xl border border-white/10 flex items-center justify-center transition-all ${canScrollRight ? 'bg-white/5 text-white hover:bg-padel-green hover:text-black hover:border-padel-green' : 'opacity-20 cursor-not-allowed'}`}
                        >
                            <ChevronRight className="w-6 h-6" />
                        </button>
                    </div>
                )}
            </div>

            <div
                ref={scrollRef}
                className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide no-scrollbar -mx-4 px-4 scroll-px-4 sm:-mx-8 sm:px-8 sm:scroll-px-8 xl:-mx-12 xl:px-12 xl:scroll-px-12 after:content-[''] after:min-w-[1px] after:shrink-0"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {events.map((event, index) => (
                    <div key={event.id} className="flex-none w-[300px] sm:w-[380px] snap-start">
                        <FeaturedEventCard event={event} index={index} />
                    </div>
                ))}
            </div>

            {/* Mobile Navigation Indicator */}
            {events.length > 1 && (
                <div className="sm:hidden flex justify-center gap-1.5 mt-2">
                    {/* We could add dots here if we wanted, but horizontal scroll is usually enough on mobile */}
                </div>
            )}
        </div>
    );
};

const CalendarEventItem = ({ event, index }) => {
    let tierColor = 'border-white/10';
    let bgGradient = 'bg-white/5';

    if (event.sapa_status === 'Major') { tierColor = 'border-white/10 hover:border-red-500/50'; bgGradient = 'bg-gradient-to-r from-red-500/20 to-transparent'; }
    else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') { tierColor = 'border-white/10 hover:border-amber-500/50'; bgGradient = 'bg-gradient-to-r from-amber-600/20 to-transparent'; }
    else if (event.sapa_status === 'Gold') { tierColor = 'border-white/10 hover:border-yellow-500/50'; bgGradient = 'bg-gradient-to-r from-yellow-500/20 to-transparent'; }
    else if (event.sapa_status === 'Silver') { tierColor = 'border-white/10 hover:border-gray-400/50'; bgGradient = 'bg-gradient-to-r from-gray-400/20 to-transparent'; }
    else if (event.sapa_status === 'Bronze') { tierColor = 'border-white/10 hover:border-orange-700/50'; bgGradient = 'bg-gradient-to-r from-orange-700/20 to-transparent'; }
    else if (event.sapa_status === 'FIP event') { tierColor = 'border-white/10 hover:border-blue-500/50'; bgGradient = 'bg-gradient-to-r from-blue-500/20 to-transparent'; }

    const statusColors = getStatusColors(event.sapa_status);

    const detailsPath = event.slug ? `/calendar/${event.slug}` : (event.eventId ? `https://rankedin.com/tournament/${event.eventId}` : `/calendar/${event.id}`);

    const dateStr = event.start_date || event.startDate;
    let dayNum = '--';
    let monthStr = '---';
    let weekdayStr = '---';

    if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
            dayNum = String(d.getDate()).padStart(2, '0');
            monthStr = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
            weekdayStr = d.toLocaleString('en-US', { weekday: 'short' }).toUpperCase();
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: index * 0.05 }}
        >
            <Link
                to={detailsPath}
                target={event.slug ? "_self" : (event.eventId ? "_blank" : "_self")}
                className={`group block bg-[#0F1420] hover:bg-[#151A27] border ${tierColor} rounded-2xl py-3 px-4 transition-all duration-300 shadow-xl overflow-hidden relative cursor-pointer`}
            >
                <div className={`absolute inset-0 ${bgGradient} opacity-10 group-hover:opacity-30 transition-opacity`}></div>

                <div className="flex flex-row items-center gap-3 sm:gap-5 relative z-10 w-full min-w-0">

                    {/* Date Block (Far Left) */}
                    <div className="flex flex-col items-center justify-center w-12 sm:w-16 shrink-0 border-r border-white/10 pr-3 sm:pr-4">
                        <span className="text-white text-lg sm:text-2xl font-bold leading-none mb-0.5">{dayNum}</span>
                        <span className="text-padel-green text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-0.5">{monthStr}</span>
                        <span className="text-gray-400 text-[8px] sm:text-[9px] font-bold uppercase tracking-widest">{weekdayStr}</span>
                    </div>

                    {/* Image Block */}
                    <div className="flex-shrink-0 w-16 h-20 sm:w-20 sm:h-24 rounded-lg sm:rounded-xl overflow-hidden bg-black/40 border border-white/5 relative shadow-xl">
                        {getEventImage(event) ? (
                            <img
                                src={getEventImage(event)}
                                alt={event.event_name || event.eventName}
                                className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center">
                                <CalendarIcon className="w-5 h-5 text-padel-green mb-1 opacity-50" />
                            </div>
                        )}
                    </div>

                    {/* Info block (Middle) */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 sm:gap-1.5 py-1">
                        {/* Status Row */}
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest border ${statusColors.border} ${statusColors.text} bg-transparent`}>
                                {event.sapa_status}
                            </span>
                            {event.is_league && (
                                <span className="px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest border border-blue-500/40 text-blue-500 bg-transparent">
                                    League
                                </span>
                            )}
                        </div>

                        {/* Date */}
                        <div className="flex items-center gap-1 text-padel-green font-bold text-[9px] sm:text-[10px] mt-0.5">
                            <CalendarIcon className="w-3 h-3" />
                            <span>
                                {event.event_dates ||
                                    (event.startDate && `${new Date(event.startDate).toLocaleDateString()} - ${new Date(event.endDate || event.startDate).toLocaleDateString()}`) ||
                                    (event.start_date && `${new Date(event.start_date).toLocaleDateString()}${event.end_date && event.end_date !== event.start_date ? ` - ${new Date(event.end_date).toLocaleDateString()}` : ''}`)}
                            </span>
                        </div>

                        {/* Title */}
                        <h3 className="text-xs sm:text-lg font-display font-semibold text-white group-hover:text-padel-green transition-colors leading-tight uppercase tracking-tight line-clamp-2 pr-2">
                            {event.event_name || event.eventName}
                        </h3>

                        {/* Bottom Metadata Row */}
                        <div className="flex items-center gap-3 text-gray-400 text-[9px] sm:text-xs font-medium mt-0.5 w-full overflow-hidden">
                            <div className="flex items-center gap-1 min-w-0 shrink">
                                <MapPin className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-padel-green/60 shrink-0" />
                                <span className="truncate" title={event.venue || event.clubName}>
                                    {event.venue || event.clubName || 'Location TBC'}
                                </span>
                            </div>

                            {event.city && (
                                <div className="flex items-center gap-1 shrink-0 text-[#CCFF00]/80">
                                    <Map className="w-3 sm:w-3.5 h-3 sm:h-3.5 shrink-0" />
                                    <span className="truncate max-w-[80px] sm:max-w-[120px]">{event.city}</span>
                                </div>
                            )}

                            {event.registered_players != null && (
                                <div className="flex items-center gap-1 shrink-0 bg-[#CCFF00]/10 border border-[#CCFF00]/20 px-1.5 py-0.5 rounded-md">
                                    <Users className="w-3 h-3 text-[#CCFF00]" />
                                    <span className="text-white font-bold text-[9px] leading-none">{event.registered_players}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Arrow (Far Right) */}
                    <div className="flex-shrink-0 pr-2">
                        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-[#CCFF00] opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />
                    </div>
                </div>
            </Link>
        </motion.div>
    );
};

const Calendar = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') || 'all';

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filter & Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilters, setStatusFilters] = useState([]);
    const [cityFilter, setCityFilter] = useState('All');
    const [activeTab, setActiveTab] = useState(initialTab); // 'upcoming', 'past', 'all', 'my-calendar'
    const [leagueFilter, setLeagueFilter] = useState('Tournaments'); // 'All' | 'League' | 'Tournaments'
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && tab !== activeTab) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    // View State
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'

    // Calendar View State
    const [currentDate, setCurrentDate] = useState(new Date());

    // Pagination State (for List View)
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 9;

    // Personalized State
    const [userProfile, setUserProfile] = useState(null);
    const [personalEvents, setPersonalEvents] = useState([]);
    const [personalLoading, setPersonalLoading] = useState(false);

    const { getPlayerEventsAsync } = useRankedin();

    useEffect(() => {
        fetchEvents();
        checkUserStatus();
    }, []);

    const checkUserStatus = async () => {
        const { data: { session } } = await supabase.auth.getSession();

        // ADMIN IMPERSONATION CHECK
        const impersonationEmail = sessionStorage.getItem('admin_test_login_email');
        const isAdmin = session?.user?.email?.includes('admin') || session?.user?.email?.includes('bradein');

        let targetEmail = session?.user?.email;
        if (impersonationEmail && isAdmin) {
            targetEmail = impersonationEmail;
        }

        if (targetEmail) {
            const { data: profile } = await supabase
                .from('players')
                .select('*')
                .ilike('email', targetEmail)
                .single();

            if (profile) {
                setUserProfile(profile);

                // Track activity if it's the real user
                if (!impersonationEmail && profile.email === session?.user?.email) {
                    await supabase
                        .from('players')
                        .update({ last_login: new Date().toISOString() })
                        .eq('id', profile.id);
                }
            }
        }
    };

    useEffect(() => {
        if (activeTab === 'my-calendar' && userProfile?.rankedin_id && personalEvents.length === 0) {
            fetchPersonalEvents();
        }
    }, [activeTab, userProfile]);

    const fetchPersonalEvents = async () => {
        if (!userProfile?.rankedin_id) return;
        try {
            setPersonalLoading(true);
            const data = await getPlayerEventsAsync(userProfile.rankedin_id);
            setPersonalEvents((data || []).filter(e => e.state !== 2));
        } catch (err) {
            console.error('Error fetching personal events:', err);
        } finally {
            setPersonalLoading(false);
        }
    };

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('calendar')
                .select('*')
                .neq('is_visible', false)
                .order('start_date', { ascending: true })
                .order('id', { ascending: true });

            if (error) throw error;

            let eventsData = data || [];

            // Calculate dynamic registration counts for manual events
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

                    eventsData = eventsData.map(event => {
                        if (event.is_manual) {
                            return {
                                ...event,
                                registered_players: counts[event.id] ? counts[event.id].size : 0
                            };
                        }
                        return event;
                    });
                }
            }

            setEvents(eventsData);
        } catch (err) {
            console.error('Error fetching calendar:', err?.message || err, err);
            setError('Failed to load events. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    // Extract unique cities and statuses for filters
    const uniqueCities = useMemo(() => {
        const cities = events.map(e => (e.city || '').trim()).filter(Boolean);
        return ['All', ...new Set(cities)].sort();
    }, [events]);

    const uniqueStatuses = ['All', 'Major', 'Super Gold', 'Gold', 'Silver', 'Bronze', 'Key Event', 'FIP event'];

    // Filter Logic
    const filteredEvents = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const isMyCalendar = activeTab === 'my-calendar';

        const sourceEvents = isMyCalendar ? personalEvents.map(pe => {
            // Find a matching local event for internal routing
            const localEvent = events.find(le =>
                (le.rankedin_id && pe.eventId && le.rankedin_id.toString() === pe.eventId.toString()) ||
                (le.event_name === pe.event_name) ||
                (le.eventName === pe.event_name)
            );

            if (localEvent) {
                return {
                    ...pe,
                    slug: localEvent.slug,
                    id: localEvent.id,
                    image_url: localEvent.image_url,
                    custom_image_url: localEvent.custom_image_url,
                    posterUrl: getEventImage(localEvent),
                    venue: localEvent.venue || localEvent.clubName,
                    sapa_status: localEvent.sapa_status || pe.sapa_status,
                    is_league: localEvent.is_league ?? pe.is_league,
                    live_youtube_url: localEvent.live_youtube_url,
                    featured_live: localEvent.featured_live,
                    youtube_playlist_url: localEvent.youtube_playlist_url,
                    start_date: localEvent.start_date || pe.startDate,
                    end_date: localEvent.end_date || pe.endDate,
                    rankedin_id: localEvent.rankedin_id || pe.eventId,
                    rankedin_url: localEvent.rankedin_url,
                    city: localEvent.city,
                    registered_players: localEvent.registered_players,
                    organizer_name: localEvent.organizer_name,
                    event_dates: localEvent.event_dates
                };
            }
            return pe;
        }) : events;

        return sourceEvents.filter(event => {
            // Map Rankedin fields to local fields if needed
            const eventName = event.event_name || event.eventName || '';
            const venueName = event.venue || event.clubName || '';
            const status = event.sapa_status || 'Gold'; // Default for Rankedin if not specified
            const city = event.city || 'Rankedin';
            const organizer = event.organizer_name || '';
            const eventType = event.is_league ? 'League' : 'Tournament';

            const matchesSearch = !searchTerm ||
                eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                venueName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                city.toLowerCase().includes(searchTerm.toLowerCase()) ||
                status.toLowerCase().includes(searchTerm.toLowerCase()) ||
                organizer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                eventType.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = (activeTab === 'all' || activeTab === 'All Events') ? true : status === activeTab;
            // Additional fallback if statusFilters from Drawer are still active
            const matchesDrawerStatus = statusFilters.length === 0 || statusFilters.includes(status);

            const matchesCity = cityFilter === 'All' || city === cityFilter;


            let matchesTiming = true;
            if (viewMode === 'list' && !searchTerm) {
                const startDateStr = event.start_date || event.startDate;
                const endDateStr = event.end_date || event.endDate || startDateStr;

                const eventDate = new Date(endDateStr);
                // Default to showing only upcoming events when browsing tabs
                matchesTiming = !isNaN(eventDate.getTime()) && eventDate >= today;
            }


            const matchesLeague = leagueFilter === 'All' ||
                (leagueFilter === 'League' && event.is_league === true) ||
                (leagueFilter === 'Tournaments' && !event.is_league);

            return matchesSearch && matchesStatus && matchesDrawerStatus && matchesCity && matchesTiming && matchesLeague;
        });
    }, [events, personalEvents, activeTab, searchTerm, statusFilters, cityFilter, leagueFilter, viewMode]);

    const featuredEvents = useMemo(() => {
        return events.filter(event => event.featured_event === true);
    }, [events]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
    const paginatedEvents = filteredEvents.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset page on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilters, cityFilter, activeTab, leagueFilter, viewMode]);

    // Scroll to top on filter change, but NOT on search typing
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [statusFilters, cityFilter, activeTab, leagueFilter, viewMode]);


    // Scroll to top on page change
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentPage]);

    // Helper functions for Calendar View
    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay(); // 0(Sun) - 6(Sat)

    const prevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const renderCalendarGrid = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        let firstDay = getFirstDayOfMonth(year, month); // 0 = Sunday

        // Adjust so Monday is 0, Sunday is 6
        firstDay = firstDay === 0 ? 6 : firstDay - 1;

        const days = [];

        // Empty cells before the 1st
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="p-4 border border-white/5 bg-black/10 opacity-50"></div>);
        }

        // The actual days
        for (let element = 1; element <= daysInMonth; element++) {
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(element).padStart(2, '0')}`;

            // Find events that happen on this day
            // Note: event.start_date / end_date logic. For simplicity, we check if start_date matches.
            const dayEvents = filteredEvents.filter(e => {
                if (!e.start_date) return false;

                // Keep only the YYYY-MM-DD portion in case DB returns full Timestamps
                const eventStart = e.start_date.substring(0, 10);
                const eventEnd = e.end_date ? e.end_date.substring(0, 10) : eventStart;

                return dateString >= eventStart && dateString <= eventEnd;
            });

            days.push(
                <div key={element} className="p-2 md:p-4 border border-white/5 bg-white/5 hover:bg-white/10 transition-colors min-h-[100px] flex flex-col group relative">
                    <span className="text-gray-400 font-bold mb-2 group-hover:text-padel-green">{element}</span>
                    <div className="flex-1 overflow-y-auto space-y-1 nice-scrollbar">
                        {dayEvents.map(ev => {
                            let bgGradient = 'bg-gray-400';
                            let glowClass = 'group-hover:border-gray-400';

                            if (ev.sapa_status === 'Major') { bgGradient = 'bg-red-500'; glowClass = 'hover:border-red-500 bg-gradient-to-r hover:from-red-500/10 hover:to-transparent'; }
                            else if (ev.sapa_status === 'Super Gold' || ev.sapa_status === 'S Gold') { bgGradient = 'bg-amber-600'; glowClass = 'hover:border-amber-600 bg-gradient-to-r hover:from-amber-600/10 hover:to-transparent'; }
                            else if (ev.sapa_status === 'Gold') { bgGradient = 'bg-yellow-500'; glowClass = 'hover:border-yellow-500 bg-gradient-to-r hover:from-yellow-500/10 hover:to-transparent'; }
                            else if (ev.sapa_status === 'Silver') { bgGradient = 'bg-gray-400'; glowClass = 'hover:border-gray-400 bg-gradient-to-r hover:from-gray-400/10 hover:to-transparent'; }
                            else if (ev.sapa_status === 'Bronze') { bgGradient = 'bg-orange-700'; glowClass = 'hover:border-orange-700 bg-gradient-to-r hover:from-orange-700/10 hover:to-transparent'; }
                            else if (ev.sapa_status === 'FIP event') { bgGradient = 'bg-blue-500'; glowClass = 'hover:border-blue-500 bg-gradient-to-r hover:from-blue-500/10 hover:to-transparent'; }

                            return (
                                <Link
                                    key={ev.id}
                                    to={`/calendar/${ev.slug || ev.id}`}
                                    className={`text-[10px] md:text-xs truncate block px-1.5 py-1 rounded bg-black/40 border border-white/10 ${glowClass} transition-all flex items-center gap-1.5`}
                                    title={ev.event_name}
                                >
                                    <span className={`w-2 h-2 rounded-full ${bgGradient} shadow-[0_0_8px_rgba(255,255,255,0.3)] flex-shrink-0`}></span>
                                    <span className="truncate">{ev.event_name}</span>
                                </Link>
                            )
                        })}
                    </div>
                </div>
            );
        }

        // Fill remaining cells to complete the grid (optional)
        const totalCells = days.length;
        const remainder = totalCells % 7;
        if (remainder !== 0) {
            for (let i = 0; i < 7 - remainder; i++) {
                days.push(<div key={`empty-end-${i}`} className="p-4 border border-white/5 bg-black/10 opacity-50"></div>);
            }
        }

        return days;
    };

    return (
        <div className="bg-[#080C17] min-h-screen text-white font-sans selection:bg-padel-green selection:text-black">

            {/* Background elements matched from Rankings */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-padel-green/10 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[150px] rounded-full" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03]" />
            </div>

            <main className="relative z-10 pb-20 w-full max-w-[1440px] mx-auto px-4 xl:px-8">
                {/* Unified Header */}
                <section className="relative z-20 flex flex-col justify-start pt-6 md:pt-28 lg:pt-32 pb-4 md:pb-8">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-padel-green/20 text-padel-green bg-padel-green/5 text-[10px] md:text-[11px] font-bold uppercase tracking-widest mb-4 max-w-fit">
                        <CalendarIcon className="w-3 h-3" />
                        <span>Events Schedule</span>
                    </div>

                    <div className="overflow-hidden mb-1">
                        <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-[110px] xl:text-[130px] font-bold text-white leading-[1.1] md:leading-[0.9] tracking-tighter max-w-[100vw] font-display whitespace-nowrap lg:whitespace-normal">
                            CALENDAR
                        </h1>
                    </div>

                    <p className="text-gray-200 text-sm md:text-lg lg:text-xl max-w-4xl mb-2 leading-relaxed font-light whitespace-normal tracking-tight sm:tracking-normal">
                        <strong className="text-white font-medium">Find and explore padel events across South Africa.</strong>
                    </p>
                </section>

                {/* Search & Command Deck */}
                <section className="w-full pt-0 md:pt-0 mt-0 md:-mt-8 relative z-20 mb-6 md:mb-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="flex gap-3 items-center max-w-4xl mx-auto px-4 sm:px-0"
                    >
                        {/* Search Input Container */}
                        <div className="relative flex-1 bg-[#121620] border border-white/5 rounded-full shadow-lg">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4 md:w-5 md:h-5" />
                            <input
                                type="text"
                                placeholder="Search events or venues..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-transparent py-3 md:py-4 pl-12 md:pl-14 pr-4 text-[14px] md:text-base text-white focus:outline-none placeholder-gray-500 rounded-full"
                            />
                        </div>

                        {/* Filters Button */}
                        <button
                            onClick={() => setShowFilters(true)}
                            className="relative flex items-center justify-center gap-2 bg-[#121620] border border-white/5 hover:bg-white/10 rounded-full px-5 md:px-6 py-3 md:py-4 text-gray-300 hover:text-white transition-all font-semibold text-sm md:text-base shrink-0 group shadow-lg"
                        >
                            <Filter className="w-4 h-4 md:w-5 md:h-5 text-gray-400 group-hover:text-white transition-colors" />
                            <span className="hidden sm:block">Filters</span>
                            {((statusFilters.length > 0) || (cityFilter !== 'All') || (leagueFilter !== 'All')) && (
                                <span className="w-5 h-5 bg-[#CCFF00] text-black font-black text-[10px] md:text-xs rounded-full flex items-center justify-center shadow-lg ml-1">
                                    {(statusFilters.length > 0 ? 1 : 0) + (cityFilter !== 'All' ? 1 : 0) + (leagueFilter !== 'All' ? 1 : 0)}
                                </span>
                            )}
                        </button>
                    </motion.div>
                </section>

                {/* Filters Drawer/Bottom Sheet */}
                <AnimatePresence>
                    {showFilters && (
                        <>
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowFilters(false)}
                                className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
                            />

                            {/* Drawer */}
                            <motion.div
                                initial={{ y: '100%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="fixed bottom-0 left-0 right-0 z-[1001] bg-[#0a0f1d] border-t border-white/10 rounded-t-3xl p-6 pb-28 md:pb-6 shadow-2xl flex flex-col gap-6 max-h-[85vh] overflow-y-auto md:max-w-md md:left-1/2 md:-translate-x-1/2 md:bottom-4 md:border md:rounded-3xl"
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xl font-bold text-white">Filters</h3>
                                    <button onClick={() => setShowFilters(false)} className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-full transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {/* Type Filter */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-300">Event Type</label>
                                        <div className="relative">
                                            <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4 pointer-events-none" />
                                            <select
                                                value={leagueFilter}
                                                onChange={(e) => setLeagueFilter(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-padel-green transition-colors font-semibold text-sm"
                                            >
                                                <option value="All" className="bg-[#0a0f1d]">All Types</option>
                                                <option value="League" className="bg-[#0a0f1d]">League Only</option>
                                                <option value="Tournaments" className="bg-[#0a0f1d]">Tournaments</option>
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <ChevronDown className="w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status Filter */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-300">Tier / Status</label>
                                        <div className="relative">
                                            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4 pointer-events-none" />
                                            <select
                                                value={statusFilters[0] || 'All'}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setStatusFilters(val === 'All' ? [] : [val]);
                                                }}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-padel-green transition-colors font-semibold text-sm"
                                            >
                                                <option value="All" className="bg-[#0a0f1d]">All Statuses</option>
                                                {uniqueStatuses.filter(s => s !== 'All').map(s => (
                                                    <option key={s} value={s} className="bg-[#0a0f1d]">{s}</option>
                                                ))}
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <ChevronDown className="w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* City Filter */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-300">City</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4 pointer-events-none" />
                                            <select
                                                value={cityFilter}
                                                onChange={(e) => setCityFilter(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-padel-green transition-colors font-semibold text-sm"
                                            >
                                                {uniqueCities.map(city => (
                                                    <option key={city} value={city} className="bg-[#0a0f1d]">{city === 'All' ? 'All Cities' : city}</option>
                                                ))}
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <ChevronDown className="w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mobile View Toggle */}
                                    <div className="space-y-2 sm:hidden pt-2 border-t border-white/10">
                                        <label className="text-sm font-semibold text-gray-300">View Mode</label>
                                        <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1">
                                            <button
                                                onClick={() => setViewMode('list')}
                                                className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                                            >
                                                <List className="w-4 h-4" /> List
                                            </button>
                                            <button
                                                onClick={() => setViewMode('calendar')}
                                                className={`flex-1 py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-bold transition-all ${viewMode === 'calendar' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                                            >
                                                <LayoutGrid className="w-4 h-4" /> Grid
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        onClick={() => {
                                            setStatusFilters([]);
                                            setCityFilter('All');
                                            setLeagueFilter('All');
                                        }}
                                        className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
                                    >
                                        Clear
                                    </button>
                                    <button
                                        onClick={() => setShowFilters(false)}
                                        className="flex-1 bg-padel-green hover:bg-[#beff00] text-black font-bold py-3.5 rounded-xl transition-colors text-sm"
                                    >
                                        Show Results
                                    </button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* Event Spotlight */}
                {featuredEvents.length > 0 && (
                    <div className="mb-8 px-4 sm:px-0 max-w-4xl mx-auto">
                        <div className="flex items-center gap-1.5 mb-4">
                            <Star className="w-3.5 h-3.5 text-padel-green fill-padel-green shrink-0" />
                            <h2 className="text-[11px] sm:text-sm md:text-base font-bold uppercase tracking-wide sm:tracking-widest text-white/80">
                                Event Spotlight
                            </h2>
                        </div>
                        <FeaturedTournamentSpotlight event={featuredEvents[0]} />
                    </div>
                )}

                {/* Primary Tab Navigation */}
                <div className="flex justify-center mb-8 md:mb-10 relative z-50">
                    <div className="flex overflow-x-auto hide-scrollbar space-x-2 sm:space-x-3 px-4 mx-auto max-w-full flex-nowrap shrink-0 snap-x snap-mandatory">
                        {[
                            { id: 'all', label: 'All Events', icon: CalendarIcon },
                            { id: 'Major', label: 'Major', icon: Trophy },
                            { id: 'Super Gold', label: 'Super Gold', icon: Trophy },
                            { id: 'Gold', label: 'Gold', icon: Trophy },
                            { id: 'Silver', label: 'Silver', icon: Trophy },
                            { id: 'Bronze', label: 'Bronze', icon: Trophy },
                            { id: 'FIP event', label: 'FIP', icon: Globe },
                            ...(userProfile?.rankedin_id ? [{ id: 'my-calendar', label: 'My Calendar', icon: User }] : [])
                        ].map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        setActiveTab(tab.id);
                                        setSearchParams({ tab: tab.id });
                                    }}
                                    className={`relative px-5 sm:px-6 py-2.5 sm:py-3 rounded-full font-medium text-[12px] sm:text-[14px] flex items-center gap-2 transition-all duration-300 whitespace-nowrap snap-center border ${activeTab === tab.id
                                        ? 'bg-[#CCFF00] text-black border-[#CCFF00]'
                                        : 'bg-transparent text-gray-300 border-white/10 hover:border-white/20 hover:text-white'
                                        }`}
                                >
                                    <Icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-black' : 'text-gray-400'}`} />
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Content Area */}
                {(loading || personalLoading) ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <Loader className="w-10 h-10 animate-spin mb-4 text-padel-green" />
                        <p>Loading events...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-64 text-red-400 bg-red-900/10 border border-red-500/20 rounded-3xl">
                        <AlertCircle className="w-10 h-10 mb-4" />
                        <p>{error}</p>
                    </div>
                ) : filteredEvents.length === 0 ? (
                    <div className="text-center py-32 text-gray-400 bg-white/5 border border-white/10 rounded-3xl">
                        <p className="text-xl mb-4">No events found matching your criteria.</p>
                        <button
                            onClick={() => { setSearchTerm(''); setStatusFilters([]); setCityFilter('All'); setTimingFilter('All'); setLeagueFilter('All'); }}
                            className="text-padel-green font-bold hover:text-white flex items-center gap-2 mx-auto transition-colors"
                        >
                            <X className="w-4 h-4" /> Clear all filters
                        </button>
                    </div>
                ) : (
                    <>
                        {viewMode === 'list' ? (
                            /* Premium List View */
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 mb-3 px-1">
                                    <h2 className="text-[11px] sm:text-sm md:text-base font-bold uppercase tracking-wide sm:tracking-widest text-white/80">Upcoming Events</h2>
                                    <div className="bg-padel-green/10 border border-padel-green/20 text-padel-green px-2 py-0.5 rounded-full text-[10px] font-black">
                                        {filteredEvents.length}
                                    </div>
                                </div>
                                <AnimatePresence mode="popLayout">
                                    {paginatedEvents.map((event, index) => (
                                        <CalendarEventItem key={event.id} event={event} index={index} />
                                    ))}
                                </AnimatePresence>

                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                    <div className="mt-8 flex justify-center items-center gap-4">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="w-12 h-12 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-white/10"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>

                                        <span className="text-gray-400 text-sm font-bold uppercase tracking-widest">
                                            Page <span className="text-white">{currentPage}</span> of {totalPages}
                                        </span>

                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className="w-12 h-12 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-white/10"
                                        >
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Full Calendar Grid View */
                            <motion.div
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
                            >
                                {/* Calendar Header */}
                                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/40">
                                    <h2 className="text-2xl md:text-3xl font-bold text-white">
                                        {monthNames[currentDate.getMonth()]} <span className="text-padel-green">{currentDate.getFullYear()}</span>
                                    </h2>
                                    <div className="flex gap-2">
                                        <button onClick={prevMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10">
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                        <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold transition-colors border border-white/10 uppercase tracking-widest">
                                            Today
                                        </button>
                                        <button onClick={nextMonth} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10">
                                            <ChevronRight className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Calendar Grid */}
                                <div className="grid grid-cols-7 border-b border-white/10 bg-black/20">
                                    {dayNames.map(day => (
                                        <div key={day} className="py-4 text-center text-xs font-bold uppercase tracking-widest text-padel-green">
                                            {day}
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7">
                                    {renderCalendarGrid()}
                                </div>
                            </motion.div>
                        )}
                    </>
                )}

                <div className="mt-10 bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-3xl text-sm text-gray-400 leading-relaxed text-center max-w-4xl mx-auto shadow-xl">
                    <p className="mb-3"><strong className="text-white uppercase tracking-widest text-xs">Note</strong> <br />Further information on all events will be released in due course. Please note event information is subject to change.</p>
                    <p>All players are required to have a valid SAPA Player's license for all Gold and Major events. Registration for events is strictly through 4M Padel.</p>
                </div>
            </main>
        </div>
    );
};

export default Calendar;
