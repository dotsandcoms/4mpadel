import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { MapPin, Loader, AlertCircle, Calendar as CalendarIcon, ArrowRight, Users, ExternalLink, Award, Building2, TrendingUp } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import brollLogo from '../assets/broll.png';

const Broll = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const BROLL_RED = '#B3122B';

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
        <div className="min-h-screen bg-white text-slate-900 font-sans">
            <Navbar isDark />

            {/* Hero Section - Official Broll Aesthetic */}
            <section className="relative pt-40 pb-24 px-6 overflow-hidden bg-slate-50">
                <div className="absolute top-0 right-0 w-1/3 h-full bg-[#B3122B]/5 skew-x-12 transform translate-x-1/2"></div>
                <div className="max-w-7xl mx-auto relative z-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -30 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.8 }}
                        >
                            <div className="inline-flex items-center gap-2 bg-[#B3122B] text-white px-4 py-1.5 rounded-sm mb-6 text-sm font-bold tracking-widest uppercase">
                                <Award className="w-4 h-4" />
                                Official Partner
                            </div>
                            <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tighter text-slate-900 leading-[0.9]">
                                BROLL <span className="text-[#B3122B]">PRO TOUR</span>
                            </h1>
                            <p className="text-xl md:text-2xl text-slate-600 max-w-xl font-medium mb-10 leading-relaxed">
                                Premier property trading meets elite padel competition.
                                Experience the pinnacle of South African sport and commerce.
                            </p>
                            <div className="flex flex-wrap gap-4">
                                <a
                                    href="https://www.brollauctions.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="bg-[#B3122B] text-white px-8 py-4 rounded-lg font-bold flex items-center gap-2 hover:bg-[#960f24] transition-all shadow-lg shadow-[#B3122B]/20"
                                >
                                    Visit Broll Auctions <ExternalLink className="w-4 h-4" />
                                </a>
                                <button className="border-2 border-slate-200 text-slate-700 px-8 py-4 rounded-lg font-bold hover:bg-slate-100 transition-all">
                                    View Tour Schedule
                                </button>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 1, delay: 0.2 }}
                            className="relative"
                        >
                            <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl border-8 border-white">
                                <img
                                    src={brollLogo}
                                    alt="4m Padel Broll"
                                    className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#B3122B]/40 to-transparent"></div>
                            </div>
                            {/* Stats Overlay */}
                            <div className="absolute -bottom-6 -left-6 bg-white p-8 rounded-2xl shadow-xl border border-slate-100 hidden md:block">
                                <div className="flex gap-8">
                                    <div>
                                        <div className="text-3xl font-black text-[#B3122B]">45+</div>
                                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Years Legacy</div>
                                    </div>
                                    <div className="w-px h-10 bg-slate-100"></div>
                                    <div>
                                        <div className="text-3xl font-black text-[#B3122B]">#1</div>
                                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Property Platform</div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Sponsor Info Section */}
            <section className="py-24 px-6 bg-white border-b border-slate-100">
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                        <div className="space-y-4">
                            <div className="w-12 h-12 bg-[#B3122B]/10 rounded-xl flex items-center justify-center text-[#B3122B]">
                                <Building2 className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">Premier Platform</h3>
                            <p className="text-slate-500 leading-relaxed">
                                Broll Auctions and Sales is one of South Africa's leading commercial real estate auction houses with a proven track record.
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div className="w-12 h-12 bg-[#B3122B]/10 rounded-xl flex items-center justify-center text-[#B3122B]">
                                <TrendingUp className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">Proven Success</h3>
                            <p className="text-slate-500 leading-relaxed">
                                Specializing in the sale of iconic commercial, industrial, and retail properties across South Africa for over four decades.
                            </p>
                        </div>
                        <div className="space-y-4">
                            <div className="w-12 h-12 bg-[#B3122B]/10 rounded-xl flex items-center justify-center text-[#B3122B]">
                                <Users className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900">Industry Leaders</h3>
                            <p className="text-slate-500 leading-relaxed">
                                Committed to excellence and transparency, bringing the same standard of professionalism to the South African Padel scene.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Tournaments Listing */}
            <section className="max-w-7xl mx-auto px-6 py-24">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
                    <div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            UPCOMING TOUR <span className="text-[#B3122B]">DATES</span>
                        </h2>
                        <div className="h-1.5 w-24 bg-[#B3122B] mt-2"></div>
                    </div>
                    <p className="text-slate-500 font-medium max-w-md md:text-right">
                        Limited entries available for top-seed players. Secure your spot in the Broll Pro Tour.
                    </p>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                        <Loader className="w-10 h-10 animate-spin mb-4 text-[#B3122B]" />
                        <p>Loading tour dates...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-64 text-red-500 bg-red-50 border border-red-100 rounded-3xl">
                        <AlertCircle className="w-10 h-10 mb-4" />
                        <p>{error}</p>
                    </div>
                ) : events.length === 0 ? (
                    <div className="text-center py-24 bg-slate-50 border border-slate-100 rounded-3xl">
                        <p className="text-xl font-bold text-slate-400">No Broll Pro Tour events scheduled.</p>
                        <p className="text-sm mt-2 text-slate-400 uppercase tracking-widest font-black">Coming Soon</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-8">
                        <AnimatePresence mode="popLayout">
                            {events.map((event, index) => (
                                <motion.div
                                    key={event.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                >
                                    <Link
                                        to={event.slug ? `/calendar/${event.slug}` : `/calendar/${event.id}`}
                                        className="group block bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-[#B3122B]/30 hover:shadow-xl transition-all duration-500"
                                    >
                                        <div className="flex flex-col lg:flex-row">
                                            {/* Image Box - More compact */}
                                            <div className="lg:w-1/5 aspect-[21/9] lg:aspect-auto relative overflow-hidden bg-slate-100">
                                                {event.image_url || event.posterUrl ? (
                                                    <img
                                                        src={event.image_url || event.posterUrl}
                                                        alt={event.event_name}
                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50">
                                                        <CalendarIcon className="w-8 h-8 text-slate-200 mb-1" />
                                                        <span className="text-[8px] text-slate-300 font-bold uppercase tracking-widest text-center px-2">Official Broll Event</span>
                                                    </div>
                                                )}
                                                <div className="absolute top-2 left-2">
                                                    <span className="bg-[#B3122B] text-white px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                                                        {event.sapa_status || 'Pro Tour'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Info Box - Reduced padding and font sizes */}
                                            <div className="lg:w-4/5 p-4 lg:px-8 lg:py-4 flex flex-col justify-center relative">
                                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="h-0.5 w-6 bg-[#B3122B]"></div>
                                                            <span className="text-[#B3122B] text-[10px] font-black uppercase tracking-[0.2em]">Broll Pro Tour</span>
                                                        </div>
                                                        <h3 className="text-xl lg:text-2xl font-black text-slate-900 leading-tight mb-2 tracking-tighter">
                                                            {event.event_name}
                                                        </h3>
                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 font-bold text-xs">
                                                            <div className="flex items-center gap-1.5">
                                                                <CalendarIcon size={14} className="text-[#B3122B]" />
                                                                {event.event_dates ||
                                                                    (event.start_date && `${new Date(event.start_date).toLocaleDateString()}${event.end_date && event.end_date !== event.start_date ? ` - ${new Date(event.end_date).toLocaleDateString()}` : ''}`)}
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <MapPin size={14} className="text-[#B3122B]" />
                                                                {event.venue}
                                                            </div>
                                                            {event.registered_players > 0 && (
                                                                <div className="flex items-center gap-1.5 text-slate-900">
                                                                    <Users size={14} className="text-[#B3122B]" />
                                                                    <span>{event.registered_players} Registered</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex-shrink-0">
                                                        <div className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-300 group-hover:border-[#B3122B] group-hover:text-[#B3122B] transition-all duration-500 transform group-hover:rotate-45">
                                                            <ArrowRight className="w-5 h-5" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </section>
        </div>
    );
};

export default Broll;
