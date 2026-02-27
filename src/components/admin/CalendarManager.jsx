import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, X, Save, Search, Image as ImageIcon, Star } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const formatEventDates = (start, end) => {
    if (!start) return '';
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;

    // Add timezone offset to prevent picking the day before
    const tzOffsetStart = startDate.getTimezoneOffset() * 60000;
    const correctedStart = new Date(startDate.getTime() + tzOffsetStart);

    const startDay = correctedStart.getDate();
    const startMonth = correctedStart.toLocaleString('default', { month: 'long' });
    const startYear = correctedStart.getFullYear();

    if (!endDate || start === end) {
        return `${startDay} ${startMonth} ${startYear}`;
    }

    const tzOffsetEnd = endDate.getTimezoneOffset() * 60000;
    const correctedEnd = new Date(endDate.getTime() + tzOffsetEnd);

    const endDay = correctedEnd.getDate();
    const endMonth = correctedEnd.toLocaleString('default', { month: 'long' });
    const endYear = correctedEnd.getFullYear();

    if (startMonth === endMonth && startYear === endYear) {
        return `${startDay} - ${endDay} ${startMonth}`;
    } else if (startYear === endYear) {
        return `${startDay} ${startMonth.substring(0, 3)} - ${endDay} ${endMonth.substring(0, 3)}`;
    } else {
        return `${startDay} ${startMonth.substring(0, 3)} ${startYear} - ${endDay} ${endMonth.substring(0, 3)} ${endYear}`;
    }
};

