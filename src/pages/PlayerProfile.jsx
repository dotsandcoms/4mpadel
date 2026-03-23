import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import LicensePaymentModal from '../components/LicensePaymentModal';
import CoachProfileModal from '../components/CoachProfileModal';
import heroBg from '../assets/hero_bg.png';
import { useRankedin } from '../hooks/useRankedin';
import { User, Phone, Save, AlertCircle, CheckCircle, Image as PhotoIcon, Briefcase, MapPin, Trophy, ShieldCheck, Mail, LogOut, ChevronDown, CreditCard, Lock, Calendar as CalendarIcon, ExternalLink, Users } from 'lucide-react';

const PlayerProfile = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [message, setMessage] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [player, setPlayer] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [isImpersonating, setIsImpersonating] = useState(false);
    const [loadingReset, setLoadingReset] = useState(false);
    const [coachApplication, setCoachApplication] = useState(null);
    const [showCoachModal, setShowCoachModal] = useState(false);
    const navigate = useNavigate();
    const [transactions, setTransactions] = useState([]);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    const [currentTransactionPage, setCurrentTransactionPage] = useState(1);
    const [transactionsPerPage] = useState(5);
    const [activeTab, setActiveTab] = useState('personal');
    const [tempLicenseDetails, setTempLicenseDetails] = useState(null);




    const [isActivationRequired, setIsActivationRequired] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const { getPlayerEventsAsync, loading: loadingEvents } = useRankedin();
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
        home_club: '',
        age: ''
    });

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 5000);
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (newPassword.length < 6) {
            showMessage('Password must be at least 6 characters', 'error');
            return;
        }
        setIsUpdatingPassword(true);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            showMessage(error.message, 'error');
        } else {
            showMessage('Password set successfully! Your account is now active.', 'success');
            setNewPassword('');
            setIsActivationRequired(false);
            // Clear the URL param
            navigate('/profile', { replace: true });
        }
        setIsUpdatingPassword(false);
    };

    useEffect(() => {
        const checkUserAndFetchProfile = async () => {
            setLoading(true);
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                navigate('/');
                return;
            }

            // Check if Admin is impersonating a user
            const testEmail = sessionStorage.getItem('admin_test_login_email');
            if (testEmail) {
                setIsImpersonating(true);
            }
            const emailToFetch = testEmail || session.user.email;

            const { data: playerData, error } = await supabase
                .from('players')
                .select('*')
                .eq('email', emailToFetch)
                .maybeSingle();

            if (error) {
                showMessage(error.message, 'error');
            } else if (playerData) {
                setPlayer(playerData);

                if (playerData.license_type === 'temporary') {
                    const { data: tempLicenseData } = await supabase
                        .from('temporary_licenses')
                        .select('*')
                        .eq('player_id', playerData.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (tempLicenseData) {
                        setTempLicenseDetails(tempLicenseData);
                    }
                }

                // Check for activation state
                const isInvite = window.location.search.includes('new_invite=true') || window.location.hash.includes('type=recovery') || window.location.hash.includes('type=invite') || window.location.hash.includes('type=magiclink');
                if (isInvite) {
                    setIsActivationRequired(true);
                }

                // Update last_login timestamp
                await supabase
                    .from('players')
                    .update({ last_login: new Date().toISOString() })
                    .eq('id', playerData.id);

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
                    age: playerData.age || ''
                });

                // Fetch associated coach application if any
                const { data: coachData } = await supabase
                    .from('coach_applications')
                    .select('*')
                    .eq('email', emailToFetch)
                    .maybeSingle();
                
                if (coachData) {
                    setCoachApplication(coachData);
                }

                // Fetch transactions for this user
                fetchTransactions(emailToFetch);
            }
            setLoading(false);
        };

        const fetchTransactions = async (email) => {
            setTransactionsLoading(true);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

                const res = await fetch(`${supabaseUrl}/functions/v1/paystack-transactions?email=${encodeURIComponent(email)}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    }
                });

                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(`Status ${res.status}: ${text}`);
                }

                const data = await res.json();
                if (data && data.transactions) {
                    setTransactions(data.transactions);
                }
            } catch (err) {
                console.error("Failed to fetch transactions:", err);
                alert("Transaction error: " + err.message);
            } finally {
                setTransactionsLoading(false);
            }
        };




        checkUserAndFetchProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigate]);

    const indexOfLastTransaction = currentTransactionPage * transactionsPerPage;
    const indexOfFirstTransaction = indexOfLastTransaction - transactionsPerPage;
    const currentTransactionsList = transactions.slice(indexOfFirstTransaction, indexOfLastTransaction);
    const totalTransactionPages = Math.ceil(transactions.length / transactionsPerPage);


    useEffect(() => {
        if (player?.rankedin_id) {
            const fetchEvents = async () => {
                const events = await getPlayerEventsAsync(player.rankedin_id);
                // Filter for upcoming events and sort by date
                const now = new Date();
                const filtered = (events || [])
                    .filter(e => new Date(e.start_date) >= now)
                    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

                if (filtered.length > 0) {
                    const { data: dbEvents } = await supabase
                        .from('calendar')
                        .select('rankedin_url, city, venue, registered_players, organizer_name, sapa_status, image_url');
                        
                    if (dbEvents) {
                        filtered.forEach(e => {
                            const match = dbEvents.find(dbE => dbE.rankedin_url && dbE.rankedin_url.includes(`/tournament/${e.id}/`));
                            if (match) {
                                e.city = match.city;
                                e.venue = match.venue;
                                e.registered_players = match.registered_players;
                                e.organizer_name = match.organizer_name;
                                e.sapa_status = match.sapa_status; 
                            }
                        });
                    }
                }

                setUpcomingEvents(filtered);
            };
            fetchEvents();
        }
    }, [player?.rankedin_id, getPlayerEventsAsync]);

    const handleInitiatePasswordReset = async () => {
        if (!player?.email) return;
        setLoadingReset(true);
        const { error } = await supabase.auth.resetPasswordForEmail(player.email, {
            redirectTo: window.location.origin + '/reset-password',
        });
        if (error) {
            showMessage(error.message, 'error');
        } else {
            showMessage('Password reset email sent! Please check your inbox.', 'success');
        }
        setLoadingReset(false);
    };

    const refetchPlayer = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.email) return;
        const { data } = await supabase.from('players').select('*').eq('email', session.user.email).maybeSingle();
        if (data) setPlayer(data);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!player) return;
        setSaving(true);
        setMessage(null);

        // Check if email is being changed
        const emailChanged = formData.email !== player.email;
        
        // Parse sponsors back to JSON array before saving
        let sponsorsArray = [];
        if (formData.sponsors && formData.sponsors.trim() !== '') {
            sponsorsArray = formData.sponsors.split(',').map(s => s.trim()).filter(Boolean);
        }
        const sponsorsJson = JSON.stringify(sponsorsArray);

        const updates = {
            name: formData.name,
            email: formData.email,
            contact_number: formData.contact_number,
            nationality: formData.nationality,
            gender: formData.gender,
            bio: formData.bio,
            home_club: formData.home_club,
            sponsors: sponsorsJson,
            image_url: formData.image_url,
            category: formData.category,
            id_number: formData.id_number,
            age: formData.age
        };

        try {
            // Update the players table
            const { error: dbError } = await supabase
                .from('players')
                .update(updates)
                .eq('id', player.id);

            if (dbError) throw dbError;

            // If email changed, update it in Supabase Auth as well
            if (emailChanged) {
                const { error: authError } = await supabase.auth.updateUser({ email: formData.email });
                if (authError) {
                    showMessage(`Profile updated, but email change failed: ${authError.message}`, 'error');
                } else {
                    showMessage('Profile updated! Please check your new email for confirmation.', 'success');
                }
            } else {
                showMessage('Profile updated successfully!', 'success');
            }
            
            setIsEditing(false);
            await refetchPlayer();
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setSaving(false);
        }
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
        <>
            <div className="min-h-screen bg-black text-white selection:bg-padel-green selection:text-black">

                {/* Password Setup Modal (for new invites or recovery) */}
                <AnimatePresence>
                    {isActivationRequired && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md"
                        >
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="w-full max-w-lg bg-[#0F172A] border border-white/10 p-8 md:p-12 rounded-[2.5rem] shadow-2xl relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-64 h-64 bg-padel-green/5 rounded-full blur-[80px] -mr-32 -mt-32" />
                                
                                <div className="relative z-10 text-center">
                                    <div className="w-20 h-20 bg-padel-green/10 rounded-2xl flex items-center justify-center mx-auto mb-8">
                                        <ShieldCheck className="text-padel-green w-10 h-10" />
                                    </div>
                                    
                                    <h3 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter">Secure Your Account</h3>
                                    <p className="text-gray-400 mb-10 font-medium text-lg">Please set a permanent password to complete your profile setup and secure your tournament data.</p>
                                    
                                    <form onSubmit={handleUpdatePassword} className="space-y-6">
                                        <div className="relative">
                                            <Lock className="absolute left-6 top-1/2 -translate-y-1/2 text-padel-green/40" size={20} />
                                            <input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                placeholder="Enter at least 6 characters"
                                                className="w-full bg-black/40 border border-white/10 rounded-2xl pl-16 pr-6 py-5 text-white focus:border-padel-green outline-none transition-all text-lg font-bold"
                                                required
                                            />
                                        </div>
                                        
                                        <button
                                            type="submit"
                                            disabled={isUpdatingPassword}
                                            className="w-full bg-padel-green text-black py-5 rounded-2xl font-black uppercase tracking-widest text-lg hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-padel-green/20 disabled:opacity-50"
                                        >
                                            {isUpdatingPassword ? 'Saving Password...' : 'Initialize Account'}
                                        </button>
                                        
                                        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest pt-4">
                                            This is a one-time requirement for invited players.
                                        </p>
                                    </form>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

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
                                        <PhotoIcon className="w-8 h-8 text-padel-green mb-2" />
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
                                        <span className={`${player.paid_registration ? (player.license_type === 'full' ? 'bg-padel-green text-black' : 'bg-blue-500 text-white') : 'bg-gray-700 text-gray-300'} px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg border border-white/10`}>
                                            {player.paid_registration ? (player.license_type === 'full' ? 'Full License' : 'Temporary License') : 'Pending License'}
                                        </span>
                                        {player.license_type === 'temporary' && (
                                            <span className="bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                                                Hidden from Players Page
                                            </span>
                                        )}
                                        {player.rankedin_id && (

                                            <span className="bg-black/40 backdrop-blur-md border border-white/10 text-padel-green px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                                                ID: {player.rankedin_id}
                                            </span>
                                        )}
                                        {player.age && (
                                            <span className="bg-white/10 backdrop-blur-md border border-white/10 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                                                Age: {player.age}
                                            </span>
                                        )}
                                    </div>
                                    <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-[0.85] mb-2 drop-shadow-2xl flex items-center flex-wrap gap-4">
                                        <span>{player.name}</span>
                                        {player.rank_label && player.rank_label !== 'Unranked' && (
                                            <span className="text-2xl md:text-3xl text-yellow-500 flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 px-4 py-1.5 rounded-2xl drop-shadow-none">
                                                <Trophy className="w-6 h-6 md:w-8 md:h-8" /> #{player.rank_label}
                                            </span>
                                        )}
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
                    {/* Payment Required Banner - shown when profile is not visible (none or temporary) */}
                    {player && (player.license_type !== 'full') && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`mb-8 p-6 rounded-2xl ${player.license_type === 'temporary' ? 'bg-blue-500/10 border-blue-500/30' : 'bg-padel-green/10 border-padel-green/30'} border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl ${player.license_type === 'temporary' ? 'bg-blue-500/20' : 'bg-padel-green/20'} flex items-center justify-center`}>
                                    <CreditCard className={player.license_type === 'temporary' ? 'text-blue-400' : 'text-padel-green'} size={24} />
                                </div>
                                <div>
                                    <h3 className="text-white font-bold text-lg">
                                        {player.license_type === 'temporary' ? 'Temporary License Active' : 'License Required'}
                                    </h3>
                                    <div className="text-gray-400 text-sm">
                                        {player.license_type === 'temporary' ? (
                                            <>
                                                <p>Your profile is hidden from the public Players page. Upgrade to a full license to be visible.</p>
                                                {tempLicenseDetails && (
                                                    <div className="mt-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                                        <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1">Assigned Event</p>
                                                        <p className="text-white font-bold">{tempLicenseDetails.event_name}</p>
                                                        <p className="text-xs text-gray-500 mt-1">{new Date(tempLicenseDetails.event_date).toLocaleDateString()}</p>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <p>Your profile is hidden from the Players page. Pay for a full license to go live.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-3 w-full sm:w-auto">
                                <button
                                    onClick={() => setShowPaymentModal(true)}
                                    className="flex-1 sm:flex-none bg-padel-green text-black font-black uppercase tracking-widest py-3 px-6 rounded-xl hover:bg-white hover:scale-105 transition-all shadow-lg shadow-padel-green/20"
                                >
                                    {player.license_type === 'temporary' ? 'Upgrade to Full License' : 'Pay Now - Full License'}
                                </button>
                                {player.license_type !== 'temporary' && (
                                    <button
                                        onClick={() => setShowPaymentModal(true)}
                                        className="flex-1 sm:flex-none bg-white/10 text-white font-bold py-3 px-6 rounded-xl hover:bg-white/20 border border-white/10 transition-all"
                                    >
                                        Buy Temporary License
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}


                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                        {/* Left Panel: Statistics & Quick Updates */}
                        <div className="lg:col-span-4 space-y-6 order-2 lg:order-1">
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
                                        <div className="min-w-[4.5rem] px-3 h-14 bg-padel-green text-black rounded-xl flex flex-col items-center justify-center">
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

                                    <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Division</p>
                                        <p className="text-xl font-bold text-padel-green uppercase">{player.category || 'Unassigned'}</p>
                                    </div>
                                </div>
                            </motion.div>

                            <div className="bg-padel-green/5 border border-padel-green/20 rounded-[2.5rem] p-8">
                                <ShieldCheck className="text-padel-green mb-4" size={32} />
                                <h4 className="font-bold text-white mb-2">Account Security</h4>
                                <p className="text-xs text-white/50 leading-relaxed uppercase tracking-wider font-bold mb-6">
                                    To Reset your password, click the button below and follow the instructions on the email.
                                </p>
                                <button
                                    onClick={handleInitiatePasswordReset}
                                    disabled={loadingReset}
                                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest py-3 rounded-xl transition-all flex items-center justify-center gap-2 mb-4"
                                >
                                    <Lock size={14} className="text-padel-green" />
                                    {loadingReset ? 'Sending Email...' : 'Reset Password'}
                                </button>


                            </div>
                        </div>

                        {/* Right Panel: Content */}
                        <div className="lg:col-span-8 space-y-8 order-1 lg:order-2">
                            
                            {/* Tab Navigation */}
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex overflow-x-auto no-scrollbar gap-2 pb-2 -mx-6 px-6 sm:mx-0 sm:px-0"
                            >
                                <button
                                    onClick={() => setActiveTab('personal')}
                                    className={`whitespace-nowrap px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-[11px] transition-all flex items-center gap-3 ${activeTab === 'personal' ? 'bg-padel-green text-black shadow-xl shadow-padel-green/20' : 'bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'}`}
                                >
                                    <User size={16} /> Personal Info
                                </button>
                                <button
                                    onClick={() => setActiveTab('payments')}
                                    className={`whitespace-nowrap px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-[11px] transition-all flex items-center gap-3 ${activeTab === 'payments' ? 'bg-blue-500 text-white shadow-xl shadow-blue-500/20' : 'bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'}`}
                                >
                                    <CreditCard size={16} /> Payment History
                                </button>
                                <button
                                    onClick={() => setActiveTab('events')}
                                    className={`whitespace-nowrap px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-[11px] transition-all flex items-center gap-3 ${activeTab === 'events' ? 'bg-purple-500 text-white shadow-xl shadow-purple-500/20' : 'bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'}`}
                                >
                                    <CalendarIcon size={16} /> Upcoming Events
                                </button>
                                {coachApplication && (
                                    <button
                                        onClick={() => setShowCoachModal(true)}
                                        className="whitespace-nowrap px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] sm:text-[11px] transition-all flex items-center gap-3 bg-padel-green text-black shadow-xl shadow-padel-green/20 hover:bg-white hover:scale-105"
                                    >
                                        <Briefcase size={16} /> Coach Profile
                                    </button>
                                )}
                            </motion.div>

                            <AnimatePresence mode="wait">
                                {activeTab === 'personal' && (
                                    <motion.div
                                        key="personal"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.2 }}
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

                                <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-2xl font-black uppercase tracking-tighter mb-2">Personal Management</h3>
                                        <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">Complete your profile to unlock premium player features</p>
                                    </div>
                                    {!isEditing && (
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="bg-padel-green text-black font-black uppercase tracking-widest px-6 py-3 rounded-xl hover:bg-white hover:scale-105 transition-all shadow-lg shadow-padel-green/20 text-xs"
                                        >
                                            Edit Profile
                                        </button>
                                    )}
                                </div>

                                <AnimatePresence mode="wait">
                                    {!isEditing ? (
                                        <motion.div
                                            key="summary"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="space-y-8"
                                        >
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Full Name</p>
                                                    <p className="text-xl font-bold text-white">{player.name || 'Not set'}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Gender</p>
                                                    <p className="text-xl font-bold text-white">{player.gender || 'Not set'}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Nationality</p>
                                                    <p className="text-xl font-bold text-white">{player.nationality || 'Not set'}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Category / Division</p>
                                                    <p className="text-xl font-bold text-padel-green uppercase">{player.category || 'Unassigned'}</p>
                                                </div>
                                            </div>

                                            {player.bio && (
                                                <div className="space-y-2">
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Biography</p>
                                                    <p className="text-gray-400 leading-relaxed font-medium">{player.bio}</p>
                                                </div>
                                            )}

                                            <div className="pt-8 border-t border-white/5">
                                                <div className="flex flex-wrap gap-4">
                                                    <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                                                        <Phone size={14} className="text-padel-green" />
                                                        <span className="text-xs font-bold text-white">{player.contact_number || 'No phone'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                                                        <Mail size={14} className="text-padel-green" />
                                                        <span className="text-xs font-bold text-white">{player.email}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.form
                                            key="form"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            onSubmit={handleSave}
                                            className="space-y-8"
                                        >
                                            <fieldset disabled={isImpersonating} className="space-y-8">
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
                                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Email Address</label>
                                                        <div className="relative">
                                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/40" size={18} />
                                                            <input
                                                                type="email"
                                                                value={formData.email}
                                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                                className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                                                placeholder="Email Address"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Age</label>
                                                        <div className="relative">
                                                            <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green/40" size={18} />
                                                            <input
                                                                type="number"
                                                                value={formData.age}
                                                                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                                                className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-padel-green/50 transition-all font-bold placeholder:text-gray-700"
                                                                placeholder="Your Age"
                                                            />
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
                                                    {!isImpersonating && (
                                                        <div className="flex items-center gap-4 w-full md:w-auto">
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsEditing(false)}
                                                                className="flex-1 md:flex-none bg-white/5 text-white font-black uppercase tracking-widest px-8 py-5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="submit"
                                                                disabled={saving}
                                                                className="flex-1 md:flex-none bg-padel-green text-black font-black uppercase tracking-widest px-10 py-5 rounded-2xl flex items-center justify-center gap-3 hover:bg-white hover:scale-105 transition-all shadow-xl shadow-padel-green/10 disabled:opacity-50 group active:scale-95"
                                                            >
                                                                <Save size={20} className="group-hover:rotate-12 transition-transform" />
                                                                {saving ? 'Syncing...' : 'Save Profile'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </fieldset>
                                        </motion.form>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                                )}

                                {/* Payment Transactions Section */}
                                {activeTab === 'payments' && (
                                    <motion.div
                                        key="payments"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.2 }}
                                        className="bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden"
                                    >
                                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[80px] -mr-32 -mt-32" />
                                
                                <div className="mb-10 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-2xl font-black uppercase tracking-tighter mb-2">Payment Transactions</h3>
                                        <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">Your financial history with SAPA</p>
                                    </div>
                                    <div className="bg-blue-500/10 text-blue-400 p-3 rounded-2xl">
                                        <CreditCard size={24} />
                                    </div>
                                </div>

                                {transactionsLoading ? (
                                    <div className="flex flex-col items-center justify-center py-12">
                                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
                                        <p className="text-gray-500 text-xs font-black uppercase tracking-widest">Fetching payment history...</p>
                                    </div>
                                ) : transactions.length === 0 ? (
                                    <div className="bg-white/5 rounded-3xl p-12 text-center border border-white/5">
                                        <AlertCircle className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                                        <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">No transactions found</p>
                                        <p className="text-gray-600 text-xs mt-2">Payments are processed securely via Paystack</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {/* Table Header - for desktop */}
                                        <div className="hidden md:grid grid-cols-4 gap-4 px-6 py-4 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-500">
                                            <div>Reference</div>
                                            <div>Date</div>
                                            <div>Amount</div>
                                            <div className="text-right">Status</div>
                                        </div>

                                        {/* Transaction Rows */}
                                        {currentTransactionsList.map((trx) => (
                                            <div key={trx.id} className="group bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl p-6 transition-all flex flex-col md:grid md:grid-cols-4 md:items-center gap-4">

                                                <div className="flex flex-col text-sm border-b md:border-none border-white/5 pb-2 md:pb-0">
                                                    <span className="md:hidden text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Reference</span>
                                                    <span className="font-mono text-gray-400">{trx.id}</span>
                                                </div>
                                                <div className="flex flex-col text-sm">
                                                    <span className="md:hidden text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Date</span>
                                                    <span className="text-gray-200">{trx.date}</span>
                                                </div>
                                                <div className="flex flex-col text-sm">
                                                    <span className="md:hidden text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Amount</span>
                                                    <span className="text-white font-black">{trx.amount}</span>
                                                </div>
                                                <div className="flex flex-col items-start md:items-end">
                                                    <span className="md:hidden text-[8px] font-black text-gray-500 uppercase tracking-widest mb-1">Status</span>
                                                    <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                        trx.status === 'Success' 
                                                            ? 'bg-padel-green text-black' 
                                                            : trx.status === 'Failed' 
                                                                ? 'bg-red-500/20 text-red-500 border border-red-500/20' 
                                                                : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/20'
                                                    }`}>
                                                        {trx.status}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}

                                        {/* Pagination Controls */}
                                        {transactions.length > transactionsPerPage && (
                                            <div className="flex justify-between items-center mt-8 px-2">
                                                <span className="text-gray-500 text-[10px] font-black uppercase tracking-widest">
                                                    Page {currentTransactionPage} of {totalTransactionPages}
                                                </span>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setCurrentTransactionPage(prev => Math.max(prev - 1, 1))}
                                                        disabled={currentTransactionPage === 1}
                                                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-all shadow-xl"
                                                    >
                                                        Prev
                                                    </button>
                                                    <button
                                                        onClick={() => setCurrentTransactionPage(prev => Math.min(prev + 1, totalTransactionPages))}
                                                        disabled={currentTransactionPage === totalTransactionPages}
                                                        className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 transition-all shadow-xl"
                                                    >
                                                        Next
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <p className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.2em] text-center pt-8">

                                            Only your 50 most recent SAPA transactions are displayed.
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                                )}


                                {/* My Upcoming Events Section */}
                                {activeTab === 'events' && (
                                    <motion.div
                                        key="events"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        transition={{ duration: 0.2 }}
                                        className="bg-[#0F172A]/80 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden"
                                    >
                                <div className="absolute top-0 right-0 w-64 h-64 bg-padel-green/5 rounded-full blur-[80px] -mr-32 -mt-32" />
                                
                                <div className="relative z-10">
                                    <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-padel-green/10 flex items-center justify-center">
                                                <CalendarIcon className="text-padel-green" size={24} />
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-black uppercase tracking-tighter">My Upcoming Events</h3>
                                                <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">Scheduled tournaments from Rankedin</p>
                                            </div>
                                        </div>
                                    </div>

                                    {loadingEvents ? (
                                        <div className="flex items-center justify-center py-12">
                                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-padel-green"></div>
                                        </div>
                                    ) : upcomingEvents && upcomingEvents.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {upcomingEvents.map((event) => {
                                                let badgeColor = 'bg-padel-green/20 text-padel-green border-padel-green/30';
                                                let hoverBorder = 'hover:border-padel-green/50';
                                                let glowColor = 'bg-padel-green/10';
                                                let textColor = 'group-hover:text-padel-green';

                                                if (event.sapa_status === 'Major') {
                                                    badgeColor = 'bg-red-500/20 text-red-400 border-red-500/30';
                                                    hoverBorder = 'hover:border-red-500/50';
                                                    glowColor = 'bg-red-500/10';
                                                    textColor = 'group-hover:text-red-400';
                                                } else if (event.sapa_status === 'Super Gold' || event.sapa_status === 'S Gold') {
                                                    badgeColor = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
                                                    hoverBorder = 'hover:border-amber-500/50';
                                                    glowColor = 'bg-amber-500/10';
                                                    textColor = 'group-hover:text-amber-400';
                                                } else if (event.sapa_status === 'Gold') {
                                                    badgeColor = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
                                                    hoverBorder = 'hover:border-yellow-500/50';
                                                    glowColor = 'bg-yellow-500/10';
                                                    textColor = 'group-hover:text-yellow-400';
                                                } else if (event.sapa_status === 'Silver') {
                                                    badgeColor = 'bg-gray-500/20 text-gray-300 border-gray-400/30';
                                                    hoverBorder = 'hover:border-gray-400/50';
                                                    glowColor = 'bg-gray-400/10';
                                                    textColor = 'group-hover:text-gray-300';
                                                } else if (event.sapa_status === 'Bronze') {
                                                    badgeColor = 'bg-orange-700/20 text-orange-400 border-orange-700/30';
                                                    hoverBorder = 'hover:border-orange-700/50';
                                                    glowColor = 'bg-orange-700/10';
                                                    textColor = 'group-hover:text-orange-400';
                                                } else if (event.sapa_status === 'FIP event') {
                                                    badgeColor = 'bg-blue-500/20 text-blue-400 border-blue-500/30';
                                                    hoverBorder = 'hover:border-blue-500/50';
                                                    glowColor = 'bg-blue-500/10';
                                                    textColor = 'group-hover:text-blue-400';
                                                }

                                                return (
                                                    <div key={event.id} className={`bg-black/40 border border-white/5 rounded-2xl p-6 ${hoverBorder} transition-all group relative overflow-hidden flex flex-col justify-between`}>
                                                        <div className={`absolute top-0 right-0 w-32 h-32 ${glowColor} rounded-full blur-3xl -mr-16 -mt-16 group-hover:opacity-100 opacity-50 transition-all`} />

                                                        <div className="relative z-10 flex-1">
                                                            <div className="flex justify-between items-start mb-4">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-1">Date</span>
                                                                    <span className="text-xs font-bold text-white">
                                                                        {new Date(event.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                    </span>
                                                                </div>
                                                                <a
                                                                    href={`https://www.rankedin.com/en/tournament/${event.id}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400 hover:text-white transition-all"
                                                                >
                                                                    <ExternalLink size={14} />
                                                                </a>
                                                            </div>

                                                            <h4 className={`text-lg font-black text-white mb-4 line-clamp-2 uppercase tracking-tight ${textColor} transition-colors`}>
                                                                {event.event_name}
                                                            </h4>
                                                        </div>

                                                        {/* Bottom Section */}
                                                        <div className="relative z-10 mt-4 border-t border-white/5 pt-4">
                                                            <div className="flex flex-wrap gap-2 mb-3">
                                                                <span className={`px-2 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest ${badgeColor}`}>
                                                                    {event.sapa_status !== 'None' ? event.sapa_status : 'Upcoming'}
                                                                </span>
                                                                {event.city && (
                                                                    <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 text-gray-300">
                                                                        {event.city}
                                                                    </span>
                                                                )}
                                                                {event.registered_players > 0 && (
                                                                    <div className="flex items-center gap-1.5 bg-padel-green/5 border border-padel-green/10 px-2 py-1 rounded-md">
                                                                        <Users className="w-3 h-3 text-padel-green" />
                                                                        <span className="text-white font-bold text-[10px] leading-none">{event.registered_players}</span>
                                                                        <span className="text-[9px] uppercase tracking-tighter text-gray-400 font-bold leading-none">Registered</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {/* Location and Org */}
                                                            <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-gray-400 text-xs font-medium">
                                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                                    <MapPin className="w-3.5 h-3.5 text-padel-green/50 shrink-0" />
                                                                    <span className="truncate" title={event.venue || 'Location to be confirmed'}>
                                                                        {event.venue || 'Location to be confirmed'}
                                                                    </span>
                                                                </div>
                                                                {event.organizer_name && (
                                                                    <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full shrink-0">
                                                                        <User className="w-3 h-3 text-gray-400" />
                                                                        <span className="text-[9px] uppercase tracking-tighter text-gray-400 font-bold">Org:</span>
                                                                        <span className="text-white font-bold text-[10px]">{event.organizer_name}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-center py-16 bg-black/20 rounded-3xl border border-white/5 relative overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-br from-padel-green/5 to-transparent opacity-50" />
                                            <div className="relative z-10">
                                                <CalendarIcon className="w-12 h-12 text-white/5 mx-auto mb-4" />
                                                <p className="text-gray-500 font-black uppercase tracking-[0.2em] text-[10px]">No upcoming events listed</p>
                                                <p className="text-gray-600 text-[9px] mt-2 font-bold uppercase tracking-widest">Connect your Rankedin profile to see your schedule</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                <LicensePaymentModal
                    isOpen={showPaymentModal}
                    onClose={() => setShowPaymentModal(false)}
                    userEmail={player?.email}
                    userName={player?.name}
                    onPaymentSuccess={refetchPlayer}
                />

                {showCoachModal && coachApplication && (
                    <CoachProfileModal
                        app={coachApplication}
                        isAdmin={false}
                        onClose={() => setShowCoachModal(false)}
                        onUpdate={(updatedApp) => setCoachApplication(updatedApp)}
                    />
                )}
            </div >
        </>
    );
};

export default PlayerProfile;
