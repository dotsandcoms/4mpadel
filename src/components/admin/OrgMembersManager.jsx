import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { X, Users, Trash2, ShieldCheck, Search, UserPlus, Crown } from 'lucide-react';

const ROLES = ['owner', 'admin', 'staff'];

const roleBadgeClass = (role) => {
    switch (role) {
        case 'owner': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        case 'admin': return 'bg-padel-green/10 text-padel-green border-padel-green/20';
        default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
};

/**
 * Super-admin modal to assign existing users (players) as members/admins
 * of an organisation. Backed by public.organization_members.
 */
const OrgMembersManager = ({ org, onClose }) => {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [newRole, setNewRole] = useState('admin');
    const [isAdding, setIsAdding] = useState(false);

    const fetchMembers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('organization_members')
                .select('*, players!player_id(id, name, image_url, email)')
                .eq('organization_id', org.id)
                .order('created_at', { ascending: true });
            if (error) throw error;
            setMembers(data || []);
        } catch (err) {
            console.error('Failed to load org members:', err);
            toast.error(`Could not load members: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMembers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [org.id]);

    // Debounced player search by name or email
    useEffect(() => {
        if (!searchQuery.trim() || searchQuery.trim().length < 2) {
            setSearchResults([]);
            return;
        }
        const t = setTimeout(async () => {
            setIsSearching(true);
            try {
                const q = searchQuery.trim();
                const { data, error } = await supabase
                    .from('players')
                    .select('id, name, email, image_url')
                    .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
                    .not('email', 'is', null)
                    .limit(8);
                if (error) throw error;
                const memberEmails = new Set(members.map(m => (m.user_email || '').toLowerCase()));
                setSearchResults((data || []).filter(p => p.email && !memberEmails.has(p.email.toLowerCase())));
            } catch (err) {
                console.error('Player search failed:', err);
            } finally {
                setIsSearching(false);
            }
        }, 350);
        return () => clearTimeout(t);
    }, [searchQuery, members]);

    const handleAddMember = async (player) => {
        setIsAdding(true);
        try {
            const { error } = await supabase
                .from('organization_members')
                .insert({
                    organization_id: org.id,
                    player_id: player.id,
                    user_email: player.email,
                    role: newRole
                });
            if (error) throw error;
            toast.success(`${player.name} added as ${newRole} of ${org.name}`);
            setSearchQuery('');
            setSearchResults([]);
            fetchMembers();
        } catch (err) {
            console.error('Failed to add member:', err);
            toast.error(err.code === '23505'
                ? 'That user is already a member of this organisation.'
                : `Failed to add member: ${err.message}`);
        } finally {
            setIsAdding(false);
        }
    };

    const handleChangeRole = async (member, role) => {
        try {
            const { error } = await supabase
                .from('organization_members')
                .update({ role })
                .eq('id', member.id);
            if (error) throw error;
            setMembers(prev => prev.map(m => m.id === member.id ? { ...m, role } : m));
            toast.success(`Role updated to ${role}`);
        } catch (err) {
            toast.error(`Failed to update role: ${err.message}`);
        }
    };

    const handleRemove = async (member) => {
        const label = member.players?.name || member.user_email;
        if (!window.confirm(`Remove ${label} from ${org.name}?`)) return;
        try {
            const { error } = await supabase
                .from('organization_members')
                .delete()
                .eq('id', member.id);
            if (error) throw error;
            setMembers(prev => prev.filter(m => m.id !== member.id));
            toast.success(`${label} removed`);
        } catch (err) {
            toast.error(`Failed to remove member: ${err.message}`);
        }
    };

    const ownerCount = useMemo(() => members.filter(m => m.role === 'owner').length, [members]);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[250] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="max-w-lg w-full bg-[#0F172A] border border-white/10 rounded-3xl p-6 relative shadow-2xl space-y-6 text-left max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                >
                    <X size={16} />
                </button>

                <div className="flex items-center gap-3 pr-8">
                    <div className="w-12 h-12 bg-padel-green/10 text-padel-green rounded-2xl flex items-center justify-center shrink-0 border border-padel-green/20">
                        <Users size={22} />
                    </div>
                    <div>
                        <h3 className="font-extrabold text-white text-lg leading-tight">Organisation Members</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{org.name}</p>
                    </div>
                </div>

                {/* Add member */}
                <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-3">
                    <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider">
                        Assign existing user
                    </span>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search players by name or email..."
                                className="w-full bg-black/40 border border-white/10 text-white rounded-xl pl-9 pr-4 py-2.5 text-xs focus:outline-none focus:border-padel-green transition-colors placeholder:text-gray-600"
                            />
                        </div>
                        <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                            className="bg-black/40 border border-white/10 text-white rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-padel-green cursor-pointer"
                        >
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>

                    {isSearching && <p className="text-[10px] text-gray-500 uppercase tracking-wider">Searching...</p>}
                    {searchResults.length > 0 && (
                        <div className="space-y-1.5">
                            {searchResults.map(p => (
                                <button
                                    key={p.id}
                                    disabled={isAdding}
                                    onClick={() => handleAddMember(p)}
                                    className="w-full flex items-center gap-3 bg-white/[0.03] hover:bg-padel-green/10 border border-white/5 hover:border-padel-green/30 p-2.5 rounded-xl transition-all text-left cursor-pointer disabled:opacity-50"
                                >
                                    {p.image_url ? (
                                        <img src={p.image_url} alt={p.name} className="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 text-xs font-black shrink-0">
                                            {p.name?.charAt(0) || '?'}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs font-bold text-white block truncate">{p.name}</span>
                                        <span className="text-[10px] text-gray-500 block truncate">{p.email}</span>
                                    </div>
                                    <UserPlus size={14} className="text-padel-green shrink-0" />
                                </button>
                            ))}
                        </div>
                    )}
                    {searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
                        <p className="text-[10px] text-gray-500">No matching users with an email on file.</p>
                    )}
                </div>

                {/* Members list */}
                <div className="space-y-2.5">
                    <span className="block text-gray-500 text-[10px] font-black uppercase tracking-wider">
                        Current members ({members.length})
                    </span>
                    {loading ? (
                        <p className="text-xs text-gray-500 py-3">Loading members...</p>
                    ) : members.length === 0 ? (
                        <p className="text-xs text-gray-500 py-3">
                            No members assigned yet. Search above to assign a user.
                        </p>
                    ) : (
                        members.map(m => (
                            <div key={m.id} className="flex items-center gap-3 bg-black/30 border border-white/5 p-3 rounded-xl">
                                {m.players?.image_url ? (
                                    <img src={m.players.image_url} alt={m.players?.name} className="w-9 h-9 rounded-lg object-cover border border-white/10 shrink-0" />
                                ) : (
                                    <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 text-xs font-black shrink-0">
                                        {(m.players?.name || m.user_email).charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs font-bold text-white block truncate flex items-center gap-1.5">
                                        {m.players?.name || m.user_email}
                                        {m.role === 'owner' && <Crown size={11} className="text-amber-400 shrink-0" />}
                                    </span>
                                    <span className="text-[10px] text-gray-500 block truncate">{m.user_email}</span>
                                </div>
                                <select
                                    value={m.role}
                                    onChange={(e) => handleChangeRole(m, e.target.value)}
                                    className={`border rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-wider cursor-pointer focus:outline-none bg-transparent ${roleBadgeClass(m.role)}`}
                                >
                                    {ROLES.map(r => <option key={r} value={r} className="bg-[#0F172A] text-white">{r}</option>)}
                                </select>
                                <button
                                    onClick={() => handleRemove(m)}
                                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                    title="Remove member"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))
                    )}
                    {ownerCount === 0 && members.length > 0 && (
                        <p className="text-[10px] text-amber-400 flex items-center gap-1.5">
                            <ShieldCheck size={12} /> Tip: assign at least one owner for this organisation.
                        </p>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

export default OrgMembersManager;
