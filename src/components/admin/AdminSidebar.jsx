import React from 'react';
import { motion } from 'framer-motion';
import { LayoutDashboard, Users, Trophy, Settings, LogOut, FileText, Calendar, DollarSign } from 'lucide-react';
import logo from '../../assets/logo_4m.png';

const AdminSidebar = ({ activeTab, setActiveTab, onLogout }) => {
    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'players', label: 'Players', icon: Users },
        { id: 'blog', label: 'Blog', icon: FileText },
        { id: 'calendar', label: 'Calendar', icon: Calendar },
        { id: 'finance', label: 'Finance', icon: DollarSign },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <aside className="w-64 bg-black/90 backdrop-blur-xl border-r border-white/10 h-screen fixed left-0 top-0 flex flex-col z-50">
            <div className="p-8">
                <div className="flex items-center gap-2">
                    <img src={logo} alt="4M Padel" className="h-10 w-auto" />
                    <span className="text-xl font-bold text-white">South Africa</span>
                </div>
            </div>

            <nav className="flex-1 px-4 space-y-2">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
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
    );
};

export default AdminSidebar;
