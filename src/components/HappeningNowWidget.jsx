import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, PlayCircle, ExternalLink, Activity } from 'lucide-react';

const HappeningNowWidget = () => {
    const [liveEvents, setLiveEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchLiveEvents = async () => {
            setLoading(true);
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);

                const { data, error } = await supabase
                    .from('calendar')
                    .select('*')
                    .neq('is_visible', false)
                    .gte('start_date', yesterday.toISOString())
                    .order('start_date', { ascending: true });

                if (error) throw error;

                const happeningNow = (data || []).filter(e => {
                    if (!e.start_date) return false;
                    const start = new Date(e.start_date);
                    start.setHours(0,0,0,0);
                    
                    let end = new Date(e.start_date); 
                    if (e.end_date) {
                        end = new Date(e.end_date);
                    }
                    end.setHours(23, 59, 59, 999);

                    return today.getTime() >= start.getTime() && today.getTime() <= end.getTime();
                });

                setLiveEvents(happeningNow);
            } catch (err) {
                console.error('HappeningNowWidget error:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchLiveEvents();
    }, []);

    if (loading || liveEvents.length === 0) return null;

    return (
        <AnimatePresence>
            {liveEvents.length > 0 && (
                <motion.section
                    initial={{ opacity: 0, y: 24, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -24, height: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="relative z-40 w-full"
                >
                    <div className="bg-gradient-to-br from-[#1c0f13]/90 to-[#0F172A]/90 backdrop-blur-xl border border-red-500/30 rounded-[1.5rem] p-4 md:p-5 relative overflow-hidden shadow-[0_0_40px_rgba(220,38,38,0.15)]">
                        {/* Glowing Background */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 rounded-full blur-[80px] -mr-32 -mt-32 pointer-events-none" />
                        
                        {/* Header */}
                        <div className="relative z-10 flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                                    <span className="absolute inline-flex w-full h-full rounded-lg bg-red-500 opacity-40 animate-ping"></span>
                                    <span className="text-base relative z-10 leading-none">🎾</span>
                                </div>
                                <div>
                                    <h2 className="font-black text-white text-sm md:text-base uppercase tracking-wider flex items-center gap-2 leading-none mb-0.5">
                                        Happening Now!
                                    </h2>
                                    <p className="text-red-400 text-[9px] md:text-[10px] uppercase tracking-widest font-bold leading-none">
                                        Live Tournament{liveEvents.length > 1 ? 's' : ''}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Events List */}
                        <div className="relative z-10 flex overflow-x-auto snap-x snap-mandatory gap-3 pb-1 hide-scrollbar scroll-smooth">
                            {liveEvents.map(event => {
                                const poster = event.custom_image_url || event.image_url || event.poster_url;

                                return (
                                    <div 
                                        key={event.id}
                                        onClick={() => {
                                            if (event.slug || event.id) {
                                                navigate(`/calendar/${event.slug || event.id}`);
                                            } else if (event.rankedin_url) {
                                                window.open(event.rankedin_url, '_blank');
                                            }
                                        }}
                                        className="relative flex-none w-[260px] sm:w-[300px] snap-start bg-white/[0.03] border border-white/10 hover:border-red-500/50 rounded-[1rem] p-3 transition-all duration-300 group cursor-pointer shadow-lg flex gap-3 overflow-hidden hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(220,38,38,0.1)]"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

                                        {/* Event Info */}
                                        <div className="flex flex-col justify-between flex-1 py-0.5 min-w-0">
                                            <div className="min-w-0">
                                                <div className="flex justify-between items-start mb-1 gap-2">
                                                    <h3 className="text-xs sm:text-sm font-bold text-white leading-tight truncate group-hover:text-red-400 transition-colors">
                                                        {event.event_name}
                                                    </h3>
                                                    <span className="bg-red-600 text-white text-[7px] font-black uppercase tracking-widest px-1.5 py-[1px] rounded shadow-[0_0_10px_rgba(220,38,38,0.8)] animate-pulse-slow flex items-center gap-1 shrink-0 mt-0.5">
                                                        <span className="w-1 h-1 bg-white rounded-full"></span> LIVE
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 text-gray-400 mb-1">
                                                    <Calendar size={10} className="text-red-400 shrink-0" />
                                                    <span className="text-[9px] sm:text-[10px] font-semibold text-white/90 leading-none">Today</span>
                                                </div>
                                                <div className="flex items-center gap-1 text-gray-400 truncate min-w-0">
                                                    <MapPin size={10} className="text-red-400 shrink-0" />
                                                    <span className="text-[9px] sm:text-[10px] truncate font-medium text-gray-400 leading-none" title={event.venue || event.city}>
                                                        {event.venue || 'TBD'} {event.city ? `(${event.city})` : ''}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="mt-2 flex gap-1.5">
                                                <button className="flex-1 rounded-lg bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 hover:border-red-500 transition-all font-black text-[8px] sm:text-[9px] uppercase tracking-widest flex items-center justify-center gap-1 py-1 shadow-sm group-hover:bg-red-600 group-hover:text-white">
                                                    <PlayCircle size={10} />
                                                    View
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </motion.section>
            )}
        </AnimatePresence>
    );
};

export default HappeningNowWidget;
