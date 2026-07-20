import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';
import { X, Users, Trash2, Search, UserPlus } from 'lucide-react';

const ROLES = ['owner', 'admin', 'staff'];

const roleBadgeClass = (role) => {
    switch (role) {
        case 'owner': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
        case 'admin': return 'bg-padel-green/10 text-padel-green border-padel-green/20';
        default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
};

/**
 * Manage federation_members for a federation (super-admin / federation owner).
 */
const FederationMembersManager = ({ federation, onClose }) => {
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
                .from('federation_members')
                .select('*, players!player_id(id, name, image_url, email)')
                .eq('federation_id', federation.id)
                .order('created_at', { ascending: true });
            if (error) throw error;
            setMembers(data || []);
        } catch (err) {
            console.error(err);
            toast.error(`Could not load members: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMembers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [federation.id]);

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
                const memberEmails = new Set(members.map((m) => (m.user_email || '').toLowerCase()));
                setSearchResults((data || []).filter((p) => p.email && !memberEmails.has(p.email.toLowerCase())));
            } catch (err) {
                console.error(err);
            } finally {
                setIsSearching(false);
            }
        }, 350);
        return () => clearTimeout(t);
    }, [searchQuery, members]);

    const handleAddMember = async (player) => {
        setIsAdding(true);
        try {
            const { error } = await supabase.from('federation_members').insert({
                federation_id: federation.id,
                player_id: player.id,
                user_email: player.email,
                role: newRole,
            });
            if (error) throw error;
            toast.success(`${player.name} added as ${newRole}`);
            setSearchQuery('');
            setSearchResults([]);
            fetchMembers();
        } catch (err) {
            toast.error(err.code === '23505' ? 'Already a member.' : err.message);
        } finally {
            setIsAdding(false);
        }
    };

    const handleRoleChange = async (memberId, role) => {
        try {
            const { error } = await supabase.from('federation_members').update({ role }).eq('id', memberId);
            if (error) throw error;
            toast.success('Role updated');
            fetchMembers();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleRemove = async (memberId) => {
        try {
            const { error } = await supabase.from('federation_members').delete().eq('id', memberId);
            if (error) throw error;
            toast.success('Member removed');
            fetchMembers();
        } catch (err) {
            toast.error(err.message);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <h3 className="text-white font-bold flex items-center gap-2">
                        <Users size={16} className="text-padel-green" />
                        {federation.short_name || federation.name} members
                    </h3>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search players…"
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white"
                            />
                        </div>
                        <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-xl px-2 text-sm text-white"
                        >
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    {(isSearching || searchResults.length > 0) && (
                        <div className="bg-black/40 border border-white/10 rounded-xl divide-y divide-white/5">
                            {searchResults.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    disabled={isAdding}
                                    onClick={() => handleAddMember(p)}
                                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5"
                                >
                                    <span className="text-sm text-white">{p.name}</span>
                                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                        <UserPlus size={12} /> {p.email}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                    {loading ? (
                        <p className="text-gray-500 text-sm">Loading…</p>
                    ) : members.length === 0 ? (
                        <p className="text-gray-500 text-sm">No members yet.</p>
                    ) : (
                        <ul className="space-y-2">
                            {members.map((m) => (
                                <li key={m.id} className="flex items-center gap-3 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white truncate">{m.players?.name || m.user_email}</p>
                                        <p className="text-[10px] text-gray-500 truncate">{m.user_email}</p>
                                    </div>
                                    <select
                                        value={m.role}
                                        onChange={(e) => handleRoleChange(m.id, e.target.value)}
                                        className={`text-[10px] font-bold uppercase border rounded-lg px-2 py-1 bg-transparent ${roleBadgeClass(m.role)}`}
                                    >
                                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                    <button type="button" onClick={() => handleRemove(m.id)} className="text-red-400 hover:text-red-300">
                                        <Trash2 size={14} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FederationMembersManager;
