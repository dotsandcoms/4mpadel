import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useRankedin } from '../hooks/useRankedin';
import { supabase } from '../supabaseClient';
import { Calendar, ChevronRight, Play, PlayCircle, Trophy, GitBranch, Users, X, MapPin, Shield } from 'lucide-react';
import VideoModal, { getYoutubeEmbedUrl } from './VideoModal';

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
        id: 'featured-tournaments',
        title: 'Featured Tournaments',
        highlight: 'Upcoming',
        description: 'Get ready for the biggest clashes of the season. Top players gather to battle it out for the ultimate prize. Do not miss the action and secure your spot today!',
        cardLabel: 'Major Event',
        cardTitle: 'Loading Featured Event...',
        image: 'https://images.unsplash.com/photo-1622384950482-1a4cbab9bd36?q=80&w=1471&auto=format&fit=crop',
        align: 'left',
        linkPath: '/calendar',
        icon: Calendar
    },
    {
        id: 'recent-results',
        title: 'Recent Featured Tournaments',
        highlight: 'Results',
        description: 'Relive the highlights and unbelievable moments from last weekend\'s finals. Upsets, brilliant plays, and unmatched sportsmanship on display.',
        cardLabel: 'Tournament Champions',
        cardTitle: 'Johannesburg Open 2026',
        image: 'https://images.unsplash.com/photo-1554068865-c7211fa4d4ab?q=80&w=1470&auto=format&fit=crop',
        align: 'right',
        linkPath: '/results',
        icon: Trophy
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

    const colors = getStatusColors(status);

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: index * 0.15 }}
            className={`relative flex flex-col w-full min-h-[225px] md:h-[260px] h-auto rounded-[24px] overflow-hidden group cursor-pointer border-2 ${colors.border} ${colors.hover} transition-all duration-500 bg-[#060913] shadow-2xl`}
            onClick={() => navigate(linkPath)}
        >
            {/* Corner Ribbon */}
            <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none z-20 overflow-hidden rounded-tr-[24px]">
                <div className={`absolute top-[22px] right-[-45px] w-[160px] py-1.5 ${colors.solid} rotate-45 flex items-center justify-center shadow-lg border-b border-white/20 transition-transform duration-500 group-hover:scale-105`}>
                    <span className={`text-[8px] font-black ${colors.solidText} uppercase tracking-wider`}>
                        {label || status}
                    </span>
                </div>
            </div>

            {/* Content Section */}
            <div className="flex flex-col h-full p-4 md:p-5 relative z-10 bg-gradient-to-t from-[#05070A] to-[#080C17]">
                {/* Top Section Actions */}
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                        {isLive && (
                            <div className="flex items-center gap-1.5 bg-red-600/90 backdrop-blur-md border border-red-500/50 px-2.5 py-1 rounded-full shadow-lg shadow-red-600/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                <span className="text-[9px] font-black text-white uppercase tracking-widest">Live</span>
                            </div>
                        )}
                    </div>
                </div>
                <h3 className={`text-base md:text-xl font-bold text-white line-clamp-2 md:line-clamp-2 mb-3 group-hover:${colors.text} transition-colors duration-300 tracking-tight leading-tight`}>
                    {renderBrollTitle(title, status)}
                </h3>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-y-2 gap-x-3 mb-auto">
                    {date && (
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            <Calendar className="w-3.5 h-3.5 text-padel-green shrink-0" />
                            <span className="text-[10px] sm:text-xs text-padel-green font-bold truncate">{date}</span>
                        </div>
                    )}
                    {city && (
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="text-[10px] sm:text-xs text-gray-300 font-medium truncate" title={city}>{city}</span>
                        </div>
                    )}
                    {venue && (
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="text-[10px] sm:text-xs text-gray-300 font-medium truncate" title={venue}>{venue}</span>
                        </div>
                    )}
                    {organizerName && (
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            <Shield className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="text-[10px] sm:text-xs text-gray-300 font-medium truncate" title={organizerName}>{organizerName}</span>
                        </div>
                    )}
                    {registeredPlayers > 0 && (
                        <div className="flex items-center gap-1.5 overflow-hidden">
                            <Users className={`w-3.5 h-3.5 ${colors.text} shrink-0`} />
                            <span className="text-[10px] sm:text-xs text-white font-bold truncate">{registeredPlayers} <span className="opacity-60 font-medium">Players</span></span>
                        </div>
                    )}
                </div>

                {isLive && (livePlayers || nextMatch) && (
                    <div className="mb-2 space-y-1.5 mt-3 bg-white/5 rounded-xl p-2 border border-white/10">
                        {livePlayers && (
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className="text-[8px] font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-1.5 rounded shrink-0">NOW</span>
                                <span className="text-[10px] sm:text-xs font-bold text-white truncate">{livePlayers}</span>
                            </div>
                        )}
                        {nextMatch && (
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest bg-white/10 px-1.5 rounded shrink-0">NEXT</span>
                                <span className="text-[10px] sm:text-xs font-medium text-gray-300 truncate">{nextMatch}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Actions bottom row */}
                <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-white/5">
                    {/* Watch Live Button (Primary if Live) */}
                    {isLive && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (youtubeUrl) {
                                    if (onWatchLive) onWatchLive(youtubeUrl, title);
                                    else window.open(youtubeUrl, '_blank');
                                } else {
                                    navigate(linkPath);
                                }
                            }}
                            className="group/btn relative flex items-center justify-center w-full bg-red-600/90 hover:bg-red-500 py-3 rounded-xl transition-all duration-500 shadow-lg shadow-red-600/10 group/live"
                        >
                            <PlayCircle className="absolute left-4 w-4 h-4 text-white" />
                            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em] leading-none">
                                {youtubeUrl ? 'WATCH LIVE NOW' : 'WATCH LIVE SOON'}
                            </span>
                            <ChevronRight className="absolute right-4 w-4 h-4 text-white group-hover/live:translate-x-1 transition-all duration-500" />
                        </button>
                    )}

                    {/* View Details Button */}
                    <div className={`group/btn relative flex items-center justify-center w-full bg-white/5 border ${colors.border} group-hover:${colors.solid} py-3 rounded-xl transition-all duration-500`}>
                        <span className={`text-[10px] font-black ${colors.text} uppercase tracking-[0.2em] group-hover:${colors.solidText} transition-all duration-500 leading-none`}>
                            {buttonLabel}
                        </span>
                        <ChevronRight className={`absolute right-4 w-4 h-4 ${colors.text} group-hover:${colors.solidText} group-hover:translate-x-1 transition-all duration-500`} />
                    </div>

                    {/* Draws & Results Button */}
                    {drawPath && (hasDraw || hasResults) && (
                        <button
                            onClick={(e) => { e.stopPropagation(); navigate(drawPath); }}
                            className={`group/btn relative flex items-center justify-center w-full py-2.5 rounded-xl bg-white/5 border border-white/10 hover:${colors.solid} transition-all duration-300 group/draw`}
                        >
                            <GitBranch className={`absolute left-4 w-3.5 h-3.5 text-white/30 group-hover/draw:${colors.solidText} transition-colors`} />
                            <span className={`text-[9px] font-black text-white/40 group-hover/draw:${colors.solidText} transition-colors uppercase tracking-widest`}>
                                Draws & Results
                            </span>
                            <ChevronRight className={`absolute right-4 w-4 h-4 text-white/20 group-hover/draw:${colors.solidText} group-hover:translate-x-1 transition-all duration-500`} />
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

const FeaturedSectionBlock = ({ data, index, liveTournaments, featuredTournaments, liveFeaturedTournaments, onWatchLive }) => {
    const navigate = useNavigate();
    const { getTournamentClasses } = useRankedin();
    const [hasDraw, setHasDraw] = useState(false);
    const [hasResults, setHasResults] = useState(false);

    useEffect(() => {
        const checkStatus = async () => {
            // Only check for single blocks (where data.linkPath or data.rankedin_url exists)
            if (data.id !== 'recent-results' && !(data.id === 'featured-tournaments' && featuredTournaments?.length > 1) && !(data.id === 'featured-live' && liveFeaturedTournaments?.length > 1)) {
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
    const isLeft = data.align === 'left';
    const isGridSection = data.id === 'recent-results' || (data.id === 'featured-tournaments' && featuredTournaments?.length > 1) || (data.id === 'featured-live' && liveFeaturedTournaments?.length > 1);

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
    const textContent = (
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

                <h2 className={`font-bold mb-6 font-display leading-[1.0] tracking-tighter ${isFeatured ? 'text-black' : 'text-white'} ${isGridSection ? 'text-3xl xl:text-[42px]' : 'text-5xl lg:text-[64px] xl:text-[72px]'}`}>
                    {data.title.split(' ')[0]} <br className={isGridSection ? 'hidden lg:block' : ''} />
                    <span className={isFeatured ? 'text-black/70' : 'text-transparent bg-clip-text bg-gradient-to-r from-gray-200 via-gray-400 to-gray-600'}>
                        {data.title.split(' ').slice(1).join(' ')}
                    </span>
                </h2>
                
                <p className={`${isFeatured ? 'text-black/80 font-medium' : 'text-gray-400'} leading-relaxed mb-6 ${isGridSection ? 'text-sm' : 'text-base md:text-lg max-w-md'}`}>
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

    // Image/Card content for the right/bottom side of the hero section
    const imageContent = isGridSection ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 relative z-10 w-full mt-4 lg:mt-0">
            {data.id === 'recent-results' ? (
                liveTournaments && liveTournaments.length > 0 ? (
                    liveTournaments.map((t, i) => (
                        <TournamentCard
                            key={t.eventId}
                            index={i}
                            title={t.eventName}
                            label={t.sapaStatus || 'Tournament'}
                            date={t.date}
                            image={t.image || `https://rankedin-prod-cdn-adavg8d3dwfegkbd.z01.azurefd.net/images/upload/tournament/${t.eventId}.png`}
                            linkPath={t.customLink || `/draws/${t.eventId}`}
                            buttonLabel="VIEW RESULTS"
                            status={t.sapaStatus || 'Gold'}
                            registeredPlayers={t.registeredPlayers}
                            rankedinId={t.eventId}
                            venue={t.venue}
                            organizerName={t.organizerName}
                            city={t.city}
                        />
                    ))
                ) : (
                    <div className="col-span-1 md:col-span-3 text-center py-20 border border-white/5 rounded-[24px] bg-white/[0.02]">
                        <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10">
                            <span className="text-padel-green animate-ping absolute inline-flex h-3 w-3 rounded-full opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-padel-green"></span>
                        </div>
                        <p className="text-gray-400 text-sm font-medium">Loading tournament data...</p>
                    </div>
                )
            ) : data.id === 'featured-live' ? (
                liveFeaturedTournaments && liveFeaturedTournaments.length > 0 ? (
                    liveFeaturedTournaments.map((t, i) => (
                        <TournamentCard
                            key={t.id}
                            index={i}
                            title={t.event_name}
                            label={t.sapa_status || 'Live Event'}
                            date={formatTournamentDate(t.start_date, t.end_date)}
                            image={t.image_url || 'https://images.unsplash.com/photo-1622384950482-1a4cbab9bd36?q=80&w=1471&auto=format&fit=crop'}
                            linkPath={`/calendar/${t.slug || t.id}`}
                            drawPath={(t.rankedin_id || extractRankedinId(t.rankedin_url)) ? `/draws/${t.slug || t.rankedin_id || extractRankedinId(t.rankedin_url)}` : null}
                            youtubeUrl={t.live_youtube_url}
                            livePlayers={t.live_players}
                            nextMatch={t.next_match}
                            onWatchLive={onWatchLive}
                            isLive={true}
                            status={t.sapa_status || 'Gold'}
                            registeredPlayers={t.registered_players}
                            rankedinId={t.rankedin_id || extractRankedinId(t.rankedin_url)}
                            venue={t.venue || t.clubName}
                            organizerName={t.organizer_name}
                            city={t.city}
                        />
                    ))
                ) : (
                    <div className="col-span-1 md:col-span-3 text-center py-20 border border-white/5 rounded-[24px] bg-white/[0.02]">
                        <p className="text-gray-400 text-sm font-medium">Loading live events...</p>
                    </div>
                )
            ) : (
                featuredTournaments && featuredTournaments.length > 0 ? (
                    featuredTournaments.map((t, i) => (
                        <TournamentCard
                            key={t.id}
                            index={i}
                            title={t.event_name}
                            label={t.sapa_status || 'Major Event'}
                            date={formatTournamentDate(t.start_date, t.end_date)}
                            image={t.image_url || 'https://images.unsplash.com/photo-1622384950482-1a4cbab9bd36?q=80&w=1471&auto=format&fit=crop'}
                            linkPath={`/calendar/${t.slug || t.id}`}
                            drawPath={(t.rankedin_id || extractRankedinId(t.rankedin_url)) ? `/draws/${t.slug || t.rankedin_id || extractRankedinId(t.rankedin_url)}` : null}
                            status={t.sapa_status || 'Gold'}
                            registeredPlayers={t.registered_players}
                            rankedinId={t.rankedin_id || extractRankedinId(t.rankedin_url)}
                            venue={t.venue || t.clubName}
                            organizerName={t.organizer_name}
                            city={t.city}
                        />
                    ))
                ) : (
                    <div className="col-span-1 md:col-span-3 text-center py-20 border border-white/5 rounded-[24px] bg-white/[0.02]">
                        <p className="text-gray-400 text-sm font-medium">Loading featured tournaments...</p>
                    </div>
                )
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

            {/* Background Gradient & Overlays */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0A0F1F] via-[#05070A] to-[#05070A]" />
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
        <section className={`relative py-16 lg:py-24 border-t border-white/5 overflow-hidden ${bgColor}`} id={data.id}>
            <div className={`w-full ${isGridSection ? 'max-w-[1500px]' : 'max-w-[1200px]'} mx-auto px-6 md:px-8 relative z-10 ${isGridSection ? 'grid lg:grid-cols-4 gap-6 xl:gap-12 items-center' : 'grid lg:grid-cols-2 gap-8 lg:gap-16 items-center'}`}>
                {isGridSection ? (
                    <>
                        {/* Text takes 1 column on the left */}
                        <div className="lg:col-span-1">
                            {textContent}
                        </div>
                        {/* Cards take 3 columns on the right */}
                        <div className="lg:col-span-3 w-full">
                            {imageContent}
                        </div>
                    </>
                ) : isLeft ? (
                    <>
                        <div className="lg:col-span-1 border border-transparent">
                            {textContent}
                        </div>
                        <div className="lg:col-span-1 border border-transparent">
                            {imageContent}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="order-2 lg:order-1 lg:col-span-1 border border-transparent">
                            {imageContent}
                        </div>
                        <div className="order-1 lg:order-2 lg:col-span-1 border border-transparent">
                            {textContent}
                        </div>
                    </>
                )}
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
                    .limit(3);

                if (featuredResults && featuredResults.length > 0 && !error) {
                    // Map calendar events to the format expected by TournamentCard for results
                    const mappedResults = featuredResults.map(t => ({
                        eventId: t.id,
                        eventName: t.event_name,
                        city: t.city,
                        date: formatTournamentDate(t.start_date, t.end_date),
                        image: t.custom_image_url || t.image_url || `https://rankedin-prod-cdn-adavg8d3dwfegkbd.z01.azurefd.net/images/upload/tournament/${t.rankedin_id || extractRankedinId(t.rankedin_url) || 'default'}.png`,
                        customLink: `/draws/${t.slug || t.id}`,
                        sapaStatus: t.sapa_status,
                        registeredPlayers: t.registered_players,
                        venue: t.venue || t.clubName,
                        organizerName: t.organizer_name
                    }));
                    setLiveTournaments(mappedResults);
                } else {
                    // Fallback to RankedIn API for recent results
                    const data = await getRecentTournaments(3);
                    setLiveTournaments(data);
                }
            } catch (err) {
                console.error("Error fetching tournament results:", err);
                const data = await getRecentTournaments(3);
                setLiveTournaments(data);
            }
        };
        fetchTours();

        const fetchFeaturedEvents = async () => {
            try {
                const { data, error } = await supabase
                    .from('calendar')
                    .select('*, registered_players, start_date, end_date')
                    .eq('featured_event', true)
                    .neq('is_visible', false)
                    .order('start_date', { ascending: true })
                    .limit(3);

                if (data && !error) {
                    setFeaturedTournaments(data);

                    // If we only have one featured event, we still update the template for the single block fallback
                    if (data.length === 1) {
                        const singleEvent = data[0];
                        setFeaturedData(prevData => {
                            const newData = [...prevData];
                            const featuredIndex = newData.findIndex(item => item.id === 'featured-tournaments');
                            if (featuredIndex !== -1) {
                                newData[featuredIndex] = {
                                    ...newData[featuredIndex],
                                    cardTitle: singleEvent.event_name,
                                    cardLabel: singleEvent.sapa_status || 'Major Event',
                                    date: formatTournamentDate(singleEvent.start_date, singleEvent.end_date),
                                    image: singleEvent.image_url || newData[featuredIndex].image,
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
                    .limit(3);

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
                                    image: singleEvent.custom_image_url || singleEvent.image_url || newData[liveIndex].image,
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
                    {featuredData
                        .filter(section => section.id !== 'featured-live')
                        .map((section, index) => (
                            <FeaturedSectionBlock
                                key={section.id}
                                data={section}
                                index={index}
                                liveTournaments={section.id === 'recent-results' ? liveTournaments : null}
                                featuredTournaments={section.id === 'featured-tournaments' ? featuredTournaments : null}
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
            {featuredData.map((section, index) => (
                <FeaturedSectionBlock
                    key={section.id}
                    data={section}
                    index={index}
                    liveTournaments={section.id === 'recent-results' ? liveTournaments : null}
                    featuredTournaments={section.id === 'featured-tournaments' ? featuredTournaments : null}
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
