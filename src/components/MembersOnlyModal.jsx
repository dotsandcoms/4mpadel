import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, UserPlus } from 'lucide-react';
import AuthModal from './AuthModal';
import { Link } from 'react-router-dom';

const MembersOnlyModal = ({ isOpen }) => {
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    if (!isOpen) return null;

    return (
        <>
            <AnimatePresence>
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-[#0A0D14]/95 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-4xl z-10"
                    >
                        <div className="relative group overflow-hidden rounded-[3rem] border border-white/10 bg-white/5 backdrop-blur-2xl p-10 md:p-20 text-center shadow-2xl">
                            {/* Ambient Glows */}
                            <div className="absolute top-0 left-1/4 w-64 h-64 bg-padel-green/10 blur-[100px] rounded-full pointer-events-none" />
                            <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />

                            <div className="relative z-10 flex flex-col items-center">
                                <div className="w-24 h-24 bg-padel-green/10 rounded-full flex items-center justify-center text-padel-green mb-10 border border-padel-green/20">
                                    <Lock className="w-10 h-10" />
                                </div>
                                <h2 className="text-4xl md:text-6xl font-black text-white mb-6 uppercase tracking-tighter leading-none italic">
                                    Members <span className="text-padel-green">Only</span>
                                </h2>
                                <p className="text-gray-400 text-lg md:text-xl font-medium max-w-xl mx-auto mb-12 leading-relaxed">
                                    Access to site features, rankings, and exclusive community content is reserved for our registered members.
                                </p>
                                <div className="flex flex-col sm:flex-row items-center gap-4">
                                    <button
                                        onClick={() => setIsAuthModalOpen(true)}
                                        className="h-16 px-10 bg-padel-green hover:bg-white text-black font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all duration-300 shadow-2xl shadow-padel-green/20 hover:scale-[1.03] active:scale-95 flex items-center gap-3"
                                    >
                                        <UserPlus className="w-4 h-4" />
                                        <span>Create Profile to Access</span>
                                    </button>
                                    <button
                                        onClick={() => setIsAuthModalOpen(true)}
                                        className="h-16 px-10 bg-white/5 hover:bg-white/10 text-white font-black uppercase tracking-widest text-[11px] rounded-2xl transition-all duration-300 border border-white/10 backdrop-blur-md"
                                    >
                                        Login
                                    </button>
                                </div>

                                <div className="mt-8">
                                    <Link 
                                        to="/" 
                                        className="text-gray-500 hover:text-white text-[10px] font-black uppercase tracking-[0.2em] transition-colors"
                                    >
                                        Back to Home
                                    </Link>
                                </div>

                                <div className="mt-12 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-gray-500">
                                    <div className="w-1.5 h-1.5 rounded-full bg-padel-green shadow-[0_0_8px_rgba(151,255,14,0.5)]" />
                                    <span>Instant Access after Registration</span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </AnimatePresence>

            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
            />
        </>
    );
};

export default MembersOnlyModal;
