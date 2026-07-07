import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Building, X, Sparkles } from 'lucide-react';
import RegisterOrganisationForm from './RegisterOrganisationForm';

const ApplyOrganisationModal = ({ isOpen, onClose, playerProfile, onSuccess }) => {
    useEffect(() => {
        if (!isOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[10050] flex items-end sm:items-center justify-center p-3 sm:p-4 pb-20 sm:pb-4">
                    <motion.button
                        type="button"
                        aria-label="Close organisation registration"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-md cursor-default"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 24 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 w-full max-w-md max-h-[min(82dvh,calc(100dvh-6rem))] flex flex-col bg-[#0F172A]/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-padel-green/5 blur-3xl rounded-full pointer-events-none" />

                        <div className="shrink-0 flex items-start justify-between gap-3 p-4 pb-3 border-b border-white/5">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 bg-padel-green/10 text-padel-green rounded-xl flex items-center justify-center shrink-0">
                                    <Building size={18} />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                                        Host Tournaments
                                        <Sparkles size={14} className="text-padel-green animate-pulse shrink-0" />
                                    </h2>
                                    <p className="text-gray-400 text-[11px] leading-snug mt-0.5">
                                        Apply to become a sanctioned organisation on 4M Padel
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer shrink-0"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-4 pt-3">
                            <RegisterOrganisationForm
                                playerProfile={playerProfile}
                                onClose={onClose}
                                onSuccess={onSuccess}
                                compact
                            />
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>,
        document.body,
    );
};

export default ApplyOrganisationModal;
