import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, Trophy, Star, Activity, UserPlus, MapPin, ExternalLink } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const StatCard = ({ title, value, subtext, icon: Icon, delay, loading }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.5 }}
        className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 relative overflow-hidden group hover:border-padel-green/30 transition-colors"
    >
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-300">
            <Icon size={48} className="text-padel-green" />
        </div>
        <h3 className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-2">{title}</h3>
        <p className="text-4xl font-black text-white mb-2 font-display">
            {loading ? <span className="animate-pulse">---</span> : value}
        </p>
        <p className="text-padel-green/80 text-xs font-bold uppercase tracking-widest flex items-center gap-1">
            {subtext}
        </p>
    </motion.div>
);

const DashboardHome = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalPlayers: 0,
        upcomingEvents: 0,
        pastEvents: 0,
        featuredEvents: 0
    });
    const [recentPlayers, setRecentPlayers] = useState([]);
    const [upcomingCalendar, setUpcomingCalendar] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const today = new Date().toISOString().split('T')[0];

            // 1. Fetch Total Players
            const { count: playerCount, error: playerError } = await supabase
                .from('players')
                .select('*', { count: 'exact', head: true });

            // 2. Fetch Event Stats from 'calendar' table
            const { data: allEvents, error: calendarError } = await supabase
                .from('calendar')
                .select('start_date, featured_event');

            let upcomingCount = 0;
            let pastCount = 0;
            let featuredCount = 0;

            if (allEvents) {
                allEvents.forEach(evt => {
                    if (evt.featured_event) featuredCount++;
                    if (!evt.start_date || evt.start_date >= today) {
                        upcomingCount++;
                    } else {
                        pastCount++;
                    }
                });
            }

            // 3. Fetch Recent Players (limit 5)
            const { data: newPlayers, error: recentError } = await supabase
                .from('players')
                .select('id, name, created_at, rank_label')
                .order('created_at', { ascending: false })
                .limit(5);

            // 4. Fetch Next Upcoming Events for the list
            const { data: nextEvents, error: nextEventsError } = await supabase
                .from('calendar')
                .select('id, event_name, start_date, city, sapa_status, featured_event')
                .gte('start_date', today)
                .order('start_date', { ascending: true })
                .limit(5);

            if (playerError) console.error('Error fetching players:', playerError);
            if (calendarError) console.error('Error fetching events:', calendarError);

            setStats({
                totalPlayers: playerCount || 0,
                upcomingEvents: upcomingCount,
                pastEvents: pastCount,
                featuredEvents: featuredCount
            });

            setRecentPlayers(newPlayers || []);
            setUpcomingCalendar(nextEvents || []);

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="mb-8"
            >
                <h2 className="text-3xl lg:text-4xl font-bold text-white mb-2">Platform Overview</h2>
                <p className="text-gray-400">Live metrics across tournaments and players</p>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <StatCard
                    title="Total Players"
                    value={stats.totalPlayers}
                    subtext="Registered Roster"
                    icon={Users}
                    delay={0.0}
                    loading={loading}
                />
                <StatCard
                    title="Upcoming Events"
                    value={stats.upcomingEvents}
                    subtext="Scheduled Calendar"
                    icon={Calendar}
                    delay={0.1}
                    loading={loading}
                />
                <StatCard
                    title="Past Tournaments"
                    value={stats.pastEvents}
                    subtext="Completed Events"
                    icon={Trophy}
                    delay={0.2}
                    loading={loading}
                />
                <StatCard
                    title="Featured Events"
                    value={stats.featuredEvents}
                    subtext="Homepage Highlights"
                    icon={Star}
                    delay={0.3}
                    loading={loading}
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mt-10">
                {/* Upcoming Schedule - Left 2 Columns */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="xl:col-span-2 bg-[#1E293B]/50 backdrop-blur-md p-6 lg:p-8 rounded-2xl border border-white/10"
                >
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                            <Calendar className="text-padel-green w-5 h-5" /> Next on Calendar
                        </h3>
                    </div>

                    <div className="space-y-4">
                        {loading ? (
                            <p className="text-gray-500 text-center py-8">Loading schedule...</p>
                        ) : upcomingCalendar.length === 0 ? (
                            <div className="text-center py-12 border border-white/5 bg-white/5 rounded-xl">
                                <Calendar className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                                <p className="text-gray-400 font-medium">No upcoming events scheduled.</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {upcomingCalendar.map((event, index) => (
                                    <div key={event.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-black/40 hover:bg-white/5 border border-white/5 hover:border-padel-green/30 transition-all group">
                                        <div className="flex items-start sm:items-center gap-4">
                                            <div className="hidden sm:flex w-12 h-12 rounded-lg bg-[#0F172A] border border-white/10 flex-col items-center justify-center flex-shrink-0">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase">{new Date(event.start_date || new Date()).toLocaleString('default', { month: 'short' })}</span>
                                                <span className="text-lg font-bold text-white leading-none">{new Date(event.start_date || new Date()).getDate()}</span>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h4 className="text-white font-bold text-base md:text-lg group-hover:text-padel-green transition-colors">{event.event_name}</h4>
                                                    {event.featured_event && (
                                                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs font-bold uppercase tracking-wider text-gray-500">
                                                    <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {event.city}</span>
                                                    <span className={`px-2 py-0.5 rounded
                                                        ${event.sapa_status === 'Major' ? 'bg-purple-500/10 text-purple-400' :
                                                            event.sapa_status === 'Gold' ? 'bg-yellow-500/10 text-yellow-400' :
                                                                event.sapa_status === 'Silver' ? 'bg-gray-500/10 text-gray-300' :
                                                                    'bg-blue-500/10 text-blue-400'}`}>
                                                        {event.sapa_status || 'Event'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Recent Players - Right Column */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-[#1E293B]/50 backdrop-blur-md p-6 lg:p-8 rounded-2xl border border-white/10 flex flex-col h-full"
                >
                    <h3 className="text-xl font-bold text-white mb-8 flex items-center gap-3">
                        <UserPlus className="text-padel-green w-5 h-5" /> New Registrations
                    </h3>

                    <div className="space-y-3 flex-grow">
                        {loading ? (
                            <p className="text-gray-500 text-center py-4">Loading players...</p>
                        ) : recentPlayers.length === 0 ? (
                            <div className="text-center py-10 border border-white/5 bg-white/5 rounded-xl">
                                <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                                <p className="text-gray-500 text-sm">No players database</p>
                            </div>
                        ) : (
                            recentPlayers.map((player) => (
                                <div key={player.id} className="flex items-center gap-4 p-3.5 rounded-xl bg-black/40 hover:bg-white/5 transition-colors border border-white/5">
                                    <div className="w-10 h-10 rounded-full bg-[#0F172A] border border-white/10 flex items-center justify-center text-gray-400 shadow-inner flex-shrink-0">
                                        <Users size={18} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-white font-bold text-sm truncate">{player.name}</h4>
                                        <p className="text-padel-green text-[10px] font-bold uppercase tracking-widest truncate mt-0.5">
                                            {player.rank_label || 'Unranked'}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default DashboardHome;
