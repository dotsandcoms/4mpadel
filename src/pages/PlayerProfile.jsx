import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Phone, Save, AlertCircle, CheckCircle, Image as ImageIcon, Briefcase, MapPin, Trophy, ShieldCheck, Mail, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import heroBg from '../assets/hero_bg.png';

const PlayerProfile = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [message, setMessage] = useState(null);
    const [player, setPlayer] = useState(null);
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        contact_number: '',
        nationality: '',
        gender: '',
        bio: '',
        sponsors: '',
        category: '',
        id_number: '',
        home_club: ''
    });

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 3000);
    };

    useEffect(() => {
        const checkUserAndFetchProfile = async () => {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                navigate('/');
                return;
            }

            const email = session.user.email;
            const { data: playerData, error } = await supabase
                .from('players')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (error) {
                showMessage(error.message, 'error');
            } else if (playerData) {
                setPlayer(playerData);

                // Format sponsors back to a comma-separated string for editing
                let sponsorsString = '';
                if (playerData.sponsors) {
                    try {
                        const parsed = JSON.parse(playerData.sponsors);
                        sponsorsString = Array.isArray(parsed) ? parsed.join(', ') : playerData.sponsors;
                    } catch (e) {
                        sponsorsString = playerData.sponsors;
                    }
                }

                setFormData({
                    name: playerData.name || '',
                    email: playerData.email || '',
                    contact_number: playerData.contact_number || '',
                    nationality: playerData.nationality || '',
                    gender: playerData.gender || '',
                    bio: playerData.bio || '',
                    home_club: playerData.home_club || '',
                    sponsors: sponsorsString,
                    image_url: playerData.image_url || '',
                    category: playerData.category || '',
                    id_number: playerData.id_number || '',
                });
            }
            setLoading(false);
        };

        checkUserAndFetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!player) return;
        setSaving(true);
        setMessage(null);

        // Parse sponsors back to JSON array before saving
        let sponsorsArray = [];
        if (formData.sponsors && formData.sponsors.trim() !== '') {
            sponsorsArray = formData.sponsors.split(',').map(s => s.trim()).filter(Boolean);
        }
        const sponsorsJson = JSON.stringify(sponsorsArray);

        const updates = {
            name: formData.name,
            contact_number: formData.contact_number,
            nationality: formData.nationality,
            gender: formData.gender,
            bio: formData.bio,
            home_club: formData.home_club,
            sponsors: sponsorsJson,
            image_url: formData.image_url,
            category: formData.category,
            id_number: formData.id_number,
        };

        const { error } = await supabase
            .from('players')
            .update(updates)
            .eq('id', player.id);

        if (error) {
            showMessage(error.message, 'error');
        } else {
            showMessage('Profile updated successfully!', 'success');
        }
        setSaving(false);
    };

    const handleImageUpload = async (event) => {
        try {
            setUploadingImage(true);
            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('You must select an image to upload.');
            }
            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `${player.id}/${fileName}`;

            // Upload to Supabase Storage bucket 'profile-pics'
            let { error: uploadError } = await supabase.storage
                .from('profile-pics')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) {
                console.error("Upload error:", uploadError);
                throw uploadError;
            }

            // Get Public URL
            const { data: publicUrlData } = supabase.storage
                .from('profile-pics')
                .getPublicUrl(filePath);

            if (publicUrlData) {
                console.log("Generated Public URL:", publicUrlData.publicUrl);
                setFormData({ ...formData, image_url: publicUrlData.publicUrl });
                showMessage('Image uploaded successfully! Remember to Save Changes.', 'success');
            }

        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setUploadingImage(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center pt-24">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-padel-green"></div>
            </div>
        );
    }

    if (!player) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center pt-24 text-white">
                <div className="text-center">
                    <h2 className="text-2xl font-bold mb-2">No Profile Found</h2>
                    <p className="text-gray-400">We couldn't link your account to a player profile.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white selection:bg-padel-green selection:text-black">
            <Navbar />

            {/* Hero Section */}
            <div className="relative h-[40vh] min-h-[400px] overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src={heroBg}
                        className="w-full h-full object-cover opacity-60 scale-105"
                        alt=""
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                </div>

                <div className="container mx-auto px-6 h-full flex flex-col justify-end pb-12 relative z-10">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col md:flex-row md:items-end gap-8"
                    >
                        {/* Profile Image with Upload Trigger */}
                        <div className="relative group">
                            <div
                                onClick={() => document.getElementById('imageUpload').click()}
                                className="w-40 h-40 rounded-[2.5rem] bg-[#0F172A] border-4 border-black shadow-2xl overflow-hidden cursor-pointer relative"
                            >
                                {formData.image_url ? (
                                    <img src={formData.image_url} alt="Profile" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                                        <User className="w-16 h-16 text-white/20" />
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center backdrop-blur-sm">
                                    <ImageIcon className="w-8 h-8 text-padel-green mb-2" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Change Photo</span>
                                </div>
                                {uploadingImage && (
                                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
                                        <div className="w-8 h-8 border-2 border-padel-green border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                            <input
                                type="file"
                                id="imageUpload"
                                accept="image/*"
                                onChange={handleImageUpload}
                                disabled={uploadingImage}
                                className="hidden"
                            />
                        </div>

                        {/* User Basic Info */}
                        <div className="flex-1">
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.2 }}
                            >
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="bg-padel-green text-black px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg shadow-padel-green/20">
                                        {player.approved ? 'Verified Pro' : 'Pending Verification'}
                                    </span>
                                    <span className="bg-white/10 backdrop-blur-md border border-white/10 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                                        LVR {player.level || '0.0'}
                                    </span>
                                    {player.rankedin_id && (
                                        <span className="bg-black/40 backdrop-blur-md border border-white/10 text-padel-green px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                                            ID: {player.rankedin_id}
                                        </span>
                                    )}
                                </div>
                                <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-[0.85] mb-2 drop-shadow-2xl">
                                    {player.name}
                                </h1>
                                <div className="flex items-center gap-4 text-gray-400 font-bold uppercase tracking-widest text-xs">
                                    <div className="flex items-center gap-1.5 text-padel-green">
                                        <MapPin size={14} />
                                        {player.home_club || 'Set Location'}
                                    </div>
                                    <div className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer" onClick={async () => {
                                        await supabase.auth.signOut();
                                        navigate('/');
                                    }}>
                                        <LogOut size={14} />
                                        Log Out
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="container mx-auto px-6 -mt-10 pb-24 relative z-20">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* Left Panel: Statistics & Quick Updates */}
                    <div className="lg:col-span-4 space-y-6">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            className="bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8"
                        >
                            <h3 className="text-xl font-black uppercase tracking-tighter mb-6 flex items-center gap-3">
                                <Trophy className="text-padel-green" size={24} />
                                Career Overview
                            </h3>

                            {player.skill_rating && (
                                <div className="bg-padel-green/10 border border-padel-green/20 rounded-2xl p-4 flex items-center gap-4 mb-4">
                                    <div className="w-12 h-12 bg-padel-green text-black rounded-xl flex flex-col items-center justify-center">
                                        <span className="text-[8px] font-black uppercase">Skill</span>
                                        <span className="text-xl font-black">{player.skill_rating}</span>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-black text-padel-green uppercase tracking-widest">Rankedin Rating</p>
                                        <div className="h-1.5 w-full bg-white/5 rounded-full mt-1 overflow-hidden">
                                            <div
                                                className="h-full bg-padel-green transition-all duration-1000"
                                                style={{ width: `${Math.min(player.skill_rating * 3.33, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {player.match_form && (
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 mb-4">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Recent Form</p>
                                    <div className="flex gap-1.5">
                                        {player.match_form.split(/\s+/).filter(Boolean).map((f, i) => (
                                            <div key={i} className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black ${f === 'W' ? 'bg-padel-green text-black' : 'bg-red-500 text-white'
                                                }`}>
                                                {f}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Current Points</p>
                                    <p className="text-3xl font-black text-white">{player.points}</p>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex justify-between items-end">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Win Rate</p>
                                        <p className="text-3xl font-black text-white">86%</p>
                                    </div>
                                    <div className="bg-padel-green/20 text-padel-green px-3 py-1 rounded-lg text-xs font-black">
                                        Top 5%
                                    </div>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Division</p>
                                    <p className="text-xl font-bold text-padel-green uppercase">{player.category || 'Unassigned'}</p>
                                </div>
                            </div>
                        </motion.div>

                        {/* Security Notice */}
                        <div className="bg-padel-green/5 border border-padel-green/20 rounded-[2.5rem] p-8">
                            <ShieldCheck className="text-padel-green mb-4" size={32} />
                            <h4 className="font-bold text-white mb-2">Verified Account</h4>
                            <p className="text-xs text-white/50 leading-relaxed uppercase tracking-wider font-bold">
                                Your profile is protected by 4M Padel Community security. Updates are synced across all tournament leaderboards.
                            </p>
                        </div>
                    </div>

                    {/* Right Panel: Edit Form */}
                    <div className="lg:col-span-8">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-64 h-64 bg-padel-green/5 rounded-full blur-[80px] -mr-32 -mt-32" />

                            <AnimatePresence>
                                {message && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        className={`absolute top-8 right-8 flex items-center gap-3 px-6 py-3 rounded-full shadow-2xl z-50 ${message.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-padel-green text-black'
                                            } font-black text-xs uppercase tracking-widest`}
                                    >
                                        {message.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
                                        {message.text}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="mb-10">
                                <h3 className="text-2xl font-black uppercase tracking-tighter mb-2">Personal Management</h3>
                                <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">Complete your profile to unlock premium player features</p>
                            </div>

                            <form onSubmit={handleSave} className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Full Name</label>
                                        <div className="relative">
                                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/40" size={18} />
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                                placeholder="Enter full name"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Gender</label>
                                        <div className="relative">
                                            <select
                                                value={formData.gender}
                                                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                                className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold appearance-none cursor-pointer"
                                            >
                                                <option value="" disabled>Select Gender</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                            </select>
                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-padel-green/40 pointer-events-none" size={18} />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Nationality</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/40" size={18} />
                                            <input
                                                type="text"
                                                value={formData.nationality}
                                                onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                                                className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                                placeholder="Nationality"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">ID Number</label>
                                        <div className="relative">
                                            <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/40" size={18} />
                                            <input
                                                type="text"
                                                value={formData.id_number}
                                                onChange={(e) => setFormData({ ...formData, id_number: e.target.value })}
                                                className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                                placeholder="ID Number"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Phone Number</label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/40" size={18} />
                                            <input
                                                type="tel"
                                                value={formData.contact_number}
                                                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                                                className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                                placeholder="Phone Number"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Home Club</label>
                                        <div className="relative">
                                            <Trophy className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/40" size={18} />
                                            <input
                                                type="text"
                                                value={formData.home_club}
                                                onChange={(e) => setFormData({ ...formData, home_club: e.target.value })}
                                                className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                                placeholder="Your Home Club"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Player Biography</label>
                                    <div className="relative">
                                        <Briefcase className="absolute left-4 top-6 text-padel-green/40" size={18} />
                                        <textarea
                                            value={formData.bio}
                                            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700 min-h-[120px]"
                                            placeholder="Tell us about your padel journey..."
                                        />
                                    </div>
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] ml-2">Sponsors (comma separated)</label>
                                    <div className="relative">
                                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
                                        <input
                                            type="text"
                                            value={formData.sponsors}
                                            onChange={(e) => setFormData({ ...formData, sponsors: e.target.value })}
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                            placeholder="Babolat, Nike, Red Bull, etc."
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] ml-2">Category / Division</label>
                                    <div className="relative">
                                        <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
                                        <select
                                            value={formData.category}
                                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                            className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-10 py-4 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold appearance-none cursor-pointer"
                                        >
                                            <option value="" disabled>Select Category</option>
                                            <optgroup label="Men's" className="bg-[#0F172A]">
                                                <option value="Men's Open (Pro/Elite)">Men's Open (Pro/Elite)</option>
                                                <option value="Men's Advanced">Men's Advanced</option>
                                                <option value="Men's Intermediate">Men's Intermediate</option>
                                            </optgroup>
                                            <optgroup label="Ladies" className="bg-[#0F172A]">
                                                <option value="Ladies Open (Pro/Elite)">Ladies Open (Pro/Elite)</option>
                                                <option value="Ladies Advanced">Ladies Advanced</option>
                                                <option value="Ladies Intermediate">Ladies Intermediate</option>
                                            </optgroup>
                                        </select>
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-600">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                                    <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest leading-loose">
                                        By saving, you agree to updated profile data <br />
                                        being displayed on public community leaderboards.
                                    </p>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="w-full md:w-auto bg-padel-green text-black font-black uppercase tracking-widest px-10 py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-white hover:scale-105 transition-all shadow-xl shadow-padel-green/10 disabled:opacity-50 group active:scale-95"
                                    >
                                        <Save size={20} className="group-hover:rotate-12 transition-transform" />
                                        {saving ? 'Syncing...' : 'Save Profile'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlayerProfile;
