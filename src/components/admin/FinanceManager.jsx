import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    CreditCard, DollarSign, CheckCircle, RefreshCcw, 
    ArrowUpRight, Search, Download, Loader2, 
    LayoutDashboard, Users, Trophy, Settings, FileText
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import FinancialDashboard from './FinancialDashboard';
import UserPayments from './UserPayments';
import EventFinance from './EventFinance';
import FinancialSummaryReport from './FinancialSummaryReport';
import { useAdminPermissions } from '../../hooks/useAdminPermissions';

const FinanceManager = () => {
    const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'users', 'events', 'transactions', 'summary'
    const [paystackEnabled, setPaystackEnabled] = useState(true);
    const [transactions, setTransactions] = useState([]);
    const [stats, setStats] = useState({ totalRevenue: 'R 0.00', successfulPayouts: 'R 0.00' });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [players, setPlayers] = useState([]);
    const [syncingId, setSyncingId] = useState(null);
    const [recordedRefs, setRecordedRefs] = useState(new Set());
    const [bulkSyncing, setBulkSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [syncPeriod, setSyncPeriod] = useState('30d'); // '30d', 'feb', '90d'

    // Permissions logic
    const [userEmail, setUserEmail] = useState(null);
    const { permissions, loading: permissionsLoading } = useAdminPermissions(userEmail);

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUserEmail(user?.email);
        };
        getUser();
    }, []);

    const financePerms = permissions?.module_permissions?.finance;
    
    // SAFE FALLBACK: If granular perms exist but we haven't specified tabs, 
    // default to showing everything BUT the Dashboard and Settings (protects totals).
    const defaultRestrictedTabs = ['summary', 'users', 'events', 'transactions'];
    const defaultFullTabs = ['dashboard', 'summary', 'users', 'events', 'transactions', 'settings'];

    const allowedTabs = financePerms 
        ? (financePerms.allowedTabs || ['events']) 
        : defaultFullTabs;
        
    const allowedEvents = financePerms?.allowedEvents || [];

    // Safety redirect if current tab is not allowed
    useEffect(() => {
        if (!permissionsLoading && permissions && permissions.role !== 'super_admin') {
            // Find first available tab if current one is banned
            if (!allowedTabs.includes(activeTab)) {
                // If dashboard is banned and currently active, jump to the first permitted item
                const firstAvailable = allowedTabs[0] || '';
                if (firstAvailable) {
                    setActiveTab(firstAvailable);
                }
            }
        }
    }, [activeTab, allowedTabs, permissions, permissionsLoading]);

    const fetchPayments = useCallback(async () => {
        const { data, error } = await supabase.from('payments').select('reference');
        if (!error && data) {
            setRecordedRefs(new Set(data.map(p => p.reference)));
        }
    }, []);

    const fetchPlayers = useCallback(async () => {
        const { data, error } = await supabase
            .from('players')
            .select('id, name, email, paid_registration, license_type');
        if (!error) setPlayers(data);
    }, []);

    const fetchTransactions = useCallback(async () => {
        try {
            setLoading(true);
            await Promise.all([fetchPlayers(), fetchPayments()]);

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

            // Date filtering logic
            let from = null;
            let to = null;
            const now = new Date();

            if (syncPeriod === '30d') {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(now.getDate() - 30);
                from = thirtyDaysAgo.toISOString().split('T')[0];
            } else if (syncPeriod === 'feb') {
                from = '2026-02-01';
                to = '2026-02-28';
            } else if (syncPeriod === 'march') {
                from = '2026-03-01';
                to = '2026-03-31';
            } else if (syncPeriod === '90d') {
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(now.getDate() - 90);
                from = ninetyDaysAgo.toISOString().split('T')[0];
            }

            let url = `${supabaseUrl}/functions/v1/paystack-transactions`;
            const params = new URLSearchParams();
            if (from) params.append('from', from);
            if (to) params.append('to', to);
            if (params.toString()) url += `?${params.toString()}`;

            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                }
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`Status ${res.status}: ${text}`);
            }

            const data = await res.json();
            if (data && data.transactions) {
                setTransactions(data.transactions);
                setStats(data.stats);
            }
        } catch (error) {
            console.error('Error fetching transactions:', error);
            setTransactions([]);
        } finally {
            setLoading(false);
        }
    }, [fetchPlayers, fetchPayments]);

    useEffect(() => {
        if (paystackEnabled) {
            fetchTransactions();
        }
    }, [paystackEnabled, fetchTransactions, syncPeriod]);

    const handleSyncPlayer = async (trx) => {
        try {
            setSyncingId(trx.id);
            const email = trx.user.toLowerCase();
            const amount = parseFloat(trx.amount.replace('R ', '').replace(',', ''));
            const licenseType = amount >= 450 ? 'full' : 'temporary';

            const { data: player, error: fetchError } = await supabase
                .from('players')
                .select('id, name')
                .ilike('email', email)
                .maybeSingle();

            if (fetchError) throw fetchError;
            if (!player) throw new Error(`Player with email ${email} not found.`);

            const { error: updateError } = await supabase
                .from('players')
                .update({ 
                    paid_registration: true, 
                    license_type: licenseType,
                    approved: true 
                })
                .eq('id', player.id);

            if (updateError) throw updateError;
            
            // If it's a temporary license and event_id is missing, try to find it in the temporary_licenses lookup
            let enrichedEventId = trx.metadata?.event_id || null;
            let enrichedEventName = trx.metadata?.event_name || null;

            if (licenseType === 'temporary' && !enrichedEventId) {
                const { data: tempLic } = await supabase
                    .from('temporary_licenses')
                    .select('event_id, event_name')
                    .eq('player_id', player.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                
                if (tempLic) {
                    enrichedEventId = tempLic.event_id;
                    enrichedEventName = tempLic.event_name;
                }
            }

            // Also record in our NEW payments table for future history
            await supabase.from('payments').insert([{
                player_id: player.id,
                event_id: enrichedEventId,
                amount: amount,
                status: 'success',
                payment_type: licenseType === 'full' ? 'membership' : 'temp_license',
                reference: trx.id,
                created_at: trx.rawDate,
                metadata: { 
                    source: 'paystack_sync', 
                    original_trx: trx,
                    event_name: enrichedEventName
                }
            }]);

            // CRITICAL: Ensure temporary license record exists to prevent scavenger cleanup
            if (licenseType === 'temporary' && enrichedEventId) {
                const { data: existingTempLic } = await supabase
                    .from('temporary_licenses')
                    .select('id')
                    .eq('player_id', player.id)
                    .eq('event_id', enrichedEventId)
                    .maybeSingle();
                
                if (!existingTempLic) {
                    const { data: eventData } = await supabase
                        .from('calendar')
                        .select('start_date, end_date')
                        .eq('id', enrichedEventId)
                        .maybeSingle();

                    await supabase.from('temporary_licenses').insert({
                        player_id: player.id,
                        event_id: enrichedEventId,
                        event_name: enrichedEventName || 'Calendar Event',
                        event_date: eventData?.end_date || eventData?.start_date || new Date().toISOString()
                    });
                }
            }

            await fetchTransactions();
        } catch (err) {
            console.error("Sync error:", err);
            alert("Sync failed: " + err.message);
        } finally {
            setSyncingId(null);
        }
    };

    const handleBulkSync = async () => {
        const toSync = transactions.filter(trx => 
            trx.status === 'Success' && 
            !recordedRefs.has(trx.id) &&
            players.some(p => p.email?.toLowerCase() === trx.user?.toLowerCase())
        );

        if (toSync.length === 0) {
            alert("No missing transactions found for existing profiles.");
            return;
        }

        if (!confirm(`Found ${toSync.length} missing transactions. Proceed with bulk sync?`)) return;

        setBulkSyncing(true);
        setSyncProgress({ current: 0, total: toSync.length });

        for (let i = 0; i < toSync.length; i++) {
            setSyncProgress({ current: i + 1, total: toSync.length });
            try {
                await handleSyncPlayer(toSync[i]);
            } catch (err) {
                console.error("Bulk sync error for ID:", toSync[i].id, err);
            }
        }

        setBulkSyncing(false);
        await fetchTransactions();
        alert("Bulk synchronization complete!");
    };

    const filteredTransactions = transactions.filter(trx => {
        const matchesLicense = filter === 'all' || 
            (filter === 'full' && parseFloat(trx.amount.replace('R ', '').replace(',', '')) >= 450) ||
            (filter === 'temp' && parseFloat(trx.amount.replace('R ', '').replace(',', '')) === 120);

        if (filter === 'reconcile') {
            if (trx.status !== 'Success') return false;
            const player = players.find(p => p.email?.toLowerCase() === trx.user?.toLowerCase());
            if (player?.paid_registration) return false;
        }

        const matchesSearch = !searchQuery || 
            trx.user.toLowerCase().includes(searchQuery.toLowerCase()) || 
            trx.id.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesLicense && matchesSearch;
    });

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentTransactions = filteredTransactions.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

    const allTabs = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'summary', label: 'Summary Rep', icon: FileText },
        { id: 'users', label: 'User Ledger', icon: Users },
        { id: 'events', label: 'Event Finance', icon: Trophy },
        { id: 'transactions', label: 'Live Paystack', icon: CreditCard },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    const tabs = permissions?.role === 'super_admin' 
        ? allTabs 
        : allTabs.filter(t => allowedTabs.includes(t.id));

    if (permissionsLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <Loader2 className="w-10 h-10 text-padel-green animate-spin" />
                <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Verifying Permissions...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 pb-2 border-b border-white/5">
                <div>
                    <h2 className="text-4xl font-black text-white tracking-tight">Finance & Revenue</h2>
                    <p className="text-gray-400 mt-2 font-medium">Manage memberships, event entries, and automated tracking</p>
                </div>
                
                {/* Custom Tab Switcher */}
                <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 overflow-x-auto no-scrollbar max-w-full">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                                activeTab === tab.id 
                                ? 'bg-padel-green text-black shadow-lg shadow-padel-green/20' 
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <tab.icon size={18} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {activeTab === 'dashboard' && allowedTabs.includes('dashboard') && <FinancialDashboard allowedEvents={allowedEvents} />}
                    
                    {activeTab === 'summary' && allowedTabs.includes('summary') && <FinancialSummaryReport allowedEvents={allowedEvents} />}

                    {activeTab === 'users' && allowedTabs.includes('users') && <UserPayments allowedEvents={allowedEvents} />}
                    
                    {activeTab === 'events' && allowedTabs.includes('events') && <EventFinance allowedEvents={allowedEvents} />}
                    
                    {activeTab === 'transactions' && (
                        <div className="space-y-6">
                            {/* Original Paystack Transaction View Integrated Here */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-[#1E293B]/50 p-6 rounded-2xl border border-white/10">
                                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Live Revenue</p>
                                    <h3 className="text-3xl font-black text-white mt-1">{stats.totalRevenue}</h3>
                                </div>
                                <div className="bg-[#1E293B]/50 p-6 rounded-2xl border border-white/10">
                                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Payouts</p>
                                    <h3 className="text-3xl font-black text-blue-400 mt-1">{stats.successfulPayouts}</h3>
                                </div>
                                <div className="bg-padel-green text-black p-6 rounded-2xl border border-white/10">
                                    <p className="text-black/60 text-xs font-bold uppercase tracking-widest">Status</p>
                                    <h3 className="text-3xl font-black mt-1">Live ✅</h3>
                                </div>
                            </div>

                            <div className="bg-[#1E293B]/50 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden">
                                <div className="p-6 border-b border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex bg-black/20 p-1 rounded-xl w-fit">
                                            <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-lg text-xs font-bold ${filter === 'all' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>All</button>
                                            <button onClick={() => setFilter('full')} className={`px-4 py-2 rounded-lg text-xs font-bold ${filter === 'full' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>Full</button>
                                            <button onClick={() => setFilter('temp')} className={`px-4 py-2 rounded-lg text-xs font-bold ${filter === 'temp' ? 'bg-white/10 text-white' : 'text-gray-500'}`}>Temp</button>
                                            <button onClick={() => setFilter('reconcile')} className={`px-4 py-2 rounded-lg text-xs font-bold ${filter === 'reconcile' ? 'bg-orange-500/20 text-orange-400' : 'text-gray-500'}`}>Sync Needed</button>
                                        </div>
                                        {filteredTransactions.length > 0 && (
                                            <p className="text-[10px] font-black uppercase text-gray-600 tracking-widest pl-2">
                                                Showing {filteredTransactions.length} total Transactions
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4 bg-black/20 p-1 rounded-xl">
                                        <button onClick={() => setSyncPeriod('30d')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${syncPeriod === '30d' ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-400'}`}>Last 30D</button>
                                        <button onClick={() => setSyncPeriod('feb')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${syncPeriod === 'feb' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-600 hover:text-gray-400'}`}>February</button>
                                        <button onClick={() => setSyncPeriod('march')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${syncPeriod === 'march' ? 'bg-padel-green/20 text-padel-green' : 'text-gray-600 hover:text-gray-400'}`}>March</button>
                                        <button onClick={() => setSyncPeriod('90d')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${syncPeriod === '90d' ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-400'}`}>Last 90D</button>
                                    </div>
                                    <div className="flex flex-col md:flex-row items-center gap-4">
                                        {bulkSyncing ? (
                                            <div className="flex items-center gap-3 bg-padel-green/10 px-4 py-2 rounded-xl border border-padel-green/20">
                                                <div className="w-4 h-4 rounded-full border-2 border-padel-green border-t-transparent animate-spin" />
                                                <span className="text-[10px] font-black text-padel-green uppercase">Syncing {syncProgress.current}/{syncProgress.total}</span>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={handleBulkSync}
                                                className="bg-padel-green text-black text-[10px] font-black py-2 px-4 rounded-xl hover:scale-105 transition-all shadow-lg shadow-padel-green/20"
                                            >
                                                Bulk Sync Missing
                                            </button>
                                        )}
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                                            <input 
                                                type="text" 
                                                placeholder="Search transactions..." 
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="bg-black/30 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-black/20 text-gray-500 text-[10px] uppercase font-black tracking-widest">
                                            <tr>
                                                <th className="px-6 py-4">Ref</th>
                                                <th className="px-6 py-4">User</th>
                                                <th className="px-6 py-4">Date</th>
                                                <th className="px-6 py-4">Amount</th>
                                                <th className="px-6 py-4">Status</th>
                                                <th className="px-6 py-4"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {loading ? (
                                                <tr><td colSpan="6" className="py-20 text-center"><Loader2 className="animate-spin mx-auto text-padel-green" /></td></tr>
                                            ) : currentTransactions.map(trx => (
                                                <tr key={trx.id} className="hover:bg-white/5 text-sm transition-colors">
                                                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{trx.id}</td>
                                                    <td className="px-6 py-4 font-bold text-white">{trx.user}</td>
                                                    <td className="px-6 py-4 text-gray-400">{trx.date}</td>
                                                    <td className="px-6 py-4 font-black">{trx.amount}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-1">
                                                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase inline-block w-fit ${trx.status === 'Success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                                {trx.status}
                                                            </span>
                                                            {trx.domain === 'test' && (
                                                                <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-[8px] font-black uppercase rounded-full w-fit animate-pulse border border-orange-500/20">
                                                                    Test Mode
                                                                </span>
                                                            )}
                                                            {trx.metadata?.event_name && (
                                                                <span className="text-[10px] text-gray-400 font-bold truncate max-w-[150px]" title={trx.metadata.event_name}>
                                                                    {trx.metadata.event_name.length > 20 ? trx.metadata.event_name.substring(0, 17) + '...' : trx.metadata.event_name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {trx.status === 'Success' && (
                                                            (() => {
                                                                const p = players.find(pl => pl.email?.toLowerCase() === trx.user?.toLowerCase());
                                                                const isRecorded = recordedRefs.has(trx.id);
                                                                
                                                                if (!p) return <span className="text-[10px] text-gray-600">No Profile</span>;
                                                                if (isRecorded) return <CheckCircle size={14} className="text-padel-green ml-auto" />;
                                                                
                                                                return (
                                                                    <button 
                                                                        onClick={() => handleSyncPlayer(trx)} 
                                                                        disabled={syncingId === trx.id}
                                                                        className={`${p.paid_registration ? 'bg-blue-600' : 'bg-orange-500'} text-white text-[10px] font-black py-1 px-2 rounded-lg hover:scale-105 transition-all disabled:opacity-50`}
                                                                    >
                                                                        {syncingId === trx.id ? '...' : p.paid_registration ? 'Backfill Entry' : 'Sync Now'}
                                                                    </button>
                                                                );
                                                            })()
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination Controls */}
                                {totalPages > 1 && (
                                    <div className="p-6 border-t border-white/5 flex items-center justify-between">
                                        <p className="text-xs text-gray-500 font-medium">
                                            Showing <span className="text-white font-bold">{indexOfFirstItem + 1}</span> to <span className="text-white font-bold">{Math.min(indexOfLastItem, filteredTransactions.length)}</span> of <span className="text-white font-bold">{filteredTransactions.length}</span>
                                        </p>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                disabled={currentPage === 1}
                                                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-20"
                                            >
                                                Previous
                                            </button>
                                            <div className="flex gap-1">
                                                {[...Array(totalPages)].map((_, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => setCurrentPage(i + 1)}
                                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${currentPage === i+1 ? 'bg-padel-green text-black' : 'hover:bg-white/5 text-gray-500 hover:text-white'}`}
                                                    >
                                                        {i + 1}
                                                    </button>
                                                ))}
                                            </div>
                                            <button 
                                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                disabled={currentPage === totalPages}
                                                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-20"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="bg-[#1E293B]/50 p-8 rounded-3xl border border-white/10 max-w-2xl">
                             <h3 className="text-xl font-bold text-white mb-6">Payment Configurations</h3>
                             <div className="space-y-6">
                                 <div className="flex justify-between items-center bg-black/20 p-4 rounded-xl border border-white/5">
                                     <div>
                                         <p className="text-white font-bold">Paystack Integration</p>
                                         <p className="text-gray-500 text-xs">Live automated tracking enabled</p>
                                     </div>
                                     <div 
                                        className={`w-12 h-6 rounded-full p-1 cursor-pointer ${paystackEnabled ? 'bg-padel-green' : 'bg-gray-600'}`}
                                        onClick={() => setPaystackEnabled(!paystackEnabled)}
                                    >
                                        <div className={`w-4 h-4 bg-black rounded-full transition-all ${paystackEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </div>
                                 </div>
                                 <div className="p-4 bg-orange-500/10 rounded-xl border border-orange-500/20">
                                     <div className="flex gap-3">
                                         <RefreshCcw className="text-orange-400 shrink-0" size={20} />
                                         <div>
                                             <p className="text-orange-400 font-bold text-sm">Cache Reconciliation</p>
                                             <p className="text-orange-400/70 text-xs mt-1">
                                                 The system will automatically attempt to match transaction emails with player profiles. 
                                                 Manual sync is only required for legacy data or mismatched emails.
                                             </p>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default FinanceManager;
