import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { sendEmail } from '../utils/emails';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, Building } from 'lucide-react';
import Navbar from '../components/Navbar';
import MembersOnlyModal from '../components/MembersOnlyModal';

const ClaimClubInvite = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const [invite, setInvite] = useState(null);
    const [club, setClub] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [needsProfile, setNeedsProfile] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState(null);
    const [session, setSession] = useState(null);
    const [showAuth, setShowAuth] = useState(false);

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (!token) { setError('No invite token provided.'); setLoading(false); return; }
        (async () => {
            const { data: rows, error: fetchErr } = await supabase
                .rpc('get_club_claim_invite_by_token', { p_token: token });
            const data = Array.isArray(rows) ? rows[0] : rows;
            if (fetchErr) { setError(fetchErr.message); setLoading(false); return; }
            if (!data) { setError('Invite not found or has expired.'); setLoading(false); return; }
            if (data.status !== 'pending') { setError(`This invite has already been ${data.status}.`); setLoading(false); return; }
            setInvite(data);
            setClub({
                id: data.club_id,
                name: data.club_name,
                short_name: data.club_short_name,
                logo_url: data.club_logo_url,
                city: data.club_city,
                status: data.club_status,
            });
            setLoading(false);
        })();
    }, [token]);

    const handleAccept = async () => {
        if (!session) { setShowAuth(true); return; }
        setProcessing(true);
        setNeedsProfile(false);
        try {
            const email = session.user.email.toLowerCase();

            const { data: player, error: playerErr } = await supabase
                .from('players')
                .select('id')
                .ilike('email', email)
                .maybeSingle();
            if (playerErr) throw playerErr;

            if (!player?.id) {
                setNeedsProfile(true);
                return;
            }

            const { error: acceptErr } = await supabase.rpc('accept_club_claim_invite', { p_token: token });
            if (acceptErr) throw acceptErr;

            sendEmail(email, 'club_claim_approved', { clubName: club.name });

            setResult('accepted');
            setTimeout(() => navigate('/admin?tab=clubs'), 2500);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to accept invite.');
        } finally {
            setProcessing(false);
        }
    };

    const handleDecline = async () => {
        setProcessing(true);
        try {
            await supabase
                .from('club_claim_invites')
                .update({ status: 'declined' })
                .eq('id', invite.id);
            setResult('declined');
        } catch (err) {
            console.error(err);
            setError(err.message || 'Failed to decline invite.');
        } finally {
            setProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-padel-green" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] text-white">
                <Navbar />
                <div className="flex items-center justify-center pt-32 px-4">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#141414] border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
                        <XCircle size={48} className="mx-auto text-red-400 mb-4" />
                        <h2 className="text-xl font-black uppercase mb-2">Invite Error</h2>
                        <p className="text-gray-400">{error}</p>
                    </motion.div>
                </div>
            </div>
        );
    }

    if (needsProfile) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] text-white">
                <Navbar />
                <div className="flex items-center justify-center pt-32 px-4">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#141414] border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
                        <XCircle size={48} className="mx-auto text-gray-400 mb-4" />
                        <h2 className="text-xl font-black uppercase mb-2">Profile Required</h2>
                        <p className="text-gray-400 mb-6">
                            To manage this club, please create your 4M Padel player profile first. Then you can accept the club claim invite.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate(`/profile?new_invite=true&claim_token=${invite?.token}`)}
                            className="w-full py-3 rounded-xl bg-padel-green text-black font-black uppercase tracking-wider text-sm flex items-center justify-center gap-2"
                        >
                            Create Profile
                        </button>
                    </motion.div>
                </div>
                <MembersOnlyModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
            </div>
        );
    }

    if (result) {
        const accepted = result === 'accepted';
        return (
            <div className="min-h-screen bg-[#0a0a0a] text-white">
                <Navbar />
                <div className="flex items-center justify-center pt-32 px-4">
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#141414] border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
                        {accepted ? <CheckCircle size={48} className="mx-auto text-padel-green mb-4" /> : <XCircle size={48} className="mx-auto text-gray-400 mb-4" />}
                        <h2 className="text-xl font-black uppercase mb-2">{accepted ? 'Club Claimed!' : 'Club Invite Declined'}</h2>
                        <p className="text-gray-400">{accepted ? `You are now the owner of ${club.name}. Redirecting to your dashboard...` : 'You have declined this invite.'}</p>
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            <Navbar />
            <div className="flex items-center justify-center pt-32 px-4">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#141414] border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
                    {club?.logo_url ? (
                        <img src={club.logo_url} alt="" className="w-20 h-20 rounded-2xl object-cover border border-white/10 mx-auto mb-4" />
                    ) : (
                        <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                            <Building size={32} className="text-gray-500" />
                        </div>
                    )}
                    <h2 className="text-xl font-black uppercase mb-1">{club?.name}</h2>
                    {club?.city && <p className="text-sm text-gray-500 mb-4">{club.city}</p>}
                    <p className="text-gray-400 mb-6">You've been invited to claim this club. As owner, you'll manage the club dashboard and can add your own admins.</p>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleDecline}
                            disabled={processing}
                            className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 font-black uppercase tracking-wider text-sm hover:bg-white/5 disabled:opacity-40"
                        >
                            Decline
                        </button>
                        <button
                            type="button"
                            onClick={handleAccept}
                            disabled={processing}
                            className="flex-1 py-3 rounded-xl bg-padel-green text-black font-black uppercase tracking-wider text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                        >
                            {processing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                            {processing ? 'Processing...' : 'Accept & Claim Club'}
                        </button>
                    </div>
                </motion.div>
            </div>

            <MembersOnlyModal
                isOpen={showAuth}
                onClose={() => setShowAuth(false)}
            />
        </div>
    );
};

export default ClaimClubInvite;
