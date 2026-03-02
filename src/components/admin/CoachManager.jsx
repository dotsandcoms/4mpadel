import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';
import { Loader2, UserX, CheckCircle2, XCircle, Search, Mail, Phone, MapPin, Instagram, Youtube, Trash2, X, ExternalLink, Edit2, Save } from 'lucide-react';

const CoachManager = () => {
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
    const [selectedApp, setSelectedApp] = useState(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editFormData, setEditFormData] = useState(null);

    useEffect(() => {
        fetchApplications();
    }, []);

    const fetchApplications = async () => {
        try {
            const { data, error } = await supabase
                .from('coach_applications')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setApplications(data || []);
        } catch (error) {
            console.error('Error fetching applications:', error);
            toast.error('Failed to load coach applications');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (id, newStatus) => {
        setIsUpdating(true);
        try {
            const { error } = await supabase
                .from('coach_applications')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;

            toast.success(`Application ${newStatus} successfully`);
            fetchApplications();
            if (selectedApp && selectedApp.id === id) {
                setSelectedApp({ ...selectedApp, status: newStatus });
            }
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Failed to update application status');
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDelete = async (id, profilePicUrl) => {
        if (!window.confirm('Are you sure you want to delete this application permanently?')) return;

        setIsUpdating(true);
        try {
            // 1. Delete the image from storage if it exists
            if (profilePicUrl) {
                const fileName = profilePicUrl.split('/').pop();
                const { error: storageError } = await supabase.storage
                    .from('coach-profiles')
                    .remove([fileName]);

                if (storageError) console.error('Error deleting image:', storageError);
            }

            // 2. Delete the record from the database
            const { error: dbError } = await supabase
                .from('coach_applications')
                .delete()
                .eq('id', id);

            if (dbError) throw dbError;

            toast.success('Application deleted');
            setSelectedApp(null);
            fetchApplications();
        } catch (error) {
            console.error('Error deleting application:', error);
            toast.error('Failed to delete application');
        } finally {
            setIsUpdating(false);
        }
    };

    const startEditing = () => {
        if (!selectedApp) return;
        setEditFormData({
            full_name: selectedApp.full_name,
            coaching_location: selectedApp.coaching_location,
            email: selectedApp.email,
            contact_number: selectedApp.contact_number,
            instagram_link: selectedApp.instagram_link || '',
            youtube_link: selectedApp.youtube_link || '',
            bio: selectedApp.bio
        });
        setIsEditing(true);
    };

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveEdit = async () => {
        setIsUpdating(true);
        try {
            const { error } = await supabase
                .from('coach_applications')
                .update(editFormData)
                .eq('id', selectedApp.id);

            if (error) throw error;
            toast.success('Coach information updated successfully');

            const updatedApp = { ...selectedApp, ...editFormData };
            setSelectedApp(updatedApp);
            setApplications(apps => apps.map(a => a.id === updatedApp.id ? updatedApp : a));
            setIsEditing(false);
        } catch (error) {
            console.error('Error updating coach:', error);
            toast.error('Failed to update coach information');
        } finally {
            setIsUpdating(false);
        }
    };

    const filteredApplications = applications.filter(app => {
        const matchesSearch = app.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            app.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const getStatusColor = (status) => {
        switch (status) {
            case 'approved': return 'bg-padel-green text-black';
            case 'rejected': return 'bg-red-500 text-white';
            default: return 'bg-yellow-500 text-black';
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-padel-green" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white/5 p-6 rounded-2xl border border-white/10">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Coach Applications</h2>
                    <p className="text-gray-400">Review and manage incoming coach registrations.</p>
                </div>
                <div className="flex gap-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Search names or emails..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-padel-green"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-padel-green"
                    >
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredApplications.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-gray-400 bg-white/5 rounded-2xl border border-white/10">
                        <UserX className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No applications found matching your criteria.</p>
                    </div>
                ) : (
                    filteredApplications.map((app) => (
                        <motion.div
                            key={app.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.02 }}
                            onClick={() => setSelectedApp(app)}
                            className="bg-[#1E293B]/60 backdrop-blur-md rounded-2xl overflow-hidden border border-white/10 cursor-pointer shadow-xl flex flex-col"
                        >
                            <div className="relative h-48 bg-black">
                                {app.profile_pic_url ? (
                                    <img src={app.profile_pic_url} alt={app.full_name} className="w-full h-full object-cover opacity-80" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                        <UserX className="w-12 h-12 text-gray-500" />
                                    </div>
                                )}
                                <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-bold uppercase ${getStatusColor(app.status)}`}>
                                    {app.status}
                                </div>
                            </div>
                            <div className="p-5 flex-1 flex flex-col">
                                <h3 className="text-xl font-bold text-white mb-1 truncate">{app.full_name}</h3>
                                <div className="text-sm text-gray-400 mb-4 truncate flex items-center gap-1">
                                    <MapPin size={14} /> {app.coaching_location}
                                </div>
                                <div className="mt-auto pt-4 border-t border-white/10 text-xs text-gray-500 uppercase tracking-wider font-semibold">
                                    Applied: {new Date(app.created_at).toLocaleDateString()}
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>

            {/* Application Details Modal */}
            <AnimatePresence>
                {selectedApp && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        onClick={() => { setSelectedApp(null); setIsEditing(false); }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative"
                        >
                            <button
                                onClick={() => { setSelectedApp(null); setIsEditing(false); }}
                                className="absolute top-6 right-6 text-gray-400 hover:text-white bg-black/50 p-2 rounded-full z-10"
                            >
                                <X size={24} />
                            </button>

                            <div className="flex flex-col md:flex-row">
                                {/* Left Sidebar: Image & Actions */}
                                <div className="md:w-1/3 bg-[#1E293B]/50 p-8 flex flex-col">
                                    <div className="w-48 h-48 mx-auto rounded-full overflow-hidden border-4 border-padel-green shadow-xl mb-6 flex-shrink-0 bg-black">
                                        {selectedApp.profile_pic_url ? (
                                            <img src={selectedApp.profile_pic_url} alt={selectedApp.full_name} className="w-full h-full object-cover" />
                                        ) : (
                                            <UserX className="w-full h-full p-8 text-gray-500" />
                                        )}
                                    </div>

                                    <div className="text-center mb-8">
                                        <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold uppercase mb-4 ${getStatusColor(selectedApp.status)}`}>
                                            Status: {selectedApp.status}
                                        </div>
                                        <h2 className="text-3xl font-bold text-white mb-2">{selectedApp.full_name}</h2>
                                        <p className="text-gray-400">{selectedApp.coaching_location}</p>
                                    </div>

                                    <div className="space-y-3 mt-auto">
                                        {!isEditing ? (
                                            <>
                                                {selectedApp.status !== 'approved' && (
                                                    <button
                                                        onClick={() => handleStatusUpdate(selectedApp.id, 'approved')}
                                                        disabled={isUpdating}
                                                        className="w-full flex items-center justify-center gap-2 bg-padel-green text-black font-bold py-3 rounded-xl hover:bg-white transition-colors"
                                                    >
                                                        <CheckCircle2 size={18} /> Approve Application
                                                    </button>
                                                )}
                                                {selectedApp.status !== 'rejected' && (
                                                    <button
                                                        onClick={() => handleStatusUpdate(selectedApp.id, 'rejected')}
                                                        disabled={isUpdating}
                                                        className="w-full flex items-center justify-center gap-2 bg-red-500/20 text-red-500 font-bold py-3 rounded-xl hover:bg-red-500 hover:text-white transition-colors border border-red-500/50"
                                                    >
                                                        <XCircle size={18} /> Reject Application
                                                    </button>
                                                )}
                                                <button
                                                    onClick={startEditing}
                                                    disabled={isUpdating}
                                                    className="w-full flex items-center justify-center gap-2 bg-blue-500/20 text-blue-500 font-bold py-3 border border-blue-500/50 rounded-xl hover:bg-blue-500 hover:text-white transition-colors"
                                                >
                                                    <Edit2 size={18} /> Edit Information
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(selectedApp.id, selectedApp.profile_pic_url)}
                                                    disabled={isUpdating}
                                                    className="w-full flex items-center justify-center gap-2 text-gray-500 font-bold py-3 mt-4 hover:text-red-500 transition-colors"
                                                >
                                                    <Trash2 size={18} /> Delete Record
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={handleSaveEdit}
                                                    disabled={isUpdating}
                                                    className="w-full flex items-center justify-center gap-2 bg-blue-500 text-white font-bold py-3 rounded-xl hover:bg-blue-600 transition-colors"
                                                >
                                                    <Save size={18} /> Save Changes
                                                </button>
                                                <button
                                                    onClick={() => setIsEditing(false)}
                                                    disabled={isUpdating}
                                                    className="w-full flex items-center justify-center gap-2 text-gray-400 font-bold py-3 hover:text-white transition-colors"
                                                >
                                                    Cancel Edit
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Right Content: Details */}
                                <div className="md:w-2/3 p-8 md:p-12">
                                    {isEditing ? (
                                        <div className="space-y-5">
                                            <h3 className="text-xl font-bold text-white mb-6 border-b border-white/10 pb-4">Edit Coach Information</h3>

                                            <div>
                                                <label className="block text-sm font-bold text-gray-400 mb-2">Full Name</label>
                                                <input type="text" name="full_name" value={editFormData.full_name} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-400 mb-2">Email Address</label>
                                                    <input type="email" name="email" value={editFormData.email} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-400 mb-2">Contact Number</label>
                                                    <input type="text" name="contact_number" value={editFormData.contact_number} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-gray-400 mb-2">Coaching Location</label>
                                                <input type="text" name="coaching_location" value={editFormData.coaching_location} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-400 mb-2">Instagram Link</label>
                                                    <input type="url" name="instagram_link" value={editFormData.instagram_link} onChange={handleEditChange} placeholder="Optional" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-400 mb-2">YouTube Link</label>
                                                    <input type="url" name="youtube_link" value={editFormData.youtube_link} onChange={handleEditChange} placeholder="Optional" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-gray-400 mb-2">Coaching Bio</label>
                                                <textarea name="bio" rows="5" value={editFormData.bio} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors leading-relaxed" />
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <h3 className="text-xl font-bold text-padel-green mb-6 border-b border-white/10 pb-4">Contact Information</h3>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
                                                <div className="flex items-start gap-3">
                                                    <Mail className="text-gray-500 mt-1" size={20} />
                                                    <div>
                                                        <p className="text-sm text-gray-500 mb-1">Email Address</p>
                                                        <a href={`mailto:${selectedApp.email}`} className="text-white hover:text-padel-green">{selectedApp.email}</a>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <Phone className="text-gray-500 mt-1" size={20} />
                                                    <div>
                                                        <p className="text-sm text-gray-500 mb-1">Contact Number</p>
                                                        <a href={`tel:${selectedApp.contact_number}`} className="text-white hover:text-padel-green">{selectedApp.contact_number}</a>
                                                    </div>
                                                </div>
                                            </div>

                                            <h3 className="text-xl font-bold text-padel-green mb-6 border-b border-white/10 pb-4">Social Links</h3>
                                            <div className="flex flex-wrap gap-4 mb-10">
                                                {selectedApp.instagram_link ? (
                                                    <a href={selectedApp.instagram_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#1E293B] hover:bg-white/10 px-4 py-2 rounded-lg text-white transition-colors border border-white/10">
                                                        <Instagram className="text-pink-500" size={18} /> Instagram <ExternalLink size={14} className="text-gray-500" />
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-500 text-sm italic py-2">No Instagram provided</span>
                                                )}

                                                {selectedApp.youtube_link ? (
                                                    <a href={selectedApp.youtube_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#1E293B] hover:bg-white/10 px-4 py-2 rounded-lg text-white transition-colors border border-white/10">
                                                        <Youtube className="text-red-500" size={18} /> YouTube <ExternalLink size={14} className="text-gray-500" />
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-500 text-sm italic py-2">No YouTube provided</span>
                                                )}
                                            </div>

                                            <h3 className="text-xl font-bold text-padel-green mb-6 border-b border-white/10 pb-4">Coaching Bio</h3>
                                            <div className="bg-[#1E293B]/30 p-6 rounded-2xl border border-white/5">
                                                <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{selectedApp.bio}</p>
                                            </div>
                                        </>
                                    )}

                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CoachManager;
