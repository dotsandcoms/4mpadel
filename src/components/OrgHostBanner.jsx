import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Building, ExternalLink } from 'lucide-react';
import { supabase } from '../supabaseClient';
import ApplyOrganisationModal from './ApplyOrganisationModal';

/**
 * Self-contained organisation host banner for the player profile.
 * Shows: Apply CTA (no org) → Pending → Approved (dashboard link) → Rejected (re-apply).
 * Resolves the user's org via organization_members first, then legacy created_by.
 */
const OrgHostBanner = ({ player }) => {
    const navigate = useNavigate();
    const [userOrg, setUserOrg] = useState(null);
    const [loadingOrg, setLoadingOrg] = useState(true);
    const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);

    const fetchOrgStatus = async () => {
        if (!player?.email) {
            setLoadingOrg(false);
            return;
        }
        try {
            // 1. Membership model
            const { data: memberships } = await supabase
                .from('organization_members')
                .select('role, organizations(*)')
                .ilike('user_email', player.email)
                .limit(5);

            const memberOrg = (memberships || []).find(m => m.organizations)?.organizations;
            if (memberOrg) {
                setUserOrg(memberOrg);
                return;
            }

            // 2. Legacy fallback: application created by this player (any status,
            //    so pending/rejected applications still surface correctly)
            const { data: orgData } = await supabase
                .from('organizations')
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

    if (!player || loadingOrg) return null;

    const status = userOrg?.status;

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mb-6 bg-neutral-950/30 backdrop-blur-xl border-y border-r border-white/5 p-5 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden group ${!userOrg
                    ? 'border-l-2 border-l-padel-green/50'
                    : status === 'pending'
                        ? 'border-l-2 border-l-amber-500/50'
                        : status === 'approved'
                            ? 'border-l-2 border-l-padel-green'
                            : 'border-l-2 border-l-red-500/50'
                    }`}
            >
                {/* Subtle background ambient light */}
                <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-[40px] pointer-events-none ${!userOrg
                    ? 'bg-padel-green/5'
                    : status === 'pending'
                        ? 'bg-amber-500/5'
                        : status === 'approved'
                            ? 'bg-padel-green/10'
                            : 'bg-red-500/5'
                    }`} />

                <div className="flex items-center gap-3 relative z-10 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${!userOrg
                        ? 'bg-padel-green/10 text-padel-green'
                        : status === 'pending'
                            ? 'bg-amber-500/10 text-amber-500'
                            : status === 'approved'
                                ? 'bg-padel-green/20 text-padel-green shadow-[0_0_15px_rgba(154,233,0,0.1)]'
                                : 'bg-red-500/10 text-red-500'
                        }`}>
                        <Building size={20} />
                    </div>
                    <div className="min-w-0">
                        {!userOrg && (
                            <>
                                <h4 className="font-bold text-sm text-white">Host Your Own Tournaments</h4>
                                <p className="text-gray-400 text-xs mt-0.5">Apply as an official Organisation to create events, draws, and schedules.</p>
                            </>
                        )}
                        {status === 'pending' && (
                            <>
                                <h4 className="font-bold text-sm text-white">Application Under Review</h4>
                                <p className="text-gray-400 text-xs mt-0.5">4M Padel administrators are currently reviewing <span className="text-white font-bold">{userOrg.name}</span>.</p>
                            </>
                        )}
                        {status === 'approved' && (
                            <>
                                <h4 className="font-bold text-sm text-white">Organisation Dashboard Active</h4>
                                <p className="text-gray-400 text-xs mt-0.5">Create and manage sanctioned padel events for <span className="text-white font-bold">{userOrg.name}</span>.</p>
                            </>
                        )}
                        {status === 'rejected' && (
                            <>
                                <h4 className="font-bold text-sm text-red-400">Application Requires Action</h4>
                                <p className="text-gray-400 text-xs mt-0.5">Declined: {userOrg.rejection_notes || 'Please resolve review feedback.'}</p>
                            </>
                        )}
                    </div>
                </div>

                <div className="shrink-0 flex items-center justify-end relative z-10 w-full md:w-auto border-t md:border-t-0 border-white/5 pt-3 md:pt-0">
                    {!userOrg && (
                        <button
                            onClick={() => setIsOrgModalOpen(true)}
                            className="text-[11px] font-black uppercase tracking-widest px-5 py-3 bg-padel-green text-black hover:bg-white rounded-xl transition-all cursor-pointer shadow-lg hover:scale-[1.02] active:scale-95 flex items-center gap-1.5"
                        >
                            Apply to Host
                        </button>
                    )}
                    {status === 'pending' && (
                        <div className="text-[10px] font-black text-amber-500 uppercase tracking-widest border border-amber-500/20 bg-amber-500/5 px-4 py-2 rounded-xl flex items-center gap-1.5 animate-pulse">
                            Pending Approval
                        </div>
                    )}
                    {status === 'approved' && (
                        <button
                            onClick={() => navigate('/admin')}
                            className="text-[11px] font-black uppercase tracking-widest px-5 py-3 bg-padel-green text-black hover:bg-white rounded-xl transition-all cursor-pointer shadow-lg hover:scale-[1.02] active:scale-95 flex items-center gap-1.5"
                        >
                            Organisation Dashboard <ExternalLink size={12} />
                        </button>
                    )}
                    {status === 'rejected' && (
                        <button
                            onClick={() => setIsOrgModalOpen(true)}
                            className="text-[11px] font-black uppercase tracking-widest px-5 py-3 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-black rounded-xl transition-all cursor-pointer"
                        >
                            Re-Apply
                        </button>
                    )}
                </div>
            </motion.div>

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
