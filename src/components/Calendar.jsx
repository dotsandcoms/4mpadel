import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { motion } from 'framer-motion';
import { Calendar as CalendarIcon, MapPin, Clock, Users, ArrowRight, GitBranch, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useRankedin } from '../hooks/useRankedin';
import tournamentBg from '../assets/tournament_bg.png';

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
            <div
                className={`group block backdrop-blur-md border ${tierColor} rounded-[2rem] p-6 hover:bg-white/10 transition-all duration-300 shadow-xl overflow-hidden relative w-full`}
            >
                {/* Background Gradient */}
                <div className={`absolute inset-0 ${bgGradient} opacity-50 group-hover:opacity-80 transition-opacity`}></div>

                <div className="flex flex-col md:flex-row gap-6 md:items-center justify-between relative z-10 w-full min-w-0">
                    <div className="flex flex-row gap-4 items-center flex-1 w-full min-w-0">
                        {/* Poster Image Box */}
                        <div className="flex-shrink-0 w-[110px] sm:w-[130px] md:w-32 aspect-[3/4] md:h-32 md:aspect-auto rounded-2xl overflow-hidden bg-black/40 border border-white/5 relative group flex items-center justify-center">
                            {(event.custom_image_url || event.image_url) ? (
                                <img
                                    src={event.custom_image_url || event.image_url}
                                    alt={event.event_name}
                                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center">
                                    <CalendarIcon className="w-6 h-6 text-padel-green mb-1 opacity-50" />
                                    <span className="text-[10px] text-gray-500 font-bold uppercase">No Poster</span>
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            {/* Top row pills */}
                            <div className="flex flex-wrap items-center gap-2 mb-4">
                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${badgeColor}`}>
                                    {event.sapa_status}
                                </span>
                                {event.city && (
                                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 text-gray-400 shadow-sm">
                                        {event.city}
                                    </span>
                                )}
                                {event.registered_players > 0 && (
                                    <div className="flex items-center gap-1.5 bg-padel-green/5 border border-padel-green/20 px-2.5 py-0.5 rounded-full">
                                        <Users className="w-2.5 h-2.5 text-padel-green" />
                                        <span className="text-white font-black text-[9px] leading-none uppercase tracking-wider">{event.registered_players} REGISTERED</span>
                                    </div>
                                )}
                                {event.is_league && (
                                    <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest">
                                        LEAGUE
                                    </span>
                                )}
                            </div>

                            {/* Title Row */}
                            <div className="mb-3 min-w-0">
                                <h3 className="text-lg md:text-2xl font-black text-white group-hover:text-padel-green transition-colors leading-none uppercase tracking-tighter break-words min-w-0 whitespace-normal">
                                    {event.event_name || event.eventName}
                                </h3>
                            </div>

                            {/* Bottom row info */}
                            <div className="flex flex-wrap items-center gap-y-3 gap-x-4 text-gray-400 text-sm font-medium">
                                {(event.start_date || event.startDate) && (
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-padel-green bg-padel-green/10 border border-padel-green/20 px-3 py-1 rounded-full whitespace-nowrap w-fit shadow-sm">
                                        <CalendarIcon size={12} />
                                        {formatDate(event.start_date || event.startDate, event.end_date || event.endDate)}
                                    </div>
                                )}
                                <div className="flex items-center gap-2 truncate min-w-0">
                                    <MapPin className="w-4 h-4 text-gray-500 shrink-0" />
                                    <span className="text-xs font-bold text-gray-400 truncate" title={event.venue || event.clubName}>
                                        {event.venue || event.clubName || 'Location to be confirmed'}
                                    </span>
                                </div>
                                {event.organizer_name && (
                                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full shrink-0 shadow-sm">
                                        <GitBranch className="w-3 h-3 text-gray-500" />
                                        <span className="text-white font-bold text-[11px] uppercase tracking-tight leading-none">{event.organizer_name}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto mt-4 md:mt-0 justify-start md:justify-end">
                        {(hasDraw || hasResults) && (
                             <Link
                                to={drawPath}
                                className="flex items-center gap-2 bg-padel-green/5 border border-padel-green/20 hover:bg-padel-green hover:border-padel-green !text-padel-green hover:!text-black px-4 py-2 rounded-xl transition-all duration-300 font-bold text-xs uppercase tracking-widest group/draw"
                            >
                                <GitBranch className="w-4 h-4 !text-padel-green group-hover/draw:!text-black transition-colors" />
                                <span className="!text-current">Draws & Results</span>
                            </Link>
                        )}
                        <Link
                            to={detailsPath}
                            target={event.slug ? "_self" : (event.rankedin_url ? "_blank" : "_self")}
                            className="bg-padel-green !text-black px-6 py-2 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-white hover:!text-black hover:scale-105 transition-all shadow-lg shadow-padel-green/20 flex items-center gap-2"
                        >
                            <span className="!text-black">Details</span>
                            <ArrowRight className="w-4 h-4 !text-black" />
                        </Link>
                    </div>
                </div>
            </div>
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
            .limit(3);

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

