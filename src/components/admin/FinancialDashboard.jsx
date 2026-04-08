import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
    DollarSign, Users, Award, TrendingUp, Calendar, 
    ArrowUpRight, ArrowDownRight, CreditCard 
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

const FinancialDashboard = () => {
    const [stats, setStats] = useState({
        totalRevenue: 0,
        eventRevenue: 0,
        licenseRevenue: 0,
        totalTransactions: 0,
        activePlayers: 0
    });
    const [chartData, setChartData] = useState([]);
    const [pieData, setPieData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDashboardData = async () => {
            setLoading(true);
            try {
                // 1. Fetch all successful payments
                const { data: payments } = await supabase
                    .from('payments')
                    .select('*')
                    .eq('status', 'success');

                if (payments) {
                    const total = payments.reduce((acc, curr) => acc + Number(curr.amount), 0);
                    const eventRev = payments.filter(p => p.payment_type === 'event_entry_fee').reduce((acc, curr) => acc + Number(curr.amount), 0);
                    const licRev = payments.filter(p => p.payment_type !== 'event_entry_fee').reduce((acc, curr) => acc + Number(curr.amount), 0);
                    
                    setStats(prev => ({
                        ...prev,
                        totalRevenue: total,
                        eventRevenue: eventRev,
                        licenseRevenue: licRev,
                        totalTransactions: payments.length
                    }));

                    // Prepare Pie Chart
                    setPieData([
                        { name: 'Events', value: eventRev, color: '#9AE900' },
                        { name: 'Licenses', value: licRev, color: '#3B82F6' },
                        { name: 'Manual/Other', value: 0, color: '#6366F1' }
                    ]);

                    // Prepare Bar Chart (by month)
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const currentYear = new Date().getFullYear();
                    const monthlyData = months.map((m, i) => {
                        const monthRev = payments.filter(p => {
                            const d = new Date(p.created_at);
                            return d.getMonth() === i && d.getFullYear() === currentYear;
                        }).reduce((acc, curr) => acc + Number(curr.amount), 0);
                        return { name: m, revenue: monthRev };
                    });
                    setChartData(monthlyData);
                }

                // 2. Fetch Player Stats
                const { count } = await supabase.from('players').select('*', { count: 'exact', head: true });
                setStats(prev => ({ ...prev, activePlayers: count || 0 }));

            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, []);

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
                    trendValue="12.5"
                    color="padel-green"
                />
                <KPICard 
                    title="Event Revenue" 
                    value={`R${stats.eventRevenue.toLocaleString()}`} 
                    icon={Calendar} 
                    trend="up" 
                    trendValue="8.2"
                    color="blue-500"
                />
                <KPICard 
                    title="Active Players" 
                    value={stats.activePlayers.toLocaleString()} 
                    icon={Users} 
                    trend="up" 
                    trendValue="5.1"
                    color="indigo-500"
                />
                <KPICard 
                    title="Transactions" 
                    value={stats.totalTransactions.toLocaleString()} 
                    icon={CreditCard} 
                    trend="down" 
                    trendValue="2.4"
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

            {/* Recent Activity Mini List */}
            <div className="bg-[#1E293B]/50 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-xl font-bold text-white">Projected Growth</h3>
                    <div className="flex items-center gap-2 text-padel-green bg-padel-green/10 px-3 py-1 rounded-full text-xs font-bold border border-padel-green/20">
                        <TrendingUp size={14} /> +24% vs Last Period
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/5">
                        <Award className="text-padel-green mb-4" size={32} />
                        <h4 className="text-white font-bold mb-1">Top Event</h4>
                        <p className="text-gray-400 text-sm">Cape Town Major '26</p>
                        <p className="text-padel-green font-black mt-2">R45,200</p>
                    </div>
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/5">
                        <Award className="text-blue-400 mb-4" size={32} />
                        <h4 className="text-white font-bold mb-1">Top License Period</h4>
                        <p className="text-gray-400 text-sm">March Registrations</p>
                        <p className="text-blue-400 font-black mt-2">124 New Players</p>
                    </div>
                    <div className="p-6 rounded-3xl bg-white/5 border border-white/5">
                        <Award className="text-indigo-400 mb-4" size={32} />
                        <h4 className="text-white font-bold mb-1">Conversion</h4>
                        <p className="text-gray-400 text-sm">Visitor to Player</p>
                        <p className="text-indigo-400 font-black mt-2">18.4%</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinancialDashboard;
