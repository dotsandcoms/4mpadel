import React, { useState, useEffect, useMemo } from 'react';
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
import { isLicensePaymentRow, normalizePaymentMetadata } from '../../utils/paymentRegistrationMatch';
import { fetchCommerceConfig, matchLicenseTypeByAmount } from '../../utils/commerce';
import { fetchAllRows } from '../../utils/fetchAllRows';
import { buildEventSettlements, summarizeEventSettlements } from '../../utils/eventSettlement';

const EMPTY_EVENTS = Object.freeze([]);
const money = n => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const KPICard = ({ title, value, icon: Icon, trend, trendValue, color }) => (
    <motion.div
        whileHover={{ y: -5 }}
        className="bg-[#1a1a1a]/50 backdrop-blur-md p-6 rounded-3xl border border-white/10 relative overflow-hidden group"
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

const FinancialDashboard = ({ allowedEvents = EMPTY_EVENTS, onSelectEvent }) => {
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
    const [error, setError] = useState('');
    const [retryKey, setRetryKey] = useState(0);
    const [eventFilter, setEventFilter] = useState('all');
    const [eventStatements, setEventStatements] = useState([]);

    const isRestricted = allowedEvents.length > 0;

    useEffect(() => {
        let cancelled = false;
        const fetchDashboardData = async () => {
            setLoading(true); setError('');
            try {
                const scope = query => isRestricted ? query.in('event_id', allowedEvents) : query;
                const [payments, refunds, events, registrations, participants, divisions, commerce] = await Promise.all([
                    fetchAllRows(() => scope(supabase.from('payments').select('*')).order('id', { ascending: true })),
                    fetchAllRows(() => supabase.from('payment_refunds').select('*').order('id', { ascending: true })),
                    fetchAllRows(() => {
                        const query = supabase.from('calendar').select('*').order('id', { ascending: true });
                        return isRestricted ? query.in('id', allowedEvents) : query;
                    }),
                    fetchAllRows(() => scope(supabase.from('event_registrations').select('*')).order('id', { ascending: true })),
                    fetchAllRows(() => scope(supabase.from('tournament_participants').select('*, players(email)')).order('id', { ascending: true })),
                    fetchAllRows(() => scope(supabase.from('tournament_divisions').select('*')).order('id', { ascending: true })),
                    fetchCommerceConfig().catch(() => null),
                ]);
                const statements = buildEventSettlements({ events, registrations, participants, payments, refunds, divisions });
                const receipts = statements.flatMap(e => e.settlement.receiptRows);
                const entryRefunds = statements.flatMap(e => e.settlement.processedRefundRows);
                const licenses = payments.filter(p => p.status === 'success' && !p.is_test && !normalizePaymentMetadata(p.metadata).is_test && isLicensePaymentRow(p));
                const licenseById = new Map(licenses.map(p => [p.id, p]));
                const licenseRefunds = [...new Map(refunds.filter(r => r.status === 'processed' && licenseById.has(r.payment_id))
                    .map(r => [r.paystack_refund_id || r.id, r])).values()];
                const sum = (rows, key = 'amount') => Math.round(rows.reduce((n, r) => n + Number(r[key] || 0), 0) * 100) / 100;
                const full = p => ['full_license', 'membership'].includes(p.payment_type)
                    || normalizePaymentMetadata(p.metadata).license_type === 'full'
                    || (!['temp_license', 'temporary_license'].includes(p.payment_type) && matchLicenseTypeByAmount(Number(p.amount), commerce) === 'full');
                const fullLicRev = sum(licenses.filter(full)) - sum(licenseRefunds.filter(r => full(licenseById.get(r.payment_id))));
                const tempLicRev = sum(licenses.filter(p => !full(p))) - sum(licenseRefunds.filter(r => !full(licenseById.get(r.payment_id))));
                const totals = summarizeEventSettlements(statements);
                const eventEntryRev = totals.collected - totals.refunds;
                const totalRevenue = eventEntryRev + fullLicRev + tempLicRev;
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const monthlyData = months.map((name, i) => {
                    const inMonth = value => {
                        const date = new Date(value);
                        return date.getFullYear() === new Date().getFullYear() && date.getMonth() === i;
                    };
                    const entries = sum(receipts.filter(p => inMonth(p.created_at))) - sum(entryRefunds.filter(r => inMonth(r.processed_at || r.created_at)));
                    const licenseTotal = sum(licenses.filter(p => inMonth(p.created_at))) - sum(licenseRefunds.filter(r => inMonth(r.processed_at || r.created_at)));
                    return { name, revenue: entries + licenseTotal, entries, licenses: licenseTotal };
                });
                if (cancelled) return;
                setEventStatements(statements);
                setStats({ totalRevenue, fullLicRev, tempLicRev, allLicRev: fullLicRev + tempLicRev, eventEntryRev,
                    totalTransactions: receipts.length + licenses.length,
                    activePlayers: new Set([...registrations.filter(r => !['withdrawn', 'cancelled'].includes(r.status)).map(r => r.email), ...participants.map(p => p.email || p.players?.email)].filter(Boolean).map(v => v.toLowerCase())).size });
                setPieData([{ name: 'Event entries', value: Math.max(0, eventEntryRev), color: '#beff00' },
                    { name: 'Full licences', value: Math.max(0, fullLicRev), color: '#3b82f6' },
                    { name: 'Temporary licences', value: Math.max(0, tempLicRev), color: '#f59e0b' }]);
                setChartData(monthlyData);
            } catch (err) {
                if (!cancelled) setError(err.message || 'Could not load financial records');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchDashboardData();
        return () => { cancelled = true; };
    }, [allowedEvents, isRestricted, retryKey]);

    const displayedEvents = useMemo(() => eventStatements.filter(event => {
        const balance = event.settlement.dueToOrg;
        if (eventFilter === 'outstanding') return balance > 0;
        if (eventFilter === 'settled') return balance === 0 && !event.settlement.issues.length && !event.settlement.refundReserve;
        if (eventFilter === 'month') {
            const now = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' }).slice(0, 7);
            return String(event.start_date || '').slice(0, 7) === now;
        }
        return true;
    }), [eventStatements, eventFilter]);
    const eventTotals = summarizeEventSettlements(displayedEvents);

    if (error) return <div role="alert" className="rounded-xl border border-red-400/30 p-6 text-red-200">
        <p>Finance overview unavailable: {error}</p>
        <button type="button" onClick={() => setRetryKey(n => n + 1)} className="mt-3 text-sm underline">Retry</button>
    </div>;

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
                    title="Events"
                    value={eventTotals.events.toLocaleString()}
                    icon={DollarSign}
                    color="padel-green"
                />
                <KPICard
                    title="Total entries"
                    value={eventTotals.entries.toLocaleString()}
                    icon={Calendar}
                    color="blue-500"
                />
                <KPICard
                    title="Total cash collected"
                    value={money(eventTotals.collected)}
                    icon={Trophy}
                    color="padel-green"
                />
                <KPICard
                    title="Total balance owed"
                    value={money(eventTotals.balanceOwed)}
                    icon={Award}
                    color="indigo-500"
                />

                <KPICard
                    title="Full Licenses"
                    value={money(stats.fullLicRev)}
                    icon={ShieldCheck}
                    color="blue-400"
                />
                <KPICard
                    title="Temp Licenses"
                    value={money(stats.tempLicRev)}
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
                <div className="lg:col-span-2 bg-[#1a1a1a]/50 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h3 className="text-xl font-bold text-white">Collections by month</h3>
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
                                    contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                                    itemStyle={{ color: '#9AE900', fontWeight: 'bold' }}
                                />
                                <Area type="monotone" dataKey="revenue" stroke="#9AE900" strokeWidth={4} fillOpacity={1} fill="url(#colorRev)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Revenue Split Pie Chart */}
                <div className="bg-[#1a1a1a]/50 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10 shadow-2xl flex flex-col">
                    <h3 className="text-xl font-bold text-white mb-2">Collections Breakdown</h3>
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
                                    contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
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
            <div className="bg-[#1a1a1a]/50 backdrop-blur-md p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h3 className="text-xl font-bold text-white uppercase tracking-tighter">Event finance summary</h3>
                        <p className="text-gray-400 text-sm">Collections, refunds, commission and organiser settlements</p>
                    </div>
                    <div className="bg-padel-green/10 text-padel-green px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-padel-green/20">
                        Balance owed: {money(eventTotals.balanceOwed)}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Event List Table */}
                    <div className="space-y-4 min-w-0 md:col-span-2">
                        <label className="text-sm text-gray-400">Events <select aria-label="Filter event reconciliations" value={eventFilter} onChange={e => setEventFilter(e.target.value)} className="ml-2 rounded-lg bg-black/40 border border-white/10 p-2 text-white">
                            <option value="all">All events</option><option value="outstanding">Outstanding</option><option value="settled">Settled</option><option value="month">This month</option>
                        </select></label>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[960px] text-left text-xs">
                                <thead className="text-gray-400"><tr>{['Event', 'Entries', 'Cash collected', 'Refunds', 'Commission on 4M receipts', 'Direct to organiser', 'Paid out by 4M', 'Balance owed'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
                                <tbody className="divide-y divide-white/10">{displayedEvents.map(event => <tr key={event.id}>
                                    <td className="p-3"><button type="button" onClick={() => onSelectEvent?.(event.id)} className="text-left font-bold text-white hover:text-padel-green">{event.event_name}</button>{event.settlement.issues.length > 0 && <p className="mt-1 text-amber-300">Needs review</p>}{event.settlement.unallocatedCredit4M > 0 && <p className="mt-1 text-amber-300">{money(event.settlement.unallocatedCredit4M)} unallocated credit reserved from payout</p>}</td>
                                    <td className="p-3 text-white">{event.settlement.activeEntries}</td>
                                    {['grossEntryFees', 'entryFeesRefunded', 'commission', 'organiserRetained', 'interimPaid', 'dueToOrg'].map(key => <td key={key} className={`p-3 whitespace-nowrap ${key === 'dueToOrg' ? 'font-bold text-padel-green' : 'text-gray-300'}`}>{money(event.settlement[key])}</td>)}
                                </tr>)}</tbody>
                                <tfoot className="border-t border-white/20 font-bold text-white"><tr><td className="p-3">Net totals</td><td className="p-3">{eventTotals.entries}</td>{['collected', 'refunds', 'commission', 'direct', 'paid'].map(key => <td key={key} className="p-3 whitespace-nowrap">{money(eventTotals[key])}</td>)}<td className="p-3 whitespace-nowrap text-padel-green">{money(eventTotals.balanceOwed - eventTotals.overpaid)}</td></tr></tfoot>
                            </table>
                        </div>
                        {displayedEvents.length === 0 && <p className="text-sm text-gray-400">No events match this filter.</p>}
                        {eventTotals.overpaid > 0 && <p className="text-xs text-amber-300">Amounts owed back to 4M: {money(eventTotals.overpaid)}. These remain separate from balances payable to organisers.</p>}
                        {displayedEvents.some(e => e.settlement.issues.length) && <p className="text-xs text-amber-300">Balances marked Needs review are provisional. Open the event to resolve its receipts before requesting a payout.</p>}
                    </div>

                    {/* Stacked Chart for Entries vs Licenses */}
                    <div className="h-full min-h-[300px] md:col-span-2">
                        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-6">Monthly Revenue Mix ({new Date().getFullYear()})</h4>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `R${v/1000}k`} />
                                <Tooltip
                                    contentStyle={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
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
