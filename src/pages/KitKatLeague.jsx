import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { Trophy, Calendar, Users, MapPin, ChevronRight, PlayCircle, Star, Shield, Info, AlertCircle, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const KitKatLeague = () => {
    const [activeTab, setActiveTab] = useState('overview');

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.2
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] }
        }
    };

    const stats = [
        { label: 'Expected Teams', value: '32+', icon: Users },
        { label: 'Prize Pool', value: 'R 25k+', icon: Trophy },
        { label: 'Venues', value: 'Multiple', icon: MapPin },
        { label: 'Season', value: '2026/27', icon: Calendar },
    ];

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Info },
        { id: 'schedule', label: 'Schedule', icon: Calendar },
        { id: 'divisions', label: 'Divisions', icon: Shield },
        { id: 'registration', label: 'Registration', icon: Star },
    ];

    return (
        <div className="bg-[#0A0A0A] min-h-screen text-white font-sans selection:bg-[#D41B2C] selection:text-white overflow-hidden">
            <Navbar />

            {/* Background elements */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#D41B2C]/10 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-white/5 blur-[120px] rounded-full" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03]" />
            </div>

            <main className="relative z-10 pt-24 md:pt-32 pb-20 container mx-auto px-6 max-w-7xl">
                {/* Hero Section */}
                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={containerVariants}
                    className="text-center mb-20"
                >
                    <motion.div
                        variants={itemVariants}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[#D41B2C] text-sm font-black uppercase tracking-[0.2em] mb-8"
                    >
                        <span className="w-2 h-2 rounded-full bg-[#D41B2C] animate-pulse" />
                        Premier League Series
                    </motion.div>

                    <motion.h1
                        variants={itemVariants}
                        className="text-6xl md:text-8xl font-black text-white tracking-tighter uppercase mb-6 leading-none"
                    >
                        KIT KAT <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D41B2C] to-white">LEAGUE</span>
                    </motion.h1>

                    <motion.p
                        variants={itemVariants}
                        className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto mb-12 font-medium leading-relaxed"
                    >
                        The ultimate treat for padel enthusiasts. Compete in South Africa's most rewarding padel league. More than just a game, it's an experience.
                    </motion.p>

                    <motion.div
                        variants={itemVariants}
                        className="flex flex-wrap justify-center gap-6"
                    >
                        <button className="bg-[#D41B2C] text-white px-10 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-white hover:text-black hover:scale-105 transition-all shadow-2xl shadow-[#D41B2C]/20 flex items-center gap-3 group">
                            Register Your Team
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                        <button className="bg-white/5 text-white border border-white/10 px-10 py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-white/10 transition-all backdrop-blur-md flex items-center gap-3">
                            View Prospectus
                            <PlayCircle className="w-5 h-5 text-[#D41B2C]" />
                        </button>
                    </motion.div>
                </motion.div>

                {/* Stats Grid */}
                <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={containerVariants}
                    className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-24"
                >
                    {stats.map((stat, i) => (
                        <motion.div
                            key={i}
                            variants={itemVariants}
                            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-3xl p-8 hover:border-[#D41B2C]/50 transition-all group"
                        >
                            <stat.icon className="w-8 h-8 text-[#D41B2C] mb-6 group-hover:scale-110 transition-transform" />
                            <h4 className="text-4xl font-black text-white mb-2">{stat.value}</h4>
                            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{stat.label}</p>
                        </motion.div>
                    ))}
                </motion.div>

                {/* Content Tabs */}
                <div className="mb-12">
                    <div className="flex overflow-x-auto hide-scrollbar space-x-2 bg-white/5 backdrop-blur-md p-2 rounded-[2rem] border border-white/10 mb-12 max-w-fit mx-auto">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative px-8 py-4 rounded-full font-black text-xs tracking-widest uppercase transition-all duration-300 flex items-center gap-3 ${
                                    activeTab === tab.id ? 'text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="kitKatTab"
                                        className="absolute inset-0 bg-white rounded-full shadow-xl"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <tab.icon className={`w-4 h-4 relative z-10 ${activeTab === tab.id ? 'text-[#D41B2C]' : 'text-current'}`} />
                                <span className="relative z-10">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                            className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[3rem] p-12 md:p-20 relative overflow-hidden"
                        >
                            {/* Decorative accent */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-[#D41B2C]/10 blur-[100px] pointer-events-none" />
                            
                            {activeTab === 'overview' && (
                                <div className="max-w-4xl mx-auto text-center">
                                    <h2 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tight mb-8">Coming Soon</h2>
                                    <p className="text-xl text-gray-400 leading-relaxed mb-12">
                                        We are finalizing the details for the inaugural Kit Kat League. Expect a high-energy competition featuring professional match officiating, premium branding, and the largest prize pools in amateur padel history.
                                    </p>
                                    <div className="flex items-center justify-center gap-4 p-6 bg-[#D41B2C]/10 border border-[#D41B2C]/20 rounded-2xl max-w-md mx-auto">
                                        <AlertCircle className="text-[#D41B2C] w-6 h-6 shrink-0" />
                                        <p className="text-[#D41B2C] font-bold text-sm text-left">
                                            Follow our social media for the official launch announcement and early-bird registration info.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {activeTab !== 'overview' && (
                                <div className="py-20 text-center">
                                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/10">
                                        <div className="w-10 h-10 border-4 border-[#D41B2C] border-t-transparent rounded-full animate-spin" />
                                    </div>
                                    <h3 className="text-2xl font-black text-white uppercase tracking-widest mb-4">Content Incoming</h3>
                                    <p className="text-gray-500">The platform is being updated with the latest league information.</p>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

export default KitKatLeague;
