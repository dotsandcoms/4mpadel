import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import AdminSidebar from '../components/admin/AdminSidebar';
import DashboardHome from '../components/admin/DashboardHome';
import PlayerManager from '../components/admin/PlayerManager';
import TournamentManager from '../components/admin/TournamentManager';
import BlogManager from '../components/admin/BlogManager';
import CalendarManager from '../components/admin/CalendarManager';
import FinanceManager from '../components/admin/FinanceManager';
import SettingsManager from '../components/admin/SettingsManager';
import { motion, AnimatePresence } from 'framer-motion';

const Admin = () => {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginLoading(true);
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) alert(error.message);
        setLoginLoading(false);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;

    if (!session) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center px-4 relative overflow-hidden">
                {/* Background Elements */}
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1554068865-24cecd4e34b8?q=80&w=2670&auto=format&fit=crop')] bg-cover bg-center opacity-20" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-md w-full bg-[#0F172A]/80 backdrop-blur-xl p-8 rounded-3xl border border-white/10 relative z-10 shadow-2xl shadow-padel-green/10"
                >
                    <div className="text-center mb-8">
                        <h2 className="text-4xl font-bold text-white mb-2">Admin Access</h2>
                        <p className="text-gray-400">Enter your credentials to continue</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-gray-400 text-sm mb-2 font-medium">Email Address</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all"
                                placeholder="admin@4mpadel.co.za"
                            />
                        </div>
                        <div>
                            <label className="block text-gray-400 text-sm mb-2 font-medium">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all"
                                placeholder="••••••••"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loginLoading}
                            className="w-full bg-padel-green text-black font-bold py-4 rounded-xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 mt-4 shadow-lg shadow-padel-green/20"
                        >
                            {loginLoading ? 'Authenticating...' : 'Sign In to Dashboard'}
                        </button>
                    </form>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white flex">
            <AdminSidebar activeTab={activeTab} setActiveTab={setActiveTab} onLogout={handleLogout} />

            <main className="flex-1 ml-64 p-8 lg:p-12 overflow-y-auto h-screen bg-gradient-to-br from-black to-[#0F172A]">
                <div className="max-w-7xl mx-auto">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            {activeTab === 'dashboard' && <DashboardHome />}
                            {activeTab === 'players' && <PlayerManager />}
                            {activeTab === 'tournaments' && <TournamentManager />}
                            {activeTab === 'blog' && <BlogManager />}
                            {activeTab === 'calendar' && <CalendarManager />}
                            {activeTab === 'finance' && <FinanceManager />}
                            {activeTab === 'settings' && <SettingsManager />}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

export default Admin;
