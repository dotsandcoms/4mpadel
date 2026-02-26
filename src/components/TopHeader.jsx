import React, { useState, useEffect } from 'react';
import { User, LogOut, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import AuthModal from './AuthModal';
import { useNavigate } from 'react-router-dom';

const TopHeader = () => {
    const [session, setSession] = useState(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    const navLinks = [
        { name: 'Home', href: '/' },
        { name: 'Calendar', href: '/calendar' },
        { name: 'Players', href: '/players' },
        { name: 'Rankings', href: '/rankings' },
        { name: 'Academy', href: '#academy' },
        {
            name: 'Tournaments',
            href: '#',
            dropdown: [
                { name: 'Broll Pro Tour', href: '/tournaments/broll' },
                { name: 'Ladies Tour', href: '/tournaments/ladies' },
                { name: 'Juniors', href: '/tournaments/juniors' },
                { name: 'All Tournaments', href: '/tournaments/all' },
                { name: 'Mens 40 +', href: '/tournaments/mens40' },
            ]
        },
        { name: 'Other', href: '#other' }
    ];

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="w-full py-6 px-6 md:px-10 flex flex-col lg:flex-row items-center justify-between bg-black text-white gap-4 lg:gap-0 relative z-50"
            >
                <div className="flex items-center gap-4">
                    <a href="/" className="text-2xl font-black tracking-tighter text-white">
                        4M <span className="text-padel-green">PADEL</span>
                    </a>
                </div>

                {/* Right: Nav & Action */}
                <div className="flex items-center gap-4">
                    <nav className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10">
                        {navLinks.map((link) => (
                            <div key={link.name} className="relative group">
                                <a
                                    href={link.href}
                                    className="px-5 py-2 rounded-full text-sm font-bold text-gray-300 hover:bg-white hover:text-black transition-all uppercase tracking-tighter flex items-center gap-1"
                                >
                                    {link.name}
                                    {link.dropdown && <ChevronDown size={14} className="group-hover:rotate-180 transition-transform" />}
                                </a>

                                {link.dropdown && (
                                    <div className="absolute top-full left-0 mt-2 w-48 bg-black/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-left -translate-y-2 group-hover:translate-y-0 py-3 z-[60]">
                                        {link.dropdown.map((subItem) => (
                                            <a
                                                key={subItem.name}
                                                href={subItem.href}
                                                className="block px-6 py-2.5 text-xs font-bold text-gray-400 hover:text-padel-green hover:bg-white/5 transition-colors uppercase tracking-widest"
                                            >
                                                {subItem.name}
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </nav>

                    {session ? (
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate('/profile')}
                                className="bg-white/10 text-white px-6 py-3 rounded-full text-sm font-bold hover:bg-white hover:text-black transition-all flex items-center gap-2 border border-white/10"
                            >
                                <User size={16} />
                                Profile
                            </button>
                            <button
                                onClick={handleLogout}
                                className="bg-red-500/10 text-red-500 px-4 py-3 rounded-full text-sm font-bold hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                            >
                                <LogOut size={16} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsAuthModalOpen(true)}
                            className="bg-padel-green text-black px-8 py-3 rounded-full text-sm font-black uppercase tracking-widest hover:bg-white hover:scale-105 transition-all flex items-center gap-2 shadow-lg shadow-padel-green/20"
                        >
                            Register
                            <span className="bg-black/10 rounded-full p-1 leading-none text-xs">↗</span>
                        </button>
                    )}
                </div>
            </motion.div>

            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        </>
    );
};

export default TopHeader;
