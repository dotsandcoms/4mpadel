import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { X, Search, Loader2, GitMerge, Building2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../supabaseClient';

/**
 * Merge a duplicate club record into another one. Moves players, memberships,
 * linked orgs, and claim requests/invites from the source into the target
 * (de-duplicating anything the target already has), backfills any empty
 * profile fields on the target, then permanently deletes the source club.
 * Backed by the public.merge_clubs(source, target) DB function.
 */
const MergeClubModal = ({ sourceClub, onClose, onMerged }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [target, setTarget] = useState(null);
    const [sourceCounts, setSourceCounts] = useState(null);
    const [targetCounts, setTargetCounts] = useState(null);
    const [loadingCounts, setLoadingCounts] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [merging, setMerging] = useState(false);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            return undefined;
        }
        setSearching(true);
        const timer = setTimeout(async () => {
            try {
                const safe = q.replace(/[%_,]/g, ' ').trim();
                const { data, error } = await supabase
                    .from('clubs')
                    .select('id, name, short_name, city, logo_url')
                    .or(`name.ilike.%${safe}%,short_name.ilike.%${safe}%`)
                    .neq('id', sourceClub.id)
                    .order('name')
                    .limit(8);
                if (error) throw error;
                setResults(data || []);
            } catch (err) {
                console.error(err);
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query, sourceClub.id]);

    const countsFor = async (clubId) => {
        const [players, members, orgs] = await Promise.all([
            supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
            supabase.from('club_members').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
            supabase.from('club_organisations').select('id', { count: 'exact', head: true }).eq('club_id', clubId),
        ]);
        return {
            players: players.count || 0,
            members: members.count || 0,
            orgs: orgs.count || 0,
        };
    };

    const selectTarget = async (club) => {
        setTarget(club);
        setResults([]);
        setQuery('');
        setConfirmed(false);
        setLoadingCounts(true);
        try {
            const [sc, tc] = await Promise.all([countsFor(sourceClub.id), countsFor(club.id)]);
            setSourceCounts(sc);
            setTargetCounts(tc);
        } catch (err) {
            console.error(err);
            toast.error('Failed to load merge preview counts');
        } finally {
            setLoadingCounts(false);
        }
    };

    const handleMerge = async () => {
        if (!target) return;
        setMerging(true);
        try {
            const { data, error } = await supabase.rpc('merge_clubs', {
                p_source_id: sourceClub.id,
                p_target_id: target.id,
            });
            if (error) throw error;
            toast.success(
                `Merged "${data.source_name}" into "${data.target_name}" — ${data.players_moved} players, ${data.members_moved} members, ${data.orgs_moved} org links moved`,
            );
            onMerged?.();
            onClose();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Merge failed');
        } finally {
            setMerging(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => { if (!merging) onClose(); }}
        >
            <div
                className="bg-[#141414] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black text-white uppercase tracking-wide flex items-center gap-2">
                        <GitMerge size={18} className="text-padel-green" /> Merge Duplicate Club
                    </h3>
                    <button type="button" disabled={merging} onClick={onClose} className="text-gray-500 hover:text-white disabled:opacity-40">
                        <X size={18} />
                    </button>
                </div>

                <p className="text-sm text-gray-400 mb-4">
                    Merging <span className="text-white font-bold">{sourceClub.name}</span> into another club moves its
                    players, owners/admins, and linked organisations across, then permanently deletes{' '}
                    <span className="text-white font-bold">{sourceClub.name}</span>.
                </p>

                {!target ? (
                    <>
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                            Merge into which club?
                        </label>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search for the club to keep…"
                                autoFocus
                                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-padel-green"
                            />
                            {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />}
                        </div>
                        {results.length > 0 && (
                            <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto">
                                {results.map((club) => (
                                    <button
                                        key={club.id}
                                        type="button"
                                        onClick={() => selectTarget(club)}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-left"
                                    >
                                        {club.logo_url ? (
                                            <img src={club.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                                        ) : (
                                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                                <Building2 size={14} className="text-gray-500" />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-sm text-white font-bold truncate">{club.name}</p>
                                            <p className="text-[10px] text-gray-500 truncate">{club.city || 'No city set'}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-3">
                            <p className="text-xs text-gray-500 mb-1">Merging</p>
                            <p className="text-sm text-white font-bold">{sourceClub.name} <span className="text-gray-500 font-normal">→</span> {target.name}</p>
                            <button
                                type="button"
                                onClick={() => { setTarget(null); setSourceCounts(null); setTargetCounts(null); }}
                                className="text-[10px] font-bold text-gray-400 hover:text-white mt-1.5"
                            >
                                Choose a different club
                            </button>
                        </div>

                        {loadingCounts ? (
                            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
                                <Loader2 size={14} className="animate-spin" /> Loading preview…
                            </div>
                        ) : (
                            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 mb-4 space-y-1.5">
                                <p className="text-xs text-amber-300/90 flex items-center gap-1.5 font-bold">
                                    <AlertTriangle size={12} /> This cannot be undone
                                </p>
                                <p className="text-xs text-gray-300">
                                    {sourceCounts?.players || 0} players, {sourceCounts?.members || 0} owners/admins, and{' '}
                                    {sourceCounts?.orgs || 0} linked orgs will move from{' '}
                                    <span className="text-white font-bold">{sourceClub.name}</span> into{' '}
                                    <span className="text-white font-bold">{target.name}</span> (which already has{' '}
                                    {targetCounts?.players || 0} players, {targetCounts?.members || 0} owners/admins).
                                </p>
                                <p className="text-xs text-gray-300">
                                    <span className="text-white font-bold">{sourceClub.name}</span> will then be permanently deleted.
                                    Any empty profile fields on {target.name} will be filled from {sourceClub.name} first.
                                </p>
                            </div>
                        )}

                        <label className="flex items-start gap-2.5 text-xs text-gray-300 cursor-pointer mb-4">
                            <input
                                type="checkbox"
                                checked={confirmed}
                                onChange={(e) => setConfirmed(e.target.checked)}
                                className="mt-0.5"
                            />
                            <span>I understand this permanently deletes "{sourceClub.name}" and cannot be undone.</span>
                        </label>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={merging}
                                onClick={onClose}
                                className="flex-1 py-3 rounded-xl border border-white/10 text-gray-300 font-black uppercase tracking-wider text-sm hover:bg-white/5 disabled:opacity-40"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleMerge}
                                disabled={merging || !confirmed || loadingCounts}
                                className="flex-1 py-3 rounded-xl bg-padel-green text-black font-black uppercase tracking-wider text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                            >
                                {merging ? <Loader2 size={16} className="animate-spin" /> : <GitMerge size={16} />}
                                {merging ? 'Merging…' : 'Merge clubs'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default MergeClubModal;
