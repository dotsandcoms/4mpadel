import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';
import { Users, Calendar, Trophy, TrendingUp, Activity, UserPlus } from 'lucide-react';
import { supabase } from '../../supabaseClient';

// Placeholder data for charts (since we don't have historical data yet)
const data = [
    { name: 'Mon', players: 40, bookings: 24 },
    { name: 'Tue', players: 30, bookings: 13 },
    { name: 'Wed', players: 50, bookings: 38 },
    { name: 'Thu', players: 45, bookings: 30 },
    { name: 'Fri', players: 80, bookings: 50 },
    { name: 'Sat', players: 95, bookings: 70 },
    { name: 'Sun', players: 85, bookings: 65 },
];

const StatCard = ({ title, value, subtext, icon: Icon, delay, loading }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.5 }}
        className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 relative overflow-hidden group"
    >
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Icon size={48} />
        </div>
        <h3 className="text-gray-400 text-sm font-medium mb-2">{title}</h3>
        <p className="text-3xl font-bold text-white mb-2">
            {loading ? <span className="animate-pulse">...</span> : value}
        </p>
        <p className="text-padel-green text-sm flex items-center gap-1">
            <TrendingUp size={14} /> {subtext}
        </p>
    </motion.div>
);

const DashboardHome = () => {
    const [stats, setStats] = useState({
        totalPlayers: 0,
        activeTournaments: 0,
        upcomingEvents: 0
    });
    const [recentPlayers, setRecentPlayers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            // 1. Fetch Total Players
            const { count: playerCount, error: playerError } = await supabase
                .from('players')
                .select('*', { count: 'exact', head: true });

            // 2. Fetch Active/Upcoming Tournaments
            const { count: eventCount, error: eventError } = await supabase
                .from('events')
                .select('*', { count: 'exact', head: true })
                .or('status.eq.upcoming,status.eq.live');

            // 3. Fetch Recent Players (limit 5)
            const { data: newPlayers, error: recentError } = await supabase
                .from('players')
                .select('id, name, created_at, rank_label')
                .order('created_at', { ascending: false })
                .limit(5);

            if (playerError) console.error('Error fetching players:', playerError);
            if (eventError) console.error('Error fetching events:', eventError);

            setStats({
                totalPlayers: playerCount || 0,
                activeTournaments: eventCount || 0,
            });
            setRecentPlayers(newPlayers || []);

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="mb-8"
            >
                <h2 className="text-3xl font-bold text-white">Overview</h2>
                <p className="text-gray-400">Welcome back, Admin</p>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Players"
                    value={stats.totalPlayers}
                    subtext="Registered players"
                    icon={Users}
                    delay={0.1}
                    loading={loading}
                />
                <StatCard
                    title="Active Tournaments"
                    value={stats.activeTournaments}
                    subtext="Live & Upcoming"
                    icon={Trophy}
                    delay={0.2}
                    loading={loading}
                />
                <StatCard
                    title="Court Bookings"
                    value="842"
                    subtext="Demo Data"
                    icon={Calendar}
                    delay={0.3}
                />
                <StatCard
                    title="Revenue"
                    value="R 45,200"
                    subtext="Demo Data"
                    icon={TrendingUp}
                    delay={0.4}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Charts Section - Left 2 Columns */}
                <div className="lg:col-span-2 space-y-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 h-[400px]"
                    >
                        <h3 className="text-lg font-bold text-white mb-6">Weekly Activity (Demo)</h3>
                        <ResponsiveContainer width="100%" height="85%">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="colorPlayers" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#D0F500" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#D0F500" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                <XAxis dataKey="name" stroke="#94a3b8" tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: '#D0F500' }}
                                />
                                <Area type="monotone" dataKey="players" stroke="#D0F500" strokeWidth={3} fillOpacity={1} fill="url(#colorPlayers)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </motion.div>
                </div>

                {/* Recent Activity - Right Column */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10"
                >
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Activity size={20} className="text-padel-green" /> Recent Players
                    </h3>
                    <div className="space-y-4">
                        {loading ? (
                            <p className="text-gray-500 text-center py-4">Loading...</p>
                        ) : recentPlayers.length === 0 ? (
                            <p className="text-gray-500 text-center py-4">No recent activity</p>
                        ) : (
                            recentPlayers.map((player, index) => (
                                <div key={player.id || index} className="flex items-center gap-4 p-3 rounded-lg bg-black/20 hover:bg-white/5 transition-colors border border-white/5">
                                    <div className="w-10 h-10 rounded-full bg-padel-green/10 flex items-center justify-center text-padel-green">
                                        <UserPlus size={18} />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="text-white font-medium text-sm">{player.name}</h4>
                                        <p className="text-gray-400 text-xs">{player.rank_label || 'New Player'}</p>
                                    </div>
                                </div>
                            ))
                        )}
                        <button className="w-full text-center text-sm text-padel-green mt-4 hover:underline">
                            View All Activity
                        </button>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default DashboardHome;
