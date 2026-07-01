import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { useRankedin } from '../hooks/useRankedin';
import { supabase } from '../supabaseClient';
import { Calendar, ChevronLeft, ChevronRight, Play, PlayCircle, Trophy, GitBranch, Users, X, MapPin, Shield, ArrowRight } from 'lucide-react';
import VideoModal, { getYoutubeEmbedUrl } from './VideoModal';
import { getEventImage } from '../utils/imageUtils';
import featuredBg from '../assets/featuredbg.jpeg';

const getStatusColors = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('broll')) return {
        text: 'text-[#F40020]',
        bg: 'bg-[#F40020]/20',
        border: 'border-[#F40020]/40',
        hover: 'hover:border-[#F40020]',
        glow: 'shadow-[#F40020]/20',
        solid: 'bg-[#F40020]',
        solidText: 'text-white'
    };
    if (s.includes('major')) return {
        text: 'text-red-500',
        bg: 'bg-red-500/20',
        border: 'border-red-500/40',
        hover: 'hover:border-red-500',
        glow: 'shadow-red-500/20',
        solid: 'bg-red-600',
        solidText: 'text-white'
    };
    if (s.includes('super gold') || s === 's gold') return {
        text: 'text-amber-500',
        bg: 'bg-amber-500/20',
        border: 'border-amber-500/40',
        hover: 'hover:border-amber-500',
        glow: 'shadow-amber-500/20',
        solid: 'bg-amber-500',
        solidText: 'text-black'
    };
    if (s.includes('gold')) return {
        text: 'text-yellow-400',
        bg: 'bg-yellow-400/20',
        border: 'border-yellow-400/40',
        hover: 'hover:border-yellow-400',
        glow: 'shadow-yellow-400/20',
        solid: 'bg-yellow-400',
        solidText: 'text-black'
    };
    if (s.includes('silver')) return {
        text: 'text-gray-400',
        bg: 'bg-gray-400/20',
        border: 'border-gray-400/40',
        hover: 'hover:border-gray-400',
        glow: 'shadow-gray-400/20',
        solid: 'bg-gray-400',
        solidText: 'text-black'
    };
    if (s.includes('bronze')) return {
        text: 'text-orange-700',
        bg: 'bg-orange-700/20',
        border: 'border-orange-700/40',
        hover: 'hover:border-orange-700',
        glow: 'shadow-orange-700/20',
        solid: 'bg-orange-700',
        solidText: 'text-white'
    };
    if (s.includes('fip')) return {
        text: 'text-blue-500',
        bg: 'bg-blue-500/20',
        border: 'border-blue-500/40',
        hover: 'hover:border-blue-500',
        glow: 'shadow-blue-500/20',
        solid: 'bg-blue-500',
        solidText: 'text-white'
    };
    return {
        text: 'text-padel-green',
        bg: 'bg-padel-green/20',
        border: 'border-padel-green/40',
        hover: 'hover:border-padel-green',
        glow: 'shadow-padel-green/20',
        solid: 'bg-padel-green',
        solidText: 'text-black'
    };
};

const featuredDataTemplate = [
    {
        id: 'featured-live',
        title: 'Featured Live Match',
        highlight: 'Starting Soon',
        description: 'Experience the thrill of the game as it happens. Watch top-tier Padel action streamed live from our courts.',
        cardLabel: 'Live Stream',
        cardTitle: 'Loading Live Event...',
        image: 'https://images.unsplash.com/photo-1622384950482-1a4cbab9bd36?q=80&w=1471&auto=format&fit=crop',
        align: 'left',
        linkPath: null,
        icon: Play
    },
    {
        id: 'recent-results',
        title: 'Recent Featured Results',
        highlight: 'Results',
        description: 'Relive the highlights and unbelievable moments from last weekend\'s finals. Upsets, brilliant plays, and unmatched sportsmanship on display.',
        cardLabel: 'Tournament Champions',
        cardTitle: 'Johannesburg Open 2026',
        image: 'https://images.unsplash.com/photo-1554068865-c7211fa4d4ab?q=80&w=1470&auto=format&fit=crop',
        align: 'right',
        linkPath: '/results',
        icon: Trophy
    },
    {
        id: 'upcoming-events',
        title: 'Upcoming Featured Tournaments',
        highlight: 'UPCOMING EVENTS',
        description: '',
        cardLabel: 'Upcoming Event',
        cardTitle: 'Loading Upcoming Event...',
        image: null,
        align: 'left',
        linkPath: '/calendar',
        icon: Calendar
    },
];

const FallbackImage = ({ src, alt, className, title }) => {
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false);
    }, [src]);

    if (hasError || !src) {
        const initials = title ? title.substring(0, 2).toUpperCase() : '4M';
        return (
            <div className={`flex items-center justify-center bg-gradient-to-br from-[#0B1121] to-black absolute inset-0 w-full h-full`}>
                <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay"></div>
                <span className="text-4xl font-black text-white/5 font-display tracking-widest">{initials}</span>
                <Trophy className="absolute inset-0 m-auto w-24 h-24 text-white/[0.02]" />
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={alt}
            className={className}
            onError={() => setHasError(true)}
        />
    );
};

