import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Users, Trophy, Settings, LogOut, FileText, Calendar, DollarSign, Image as ImageIcon, UserPlus, X, Shield } from 'lucide-react';
import logo from '../../assets/logo_4m_lowercase.png';

const AdminSidebar = ({ activeTab, setActiveTab, onLogout, isOpen, onClose, permissions }) => {
    const allMenuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
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
                                <span className="relative z-10 flex items-center gap-3">
                                    <Icon size={20} />
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-white/10">
                    <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
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
