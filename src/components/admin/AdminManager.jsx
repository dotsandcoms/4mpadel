import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../supabaseClient';
import { Shield, Plus, Trash2, Edit2, X, Check, Search, Filter, AlertCircle, Key } from 'lucide-react';
import { toast } from 'sonner';

const AdminManager = () => {
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAdmin, setEditingAdmin] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Player Search State
    const [playerSearchTerm, setPlayerSearchTerm] = useState('');
    const [playerSearchResults, setPlayerSearchResults] = useState([]);
    const [isSearchingPlayers, setIsSearchingPlayers] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        email: '',
        role: 'custom',
        allowed_tabs: [],
        module_permissions: {},
        selectedPlayer: null
    });

    const [allEvents, setAllEvents] = useState([]);
    const [eventSelectorSearch, setEventSelectorSearch] = useState('');

    const ALL_MODULES = [
        { id: 'players', label: 'Players' },
        { id: 'coaches', label: 'Coaches' },
        { id: 'blog', label: 'Blog' },
        { id: 'calendar', label: 'Calendar' },
        { id: 'gallery', label: 'Gallery' },
        { id: 'finance', label: 'Finance' },
        { id: 'settings', label: 'Settings' }
    ];

    useEffect(() => {
        fetchAdmins();
        fetchAllEvents();
    }, []);

    const fetchAllEvents = async () => {
        try {
            const { data, error } = await supabase
                .from('calendar')
                .select('id, event_name')
                .order('start_date', { ascending: false });
            if (error) throw error;
            setAllEvents(data || []);
        } catch (err) {
            console.error('Error fetching events:', err);
        }
    };

    // Player search effect with debounce
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (playerSearchTerm.length >= 3) {
                searchPlayers();
            } else {
                setPlayerSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [playerSearchTerm]);

    const searchPlayers = async () => {
        try {
            setIsSearchingPlayers(true);
            const { data, error } = await supabase
                .from('players')
                .select('id, name, email')
                .or(`name.ilike.%${playerSearchTerm}%,email.ilike.%${playerSearchTerm}%`)
                .limit(5);

            if (error) throw error;
            setPlayerSearchResults(data || []);
        } catch (err) {
            console.error('Error searching players:', err);
        } finally {
            setIsSearchingPlayers(false);
        }
    };

    const selectPlayer = (player) => {
        setFormData(prev => ({ 
            ...prev, 
            email: player.email,
            selectedPlayer: player
        }));
        setPlayerSearchTerm('');
        setPlayerSearchResults([]);
    };

    const fetchAdmins = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('admin_sidebar_permissions')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setAdmins(data || []);
        } catch (err) {
            console.error('Error fetching admins:', err);
            toast.error(`Failed to load: ${err.message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const { error } = await supabase
                .from('admin_sidebar_permissions')
                .upsert({
                    email: formData.email,
                    role: formData.role,
                    allowed_tabs: formData.role === 'super_admin' ? [] : formData.allowed_tabs,
                    module_permissions: formData.role === 'super_admin' ? {} : formData.module_permissions
                });

            if (error) throw error;

            toast.success(editingAdmin ? 'Permissions updated' : 'Admin added');
            setIsModalOpen(false);
            setEditingAdmin(null);
            setFormData({ email: '', role: 'custom', allowed_tabs: [], module_permissions: {} });
            setEventSelectorSearch('');
            fetchAdmins();
        } catch (err) {
            console.error('Error saving admin:', err);
            toast.error(err.message || 'Failed to save admin');
        }
    };

    const handleDelete = async (email) => {
        if (!window.confirm(`Are you sure you want to remove permissions for ${email}?`)) return;

        try {
            const { error } = await supabase
                .from('admin_sidebar_permissions')
                .delete()
                .ilike('email', email);

            if (error) throw error;
            toast.success('Admin removed');
            fetchAdmins();
        } catch (err) {
            console.error('Error deleting admin:', err);
            toast.error('Failed to remove admin');
        }
    };

    const toggleTab = (tabId) => {
        setFormData(prev => {
            const isRemoving = prev.allowed_tabs.includes(tabId);
            const nextAllowedTabs = isRemoving
                ? prev.allowed_tabs.filter(id => id !== tabId)
                : [...prev.allowed_tabs, tabId];

            // If enabling finance, seed defaults if they don't exist
            let nextModulePerms = { ...prev.module_permissions };
            if (!isRemoving && tabId === 'finance' && !nextModulePerms.finance) {
                nextModulePerms.finance = {
                    allowedTabs: ['events'],
                    allowedEvents: []
                };
            }

            return {
                ...prev,
                allowed_tabs: nextAllowedTabs,
                module_permissions: nextModulePerms
            };
        });
    };

    const generateStrongPassword = () => {
        const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
        let pass = "";
        for (let i = 0; i < 16; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return pass;
    };

    const filteredAdmins = admins.filter(admin => 
        admin.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Admin Permissions</h1>
                    <p className="text-gray-400">Manage who can access specific modules in the dashboard</p>
                </div>
                <button
                    onClick={() => {
                        setEditingAdmin(null);
                        setPlayerSearchTerm('');
                        setPlayerSearchResults([]);
                        setEventSelectorSearch('');
                        setFormData({ email: '', role: 'custom', allowed_tabs: [], module_permissions: {}, selectedPlayer: null });
                        setIsModalOpen(true);
                    }}
                    className="flex items-center gap-2 bg-padel-green text-black px-6 py-3 rounded-xl font-bold hover:scale-105 transition-all shadow-lg shadow-padel-green/20"
                >
                    <Plus size={20} />
                    Add New Admin
                </button>
            </div>

            <div className="bg-[#1E293B]/50 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden">
                <div className="p-6 border-b border-white/10 flex flex-col md:flex-row gap-4 justify-between">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Search by email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-padel-green transition-all"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left bg-black/20">
                                <th className="px-6 py-4 text-gray-400 font-bold uppercase text-xs tracking-wider">Admin Email</th>
                                <th className="px-6 py-4 text-gray-400 font-bold uppercase text-xs tracking-wider">Role</th>
                                <th className="px-6 py-4 text-gray-400 font-bold uppercase text-xs tracking-wider">Allowed Modules</th>
                                <th className="px-6 py-4 text-gray-400 font-bold uppercase text-xs tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-gray-500">Loading admins...</td>
                                </tr>
                            ) : filteredAdmins.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-12 text-center text-gray-500">No admin permissions found</td>
                                </tr>
                            ) : (
                                filteredAdmins.map((admin) => (
                                    <tr key={admin.email} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-padel-green/10 flex items-center justify-center">
                                                    <Shield size={16} className="text-padel-green" />
                                                </div>
                                                <span className="text-white font-medium">{admin.email}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                admin.role === 'super_admin' 
                                                    ? 'bg-padel-green/20 text-padel-green border border-padel-green/30' 
                                                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                            }`}>
                                                {admin.role.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1.5">
                                                {admin.role === 'super_admin' ? (
                                                    <span className="text-xs text-padel-green font-bold">ALL ACCESS</span>
                                                ) : admin.allowed_tabs?.length > 0 ? (
                                                    admin.allowed_tabs.map(tab => (
                                                        <span key={tab} className="bg-white/5 border border-white/10 px-2 py-0.5 rounded text-[10px] text-gray-400 uppercase font-bold">
                                                            {tab}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-gray-500 italic">None</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => {
                                                        setEditingAdmin(admin);
                                                        setPlayerSearchTerm('');
                                                        setPlayerSearchResults([]);
                                                        setFormData({
                                                            email: admin.email,
                                                            role: admin.role,
                                                            allowed_tabs: admin.allowed_tabs || [],
                                                            module_permissions: admin.module_permissions || {},
                                                            selectedPlayer: null
                                                        });
                                                        setIsModalOpen(true);
                                                    }}
                                                    className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(admin.email)}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                    <div className="bg-[#1E293B] border border-white/10 w-full max-w-xl rounded-3xl overflow-hidden relative z-10 shadow-2xl max-h-[90vh] flex flex-col">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white">
                                {editingAdmin ? 'Edit Permissions' : 'Add New Admin'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white p-2">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="flex-1 overflow-hidden flex flex-col">
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            <div className="space-y-4">
                                {!editingAdmin && (
                                    <div className="relative">
                                        <label className="block text-sm font-bold text-padel-green uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <Search size={14} />
                                            Search Existing Player
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={playerSearchTerm}
                                                onChange={(e) => setPlayerSearchTerm(e.target.value)}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-padel-green text-sm"
                                                placeholder="Search by name or email (min 3 chars)..."
                                            />
                                            {isSearchingPlayers && (
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-padel-green"></div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Search Results Dropdown */}
                                        {playerSearchResults.length > 0 && (
                                            <div className="absolute z-50 left-0 right-0 mt-2 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden divide-y divide-white/5">
                                                {playerSearchResults.map(player => (
                                                    <button
                                                        key={player.id}
                                                        type="button"
                                                        onClick={() => selectPlayer(player)}
                                                        className="w-full px-4 py-3 flex flex-col items-start hover:bg-white/5 transition-colors text-left"
                                                    >
                                                        <span className="text-white font-bold text-sm">
                                                            {player.name}
                                                        </span>
                                                        <span className="text-gray-400 text-xs">{player.email}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {formData.selectedPlayer && (
                                            <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-padel-green/10 border border-padel-green/30 rounded-lg w-fit">
                                                <Check size={12} className="text-padel-green" />
                                                <span className="text-[10px] text-padel-green font-bold uppercase tracking-wider">
                                                    Linked to: {formData.selectedPlayer.name}
                                                </span>
                                                <button 
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, selectedPlayer: null, email: '' }))}
                                                    className="ml-2 text-padel-green/50 hover:text-padel-green"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        )}
                                        <p className="text-[10px] text-gray-500 mt-1">
                                            Quickly find a player to pre-fill the email below.
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
                                    <input
                                        type="email"
                                        required
                                        disabled={!!editingAdmin}
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-padel-green disabled:opacity-50"
                                        placeholder="e.g. marketing@4mpadel.co.za"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Role</label>
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-padel-green"
                                    >
                                        <option value="custom">Custom Permissions</option>
                                        <option value="super_admin">Super Admin (All Access)</option>
                                    </select>
                                </div>

                                {formData.role === 'custom' && (
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Allowed Modules</label>
                                            <div className="grid grid-cols-2 gap-3">
                                                {ALL_MODULES.map(module => (
                                                    <button
                                                        key={module.id}
                                                        type="button"
                                                        onClick={() => toggleTab(module.id)}
                                                        className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                                                            formData.allowed_tabs.includes(module.id)
                                                                ? 'bg-padel-green/10 border-padel-green text-padel-green'
                                                                : 'bg-black/30 border-white/5 text-gray-400 hover:border-white/20'
                                                        }`}
                                                    >
                                                        <span className="font-medium">{module.label}</span>
                                                        {formData.allowed_tabs.includes(module.id) && <Check size={16} />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Finance Sub-permissions */}
                                        {formData.allowed_tabs.includes('finance') && (
                                            <motion.div 
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                className="bg-black/20 rounded-2xl p-4 border border-white/5 space-y-3"
                                            >
                                                <div className="flex items-center gap-2 text-padel-green mb-1">
                                                    <Shield size={16} />
                                                    <span className="text-xs font-black uppercase tracking-widest">Finance Granular Access</span>
                                                </div>

                                                <div className="space-y-3">
                                                    <label className="block text-[10px] font-bold text-gray-500 uppercase">Restrict to Tabs</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {[
                                                            { id: 'dashboard', label: 'Dashboard' },
                                                            { id: 'users', label: 'User Payments' },
                                                            { id: 'events', label: 'Event Finance' },
                                                            { id: 'transactions', label: 'Transactions' },
                                                            { id: 'summary', label: 'Summary Report' }
                                                        ].map(tab => {
                                                            const isChecked = formData.module_permissions.finance?.allowedTabs?.includes(tab.id) ?? true;
                                                            return (
                                                                <button
                                                                    key={tab.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const current = formData.module_permissions.finance?.allowedTabs ?? ['dashboard', 'users', 'events', 'transactions', 'summary'];
                                                                        const next = isChecked 
                                                                            ? current.filter(id => id !== tab.id)
                                                                            : [...current, tab.id];
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            module_permissions: {
                                                                                ...prev.module_permissions,
                                                                                finance: {
                                                                                    ...prev.module_permissions.finance,
                                                                                    allowedTabs: next
                                                                                }
                                                                            }
                                                                        }));
                                                                    }}
                                                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                                                                        isChecked 
                                                                            ? 'bg-padel-green text-black border-padel-green' 
                                                                            : 'bg-white/5 text-gray-500 border-white/10 hover:border-white/20'
                                                                    }`}
                                                                >
                                                                    {tab.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <label className="block text-[10px] font-bold text-gray-500 uppercase">Restrict to Specific Events</label>
                                                    <div className="space-y-3">
                                                        <div className="relative">
                                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={12} />
                                                            <input
                                                                type="text"
                                                                placeholder="Search events by name..."
                                                                value={eventSelectorSearch}
                                                                onChange={(e) => setEventSelectorSearch(e.target.value)}
                                                                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-xs focus:outline-none focus:border-padel-green"
                                                            />
                                                        </div>

                                                        {eventSelectorSearch.length > 0 && (
                                                            <div className="bg-black/40 border border-white/10 rounded-xl overflow-hidden max-h-[150px] overflow-y-auto divide-y divide-white/5">
                                                                {allEvents
                                                                    .filter(e => 
                                                                        e.event_name.toLowerCase().includes(eventSelectorSearch.toLowerCase()) && 
                                                                        !(formData.module_permissions.finance?.allowedEvents || []).includes(e.id)
                                                                    )
                                                                    .map(event => (
                                                                        <button
                                                                            key={event.id}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const current = formData.module_permissions.finance?.allowedEvents ?? [];
                                                                                setFormData(prev => ({
                                                                                    ...prev,
                                                                                    module_permissions: {
                                                                                        ...prev.module_permissions,
                                                                                        finance: {
                                                                                            ...prev.module_permissions.finance,
                                                                                            allowedEvents: [...current, event.id]
                                                                                        }
                                                                                    }
                                                                                }));
                                                                                setEventSelectorSearch('');
                                                                            }}
                                                                            className="w-full px-4 py-2 text-left hover:bg-white/5 text-[10px] text-gray-300 transition-colors"
                                                                        >
                                                                            {event.event_name}
                                                                        </button>
                                                                    ))}
                                                                {allEvents.filter(e => 
                                                                    e.event_name.toLowerCase().includes(eventSelectorSearch.toLowerCase()) && 
                                                                    !(formData.module_permissions.finance?.allowedEvents || []).includes(e.id)
                                                                ).length === 0 && (
                                                                    <div className="px-4 py-3 text-[10px] text-gray-600 italic">No matching events found</div>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div className="flex flex-wrap gap-2">
                                                            {formData.module_permissions.finance?.allowedEvents?.map(eventId => {
                                                                const event = allEvents.find(e => e.id === eventId);
                                                                return (
                                                                    <div key={eventId} className="bg-white/5 border border-white/10 pl-3 pr-1 py-1 rounded-lg flex items-center gap-2 group">
                                                                        <span className="text-[10px] text-gray-400 font-bold max-w-[150px] truncate">
                                                                            {event?.event_name || 'Unknown Event'}
                                                                        </span>
                                                                        <button 
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setFormData(prev => ({
                                                                                    ...prev,
                                                                                    module_permissions: {
                                                                                        ...prev.module_permissions,
                                                                                        finance: {
                                                                                            ...prev.module_permissions.finance,
                                                                                            allowedEvents: prev.module_permissions.finance.allowedEvents.filter(id => id !== eventId)
                                                                                        }
                                                                                    }
                                                                                }));
                                                                            }}
                                                                            className="p-1 hover:text-red-500 text-gray-600 transition-colors"
                                                                        >
                                                                            <X size={12} />
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                            {(!formData.module_permissions.finance?.allowedEvents || formData.module_permissions.finance.allowedEvents.length === 0) && (
                                                                <span className="text-[10px] text-gray-600 italic">No event restrictions (Full Access)</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                )}

                                {!editingAdmin && !formData.selectedPlayer && (
                                    <div className="p-4 bg-padel-green/5 border border-padel-green/20 rounded-2xl">
                                        <div className="flex items-center gap-3 mb-2">
                                            <Key size={16} className="text-padel-green" />
                                            <span className="text-padel-green font-bold text-sm uppercase">Suggested Password</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                            <code className="text-white font-mono text-sm bg-black/40 px-3 py-1 rounded select-all">
                                                {generateStrongPassword()}
                                            </code>
                                            <p className="text-[10px] text-gray-500 uppercase font-bold text-right">
                                                Note: You must manually create this <br/>user in Supabase Auth.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {formData.selectedPlayer && (
                                    <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl flex items-start gap-4">
                                        <Shield size={20} className="text-blue-400 mt-1 shrink-0" />
                                        <div>
                                            <p className="text-white font-bold text-sm mb-1">Existing Player Profile Found</p>
                                            <p className="text-xs text-gray-400 leading-relaxed">
                                                This player already has a profile. Granting permissions will link their existing login to the admin dashboard. **No new password is required.**
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-6 border-t border-white/10 bg-black/20">
                            <button
                                type="submit"
                                className="w-full bg-padel-green text-black font-bold py-4 rounded-xl hover:scale-[1.02] transition-all shadow-lg shadow-padel-green/20"
                            >
                                {editingAdmin ? 'Update Permissions' : 'Grant Permissions'}
                            </button>
                        </div>
                    </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminManager;
