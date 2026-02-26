import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { Trash2, Edit2, Plus, Save, X, Search, Filter, ChevronLeft, ChevronRight, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const TournamentManager = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentEvent, setCurrentEvent] = useState(null);

    // Toast State
    const [toasts, setToasts] = useState([]);

    // Pagination & Filter State
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCity, setFilterCity] = useState('All');
    const [filterCategory, setFilterCategory] = useState('All');
    const ITEMS_PER_PAGE = 10;

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        date: '',
        time: '',
        location: '',
        city: '',
        organiser: '',
        venue: '',
        sapa_category: '',
        status: 'upcoming'
    });

    useEffect(() => {
        fetchEvents();
    }, [page, searchQuery, filterCity, filterCategory]);

    const showToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 3000);
    };

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const fetchEvents = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('events')
                .select('*', { count: 'exact' });

            // Apply Filters
            if (searchQuery) {
                query = query.or(`title.ilike.%${searchQuery}%,organiser.ilike.%${searchQuery}%`);
            }
            if (filterCity !== 'All') {
                query = query.eq('city', filterCity);
            }
            if (filterCategory !== 'All') {
                query = query.eq('sapa_category', filterCategory);
            }

            // Apply Pagination
            const from = (page - 1) * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            const { data, count, error } = await query
                .order('date', { ascending: true })
                .range(from, to);

            if (error) throw error;

            setEvents(data || []);
            setTotalPages(Math.ceil((count || 0) / ITEMS_PER_PAGE));
        } catch (error) {
            console.error('Error fetching events:', error);
            showToast('Error fetching events', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (event) => {
        setCurrentEvent(event);
        setFormData({
            title: event.title || '',
            date: event.date || '',
            time: event.time || '',
            location: event.location || '',
            city: event.city || '',
            organiser: event.organiser || '',
            venue: event.venue || '',
            sapa_category: event.sapa_category || '',
            status: event.status || 'upcoming'
        });
        setIsEditing(true);
    };

    const handleAddNew = () => {
        setCurrentEvent(null);
        setFormData({
            title: '', date: '', time: '', location: '',
            city: '', organiser: '', venue: '', sapa_category: '',
            status: 'upcoming'
        });
        setIsEditing(true);
    }

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this event?')) return;

        const { error } = await supabase
            .from('events')
            .delete()
            .eq('id', id);

        if (error) {
            showToast('Error deleting event', 'error');
        } else {
            showToast('Event deleted successfully');
            fetchEvents();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const payload = {
            title: formData.title,
            date: formData.date,
            time: formData.time,
            location: formData.location,
            city: formData.city,
            organiser: formData.organiser,
            venue: formData.venue,
            sapa_category: formData.sapa_category,
            status: formData.status
        };

        let error;
        if (currentEvent) {
            const { error: updateError } = await supabase
                .from('events')
                .update(payload)
                .eq('id', currentEvent.id);
            error = updateError;
        } else {
            const { error: insertError } = await supabase
                .from('events')
                .insert([payload]);
            error = insertError;
        }

        if (error) {
            showToast(error.message, 'error');
        } else {
            showToast(currentEvent ? 'Event updated successfully' : 'Event created successfully');
            setIsEditing(false);
            fetchEvents();
        }
    };

    const uniqueCities = ['Jhb', 'CT', 'Durban', 'PTA', 'Vaal', 'Bloem'];
    const uniqueCategories = ['Major', 'Gold', 'Social', 'League'];

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
                <h2 className="text-2xl font-bold text-white">Tournament Management</h2>
                <button
                    onClick={handleAddNew}
                    className="bg-padel-green text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-white transition-colors"
                >
                    <Plus size={18} /> Add Event
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-6 bg-black/20 p-4 rounded-xl border border-white/5">
                <div className="flex items-center bg-[#1E293B] border border-white/10 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
                    <Search size={18} className="text-gray-400 mr-2" />
                    <input
                        type="text"
                        placeholder="Search events..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent text-white outline-none w-full text-sm"
                    />
                </div>

                <div className="flex gap-2">
                    <select
                        value={filterCity}
                        onChange={(e) => setFilterCity(e.target.value)}
                        className="bg-[#1E293B] text-white border border-white/10 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
                    >
                        <option value="All">All Cities</option>
                        {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>

                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="bg-[#1E293B] text-white border border-white/10 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
                    >
                        <option value="All">All Categories</option>
                        {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {/* Event Table */}
            <div className="overflow-x-auto rounded-lg border border-white/10 relative min-h-[400px]">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-black/50 text-gray-400 border-b border-white/10">
                            <th className="py-3 px-4 font-semibold text-sm">Date</th>
                            <th className="py-3 px-4 font-semibold text-sm">Event</th>
                            <th className="py-3 px-4 font-semibold text-sm">City/Venue</th>
                            <th className="py-3 px-4 font-semibold text-sm">Organiser</th>
                            <th className="py-3 px-4 font-semibold text-sm">Category</th>
                            <th className="py-3 px-4 font-semibold text-sm">Status</th>
                            <th className="py-3 px-4 text-right font-semibold text-sm">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="7" className="text-center py-12 text-gray-500">Loading events...</td></tr>
                        ) : events.length === 0 ? (
                            <tr><td colSpan="7" className="text-center py-12 text-gray-500">No events found matching your criteria.</td></tr>
                        ) : (
                            events.map(event => (
                                <tr key={event.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                    <td className="py-3 px-4 text-padel-green whitespace-nowrap font-mono text-sm">{event.date}</td>
                                    <td className="py-3 px-4">
                                        <div className="font-bold text-white group-hover:text-padel-green transition-colors">{event.title}</div>
                                        <div className="text-xs text-gray-500">{event.time}</div>
                                    </td>
                                    <td className="py-3 px-4">
                                        <div className="text-white text-sm">{event.city}</div>
                                        <div className="text-xs text-gray-500">{event.venue}</div>
                                    </td>
                                    <td className="py-3 px-4 text-gray-300 text-sm">{event.organiser}</td>
                                    <td className="py-3 px-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${event.sapa_category?.includes('Major') ? 'bg-padel-green text-black' :
                                                'bg-white/10 text-white'
                                            }`}>
                                            {event.sapa_category}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={`text-xs uppercase tracking-wide px-2 py-1 rounded ${event.status === 'Confirmed' ? 'bg-green-500/20 text-green-400' :
                                                'bg-gray-700/50 text-gray-400'
                                            }`}>
                                            {event.status}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEdit(event)}
                                                className="p-1.5 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500 hover:text-white transition-colors"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(event.id)}
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
            {!loading && (
                <div className="flex justify-between items-center mt-6">
                    <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-2 rounded-lg bg-[#1E293B] border border-white/10 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="p-2 rounded-lg bg-[#1E293B] border border-white/10 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL - Edit/Add Event */}
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
                                <h3 className="text-xl font-bold text-white">{currentEvent ? 'Edit Event' : 'New Event'}</h3>
                                <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-white">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <div className="col-span-1 md:col-span-2">
                                        <label className="block text-gray-400 text-sm mb-1">Event Title</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.title}
                                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white font-bold focus:border-padel-green outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Date</label>
                                        <input
                                            type="date"
                                            required
                                            value={formData.date}
                                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Time</label>
                                        <input
                                            type="text"
                                            value={formData.time}
                                            onChange={e => setFormData({ ...formData, time: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                            placeholder="e.g. 09:00"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">City</label>
                                        <select
                                            value={formData.city}
                                            onChange={e => setFormData({ ...formData, city: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        >
                                            <option value="">Select City</option>
                                            {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Venue</label>
                                        <input
                                            type="text"
                                            value={formData.venue}
                                            onChange={e => setFormData({ ...formData, venue: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                            placeholder="e.g. KCC"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Organiser</label>
                                        <input
                                            type="text"
                                            value={formData.organiser}
                                            onChange={e => setFormData({ ...formData, organiser: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Category (SAPA)</label>
                                        <input
                                            type="text"
                                            value={formData.sapa_category}
                                            onChange={e => setFormData({ ...formData, sapa_category: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                            placeholder="e.g. Gold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Location Details</label>
                                        <input
                                            type="text"
                                            value={formData.location}
                                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                            placeholder="e.g. Court 1"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Status</label>
                                        <select
                                            value={formData.status}
                                            onChange={e => setFormData({ ...formData, status: e.target.value })}
                                            className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                        >
                                            <option value="upcoming">Upcoming</option>
                                            <option value="confirmed">Confirmed</option>
                                            <option value="pending">Pending</option>
                                            <option value="completed">Completed</option>
                                        </select>
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
                                        Save Event
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

export default TournamentManager;
