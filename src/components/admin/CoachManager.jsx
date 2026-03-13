import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';
import { Loader2, UserX, CheckCircle2, XCircle, Search, Mail, Phone, MapPin, Instagram, Youtube, Trash2, X, ExternalLink, Edit2, Save, FileSignature, AlertCircle, Clock, UploadCloud } from 'lucide-react';
import CoachProfileModal from '../CoachProfileModal';
import {
    PieChart,
    Pie,
    Cell,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

const STAT_COLORS = { 'padel-green': '#beff00', green: '#22c55e', amber: '#f59e0b', red: '#ef4444' };

const StatCard = ({ title, value, subtext, icon: Icon, color = 'padel-green', delay = 0 }) => {
    const c = STAT_COLORS[color] || STAT_COLORS['padel-green'];
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.3 }}
            className="bg-[#1E293B]/50 backdrop-blur-md p-5 rounded-2xl border border-white/10 hover:border-white/20 transition-colors"
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">{title}</p>
                    <p className="text-3xl font-black text-white">{value}</p>
                    <p className="text-gray-500 text-xs mt-1">{subtext}</p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: c + '20' }}>
                    <Icon size={24} style={{ color: c }} />
                </div>
            </div>
        </motion.div>
    );
};

const CoachManager = () => {
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'pending', 'approved', 'rejected'
    const [selectedApp, setSelectedApp] = useState(null);
    const [isUpdating, setIsUpdating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editFormData, setEditFormData] = useState(null);
    const [newProfilePic, setNewProfilePic] = useState(null);
    const [newProfilePicPreview, setNewProfilePicPreview] = useState(null);
    const fileInputRef = useRef(null);

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
        setNewProfilePic(null);
        setNewProfilePicPreview(null);
        setIsEditing(true);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setNewProfilePic(file);
            setNewProfilePicPreview(URL.createObjectURL(file));
        }
    };

    const resizeImage = (file, maxWidth = 800, quality = 0.8) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        resolve(new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    }, 'image/jpeg', quality);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    };

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveEdit = async () => {
        setIsUpdating(true);
        try {
            let updatedProfilePicUrl = selectedApp.profile_pic_url;

            if (newProfilePic) {
                // Delete old image if it exists
                if (selectedApp.profile_pic_url) {
                    const oldFileName = selectedApp.profile_pic_url.split('/').pop();
                    await supabase.storage.from('coach-profiles').remove([oldFileName]);
                }

                // Upload new image
                const resizedFile = await resizeImage(newProfilePic);
                const fileExt = 'jpg';
                const fileName = `${editFormData.full_name.replace(/\s+/g, '-').toLowerCase()}_${Date.now()}.${fileExt}`;
                
                const { error: uploadError } = await supabase.storage
                    .from('coach-profiles')
                    .upload(fileName, resizedFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('coach-profiles')
                    .getPublicUrl(fileName);

                updatedProfilePicUrl = publicUrl;
            }

            const dataToUpdate = {
                ...editFormData,
                profile_pic_url: updatedProfilePicUrl
            };

            const { error } = await supabase
                .from('coach_applications')
                .update(dataToUpdate)
                .eq('id', selectedApp.id);

            if (error) throw error;
            toast.success('Coach information updated successfully');

            const updatedApp = { ...selectedApp, ...dataToUpdate };
            setSelectedApp(updatedApp);
            setApplications(apps => apps.map(a => a.id === updatedApp.id ? updatedApp : a));
            setIsEditing(false);
            setNewProfilePic(null);
            setNewProfilePicPreview(null);
        } catch (error) {
            console.error('Error updating coach:', error);
            toast.error('Failed to update coach information');
        } finally {
            setIsUpdating(false);
        }
    };

    // --- Derived State for Stats & Charts ---
    const stats = useMemo(() => {
        return {
            total: applications.length,
            approved: applications.filter(a => a.status === 'approved').length,
            pending: applications.filter(a => a.status === 'pending').length,
            rejected: applications.filter(a => a.status === 'rejected').length,
        };
    }, [applications]);

    const statusChartData = useMemo(() => {
        const data = [
            { name: 'Approved', value: stats.approved, color: '#22c55e' },
            { name: 'Pending', value: stats.pending, color: '#f59e0b' },
            { name: 'Rejected', value: stats.rejected, color: '#ef4444' }
        ];
        return data.filter(d => d.value > 0);
    }, [stats]);

    const timelineChartData = useMemo(() => {
        const map = {};
        applications.forEach(app => {
            if (app.created_at) {
                // Group by simple date YYYY-MM-DD
                const date = app.created_at.split('T')[0].substring(5); // MM-DD
                map[date] = (map[date] || 0) + 1;
            }
        });
        // Sort and take last 14 days
        return Object.entries(map)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-14)
            .map(([date, count]) => ({ date, applications: count }));
    }, [applications]);

    const filteredApplications = useMemo(() => {
        return applications.filter(app => {
            const matchesSearch = app.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                app.email.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [applications, searchTerm, statusFilter]);

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
        <div className="space-y-8 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Coaches Dashboard</h2>
                    <p className="text-gray-400 text-sm">Review and manage incoming coach registrations</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Apps" value={loading ? '—' : stats.total} subtext="All time" icon={FileSignature} color="slate" delay={0} />
                <StatCard title="Approved" value={loading ? '—' : stats.approved} subtext="Active coaches" icon={CheckCircle2} color="green" delay={0.05} />
                <StatCard title="Pending" value={loading ? '—' : stats.pending} subtext="Awaiting review" icon={Clock} color="amber" delay={0.1} />
                <StatCard title="Rejected" value={loading ? '—' : stats.rejected} subtext="Declined apps" icon={XCircle} color="red" delay={0.15} />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 flex flex-col"
                >
                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Application Status</h3>
                    {loading ? (
                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <PieChart>
                                <Pie data={statusChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                                    {statusChartData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 flex flex-col"
                >
                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Recent Applications (14 Days)</h3>
                    {loading ? (
                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={timelineChartData}>
                                <defs>
                                    <linearGradient id="colorApps" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#beff00" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#beff00" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
                                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                                <Area type="monotone" dataKey="applications" stroke="#beff00" fillOpacity={1} fill="url(#colorApps)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search names or emails..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 pl-12 text-white focus:border-padel-green focus:outline-none"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-padel-green focus:outline-none cursor-pointer"
                >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                </select>
            </div>

            {/* Applications Table */}
            <div className="bg-[#1E293B]/30 rounded-2xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/50 text-gray-400 border-b border-white/10">
                                <th className="py-3 px-4 font-semibold text-xs uppercase min-w-[200px]">Applicant</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase min-w-[150px]">Location</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase">Applied Date</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase">Status</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase text-center">Socials</th>
                                <th className="py-3 px-4 text-right font-semibold text-xs uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="6" className="text-center py-12 text-gray-500">Loading applications...</td></tr>
                            ) : filteredApplications.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-12 text-gray-400">
                                        <UserX className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        No applications found.
                                    </td>
                                </tr>
                            ) : (
                                filteredApplications.map(app => (
                                    <tr
                                        key={app.id}
                                        className="border-b border-white/5 hover:bg-white/5 transition-colors group cursor-pointer"
                                        onClick={() => setSelectedApp(app)}
                                    >
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full overflow-hidden bg-black/50 border border-white/10 shrink-0 flex items-center justify-center">
                                                    {app.profile_pic_url ? (
                                                        <img src={app.profile_pic_url} alt={app.full_name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <UserX size={20} className="text-gray-500" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-white text-sm">{app.full_name}</div>
                                                    <div className="text-[10px] text-gray-400">{app.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-300">
                                            {app.coaching_location}
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-400">
                                            {new Date(app.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider inline-block
                                                ${app.status === 'approved' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                                    app.status === 'rejected' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                                        'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}
                                            >
                                                {app.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                {app.instagram_link ? <Instagram size={14} className="text-pink-500" title="Instagram Provided" /> : <Instagram size={14} className="text-gray-600" />}
                                                {app.youtube_link ? <Youtube size={14} className="text-red-500" title="YouTube Provided" /> : <Youtube size={14} className="text-gray-600" />}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelectedApp(app); }}
                                                className="px-3 py-1.5 bg-white/5 text-white text-xs font-bold rounded-lg hover:bg-white/10 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
                                            >
                                                Review
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Application Details Modal */}
            <CoachProfileModal
                app={selectedApp}
                isAdmin={true}
                onClose={() => setSelectedApp(null)}
                onStatusUpdate={handleStatusUpdate}
                onDelete={handleDelete}
                onUpdate={(updatedApp) => {
                    setSelectedApp(updatedApp);
                    setApplications(apps => apps.map(a => a.id === updatedApp.id ? updatedApp : a));
                }}
            />
        </div>
    );
};

export default CoachManager;
