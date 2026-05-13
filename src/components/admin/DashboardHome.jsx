import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { Users, Calendar, Trophy, Star, Activity, UserPlus, MapPin, ExternalLink, Home, Plus, FileText, Settings, ArrowRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

import { supabase } from '../../supabaseClient';

const StatCard = ({ title, value, subtext, icon: Icon, delay, loading, onClick, color = 'padel-green' }) => (
    <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.4, ease: "easeOut" }}

        onClick={onClick}
        className="relative group cursor-pointer"
    >
        <div className="absolute -inset-0.5 bg-gradient-to-r from-padel-green/20 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition duration-500 blur"></div>
        <div className="relative bg-[#1E293B]/40 backdrop-blur-xl p-6 rounded-2xl border border-white/10 overflow-hidden hover:border-padel-green/50 transition-all hover:bg-[#1E293B]/60 h-full">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500">
                <Icon size={64} className="text-padel-green" />
            </div>
            
            <div className="flex flex-col justify-between h-full">
                <div>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-3">{title}</p>
                    <h3 className="text-4xl font-bold text-white mb-2 font-display tabular-nums tracking-tight">
                        {loading ? <span className="animate-pulse opacity-50">---</span> : value}
                    </h3>
                </div>
                <div className="flex items-center gap-2 mt-4">

                    <span className="flex h-2 w-2 rounded-full bg-padel-green animate-pulse"></span>
                    <p className="text-padel-green/70 text-[10px] font-bold uppercase tracking-widest group-hover:text-padel-green transition-colors">
                        {subtext}
                    </p>
                </div>
            </div>
        </div>
    </motion.div>
);

const QuickAction = ({ icon: Icon, label, onClick, delay }) => (
    <motion.button
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay, duration: 0.3 }}

        onClick={onClick}
        className="flex items-center gap-2 md:gap-3 bg-white/5 hover:bg-padel-green hover:text-black border border-white/10 p-3 md:p-4 rounded-2xl transition-all duration-300 group overflow-hidden"
    >
        <div className="p-1.5 md:p-2 bg-white/5 rounded-xl group-hover:bg-black/10 transition-colors flex-shrink-0">
            <Icon size={18} />
        </div>
        <span className="font-bold text-[11px] md:text-sm tracking-wide truncate">{label}</span>
    </motion.button>
);



