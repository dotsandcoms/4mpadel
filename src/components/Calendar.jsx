import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, MapPin, Clock, Users, ArrowRight, GitBranch, User, ChevronLeft, ChevronRight, PlayCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useRankedin } from '../hooks/useRankedin';
import tournamentBg from '../assets/tournament_bg.png';
import { getEventImage } from '../utils/imageUtils';

const extractRankedinId = (url) => {
    if (!url) return null;
    const match = url.match(/\/(?:tournament|clubleague|draws|results)\/(\d+)/) || url.match(/\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
};

const CalendarEventItem = ({ event, index }) => {
    const { getTournamentClasses } = useRankedin();
    const [hasDraw, setHasDraw] = useState(false);
    const [hasResults, setHasResults] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const checkStatus = async () => {
            const rId = event.rankedin_id || extractRankedinId(event.rankedin_url);
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
    let bgGradient = 'bg-white/5';

    if (event.sapa_status === 'Major') { tierColor = 'border-white/10 hover:border-red-500/50'; badgeColor = 'bg-red-500/20 text-red-400 border border-red-500/30'; bgGradient = 'bg-gradient-to-r from-red-500/20 to-transparent'; }
    else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') { tierColor = 'border-white/10 hover:border-amber-500/50'; badgeColor = 'bg-amber-500/20 text-amber-400 border border-amber-500/30'; bgGradient = 'bg-gradient-to-r from-amber-600/20 to-transparent'; }
    else if (event.sapa_status === 'Gold') { tierColor = 'border-white/10 hover:border-yellow-500/50'; badgeColor = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'; bgGradient = 'bg-gradient-to-r from-yellow-500/20 to-transparent'; }
    else if (event.sapa_status === 'Silver') { tierColor = 'border-white/10 hover:border-gray-400/50'; badgeColor = 'bg-gray-500/20 text-gray-300 border border-gray-400/30'; bgGradient = 'bg-gradient-to-r from-gray-400/20 to-transparent'; }
    else if (event.sapa_status === 'Bronze') { tierColor = 'border-white/10 hover:border-orange-700/50'; badgeColor = 'bg-orange-700/20 text-orange-400 border border-orange-700/30'; bgGradient = 'bg-gradient-to-r from-orange-700/20 to-transparent'; }
    else if (event.sapa_status === 'FIP event') { tierColor = 'border-white/10 hover:border-blue-500/50'; badgeColor = 'bg-blue-500/20 text-blue-400 border border-blue-500/30'; bgGradient = 'bg-gradient-to-r from-blue-500/20 to-transparent'; }

    const formatDate = (startDate, endDate) => {
        if (!startDate) return null;
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : null;
        const dayFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric' });
        const monthFormatter = new Intl.DateTimeFormat('en-GB', { month: 'long' });
        const startDay = dayFormatter.format(start);
        const startMonth = monthFormatter.format(start);
        if (!end || startDate === endDate) return `${startDay} ${startMonth}`;
        const endDay = dayFormatter.format(end);
        const endMonth = monthFormatter.format(end);
        if (startMonth === endMonth) return `${startDay} - ${endDay} ${startMonth}`;
        return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
    };

    const detailsPath = event.slug ? `/calendar/${event.slug}` : (event.rankedin_url || `/calendar/${event.id}`);
    const drawPath = `/draws/${event.slug || event.rankedin_id || extractRankedinId(event.rankedin_url)}`;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            className="w-full min-w-0 max-w-full"
        >
            <Link
                to={detailsPath}
                target={event.slug ? "_self" : (event.rankedin_url ? "_blank" : "_self")}
                className={`group block backdrop-blur-sm border ${tierColor} rounded-2xl p-4 hover:bg-white/10 transition-all duration-300 shadow-xl overflow-hidden relative cursor-pointer`}
            >
                <div className={`absolute inset-0 ${bgGradient} opacity-50 group-hover:opacity-80 transition-opacity`}></div>

                <div className="flex flex-row items-center gap-4 relative z-10 w-full min-w-0">
                    {/* Square Icon/Image on left */}
                    <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-black/40 border border-white/5 relative shadow-xl">
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

                    {/* Right Info block */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 py-1">
                        {/* Status Row */}
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${badgeColor}`}>
                                {event.sapa_status}
                            </span>
                            {event.is_league && (
                                <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest">
                                    League
                                </span>
                            )}
                        </div>
                        
                        {/* Date */}
                        <div className="flex items-center gap-1 text-padel-green font-bold text-[10px] sm:text-xs">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            <span>
                                {event.event_dates ||
                                    (event.startDate && `${new Date(event.startDate).toLocaleDateString()} - ${new Date(event.endDate || event.startDate).toLocaleDateString()}`) ||
                                    (event.start_date && `${new Date(event.start_date).toLocaleDateString()}${event.end_date && event.end_date !== event.start_date ? ` - ${new Date(event.end_date).toLocaleDateString()}` : ''}`)}
                            </span>
                        </div>

                        {/* Title */}
                        <h3 className="text-base sm:text-xl font-black text-white group-hover:text-padel-green transition-colors leading-tight uppercase tracking-tight line-clamp-2">
                            {event.event_name || event.eventName}
                        </h3>

                        {/* Bottom Metadata Row */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-400 text-[10px] sm:text-xs font-medium mt-0.5">
                            {event.city && (
                                <span className="flex items-center gap-1 shrink-0">
                                    <MapPin className="w-3.5 h-3.5 text-padel-green/60" />
                                    {event.city}
                                </span>
                            )}
                            <span className="flex items-center gap-1 min-w-0">
                                <MapPin className="w-3.5 h-3.5 text-padel-green/60 shrink-0" />
                                <span className="truncate max-w-[120px] sm:max-w-[200px]" title={event.venue || event.clubName}>
                                    {(event.venue || event.clubName || 'Location TBC').split(' ').slice(0, 3).join(' ') + ((event.venue || event.clubName || 'Location TBC').split(' ').length > 3 ? '...' : '')}
                                </span>
                            </span>
                            {event.registered_players > 0 && (
                                <span className="flex items-center gap-1 shrink-0 bg-padel-green/5 border border-padel-green/10 px-1.5 py-0.5 rounded-md">
                                    <Users className="w-3 h-3 text-padel-green" />
                                    <span className="text-white font-bold text-[9px] leading-none">{event.registered_players}</span>
                                </span>
                            )}
                            
                            {/* Tags */}
                            {(event.live_youtube_url && event.featured_live) && (
                                <div className="flex items-center gap-0.5 bg-red-600 text-white px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest shrink-0 animate-pulse">
                                    <PlayCircle className="w-2.5 h-2.5 shrink-0" />
                                    <span>Live</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Link>
        </motion.div>
    );
};

const Calendar = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        const { data, error } = await supabase
            .from('calendar')
            .select('*')
            .eq('featured_event', true)
            .order('start_date', { ascending: true })
            .limit(10);

        if (error) {
            console.error('Error fetching events:', error?.message || error);
        } else {
            setEvents(data || []);
        }
        setLoading(false);
    };

    if (loading) return null;

    return (
        <section className="py-24 bg-black relative">
            <div className="absolute inset-0 opacity-20">
                <img src={tournamentBg} alt="" className="w-full h-full object-cover" />
            </div>

            <div className="container mx-auto px-6 md:px-20 relative z-10">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12">
                    <div>
                        <span className="text-padel-green font-bold tracking-widest uppercase text-sm">Upcoming Events</span>
                        <h2 className="text-4xl md:text-5xl font-bold text-white mt-4">Calendar</h2>
                    </div>
                    <Link to="/calendar" className="hidden md:block px-6 py-3 border border-white/20 rounded-full text-white hover:bg-white/10 transition-colors">
                        View Full Calendar
                    </Link>
                </div>

                <div className="grid gap-6">
                    {events.map((event, index) => (
                        <CalendarEventItem key={event.id} event={event} index={index} />
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Calendar;