const extractRankedinId = (url) => {
    if (!url) return null;
    // Matches /tournament/123, /clubleague/123, /draws/123, or just 123 at the end of a path
    const match = url.match(/\/(?:tournament|clubleague|draws|results)\/(\d+)/) || url.match(/\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
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

// Finds the Men's Open category in a RankedIn winners payload and returns the winning team's name (e.g. "Adam Van Harte / Warren van Heerden")
const findMensOpenWinner = (winners) => {
    if (!Array.isArray(winners)) return null;
    const match = winners.find(w => {
        const cat = (w.CategoryName || w.className || '').toLowerCase();
        return cat.includes('men') && !cat.includes('wom') && cat.includes('open');
    });
    if (!match) return null;
    return match.Winner?.Name || match.winners || null;
};

const renderBrollTitle = (title, tag) => {
    if (!title) return null;

    // Split by "BROLL" (case-insensitive) but only if tag is 'broll' or title contains BROLL
    const isBroll = tag?.toLowerCase() === 'broll' || title.toUpperCase().includes('BROLL');

    if (!isBroll) return title;

    const parts = title.split(/(BROLL)/i);
    return (
        <>
            {parts.map((part, i) =>
                part.toUpperCase() === 'BROLL'
                    ? <span key={i} className="text-[#F40020]">{part}</span>
                    : part
            )}
        </>
    );
};

// VideoModal is now shared from ./VideoModal.jsx

const TournamentCard = ({ index, title, label, date = null, image, linkPath, drawPath = null, isLive = false, youtubeUrl = null, livePlayers = null, nextMatch = null, onWatchLive = null, buttonLabel = "VIEW DETAILS", status = 'Gold', registeredPlayers = null, rankedinId = null, venue = null, organizerName = null, city = null }) => {
    const navigate = useNavigate();
    const { getTournamentClasses } = useRankedin();
    const [hasDraw, setHasDraw] = useState(false);
    const [hasResults, setHasResults] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {
            const rId = rankedinId || extractRankedinId(drawPath) || extractRankedinId(linkPath);
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
    }, [drawPath, linkPath, getTournamentClasses, rankedinId]);

    let tierColor = 'border-white/10';
    let badgeColor = 'bg-white/10 text-gray-400';
    let accentColor = 'text-padel-green';
    let glowColor = 'shadow-padel-green/20';

    const s = status?.toLowerCase() || '';
    if (s.includes('major')) {
        tierColor = 'border-red-500/30 hover:border-red-500/50';
        badgeColor = 'bg-red-500/20 text-red-400 border border-red-500/30';
        accentColor = 'text-red-500';
        glowColor = 'shadow-red-500/15';
    } else if (s.includes('super gold') || s === 's gold') {
        tierColor = 'border-amber-500/30 hover:border-amber-500/50';
        badgeColor = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
        accentColor = 'text-amber-500';
        glowColor = 'shadow-amber-500/15';
    } else if (s.includes('gold')) {
        tierColor = 'border-yellow-500/30 hover:border-yellow-500/50';
        badgeColor = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
        accentColor = 'text-yellow-500';
        glowColor = 'shadow-yellow-500/15';
    } else if (s.includes('silver')) {
        tierColor = 'border-gray-400/30 hover:border-gray-400/50';
        badgeColor = 'bg-gray-500/20 text-gray-300 border border-gray-400/30';
        accentColor = 'text-gray-400';
        glowColor = 'shadow-gray-400/15';
    } else if (s.includes('bronze')) {
        tierColor = 'border-orange-700/30 hover:border-orange-700/50';
        badgeColor = 'bg-orange-700/20 text-orange-400 border border-orange-700/30';
        accentColor = 'text-orange-700';
        glowColor = 'shadow-orange-700/15';
    } else if (s.includes('fip')) {
        tierColor = 'border-blue-500/30 hover:border-blue-500/50';
        badgeColor = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
        accentColor = 'text-blue-500';
        glowColor = 'shadow-blue-500/15';
    } else if (s.includes('broll')) {
        tierColor = 'border-[#F40020]/30 hover:border-[#F40020]/50';
        badgeColor = 'bg-[#F40020]/20 text-[#F40020] border border-[#F40020]/30';
        accentColor = 'text-[#F40020]';
        glowColor = 'shadow-[#F40020]/15';
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            className="h-full"
        >
            <Link
                to={linkPath}
                className={`group relative flex flex-row items-stretch h-full min-h-[140px] sm:min-h-[160px] bg-[#060913] rounded-[20px] sm:rounded-[24px] overflow-hidden border-2 ${tierColor} transition-all duration-500 hover:scale-[1.02] shadow-xl ${glowColor}`}
            >
                {/* Poster Image Container */}
                <div className="relative w-[100px] sm:w-[130px] shrink-0 overflow-hidden bg-black/40 border-r border-white/5">
                    {image ? (
                        <>
                            <FallbackImage
                                src={image}
                                alt=""
                                title={title}
                                className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-125"
                                aria-hidden="true"
                            />
                            <FallbackImage
                                src={image}
                                alt={title}
                                title={title}
                                className="absolute inset-0 z-10 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                        </>
                    ) : (
                        <div className="w-full h-full bg-[#0A0F1C] flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-white/10" />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#060913] opacity-40 z-20" />

                    {isLive && (
                        <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5 bg-red-600 text-white px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest animate-pulse shadow-lg shadow-red-600/30">
                            <div className="w-1 h-1 rounded-full bg-white" />
                            <span>Live</span>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="p-3 sm:p-4 flex flex-col flex-1 min-w-0 justify-center">
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${badgeColor} backdrop-blur-md shadow-lg border border-white/5`}>
                            {label || status}
                        </span>
                    </div>

                    <h3 className="text-sm sm:text-base font-black text-white mb-1.5 group-hover:text-padel-green transition-colors line-clamp-2 uppercase tracking-tight leading-tight">
                        {renderBrollTitle(title, status)}
                    </h3>

                    <div className="space-y-1 mt-auto">
                        {date && (
                            <div className="flex items-center gap-1.5 text-gray-400">
                                <Calendar className={`w-3 h-3 ${accentColor} shrink-0`} />
                                <span className={`text-[9px] sm:text-[10px] font-bold ${accentColor} truncate`}>
                                    {date}
                                </span>
                            </div>
                        )}

                        {(venue || city) && (
                            <div className="flex items-center gap-1.5 text-gray-400">
                                <MapPin className="w-3 h-3 text-gray-500 shrink-0" />
                                <span className="text-[9px] sm:text-[10px] font-medium truncate uppercase tracking-widest">
                                    {[venue, city].filter(Boolean).join(', ')}
                                </span>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                            <div className="flex items-center gap-2">
                                {registeredPlayers > 0 && (
                                    <div className="flex items-center gap-1">
                                        <Users className={`w-2.5 h-2.5 ${accentColor}`} />
                                        <span className="text-white font-bold text-[9px] sm:text-[10px]">{registeredPlayers}</span>
                                    </div>
                                )}
                                {drawPath && (hasDraw || hasResults) && (
                                    <Link
                                        to={drawPath}
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center gap-1 text-[8px] sm:text-[9px] font-black text-white/50 hover:text-padel-green transition-colors uppercase tracking-widest border border-white/10 hover:border-padel-green/30 bg-white/5 px-2 py-0.5 rounded-full"
                                    >
                                        <GitBranch className="w-2.5 h-2.5 text-padel-green" />
                                        <span>Draws</span>
                                    </Link>
                                )}
                            </div>

                            <div className="flex items-center gap-1 text-padel-green font-black text-[9px] sm:text-[10px] uppercase tracking-widest group-hover:translate-x-1 transition-transform">
                                <span>{buttonLabel}</span>
                                <ArrowRight className="w-3 h-3" />
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
};



const RecentResultCard = ({ title, label, startDateStr, linkPath, status, winnerName, venue, city }) => {
    const statusColors = getStatusColors(status);

    // Extracting emojis if title has trophy
    const cleanTitle = title.replace('🏆', '').trim();
    const hasTrophy = title.includes('🏆') || cleanTitle.toLowerCase().includes('open') || cleanTitle.toLowerCase().includes('cup') || cleanTitle.toLowerCase().includes('1000');

    let month = '';
    let day = '';
    if (startDateStr) {
        const d = new Date(startDateStr);
        if (!isNaN(d.getTime())) {
            month = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d).toUpperCase();
            day = d.getDate();
        }
    }

    return (
        <div className="group relative rounded-[16px] p-[1px] overflow-hidden bg-white/5 shadow-xl">
            {/* Rotating shimmer along the border */}
            <div
                className="absolute inset-0 animate-spin opacity-60 group-hover:opacity-100 transition-opacity duration-300 [animation-duration:6s] pointer-events-none"
                style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 78%, rgba(204,255,0,0.9) 88%, transparent 96%)' }}
            />
            <Link to={linkPath} className="relative z-10 flex items-center gap-4 p-4 bg-[#0A0F1C] rounded-[15px] transition-colors duration-300">
                {/* Date block */}
                {startDateStr && (
                    <div className="flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-xl border border-padel-green/30">
                        <span className="text-padel-green text-[9px] sm:text-[10px] font-black uppercase tracking-widest">{month}</span>
                        <span className="text-white text-xl sm:text-2xl font-bold leading-none mt-0.5">{day}</span>
                    </div>
                )}

                <div className="flex-1 min-w-0">
                    <span className={`px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest border ${statusColors.border} ${statusColors.text} bg-transparent inline-block mb-2`}>
                        {label || status}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-white mb-1.5 uppercase tracking-tight leading-tight group-hover:text-padel-green transition-colors truncate">
                        {cleanTitle} {hasTrophy && '🏆'}
                    </h3>

                    {(venue || city) && (
                        <div className="flex items-center gap-1.5 text-gray-400 mb-1">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="text-[9px] sm:text-[10px] font-medium truncate">
                                {[venue, city].filter(Boolean).join(', ')}
                            </span>
                        </div>
                    )}
                    {winnerName && (
                        <div className="flex items-center gap-1.5 text-gray-400">
                            <Users className={`w-3 h-3 shrink-0 ${statusColors.text}`} />
                            <span className="text-[9px] sm:text-[10px] font-medium truncate">
                                Winner: {winnerName}
                            </span>
                        </div>
                    )}
                </div>

                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-padel-green shrink-0 group-hover:translate-x-1 transition-transform" />
            </Link>
        </div>
    );
};

const UpcomingEventListItem = ({ title, label, startDateStr, linkPath, status, venue, city, registeredPlayers }) => {
    const statusColors = getStatusColors(status);

    // Always show the tournament's start date only (day/month/weekday), never a range
    let day = '';
    let month = '';
    let weekday = 'TBD';
    if (startDateStr) {
        const d = new Date(startDateStr);
        if (!isNaN(d.getTime())) {
            day = String(d.getDate()).padStart(2, '0');
            month = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(d).toUpperCase();
            weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(d).toUpperCase();
        }
    }

    return (
        <div className="group relative rounded-[16px] p-[1px] overflow-hidden bg-white/5 shadow-xl">
            {/* Rotating shimmer along the border */}
            <div
                className="absolute inset-0 animate-spin opacity-60 group-hover:opacity-100 transition-opacity duration-300 [animation-duration:6s] pointer-events-none"
                style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 78%, rgba(204,255,0,0.9) 88%, transparent 96%)' }}
            />
            <Link to={linkPath} className="relative z-10 flex items-center py-3 px-4 bg-[#0A0F1C] rounded-[15px] transition-colors duration-300">
                <div className="flex flex-col items-center justify-center text-center w-14 sm:w-16 shrink-0 border-r border-white/10 pr-3 sm:pr-4 mr-3 sm:mr-4">
                    <span className="text-[9px] sm:text-[10px] font-black text-padel-green uppercase tracking-widest mb-0.5">{month}</span>
                    <span className="text-xl sm:text-2xl font-bold text-white leading-none mb-0.5">{day}</span>
                    <span className="text-[8px] sm:text-[9px] font-bold text-padel-green uppercase tracking-widest">{weekday}</span>
                </div>

                <div className="flex-1 min-w-0 pr-2 sm:pr-4">
                    <span className={`hidden sm:inline-block px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${statusColors.border} ${statusColors.text} bg-transparent mb-1.5`}>
                        {label || status}
                    </span>
                    <h3 className="text-xs sm:text-sm font-bold text-white mb-1.5 uppercase tracking-tight truncate group-hover:text-padel-green transition-colors">
                        {title}
                    </h3>
                    {(venue || city) && (
                        <div className="flex items-center gap-1.5 text-gray-400">
                            <MapPin className="w-3 h-3 shrink-0 text-gray-500" />
                            <span className="text-[9px] sm:text-[10px] font-medium truncate uppercase tracking-widest">
                                {[venue, city].filter(Boolean).join(', ')}
                            </span>
                        </div>
                    )}
                    {registeredPlayers > 0 && (
                        <div className="flex items-center gap-1.5 text-gray-400 mt-1">
                            <Users className={`w-3 h-3 shrink-0 ${statusColors.text}`} />
                            <span className="text-[9px] sm:text-[10px] font-medium truncate">
                                {registeredPlayers} Registered
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 sm:gap-0 shrink-0 pl-2">
                    <span className={`sm:hidden px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${statusColors.border} ${statusColors.text} bg-transparent`}>
                        {label || status}
                    </span>
                    <ChevronRight className="w-4 h-4 text-padel-green shrink-0 group-hover:translate-x-1 transition-all" />
                </div>
            </Link>
        </div>
    );
};

const FeaturedSectionBlock = ({ data, index, liveTournaments, featuredTournaments, liveFeaturedTournaments, onWatchLive }) => {
    const navigate = useNavigate();
    const { getTournamentClasses } = useRankedin();
    const [hasDraw, setHasDraw] = useState(false);
    const [hasResults, setHasResults] = useState(false);
    const scrollRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const [recentResultsPage, setRecentResultsPage] = useState(0);

    // Image/Card content for the right/bottom side of the hero section
    const items = data.id === 'recent-results' ? liveTournaments : (data.id === 'featured-live' ? liveFeaturedTournaments : featuredTournaments);
    const isSlider = items && items.length > 3;

    const checkScroll = () => {
        if (scrollRef.current && window.innerWidth >= 768) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
            setCanScrollLeft(scrollLeft > 10);
            setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
        }
    };

    const scroll = (direction) => {
        if (scrollRef.current) {
            const { scrollLeft, clientWidth } = scrollRef.current;
            const scrollAmount = clientWidth * 0.8;
            const scrollTo = direction === 'left'
                ? scrollLeft - scrollAmount
                : scrollLeft + scrollAmount;
            scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
        }
    };

    useEffect(() => {
        const checkStatus = async () => {
            // Only check for single blocks (where data.linkPath or data.rankedin_url exists)
            if (data.id !== 'recent-results' && !(data.id === 'upcoming-events' && featuredTournaments?.length > 1) && !(data.id === 'featured-live' && liveFeaturedTournaments?.length > 1)) {
                const rId = data.rankedinId || extractRankedinId(data.rankedin_url) || extractRankedinId(data.linkPath);
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
            }
        };
        checkStatus();
    }, [data.rankedin_url, data.linkPath, data.id, data.rankedinId, featuredTournaments, getTournamentClasses]);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            el.addEventListener('scroll', checkScroll);
            // Initial check
            setTimeout(checkScroll, 100);
            return () => el.removeEventListener('scroll', checkScroll);
        }
    }, [featuredTournaments, liveTournaments, liveFeaturedTournaments]);

    const isLeft = data.align === 'left';
    const isGridSection = data.id === 'recent-results' || data.id === 'upcoming-events' || (data.id === 'upcoming-events' && featuredTournaments?.length > 1) || (data.id === 'featured-live' && liveFeaturedTournaments?.length > 1);

    const isFeatured = data.id === 'featured-tournaments';
    const isLiveSection = data.id === 'featured-live';
    const bgColors = [
        'bg-[#080C17]',
        'bg-[#05070A]',
        'bg-[#080C17]'
    ];
    const bgColor = isFeatured ? 'bg-padel-green' : bgColors[index % bgColors.length];
    const Icon = data.icon || PlayCircle;
    const displayStatus = (data.tournament_tag && data.tournament_tag.toLowerCase() !== 'none') ? data.tournament_tag : (data.status || data.cardLabel);
    const statusColors = getStatusColors(displayStatus);

    // Text content for the left/top side of the hero section
    const textContent = isGridSection ? (
        <div className="relative z-10 flex items-center justify-between mb-6 md:mb-8">
            <h2 className={`text-[11px] sm:text-sm md:text-base font-bold uppercase tracking-wide sm:tracking-widest truncate ${isFeatured ? 'text-black' : 'text-white/80'}`}>
                {data.title}
            </h2>
            {data.linkPath && (
                <button
                    onClick={() => navigate(data.linkPath)}
                    className={`flex items-center gap-1 text-[10px] md:text-xs font-medium uppercase tracking-widest transition-colors shrink-0 ${isFeatured ? 'text-black/70 hover:text-black' : 'text-[#CCFF00] hover:text-white'}`}
                >
                    {data.id === 'upcoming-events' ? 'View calendar' : 'View all'} <ArrowRight className="w-3 h-3" />
                </button>
            )}
        </div>
    ) : (
        <div className={`relative z-10 ${!isGridSection ? 'lg:pr-8' : ''}`}>
            <motion.div
                initial={{ opacity: 0, x: isLeft ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
            >
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${isFeatured ? 'border-black/20 text-black bg-black/5' : isLiveSection ? 'border-red-500/20 text-red-400 bg-red-500/10' : 'border-white/10 text-padel-green bg-padel-green/5'} text-[10px] font-bold uppercase tracking-widest mb-6`}>
                    {isLiveSection ? <Play className="w-3.5 h-3.5 fill-current" /> : <Icon className="w-3.5 h-3.5" />}
                    <span>{data.highlight}</span>
                </div>

                <h2 className={`font-bold mb-6 font-display leading-[1.0] tracking-tighter ${isFeatured ? 'text-black' : 'text-white'} text-5xl lg:text-[64px] xl:text-[72px]`}>
                    {data.title.split(' ')[0]} <br />
                    <span className={isFeatured ? 'text-black/70' : 'text-transparent bg-clip-text bg-gradient-to-r from-gray-200 via-gray-400 to-gray-600'}>
                        {data.title.split(' ').slice(1).join(' ')}
                    </span>
                </h2>

                <p className={`${isFeatured ? 'text-black/80 font-medium' : 'text-gray-400'} leading-relaxed mb-6 text-base md:text-lg max-w-md`}>
                    {data.description}
                </p>

                {isLiveSection && data.cardTitle && (
                    <div className="mb-8">
                        <p className="text-[10px] font-black text-padel-green uppercase tracking-widest mb-2">EVENT</p>
                        <h3 className="text-xl md:text-2xl font-bold text-white uppercase tracking-tight leading-tight">{data.cardTitle}</h3>
                    </div>
                )}

                {isLiveSection && data.livePlayers && (
                    <div className="mb-8 p-6 rounded-[24px] bg-red-500/5 border border-red-500/10 backdrop-blur-sm max-w-sm">
                        <div className="flex justify-between items-start">
                            <div className="flex-grow">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">LIVE NOW</span>
                                </div>
                                <p className="text-white font-bold text-xl tracking-tight leading-tight">{data.livePlayers}</p>
                            </div>

                            {data.youtubeUrl && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onWatchLive(data.youtubeUrl, data.cardTitle || data.title);
                                    }}
                                    className="relative flex items-center justify-center w-12 h-12 rounded-full bg-red-600 text-white hover:bg-white hover:text-red-600 transition-all duration-300 shadow-xl shadow-red-600/30 group/play shrink-0 ml-4 pointer-events-auto"
                                >
                                    <div className="absolute inset-0 rounded-full bg-red-600 animate-ping opacity-20 group-hover/play:hidden" />
                                    <Play className="w-5 h-5 relative z-10 fill-current" />
                                </button>
                            )}
                        </div>

                        {data.nextMatch && (
                            <div className="mt-1 pt-2 border-t border-white/5">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">UP NEXT</p>
                                <p className="text-white/60 font-medium text-sm">{data.nextMatch}</p>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    );

    const maxResultsPage = Math.max(0, Math.ceil((items?.length || 0) / 2) - 1);

    const imageContent = data.id === 'recent-results' ? (
        <div className="relative z-10 w-full mt-4 lg:mt-0">
            <div className="flex flex-col gap-4 w-full bg-[#060913] rounded-3xl p-4 sm:p-6 shadow-2xl border border-white/5">
                {items?.slice(recentResultsPage * 2, recentResultsPage * 2 + 2).map((t, i) => (
                    <RecentResultCard
                        key={t.id || t.eventId}
                        title={t.event_name || t.eventName}
                        label={t.sapa_status || t.sapaStatus || 'Tournament'}
                        startDateStr={t.start_date}
                        linkPath={t.customLink || (t.event_name ? `/calendar/${t.slug || t.id}` : `/draws/${t.eventId}`)}
                        status={t.sapa_status || t.sapaStatus || 'Gold'}
                        winnerName={t.winnerName}
                        venue={t.venue || t.clubName}
                        city={t.city}
                    />
                ))}

                {(items?.length > 2) && (
                    <div className="flex gap-4 justify-center mt-2">
                        <button
                            onClick={() => setRecentResultsPage(p => Math.max(0, p - 1))}
                            disabled={recentResultsPage === 0}
                            className={`w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center transition-colors ${recentResultsPage === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-padel-green hover:text-black'}`}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setRecentResultsPage(p => Math.min(maxResultsPage, p + 1))}
                            disabled={recentResultsPage === maxResultsPage}
                            className={`w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center transition-colors ${recentResultsPage === maxResultsPage ? 'opacity-50 cursor-not-allowed' : 'hover:bg-padel-green hover:text-black'}`}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    ) : data.id === 'upcoming-events' ? (
        <div className="relative z-10 w-full mt-4 lg:mt-0">
            <div className="flex flex-col gap-3">
                {items?.slice(0, 5).map((t, i) => (
                    <UpcomingEventListItem
                        key={t.id || t.eventId}
                        title={t.event_name || t.eventName}
                        label={t.sapa_status || t.sapaStatus || 'Tournament'}
                        startDateStr={t.start_date || null}
                        linkPath={t.customLink || (t.event_name ? `/calendar/${t.slug || t.id}` : `/draws/${t.eventId}`)}
                        status={t.sapa_status || t.sapaStatus || 'Gold'}
                        venue={t.venue || t.clubName}
                        city={t.city}
                        registeredPlayers={t.registered_players || t.registeredPlayers}
                    />
                ))}
            </div>

            <button onClick={() => navigate('/calendar')} className="mt-4 w-full py-4 rounded-xl border border-[#CCFF00]/50 text-[#CCFF00] text-[10px] sm:text-xs font-black uppercase tracking-widest hover:bg-[#CCFF00] hover:text-black transition-all flex items-center justify-center gap-2 group">
                VIEW ALL TOURNAMENTS <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </button>
        </div>
    ) : isGridSection ? (
        <div className="relative z-10 w-full mt-4 lg:mt-0 min-w-0">
            {/* Unified swipable horizontal list & desktop grid/slider */}
            <div
                ref={scrollRef}
                className={`flex overflow-x-auto overflow-y-hidden touch-pan-x gap-4 pb-5 snap-x snap-mandatory scrollbar-hide no-scrollbar w-full ${isSlider
                    ? 'md:flex md:overflow-x-auto md:overflow-y-hidden md:touch-pan-x md:pb-8 -mx-4 px-4 scroll-px-4 sm:-mx-8 sm:px-8 sm:scroll-px-8 xl:-mx-12 xl:px-12 xl:scroll-px-12 after:content-[\'\'] after:min-w-[1px] after:shrink-0'
                    : 'md:grid md:grid-cols-3 md:overflow-x-visible md:overflow-y-visible md:touch-auto md:pb-0'
                    }`}
                style={isSlider ? { scrollbarWidth: 'none', msOverflowStyle: 'none' } : {}}
            >
                {items?.map((t, i) => (
                    <div
                        key={t.id || t.eventId}
                        className={`flex-none w-[290px] snap-start ${isSlider ? 'md:w-[calc(33.333%-16px)]' : 'md:w-full'
                            }`}
                    >
                        <TournamentCard
                            index={i}
                            title={t.event_name || t.eventName}
                            label={t.sapa_status || t.sapaStatus || 'Tournament'}
                            date={t.start_date ? formatTournamentDate(t.start_date, t.end_date) : t.date}
                            image={getEventImage(t) || t.image || `https://rankedin-prod-cdn-adavg8d3dwfegkbd.z01.azurefd.net/images/upload/tournament/${t.eventId}.png`}
                            linkPath={t.customLink || (t.event_name ? `/calendar/${t.slug || t.id}` : `/draws/${t.eventId}`)}
                            drawPath={t.event_name ? ((t.rankedin_id || extractRankedinId(t.rankedin_url)) ? `/draws/${t.slug || t.rankedin_id || extractRankedinId(t.rankedin_url)}` : null) : null}
                            buttonLabel={t.event_name ? "VIEW DETAILS" : "VIEW RESULTS"}
                            status={t.sapa_status || t.sapaStatus || 'Gold'}
                            registeredPlayers={t.registered_players || t.registeredPlayers}
                            rankedinId={t.rankedin_id || t.eventId}
                            venue={t.venue || t.clubName}
                            organizerName={t.organizer_name || t.organizerName}
                            city={t.city}
                        />
                    </div>
                ))}
            </div>

            {/* Pagination / Scroll buttons - visible on mobile when > 1 item, on desktop when isSlider */}
            {(isSlider || (items && items.length > 1)) && (
                <div className={`flex gap-4 z-20 mt-8 justify-center min-h-[44px] ${isSlider ? '' : 'md:hidden'}`}>
                    <button
                        onClick={() => canScrollLeft && scroll('left')}
                        disabled={!canScrollLeft}
                        className={`w-11 h-11 rounded-full border flex items-center justify-center transition-all duration-300 ${!canScrollLeft
                            ? isFeatured ? 'opacity-30 cursor-not-allowed border-black/10 bg-black/5 text-black/50' : 'opacity-30 cursor-not-allowed border-white/5 bg-white/5 text-white/50'
                            : isFeatured ? 'bg-black/10 border-black/20 text-black hover:bg-black hover:text-white cursor-pointer' : 'bg-white/5 border-white/10 text-white hover:bg-padel-green hover:text-black cursor-pointer'
                            }`}
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => canScrollRight && scroll('right')}
                        disabled={!canScrollRight}
                        className={`w-11 h-11 rounded-full border flex items-center justify-center transition-all duration-300 ${!canScrollRight
                            ? isFeatured ? 'opacity-30 cursor-not-allowed border-black/10 bg-black/5 text-black/50' : 'opacity-30 cursor-not-allowed border-white/5 bg-white/5 text-white/50'
                            : isFeatured ? 'bg-black/10 border-black/20 text-black hover:bg-black hover:text-white cursor-pointer' : 'bg-white/5 border-white/10 text-white hover:bg-padel-green hover:text-black cursor-pointer'
                            }`}
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    ) : (
        <motion.div
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            whileInView={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`relative w-full min-h-[400px] md:min-h-[440px] h-auto max-w-[540px] mx-auto lg:mx-0 ${isLeft ? 'lg:ml-auto' : 'lg:mr-auto'} rounded-[28px] overflow-hidden group cursor-pointer border-2 ${statusColors.border} ${statusColors.hover} transition-all duration-700 bg-[#05070A] z-10 mt-4 lg:mt-0 shadow-2xl flex flex-col`}
            onClick={() => data.linkPath && navigate(data.linkPath)}
        >
            {/* Corner Ribbon */}
            <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none z-30 overflow-hidden rounded-tr-[28px]">
                <div className={`absolute top-[22px] right-[-45px] w-[180px] py-1.5 ${statusColors.solid} rotate-45 flex items-center justify-center shadow-lg border-b border-white/20 transition-transform duration-500 group-hover:scale-105`}>
                    <span className={`text-[8px] font-black ${statusColors.solidText} uppercase tracking-wider`}>
                        {displayStatus}
                    </span>
                </div>
            </div>

            {/* Background Image — event poster if uploaded, otherwise the default event background */}
            <div className="absolute inset-0">
                <FallbackImage
                    src={data.image || getEventImage(data)}
                    alt=""
                    title={data.cardTitle || data.title}
                    className="w-full h-full object-cover"
                />
            </div>

            {/* Background Gradient & Overlays (kept on top of the image for text legibility) */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#05070A] via-[#05070A]/75 to-[#05070A]/25" />
            <div className="absolute inset-0 bg-gradient-to-br from-[#0A0F1F]/50 via-transparent to-transparent" />
            <div className="absolute inset-0 bg-white/[0.01]" />

            {(data.isLive || data.id === 'live-events' || data.id === 'featured-live') && (
                <div className="absolute top-6 left-6 flex items-center gap-2 bg-red-600 px-3 py-1.5 rounded-full z-30 shadow-lg shadow-red-600/30">
                    <Play className="w-2.5 h-2.5 text-white fill-current animate-pulse" />
                    <span className="text-[9px] font-black text-white uppercase tracking-widest">Live Now</span>
                </div>
            )}

            <div className="flex flex-col h-full p-8 md:p-10 lg:p-12 pt-32 md:pt-36 z-20 pointer-events-none flex-grow">
                <h3 className={`text-xl md:text-2xl lg:text-3xl font-medium text-white leading-tight mb-8 group-hover:${statusColors.text} transition-all duration-500 tracking-tight`}>
                    {renderBrollTitle(data.cardTitle || data.title, data.tournament_tag || data.cardLabel)}
                </h3>

                {(data.date || data.city || data.venue || data.organizerName || data.registeredPlayers > 0) && (
                    <div className="grid grid-cols-2 gap-y-4 gap-x-6 pt-8 border-t border-white/10 pointer-events-auto">
                        {data.date && (
                            <div className="flex items-center gap-2.5 overflow-hidden">
                                <Calendar className="w-3.5 h-3.5 text-padel-green shrink-0" />
                                <span className="text-[10px] md:text-xs font-medium text-padel-green truncate uppercase tracking-widest">{data.date}</span>
                            </div>
                        )}
                        {data.city && (
                            <div className="flex items-center gap-2.5 overflow-hidden">
                                <MapPin className={`w-3.5 h-3.5 ${statusColors.text} shrink-0`} />
                                <span className="text-[10px] md:text-xs font-medium text-white/60 truncate uppercase tracking-widest">{data.city}</span>
                            </div>
                        )}
                        {data.venue && (
                            <div className="flex items-center gap-2.5 overflow-hidden">
                                <MapPin className={`w-3.5 h-3.5 ${statusColors.text} shrink-0`} />
                                <span className="text-[10px] md:text-xs font-medium text-white/60 truncate uppercase tracking-widest">{data.venue}</span>
                            </div>
                        )}
                        {data.organizerName && (
                            <div className="flex items-center gap-2.5 overflow-hidden">
                                <Shield className={`w-3.5 h-3.5 ${statusColors.text} shrink-0`} />
                                <span className="text-[10px] md:text-xs font-medium text-white/60 truncate uppercase tracking-widest">{data.organizerName}</span>
                            </div>
                        )}
                        {data.registeredPlayers > 0 && (
                            <div className="flex items-center gap-2.5 overflow-hidden">
                                <Users className={`w-3.5 h-3.5 ${statusColors.text} shrink-0`} />
                                <span className="text-[10px] md:text-xs font-medium text-white/60 truncate uppercase tracking-widest">{data.registeredPlayers} Players</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-auto pt-10 flex items-center gap-4 pointer-events-auto flex-wrap">
                    {(() => {
                        const rId = data.rankedinId || extractRankedinId(data.rankedin_url) || extractRankedinId(data.linkPath);
                        const slugMatch = data.linkPath?.match(/\/calendar\/([^\/]+)/);
                        const slug = slugMatch ? slugMatch[1] : null;

                        return (
                            <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
                                {data.id === 'featured-live' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (data.youtubeUrl) {
                                                if (onWatchLive) onWatchLive(data.youtubeUrl, data.cardTitle || data.title);
                                                else window.open(data.youtubeUrl, '_blank');
                                            } else {
                                                navigate(data.linkPath || `/calendar/${slug || rId}`);
                                            }
                                        }}
                                        className="group/btn relative flex items-center justify-center w-full bg-red-600 border border-red-600 hover:bg-white px-6 py-4 rounded-2xl transition-all duration-300 shadow-xl shadow-red-600/20"
                                    >
                                        <Play className="absolute left-6 w-5 h-5 text-white group-hover:text-red-600 transition-colors fill-current" />
                                        <span className="text-sm font-black text-white group-hover:text-red-600 transition-colors uppercase tracking-[0.2em]">{data.youtubeUrl ? 'WATCH LIVE NOW' : 'WATCH LIVE SOON'}</span>
                                        <ChevronRight className="absolute right-6 w-5 h-5 text-white group-hover:text-red-600 group-hover:translate-x-1.5 transition-all duration-500" />
                                    </button>
                                )}

                                {(hasDraw || hasResults) && rId && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); navigate(`/draws/${slug || rId}`); }}
                                        className={`group/btn relative flex items-center justify-center w-full bg-white/5 border-2 ${statusColors.border} hover:${statusColors.solid} px-6 py-4 rounded-2xl transition-all duration-300 shadow-xl ${statusColors.glow}`}
                                    >
                                        <GitBranch className={`absolute left-6 w-5 h-5 ${statusColors.text} group-hover:${statusColors.solidText} transition-colors`} />
                                        <span className={`text-sm font-black ${statusColors.text} group-hover:${statusColors.solidText} transition-colors uppercase tracking-[0.2em]`}>DRAWS & RESULTS</span>
                                        <ChevronRight className={`absolute right-6 w-5 h-5 ${statusColors.text} group-hover:${statusColors.solidText} group-hover:translate-x-1.5 transition-all duration-500`} />
                                    </button>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>
        </motion.div>
    );

    return (
        <section className={`relative py-6 lg:py-8 border-t border-white/5 overflow-hidden ${bgColor}`} id={data.id}>
            <div className={`w-full max-w-[1500px] mx-auto px-4 md:px-8 relative z-10`}>
                {isGridSection ? (
                    <>
                        {textContent}
                        {imageContent}
                    </>
                ) : (
                    <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center max-w-[1200px] mx-auto">
                        <div className={`order-2 lg:order-1 border border-transparent`}>
                            {isLeft ? textContent : imageContent}
                        </div>
                        <div className={`order-1 lg:order-2 border border-transparent`}>
                            {isLeft ? imageContent : textContent}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
};

// Standalone "Featured Tournament" hero card — sits above Recent Featured Results.
// Background is always the featuredbg photo; the event's own uploaded poster (if any)
// is shown as a distinct insert on the right, not as the background.
const FeaturedTournamentHero = ({ event }) => {
    const navigate = useNavigate();

    if (!event) return null;

    const statusColors = getStatusColors(event.sapa_status || event.tournament_tag);
    const dateLabel = formatTournamentDate(event.start_date, event.end_date);
    const location = [event.venue || event.clubName, event.city].filter(Boolean).join(', ');
    const locationWords = location.split(' ');
    const locationShort = locationWords.length > 3 ? `${locationWords.slice(0, 3).join(' ')}…` : location;
    const posterImage = event.image || event.custom_image_url;
    const linkPath = `/calendar/${event.slug || event.id}`;

    return (
        <section className="relative py-6 lg:py-8 border-t border-white/5 bg-[#05070A]">
            <div className="w-full max-w-[1500px] mx-auto px-4 md:px-8 relative z-10">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[11px] sm:text-sm md:text-base font-bold uppercase tracking-wide sm:tracking-widest truncate text-white/80">
                        Featured Tournament
                    </h2>
                    <button
                        onClick={() => navigate(linkPath)}
                        className="flex items-center gap-1 text-[10px] md:text-xs font-medium uppercase tracking-widest text-[#CCFF00] hover:text-white transition-colors shrink-0"
                    >
                        View event <ArrowRight className="w-3 h-3" />
                    </button>
                </div>

                <div
                    onClick={() => navigate(linkPath)}
                    className="relative w-full min-h-[170px] sm:min-h-[200px] md:min-h-[260px] rounded-[28px] overflow-hidden cursor-pointer group border border-white/10"
                >
                    {/* Background is always the ambient default photo — the poster (if any) is its own insert graphic below */}
                    <img src={featuredBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-black/20" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

                    <div className="relative z-10 flex flex-col h-full p-5 sm:p-6 md:p-8 justify-center max-w-[58%] sm:max-w-md">
                        {(event.sapa_status || event.tournament_tag) && (
                            <span className={`inline-flex w-fit px-3 py-1 rounded-full border ${statusColors.border} ${statusColors.text} bg-transparent text-[10px] font-black uppercase tracking-widest mb-4`}>
                                {event.sapa_status || event.tournament_tag}
                            </span>
                        )}
                        <h3 className="text-base sm:text-lg md:text-2xl font-bold text-white mb-3 uppercase tracking-tight leading-tight line-clamp-2">
                            {event.event_name}
                        </h3>
                        {dateLabel && (
                            <div className="flex items-center gap-2 text-padel-green font-bold text-xs sm:text-sm md:text-base mb-2">
                                <Calendar className="w-4 h-4 shrink-0" /> {dateLabel}
                            </div>
                        )}
                        {location && (
                            <div className="flex items-center gap-2 text-white/60 text-[11px] sm:text-xs md:text-sm truncate">
                                <MapPin className="w-4 h-4 shrink-0" />
                                <span className="truncate sm:hidden">{locationShort}</span>
                                <span className="hidden sm:inline truncate">{location}</span>
                            </div>
                        )}
                    </div>

                    {posterImage && (
                        <div className="absolute right-3 sm:right-6 md:right-10 top-1/2 -translate-y-1/2 w-24 sm:w-36 md:w-52 aspect-[4/5] rounded-xl overflow-hidden shadow-2xl border border-white/10 group-hover:scale-105 transition-transform duration-500">
                            <img src={posterImage} alt={event.event_name} className="w-full h-full object-cover" />
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
};

const FeaturedSections = () => {
    const { getRecentTournaments } = useRankedin();
    const [liveTournaments, setLiveTournaments] = useState([]);
    const [featuredTournaments, setFeaturedTournaments] = useState([]);
    const [liveFeaturedTournaments, setLiveFeaturedTournaments] = useState([]);
    const [featuredData, setFeaturedData] = useState(featuredDataTemplate);
    const [videoModal, setVideoModal] = useState({ isOpen: false, url: '', title: '' });

    const openVideoModal = (url, title) => {
        setVideoModal({ isOpen: true, url, title });
    };

    const closeVideoModal = () => {
        setVideoModal({ ...videoModal, isOpen: false });
    };

    useEffect(() => {
        const fetchTours = async () => {
            try {
                // First try to fetch results marked as featured_result in our calendar table
                const { data: featuredResults, error } = await supabase
                    .from('calendar')
                    .select('*, registered_players, start_date, end_date')
                    .eq('featured_result', true)
                    .neq('is_visible', false)
                    .order('start_date', { ascending: false })
                    .limit(10);

                if (featuredResults && featuredResults.length > 0 && !error) {
                    // Pull cached RankedIn winners so we can surface the Men's Open champions on each result card
                    const { data: resultsCache } = await supabase
                        .from('rankedin_results_cache')
                        .select('event_id, winners')
                        .in('event_id', featuredResults.map(t => t.id));

                    // Map calendar events to the format expected by TournamentCard for results
                    const mappedResults = featuredResults.map(t => ({
                        eventId: t.id,
                        eventName: t.event_name,
                        city: t.city,
                        date: formatTournamentDate(t.start_date, t.end_date),
                        start_date: t.start_date,
                        customLink: `/calendar/${t.slug || t.id}`,
                        sapaStatus: t.sapa_status,
                        registeredPlayers: t.registered_players,
                        venue: t.venue || t.clubName,
                        organizerName: t.organizer_name,
                        winnerName: findMensOpenWinner(resultsCache?.find(c => c.event_id === t.id)?.winners),
                    }));
                    setLiveTournaments(mappedResults);
                } else {
                    // Fallback to RankedIn API for recent results
                    const data = await getRecentTournaments(10);
                    setLiveTournaments(data);
                }
            } catch (err) {
                console.error("Error fetching tournament results:", err);
                const data = await getRecentTournaments(10);
                setLiveTournaments(data);
            }
        };
        fetchTours();

        const fetchFeaturedEvents = async () => {
            try {
                const today = new Date().toISOString().split('T')[0];
                const { data, error } = await supabase
                    .from('calendar')
                    .select('*, registered_players, start_date, end_date')
                    .eq('featured_event', true)
                    .gte('start_date', today)
                    .neq('is_visible', false)
                    .order('start_date', { ascending: true })
                    .limit(10);

                if (data && !error) {
                    // Manual events register players directly on the site (stored in event_registrations),
                    // not through RankedIn, so their registered_players column is stale/0 — count live instead.
                    let enrichedData = data;
                    const manualEventIds = data.filter(e => e.is_manual).map(e => e.id);
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

                            enrichedData = data.map(event =>
                                event.is_manual
                                    ? { ...event, registered_players: counts[event.id] ? counts[event.id].size : 0 }
                                    : event
                            );
                        }
                    }

                    setFeaturedTournaments(enrichedData);

                    // If we only have one featured event, we still update the template for the single block fallback
                    if (enrichedData.length === 1) {
                        const singleEvent = enrichedData[0];
                        setFeaturedData(prevData => {
                            const newData = [...prevData];
                            const featuredIndex = newData.findIndex(item => item.id === 'upcoming-events');
                            if (featuredIndex !== -1) {
                                newData[featuredIndex] = {
                                    ...newData[featuredIndex],
                                    cardTitle: singleEvent.event_name,
                                    cardLabel: singleEvent.sapa_status || 'Major Event',
                                    date: formatTournamentDate(singleEvent.start_date, singleEvent.end_date),
                                    image: getEventImage(singleEvent) || newData[featuredIndex].image,
                                    linkPath: `/calendar/${singleEvent.slug || singleEvent.id}`,
                                    rankedin_url: singleEvent.rankedin_url,
                                    registeredPlayers: singleEvent.registered_players,
                                    rankedinId: singleEvent.rankedin_id || extractRankedinId(singleEvent.rankedin_url),
                                    city: singleEvent.city,
                                    venue: singleEvent.venue || singleEvent.clubName,
                                    organizerName: singleEvent.organizer_name
                                };
                            }
                            return newData;
                        });
                    }
                }
            } catch (err) {
                console.error("Error fetching featured events:", err);
            }
        };

        fetchFeaturedEvents();

        const fetchLiveFeatured = async () => {
            try {
                const { data, error } = await supabase
                    .from('calendar')
                    .select('*, registered_players, start_date, end_date')
                    .eq('featured_live', true)
                    .neq('is_visible', false)
                    .order('start_date', { ascending: true })
                    .limit(10);

                if (data && !error) {
                    setLiveFeaturedTournaments(data);

                    if (data.length === 1) {
                        const singleEvent = data[0];
                        setFeaturedData(prevData => {
                            const newData = [...prevData];
                            const liveIndex = newData.findIndex(item => item.id === 'featured-live');
                            if (liveIndex !== -1) {
                                newData[liveIndex] = {
                                    ...newData[liveIndex],
                                    cardTitle: singleEvent.event_name,
                                    cardLabel: singleEvent.sapa_status || 'Live Event',
                                    highlight: singleEvent.live_youtube_url ? 'Streaming Now' : 'Starting Soon',
                                    date: formatTournamentDate(singleEvent.start_date, singleEvent.end_date),
                                    image: getEventImage(singleEvent) || newData[liveIndex].image,
                                    linkPath: `/calendar/${singleEvent.slug || singleEvent.id}`,
                                    youtubeUrl: singleEvent.live_youtube_url,
                                    livePlayers: singleEvent.live_players,
                                    nextMatch: singleEvent.next_match,
                                    tournament_tag: singleEvent.tournament_tag,
                                    rankedin_url: singleEvent.rankedin_url,
                                    registeredPlayers: singleEvent.registered_players,
                                    rankedinId: singleEvent.rankedin_id || extractRankedinId(singleEvent.rankedin_url),
                                    city: singleEvent.city,
                                    venue: singleEvent.venue || singleEvent.clubName,
                                    organizerName: singleEvent.organizer_name
                                };
                            }
                            return newData;
                        });
                    }
                }
            } catch (err) {
                console.error("Error fetching live featured events:", err);
            }
        };

        fetchLiveFeatured();
    }, [getRecentTournaments]);

    if (liveFeaturedTournaments.length === 0) {
        // Hide the live section if no live events are found
        return (
            <>
                <div className="flex flex-col w-full">
                    <FeaturedTournamentHero event={featuredTournaments[0]} />
                    {featuredData
                        .filter(section => section.id !== 'featured-live')
                        .map((section, index) => (
                            <FeaturedSectionBlock
                                key={section.id}
                                data={section}
                                index={index}
                                liveTournaments={section.id === 'recent-results' ? liveTournaments : null}
                                featuredTournaments={section.id === 'upcoming-events' ? featuredTournaments : null}
                                liveFeaturedTournaments={null}
                                onWatchLive={openVideoModal}
                            />
                        ))}
                </div>
                <VideoModal
                    isOpen={videoModal.isOpen}
                    onClose={closeVideoModal}
                    videoUrl={videoModal.url}
                    title={videoModal.title}
                />
            </>
        );
    }

    return (
        <div className="flex flex-col w-full">
            <FeaturedTournamentHero event={featuredTournaments[0]} />
            {featuredData.map((section, index) => (
                <FeaturedSectionBlock
                    key={section.id}
                    data={section}
                    index={index}
                    liveTournaments={section.id === 'recent-results' ? liveTournaments : null}
                    featuredTournaments={section.id === 'upcoming-events' ? featuredTournaments : null}
                    liveFeaturedTournaments={section.id === 'featured-live' ? liveFeaturedTournaments : null}
                    onWatchLive={openVideoModal}
                />
            ))}
            <VideoModal
                isOpen={videoModal.isOpen}
                onClose={closeVideoModal}
                videoUrl={videoModal.url}
                title={videoModal.title}
            />
        </div>
    );
};

export default FeaturedSections;