const CalendarManager = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingEvent, setEditingEvent] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        event_dates: '',
        event_name: '',
        slug: '',
        city: '',
        venue: '',
        address: '',
        sapa_status: 'Gold',
        description: '',
        start_date: '',
        end_date: '',
        start_time: '',
        end_time: '',
        organizer_name: 'SAPA',
        organizer_phone: '',
        organizer_email: '',
        organizer_website: '',
        image_url: '',
        featured_event: false,
        registered_players: 0,
        rankedin_url: '',
        sponsor_logos: []
    });

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('calendar')
                .select('*')
                .order('start_date', { ascending: true }) // Order by start_date 
                .order('id', { ascending: true }); // Fallback

            if (error) throw error;
            setEvents(data || []);
        } catch (error) {
            console.error('Error fetching events:', error);
            toast.error('Failed to load events');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;

        // Auto-generate slug from event name if slug is empty or user is typing name
        let newFormData = { ...formData, [name]: value };

        if (name === 'event_name' && !editingEvent) {
            const slug = value
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)+/g, '');
            newFormData.slug = slug;
        }

        if (e.target.type === 'checkbox') {
            newFormData[name] = e.target.checked;
        }

        setFormData(newFormData);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Ensure slug exists
            if (!formData.slug && formData.event_name) {
                formData.slug = formData.event_name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)+/g, '');
            }

            // Auto format event_dates based on start and end dates before saving
            formData.event_dates = formatEventDates(formData.start_date, formData.end_date);

            // Clean up empty strings for date/time columns to prevent Supabase type errors
            const payload = { ...formData };
            if (payload.start_date === '') payload.start_date = null;
            if (payload.end_date === '') payload.end_date = null;
            if (payload.start_time === '') payload.start_time = null;
            if (payload.end_time === '') payload.end_time = null;

            if (editingEvent) {
                // Update
                const { error } = await supabase
                    .from('calendar')
                    .update(payload)
                    .eq('id', editingEvent.id);

                if (error) throw error;
                toast.success('Event updated successfully');
            } else {
                // Create
                const { error } = await supabase
                    .from('calendar')
                    .insert([payload]);

                if (error) throw error;
                toast.success('Event created successfully');
            }

            // Reset and refetch
            setIsModalOpen(false);
            setEditingEvent(null);
            resetForm();
            fetchEvents();
        } catch (error) {
            console.error('Error saving event:', error);
            toast.error(`Failed to save event: ${error.message}`);
        }
    };

    const resetForm = () => {
        setFormData({
            event_dates: '',
            event_name: '',
            slug: '',
            city: '',
            venue: '',
            address: '',
            sapa_status: 'Gold',
            description: '',
            start_date: '',
            end_date: '',
            start_time: '',
            end_time: '',
            organizer_name: 'SAPA',
            organizer_phone: '',
            organizer_email: '',
            organizer_website: '',
            image_url: '',
            featured_event: false,
            registered_players: 0,
            rankedin_url: '',
            sponsor_logos: []
        });
    }

    const handleEdit = (event) => {
        setEditingEvent(event);
        setFormData({
            event_dates: event.event_dates || '',
            event_name: event.event_name || '',
            slug: event.slug || '',
            city: event.city || '',
            venue: event.venue || '',
            address: event.address || '',
            sapa_status: event.sapa_status || 'Gold',
            description: event.description || '',
            start_date: event.start_date ? event.start_date.substring(0, 10) : '',
            end_date: event.end_date ? event.end_date.substring(0, 10) : '',
            start_time: event.start_time || '',
            end_time: event.end_time || '',
            organizer_name: event.organizer_name || 'SAPA',
            organizer_phone: event.organizer_phone || '',
            organizer_email: event.organizer_email || '',
            organizer_website: event.organizer_website || '',
            image_url: event.image_url || '',
            featured_event: event.featured_event || false,
            registered_players: event.registered_players || 0,
            rankedin_url: event.rankedin_url || '',
            sponsor_logos: event.sponsor_logos || []
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this event?')) return;

        try {
            const { error } = await supabase
                .from('calendar')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Event deleted successfully');
            fetchEvents();
        } catch (error) {
            console.error('Error deleting event:', error);
            toast.error('Failed to delete event');
        }
    };

    const openNewModal = () => {
        setEditingEvent(null);
        resetForm();
        setIsModalOpen(true);
    };

    const filteredEvents = events.filter(event =>
        event.event_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.venue.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white">Calendar Management</h2>
                    <p className="text-gray-400">Add, edit, and remove upcoming events</p>
                </div>
                <button
                    onClick={openNewModal}
                    className="flex items-center gap-2 bg-padel-green text-black px-4 py-2 rounded-xl font-bold hover:scale-105 transition-transform shadow-lg shadow-padel-green/20"
                >
                    <Plus className="w-5 h-5" />
                    Add Event
                </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                    type="text"
                    placeholder="Search events by name, city, or venue..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[#1E293B] border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-padel-green transition-colors"
                />
            </div>

            {/* Content List */}
            <div className="bg-[#1E293B] rounded-2xl border border-white/10 overflow-hidden">
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/10 text-gray-400 font-bold text-sm uppercase">
                    <div className="col-span-3">Dates</div>
                    <div className="col-span-3">Event Name</div>
                    <div className="col-span-2">City/Venue</div>
                    <div className="col-span-2">Status</div>
                    <div className="col-span-1 text-center">Featured</div>
                    <div className="col-span-1 text-right">Actions</div>
                </div>

                <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">Loading events...</div>
                    ) : filteredEvents.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">No events found.</div>
                    ) : (
                        filteredEvents.map(event => (
                            <div key={event.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-white/5 transition-colors">
                                <div className="col-span-3 font-bold text-padel-green text-sm">
                                    {event.event_dates}
                                    {event.start_date && <span className="block text-[10px] text-gray-500 font-normal">({event.start_date})</span>}
                                </div>
                                <div className="col-span-3 font-medium text-white line-clamp-2" title={event.event_name}>{event.event_name}</div>
                                <div className="col-span-2 text-sm text-gray-400">
                                    <div className="font-bold text-white truncate">{event.city}</div>
                                    <div className="text-[10px] uppercase tracking-wider truncate">{event.venue}</div>
                                </div>
                                <div className="col-span-2 flex items-center">
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border
                                        ${event.sapa_status === 'Major' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                            event.sapa_status === 'Gold' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                                                event.sapa_status === 'Silver' ? 'bg-gray-500/10 text-gray-300 border-gray-500/20' :
                                                    'bg-padel-green/10 text-padel-green border-padel-green/20'}`}>
                                        {event.sapa_status || 'Event'}
                                    </span>
                                </div>
                                <div className="col-span-1 flex justify-center">
                                    {event.featured_event ? (
                                        <div className="bg-yellow-500/20 p-1.5 rounded-full" title="Featured Event">
                                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                                        </div>
                                    ) : (
                                        <div className="bg-white/5 p-1.5 rounded-full" title="Not Featured">
                                            <Star className="w-4 h-4 text-gray-600" />
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-1 flex justify-end gap-2">
                                    <button
                                        onClick={() => handleEdit(event)}
                                        className="p-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(event.id)}
                                        className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Edit/Create Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
                            onClick={() => setIsModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4"
                        >
                            <div className="bg-[#1E293B] w-full max-w-4xl rounded-2xl border border-white/10 shadow-2xl pointer-events-auto p-6 max-h-[90vh] overflow-y-auto">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-bold text-white">
                                        {editingEvent ? 'Edit Event' : 'Add New Event'}
                                    </h3>
                                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                                        <X className="w-6 h-6" />
                                    </button>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-6">
                                    {/* Basic Info */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Event Name</label>
                                            <input
                                                type="text"
                                                name="event_name"
                                                required
                                                value={formData.event_name}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Slug (URL)</label>
                                            <input
                                                type="text"
                                                name="slug"
                                                value={formData.slug}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">SAPA Status</label>
                                            <select
                                                name="sapa_status"
                                                value={formData.sapa_status}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            >
                                                <option value="Gold">Gold</option>
                                                <option value="Major">Major</option>
                                                <option value="Silver">Silver</option>
                                                <option value="Key Event">Key Event</option>
                                                <option value="FIP event">FIP event</option>
                                                <option value="S Gold">S Gold</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Featured Toggle */}
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="featured_event"
                                            name="featured_event"
                                            checked={formData.featured_event}
                                            onChange={handleInputChange}
                                            className="w-5 h-5 rounded border-white/10 bg-black/40 text-padel-green focus:ring-padel-green"
                                        />
                                        <label htmlFor="featured_event" className="text-sm font-bold text-white uppercase cursor-pointer">
                                            Feature Event on Homepage
                                        </label>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Registered Players</label>
                                        <input
                                            type="number"
                                            name="registered_players"
                                            value={formData.registered_players}
                                            onChange={handleInputChange}
                                            className="w-full max-w-[200px] bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Sponsor Logos (Comma Separated URLs)</label>
                                        <textarea
                                            name="sponsor_logos"
                                            value={formData.sponsor_logos?.join(', ')}
                                            onChange={(e) => setFormData({ ...formData, sponsor_logos: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                            placeholder="https://logo1.png, https://logo2.png..."
                                            rows={2}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Rankedin Tournament URL</label>
                                        <input
                                            type="url"
                                            name="rankedin_url"
                                            value={formData.rankedin_url}
                                            onChange={handleInputChange}
                                            placeholder="https://www.rankedin.com/en/tournament/..."
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                        />
                                    </div>

                                    {/* Date & Time */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-padel-green mb-1 uppercase">Start Date</label>
                                            <input
                                                type="date"
                                                name="start_date"
                                                required
                                                value={formData.start_date}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-padel-green/50 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-padel-green mb-1 uppercase">End Date</label>
                                            <input
                                                type="date"
                                                name="end_date"
                                                required
                                                value={formData.end_date}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-padel-green/50 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Start Time</label>
                                            <input
                                                type="time"
                                                name="start_time"
                                                value={formData.start_time}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none [color-scheme:dark]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">End Time</label>
                                            <input
                                                type="time"
                                                name="end_time"
                                                value={formData.end_time}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none [color-scheme:dark]"
                                            />
                                        </div>
                                    </div>

                                    {/* Location */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">City</label>
                                            <input
                                                type="text"
                                                name="city"
                                                required
                                                value={formData.city}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Venue Name</label>
                                            <input
                                                type="text"
                                                name="venue"
                                                required
                                                value={formData.venue}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Full Address</label>
                                            <input
                                                type="text"
                                                name="address"
                                                placeholder="Full street address"
                                                value={formData.address}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Details & Image */}
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Description</label>
                                            <textarea
                                                name="description"
                                                rows="3"
                                                value={formData.description}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none resize-none"
                                            ></textarea>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Hero Image URL</label>
                                            <div className="flex gap-2">
                                                <div className="flex-1">
                                                    <input
                                                        type="text"
                                                        name="image_url"
                                                        placeholder="https://..."
                                                        value={formData.image_url}
                                                        onChange={handleInputChange}
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                                    />
                                                </div>
                                                <div className="w-12 h-12 bg-black/40 rounded-lg border border-white/10 flex items-center justify-center overflow-hidden">
                                                    {formData.image_url ? (
                                                        <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <ImageIcon className="text-gray-600" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Organizer Info */}
                                    <div className="border-t border-white/10 pt-4">
                                        <h4 className="text-sm font-bold text-gray-300 mb-3 uppercase">Organizer Details</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Organizer Name</label>
                                                <input
                                                    type="text"
                                                    name="organizer_name"
                                                    value={formData.organizer_name}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Phone</label>
                                                <input
                                                    type="text"
                                                    name="organizer_phone"
                                                    value={formData.organizer_phone}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Email</label>
                                                <input
                                                    type="text"
                                                    name="organizer_email"
                                                    value={formData.organizer_email}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Website</label>
                                                <input
                                                    type="text"
                                                    name="organizer_website"
                                                    value={formData.organizer_website}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 flex justify-end gap-3 sticky bottom-0 bg-[#1E293B] pb-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsModalOpen(false)}
                                            className="px-4 py-2 rounded-xl font-bold text-gray-400 hover:bg-white/5"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-6 py-2 rounded-xl font-bold bg-padel-green text-black hover:bg-white transition-colors flex items-center gap-2"
                                        >
                                            <Save className="w-4 h-4" />
                                            Save Event
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CalendarManager;
