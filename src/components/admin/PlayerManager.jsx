import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { Trash2, Edit2, Plus, X, CheckCircle, AlertCircle, Search, Users, CreditCard, Eye, EyeOff, Mail, ShieldAlert, Key, Image as ImageIcon, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
} from 'recharts';

const STAT_COLORS = { 'padel-green': '#beff00', green: '#22c55e', amber: '#f59e0b', slate: '#64748b' };
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

const PlayerManager = () => {
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentPlayer, setCurrentPlayer] = useState(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [resetPasswordPlayer, setResetPasswordPlayer] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPaid, setFilterPaid] = useState('all'); // all | paid | unpaid
    const [filterActive, setFilterActive] = useState('all'); // all | visible | hidden
    const [filterCategory, setFilterCategory] = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

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
        approved: true,
        paid_registration: true,
        license_type: 'none',
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
            .select('*, temporary_licenses(event_name, event_date)')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching players:', error);
            showToast('Failed to fetch players', 'error');
        } else {
            // Identify and fix stale temporary licenses
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const stalePlayerIds = (data || [])
                .filter(p => {
                    if (p.license_type !== 'temporary') return false;

                    // If no temp license records, it's stale
                    if (!p.temporary_licenses || p.temporary_licenses.length === 0) return true;

                    // If all temp license records are in the past, it's stale
                    // We check if there's ANY active or future license
                    const hasActive = p.temporary_licenses.some(tl => {
                        const eventDate = new Date(tl.event_date);
                        return eventDate >= today;
                    });

                    return !hasActive;
                })
                .map(p => p.id);

            if (stalePlayerIds.length > 0) {
                console.log(`Found ${stalePlayerIds.length} stale temporary licenses. Updating...`);
                const { error: updateError } = await supabase
                    .from('players')
                    .update({
                        license_type: 'none',
                        paid_registration: false
                    })
                    .in('id', stalePlayerIds);

                if (!updateError) {
                    // Update local data so the UI reflects it immediately
                    data.forEach(p => {
                        if (stalePlayerIds.includes(p.id)) {
                            p.license_type = 'none';
                            p.paid_registration = false;
                        }
                    });
                    showToast(`Cleaned up ${stalePlayerIds.length} expired temporary licenses`, 'info');
                }
            }

            setPlayers(data || []);
        }
        setLoading(false);
    };

    // Derived stats
    const stats = useMemo(() => {
        const full = players.filter(p => p.paid_registration === true && p.license_type === 'full').length;
        const temp = players.filter(p => p.paid_registration === true && p.license_type === 'temporary').length;
        const unpaid = players.length - (full + temp);
        const visible = players.filter(p => p.approved !== false && p.paid_registration === true && p.license_type === 'full').length;
        return {
            total: players.length,
            paid: full + temp,
            full,
            temp,
            unpaid,
            visible,
        };
    }, [players]);

    // Chart data
    const paymentChartData = useMemo(() => [
        { name: 'Full License', value: stats.full, color: '#beff00' },
        { name: 'Temp License', value: stats.temp, color: '#2563eb' },
        { name: 'Unpaid', value: stats.unpaid, color: '#f59e0b' },
    ], [stats.full, stats.temp, stats.unpaid]);


    const categoryChartData = useMemo(() => {
        const map = {};
        players.forEach(p => {
            const cat = p.category || 'Unassigned';
            map[cat] = (map[cat] || 0) + 1;
        });
        return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
    }, [players]);

    const registrationChartData = useMemo(() => {
        const map = {};
        players.forEach(p => {
            if (!p.created_at) return;
            const date = new Date(p.created_at);
            const monthYear = date.toLocaleString('default', { month: 'short', year: '2-digit' });
            const sortKey = date.toISOString().substring(0, 7); // YYYY-MM

            if (!map[sortKey]) {
                map[sortKey] = { name: monthYear, count: 0, sortKey };
            }
            map[sortKey].count += 1;
        });

        return Object.values(map)
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
            .map(item => ({ name: item.name, registrations: item.count }));
    }, [players]);

    // Categories for filter dropdown
    const categories = useMemo(() => ['All', ...new Set(players.map(p => p.category).filter(Boolean))], [players]);

    // Filtered players
    const filteredPlayers = useMemo(() => {
        return players.filter(player => {
            const matchesSearch = !searchTerm ||
                player.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                player.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (player.home_club && player.home_club.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesPaid = filterPaid === 'all' ||
                (filterPaid === 'full' && player.paid_registration === true && player.license_type === 'full') ||
                (filterPaid === 'temporary' && player.paid_registration === true && player.license_type === 'temporary') ||
                (filterPaid === 'unpaid' && player.paid_registration !== true);
            const matchesActive = filterActive === 'all' ||
                (filterActive === 'visible' && player.approved !== false && player.paid_registration === true && player.license_type === 'full') ||
                (filterActive === 'hidden' && (player.approved === false || player.paid_registration !== true || player.license_type !== 'full'));
            const matchesCategory = filterCategory === 'All' || player.category === filterCategory;
            return matchesSearch && matchesPaid && matchesActive && matchesCategory;
        });
    }, [players, searchTerm, filterPaid, filterActive, filterCategory]);


    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentPlayers = filteredPlayers.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredPlayers.length / itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterPaid, filterActive, filterCategory]);

    const handleAddNew = () => {
        setCurrentPlayer(null);
        setFormData({
            name: '', rank_label: '', points: '', win_rate: '', image_url: '', home_club: '', age_group: '',
            category: '', level: '', nationality: '', bio: '', sponsors: '', contact_number: '', email: '',
            gender: '', approved: true, paid_registration: false, license_type: 'none',
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
            rank_label: player.rank_label || '',
            points: player.points ?? '',
            win_rate: player.win_rate || '',
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
            approved: player.approved !== false,
            paid_registration: player.paid_registration === true,
            license_type: player.license_type || 'none',
        });
        setIsEditing(true);
    };


    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this player?')) return;
        const { error } = await supabase.from('players').delete().eq('id', id);
        if (error) showToast('Error deleting player', 'error');
        else { showToast('Player deleted successfully'); fetchPlayers(); }
    };

    const handleInvite = async (player) => {
        if (!player.email) {
            showToast('Player has no email address', 'error');
            return;
        }

        const { error } = await supabase.auth.signInWithOtp({
            email: player.email,
            options: {
                emailRedirectTo: window.location.origin + '/profile?new_invite=true',
            }
        });

        if (error) {
            showToast('Failed to send invite: ' + error.message, 'error');
        } else {
            showToast('Invitation (Magic Link) sent to ' + player.email);
        }
    };

    const handleResetPassword = async (player) => {
        setResetPasswordPlayer(player);
        setNewPassword('');
    };

    const submitPasswordReset = async (e) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }

        setResetLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('admin-set-password', {
                body: { email: resetPasswordPlayer.email, newPassword: newPassword },
            });

            if (error) {
                throw new Error(error.message || 'Error from edge function');
            }

            if (data?.error) {
                throw new Error(data.error);
            }

            showToast(`Password successfully updated for ${resetPasswordPlayer.name}`);
            setResetPasswordPlayer(null);
        } catch (error) {
            console.error('Password reset error:', error);
            showToast('Failed to reset password: ' + error.message, 'error');
        } finally {
            setResetLoading(false);
        }
    };

    const handleTestLogin = (player) => {
        sessionStorage.setItem('admin_test_login_email', player.email);
        showToast('Now testing as ' + player.name + '.');
        // Small delay to allow toast to be seen before reload
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        let sponsorsArray = [];
        if (formData.sponsors?.trim()) {
            sponsorsArray = formData.sponsors.split(',').map(s => s.trim()).filter(Boolean);
        }
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
            sponsors: JSON.stringify(sponsorsArray),
            contact_number: formData.contact_number,
            email: formData.email,
            gender: formData.gender,
            approved: formData.approved,
            paid_registration: formData.paid_registration,
            license_type: formData.license_type,
        };

        let error;
        if (currentPlayer) {
            const { error: updateError } = await supabase.from('players').update(payload).eq('id', currentPlayer.id);
            error = updateError;
        } else {
            const { error: insertError } = await supabase.from('players').insert([payload]);
            error = insertError;
        }
        if (error) showToast('Error saving: ' + error.message, 'error');
        else { showToast(currentPlayer ? 'Player updated' : 'Player added'); setIsEditing(false); setCurrentPlayer(null); fetchPlayers(); }
    };

    // Resizing Utility
    const resizeImage = (file, maxWidth = 1200, quality = 0.8) => {
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

    const handleImageUpload = async (event) => {
        try {
            setUploadingImage(true);
            const file = event.target.files[0];
            if (!file) return;

            // Optional: Show toast for processing
            showToast('Processing image...', 'info');

            const resizedFile = await resizeImage(file);
            const fileExt = 'jpg';
            const fileName = `${currentPlayer?.id || 'new'}_${Date.now()}.${fileExt}`;
            const filePath = `players/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('profile-pics')
                .upload(filePath, resizedFile);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('profile-pics')
                .getPublicUrl(filePath);

            setFormData({ ...formData, image_url: publicUrl });
            showToast('Image uploaded successfully. Remember to save!');
        } catch (error) {
            console.error('Upload error:', error);
            showToast('Failed to upload image: ' + error.message, 'error');
        } finally {
            setUploadingImage(false);
        }
    };

    return (
        <div className="space-y-8 pb-12">
            {/* Toast Container */}
            <div className="fixed bottom-6 right-6 z-[99999] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border pointer-events-auto ${toast.type === 'error' ? 'bg-red-900/90 border-red-500/50' : 'bg-gray-900/90 border-padel-green/50'}`}
                        >
                            {toast.type === 'error' ? <AlertCircle size={20} className="text-red-400" /> : <CheckCircle size={20} className="text-padel-green" />}
                            <span className="font-medium text-sm">{toast.message}</span>
                            <button onClick={() => removeToast(toast.id)} className="ml-2 hover:opacity-70"><X size={16} /></button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Players Dashboard</h2>
                    <p className="text-gray-400 text-sm">Manage players, view stats, and filter by license status</p>
                </div>
                <button
                    onClick={handleAddNew}
                    className="bg-padel-green text-black px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-white transition-colors"
                >
                    <Plus size={18} /> Add Player
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Players" value={loading ? '—' : stats.total} subtext="All registered" icon={Users} color="padel-green" delay={0} />
                <StatCard title="Paid" value={loading ? '—' : stats.paid} subtext="License paid" icon={CreditCard} color="green" delay={0.05} />
                <StatCard title="Unpaid" value={loading ? '—' : stats.unpaid} subtext="Awaiting payment" icon={CreditCard} color="amber" delay={0.1} />
                <StatCard title="Visible" value={loading ? '—' : stats.visible} subtext="On Players page" icon={Eye} color="padel-green" delay={0.15} />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10"
                >
                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Payment Status</h3>
                    {loading ? (
                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                                <Pie data={paymentChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                                    {paymentChartData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10"
                >
                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">By Category</h3>
                    {loading ? (
                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={categoryChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                                <Bar dataKey="count" fill="#beff00" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10"
                >
                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Registrations</h3>
                    {loading ? (
                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={registrationChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <Tooltip contentStyle={{ backgroundColor: '#1E293B', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                                <Bar dataKey="registrations" fill="#beff00" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </motion.div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search by name, email, or club..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 pl-12 text-white focus:border-padel-green focus:outline-none"
                    />
                </div>
                <select
                    value={filterPaid}
                    onChange={(e) => setFilterPaid(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-padel-green focus:outline-none cursor-pointer"
                >
                    <option value="all">All Payment Status</option>
                    <option value="full">Full License</option>
                    <option value="temporary">Temp License</option>
                    <option value="unpaid">Unpaid</option>
                </select>

                <select
                    value={filterActive}
                    onChange={(e) => setFilterActive(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-padel-green focus:outline-none cursor-pointer"
                >
                    <option value="all">All Visibility</option>
                    <option value="visible">Visible</option>
                    <option value="hidden">Hidden</option>
                </select>
                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-padel-green focus:outline-none cursor-pointer"
                >
                    {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>

            {/* Players Table */}
            <div className="bg-[#1E293B]/30 rounded-2xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-[#111827] text-gray-400 border-b border-white/10">
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Name</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">License</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Status</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Last Activity</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Category</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Club</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Points</th>
                                <th className="py-3 px-4 text-right font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="8" className="text-center py-12 text-gray-500">Loading...</td></tr>
                            ) : currentPlayers.length === 0 ? (
                                <tr><td colSpan="8" className="text-center py-12 text-gray-500">No players match your filters</td></tr>
                            ) : (
                                currentPlayers.map(player => (
                                    <tr key={player.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                        <td className="py-3 px-4 font-medium text-white">{player.name}</td>
                                        <td className="py-3 px-4">
                                            <div className="flex flex-col gap-1">
                                                <span className={`w-fit px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${player.paid_registration ? (player.license_type === 'full' ? 'bg-padel-green/20 text-padel-green' : 'bg-blue-500/20 text-blue-400') : 'bg-amber-500/20 text-amber-400'}`}>
                                                    {player.paid_registration ? (player.license_type === 'full' ? 'Full' : 'Temp') : 'Unpaid'}
                                                </span>
                                                {player.license_type === 'temporary' && player.temporary_licenses?.[0] && (
                                                    <span className="text-[9px] text-blue-500 font-bold uppercase truncate max-w-[120px] block" title={player.temporary_licenses[0].event_name}>
                                                        {player.temporary_licenses[0].event_name}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        <td className="py-3 px-4">
                                            {player.approved !== false && player.paid_registration && player.license_type === 'full' ? (
                                                <span className="flex items-center gap-1 text-green-400 text-xs"><Eye size={12} /> Visible</span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-gray-500 text-xs"><EyeOff size={12} /> Hidden</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="text-gray-400 text-xs text-center block">
                                                {player.last_login ? new Date(player.last_login).toLocaleDateString() : 'Never'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-gray-300 text-sm">{player.category || '—'}</td>
                                        <td className="py-3 px-4 text-gray-400 text-sm">{player.home_club || '—'}</td>
                                        <td className="py-3 px-4 text-padel-green font-mono">{player.points ?? 0}</td>
                                        <td className="py-3 px-4 text-right">
                                            <div className="flex justify-end gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleResetPassword(player)}
                                                    title="Reset Password"
                                                    className="p-1.5 bg-purple-500/10 text-purple-400 rounded-lg hover:bg-purple-500 hover:text-white"
                                                >
                                                    <Key size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleTestLogin(player)}
                                                    title="Test Login (Impersonate)"
                                                    className="p-1.5 bg-amber-500/10 text-amber-500 rounded-lg hover:bg-amber-500 hover:text-black"
                                                >
                                                    <ShieldAlert size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleInvite(player)}
                                                    title="Send Login Invite"
                                                    className="p-1.5 bg-padel-green/10 text-padel-green rounded-lg hover:bg-padel-green hover:text-black"
                                                >
                                                    <Mail size={14} />
                                                </button>
                                                <button onClick={() => handleEdit(player)} className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500 hover:text-white">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => handleDelete(player.id)} className="p-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500 hover:text-white">
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

                <div className="flex justify-between items-center px-4 py-3 border-t border-white/5 bg-black/20">
                    <span className="text-sm text-gray-500">
                        Showing {indexOfFirstItem + 1}–{Math.min(indexOfLastItem, filteredPlayers.length)} of {filteredPlayers.length}
                    </span>
                    {totalPages > 1 && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-2 bg-white/10 rounded-lg text-white disabled:opacity-50 hover:bg-white/20 text-sm"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-2 bg-white/10 rounded-lg text-white disabled:opacity-50 hover:bg-white/20 text-sm"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <AnimatePresence>
                {isEditing && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-[#1E293B] w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 shadow-2xl"
                        >
                            <div className="flex justify-between items-center p-6 border-b border-white/10 sticky top-0 bg-[#1E293B] z-10">
                                <h3 className="text-xl font-bold text-white">{currentPlayer ? 'Edit Player' : 'New Player'}</h3>
                                <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-white"><X size={24} /></button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    {['name', 'rank_label', 'points', 'win_rate', 'home_club', 'age_group', 'category', 'level', 'nationality', 'contact_number', 'email'].map(field => (
                                        <div key={field}>
                                            <label className="block text-gray-400 text-sm mb-1 capitalize">{field.replace('_', ' ')}</label>
                                            {field === 'category' ? (
                                                <select
                                                    value={formData[field] || ''}
                                                    onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                                                    className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none appearance-none cursor-pointer font-bold"
                                                >
                                                    <option value="">Select Category</option>
                                                    <optgroup label="Men's" className="bg-[#1E293B]">
                                                        <option value="Men's Open (Pro/Elite)">Men's Open (Pro/Elite)</option>
                                                        <option value="Men's Advanced">Men's Advanced</option>
                                                        <option value="Men's Intermediate">Men's Intermediate</option>
                                                        <option value="Men's 35+">Men's 35+</option>
                                                        <option value="Men's Juniors">Men's Juniors</option>
                                                    </optgroup>
                                                    <optgroup label="Ladies" className="bg-[#1E293B]">
                                                        <option value="Ladies Open (Pro/Elite)">Ladies Open (Pro/Elite)</option>
                                                        <option value="Ladies Advanced">Ladies Advanced</option>
                                                        <option value="Ladies Intermediate">Ladies Intermediate</option>
                                                        <option value="Ladies 35+">Ladies 35+</option>
                                                        <option value="Ladies Juniors">Ladies Juniors</option>
                                                    </optgroup>
                                                </select>
                                            ) : (
                                                <input
                                                    type={field === 'points' ? 'number' : field === 'email' ? 'email' : 'text'}
                                                    value={formData[field] || ''}
                                                    onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                                                    className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                                />
                                            )}
                                        </div>
                                    ))}
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Gender</label>
                                        <select value={formData.gender || ''} onChange={e => setFormData({ ...formData, gender: e.target.value })} className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none">
                                            <option value="">Select</option>
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                        </select>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-gray-400 text-sm mb-1">Sponsors (comma separated)</label>
                                        <input type="text" value={formData.sponsors || ''} onChange={e => setFormData({ ...formData, sponsors: e.target.value })} className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-gray-400 text-sm mb-2">Player Photo</label>
                                        <div className="flex flex-col sm:flex-row items-center gap-6 bg-black/40 p-6 rounded-2xl border border-white/10 group-hover:border-white/20 transition-all">
                                            {/* Profile Preview */}
                                            <div className="relative w-24 h-24 rounded-2xl overflow-hidden bg-gray-800 border-2 border-white/5 flex-shrink-0 group">
                                                {formData.image_url ? (
                                                    <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center opacity-30">
                                                        <ImageIcon size={32} />
                                                    </div>
                                                )}
                                                {uploadingImage && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                                        <div className="w-6 h-6 border-2 border-padel-green border-t-transparent rounded-full animate-spin" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex-1 space-y-3 w-full">
                                                <div className="flex flex-wrap gap-2">
                                                    <label className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${uploadingImage ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-white text-black hover:bg-padel-green shadow-lg shadow-white/5'}`}>
                                                        <Upload size={14} />
                                                        {uploadingImage ? 'Uploading...' : 'Upload Photo'}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={handleImageUpload}
                                                            disabled={uploadingImage}
                                                            className="hidden"
                                                        />
                                                    </label>

                                                    {formData.image_url && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData({ ...formData, image_url: '' })}
                                                            className="px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-500 uppercase">URL</span>
                                                    <input
                                                        type="text"
                                                        placeholder="Or paste external image URL..."
                                                        value={formData.image_url || ''}
                                                        onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                                                        className="w-full bg-black/40 border border-white/5 rounded-lg pl-12 pr-4 py-2 text-[11px] text-gray-400 focus:text-white focus:border-padel-green transition-all outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-gray-400 text-sm mb-1">Bio</label>
                                        <textarea value={formData.bio || ''} onChange={e => setFormData({ ...formData, bio: e.target.value })} className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none" rows="3" />
                                    </div>
                                    <div className="md:col-span-2 flex flex-col sm:flex-row items-start sm:items-center gap-6 bg-black/20 p-4 rounded-xl border border-white/5">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={formData.approved}
                                                onChange={e => setFormData({ ...formData, approved: e.target.checked })}
                                                className="w-5 h-5 rounded border-white/20 bg-black text-padel-green focus:ring-padel-green cursor-pointer"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-white font-bold text-sm group-hover:text-padel-green transition-colors">Approved</span>
                                                <span className="text-gray-500 text-[10px] uppercase">Account status</span>
                                            </div>
                                        </label>

                                        <div className="h-8 w-px bg-white/10 hidden sm:block" />

                                        <div className="flex-1 w-full sm:w-auto">
                                            <label className="block text-gray-400 text-[10px] uppercase font-black tracking-widest mb-2">License Status</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { id: 'none', label: 'Unpaid', color: 'bg-gray-800' },
                                                    { id: 'temporary', label: 'Temp', color: 'bg-blue-600' },
                                                    { id: 'full', label: 'Full', color: 'bg-padel-green' }
                                                ].map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => setFormData({
                                                            ...formData,
                                                            license_type: opt.id,
                                                            paid_registration: opt.id !== 'none'
                                                        })}
                                                        className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${formData.license_type === opt.id
                                                            ? `${opt.color} ${opt.id === 'full' ? 'text-black' : 'text-white'} border-white/20 shadow-lg`
                                                            : 'bg-black/40 text-gray-500 border-white/5 hover:border-white/10'}`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
                                    <button type="button" onClick={() => setIsEditing(false)} className="bg-gray-700 text-white px-6 py-2 rounded-lg font-bold hover:bg-gray-600">Cancel</button>
                                    <button type="submit" className="bg-padel-green text-black px-6 py-2 rounded-lg font-bold hover:bg-white">Save</button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}

                {resetPasswordPlayer && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-[#1E293B] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl"
                        >
                            <div className="flex justify-between items-center p-6 border-b border-white/10">
                                <h3 className="text-xl font-bold text-white">Reset Password</h3>
                                <button onClick={() => setResetPasswordPlayer(null)} className="text-gray-400 hover:text-white"><X size={24} /></button>
                            </div>
                            <form onSubmit={submitPasswordReset} className="p-6">
                                <p className="text-sm text-gray-400 mb-4">
                                    Manually set a new password for <strong className="text-white">{resetPasswordPlayer.name}</strong>. They will use this new password to log in.
                                </p>
                                <div className="mb-6">
                                    <label className="block text-gray-400 text-sm mb-2 font-medium">New Password</label>
                                    <input
                                        type="text"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="e.g. Padel@2026!"
                                        className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white focus:border-padel-green outline-none"
                                        required
                                        minLength={6}
                                    />
                                    <p className="text-xs text-gray-500 mt-2">
                                        Must include: uppercase, lowercase, number, and special character.
                                    </p>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button type="button" onClick={() => setResetPasswordPlayer(null)} className="px-5 py-2.5 rounded-xl font-bold text-white hover:bg-white/5 transition-colors">
                                        Cancel
                                    </button>
                                    <button disabled={resetLoading} type="submit" className="px-5 py-2.5 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-400 transition-colors disabled:opacity-50 flex items-center gap-2">
                                        {resetLoading ? 'Saving...' : <><Key size={16} /> Set Password</>}
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
