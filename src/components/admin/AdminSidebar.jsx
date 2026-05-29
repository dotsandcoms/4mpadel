import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Users, Trophy, Settings, LogOut, FileText, Calendar, DollarSign, Image as ImageIcon, UserPlus, X, Shield, ExternalLink, Home, Building } from 'lucide-react';
import logo from '../../assets/logo_4m_lowercase.png';
import { supabase } from '../../supabaseClient';

const AdminSidebar = ({ activeTab, setActiveTab, onLogout, isOpen, onClose, permissions, badgeCounts = {} }) => {
    const [userProfile, setUserProfile] = React.useState(null);

    React.useEffect(() => {
        const fetchUserProfile = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const email = sessionStorage.getItem('admin_test_login_email') || session?.user?.email;
                if (!email) return;

                const { data, error } = await supabase
                    .from('players')
                    .select('name, image_url')
                    .ilike('email', email)
                    .maybeSingle();

                if (data) {
                    setUserProfile(data);
                }
            } catch (err) {
                console.error("Failed to load sidebar user profile:", err);
            }
        };

        fetchUserProfile();
    }, []);

    const allMenuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'organizations', label: 'Organizations', icon: Building },
        { id: 'players', label: 'Players', icon: Users },
        { id: 'coaches', label: 'Coaches', icon: UserPlus },
        { id: 'calendar', label: 'Calendar', icon: Calendar },
        { id: 'event-mgmt', label: 'Event Manager', icon: Trophy },
        { id: 'gallery', label: 'Gallery', icon: ImageIcon },
        { id: 'finance', label: 'Finance', icon: DollarSign },
        { id: 'blog', label: 'Blog', icon: FileText },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'admin-mgmt', label: 'Permissions', icon: Shield, superAdminOnly: true },
    ];

    const menuItems = allMenuItems.filter(item => {
        if (!permissions) return false;
        if (permissions.role === 'super_admin') return true;
        if (item.superAdminOnly) return false;

        // Auto-show Event Manager if they have specific event permissions
        if (item.id === 'event-mgmt' && permissions.module_permissions?.['event-mgmt']?.allowedEvents?.length > 0) return true;

        return permissions.allowed_tabs && permissions.allowed_tabs.includes(item.id);
    });

    return (
        <>
            {/* Mobile Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] lg:hidden"
                    />
                )}
            </AnimatePresence>

            <aside className={`w-64 bg-[#0F172A] lg:bg-black/90 backdrop-blur-xl border-r border-white/10 h-screen fixed left-0 top-0 flex flex-col z-[60] transition-transform duration-300 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                }`}>
                <div className="p-8 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <img src={logo} alt="4M Padel" className="h-10 w-auto" />
                        <span className="text-xl font-bold text-white">South Africa</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white lg:hidden"
                    >
                        <X size={24} />
                    </button>
                </div>

                <nav className="flex-1 px-4 space-y-2">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setActiveTab(item.id);
                                    if (window.innerWidth < 1024) onClose();
                                }}
                                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 relative group ${isActive ? 'text-black font-bold' : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-padel-green rounded-xl"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center justify-between w-full">
                                    <span className="flex items-center gap-3">
                                        <Icon size={20} />
                                        {item.label}
                                    </span>
                                    {badgeCounts[item.id] > 0 && (
                                        <span className="bg-amber-500 text-black text-[9px] font-black px-2 py-0.5 rounded-full shadow-md animate-pulse">
                                            {badgeCounts[item.id]}
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-white/10 space-y-1">
                    {userProfile && (
                        <div className="px-3 py-3.5 mb-3 flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl">
                            {userProfile.image_url ? (
                                <img
                                    src={userProfile.image_url}
                                    alt={userProfile.name}
                                    className="w-10 h-10 rounded-full object-cover border border-padel-green/20 shrink-0"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-padel-green/10 text-padel-green flex items-center justify-center font-black text-sm border border-padel-green/20 uppercase shrink-0">
                                    {userProfile.name?.substring(0, 2) || 'AD'}
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <span className="font-extrabold text-xs text-white block truncate leading-none">{userProfile.name}</span>
                                <span className="text-[8px] uppercase tracking-widest text-padel-green font-black mt-1 inline-block">
                                    {permissions?.role === 'super_admin' ? 'Super Admin' : permissions?.role === 'org_owner' ? 'Club Host' : 'Admin'}
                                </span>
                            </div>
                        </div>
                    )}
                    <a
                        href="/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center gap-3 px-4 py-3 text-padel-green hover:bg-padel-green/10 rounded-xl transition-colors font-medium text-sm"
                    >
                        <Home size={20} />
                        View live Site
                    </a>
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors text-sm"
                    >
                        <LogOut size={20} />
                        Sign Out
                    </button>
                </div>
            </aside>
        </>
    );
};

export default AdminSidebar;
