import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Building, ExternalLink, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import ApplyOrganisationModal from './ApplyOrganisationModal';

/**
 * Self-contained organisation host banner for the player profile.
 * Shows: Apply CTA (no org) → Pending → Approved (dashboard link) → Rejected (re-apply).
 * Resolves the user's org via organisation_members first, then legacy created_by.
 */
const OrgHostBanner = ({ player, variant = 'inline' }) => {
    const navigate = useNavigate();
    const [userOrg, setUserOrg] = useState(null);
    const [loadingOrg, setLoadingOrg] = useState(true);
    const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);

    const fetchOrgStatus = async () => {
        if (!player?.email) {
            setLoadingOrg(false);
            return;
        }
        try {
            // 1. Membership model
            const { data: memberships } = await supabase
                .from('organisation_members')
                .select('role, organisations(*)')
                .ilike('user_email', player.email)
                .limit(5);

            const memberOrg = (memberships || []).find(m => m.organisations)?.organisations;
            if (memberOrg) {
                setUserOrg(memberOrg);
                return;
            }

            // 2. Legacy fallback: application created by this player (any status,
            //    so pending/rejected applications still surface correctly)
            const { data: orgData } = await supabase
                .from('organisations')
                .select('*')
                .eq('created_by', player.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (orgData) setUserOrg(orgData);
        } catch (err) {
            console.error('Error loading organisation status:', err);
        } finally {
            setLoadingOrg(false);
        }
    };

    useEffect(() => {
        fetchOrgStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [player?.email]);

    if (!player || loadingOrg || isDismissed) return null;

    const status = userOrg?.status;

    const borderAccent = !userOrg
        ? 'border-l-padel-green/30 md:border-l-padel-green/50'
        : status === 'pending'
            ? 'border-l-amber-500/30 md:border-l-amber-500/50'
            : status === 'approved'
                ? 'border-l-padel-green/40 md:border-l-padel-green'
                : 'border-l-red-500/30 md:border-l-red-500/50';

    const isTopBanner = variant === 'top';

    const banner = (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className={`relative overflow-hidden flex flex-row items-center justify-between gap-2.5 md:gap-4 ${
                isTopBanner
                    ? 'mb-0 py-1'
                    : `mb-3 md:mb-6 bg-white/[0.02] md:bg-neutral-950/30 backdrop-blur-md md:backdrop-blur-xl border border-white/5 md:border-y md:border-r border-l-2 ${borderAccent} p-3 md:p-5 rounded-xl md:rounded-2xl md:shadow-xl`
            }`}
        >
                <div className={`absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 rounded-full blur-[40px] pointer-events-none hidden md:block ${!userOrg
                    ? 'bg-padel-green/5'
                    : status === 'pending'
                        ? 'bg-amber-500/5'
                        : status === 'approved'
                            ? 'bg-padel-green/10'
                            : 'bg-red-500/5'
                    }`} />

                <div className="flex items-center gap-2.5 md:gap-3 relative z-10 min-w-0 flex-1">
                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center shrink-0 ${!userOrg
                        ? 'bg-white/5 md:bg-padel-green/10 text-gray-400 md:text-padel-green'
                        : status === 'pending'
                            ? 'bg-amber-500/10 text-amber-500'
                            : status === 'approved'
                                ? 'bg-padel-green/15 md:bg-padel-green/20 text-padel-green md:shadow-[0_0_15px_rgba(154,233,0,0.1)]'
                                : 'bg-red-500/10 text-red-500'
                        }`}>
                        <Building size={16} />
                    </div>
                    <div className="min-w-0">
                        {!userOrg && (
                            <>
                                <h4 className="font-semibold text-xs md:text-sm text-gray-200 md:text-white leading-tight">Host tournaments</h4>
                                <p className="text-gray-500 text-[10px] md:text-xs mt-0.5 md:mt-0.5 line-clamp-1 md:line-clamp-none">
                                    <span className="md:hidden">Apply as an organisation</span>
                                    <span className="hidden md:inline">Apply as an official Organisation to create events, draws, and schedules.</span>
                                </p>
                            </>
                        )}
                        {status === 'pending' && (
                            <>
                                <h4 className="font-semibold text-xs md:text-sm text-gray-200 md:text-white leading-tight">Under review</h4>
                                <p className="text-gray-500 text-[10px] md:text-xs mt-0.5 line-clamp-1">
                                    <span className="md:hidden">{userOrg.name}</span>
                                    <span className="hidden md:inline">4M Padel administrators are currently reviewing <span className="text-white font-bold">{userOrg.name}</span>.</span>
                                </p>
                            </>
                        )}
                        {status === 'approved' && (
                            <>
                                <h4 className="font-semibold text-xs md:text-sm text-gray-200 md:text-white leading-tight">Org dashboard</h4>
                                <p className="text-gray-500 text-[10px] md:text-xs mt-0.5 line-clamp-1">
                                    <span className="md:hidden">{userOrg.name}</span>
                                    <span className="hidden md:inline">Create and manage sanctioned padel events for <span className="text-white font-bold">{userOrg.name}</span>.</span>
                                </p>
                            </>
                        )}
                        {status === 'rejected' && (
                            <>
                                <h4 className="font-semibold text-xs md:text-sm text-red-400 leading-tight">Action required</h4>
                                <p className="text-gray-500 text-[10px] md:text-xs mt-0.5 line-clamp-1 md:line-clamp-none">
                                    <span className="md:hidden">Application declined</span>
                                    <span className="hidden md:inline">Declined: {userOrg.rejection_notes || 'Please resolve review feedback.'}</span>
                                </p>
                            </>
                        )}
                    </div>
                </div>

                <div className="shrink-0 relative z-10 flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setIsDismissed(true)}
                        aria-label="Dismiss organisation banner"
                        className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                    >
                        <X size={14} />
                    </button>
                    {!userOrg && (
                        <button
                            type="button"
                            onClick={() => setIsOrgModalOpen(true)}
                            className="text-[10px] md:text-[11px] font-bold md:font-black uppercase tracking-wide md:tracking-widest px-3 py-1.5 md:px-5 md:py-3 border border-white/10 md:border-0 bg-transparent md:bg-padel-green text-gray-300 md:!text-black hover:border-padel-green/40 md:hover:bg-white hover:text-padel-green md:hover:!text-black rounded-lg md:rounded-xl transition-all cursor-pointer md:shadow-lg md:hover:scale-[1.02] active:scale-95 whitespace-nowrap"
                        >
                            Apply
                        </button>
                    )}
                    {status === 'pending' && (
                        <div className="text-[9px] md:text-[10px] font-bold md:font-black text-amber-500/80 md:text-amber-500 uppercase tracking-wide md:tracking-widest border border-amber-500/15 md:border-amber-500/20 bg-amber-500/5 px-2.5 py-1 md:px-4 md:py-2 rounded-lg md:rounded-xl md:animate-pulse whitespace-nowrap">
                            Pending
                        </div>
                    )}
                    {status === 'approved' && (
                        <button
                            type="button"
                            onClick={() => navigate('/admin?tab=organisations&view=host')}
                            className="text-[10px] md:text-[11px] font-bold md:font-black uppercase tracking-wide md:tracking-widest px-3 py-1.5 md:px-5 md:py-3 border border-padel-green/25 md:border-0 bg-padel-green/10 md:bg-padel-green !text-padel-green md:!text-black hover:bg-padel-green/20 md:hover:bg-white rounded-lg md:rounded-xl transition-all cursor-pointer md:shadow-lg md:hover:scale-[1.02] active:scale-95 flex items-center gap-1.5 whitespace-nowrap"
                        >
                            <span className="md:hidden !text-padel-green">Open</span>
                            <span className="hidden md:inline !text-black">Organisation Dashboard</span>
                            <ExternalLink size={11} className="md:w-3 md:h-3 shrink-0 !text-inherit" />
                        </button>
                    )}
                    {status === 'rejected' && (
                        <button
                            type="button"
                            onClick={() => setIsOrgModalOpen(true)}
                            className="text-[10px] md:text-[11px] font-bold md:font-black uppercase tracking-wide md:tracking-widest px-3 py-1.5 md:px-5 md:py-3 bg-red-500/5 md:bg-red-500/10 border border-red-500/20 md:border-red-500/30 text-red-400 hover:bg-red-500/15 md:hover:bg-red-500 md:hover:text-black rounded-lg md:rounded-xl transition-all cursor-pointer whitespace-nowrap"
                        >
                            Re-apply
                        </button>
                    )}
                </div>
            </motion.div>
    );

    return (
        <>
            {isTopBanner ? (
                <div className="border-b border-white/5 pb-2">
                    {banner}
                </div>
            ) : (
                banner
            )}

            <AnimatePresence>
                {isOrgModalOpen && (
                    <ApplyOrganisationModal
                        isOpen={isOrgModalOpen}
                        onClose={() => setIsOrgModalOpen(false)}
                        playerProfile={player}
                        onSuccess={() => {
                            setLoadingOrg(true);
                            fetchOrgStatus().finally(() => setLoadingOrg(false));
                        }}
                    />
                )}
            </AnimatePresence>
        </>
    );
};

export default OrgHostBanner;
