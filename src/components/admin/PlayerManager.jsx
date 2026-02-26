import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Trash2, Edit2, Plus, X, CheckCircle, AlertCircle, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const PlayerManager = () => {
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentPlayer, setCurrentPlayer] = useState(null);
    const [toasts, setToasts] = useState([]);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        rank_label: '',
        points: '',
        win_rate: '',
        image_url: '',
        home_club: '',
        age_group: '',
        category: '',
        level: '',
        nationality: '',
        bio: '',
        sponsors: '',
        contact_number: '',
        email: '',
        gender: '',
        approved: true
    });

    useEffect(() => {
        fetchPlayers();
    }, []);

    const showToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 3000);
    };

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const fetchPlayers = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('players')
            .select('*')
            .order('points', { ascending: false });

        if (error) {
            console.error('Error fetching players:', error);
            showToast('Failed to fetch players', 'error');
        } else {
            setPlayers(data);
        }
        setLoading(false);
    };

    const handleAddNew = () => {
        setCurrentPlayer(null);
        setFormData({
            name: '',
            rank_label: '',
            points: '',
            win_rate: '',
            image_url: '',
            home_club: '',
            age_group: '',
            category: '',
            level: '',
            nationality: '',
            bio: '',
            sponsors: '',
            contact_number: '',
            email: '',
            gender: '',
            approved: true
        });
        setIsEditing(true);
    };

    const handleEdit = (player) => {
        setCurrentPlayer(player);
        let sponsorsString = '';
        if (player.sponsors) {
            try {
                const parsed = JSON.parse(player.sponsors);
                sponsorsString = Array.isArray(parsed) ? parsed.join(', ') : player.sponsors;
            } catch (e) {
                sponsorsString = player.sponsors;
            }
        }

        setFormData({
            name: player.name,
            rank_label: player.rank_label,
            points: player.points,
            win_rate: player.win_rate,
            image_url: player.image_url || '',
            home_club: player.home_club || '',
            age_group: player.age_group || '',
            category: player.category || '',
            level: player.level || '',
            nationality: player.nationality || '',
            bio: player.bio || '',
            sponsors: sponsorsString,
            contact_number: player.contact_number || '',
            email: player.email || '',
            gender: player.gender || '',
            approved: player.approved !== false
        });
        setIsEditing(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this player?')) return;

        const { error } = await supabase
            .from('players')
            .delete()
            .eq('id', id);

        if (error) {
            showToast('Error deleting player', 'error');
        } else {
            showToast('Player deleted successfully');
            fetchPlayers();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        let sponsorsArray = [];
        if (formData.sponsors && formData.sponsors.trim() !== '') {
            sponsorsArray = formData.sponsors.split(',').map(s => s.trim()).filter(Boolean);
        }
        const sponsorsJson = JSON.stringify(sponsorsArray);

        const payload = {
            name: formData.name,
            rank_label: formData.rank_label,
            points: parseInt(formData.points) || 0,
            win_rate: formData.win_rate,
            image_url: formData.image_url,
            home_club: formData.home_club,
            age_group: formData.age_group,
            category: formData.category,
            level: formData.level,
            nationality: formData.nationality,
            bio: formData.bio,
            sponsors: sponsorsJson,
            contact_number: formData.contact_number,
            email: formData.email,
            gender: formData.gender,
            approved: formData.approved
        };

        let error;
        if (currentPlayer) {
            // Update
            const { error: updateError } = await supabase
                .from('players')
                .update(payload)
                .eq('id', currentPlayer.id);
            error = updateError;
        } else {
            // Insert
            const { error: insertError } = await supabase
                .from('players')
                .insert([payload]);
            error = insertError;
        }

        if (error) {
            showToast('Error saving player: ' + error.message, 'error');
        } else {
            showToast(currentPlayer ? 'Player updated successfully' : 'Player added successfully');
            setIsEditing(false);
            setCurrentPlayer(null);
            fetchPlayers();
        }
    };

    // Pagination & Filter State
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('All');
    const itemsPerPage = 10;

    // derived state: Filtered Players
    const filteredPlayers = players.filter(player => {
        const matchesSearch = player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (player.home_club && player.home_club.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesFilter = filterCategory === 'All' || player.age_group === filterCategory;
        return matchesSearch && matchesFilter;
    });

    // Calculate Pagination on Filtered Data
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentPlayers = filteredPlayers.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredPlayers.length / itemsPerPage);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    // Reset page on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterCategory]);

    return (
        <div className="bg-[#0F172A] p-6 rounded-2xl border border-white/10 relative">
            {/* Toast Container */}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border pointer-events-auto ${toast.type === 'error'
                                ? 'bg-red-900/90 border-red-500/50 text-white'
                                : 'bg-gray-900/90 border-padel-green/50 text-white'
                                }`}
                        >
                            {toast.type === 'error' ? <AlertCircle size={20} className="text-red-400" /> : <CheckCircle size={20} className="text-padel-green" />}
                            <span className="font-medium text-sm">{toast.message}</span>
                            <button onClick={() => removeToast(toast.id)} className="ml-2 hover:opacity-70"><X size={16} /></button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Player Management</h2>
                    <p className="text-gray-400 text-sm">Manage database of {players.length} players</p>
                </div>
                <button
                    onClick={handleAddNew}
                    className="bg-padel-green text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-white transition-colors"
                >
                    <Plus size={18} /> Add Player
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search by name or club..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 pl-12 text-white focus:border-padel-green focus:outline-none"
                    />
                </div>
                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:border-padel-green focus:outline-none cursor-pointer"
                >
                    <option value="All">All Categories</option>
                    <option value="Men-Main">Men-Main</option>
                    <option value="Women-Main">Women-Main</option>
                    <option value="Men Over 35">Men Over 35</option>
                    <option value="Men Over 45">Men Over 45</option>
                    <option value="Juniors">Juniors</option>
                </select>
            </div>

            {/* Players Table */}
            <div className="overflow-x-auto rounded-lg border border-white/10 relative min-h-[400px]">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-black/50 text-gray-400 border-b border-white/10">
                            <th className="py-3 px-4 font-semibold text-sm">Name</th>
                            <th className="py-3 px-4 font-semibold text-sm">Rank</th>
                            <th className="py-3 px-4 font-semibold text-sm">Points</th>
                            <th className="py-3 px-4 font-semibold text-sm">Club</th>
                            <th className="py-3 px-4 font-semibold text-sm">Age</th>
                            <th className="py-3 px-4 text-right font-semibold text-sm">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="6" className="text-center py-12 text-gray-500">Loading players...</td></tr>
                        ) : currentPlayers.length === 0 ? (
                            <tr><td colSpan="6" className="text-center py-12 text-gray-500">No players found. Add one!</td></tr>
                        ) : (
                            currentPlayers.map(player => (
                                <tr key={player.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                    <td className="py-3 px-4 font-medium text-white group-hover:text-padel-green transition-colors">{player.name}</td>
                                    <td className="py-3 px-4 text-gray-300">{player.rank_label}</td>
                                    <td className="py-3 px-4 text-padel-green font-mono">{player.points}</td>
                                    <td className="py-3 px-4 text-gray-400 text-sm">{player.home_club}</td>
                                    <td className="py-3 px-4 text-gray-400 text-sm">{player.age_group}</td>
                                    <td className="py-3 px-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEdit(player)}
                                                className="p-1.5 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500 hover:text-white transition-colors"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(player.id)}
                                                className="p-1.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500 hover:text-white transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {!loading && filteredPlayers.length > itemsPerPage && (
                <div className="flex justify-between items-center mt-6">
                    <span className="text-sm text-gray-500">
                        Page {currentPage} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => paginate(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-3 py-2 bg-white/10 rounded-lg text-white disabled:opacity-50 hover:bg-white/20 transition-colors text-sm"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => paginate(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="px-3 py-2 bg-white/10 rounded-lg text-white disabled:opacity-50 hover:bg-white/20 transition-colors text-sm"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL - Edit/Add Player */}
            <AnimatePresence>
                {isEditing && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-[#1E293B] w-full max-w-2xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
                        >
                            <div className="flex justify-between items-center p-6 border-b border-white/10">
                                <h3 className="text-xl font-bold text-white">{currentPlayer ? 'Edit Player' : 'New Player'}</h3>
                                <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-white">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Name</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Rank Label</label>
                                        <input
                                            type="text"
                                            value={formData.rank_label}
                                            onChange={e => setFormData({ ...formData, rank_label: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Points</label>
                                        <input
                                            type="number"
                                            value={formData.points}
                                            onChange={e => setFormData({ ...formData, points: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Win Rate</label>
                                        <input
                                            type="text"
                                            value={formData.win_rate}
                                            onChange={e => setFormData({ ...formData, win_rate: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Home Club</label>
                                        <input
                                            type="text"
                                            value={formData.home_club}
                                            onChange={e => setFormData({ ...formData, home_club: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Age Group</label>
                                        <input
                                            type="text"
                                            value={formData.age_group}
                                            onChange={e => setFormData({ ...formData, age_group: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Category</label>
                                        <input
                                            type="text"
                                            value={formData.category}
                                            onChange={e => setFormData({ ...formData, category: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Level</label>
                                        <input
                                            type="text"
                                            value={formData.level}
                                            onChange={e => setFormData({ ...formData, level: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Nationality</label>
                                        <input
                                            type="text"
                                            value={formData.nationality}
                                            onChange={e => setFormData({ ...formData, nationality: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Contact Number</label>
                                        <input
                                            type="text"
                                            value={formData.contact_number}
                                            onChange={e => setFormData({ ...formData, contact_number: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Email</label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Gender</label>
                                        <select
                                            value={formData.gender}
                                            onChange={e => setFormData({ ...formData, gender: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        >
                                            <option value="">Select Gender</option>
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Sponsors (comma separated)</label>
                                        <input
                                            type="text"
                                            value={formData.sponsors}
                                            onChange={e => setFormData({ ...formData, sponsors: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-gray-400 text-sm mb-1">Image URL</label>
                                        <input
                                            type="text"
                                            value={formData.image_url}
                                            onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-gray-400 text-sm mb-1">Bio</label>
                                        <textarea
                                            value={formData.bio}
                                            onChange={e => setFormData({ ...formData, bio: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                            rows="3"
                                        />
                                    </div>
                                    <div className="md:col-span-2 flex items-center gap-2 mt-2">
                                        <input
                                            type="checkbox"
                                            id="approved"
                                            checked={formData.approved}
                                            onChange={e => setFormData({ ...formData, approved: e.target.checked })}
                                            className="w-4 h-4 accent-padel-green"
                                        />
                                        <label htmlFor="approved" className="text-gray-300 text-sm font-medium cursor-pointer">
                                            Approved (Visible to public)
                                        </label>
                                    </div>
                                </div>
                                <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
                                    <button
                                        type="button"
                                        onClick={() => setIsEditing(false)}
                                        className="bg-gray-700 text-white px-6 py-2 rounded-lg font-bold hover:bg-gray-600 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="bg-padel-green text-black px-6 py-2 rounded-lg font-bold hover:bg-white transition-colors"
                                    >
                                        Save Player
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PlayerManager;
