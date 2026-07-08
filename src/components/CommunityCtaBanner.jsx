import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Users } from 'lucide-react';
import AuthModal from './AuthModal';

const CommunityCtaBanner = ({ className = '', fullWidth = false }) => {
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className={`bg-[#111827] p-4 sm:p-5 border border-white/5 flex flex-row items-center justify-between gap-4 relative overflow-hidden shadow-2xl rounded-2xl ${
                    fullWidth ? 'w-full max-w-none' : 'max-w-3xl'
                } ${className}`}
            >
                <div className="absolute top-0 right-0 w-48 h-48 bg-padel-green/20 blur-[50px] pointer-events-none rounded-full translate-x-1/4 -translate-y-1/4" />

                <div className="flex items-center gap-3 sm:gap-4 relative z-10 min-w-0">
                    <div className="text-padel-green shrink-0">
                        <Users className="w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                    <div className="min-w-0">
                        <h4 className="text-white font-bold text-xs sm:text-base mb-0.5">Join the growing padel community.</h4>
                        <p className="text-gray-400 text-[10px] sm:text-sm">Compete. Connect. Grow the game.</p>
                    </div>
                </div>
                <div className="relative z-10 shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsAuthModalOpen(true)}
                        className="flex items-center justify-center bg-padel-green !text-black font-black px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-[10px] sm:text-xs uppercase tracking-tight hover:bg-white transition-colors"
                    >
                        Register Now <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 ml-1 sm:ml-1.5" />
                    </button>
                </div>
            </motion.div>

            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                initialTab="register"
            />
        </>
    );
};

export default CommunityCtaBanner;
