import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import AdminSidebar from '../components/admin/AdminSidebar';
import DashboardHome from '../components/admin/DashboardHome';
import PlayerManager from '../components/admin/PlayerManager';
import BlogManager from '../components/admin/BlogManager';
import CalendarManager from '../components/admin/CalendarManager';
import GalleryManager from '../components/admin/GalleryManager';
import FinanceManager from '../components/admin/FinanceManager';
import CoachManager from '../components/admin/CoachManager';
import SettingsManager from '../components/admin/SettingsManager';
import AdminManager from '../components/admin/AdminManager';
import EventManagement from '../components/admin/EventManagement';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Menu, ShieldAlert, ExternalLink, Home } from 'lucide-react';

const Admin = () => {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const { permissions, loading: permissionsLoading, hasPermission } = useAdminPermissions(session?.user?.email);

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
        window.location.href = '/';
    };

    useEffect(() => {
        if (!permissionsLoading && !hasPermission(activeTab)) {
            setActiveTab('dashboard');
        }
    }, [activeTab, permissions, permissionsLoading]);

    if (loading || (session && permissionsLoading)) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>;

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
        <div className="min-h-screen bg-black text-white flex flex-col lg:flex-row">
            {/* Impersonation Banner */}
            {sessionStorage.getItem('admin_test_login_email') && (
                <div className="fixed top-0 left-0 right-0 z-[1000] bg-amber-500 text-black py-2 px-4 text-center text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-4 shadow-xl">
                    <span>Testing Mode: Impersonating {sessionStorage.getItem('admin_test_login_email')}</span>
                    <button
                        onClick={() => {
                            sessionStorage.removeItem('admin_test_login_email');
                            window.location.href = '/admin';
                        }}
                        className="bg-black text-white px-3 py-1 rounded-full hover:bg-white hover:text-black transition-colors"
                    >
                        Exit & Return to Admin
                    </button>
                </div>
            )}

            {/* Mobile Header */}
            <header className="lg:hidden bg-black border-b border-white/10 p-4 sticky top-0 z-[50] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">4M Admin</span>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href="/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-padel-green hover:bg-padel-green/10 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                        <Home size={18} />
                        <span className="hidden xs:inline">Live Site</span>
                    </a>
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 text-gray-400 hover:text-white"
                    >
                        <Menu size={24} />
                    </button>
                </div>
            </header>

            <AdminSidebar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onLogout={handleLogout}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                permissions={permissions}
            />

            <main className="flex-1 lg:ml-64 p-4 md:p-8 lg:p-12 overflow-y-auto min-h-screen lg:h-screen bg-gradient-to-br from-black to-[#0F172A]">
                <div className="max-w-7xl mx-auto">
                    {/* Desktop Header Actions */}
                    <div className="hidden lg:flex justify-end mb-8">
                        <a
                            href="/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all group"
                        >
                            <Home className="w-5 h-5 text-padel-green group-hover:scale-110 transition-transform" />
                            <span className="text-sm font-medium text-white">View live Site</span>
                        </a>
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.3 }}
                        >
                            {!hasPermission(activeTab) ? (
                                <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                                    <ShieldAlert className="w-16 h-16 text-red-500 mb-4 opacity-50" />
                                    <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
                                    <p className="text-gray-400">You don't have permission to view this module.</p>
                                </div>
                            ) : (
                                <>
                                    {activeTab === 'dashboard' && <DashboardHome onTabChange={setActiveTab} />}
                                    {activeTab === 'players' && <PlayerManager />}
                                    {activeTab === 'blog' && <BlogManager />}
                                    {activeTab === 'calendar' && <CalendarManager />}
                                    {activeTab === 'event-mgmt' && <EventManagement allowedEvents={permissions?.module_permissions?.['event-mgmt']?.allowedEvents || []} />}
                                    {activeTab === 'gallery' && (
                                        <GalleryManager />
                                    )}
                                    {activeTab === 'coaches' && (
                                        <CoachManager />
                                    )}
                                    {activeTab === 'finance' && (
                                        <FinanceManager />
                                    )}
                                    {activeTab === 'admin-mgmt' && (
                                        <AdminManager />
                                    )}
                                    {activeTab === 'settings' && <SettingsManager />}
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

export default Admin;
