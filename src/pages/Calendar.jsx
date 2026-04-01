import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { MapPin, Loader, AlertCircle, Calendar as CalendarIcon, ArrowRight, Search, Filter, ChevronLeft, ChevronRight, LayoutGrid, List, X, Users, Check, ChevronDown, Layers, User, PlayCircle, Video, Trophy, Shield } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { useRankedin } from '../hooks/useRankedin';
import sapaLogo from '../assets/sapa-logo.svg';
import { GitBranch } from 'lucide-react';

const extractRankedinId = (url) => {
    if (!url) return null;
    const match = url.match(/\/(?:tournament|clubleague|draws|results)\/(\d+)/) || url.match(/\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
};

const CalendarEventItem = ({ event, index }) => {
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
    let bgGradient = 'bg-white/5';

    if (event.sapa_status === 'Major') { tierColor = 'border-white/10 hover:border-red-500/50'; badgeColor = 'bg-red-500/20 text-red-400 border border-red-500/30'; bgGradient = 'bg-gradient-to-r from-red-500/20 to-transparent'; }
    else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') { tierColor = 'border-white/10 hover:border-amber-500/50'; badgeColor = 'bg-amber-500/20 text-amber-400 border border-amber-500/30'; bgGradient = 'bg-gradient-to-r from-amber-600/20 to-transparent'; }
    else if (event.sapa_status === 'Gold') { tierColor = 'border-white/10 hover:border-yellow-500/50'; badgeColor = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'; bgGradient = 'bg-gradient-to-r from-yellow-500/20 to-transparent'; }
    else if (event.sapa_status === 'Silver') { tierColor = 'border-white/10 hover:border-gray-400/50'; badgeColor = 'bg-gray-500/20 text-gray-300 border border-gray-400/30'; bgGradient = 'bg-gradient-to-r from-gray-400/20 to-transparent'; }
    else if (event.sapa_status === 'Bronze') { tierColor = 'border-white/10 hover:border-orange-700/50'; badgeColor = 'bg-orange-700/20 text-orange-400 border border-orange-700/30'; bgGradient = 'bg-gradient-to-r from-orange-700/20 to-transparent'; }
    else if (event.sapa_status === 'FIP event') { tierColor = 'border-white/10 hover:border-blue-500/50'; badgeColor = 'bg-blue-500/20 text-blue-400 border border-blue-500/30'; bgGradient = 'bg-gradient-to-r from-blue-500/20 to-transparent'; }

    const detailsPath = event.slug ? `/calendar/${event.slug}` : (event.eventId ? `https://rankedin.com/tournament/${event.eventId}` : `/calendar/${event.id}`);
    const drawPath = `/draws/${event.slug || event.rankedin_id || event.eventId || extractRankedinId(event.rankedin_url)}`;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ delay: index * 0.05 }}
        >
            <div className={`group block backdrop-blur-sm border ${tierColor} rounded-3xl p-5 sm:p-6 hover:bg-white/10 transition-all duration-300 shadow-xl overflow-hidden relative`}>
                <div className={`absolute inset-0 ${bgGradient} opacity-50 group-hover:opacity-80 transition-opacity`}></div>

                <div className="flex flex-col gap-6 relative z-10">
                    {/* Top Row: Poster & Basic Info */}
                    <div className="flex flex-row md:items-center gap-5 sm:gap-6 w-full min-w-0">
                        {/* Poster Image Box */}
                        <div className="flex-shrink-0 w-[100px] sm:w-[130px] md:w-32 aspect-[3/4] rounded-2xl overflow-hidden bg-black/40 border border-white/5 relative group shadow-2xl">
                            {event.custom_image_url || event.image_url || event.posterUrl ? (
                                <img
                                    src={event.custom_image_url || event.image_url || event.posterUrl}
                                    alt={event.event_name || event.eventName}
                                    className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center">
                                    <CalendarIcon className="w-6 h-6 text-padel-green mb-1 opacity-50" />
                                    <span className="text-[10px] text-gray-500 font-bold uppercase">No Poster</span>
                                </div>
                            )}
                        </div>

                        {/* Info Content */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                             <div className="flex flex-wrap items-center gap-1.5 mb-2 sm:mb-3">
                                 <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-widest ${badgeColor}`}>
                                     {event.sapa_status}
                                 </span>
                                 {event.is_league && (
                                     <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-widest">
                                         League
                                     </span>
                                 )}
                                 {event.city && (
                                     <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 text-gray-300">
                                         {event.city}
                                     </span>
                                 )}
                                 {event.registered_players > 0 && (
                                     <div className="flex items-center gap-1 bg-padel-green/5 border border-padel-green/10 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full">
                                         <Users className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-padel-green" />
                                         <span className="text-white font-bold text-[9px] sm:text-xs leading-none">{event.registered_players}</span>
                                     </div>
                                 )}
                             </div>

                            <h3 className="text-base sm:text-xl md:text-2xl font-black text-white group-hover:text-padel-green transition-colors leading-tight uppercase tracking-tight mb-2 sm:mb-3 line-clamp-2">
                                {event.event_name || event.eventName}
                            </h3>

                             {/* Info Metadata Row */}
                             <div className="flex flex-wrap items-center gap-y-1 gap-x-2.5 text-gray-400 text-[9px] sm:text-sm font-medium">
                                 <div className="flex items-center gap-1 text-padel-green font-bold shrink-0">
                                     <CalendarIcon className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
                                     <span>
                                         {event.event_dates ||
                                             (event.startDate && `${new Date(event.startDate).toLocaleDateString()} - ${new Date(event.endDate || event.startDate).toLocaleDateString()}`) ||
                                             (event.start_date && `${new Date(event.start_date).toLocaleDateString()}${event.end_date && event.end_date !== event.start_date ? ` - ${new Date(event.end_date).toLocaleDateString()}` : ''}`)}
                                     </span>
                                 </div>
                                 
                                 <div className="flex items-center gap-1 shrink-0 max-w-[120px] sm:max-w-none">
                                     <MapPin className="w-3 h-3 sm:w-4 sm:h-4 text-padel-green/50 shrink-0" />
                                     <span className="truncate" title={event.venue || event.clubName}>
                                         {event.venue || event.clubName || 'Location TBC'}
                                     </span>
                                 </div>

                                 {event.organizer_name && (
                                     <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded-full shrink-0">
                                         <Shield className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-gray-400" />
                                         <span className="text-white font-bold text-[8px] sm:text-[10px] uppercase whitespace-nowrap">{event.organizer_name}</span>
                                     </div>
                                 )}
                             </div>
                        </div>
                    </div>

                    {/* Bottom Row: Status Tag & Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-5 border-t border-white/5">
                         {/* Status/Organizer Info */}
                         <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 w-full sm:w-auto">
 
                             {event.live_youtube_url && event.featured_live && (
                                 <div className="flex items-center gap-1 bg-red-600 text-white px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse border border-red-500 shadow-lg shadow-red-500/20">
                                     <PlayCircle className="w-3 h-3 shrink-0" />
                                     <span>Live</span>
                                 </div>
                             )}
                             {(new Date(event.end_date || event.start_date) < new Date()) && (
                                 <div className="flex items-center gap-1 bg-slate-900 text-gray-400 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/10 shadow-lg">
                                     <Check className="w-3 h-3 shrink-0 text-padel-green" />
                                     <span>Complete</span>
                                 </div>
                             )}
                             {(event.rankedin_id || event.rankedin_url) && (new Date(event.end_date || event.start_date) < new Date()) && (
                                 <div className="flex items-center gap-1 bg-slate-900 text-padel-green px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-padel-green/50 shadow-lg">
                                     <Trophy className="w-3 h-3 shrink-0" />
                                     <span>Results Available</span>
                                 </div>
                             )}
                             {event.youtube_playlist_url && (
                                 <div className="flex items-center gap-1 bg-slate-900 text-white border border-red-500/30 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg">
                                     <Video className="w-3 h-3 text-red-600" />
                                     <span>Media Available</span>
                                 </div>
                             )}
                         </div>



                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center w-full sm:w-auto">
                            {(hasDraw || hasResults) && (
                                <Link
                                    to={drawPath}
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-padel-green hover:border-padel-green !text-padel-green hover:!text-black px-4 py-3 rounded-xl transition-all duration-300 font-bold text-[10px] lg:text-xs uppercase tracking-widest group/draw"
                                >
                                    <GitBranch className="w-3.5 h-3.5 !text-padel-green group-hover/draw:!text-black transition-colors shrink-0" />
                                    <span className="!text-current whitespace-nowrap uppercase">Draws & Results</span>
                                </Link>
                            )}
                            <Link
                                to={detailsPath}
                                target={event.slug ? "_self" : (event.eventId ? "_blank" : "_self")}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-padel-green !text-black px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] lg:text-xs hover:bg-white hover:!text-black hover:scale-105 transition-all shadow-lg shadow-padel-green/20"
                            >
                                <span className="!text-black uppercase whitespace-nowrap">View Details</span>
                                <ArrowRight className="w-4 h-4 !text-black shrink-0" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

const Calendar = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filter & Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilters, setStatusFilters] = useState([]);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);
    const [cityFilter, setCityFilter] = useState('All');
    const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming', 'past', 'all', 'my-calendar'
    const [leagueFilter, setLeagueFilter] = useState('Tournaments'); // 'All' | 'League' | 'Tournaments'

    const [isFilterExpanded, setIsFilterExpanded] = useState(false);

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

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsStatusDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
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
                .eq('email', targetEmail)
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
            setPersonalEvents(data || []);
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
            setEvents(data || []);
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
                    id: localEvent.id, // Use local ID if slug missing
                    image_url: localEvent.image_url,
                    custom_image_url: localEvent.custom_image_url,
                    posterUrl: localEvent.custom_image_url || localEvent.image_url || localEvent.posterUrl,
                    venue: localEvent.venue || localEvent.clubName,
                    sapa_status: localEvent.sapa_status || pe.sapa_status,
                    is_league: localEvent.is_league ?? pe.is_league
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

            const matchesSearch =
                eventName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                venueName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                city.toLowerCase().includes(searchTerm.toLowerCase()) ||
                status.toLowerCase().includes(searchTerm.toLowerCase()) ||
                organizer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                eventType.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilters.length === 0 || statusFilters.includes(status);

            const matchesCity = cityFilter === 'All' || city === cityFilter;


            let matchesTiming = true;
            if (viewMode === 'list' && !searchTerm) {
                const startDateStr = event.start_date || event.startDate;
                const endDateStr = event.end_date || event.endDate || startDateStr;

                if (activeTab === 'upcoming') {
                    const eventDate = new Date(endDateStr);
                    matchesTiming = !isNaN(eventDate.getTime()) && eventDate >= today;
                } else if (activeTab === 'past') {
                    const eventDate = new Date(endDateStr);
                    matchesTiming = !isNaN(eventDate.getTime()) && eventDate < today;
                }
            }


            const matchesLeague = leagueFilter === 'All' ||
                (leagueFilter === 'League' && event.is_league === true) ||
                (leagueFilter === 'Tournaments' && !event.is_league);

            return matchesSearch && matchesStatus && matchesCity && matchesTiming && matchesLeague;
        });
    }, [events, personalEvents, activeTab, searchTerm, statusFilters, cityFilter, leagueFilter, viewMode]);

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
        <div className="bg-[#0F172A] min-h-screen text-white font-sans selection:bg-padel-green selection:text-black">

            {/* Background elements matched from Rankings */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-padel-green/10 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[150px] rounded-full" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03]" />
            </div>

            <main className="relative z-10 pt-32 pb-20 container mx-auto px-6 max-w-7xl">

                {/* Hero Header */}
                <div className="text-center mb-16">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-padel-green text-sm font-bold uppercase tracking-widest mb-8"
                    >
                        <span className="w-2 h-2 rounded-full bg-padel-green animate-pulse" />
                        Official Schedule
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col md:flex-row items-center justify-center gap-4 mb-6"
                    >
                        <img src={sapaLogo} alt="SAPA Logo" className="h-16 md:h-20 object-contain drop-shadow-lg" />
                        <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter uppercase m-0 leading-none">
                            SAPA Tour <span className="text-padel-green">Calendar</span>
                        </h1>
                    </motion.div>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-gray-400 max-w-2xl mx-auto"
                    >
                        Explore the 2026/2027 season events. Find tournaments near you, plan your schedule, and compete for crucial ranking points.
                    </motion.p>
                </div>

                {/* Primary Tab Navigation */}
                <div className="flex justify-center mb-10 relative z-50">
                    <div className="flex overflow-x-auto hide-scrollbar space-x-1 sm:space-x-2 bg-white/5 backdrop-blur-md p-1.5 sm:p-2 rounded-[2rem] border border-white/10 shadow-xl shadow-black/20 mx-auto max-w-[95vw] md:max-w-fit flex-nowrap shrink-0 snap-x snap-mandatory">
                        {[
                            { id: 'upcoming', label: 'Upcoming' },
                            { id: 'past', label: 'Past Events' },
                            { id: 'all', label: 'All Events' },
                            ...(userProfile && userProfile.paid_registration && userProfile.approved ? [{ id: 'my-calendar', label: 'My Calendar' }] : [])
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative px-4 sm:px-8 py-2.5 sm:py-3.5 rounded-full font-black text-[10px] sm:text-[11px] md:text-xs tracking-[0.1em] sm:tracking-[0.15em] uppercase transition-all duration-300 whitespace-nowrap snap-center ${activeTab === tab.id ? 'text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="calendarPrimaryTab"
                                        className="absolute inset-0 bg-padel-green rounded-full shadow-lg shadow-padel-green/20"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <span className="relative z-10">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Filters & Controls */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[2rem] p-4 mb-10 relative z-40"
                >
                    <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                        {/* Search Bar - Always Visible */}
                        <div className="relative w-full lg:w-96 flex-shrink-0 flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                <input
                                    type="text"
                                    placeholder="Search events or venues..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-white focus:outline-none focus:border-padel-green transition-all placeholder-gray-500 text-base"
                                />
                            </div>

                            {/* Mobile Filter Toggle */}
                            <button
                                onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                                className="lg:hidden flex items-center justify-center px-4 bg-black/40 border border-white/10 rounded-2xl text-padel-green hover:bg-white/10 transition-colors group"
                            >
                                <Filter className={`w-5 h-5 transition-transform duration-300 ${isFilterExpanded ? 'scale-110' : ''}`} />
                                <span className="ml-2 text-xs font-bold uppercase tracking-widest md:hidden">Filters</span>
                            </button>
                        </div>

                        {/* DESKTOP FILTERS (Always Visible) */}
                        <div className="hidden lg:flex flex-row gap-4 items-center justify-end">
                            {/* Type Filter */}
                            <div className="relative min-w-[150px]">
                                <Layers className="absolute pointer-events-none left-3 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4" />
                                <select
                                    value={leagueFilter}
                                    onChange={(e) => setLeagueFilter(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-10 pr-8 text-white appearance-none focus:outline-none focus:border-padel-green cursor-pointer hover:bg-black/60 transition-colors text-base"
                                >
                                    <option value="All" className="bg-slate-900">All Types</option>
                                    <option value="League" className="bg-slate-900">League Only</option>
                                    <option value="Tournaments" className="bg-slate-900">Tournaments</option>
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>

                            {/* Status Filter */}
                            <div className="relative min-w-[160px]" ref={dropdownRef}>
                                <Filter className="absolute z-10 left-3 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4 pointer-events-none" />
                                <button
                                    onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-10 pr-10 text-white text-left appearance-none focus:outline-none focus:border-padel-green hover:bg-black/60 transition-colors text-base"
                                >
                                    <span className="truncate block">
                                        {statusFilters.length === 0
                                            ? 'All Statuses'
                                            : statusFilters.length === 1
                                                ? statusFilters[0]
                                                : `${statusFilters.length} Selected`}
                                    </span>
                                </button>
                                <ChevronDown className={`w-4 h-4 text-gray-400 absolute z-10 right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-200 ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />

                                <AnimatePresence>
                                    {isStatusDropdownOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute z-50 top-full left-0 mt-2 w-full bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                                        >
                                            <div className="max-h-60 overflow-y-auto nice-scrollbar py-2">
                                                <button
                                                    onClick={() => { setStatusFilters([]); setIsStatusDropdownOpen(false); }}
                                                    className={`w-full text-left px-4 py-2 text-xs hover:bg-white/5 transition-colors flex items-center justify-between ${statusFilters.length === 0 ? 'text-padel-green font-bold bg-white/5' : 'text-gray-300'}`}
                                                >
                                                    <span>All Statuses</span>
                                                    {statusFilters.length === 0 && <Check className="w-4 h-4" />}
                                                </button>
                                                {uniqueStatuses.filter(s => s !== 'All').map(status => (
                                                    <button
                                                        key={status}
                                                        onClick={() => setStatusFilters(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status])}
                                                        className={`w-full text-left px-4 py-2 text-xs hover:bg-white/5 transition-colors flex items-center justify-between ${statusFilters.includes(status) ? 'text-white font-bold bg-white/5' : 'text-gray-300'}`}
                                                    >
                                                        <span>{status}</span>
                                                        {statusFilters.includes(status) && <Check className="w-4 h-4 text-padel-green" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* City Filter */}
                            <div className="relative min-w-[140px]">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4" />
                                <select
                                    value={cityFilter}
                                    onChange={(e) => setCityFilter(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-10 pr-8 text-white appearance-none focus:outline-none focus:border-padel-green cursor-pointer hover:bg-black/60 transition-colors text-base"
                                >
                                    {uniqueCities.map(city => (
                                        <option key={city} value={city} className="bg-slate-900">{city === 'All' ? 'All Cities' : city}</option>
                                    ))}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>

                            {/* View Toggle */}
                            <div className="flex bg-black/40 border border-white/10 rounded-xl p-1">
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`w-12 h-10 rounded-lg flex items-center justify-center transition-all ${viewMode === 'list' ? 'bg-white/10 text-white shadow-inner' : 'text-gray-500 hover:text-white'}`}
                                    title="List View"
                                >
                                    <List className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('calendar')}
                                    className={`w-12 h-10 rounded-lg flex items-center justify-center transition-all ${viewMode === 'calendar' ? 'bg-white/10 text-white shadow-inner' : 'text-gray-500 hover:text-white'}`}
                                    title="Grid View"
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* MOBILE FILTERS (Accordion) */}
                    <AnimatePresence>
                        {isFilterExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                                className="lg:hidden w-full space-y-4 pt-4 border-t border-white/5 mt-4"
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Type Filter */}
                                    <div className="relative">
                                        <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green w-5 h-5 pointer-events-none" />
                                        <select
                                            value={leagueFilter}
                                            onChange={(e) => setLeagueFilter(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white appearance-none focus:outline-none focus:border-padel-green text-base"
                                        >
                                            <option value="All" className="bg-slate-900">All Types</option>
                                            <option value="League" className="bg-slate-900">League Only</option>
                                            <option value="Tournaments" className="bg-slate-900">Tournaments</option>
                                        </select>
                                    </div>

                                    {/* Status Filter */}
                                    <div className="relative">
                                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green w-5 h-5 pointer-events-none" />
                                        <select
                                            multiple={false}
                                            value={statusFilters[0] || 'All'}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setStatusFilters(val === 'All' ? [] : [val]);
                                            }}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white appearance-none focus:outline-none focus:border-padel-green text-sm"
                                        >
                                            <option value="All" className="bg-slate-900">All Statuses</option>
                                            {uniqueStatuses.filter(s => s !== 'All').map(s => (
                                                <option key={s} value={s} className="bg-slate-900">{s}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* City Filter */}
                                    <div className="relative">
                                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green w-5 h-5 pointer-events-none" />
                                        <select
                                            value={cityFilter}
                                            onChange={(e) => setCityFilter(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white appearance-none focus:outline-none focus:border-padel-green text-sm"
                                        >
                                            {uniqueCities.map(city => (
                                                <option key={city} value={city} className="bg-slate-900">{city === 'All' ? 'All Cities' : city}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* View Mode */}
                                    <div className="flex bg-black/40 border border-white/10 rounded-2xl p-1 gap-1">
                                        <button
                                            onClick={() => setViewMode('list')}
                                            className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                                        >
                                            <List className="w-4 h-4" /> List
                                        </button>
                                        <button
                                            onClick={() => setViewMode('calendar')}
                                            className={`flex-1 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-bold transition-all ${viewMode === 'calendar' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                                        >
                                            <LayoutGrid className="w-4 h-4" /> Grid
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

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
                            <div className="space-y-4">
                                <AnimatePresence mode="popLayout">
                                    {paginatedEvents.map((event, index) => (
                                        <CalendarEventItem key={event.id} event={event} index={index} />
                                    ))}
                                </AnimatePresence>

                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                    <div className="mt-12 flex justify-center items-center gap-4">
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

                <div className="mt-16 bg-white/5 backdrop-blur-sm border border-white/10 p-8 rounded-3xl text-sm text-gray-400 leading-relaxed text-center max-w-4xl mx-auto shadow-xl">
                    <p className="mb-4"><strong className="text-white uppercase tracking-widest text-xs">Note</strong> <br />Further information on all events will be released in due course. Please note event information is subject to change.</p>
                    <p>All players are required to have a valid SAPA Player's license for all Gold and Major events. Registration for events is strictly through RankedIn only.</p>
                </div>
            </main>
        </div>
    );
};

export default Calendar;
