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
import EmailBroadcastManager from '../components/admin/EmailBroadcastManager';
import { useAdminPermissions } from '../hooks/useAdminPermissions';
import { useAdminFeedNotifications } from '../hooks/useAdminFeedNotifications';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Menu, ShieldAlert, ExternalLink, Home, Bell, MapPin, DollarSign, UserPlus, CalendarPlus } from 'lucide-react';

const Admin = () => {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginLoading, setLoginLoading] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
    const [player, setPlayer] = useState(null);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

    const targetEmail = sessionStorage.getItem('admin_test_login_email') || session?.user?.email;
    const { permissions, loading: permissionsLoading, hasPermission } = useAdminPermissions(targetEmail);
    const { notifications } = useAdminFeedNotifications();

    useEffect(() => {
        supabase.auth.getSession()
            .then(({ data: { session } }) => {
                setSession(session);
            })
            .catch((err) => {
                console.warn('getSession failed:', err);
            })
            .finally(() => {
                setLoading(false);
            });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setLoading(false);
        });

        // Safety net: never leave the admin stuck on the loading screen.
        const safety = setTimeout(() => setLoading(false), 5000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(safety);
        };
    }, []);

    useEffect(() => {
        const fetchPlayerData = async () => {
            if (!targetEmail) {
                setPlayer(null);
                return;
            }

            const { data } = await supabase
                .from('players')
                .select('id, name, email, rankedin_id, image_url')
                .ilike('email', targetEmail)
                .maybeSingle();

            setPlayer(data);
        };

        fetchPlayerData();
    }, [targetEmail]);

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
        if (!permissionsLoading && permissions && !hasPermission(activeTab)) {
            const allTabs = ['dashboard', 'players', 'coaches', 'calendar', 'event-mgmt', 'gallery', 'email-broadcast', 'finance', 'blog', 'settings', 'admin-mgmt'];
            const firstAllowed = allTabs.find(tab => hasPermission(tab));
            if (firstAllowed) {
                setActiveTab(firstAllowed);
            }
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
                <div className="fixed top-0 left-0 right-0 z-[1000] w-full bg-amber-500/10 backdrop-blur-md border-b border-amber-500/20 py-2.5 px-4 text-center text-[10px] md:text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-3 md:gap-4 shadow-[0_4px_20px_rgba(245,158,11,0.05)] text-amber-400">
                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" />
                    <span>Testing Mode: Impersonating <span className="text-white font-extrabold">{sessionStorage.getItem('admin_test_login_email')}</span></span>
                    <button
                        onClick={() => {
                            sessionStorage.removeItem('admin_test_login_email');
                            window.location.href = '/admin';
                        }}
                        className="bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500 hover:text-black px-3.5 py-1 rounded-full text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all duration-300 hover:scale-105 active:scale-95 shadow-md cursor-pointer shrink-0"
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
                    {/* Mobile Notifications Bell */}
                    {session && permissions?.role === 'super_admin' && (
                        <div className="relative">
                            <button
                                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                                className="p-2 text-gray-400 hover:text-white rounded-full transition-colors relative"
                            >
                                <motion.div
                                    animate={notifications.length > 0 ? { rotate: [0, -15, 15, -15, 15, 0] } : {}}
                                    transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 3 }}
                                >
                                    <Bell size={20} />
                                </motion.div>
                                {notifications.length > 0 && (
                                    <span className="absolute top-1 right-1 flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-padel-green opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-padel-green"></span>
                                    </span>
                                )}
                            </button>

                            <AnimatePresence>
                                {isNotificationsOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute top-full right-0 mt-2 w-72 bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl z-[9999] overflow-hidden"
                                    >
                                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                                            <h3 className="font-bold text-sm text-white">Admin Activity</h3>
                                            {notifications.length > 0 && (
                                                <span className="bg-padel-green/20 text-padel-green text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                                                    {notifications.length} Recent
                                                </span>
                                            )}
                                        </div>
                                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                            {notifications.map(item => (
                                                <a
                                                    key={item.id}
                                                    href={item.link}
                                                    className="block p-4 transition-colors border-b last:border-0 hover:bg-white/5 border-white/5 flex items-start gap-3"
                                                >
                                                    <div className="mt-1 bg-white/5 p-2 rounded-lg shrink-0">
                                                        {item.type === 'payment' && <span className="w-4 h-4 flex items-center justify-center font-bold text-[14px] text-padel-green">R</span>}
                                                        {item.type === 'player' && <UserPlus className="w-4 h-4 text-blue-400" />}
                                                        {item.type === 'event' && <CalendarPlus className="w-4 h-4 text-purple-400" />}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold mb-1 text-white">{item.title}</p>
                                                        <p className="text-xs text-gray-400">{item.subtitle}</p>
                                                        <p className="text-[10px] mt-2 uppercase tracking-widest font-bold text-gray-500">{item.timeAgo}</p>
                                                    </div>
                                                </a>
                                            ))}
                                            {notifications.length === 0 && (
                                                <div className="p-4 text-center text-gray-400 text-sm">No recent activity</div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
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
                isDesktopCollapsed={isDesktopCollapsed}
                setIsDesktopCollapsed={setIsDesktopCollapsed}
                permissions={permissions}
                player={player}
                session={session}
            />

            <main className={`flex-1 transition-all duration-300 ${isDesktopCollapsed ? 'lg:ml-20' : 'lg:ml-64'} p-4 md:p-8 lg:p-12 overflow-y-auto min-h-screen lg:h-screen bg-gradient-to-br from-black to-[#0F172A]`}>
                <div className="max-w-7xl mx-auto">
                    {/* Desktop Header Actions */}
                    <div className="hidden lg:flex justify-end mb-8 gap-4 items-center">
                        {/* Desktop Notifications Bell */}
                        {session && permissions?.role === 'super_admin' && (
                            <div className="relative">
                                <button
                                    onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                                    className="p-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-full transition-all relative group"
                                >
                                    <motion.div
                                        animate={notifications.length > 0 ? { rotate: [0, -15, 15, -15, 15, 0] } : {}}
                                        transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 3 }}
                                    >
                                        <Bell className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    </motion.div>
                                    {notifications.length > 0 && (
                                        <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-padel-green opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-padel-green"></span>
                                        </span>
                                    )}
                                </button>

                                <AnimatePresence>
                                    {isNotificationsOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="absolute top-full right-0 mt-2 w-80 bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl z-[9999] overflow-hidden"
                                        >
                                            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                                                <h3 className="font-bold text-sm text-white">Admin Activity</h3>
                                                {notifications.length > 0 && (
                                                    <span className="bg-padel-green/20 text-padel-green text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                                                        {notifications.length} Recent
                                                    </span>
                                                )}
                                            </div>
                                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                                {notifications.map(item => (
                                                    <a
                                                        key={item.id}
                                                        href={item.link}
                                                        className="block p-4 transition-colors border-b last:border-0 hover:bg-white/5 border-white/5 flex items-start gap-3"
                                                    >
                                                        <div className="mt-1 bg-white/5 p-2 rounded-lg shrink-0">
                                                            {item.type === 'payment' && <span className="w-4 h-4 flex items-center justify-center font-bold text-[14px] text-padel-green">R</span>}
                                                            {item.type === 'player' && <UserPlus className="w-4 h-4 text-blue-400" />}
                                                            {item.type === 'event' && <CalendarPlus className="w-4 h-4 text-purple-400" />}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold mb-1 text-white">{item.title}</p>
                                                            <p className="text-xs text-gray-400">{item.subtitle}</p>
                                                            <p className="text-[10px] mt-2 uppercase tracking-widest font-bold text-gray-500">{item.timeAgo}</p>
                                                        </div>
                                                    </a>
                                                ))}
                                                {notifications.length === 0 && (
                                                    <div className="p-4 text-center text-gray-400 text-sm">No recent activity</div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
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
                                        <GalleryManager permissions={permissions} />
                                    )}
                                    {activeTab === 'coaches' && (
                                        <CoachManager />
                                    )}
                                    {activeTab === 'finance' && (
                                        <FinanceManager />
                                    )}
                                    {activeTab === 'email-broadcast' && (
                                        <EmailBroadcastManager />
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
