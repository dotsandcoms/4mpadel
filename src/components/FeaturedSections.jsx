import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useRankedin } from '../hooks/useRankedin';
import { supabase } from '../supabaseClient';
import { Calendar, ChevronRight, Play, PlayCircle, Trophy, GitBranch, Users, X, MapPin, Shield } from 'lucide-react';
import VideoModal, { getYoutubeEmbedUrl } from './VideoModal';

const getStatusColors = (status) => {
    const s = status?.toLowerCase() || '';
    if (s.includes('major')) return {
        text: 'text-red-500',
        bg: 'bg-red-500/20',
        border: 'border-red-500/30',
        hover: 'hover:border-red-500',
        glow: 'shadow-red-500/20',
        solid: 'bg-red-600',
        solidText: 'text-white'
    };
    if (s.includes('super gold') || s === 's gold') return {
        text: 'text-amber-500',
        bg: 'bg-amber-500/20',
        border: 'border-amber-500/30',
        hover: 'hover:border-amber-500',
        glow: 'shadow-amber-500/20',
        solid: 'bg-amber-500',
        solidText: 'text-black'
    };
    if (s.includes('gold')) return {
        text: 'text-yellow-400',
        bg: 'bg-yellow-400/20',
        border: 'border-yellow-400/30',
        hover: 'hover:border-yellow-400',
        glow: 'shadow-yellow-400/20',
        solid: 'bg-yellow-400',
        solidText: 'text-black'
    };
    if (s.includes('silver')) return {
        text: 'text-gray-400',
        bg: 'bg-gray-400/20',
        border: 'border-gray-400/30',
        hover: 'hover:border-gray-400',
        glow: 'shadow-gray-400/20',
        solid: 'bg-gray-400',
        solidText: 'text-black'
    };
    if (s.includes('bronze')) return {
        text: 'text-orange-700',
        bg: 'bg-orange-700/20',
        border: 'border-orange-700/30',
        hover: 'hover:border-orange-700',
        glow: 'shadow-orange-700/20',
        solid: 'bg-orange-700',
        solidText: 'text-white'
    };
    if (s.includes('fip')) return {
        text: 'text-blue-500',
        bg: 'bg-blue-500/20',
        border: 'border-blue-500/30',
        hover: 'hover:border-blue-500',
        glow: 'shadow-blue-500/20',
        solid: 'bg-blue-500',
        solidText: 'text-white'
    };
    return {
        text: 'text-padel-green',
        bg: 'bg-padel-green/20',
        border: 'border-padel-green/30',
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
        icon: PlayCircle
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
            className={`relative flex flex-col w-full h-[210px] md:h-[260px] rounded-[24px] overflow-hidden group cursor-pointer border-2 ${(status?.toLowerCase() === 'broll' || title.toUpperCase().includes('BROLL')) ? 'border-[#F40020]' : 'border-white/5'} ${colors.hover} transition-all duration-500 bg-[#060913]`}
            onClick={() => navigate(linkPath)}
        >
            {/* Content Section */}
            <div className="flex flex-col flex-grow p-4 md:p-5 relative z-10 bg-gradient-to-t from-[#05070A] to-[#080C17]">
                {/* Status Badges */}
                <div className="flex justify-between items-start mb-4">
                    <div className={`px-2.5 py-1 backdrop-blur-md rounded-full border ${colors.border} flex items-center gap-1.5 shadow-lg bg-black/40`}>
                        <div className={`w-2 h-2 rounded-full ${colors.solid} shadow-[0_0_8px_currentColor]`} />
                        <span className={`text-[9px] font-black ${colors.text} uppercase tracking-widest`}>{label || status}</span>
                    </div>

                    {isLive && (
                        <div className="flex items-center gap-1.5 bg-red-600/90 backdrop-blur-md border border-red-500/50 px-2.5 py-1 rounded-full shadow-lg shadow-red-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            <span className="text-[9px] font-black text-white uppercase tracking-widest">Live</span>
                        </div>
                    )}
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
                            className="flex items-center justify-center gap-3 w-full bg-red-600/90 hover:bg-red-500 py-3 rounded-xl transition-all duration-500 shadow-lg shadow-red-600/10 group/live"
                        >
                            <PlayCircle className="w-4 h-4 text-white" />
                            <span className="text-[10px] font-black text-white uppercase tracking-[0.2em] leading-none">
                                {youtubeUrl ? 'WATCH LIVE NOW' : 'WATCH LIVE SOON'}
                            </span>
                        </button>
                    )}

                    {/* View Details Button */}
                    <div className={`group/btn flex items-center justify-center gap-3 w-full bg-white/5 border ${colors.border} group-hover:${colors.solid} py-3 rounded-xl transition-all duration-500`}>
                        <span className={`text-[10px] font-black ${colors.text} uppercase tracking-[0.2em] group-hover:${colors.solidText} transition-all duration-500 leading-none`}>
                            {buttonLabel}
                        </span>
                        <ChevronRight className={`w-4 h-4 ${colors.text} group-hover:${colors.solidText} group-hover:translate-x-1 transition-all duration-500`} />
                    </div>

                    {/* Draws & Results Button */}
                    {drawPath && (hasDraw || hasResults) && (
                        <button
                            onClick={(e) => { e.stopPropagation(); navigate(drawPath); }}
                            className={`flex items-center justify-center gap-2.5 w-full py-2.5 rounded-xl bg-white/5 border border-white/10 hover:${colors.solid} transition-all duration-300 group/draw`}
                        >
                            <GitBranch className={`w-3.5 h-3.5 text-white/30 group-hover/draw:${colors.solidText} transition-colors`} />
                            <span className={`text-[9px] font-black text-white/40 group-hover/draw:${colors.solidText} transition-colors uppercase tracking-widest`}>
                                Draws & Results
                            </span>
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
    const Icon = data.icon;
    const statusColors = getStatusColors(data.cardLabel);

    const textContent = (
        <div className={`relative z-10 ${!isGridSection ? 'lg:pr-8' : ''}`}>
            <motion.div
                initial={{ opacity: 0, x: isLeft ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
            >
                <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border ${isFeatured ? 'border-black/20 text-black' : isLiveSection ? 'border-purple-500/20 text-purple-400 bg-purple-500/10' : 'border-white/10 text-padel-green'} text-[10px] font-bold uppercase tracking-widest mb-4`}>
                    <Icon className="w-3.5 h-3.5" />
                    <span>{data.highlight}</span>
                </div>

                <h2 className={`font-bold mb-4 font-display leading-[1.0] tracking-tighter ${isFeatured ? 'text-black' : 'text-white'} ${isGridSection ? 'text-3xl xl:text-[36px]' : 'text-4xl lg:text-[48px] xl:text-[56px]'}`}>
                    {data.title.split(' ')[0]} <br className={isGridSection ? 'hidden lg:block' : ''} />
                    <span className={isFeatured ? 'text-black/70' : 'text-transparent bg-clip-text bg-gradient-to-r from-gray-300 to-gray-600'}>
                        {data.title.split(' ').slice(1).join(' ')}
                    </span>
                </h2>
                <p className={`${isFeatured ? 'text-black/80 font-medium' : 'text-gray-400'} leading-relaxed mb-6 ${isGridSection ? 'text-xs md:text-sm' : 'text-sm md:text-base max-w-sm'}`}>
                    {data.description}
                </p>

                {isLiveSection && data.cardTitle && (
                    <div className="mb-6">
                        <span className="text-[10px] font-black text-padel-green uppercase tracking-[0.2em] block mb-1">EVENT</span>
                        <h4 className="text-white font-black text-lg md:text-xl uppercase tracking-tighter leading-none">{renderBrollTitle(data.cardTitle, data.tournament_tag || data.cardLabel)}</h4>
                    </div>
                )}

                {isLiveSection && (data.livePlayers || data.nextMatch) && (
                    <div className="mb-8 space-y-3 max-w-sm">
                        {data.livePlayers && (
                            <div className="group/live-card relative p-3 rounded-2xl bg-red-500/5 border border-red-500/10 backdrop-blur-sm transition-all duration-300 hover:bg-red-500/10 hover:border-red-500/20">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="flex h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                                            <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">LIVE NOW</span>
                                        </div>
                                        <p className="text-white font-bold text-sm tracking-tight">{data.livePlayers}</p>
                                    </div>

                                    {data.youtubeUrl && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onWatchLive(data.youtubeUrl, data.cardTitle);
                                            }}
                                            className="relative flex items-center justify-center w-10 h-10 rounded-full bg-red-600 text-white hover:bg-white hover:text-red-600 transition-all duration-300 shadow-lg shadow-red-600/20 group/play"
                                        >
                                            <div className="absolute inset-0 rounded-full bg-red-600 animate-ping opacity-20 group-hover/play:hidden" />
                                            <Play className="w-4 h-4 relative z-10 ml-0.5" fill="currentColor" stroke="currentColor" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        {data.nextMatch && (
                            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm opacity-60">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">UP NEXT</span>
                                </div>
                                <p className="text-white/80 font-bold text-sm tracking-tight">{data.nextMatch}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* EXPLORE ALL button removed as requested */}
            </motion.div>
        </div>
    );

    const imageContent = isGridSection ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 relative z-10 w-full mt-8 lg:mt-0">
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
            className={`relative w-full h-[220px] sm:aspect-video lg:aspect-square max-h-[300px] md:max-h-[360px] lg:max-h-[420px] max-w-[480px] mx-auto lg:mx-0 ${isLeft ? 'lg:ml-auto' : 'lg:mr-auto'} rounded-[24px] overflow-hidden group cursor-pointer border-2 ${(data.tournament_tag?.toLowerCase() === 'broll' || data.cardTitle?.toUpperCase().includes('BROLL')) ? 'border-[#F40020]' : 'border-white/10'} ${statusColors.hover} transition-all duration-700 bg-[#05070A] z-10 mt-8 lg:mt-0`}
            onClick={() => data.linkPath && navigate(data.linkPath)}
        >
            <div className="absolute inset-0 w-full h-full mix-blend-luminosity opacity-40 group-hover:opacity-60 transition-all duration-1000 flex items-center justify-center">
                <FallbackImage
                    src={data.image}
                    alt={data.cardTitle}
                    title={data.cardTitle}
                    className="w-full h-full object-contain transition-transform duration-1000 group-hover:scale-105"
                />
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-[#05070A] via-[#05070A]/80 to-transparent transition-opacity duration-500 pointer-events-none" />

            {data.id === 'live-events' && (
                <div className="absolute top-5 left-5 flex items-center gap-2 bg-red-500/90 backdrop-blur-md px-3 py-1.5 rounded-full z-20">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">Live</span>
                </div>
            )}

            <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 lg:p-8 z-20 flex flex-col justify-end pointer-events-none">
                <div className="flex items-center gap-2 mb-2">
                    {data.id === 'live-events' ? (
                        <PlayCircle className={`w-3.5 h-3.5 ${statusColors.text}`} />
                    ) : (
                        <Calendar className={`w-3.5 h-3.5 ${statusColors.text}`} />
                    )}
                    <p className={`text-[10px] font-bold ${statusColors.text} uppercase tracking-widest`}>{data.cardLabel}</p>
                </div>

                <h3 className={`text-lg md:text-xl lg:text-2xl font-bold text-white leading-[1.1] mb-2 group-hover:${statusColors.text} transition-colors duration-500 tracking-tight`}>{renderBrollTitle(data.cardTitle, data.tournament_tag || data.cardLabel)}</h3>

                {(data.registeredPlayers > 0 || data.date || data.venue || data.organizerName) && (
                    <div className="flex flex-wrap items-center gap-2 mb-6 pointer-events-auto">
                        {data.date && (
                            <div className="flex items-center gap-1.5 py-1 px-3 bg-[#CCFF00]/10 rounded-full border border-[#CCFF00]/20 w-fit">
                                <Calendar className="w-3.5 h-3.5 text-[#CCFF00]" />
                                <span className="text-[10px] font-bold text-[#CCFF00] uppercase tracking-widest">{data.date}</span>
                            </div>
                        )}
                        {data.city && (
                            <div className="flex items-center gap-1.5 py-1 px-3 bg-white/5 rounded-full border border-white/10 w-fit">
                                <MapPin className={`w-3.5 h-3.5 ${statusColors.text}`} />
                                <span className="text-[10px] font-bold text-white uppercase tracking-widest">{data.city}</span>
                            </div>
                        )}
                        {data.venue && (
                            <div className="flex items-center gap-1.5 py-1 px-3 bg-white/5 rounded-full border border-white/10 w-fit">
                                <MapPin className={`w-3.5 h-3.5 ${statusColors.text}`} />
                                <span className="text-[10px] font-bold text-white uppercase tracking-widest">{data.venue}</span>
                            </div>
                        )}
                        {data.organizerName && (
                            <div className="flex items-center gap-1.5 py-1 px-3 bg-white/5 rounded-full border border-white/10 w-fit">
                                <Shield className={`w-3.5 h-3.5 ${statusColors.text}`} />
                                <span className="text-[10px] font-bold text-white uppercase tracking-widest">{data.organizerName}</span>
                            </div>
                        )}
                        {data.registeredPlayers > 0 && (
                            <div className="flex items-center gap-1.5 py-1 px-3 bg-white/5 rounded-full border border-white/10 w-fit">
                                <Users className={`w-3.5 h-3.5 ${statusColors.text}`} />
                                <span className="text-[10px] font-bold text-white uppercase tracking-widest">{data.registeredPlayers} Players</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-center gap-3 pointer-events-auto flex-wrap">


                    {(() => {
                        const rId = data.rankedinId || extractRankedinId(data.rankedin_url) || extractRankedinId(data.linkPath);

                        // If we have a slug in linkPath, use it for draws too
                        const slugMatch = data.linkPath?.match(/\/calendar\/([^\/]+)/);
                        const slug = slugMatch ? slugMatch[1] : null;

                        return (
                            <div className="flex items-center gap-3">
                                {data.id === 'featured-live' && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (data.youtubeUrl) {
                                                if (onWatchLive) onWatchLive(data.youtubeUrl, data.cardTitle);
                                                else window.open(data.youtubeUrl, '_blank');
                                            } else {
                                                navigate(data.linkPath || `/calendar/${slug || rId}`);
                                            }
                                        }}
                                        className="flex items-center gap-2 bg-red-600 border border-red-600 hover:bg-white hover:border-white px-4 py-2 rounded-full transition-all duration-300 group/live shadow-lg shadow-red-600/20"
                                    >
                                        <PlayCircle className="w-3.5 h-3.5 !text-white group-hover/live:!text-red-600 transition-colors" />
                                        <span className="text-xs font-black !text-white group-hover/live:!text-red-600 transition-colors uppercase tracking-widest">{data.youtubeUrl ? 'WATCH LIVE NOW' : 'WATCH LIVE SOON'}</span>
                                    </button>
                                )}

                                {(hasDraw || hasResults) && rId && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); navigate(`/draws/${slug || rId}`); }}
                                        className={`flex items-center gap-2 ${statusColors.solid} border ${statusColors.border} hover:bg-white hover:border-white px-4 py-2 rounded-full transition-all duration-300 group/draw shadow-lg ${statusColors.glow}`}
                                    >
                                        <GitBranch className={`w-3.5 h-3.5 ${statusColors.solidText} group-hover/draw:!text-black transition-colors`} />
                                        <span className={`text-xs font-black ${statusColors.solidText} group-hover/draw:!text-black transition-colors uppercase tracking-widest`}>DRAWS & RESULTS</span>
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
        <section className={`relative py-12 lg:py-16 border-t border-white/5 overflow-hidden ${bgColor}`} id={data.id}>
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
