import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building, X } from 'lucide-react';
import RegisterOrganisationForm from '../RegisterOrganisationForm';

/**
 * Super-admin modal to create an organisation via the same multi-step wizard
 * as public applications, with auto-approval + owner dashboard access.
 */
const CreateOrganisationModal = ({ isOpen, onClose, onCreated }) => {
    useEffect(() => {
        if (!isOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[210] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 12 }}
                        className="max-w-lg w-full bg-[#0a0a0a] border border-white/10 rounded-3xl relative shadow-2xl text-left max-h-[90vh] flex flex-col overflow-hidden"
                    >
                        <div className="shrink-0 flex items-start justify-between gap-3 p-5 pb-3 border-b border-white/5">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 bg-padel-green/10 text-padel-green rounded-xl flex items-center justify-center shrink-0">
                                    <Building size={20} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-lg font-extrabold text-white">Create Organisation</h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Approved host, owner login, and Organisation Dashboard access
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer shrink-0"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 p-5 pt-4 custom-scrollbar">
                            <RegisterOrganisationForm
                                key={isOpen ? 'create-org-open' : 'create-org-closed'}
                                autoApprove
                                compact
                                onClose={onClose}
                                onSuccess={(org) => onCreated?.(org)}
                            />
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default CreateOrganisationModal;
