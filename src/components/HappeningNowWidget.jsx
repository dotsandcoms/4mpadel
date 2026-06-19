import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Calendar, MapPin, PlayCircle, ExternalLink, Activity, Eye } from 'lucide-react';
import { getEventImage } from '../utils/imageUtils';

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
                    <div className="bg-[#12161E] border border-white/10 rounded-2xl p-4 md:p-6 relative overflow-hidden shadow-2xl w-full">
                        {/* Header */}
                        <div className="relative z-10 flex items-center justify-between mb-5">
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-white/10">
                                    <span className="text-lg relative z-10 leading-none">🎾</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <h2 className="font-black text-white text-lg md:text-xl uppercase tracking-wider flex items-center gap-2 leading-none mt-1">
                                        {isLive ? 'Happening Now!' : 'Happening Next'}
                                    </h2>
                                    {isLive && (
                                        <span className="bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded animate-pulse-slow flex items-center gap-1 shrink-0 mt-1">
                                            <span className="w-1.5 h-1.5 bg-white rounded-full"></span> LIVE
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Events List */}
                        <div className="relative z-10 flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 hide-scrollbar scroll-smooth">
                            {liveEvents.map(event => {
                                const poster = getEventImage(event);

                                let borderCls = 'border-padel-green/50';
                                let hoverBorderCls = 'hover:border-padel-green hover:shadow-[0_0_20px_rgba(46,213,115,0.15)]';
                                let btnBg = 'bg-padel-green text-black hover:bg-padel-green/90 group-hover:bg-padel-green/90 border-transparent';
                                let iconColor = 'text-padel-green';
                                let statusLabel = null;
                                let statusBg = 'bg-white/10 text-white';

                                if (event.sapa_status === 'Major' || event.event_name?.includes('Major')) {
                                    borderCls = 'border-red-500/50';
                                    hoverBorderCls = 'hover:border-red-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]';
                                    btnBg = 'bg-red-600 text-white hover:bg-red-500 group-hover:bg-red-500 border-transparent';
                                    iconColor = 'text-red-400';
                                    statusLabel = 'MAJOR';
                                    statusBg = 'bg-red-500/20 text-red-500';
                                } else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold' || event.event_name?.includes('Super Gold') || event.event_name?.includes('S Gold')) {
                                    borderCls = 'border-amber-500/50';
                                    hoverBorderCls = 'hover:border-amber-500 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]';
                                    btnBg = 'bg-amber-500 text-black hover:bg-amber-400 group-hover:bg-amber-400 border-transparent';
                                    iconColor = 'text-amber-400';
                                    statusLabel = 'SUPER GOLD';
                                    statusBg = 'bg-amber-500/20 text-amber-500';
                                } else if (event.sapa_status === 'Gold' || event.event_name?.includes('Gold')) {
                                    borderCls = 'border-yellow-500/50';
                                    hoverBorderCls = 'hover:border-yellow-400 hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]';
                                    btnBg = 'bg-yellow-500 text-black hover:bg-yellow-400 group-hover:bg-yellow-400 border-transparent';
                                    iconColor = 'text-yellow-400';
                                    statusLabel = 'GOLD';
                                    statusBg = 'bg-yellow-500/20 text-yellow-500';
                                } else if (event.sapa_status === 'Silver' || event.event_name?.includes('Silver')) {
                                    borderCls = 'border-gray-400/50';
                                    hoverBorderCls = 'hover:border-gray-300 hover:shadow-[0_0_20px_rgba(156,163,175,0.15)]';
                                    btnBg = 'bg-gray-300 text-black hover:bg-gray-200 group-hover:bg-gray-200 border-transparent';
                                    iconColor = 'text-gray-300';
                                    statusLabel = 'SILVER';
                                    statusBg = 'bg-gray-400/20 text-gray-300';
                                } else if (event.sapa_status === 'Bronze' || event.event_name?.includes('Bronze')) {
                                    borderCls = 'border-orange-600/50';
                                    hoverBorderCls = 'hover:border-orange-500 hover:shadow-[0_0_20px_rgba(234,88,12,0.15)]';
                                    btnBg = 'bg-orange-600 text-white hover:bg-orange-500 group-hover:bg-orange-500 border-transparent';
                                    iconColor = 'text-orange-400';
                                    statusLabel = 'BRONZE';
                                    statusBg = 'bg-orange-600/20 text-orange-500';
                                }

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
                                        className={`relative flex-none w-[240px] sm:w-[290px] snap-start bg-[#1E2530]/50 border rounded-2xl p-3 sm:p-4 transition-all duration-300 group cursor-pointer flex flex-col gap-2 sm:gap-2.5 overflow-hidden hover:-translate-y-1 ${borderCls} ${hoverBorderCls}`}
                                    >
                                        {/* Optional background ball image */}
                                        <div className="absolute -right-6 top-1/4 w-32 h-32 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-500 mix-blend-screen">
                                            {poster ? <img src={poster} alt="" className="w-full h-full object-cover rounded-full blur-sm" /> : <div className="w-full h-full rounded-full bg-padel-green blur-2xl"></div>}
                                        </div>

                                        {/* Badges Row */}
                                        <div className="flex justify-between items-start z-10 w-full">
                                            {statusLabel ? (
                                                <div className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest ${statusBg}`}>
                                                    {statusLabel}
                                                </div>
                                            ) : (
                                                <div />
                                            )}
                                            <div className={`w-6 h-6 rounded-full bg-black/40 flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity`}>
                                                <Eye size={12} className={iconColor} />
                                            </div>
                                        </div>

                                        {/* Title */}
                                        <div className="z-10">
                                            <h3 className="text-sm sm:text-lg font-bold text-white leading-tight transition-colors group-hover:text-padel-green line-clamp-2">
                                                {event.event_name}
                                            </h3>
                                        </div>

                                        {/* Event Details */}
                                        <div className="flex flex-col gap-1.5 mt-auto z-10 mb-1">
                                            {!isLive && (
                                                <div className="flex items-center gap-2 text-gray-400">
                                                    <Calendar size={14} className={`${iconColor} shrink-0`} />
                                                    <span className="text-xs font-medium text-white/90">
                                                        {new Date(event.start_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex items-start gap-2 text-gray-400">
                                                <MapPin size={14} className={`${iconColor} shrink-0 mt-0.5`} />
                                                <span className="text-xs font-medium text-gray-300 leading-tight line-clamp-2">
                                                    {event.venue || 'TBD'} {event.city ? `, ${event.city}` : ''}
                                                </span>
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