const DashboardHome = ({ onTabChange }) => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalPlayers: 0,
        totalCoaches: 0,
        approvedCoaches: 0,
        upcomingEvents: 0,
        pastEvents: 0,
        featuredEvents: 0
    });
    const [recentPlayers, setRecentPlayers] = useState([]);
    const [upcomingCalendar, setUpcomingCalendar] = useState([]);
    const [loading, setLoading] = useState(true);
    const [chartData, setChartData] = useState([]);

    useEffect(() => {
        fetchDashboardData();
        generateChartData();
    }, []);

    const generateChartData = () => {
        // Create mock data for the growth chart based on realistic progression
        const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
        const base = 250;
        const data = months.map((month, i) => ({
            name: month,
            players: base + (i * 20) + Math.floor(Math.random() * 15)
        }));
        setChartData(data);
    };


    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const today = new Date().toISOString().split('T')[0];

            // 1. Fetch Total Players
            const { count: playerCount, error: playerError } = await supabase
                .from('players')
                .select('*', { count: 'exact', head: true });

            // 1.5. Fetch Coach Stats
            const { count: totalCoachCount, error: coachError } = await supabase
                .from('coach_applications')
                .select('*', { count: 'exact', head: true });

            const { count: approvedCoachCount, error: approvedCoachError } = await supabase
                .from('coach_applications')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'approved');

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
                .select('id, name, created_at, rank_label, license_type, paid_registration')
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
                totalCoaches: totalCoachCount || 0,
                approvedCoaches: approvedCoachCount || 0,
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
            <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    <h2 className="text-3xl lg:text-4xl font-bold text-white mb-2">4M Padel Overview</h2>
                    <p className="text-gray-400">Live metrics across tournaments and players</p>
                </motion.div>
            </div>



            {/* Quick Actions Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                <QuickAction icon={Plus} label="Schedule Event" onClick={() => onTabChange?.('calendar')} delay={0.1} />
                <QuickAction icon={Plus} label="New Player" onClick={() => onTabChange?.('players')} delay={0.2} />
                <QuickAction icon={FileText} label="Post Update" onClick={() => onTabChange?.('blog')} delay={0.3} />
                <QuickAction icon={Settings} label="Config" onClick={() => onTabChange?.('settings')} delay={0.4} />
            </div>



            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <StatCard
                    title="Total Players"
                    value={stats.totalPlayers}
                    subtext="Registered Roster"
                    icon={Users}
                    delay={0.1}
                    loading={loading}
                    onClick={() => onTabChange?.('players')}
                />
                <StatCard
                    title="Coaches"
                    value={stats.totalCoaches}
                    subtext={`${stats.approvedCoaches} Approved`}
                    icon={UserPlus}
                    delay={0.2}
                    loading={loading}
                    onClick={() => onTabChange?.('coaches')}
                />
                <StatCard
                    title="Upcoming Events"
                    value={stats.upcomingEvents}
                    subtext="Scheduled Calendar"
                    icon={Calendar}
                    delay={0.3}
                    loading={loading}
                    onClick={() => onTabChange?.('calendar')}
                />
                <StatCard
                    title="Featured Events"
                    value={stats.featuredEvents}
                    subtext="Homepage Highlights"
                    icon={Star}
                    delay={0.4}
                    loading={loading}
                    onClick={() => onTabChange?.('calendar')}
                />
            </div>

            {/* Growth Chart Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="bg-[#1E293B]/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10 relative overflow-hidden min-h-[400px]"
            >

                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4 px-2">
                    <div>
                        <h3 className="text-xl md:text-2xl font-bold text-white uppercase tracking-tight flex items-center gap-3">
                            <Activity className="text-padel-green w-5 h-5 md:w-6 md:h-6" /> Growth Overview
                        </h3>
                        <p className="text-gray-500 text-[10px] md:text-xs font-bold tracking-widest uppercase mt-1">Player Registration Trend</p>
                    </div>
                </div>

                
                <div className="h-[250px] md:h-[300px] w-full">

                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="colorPlayers" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#CCFF00" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#CCFF00" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }}
                                dy={10}
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 700 }}
                                dx={-10}
                            />
                            <Tooltip 
                                contentStyle={{ 
                                    backgroundColor: '#0F172A', 
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '16px',
                                    color: '#fff',
                                    fontWeight: 'bold'
                                }}
                                itemStyle={{ color: '#CCFF00' }}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="players" 
                                stroke="#CCFF00" 
                                strokeWidth={4}
                                fillOpacity={1} 
                                fill="url(#colorPlayers)" 
                                animationDuration={2000}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </motion.div>


            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mt-12 min-h-[600px]">
                {/* Upcoming Schedule - Left 2 Columns */}
                <div className="xl:col-span-2 bg-[#1E293B]/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10">

                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl md:text-2xl font-bold text-white uppercase tracking-tight flex items-center gap-3">
                            <Calendar className="text-padel-green w-5 h-5 md:w-6 md:h-6" /> Schedule
                        </h3>
                        <button onClick={() => onTabChange?.('calendar')} className="text-padel-green text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:translate-x-1 transition-transform">
                            All <ArrowRight size={12} />
                        </button>
                    </div>



                    <div className="space-y-4">
                        {loading ? (
                            <div className="flex flex-col gap-4">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse" />
                                ))}
                            </div>
                        ) : upcomingCalendar.length === 0 ? (
                            <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl">
                                <Calendar className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                                <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">Quiet on the courts...</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {upcomingCalendar.map((event, index) => (
                                    <motion.div
                                        key={event.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.7 + (index * 0.1) }}
                                        onClick={() => onTabChange?.('calendar')}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-black/40 hover:bg-white/5 border border-white/5 hover:border-padel-green/30 transition-all group cursor-pointer"
                                    >
                                        <div className="flex items-center gap-6">
                                            <div className="flex w-16 h-16 rounded-2xl bg-[#0F172A] border border-white/10 flex-col items-center justify-center flex-shrink-0 group-hover:border-padel-green/50 transition-colors">
                                                <span className="text-[10px] font-bold text-padel-green uppercase tracking-tighter">{new Date(event.start_date || new Date()).toLocaleString('default', { month: 'short' })}</span>
                                                <span className="text-2xl font-bold text-white leading-none">{new Date(event.start_date || new Date()).getDate()}</span>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h4 className="text-white font-bold text-lg group-hover:text-padel-green transition-colors uppercase tracking-tight">{event.event_name}</h4>
                                                    {event.featured_event && (
                                                        <Star className="w-4 h-4 text-padel-green fill-padel-green shadow-[0_0_10px_rgba(204,255,0,0.5)]" />
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap items-center gap-4 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500">
                                                    <span className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full"><MapPin className="w-3.5 h-3.5 text-padel-green" /> {event.city}</span>
                                                    <span className={`px-3 py-1 rounded-full border
                                                        ${event.sapa_status === 'Major' ? 'border-purple-500/30 bg-purple-500/10 text-purple-400' :
                                                            (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                                                                event.sapa_status === 'Gold' ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400' :
                                                                    event.sapa_status === 'Silver' ? 'border-gray-500/30 bg-gray-500/10 text-gray-300' :
                                                                        event.sapa_status === 'Bronze' ? 'border-orange-700/30 bg-orange-700/10 text-orange-400' :
                                                                            'border-blue-500/30 bg-blue-500/10 text-blue-400'}`}>
                                                        {event.sapa_status || 'Event'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ArrowRight className="text-padel-green" />
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Recent Players - Right Column */}
                <div className="bg-[#1E293B]/40 backdrop-blur-xl p-8 rounded-3xl border border-white/10 flex flex-col h-full min-h-[500px]">

                    <div className="flex items-center justify-between mb-10">
                        <h3 className="text-xl md:text-2xl font-bold text-white uppercase tracking-tight flex items-center gap-3">
                            <UserPlus className="text-padel-green w-6 h-6" /> New Registered Members
                        </h3>
                    </div>

                    <div className="mb-4 flex items-center justify-between px-4 text-[10px] font-black text-gray-600 uppercase tracking-widest">
                        <span>NAME</span>
                        <span>LICENSE</span>
                    </div>

                    <div className="space-y-1 flex-grow">
                        {loading ? (
                            <div className="space-y-4">
                                {[1, 2, 3, 4, 5].map(i => (
                                    <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />
                                ))}
                            </div>
                        ) : recentPlayers.length === 0 ? (
                            <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl">
                                <Users className="w-10 h-10 text-gray-700 mx-auto mb-4" />
                                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">No new players yet</p>
                            </div>
                        ) : (
                            recentPlayers.map((player, index) => (
                                <div
                                    key={player.id}
                                    onClick={() => onTabChange?.('players')}
                                    className="flex items-center justify-between p-4 border-b border-white/5 hover:bg-white/5 transition-all cursor-pointer group"
                                >

                                    <span className="text-white font-bold text-sm tracking-tight group-hover:text-padel-green transition-colors">{player.name}</span>
                                    
                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                        !player.paid_registration 
                                            ? 'bg-amber-900/40 text-amber-500 border border-amber-500/20' 
                                            : (player.license_type === 'full' 
                                                ? 'text-padel-green font-black scale-110' 
                                                : 'bg-blue-900/40 text-blue-400 border border-blue-400/20')
                                    }`}>
                                        {!player.paid_registration ? 'Unpaid' : (player.license_type === 'full' ? 'Full' : 'Temp')}
                                    </span>
                                </div>
                            ))

                        )}
                    </div>

                    
                    <button 
                        onClick={() => onTabChange?.('players')}
                        className="mt-8 w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-bold uppercase tracking-[0.2em] transition-all hover:border-padel-green/30 flex items-center justify-center gap-3"
                    >
                        Directory <ArrowRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};


export default DashboardHome;
