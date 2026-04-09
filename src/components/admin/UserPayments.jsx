import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
    Search, Download, User, CreditCard, 
    Calendar, CheckCircle, Clock, ChevronRight,
    ArrowUpDown, Filter, Loader2, Trash2
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';

const UserPayments = ({ allowedEvents = [] }) => {
    const isRestricted = allowedEvents.length > 0;
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

    useEffect(() => {
        const fetchPlayerData = async () => {
            setLoading(true);
            try {
                // Fetch players with their payments
                let query = supabase
                    .from('players')
                    .select('*, payments(*, calendar(event_name))');

                const { data, error } = await query;
                
                if (error) throw error;
                
                // Process data to calculate summary stats per player
                const processed = (data || []).map(p => {
                    let playerPayments = p.payments || [];
                    
                    if (isRestricted) {
                        playerPayments = playerPayments.filter(pay => allowedEvents.includes(pay.event_id));
                    }

                    if (playerPayments.length === 0 && isRestricted) return null;

                    const totalPaid = playerPayments.reduce((acc, curr) => acc + Number(curr.amount), 0);
                    
                    // Sort payments by the actual payment date
                    const sortedPayments = playerPayments.sort((a, b) => {
                        const dateA = new Date(a.metadata?.original_trx?.rawDate || a.created_at);
                        const dateB = new Date(b.metadata?.original_trx?.rawDate || b.created_at);
                        return dateB - dateA;
                    });

                    const lastPayment = sortedPayments[0];
                    const effectiveDate = lastPayment ? (lastPayment.metadata?.original_trx?.date || new Date(lastPayment.created_at).toLocaleDateString()) : 'N/A';

                    return {
                        ...p,
                        totalPaid,
                        lastPaymentDate: effectiveDate,
                        payments: sortedPayments
                    };
                }).filter(Boolean);
                setPlayers(processed);
            } catch (err) {
                console.error("Fetch error:", err);
                toast.error("Failed to load player payment data");
            } finally {
                setLoading(false);
            }
        };
        fetchPlayerData();
    }, []);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedPlayers = useMemo(() => {
        let sortableData = [...players];
        if (searchQuery) {
            sortableData = sortableData.filter(p => 
                p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.email?.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }
        
        sortableData.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sortableData;
    }, [players, sortConfig, searchQuery]);

    // Helper: wrap a value in double-quotes and escape any inner quotes
    const csvEscape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const handleExportGlobalSummary = () => {
        const headers = ['Player Name', 'Email', 'License Type', 'Paid Registration', 'Total Revenue (R)', 'Last Payment Date'];
        const csvData = players.map(p => [
            p.name,
            p.email,
            p.license_type || 'None',
            p.paid_registration ? 'Yes' : 'No',
            p.totalPaid,
            p.lastPaymentDate
        ]);

        const csvContent = [headers, ...csvData].map(row => row.map(csvEscape).join(",")).join("\n");
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "4MPadel_Global_Player_Payments.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Global report exported successfully!");
    };

    const handleExportDetailedLedger = async () => {
        toast.promise(async () => {
            let query = supabase
                .from('payments')
                .select('*, players(name, email), calendar(event_name)')
                .order('created_at', { ascending: false });
            
            if (isRestricted) {
                query = query.in('event_id', allowedEvents);
            }

            const { data, error } = await query;

            if (error) throw error;

            const headers = ['Date', 'Player', 'Email', 'Type', 'Event', 'Amount', 'Method', 'Reference', 'Status'];
            const csvData = data.map(p => [
                new Date(p.created_at).toLocaleString('en-ZA'),
                p.players?.name || 'N/A',
                p.players?.email || 'N/A',
                p.payment_type?.replace(/_/g, ' ') || 'N/A',
                p.calendar?.event_name || p.metadata?.event_name || 'N/A',
                p.amount,
                p.payment_method || 'N/A',
                p.reference || 'N/A',
                p.status
            ]);

            const csvEsc = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
            const csvContent = [headers, ...csvData].map(row => row.map(csvEsc).join(",")).join("\n");
            // Add BOM so Excel auto-detects UTF-8
            const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `4MPadel_Detailed_Finance_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, {
            loading: 'Generating detailed ledger...',
            success: 'Detailed ledger exported successfully!',
            error: 'Failed to generate report'
        });
    };

    const handleDeletePayment = async (paymentId) => {
        if (!confirm("Are you sure you want to permanently delete this payment record from the ledger? This action cannot be undone.")) return;
        
        try {
            const { error } = await supabase
                .from('payments')
                .delete()
                .eq('id', paymentId);
            
            if (error) throw error;
            
            toast.success("Payment record deleted");
            
            // Update local state
            setPlayers(prev => prev.map(p => {
                if (p.id === selectedPlayer.id) {
                    const updatedPayments = p.payments.filter(pay => pay.id !== paymentId);
                    const totalPaid = updatedPayments.reduce((acc, curr) => acc + Number(curr.amount), 0);
                    
                    // Recalculate last payment date
                    const lastPayment = updatedPayments[0]; // Already sorted by date in initial fetch
                    const lastPaymentDate = lastPayment 
                        ? (lastPayment.metadata?.original_trx?.date || new Date(lastPayment.created_at).toLocaleDateString()) 
                        : 'N/A';

                    return { ...p, payments: updatedPayments, totalPaid, lastPaymentDate };
                }
                return p;
            }));

            // Sync the selected player state too
            setSelectedPlayer(prev => {
                const updatedPayments = prev.payments.filter(pay => pay.id !== paymentId);
                const totalPaid = updatedPayments.reduce((acc, curr) => acc + Number(curr.amount), 0);
                const lastPayment = updatedPayments[0];
                const lastPaymentDate = lastPayment 
                    ? (lastPayment.metadata?.original_trx?.date || new Date(lastPayment.created_at).toLocaleDateString()) 
                    : 'N/A';

                return {
                    ...prev,
                    payments: updatedPayments,
                    totalPaid,
                    lastPaymentDate
                };
            });

        } catch (err) {
            console.error("Delete error:", err);
            toast.error("Failed to delete record");
        }
    };

    return (
        <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-3xl border border-white/10">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input
                        type="text"
                        placeholder="Search players or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 text-white focus:outline-none focus:border-padel-green transition-all"
                    />
                </div>
                <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                    <button
                        onClick={handleExportDetailedLedger}
                        className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white px-6 py-3 rounded-xl font-bold hover:bg-white/10 transition-all w-full md:w-auto"
                    >
                        <Download size={18} /> Detailed Ledger
                    </button>
                    <button
                        onClick={handleExportGlobalSummary}
                        className="flex items-center justify-center gap-2 bg-padel-green text-black px-6 py-3 rounded-xl font-bold hover:scale-105 transition-all shadow-lg shadow-padel-green/20 w-full md:w-auto"
                    >
                        <Download size={18} /> Player Summary
                    </button>
                </div>
            </div>

            {/* Players Ledger Table */}
            <div className="bg-[#1E293B]/50 backdrop-blur-md rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-black/20 text-gray-400 text-[10px] uppercase font-black tracking-[0.2em]">
                            <tr>
                                <th className="px-8 py-6 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('name')}>
                                    <div className="flex items-center gap-2">Player <ArrowUpDown size={12} /></div>
                                </th>
                                <th className="px-8 py-6">License Status</th>
                                <th className="px-8 py-6 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('totalPaid')}>
                                    <div className="flex items-center gap-2">Total Paid (R) <ArrowUpDown size={12} /></div>
                                </th>
                                <th className="px-8 py-6">Last Transaction</th>
                                <th className="px-8 py-6 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-8 py-20 text-center">
                                        <Loader2 className="w-10 h-10 animate-spin mx-auto text-padel-green" />
                                        <p className="mt-4 text-gray-400 font-bold uppercase tracking-widest text-xs">Loading ledger...</p>
                                    </td>
                                </tr>
                            ) : sortedPlayers.map(p => (
                                <tr key={p.id} className="group hover:bg-white/5 transition-all">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-padel-green font-black text-xl group-hover:bg-padel-green group-hover:text-black transition-all">
                                                {p.name?.[0]}
                                            </div>
                                            <div>
                                                <p className="text-white font-bold group-hover:text-padel-green">{p.name}</p>
                                                <p className="text-gray-500 text-xs">{p.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <div className="flex flex-col gap-1">
                                            <span className={`text-[10px] font-black uppercase inline-flex items-center gap-1 ${p.paid_registration ? 'text-padel-green' : 'text-gray-500'}`}>
                                                {p.paid_registration ? <CheckCircle size={10} /> : <Clock size={10} />}
                                                {p.license_type || 'NONE'}
                                            </span>
                                            {p.paid_registration && <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest italic">Registered Holder</span>}
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <p className="text-xl font-black text-white">R{p.totalPaid.toLocaleString()}</p>
                                    </td>
                                    <td className="px-8 py-5 text-gray-400 font-mono text-sm">
                                        {p.lastPaymentDate}
                                    </td>
                                    <td className="px-8 py-5 text-right">
                                        <button 
                                            onClick={() => setSelectedPlayer(p)}
                                            className="p-3 rounded-2xl bg-white/5 hover:bg-padel-green hover:text-black text-gray-400 transition-all"
                                        >
                                            <ChevronRight size={20} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Player Detail Slideover/Modal (Simple version) */}
            {selectedPlayer && (
                <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
                        onClick={() => setSelectedPlayer(null)}
                    />
                    <motion.div 
                        initial={{ x: '100%' }} animate={{ x: 0 }}
                        className="bg-[#0F172A] w-full max-w-lg h-full p-10 pointer-events-auto border-l border-white/10 relative overflow-y-auto no-scrollbar"
                    >
                        <div className="flex justify-between items-start mb-10">
                            <div className="w-20 h-20 rounded-3xl bg-padel-green text-black font-black text-4xl flex items-center justify-center shadow-2xl shadow-padel-green/30">
                                {selectedPlayer.name?.[0]}
                            </div>
                            <button onClick={() => setSelectedPlayer(null)} className="text-gray-500 hover:text-white">Close</button>
                        </div>
                        
                        <h2 className="text-3xl font-black text-white mb-2">{selectedPlayer.name}</h2>
                        <p className="text-gray-400 mb-8">{selectedPlayer.email}</p>

                        <div className="grid grid-cols-2 gap-4 mb-12">
                            <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                                <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Total Contribution</p>
                                <p className="text-2xl font-black text-white">R{selectedPlayer.totalPaid}</p>
                            </div>
                            <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                                <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">License</p>
                                <p className="text-2xl font-black text-padel-green">{selectedPlayer.license_type || 'None'}</p>
                            </div>
                        </div>

                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-[0.3em] mb-6 border-b border-white/5 pb-4">Transaction History</h3>
                        
                        <div className="space-y-4">
                            {selectedPlayer.payments?.length > 0 ? (
                                selectedPlayer.payments.map(pay => {
                                    const effectiveDate = pay.metadata?.original_trx?.date || new Date(pay.created_at).toLocaleDateString();
                                    return (
                                        <div key={pay.id} className="bg-white/5 p-5 rounded-2xl border border-white/5 flex justify-between items-center group hover:border-padel-green/30 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-gray-500 group-hover:text-padel-green shadow-inner">
                                                    <CreditCard size={18} />
                                                </div>
                                                <div>
                                                    <div className="flex flex-col">
                                                        <p className="text-white font-bold text-sm tracking-tight capitalize leading-none mb-1">
                                                            {pay.payment_type?.replace(/_/g, ' ')}
                                                        </p>
                                                        {(pay.calendar?.event_name || pay.metadata?.event_name) && (
                                                            <p className="text-padel-green text-[10px] font-black uppercase tracking-wider leading-none">
                                                                {pay.calendar?.event_name || pay.metadata?.event_name}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <p className="text-gray-500 text-[10px] uppercase font-bold mt-2">{effectiveDate}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-6">
                                                <div className="text-right">
                                                    <p className="text-white font-black text-sm">R{pay.amount}</p>
                                                    <p className="text-[9px] text-padel-green font-black uppercase tracking-widest leading-none mt-1">{pay.payment_method}</p>
                                                </div>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeletePayment(pay.id);
                                                    }}
                                                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                    title="Delete record from ledger"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-10 opacity-30 italic">No transactions found</div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default UserPayments;
