import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, DollarSign, Users, Calendar } from 'lucide-react';
import EventFinance from './EventFinance';

const EventManagement = ({ allowedEvents }) => {
    const [activeTab, setActiveTab] = useState('finance');

    const tabs = [
        { id: 'finance', label: 'Event Finance', icon: DollarSign },
        // Future tabs could go here (e.g. Participants, Draws, Settings)
    ];

    return (
        <div className="space-y-6">
            <div className="bg-[#1E293B]/50 backdrop-blur-md rounded-3xl border border-white/10 p-4">
                <div className="flex items-center gap-4 border-b border-white/10 pb-4 mb-4">
                    <div className="w-12 h-12 bg-padel-green/20 text-padel-green rounded-xl flex items-center justify-center shrink-0">
                        <Trophy size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight italic">Event Management</h2>
                        <p className="text-gray-400 text-xs font-medium uppercase tracking-widest">Manage your finance-managed events</p>
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all text-sm whitespace-nowrap ${
                                    isActive 
                                    ? 'bg-padel-green text-black' 
                                    : 'bg-black/20 text-gray-400 hover:text-white hover:bg-black/40'
                                }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        );
                    })}
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
                    {activeTab === 'finance' && <EventFinance allowedEvents={allowedEvents} isEventManagementModule={true} />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default EventManagement;
