import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { MapPin, Loader, AlertCircle, Calendar as CalendarIcon, ArrowRight, Search, Filter, ChevronLeft, ChevronRight, LayoutGrid, List, X, Users } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

const Calendar = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filter & Search State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [cityFilter, setCityFilter] = useState('All');
    const [timingFilter, setTimingFilter] = useState('Upcoming');

    // View State
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'calendar'

    // Calendar View State
    const [currentDate, setCurrentDate] = useState(new Date());

    // Pagination State (for List View)
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 9;

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('calendar')
                .select('*')
                .order('start_date', { ascending: true })
                .order('id', { ascending: true });

            if (error) throw error;
            setEvents(data || []);
        } catch (err) {
            console.error('Error fetching calendar:', err);
            setError('Failed to load events. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    // Extract unique cities and statuses for filters
    const uniqueCities = useMemo(() => {
        const cities = events.map(e => e.city).filter(Boolean);
        return ['All', ...new Set(cities)].sort();
    }, [events]);

    const uniqueStatuses = ['All', 'Gold', 'Major', 'Silver', 'Key Event', 'FIP event', 'S Gold'];

    // Filter Logic
    const filteredEvents = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return events.filter(event => {
            const matchesSearch =
                event.event_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                event.venue.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'All' || event.sapa_status === statusFilter;
            const matchesCity = cityFilter === 'All' || event.city === cityFilter;

            let matchesTiming = true;
            if (viewMode === 'list') {
                if (timingFilter === 'Upcoming') {
                    const eventDate = new Date(event.end_date || event.start_date);
                    matchesTiming = eventDate >= today;
                } else if (timingFilter === 'Past') {
                    const eventDate = new Date(event.end_date || event.start_date);
                    matchesTiming = eventDate < today;
                }
            }

            return matchesSearch && matchesStatus && matchesCity && matchesTiming;
        });
    }, [events, searchTerm, statusFilter, cityFilter, timingFilter, viewMode]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredEvents.length / itemsPerPage);
    const paginatedEvents = filteredEvents.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Reset page on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, cityFilter, timingFilter, viewMode]);

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
                            else if (ev.sapa_status === 'S Gold') { bgGradient = 'bg-amber-600'; glowClass = 'hover:border-amber-600 bg-gradient-to-r hover:from-amber-600/10 hover:to-transparent'; }
                            else if (ev.sapa_status === 'Gold') { bgGradient = 'bg-yellow-500'; glowClass = 'hover:border-yellow-500 bg-gradient-to-r hover:from-yellow-500/10 hover:to-transparent'; }
                            else if (ev.sapa_status === 'Silver') { bgGradient = 'bg-gray-400'; glowClass = 'hover:border-gray-400 bg-gradient-to-r hover:from-gray-400/10 hover:to-transparent'; }
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
            <Navbar />

            {/* Background elements matched from Rankings */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-padel-green/10 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[150px] rounded-full" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03]" />
            </div>

            <main className="relative z-10 pt-32 pb-32 container mx-auto px-6 max-w-7xl">

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

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-6 uppercase"
                    >
                        SAPA Tour <span className="text-padel-green">Calendar</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-gray-400 max-w-2xl mx-auto"
                    >
                        Explore the 2026/2027 season events. Find tournaments near you, plan your schedule, and compete for crucial ranking points.
                    </motion.p>
                </div>

                {/* Filters & Controls */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-4 mb-10 flex flex-col lg:flex-row gap-4 items-center justify-between"
                >
                    {/* Search */}
                    <div className="relative w-full lg:w-96 flex-shrink-0">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Search events or venues..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-padel-green transition-colors placeholder-gray-500"
                        />
                    </div>

                    {/* Filters & Toggle */}
                    <div className="flex flex-wrap md:flex-nowrap gap-4 w-full lg:w-auto items-center justify-end">
                        {/* Timing Filter (List View Only) */}
                        {viewMode === 'list' && (
                            <div className="relative w-full md:w-auto min-w-[140px]">
                                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4" />
                                <select
                                    value={timingFilter}
                                    onChange={(e) => setTimingFilter(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-10 pr-8 text-white appearance-none focus:outline-none focus:border-padel-green cursor-pointer hover:bg-black/60 transition-colors"
                                >
                                    <option value="Upcoming" className="bg-slate-900">Upcoming</option>
                                    <option value="Past" className="bg-slate-900">Past</option>
                                    <option value="All" className="bg-slate-900">All Events</option>
                                </select>
                            </div>
                        )}

                        {/* Status Filter */}
                        <div className="relative w-full md:w-auto min-w-[140px]">
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4" />
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-10 pr-8 text-white appearance-none focus:outline-none focus:border-padel-green cursor-pointer hover:bg-black/60 transition-colors"
                            >
                                {uniqueStatuses.map(status => (
                                    <option key={status} value={status} className="bg-slate-900">{status}</option>
                                ))}
                            </select>
                        </div>

                        {/* City Filter */}
                        <div className="relative w-full md:w-auto min-w-[140px]">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4" />
                            <select
                                value={cityFilter}
                                onChange={(e) => setCityFilter(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-2xl py-3 pl-10 pr-8 text-white appearance-none focus:outline-none focus:border-padel-green cursor-pointer hover:bg-black/60 transition-colors"
                            >
                                {uniqueCities.map(city => (
                                    <option key={city} value={city} className="bg-slate-900">{city === 'All' ? 'All Cities' : city}</option>
                                ))}
                            </select>
                        </div>

                        {/* View Toggle */}
                        <div className="flex bg-black/40 border border-white/10 rounded-xl p-1 w-full md:w-auto mt-2 md:mt-0">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`flex-1 md:w-20 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-bold transition-all ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
                            >
                                <List className="w-4 h-4" /> List
                            </button>
                            <button
                                onClick={() => setViewMode('calendar')}
                                className={`flex-1 md:w-20 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-bold transition-all ${viewMode === 'calendar' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`}
                            >
                                <LayoutGrid className="w-4 h-4" /> Grid
                            </button>
                        </div>
                    </div>
                </motion.div>

                {/* Content Area */}
                {loading ? (
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
                            onClick={() => { setSearchTerm(''); setStatusFilter('All'); setCityFilter('All'); setTimingFilter('Upcoming'); }}
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
                                    {paginatedEvents.map((event, index) => {
                                        let tierColor = 'border-white/10';
                                        let badgeColor = 'bg-white/10 text-gray-400';
                                        let bgGradient = 'bg-white/5'; // Default

                                        if (event.sapa_status === 'Major') { tierColor = 'border-white/10 hover:border-red-500/50'; badgeColor = 'bg-red-500/20 text-red-400 border border-red-500/30'; bgGradient = 'bg-gradient-to-r from-red-500/20 to-transparent'; }
                                        else if (event.sapa_status === 'S Gold') { tierColor = 'border-white/10 hover:border-amber-500/50'; badgeColor = 'bg-amber-500/20 text-amber-400 border border-amber-500/30'; bgGradient = 'bg-gradient-to-r from-amber-600/20 to-transparent'; }
                                        else if (event.sapa_status === 'Gold') { tierColor = 'border-white/10 hover:border-yellow-500/50'; badgeColor = 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'; bgGradient = 'bg-gradient-to-r from-yellow-500/20 to-transparent'; }
                                        else if (event.sapa_status === 'Silver') { tierColor = 'border-white/10 hover:border-gray-400/50'; badgeColor = 'bg-gray-500/20 text-gray-300 border border-gray-400/30'; bgGradient = 'bg-gradient-to-r from-gray-400/20 to-transparent'; }
                                        else if (event.sapa_status === 'FIP event') { tierColor = 'border-white/10 hover:border-blue-500/50'; badgeColor = 'bg-blue-500/20 text-blue-400 border border-blue-500/30'; bgGradient = 'bg-gradient-to-r from-blue-500/20 to-transparent'; }

                                        return (
                                            <motion.div
                                                key={event.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                transition={{ delay: index * 0.05 }}
                                            >
                                                <Link
                                                    to={`/calendar/${event.slug || event.id}`}
                                                    className={`group block backdrop-blur-sm border ${tierColor} rounded-3xl p-6 hover:bg-white/10 transition-all duration-300 shadow-xl overflow-hidden relative`}
                                                >
                                                    {/* Background Gradient */}
                                                    <div className={`absolute inset-0 ${bgGradient} opacity-50 group-hover:opacity-80 transition-opacity`}></div>

                                                    <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between relative z-10">
                                                        {/* Poster Image Box */}
                                                        <div className="flex-shrink-0 w-full md:w-32 h-24 rounded-2xl overflow-hidden bg-black/40 border border-white/5 relative group">
                                                            {event.image_url ? (
                                                                <img
                                                                    src={event.image_url}
                                                                    alt={event.event_name}
                                                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                                                />
                                                            ) : (
                                                                <div className="w-full h-full flex flex-col items-center justify-center">
                                                                    <CalendarIcon className="w-6 h-6 text-padel-green mb-1 opacity-50" />
                                                                    <span className="text-[10px] text-gray-500 font-bold uppercase">No Poster</span>
                                                                </div>
                                                            )}
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </div>

                                                        {/* Info */}
                                                        <div className="flex-1">
                                                            <div className="flex flex-wrap gap-2 mb-3">
                                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${badgeColor}`}>
                                                                    {event.sapa_status}
                                                                </span>
                                                                <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-gray-300">
                                                                    {event.city}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-4 mb-2">
                                                                <h3 className="text-xl md:text-2xl font-bold text-white group-hover:text-padel-green transition-colors leading-tight">
                                                                    {event.event_name}
                                                                </h3>
                                                                <div className="flex items-center gap-1.5 text-xs font-bold text-padel-green bg-padel-green/10 border border-padel-green/20 px-2.5 py-1 rounded-full whitespace-nowrap">
                                                                    <CalendarIcon size={12} />
                                                                    {event.event_dates}
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-gray-400 text-sm font-medium">
                                                                <div className="flex items-center gap-2">
                                                                    <MapPin className="w-4 h-4 text-padel-green/50" />
                                                                    {event.venue}
                                                                </div>
                                                                {event.registered_players > 0 && (
                                                                    <div className="flex items-center gap-1.5 bg-padel-green/5 border border-padel-green/10 px-2 py-0.5 rounded-lg">
                                                                        <Users className="w-3.5 h-3.5 text-padel-green" />
                                                                        <span className="text-white font-bold">{event.registered_players}</span>
                                                                        <span className="text-[10px] uppercase tracking-tighter text-gray-400">Registered</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Arrow Action */}
                                                        <div className="hidden md:flex items-center justify-center w-12 h-12 rounded-full border border-white/10 bg-black/40 text-gray-400 group-hover:text-padel-green group-hover:border-padel-green transition-all transform group-hover:scale-110 group-hover:bg-white/5">
                                                            <ArrowRight className="w-5 h-5" />
                                                        </div>
                                                    </div>
                                                </Link>
                                            </motion.div>
                                        );
                                    })}
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
