import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
    DollarSign, Users, Award, TrendingUp, Calendar, 
    ArrowUpRight, ArrowDownRight, CreditCard, ShieldCheck, Trophy
} from 'lucide-react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
    ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area 
} from 'recharts';
import { supabase } from '../../supabaseClient';

const KPICard = ({ title, value, icon: Icon, trend, trendValue, color }) => (
    <motion.div 
        whileHover={{ y: -5 }}
        className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-3xl border border-white/10 relative overflow-hidden group"
    >
        <div className={`absolute top-0 right-0 w-24 h-24 bg-${color}/10 blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:bg-${color}/20 transition-all`} />
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-2xl bg-${color}/10 text-${color}`}>
                <Icon size={24} />
            </div>
            {trend && (
                <div className={`flex items-center gap-1 text-xs font-bold ${trend === 'up' ? 'text-padel-green' : 'text-red-400'}`}>
                    {trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {trendValue}%
                </div>
            )}
        </div>
        <h3 className="text-gray-400 text-sm font-bold uppercase tracking-widest">{title}</h3>
        <p className="text-3xl font-black text-white mt-1">{value}</p>
    </motion.div>
);

const FinancialDashboard = ({ allowedEvents = [] }) => {
    const [stats, setStats] = useState({
        totalRevenue: 0,
        rev2026: 0,
        fullLicRev: 0,
        tempLicRev: 0,
        allLicRev: 0,
        eventEntryRev: 0,
        totalTransactions: 0,
        activePlayers: 0,
        eventRevenueList: []
    });
    const [chartData, setChartData] = useState([]);
    const [pieData, setPieData] = useState([]);
    const [loading, setLoading] = useState(true);

    const isRestricted = allowedEvents.length > 0;

    useEffect(() => {
        const fetchDashboardData = async () => {
            setLoading(true);
            try {
                // 1. Fetch relevant payments and events in parallel
                const [{ data: payments, error: pError }, { data: events, error: eError }] = await Promise.all([
                    supabase
                        .from('payments')
                        .select('*, calendar(event_name)')
                        .eq('status', 'success'),
                    supabase
                        .from('calendar')
                        .select('id, event_name, start_date')
                ]);

                if (pError) throw pError;
                if (eError) throw eError;

                if (payments) {
                    const totalRevenue = payments.reduce((acc, curr) => acc + Number(curr.amount), 0);
                    
                    // Yearly Breakdown (Focus on 2026)
                    const rev2026 = payments.filter(p => new Date(p.created_at).getFullYear() === 2026)
                        .reduce((acc, curr) => acc + Number(curr.amount), 0);

                    // License Breakdown
                    const fullLicRev = payments.filter(p => 
                        ['full_license', 'membership'].includes(p.payment_type) || 
                        (p.payment_type !== 'event_entry_fee' && Number(p.amount) >= 400)
                    ).reduce((acc, curr) => acc + Number(curr.amount), 0);

                    const tempLicRev = payments.filter(p => 
                        ['temporary_license', 'temp_license'].includes(p.payment_type) || 
                        (p.payment_type !== 'event_entry_fee' && Number(p.amount) < 400 && Number(p.amount) > 0)
                    ).reduce((acc, curr) => acc + Number(curr.amount), 0);

                    // Event Entry Breakdown
                    const eventEntryRev = payments.filter(p => p.payment_type === 'event_entry_fee')
                        .reduce((acc, curr) => acc + Number(curr.amount), 0);

                    // Revenue by Event
                    const eventMap = {};
                    payments.filter(p => p.payment_type === 'event_entry_fee').forEach(p => {
                        const eventName = p.calendar?.event_name || p.metadata?.event_name || 'Unknown Event';
                        const eventId = p.event_id || 'manual';
                        if (!eventMap[eventId]) {
                            eventMap[eventId] = { name: eventName, revenue: 0 };
                        }
                        eventMap[eventId].revenue += Number(p.amount);
                    });
                    const eventRevenueList = Object.values(eventMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

                    setStats({
                        totalRevenue,
                        rev2026,
                        fullLicRev,
                        tempLicRev,
                        allLicRev: fullLicRev + tempLicRev,
                        eventEntryRev,
                        totalTransactions: payments.length,
                        activePlayers: new Set(payments.map(p => p.player_id)).size,
                        eventRevenueList
                    });

                    // Prepare Pie Chart
                    setPieData([
                        { name: 'Event Entries', value: eventEntryRev, color: '#beff00' },
                        { name: 'Full Licenses', value: fullLicRev, color: '#3b82f6' },
                        { name: 'Temp Licenses', value: tempLicRev, color: '#f59e0b' }
                    ]);

                    // Prepare Bar Chart (by month for current/selected year)
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const currentYear = new Date().getFullYear();
                    const monthlyData = months.map((m, i) => {
                        const monthRev = payments.filter(p => {
                            const d = new Date(p.created_at);
                            return d.getMonth() === i && d.getFullYear() === currentYear;
                        }).reduce((acc, curr) => acc + Number(curr.amount), 0);

                        const licenseRev = payments.filter(p => {
                            const d = new Date(p.created_at);
                            return d.getMonth() === i && d.getFullYear() === currentYear && p.payment_type !== 'event_entry_fee';
                        }).reduce((acc, curr) => acc + Number(curr.amount), 0);

                        const entryRev = payments.filter(p => {
                            const d = new Date(p.created_at);
                            return d.getMonth() === i && d.getFullYear() === currentYear && p.payment_type === 'event_entry_fee';
                        }).reduce((acc, curr) => acc + Number(curr.amount), 0);

                        return { name: m, revenue: monthRev, licenses: licenseRev, entries: entryRev };
                    });
                    setChartData(monthlyData);
                }

            } catch (err) {
                console.error('Error fetching dashboard data:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, [allowedEvents, isRestricted]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="w-10 h-10 border-4 border-padel-green border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KPICard 
                    title="Total Revenue" 
                    value={`R${stats.totalRevenue.toLocaleString()}`} 
                    icon={DollarSign} 
                    trend="up" 
                    trendValue="100"
                    color="padel-green"
                />
                <KPICard 
                    title="Revenue 2026" 
                    value={`R${stats.rev2026.toLocaleString()}`} 
                    icon={Calendar} 
                    color="blue-500"
                />
                <KPICard 
                    title="Event Entries" 
                    value={`R${stats.eventEntryRev.toLocaleString()}`} 
                    icon={Trophy} 
                    color="padel-green"
                />
                <KPICard 
                    title="All Licenses" 
                    value={`R${stats.allLicRev.toLocaleString()}`} 
                    icon={Award} 
                    color="indigo-500"
                />
                
                <KPICard 
                    title="Full Licenses" 
                    value={`R${stats.fullLicRev.toLocaleString()}`} 
                    icon={ShieldCheck} 
                    color="blue-400"
                />
                <KPICard 
                    title="Temp Licenses" 
                    value={`R${stats.tempLicRev.toLocaleString()}`} 
                    icon={CreditCard} 
                    color="amber-500"
                />
                <KPICard 
                    title="Active Players" 
                    value={stats.activePlayers.toLocaleString()} 
                    icon={Users} 
                    color="purple-500"
                />
                <KPICard 
                    title="Transactions" 
                    value={stats.totalTransactions.toLocaleString()} 
                    icon={CreditCard} 
                    color="orange-500"
                />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Revenue Chart */}
                <div className="lg:col-span-2 bg-[#1E293B]/50 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h3 className="text-xl font-bold text-white">Revenue Growth</h3>
                            <p className="text-gray-400 text-sm">Monthly overview for {new Date().getFullYear()}</p>
                        </div>
                    </div>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#9AE900" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#9AE900" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `R${v/1000}k`} />
                                <Tooltip 
                                    contentStyle={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                                    itemStyle={{ color: '#9AE900', fontWeight: 'bold' }}
                                />
                                <Area type="monotone" dataKey="revenue" stroke="#9AE900" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Revenue Split Pie Chart */}
                <div className="bg-[#1E293B]/50 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col">
                    <h3 className="text-xl font-bold text-white mb-2">Revenue Breakdown</h3>
                    <p className="text-gray-400 text-sm mb-6">Distribution by payment type</p>
                    <div className="h-[250px] w-full mt-auto relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={8}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                            <p className="text-xs text-gray-500 font-bold uppercase">Total</p>
                            <p className="text-xl font-black text-white">R{stats.totalRevenue > 1000 ? `${(stats.totalRevenue/1000).toFixed(1)}k` : stats.totalRevenue}</p>
                        </div>
                    </div>
                    <div className="space-y-4 mt-8">
                        {pieData.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-gray-300 text-sm font-bold">{item.name}</span>
                                </div>
                                <span className="text-white font-bold text-sm">
                                    {((item.value / (stats.totalRevenue || 1)) * 100).toFixed(1)}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Event Revenue Details */}
            <div className="bg-[#1E293B]/50 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Revenue by Event</h3>
                        <p className="text-gray-400 text-sm">Top performing tournaments and leagues</p>
                    </div>
                    <div className="bg-padel-green/10 text-padel-green px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-padel-green/20">
                        Total Entry Fees: R{stats.eventEntryRev.toLocaleString()}
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Event List Table */}
                    <div className="space-y-4">
                        {stats.eventRevenueList?.map((event, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-gray-500 group-hover:text-padel-green transition-colors font-black">
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <p className="text-white font-bold group-hover:text-padel-green transition-colors">{event.name}</p>
                                        <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">Tournament Entry Fees</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-white font-black">R{event.revenue.toLocaleString()}</p>
                                    <p className="text-[10px] text-padel-green font-bold uppercase tracking-widest">
                                        {((event.revenue / (stats.eventEntryRev || 1)) * 100).toFixed(1)}%
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Stacked Chart for Entries vs Licenses */}
                    <div className="h-full min-h-[300px]">
                        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-6">Monthly Revenue Mix ({new Date().getFullYear()})</h4>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R${v/1000}k`} />
                                <Tooltip 
                                    contentStyle={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                                    itemStyle={{ fontWeight: 'bold' }}
                                />
                                <Bar dataKey="entries" name="Event Entries" stackId="a" fill="#beff00" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="licenses" name="Licenses" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinancialDashboard;
