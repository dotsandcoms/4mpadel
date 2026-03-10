import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { MapPin, Loader, AlertCircle, Calendar as CalendarIcon, ArrowRight, X, Users } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

const Broll = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchBrollEvents();
    }, []);

    const fetchBrollEvents = async () => {
        try {
            setLoading(true);
            const { data, error: sbError } = await supabase
                .from('calendar')
                .select('*')
                .eq('tournament_tag', 'Broll')
                .order('start_date', { ascending: true });

            if (sbError) throw sbError;
            setEvents(data || []);
        } catch (err) {
            console.error('Error fetching Broll events:', err);
            setError('Failed to load Broll Pro Tour events.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0F172A] text-white">
            <Navbar />

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 to-transparent opacity-50"></div>
                <div className="max-w-7xl mx-auto relative z-10 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tighter bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent italic">
                            BROLL PRO TOUR
                        </h1>
                        <p className="text-xl md:text-2xl text-gray-400 max-w-2xl mx-auto font-medium mb-8">
                            Elite Padel competition at the highest level.
                            Exclusive tournaments for top-ranked players.
                        </p>
                        <div className="flex items-center justify-center gap-4">
                            <div className="h-0.5 w-12 bg-blue-500/50"></div>
                            <span className="text-blue-400 font-black tracking-widest text-sm uppercase">Official Partner</span>
                            <div className="h-0.5 w-12 bg-blue-500/50"></div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Content Area */}
            <section className="max-w-7xl mx-auto px-6 pb-32">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <Loader className="w-10 h-10 animate-spin mb-4 text-blue-400" />
                        <p>Loading Broll events...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-64 text-red-400 bg-red-900/10 border border-red-500/20 rounded-3xl">
                        <AlertCircle className="w-10 h-10 mb-4" />
                        <p>{error}</p>
                    </div>
                ) : events.length === 0 ? (
                    <div className="text-center py-32 text-gray-400 bg-white/5 border border-white/10 rounded-3xl">
                        <p className="text-xl">No Broll Pro Tour events scheduled at this time.</p>
                        <p className="text-sm mt-2 text-gray-500 italic">Check back soon for upcoming tour dates.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6">
                        <AnimatePresence mode="popLayout">
                            {events.map((event, index) => {
                                let tierColor = 'border-white/10 hover:border-blue-500/50';
                                let badgeColor = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
                                let bgGradient = 'bg-gradient-to-r from-blue-500/20 to-transparent';

                                return (
                                    <motion.div
                                        key={event.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                    >
                                        <Link
                                            to={event.slug ? `/calendar/${event.slug}` : `/calendar/${event.id}`}
                                            className={`group block backdrop-blur-sm border ${tierColor} rounded-3xl p-6 hover:bg-white/10 transition-all duration-300 shadow-xl overflow-hidden relative`}
                                        >
                                            <div className={`absolute inset-0 ${bgGradient} opacity-50 group-hover:opacity-80 transition-opacity`}></div>

                                            <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between relative z-10">
                                                <div className="flex-shrink-0 w-full md:w-48 h-32 rounded-2xl overflow-hidden bg-black/40 border border-white/5 relative group/img">
                                                    {event.image_url || event.posterUrl ? (
                                                        <img
                                                            src={event.image_url || event.posterUrl}
                                                            alt={event.event_name}
                                                            className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center">
                                                            <CalendarIcon className="w-8 h-8 text-blue-400 mb-1 opacity-50" />
                                                            <span className="text-[10px] text-gray-500 font-bold uppercase">No Poster</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex-1">
                                                    <div className="flex flex-wrap gap-2 mb-3">
                                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${badgeColor}`}>
                                                            {event.sapa_status || 'Broll Pro Tour'}
                                                        </span>
                                                        {event.city && (
                                                            <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest text-gray-300">
                                                                {event.city}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-4 mb-2">
                                                        <h3 className="text-2xl md:text-4xl font-black text-white group-hover:text-blue-400 transition-colors leading-tight italic tracking-tight">
                                                            {event.event_name}
                                                        </h3>
                                                        <div className="flex items-center gap-1.5 text-sm font-bold text-blue-400 bg-blue-400/10 border border-blue-400/20 px-3 py-1 rounded-full whitespace-nowrap">
                                                            <CalendarIcon size={14} />
                                                            {event.event_dates ||
                                                                (event.start_date && `${new Date(event.start_date).toLocaleDateString()}${event.end_date && event.end_date !== event.start_date ? ` - ${new Date(event.end_date).toLocaleDateString()}` : ''}`)}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-gray-400 text-sm font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <MapPin className="w-4 h-4 text-blue-400/50" />
                                                            {event.venue}
                                                        </div>
                                                        {event.registered_players > 0 && (
                                                            <div className="flex items-center gap-1.5 bg-blue-400/5 border border-blue-400/10 px-2 py-0.5 rounded-lg">
                                                                <Users className="w-3.5 h-3.5 text-blue-400" />
                                                                <span className="text-white font-bold">{event.registered_players}</span>
                                                                <span className="text-[10px] uppercase tracking-tighter text-gray-400">Registered</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="hidden md:flex items-center justify-center w-14 h-14 rounded-full border border-white/10 bg-black/40 text-gray-400 group-hover:text-blue-400 group-hover:border-blue-400 transition-all transform group-hover:scale-110 group-hover:bg-white/5">
                                                    <ArrowRight className="w-6 h-6" />
                                                </div>
                                            </div>
                                        </Link>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </section>
        </div>
    );
};

export default Broll;
