import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, DollarSign, CheckCircle, RefreshCcw, ArrowUpRight, Search, Download, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const FinanceManager = () => {
    const [paystackEnabled, setPaystackEnabled] = useState(true);
    const [transactions, setTransactions] = useState([]);
    const [stats, setStats] = useState({ totalRevenue: 'R 0.00', successfulPayouts: 'R 0.00' });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // 'all', 'full', 'temp'
    const [searchQuery, setSearchQuery] = useState('');



    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 8;

    // Filter Transactions
    const filteredTransactions = transactions.filter(trx => {
        // License Type Filter
        const matchesLicense = filter === 'all' || 
            (filter === 'full' && parseFloat(trx.amount.replace('R ', '').replace(',', '')) >= 450) ||
            (filter === 'temp' && parseFloat(trx.amount.replace('R ', '').replace(',', '')) === 120);

        // Search Filter
        const matchesSearch = !searchQuery || 
            trx.user.toLowerCase().includes(searchQuery.toLowerCase()) || 
            trx.id.toLowerCase().includes(searchQuery.toLowerCase());

        return matchesLicense && matchesSearch;
    });


    // Calculate Pagination
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentTransactions = filteredTransactions.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);


    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    const fetchTransactions = async () => {
        try {
            setLoading(true);

            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

            const res = await fetch(`${supabaseUrl}/functions/v1/paystack-transactions`, {
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
            console.error('Error fetching transactions from Edge Function:', error);
            setTransactions([]);
            alert('Error fetching transactions: ' + (error.message || 'Check console'));
        } finally {
            setLoading(false);
        }
    };


    useEffect(() => {
        if (paystackEnabled) {
            fetchTransactions();
        } else {
            setTransactions([]);
        }
    }, [paystackEnabled]);

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-white">Finance & Payments</h2>
                    <p className="text-gray-400">Manage integrations and view transaction history</p>
                </div>
            </div>

            {/* Integration Status Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-[#1E293B] to-[#0F172A] p-8 rounded-3xl border border-white/10 relative overflow-hidden"
                >
                    <div className="absolute top-4 right-4 bg-green-500/10 text-green-400 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" /> Live
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center p-3">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/0/0b/Paystack_Logo.png" alt="Paystack" className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white">Paystack Integration</h3>
                            <p className="text-gray-400 text-sm">Valid Credentials Detected</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center py-3 border-b border-white/5">
                            <span className="text-gray-400">Status</span>
                            <div
                                className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${paystackEnabled ? 'bg-padel-green' : 'bg-gray-600'}`}
                                onClick={() => setPaystackEnabled(!paystackEnabled)}
                            >
                                <div className={`w-4 h-4 bg-black rounded-full shadow-md transform transition-transform ${paystackEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                            </div>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-white/5">
                            <span className="text-gray-400">Public Key</span>
                            <span className="font-mono text-white bg-black/30 px-2 py-1 rounded">pk_live_********7231</span>
                        </div>
                        <div className="flex justify-between items-center py-3">
                            <span className="text-gray-400">Secret Key</span>
                            <span className="font-mono text-white bg-black/30 px-2 py-1 rounded text-green-400">Secured in Edge Function</span>
                        </div>
                    </div>
                </motion.div>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 gap-6">
                    <div className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 flex items-center justify-between">
                        <div>
                            <p className="text-gray-400 text-sm mb-1">Total Revenue</p>
                            <h3 className="text-3xl font-bold text-white">{loading ? <Loader2 className="w-6 h-6 animate-spin text-gray-500" /> : stats.totalRevenue}</h3>
                        </div>
                        <div className="w-12 h-12 bg-padel-green/20 text-padel-green rounded-xl flex items-center justify-center">
                            <ArrowUpRight size={24} />
                        </div>
                    </div>
                    <div className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 flex items-center justify-between">
                        <div>
                            <p className="text-gray-400 text-sm mb-1">Successful Payouts</p>
                            <h3 className="text-3xl font-bold text-white">{loading ? <Loader2 className="w-6 h-6 animate-spin text-gray-500" /> : stats.successfulPayouts}</h3>
                            <p className="text-xs text-gray-500 mt-1">From connected Paystack</p>
                        </div>
                        <div className="w-12 h-12 bg-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center">
                            <DollarSign size={24} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-[#1E293B]/50 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden">
                <div className="p-6 border-b border-white/10 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                    <div className="flex-1 w-full">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <h3 className="text-lg font-bold text-white">Recent Transactions</h3>
                            
                            {/* Search Input */}
                            <div className="relative w-full md:w-80">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search by user email or ID..."
                                    value={searchQuery}
                                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                    className="w-full bg-black/20 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-padel-green/50 placeholder:text-gray-600"
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-4">
                            <button
                                onClick={() => { setFilter('all'); setCurrentPage(1); }}
                                className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${filter === 'all' ? 'bg-padel-green text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                            >
                                All Transactions
                            </button>
                            <button
                                onClick={() => { setFilter('full'); setCurrentPage(1); }}
                                className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${filter === 'full' ? 'bg-padel-green text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                            >
                                Full Licenses (R450)
                            </button>
                            <button
                                onClick={() => { setFilter('temp'); setCurrentPage(1); }}
                                className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${filter === 'temp' ? 'bg-padel-green text-black' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
                            >
                                Temp Licenses (R120)
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                        <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-white">
                            <Download size={16} /> Export CSV
                        </button>
                    </div>
                </div>



                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-black/20 text-gray-400 text-sm uppercase">
                            <tr>
                                <th className="px-6 py-4">Transaction ID</th>
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Date</th>
                                <th className="px-6 py-4">Amount</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                                        Loading live transactions...
                                    </td>
                                </tr>
                            ) : currentTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center text-gray-500">
                                        No recent transactions found.
                                    </td>
                                </tr>
                            ) : currentTransactions.map(trx => (
                                <tr key={trx.id} className="hover:bg-white/5 transition-colors text-sm">
                                    <td className="px-6 py-4 font-mono text-gray-400 min-w-[200px]">{trx.id}</td>
                                    <td className="px-6 py-4 font-medium text-white">{trx.user}</td>
                                    <td className="px-6 py-4 text-gray-300">{trx.type || 'Payment'}</td>
                                    <td className="px-6 py-4 text-gray-400">{trx.date}</td>
                                    <td className="px-6 py-4 font-bold text-white">{trx.amount}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${trx.status === 'Success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                            trx.status === 'Pending' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                                'bg-red-500/20 text-red-400 border border-red-500/30'
                                            }`}>
                                            {trx.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="text-gray-400 hover:text-white"><ArrowUpRight size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="p-4 border-t border-white/10 flex justify-between items-center text-sm">
                    <span className="text-gray-400">
                        Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredTransactions.length)} of {filteredTransactions.length} transactions
                    </span>

                    <div className="flex gap-2">
                        <button
                            onClick={() => paginate(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1 bg-white/10 rounded text-white disabled:opacity-50 hover:bg-white/20 transition-colors"
                        >
                            Previous
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => (
                            <button
                                key={i + 1}
                                onClick={() => paginate(i + 1)}
                                className={`px-3 py-1 rounded transition-colors ${currentPage === i + 1 ? 'bg-padel-green text-black font-bold' : 'bg-white/10 text-white hover:bg-white/20'
                                    }`}
                            >
                                {i + 1}
                            </button>
                        ))}
                        <button
                            onClick={() => paginate(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 bg-white/10 rounded text-white disabled:opacity-50 hover:bg-white/20 transition-colors"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinanceManager;
