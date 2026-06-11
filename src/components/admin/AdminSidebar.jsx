import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Users, Trophy, Settings, LogOut, FileText, Calendar, DollarSign, Image as ImageIcon, UserPlus, X, Shield, ExternalLink, Home, User, ChevronLeft, ChevronRight } from 'lucide-react';
import logo from '../../assets/logo_4m_lowercase.png';

const AdminSidebar = ({ activeTab, setActiveTab, onLogout, isOpen, onClose, isDesktopCollapsed, setIsDesktopCollapsed, permissions, player, session }) => {
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

            <aside className={`${isDesktopCollapsed ? 'w-20' : 'w-64'} bg-[#0F172A] lg:bg-black/90 backdrop-blur-xl border-r border-white/10 h-screen fixed left-0 top-0 flex flex-col z-[60] transition-all duration-300 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                }`}>
                <div className={`p-6 flex items-center ${isDesktopCollapsed ? 'justify-center' : 'justify-between'}`}>
                    <div className="flex items-center gap-2 overflow-hidden">
                        <img src={logo} alt="4M Padel" className="h-10 w-auto shrink-0" />
                        {!isDesktopCollapsed && (
                            <motion.span 
                                initial={{ opacity: 0, width: 0 }} 
                                animate={{ opacity: 1, width: 'auto' }} 
                                exit={{ opacity: 0, width: 0 }} 
                                className="text-xl font-bold text-white whitespace-nowrap"
                            >
                                South Africa
                            </motion.span>
                        )}
                    </div>
                    
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white lg:hidden shrink-0"
                    >
                        <X size={24} />
                    </button>
                </div>
                
                {/* Desktop Collapse Toggle */}
                <button
                    onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
                    className="hidden lg:flex absolute -right-3 top-8 w-6 h-6 bg-[#0F172A] border border-white/10 rounded-full items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 z-[70] transition-colors"
                >
                    {isDesktopCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>

                <nav className="flex-1 px-3 space-y-2 overflow-y-auto custom-scrollbar overflow-x-hidden">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                title={isDesktopCollapsed ? item.label : ''}
                                onClick={() => {
                                    setActiveTab(item.id);
                                    if (window.innerWidth < 1024) onClose();
                                }}
                                className={`w-full flex items-center ${isDesktopCollapsed ? 'justify-center px-0' : 'gap-4 px-4'} py-3 rounded-xl transition-all duration-300 relative group ${isActive ? 'text-black font-bold' : 'text-gray-400 hover:text-white'
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
                                <span className={`relative z-10 flex items-center ${isDesktopCollapsed ? 'justify-center' : 'gap-3 w-full'}`}>
                                    <Icon size={20} className="shrink-0" />
                                    {!isDesktopCollapsed && <span className="truncate">{item.label}</span>}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                <div className={`p-4 border-t border-white/10 space-y-1 bg-black/20 ${isDesktopCollapsed ? 'flex flex-col items-center' : ''}`}>
                    {session && (
                        <div className={`w-full flex items-center ${isDesktopCollapsed ? 'justify-center px-0 bg-transparent border-0 mb-4' : 'gap-3 px-4 py-3 bg-white/5 border border-white/10 rounded-xl mb-2'}`}>
                            {player?.image_url ? (
                                <img src={player.image_url} alt={player?.name} className="w-10 h-10 rounded-xl object-cover border border-white/20 shrink-0" title={player?.name} />
                            ) : (
                                <div className="w-10 h-10 rounded-xl bg-padel-green/20 border border-padel-green/30 flex items-center justify-center text-padel-green text-sm font-black uppercase shrink-0" title={player?.name}>
                                    {player?.name ? player.name.charAt(0) : 'A'}
                                </div>
                            )}
                            {!isDesktopCollapsed && (
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-white uppercase tracking-wider truncate">
                                        {player?.name || session.user.email}
                                    </p>
                                    {player?.rankedin_id && (
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5 truncate">
                                            ID: {player.rankedin_id}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    <a
                        href="/"
                        target="_blank"
                        rel="noopener noreferrer"
                        title={isDesktopCollapsed ? "View live Site" : ""}
                        className={`w-full flex items-center ${isDesktopCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-3 text-padel-green hover:bg-padel-green/10 rounded-xl transition-colors font-medium`}
                    >
                        <Home size={20} className="shrink-0" />
                        {!isDesktopCollapsed && <span className="truncate">View live Site</span>}
                    </a>
                    <button
                        onClick={onLogout}
                        title={isDesktopCollapsed ? "Sign Out" : ""}
                        className={`w-full flex items-center ${isDesktopCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors`}
                    >
                        <LogOut size={20} className="shrink-0" />
                        {!isDesktopCollapsed && <span className="truncate">Sign Out</span>}
                    </button>
                </div>
            </aside>
        </>
    );
};

export default AdminSidebar;
