import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, PlayCircle, ExternalLink, Activity } from 'lucide-react';

const HappeningNowWidget = () => {
    const [liveEvents, setLiveEvents] = useState([]);
    const [isLive, setIsLive] = useState(true);
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

                const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                endOfMonth.setHours(23, 59, 59, 999);

                const { data, error } = await supabase
                    .from('calendar')
                    .select('*')
                    .neq('is_visible', false)
                    .gte('start_date', yesterday.toISOString())
                    .lte('start_date', endOfMonth.toISOString())
                    .order('start_date', { ascending: true });

                if (error) throw error;

                const happeningNow = [];
                const upcomingThisMonth = [];

                (data || []).forEach(e => {
                    if (!e.start_date) return;
                    const start = new Date(e.start_date);
                    start.setHours(0, 0, 0, 0);

                    let end = new Date(e.start_date);
                    if (e.end_date) {
                        end = new Date(e.end_date);
                    }
                    end.setHours(23, 59, 59, 999);

                    if (today.getTime() >= start.getTime() && today.getTime() <= end.getTime()) {
                        happeningNow.push(e);
                    } else if (start.getTime() > today.getTime() && start.getTime() <= endOfMonth.getTime()) {
                        upcomingThisMonth.push(e);
                    }
                });

                const sortByFeatured = (a, b) => {
                    if (a.featured_event && !b.featured_event) return -1;
                    if (!a.featured_event && b.featured_event) return 1;
                    return 0;
                };

                happeningNow.sort(sortByFeatured);
                upcomingThisMonth.sort(sortByFeatured);

                if (happeningNow.length > 0) {
                    setLiveEvents(happeningNow);
                    setIsLive(true);
                } else if (upcomingThisMonth.length > 0) {
                    setLiveEvents(upcomingThisMonth);
                    setIsLive(false);
                } else {
                    setLiveEvents([]);
                }
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
                    <div className="bg-white/5 backdrop-blur-xl border-t border-l border-white/20 border-r border-b border-padel-green/20 rounded-3xl p-4 md:p-5 relative overflow-hidden shadow-2xl w-full">
                        {/* Header */}
                        <div className="relative z-10 flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className={`relative flex items-center justify-center w-7 h-7 rounded-lg ${isLive ? 'bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-white/10'}`}>
                                    {isLive && <span className="absolute inline-flex w-full h-full rounded-lg bg-red-500 opacity-40 animate-ping"></span>}
                                    <span className="text-base relative z-10 leading-none">🎾</span>
                                </div>
                                <div>
                                    <h2 className="font-bold text-white/95 text-base md:text-xl uppercase tracking-wider flex items-center gap-2 leading-none mb-0.5">
                                        {isLive ? 'Happening Now!' : 'Happening Next'}
                                    </h2>
                                </div>
                            </div>
                        </div>

                        {/* Events List */}
                        <div className="relative z-10 flex overflow-x-auto snap-x snap-mandatory gap-3 pb-1 hide-scrollbar scroll-smooth">
                            {liveEvents.map(event => {
                                const poster = event.custom_image_url || event.image_url || event.poster_url;
                                
                                let borderCls = 'border-padel-green/60 shadow-[0_0_15px_rgba(46,213,115,0.1)]';
                                let hoverBorderCls = 'hover:border-padel-green hover:shadow-[0_0_25px_rgba(46,213,115,0.2)]';
                                let btnBg = 'bg-padel-green text-black hover:bg-padel-green/90 group-hover:bg-padel-green/90 border-transparent';
                                let iconColor = 'text-padel-green';

                                if (event.sapa_status === 'Major' || event.event_name?.includes('Major')) {
                                    borderCls = 'border-red-500/60 shadow-[0_0_15px_rgba(239,68,68,0.1)]';
                                    hoverBorderCls = 'hover:border-red-500 hover:shadow-[0_0_25px_rgba(239,68,68,0.2)]';
                                    btnBg = 'bg-red-600 text-white hover:bg-red-500 group-hover:bg-red-500 border-transparent';
                                    iconColor = 'text-red-400';
                                } else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold' || event.event_name?.includes('Super Gold') || event.event_name?.includes('S Gold')) {
                                    borderCls = 'border-amber-500/60 shadow-[0_0_15px_rgba(245,158,11,0.1)]';
                                    hoverBorderCls = 'hover:border-amber-500 hover:shadow-[0_0_25px_rgba(245,158,11,0.2)]';
                                    btnBg = 'bg-amber-500 text-black hover:bg-amber-400 group-hover:bg-amber-400 border-transparent';
                                    iconColor = 'text-amber-400';
                                } else if (event.sapa_status === 'Gold' || event.event_name?.includes('Gold')) {
                                    borderCls = 'border-yellow-500/60 shadow-[0_0_15px_rgba(234,179,8,0.1)]';
                                    hoverBorderCls = 'hover:border-yellow-400 hover:shadow-[0_0_25px_rgba(234,179,8,0.2)]';
                                    btnBg = 'bg-yellow-500 text-black hover:bg-yellow-400 group-hover:bg-yellow-400 border-transparent';
                                    iconColor = 'text-yellow-400';
                                } else if (event.sapa_status === 'Silver' || event.event_name?.includes('Silver')) {
                                    borderCls = 'border-gray-400/60 shadow-[0_0_15px_rgba(156,163,175,0.1)]';
                                    hoverBorderCls = 'hover:border-gray-300 hover:shadow-[0_0_25px_rgba(156,163,175,0.2)]';
                                    btnBg = 'bg-gray-300 text-black hover:bg-gray-200 group-hover:bg-gray-200 border-transparent';
                                    iconColor = 'text-gray-300';
                                } else if (event.sapa_status === 'Bronze' || event.event_name?.includes('Bronze')) {
                                    borderCls = 'border-orange-600/60 shadow-[0_0_15px_rgba(234,88,12,0.1)]';
                                    hoverBorderCls = 'hover:border-orange-500 hover:shadow-[0_0_25px_rgba(234,88,12,0.2)]';
                                    btnBg = 'bg-orange-600 text-white hover:bg-orange-500 group-hover:bg-orange-500 border-transparent';
                                    iconColor = 'text-orange-400';
                                }

                                return (
                                    <div
                                        key={event.id}
                                        onClick={() => {
                                            if (event.slug || event.id) {
                                                if (isLive) {
                                                    navigate(`/draws/${event.slug || event.id}`);
                                                } else {
                                                    navigate(`/calendar/${event.slug || event.id}`);
                                                }
                                            } else if (event.rankedin_url) {
                                                window.open(event.rankedin_url, '_blank');
                                            }
                                        }}
                                        className={`relative flex-none w-[260px] sm:w-[300px] snap-start bg-white/[0.03] border rounded-[1rem] p-3 transition-all duration-300 group cursor-pointer flex gap-3 overflow-hidden hover:-translate-y-1 ${borderCls} ${hoverBorderCls}`}
                                    >
                                        <div className={`absolute inset-0 bg-gradient-to-r ${isLive ? 'from-red-500/5' : 'from-white/5'} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />

                                        {/* Event Info */}
                                        <div className="flex flex-col justify-between flex-1 py-0.5 min-w-0">
                                            <div className="min-w-0">
                                                <div className="flex justify-between items-start mb-1 gap-2">
                                                    <h3 className={`text-sm sm:text-base font-semibold text-white/95 leading-tight truncate transition-colors group-hover:${iconColor}`}>
                                                        {event.event_name}
                                                    </h3>
                                                    {isLive && (
                                                    <span className="bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest px-1.5 py-[1px] rounded shadow-[0_0_10px_rgba(220,38,38,0.8)] animate-pulse-slow flex items-center gap-1 shrink-0 mt-0.5">
                                                        <span className="w-1.5 h-1.5 bg-white rounded-full"></span> LIVE
                                                    </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 text-gray-400 mb-1">
                                                    <Calendar size={12} className={`${iconColor} shrink-0`} />
                                                    <span className="text-xs font-medium text-white/80 leading-none">
                                                        {isLive ? 'Today' : new Date(event.start_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 text-gray-400 truncate min-w-0">
                                                    <MapPin size={12} className={`${iconColor} shrink-0`} />
                                                    <span className="text-xs truncate font-medium text-gray-300 leading-none" title={event.venue || event.city}>
                                                        {event.venue || 'TBD'} {event.city ? `(${event.city})` : ''}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="mt-2 flex gap-1.5">
                                                <button className={`flex-1 rounded-lg border transition-all font-bold text-[10px] sm:text-xs uppercase tracking-widest flex items-center justify-center gap-1.5 py-1.5 shadow-sm ${btnBg}`}>
                                                    <PlayCircle size={12} />
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
