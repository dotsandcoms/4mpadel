import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, Phone, CheckCircle, AlertCircle, Eye, EyeOff, Info, Camera, Upload } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePaystackPayment } from 'react-paystack';
import { FEES, toPaystackAmount, formatCurrency } from '../constants/fees';
import { useRankedin } from '../hooks/useRankedin';

const PAYSTACK_PUBLIC_KEY = String(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '')
    .trim()
    .replace(/['"]/g, '')
    .split(/\s+/)[0] // Take only the first word in case of multiple values
    .replace(/[^a-zA-Z0-9_]/g, ''); // Remove any non-alphanumeric/underscore characters (BOMs, etc)

console.log('Paystack Config Check:', {
    keyPrefix: PAYSTACK_PUBLIC_KEY ? PAYSTACK_PUBLIC_KEY.substring(0, 12) + '...' : 'MISSING',
    keyLength: PAYSTACK_PUBLIC_KEY.length,
    isLive: PAYSTACK_PUBLIC_KEY.startsWith('pk_live_')
});

const isPaystackConfigured = () => PAYSTACK_PUBLIC_KEY.startsWith('pk_');

const AuthModal = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('login'); // 'login', 'register', 'forgot_password'
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const navigate = useNavigate();
    const location = useLocation();

    // Form states
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [category, setCategory] = useState('');
    const [gender, setGender] = useState('');
    const [nationality, setNationality] = useState('');
    const [idNumber, setIdNumber] = useState('');
    const [bio, setBio] = useState('');
    const [homeClub, setHomeClub] = useState('');
    const [sponsors, setSponsors] = useState('');
    const [instagramLink, setInstagramLink] = useState('');
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [paymentOption, setPaymentOption] = useState('pay_now'); // 'pay_now' | 'temporary' | 'pay_later'
    const [showPassword, setShowPassword] = useState(false);
    const [profilePic, setProfilePic] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [region, setRegion] = useState('');
    const [racketBrand, setRacketBrand] = useState('');
    const [customRacketBrand, setCustomRacketBrand] = useState('');

    // Temporary License Addition
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const [selectedEventId, setSelectedEventId] = useState('');
    const [eventsLoading, setEventsLoading] = useState(false);

    React.useEffect(() => {
        if (step === 3 && paymentOption === 'temporary' && upcomingEvents.length === 0) {
            const fetchEvents = async () => {
                setEventsLoading(true);
                try {
                    const { data: events, error } = await supabase
                        .from('calendar')
                        .select('id, event_name, start_date')
                        .gte('start_date', new Date().toISOString())
                        .order('start_date', { ascending: true });
                    
                    if (!error && events) {
                        setUpcomingEvents(events);
                    }
                } catch (e) {
                    console.error("Failed to load events", e);
                } finally {
                    setEventsLoading(false);
                }
            };
            fetchEvents();
        }
    }, [step, paymentOption, upcomingEvents.length]);

    const resetForm = () => {
        setStep(1);
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setFirstName('');
        setLastName('');
        setContactNumber('');
        setCategory('');
        setGender('');
        setNationality('');
        setIdNumber('');
        setBio('');
        setHomeClub('');
        setSponsors('');
        setInstagramLink('');
        setAcceptTerms(false);
        setPaymentOption('pay_now');
        setSelectedEventId('');
        setRegion('');
        setRacketBrand('');
        setCustomRacketBrand('');
        setMessage(null);
    };

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        if (type === 'success') {
            setTimeout(() => {
                setMessage(null);
                onClose();
                
                // Determine redirect path based on where the user logged in from
                const isAdminContext = location.pathname.startsWith('/admin') || location.pathname.startsWith('/reports');
                const targetPath = isAdminContext ? '/admin' : '/profile';
                
                navigate(targetPath);
            }, 2500);
        }
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                setMessage({ type: 'error', text: 'Image size must be less than 2MB' });
                return;
            }
            setProfilePic(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            showMessage(error.message, 'error');
        } else {
            showMessage('Successfully logged in!', 'success');
        }
        setLoading(false);
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/reset-password',
        });

        if (error) {
            showMessage(error.message, 'error');
        } else {
            showMessage('Password reset link sent to your email!', 'success');
            // We don't close the modal immediately so they can see the message
            setTimeout(() => {
                setActiveTab('login');
                setMessage(null);
            }, 3000);
        }
        setLoading(false);
    };

    const handleRegistrationSubmit = async (e) => {
        e.preventDefault();
        setMessage(null);

        // Validation for Step 1
        if (step === 1) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                setMessage({ type: 'error', text: 'Please enter a valid email address.' });
                return;
            }
            const passwordErrors = [];
            if (password.length < 6) passwordErrors.push("6+ characters");
            if (!/[a-z]/.test(password)) passwordErrors.push("one lowercase letter");
            if (!/[A-Z]/.test(password)) passwordErrors.push("one uppercase letter");
            if (!/[0-9]/.test(password)) passwordErrors.push("one number");
            if (!/[@#$%^&*\-+=|<>?/,.'~]/.test(password)) passwordErrors.push("one special character (@#$%^&*-+-=)");

            if (passwordErrors.length > 0) {
                setMessage({ 
                    type: 'error', 
                    text: `Password must contain: ${passwordErrors.join(', ')}.` 
                });
                return;
            }
            if (password !== confirmPassword) {
                setMessage({ type: 'error', text: 'Passwords do not match.' });
                return;
            }
            if (!firstName || !lastName || !contactNumber || !gender || !nationality || !idNumber || !region) {
                setMessage({ type: 'error', text: 'Please fill in all required fields for Step 1.' });
                return;
            }

            // Check if email already exists
            setLoading(true);
            const { data: existingPlayer } = await supabase
                .from('players')
                .select('email')
                .ilike('email', email)
                .maybeSingle();
                
            if (existingPlayer) {
                setLoading(false);
                setMessage({ type: 'error', text: 'This email is already registered. Please sign in or reset your password.' });
                return;
            }
            
            setLoading(false);
            setStep(2);
            return;
        }

        // Validation for Step 2: Padel Profile
        if (step === 2) {
            if (!category || !homeClub || !bio) {
                setMessage({ type: 'error', text: 'Please fill in all required fields for Step 2.' });
                return;
            }
            if (!acceptTerms) {
                setMessage({ type: 'error', text: 'You must accept the Terms & Conditions to register.' });
                return;
            }
            setStep(3);
            return;
        }

        // Validation for Step 3: Payment Options
        if (step === 3) {
            if (paymentOption === 'temporary' && !selectedEventId) {
                setMessage({ type: 'error', text: 'Please select an event for your temporary license.' });
                return;
            }

            setLoading(true);

            const hasSupabase = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
            if (!hasSupabase) {
                showMessage('Supabase is not configured. Add VITE_SUPABASE_URL to your .env file.', 'error');
                setLoading(false);
                return;
            }

            // 1. Always try to sign up the account first
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
            });

            if (authError) {
                showMessage('Registration failed: ' + authError.message, 'error');
                setLoading(false);
                return;
            }

            // 3. Handle image upload if selected
            let uploadedImageUrl = null;
            if (profilePic) {
                setIsUploading(true);
                try {
                    const fileExt = profilePic.name.split('.').pop();
                    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
                    const filePath = `registration/${fileName}`;

                    const { error: uploadError } = await supabase.storage
                        .from('profile-pics')
                        .upload(filePath, profilePic);

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = supabase.storage
                        .from('profile-pics')
                        .getPublicUrl(filePath);
                    
                    uploadedImageUrl = publicUrl;
                } catch (error) {
                    console.error('Error uploading image:', error);
                    // Continue without image if upload fails? User might want to know.
                    // For now, let's just proceed.
                } finally {
                    setIsUploading(false);
                }
            }

            // 4. Create the initial profile (unpaid) or paid depending on logic
            const baseParams = {
                p_email: email,
                p_name: `${firstName} ${lastName}`.trim(),
                p_contact: contactNumber,
                p_category: category || 'Unranked',
                p_gender: gender,
                p_nationality: nationality,
                p_id_number: idNumber,
                p_bio: bio,
                p_home_club: homeClub,
                p_sponsors: sponsors,
                p_region: region,
                p_racket_brand: racketBrand === 'Other' ? customRacketBrand : racketBrand,
            };

            const { error: insertError } = await supabase.rpc('create_player_profile', {
                ...baseParams,
                p_paid_registration: false,
                p_license_type: 'none',
                p_image_url: uploadedImageUrl,
                p_racket_brand: racketBrand === 'Other' ? customRacketBrand : racketBrand,
            });

            if (insertError) {
                showMessage('Account created, but failed to setup profile: ' + insertError.message, 'error');
                setLoading(false);
                return;
            }

            // 3. Handle Payment or Finish
            if (paymentOption === 'pay_later') {
                showMessage('Registration successful! Your profile is created. Pay for a license to make it visible on the Players page.', 'success');
                setLoading(false);
            } else {
                console.log(`Initializing Paystack for ${formatCurrency(paymentOption === 'temporary' ? FEES.TEMPORARY_LICENSE : FEES.FULL_LICENSE)} Registration...`);
                handlePaystackPayment({ 
                    onSuccess: async (reference) => {
                        console.log('Payment successful. Reference:', reference);
                        
                        const { error: updateError } = await supabase.rpc('mark_player_paid', {
                            p_license_type: paymentOption === 'temporary' ? 'temporary' : 'full',
                        });

                        if (updateError) {
                            showMessage('Payment successful, but failed to update profile status. Please contact support.', 'error');
                            setLoading(false);
                            return;
                        }

                        if (paymentOption === 'temporary' && selectedEventId) {
                            const eventDetails = upcomingEvents.find(e => e.id?.toString() === selectedEventId.toString());
                            if (eventDetails) {
                                const { data: pData } = await supabase.from('players').select('id').ilike('email', email).maybeSingle();
                                if (pData?.id) {
                                    await supabase.from('temporary_licenses').insert({
                                        player_id: pData.id,
                                        event_id: eventDetails.id,
                                        event_name: eventDetails.event_name || 'Calendar Event',
                                        event_date: eventDetails.start_date
                                    });
                                }
                            }
                        }

                        showMessage('Payment and Registration successful! Welcome to 4m Padel.', 'success');
                        setLoading(false);
                    }, 
                    onClose: () => {
                        showMessage('Registration successful, but payment was cancelled. You can pay later from your profile.', 'error');
                        setLoading(false);
                    } 
                });
            }
        }
    };

    const paystackConfig = {
        reference: (new Date()).getTime().toString(),
        email: email,
        amount: toPaystackAmount(paymentOption === 'temporary' ? FEES.TEMPORARY_LICENSE : FEES.FULL_LICENSE),
        publicKey: PAYSTACK_PUBLIC_KEY,
        currency: 'ZAR',
        firstname: firstName,
        lastname: lastName,
    };

    const handlePaystackPayment = usePaystackPayment(paystackConfig);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-md max-h-[90vh] flex flex-col bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                >
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
                    >
                        <X size={20} />
                    </button>

                    <div className="pt-8 pb-6 px-8 text-center border-b border-white/5 bg-white/5">
                        <h2 className="text-2xl font-bold text-white mb-2">
                            {activeTab === 'login' ? 'Welcome Back' : activeTab === 'register' ? 'Create Profile' : 'Reset Password'}
                        </h2>
                        <p className="text-gray-400 text-sm">
                            {activeTab === 'login'
                                ? 'Enter your credentials to access your profile'
                                : activeTab === 'register'
                                    ? 'Register to manage your player profile and stats'
                                    : 'Retrieve your account access'}
                        </p>
                    </div>

                    <div className="flex border-b border-white/10">
                        <button
                            onClick={() => { setActiveTab('login'); resetForm(); }}
                            className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'login' || activeTab === 'forgot_password' ? 'text-padel-green border-b-2 border-padel-green' : 'text-gray-400 hover:text-white'}`}
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => { setActiveTab('register'); resetForm(); }}
                            className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'register' ? 'text-padel-green border-b-2 border-padel-green' : 'text-gray-400 hover:text-white'}`}
                        >
                            Register
                        </button>
                    </div>

                    <div className="p-8 overflow-y-auto flex-1 min-h-0">
                        {message && (
                            <div className={`flex items-center gap-3 p-4 rounded-xl mb-6 text-sm font-medium ${message.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-padel-green/10 text-padel-green border border-padel-green/20'}`}>
                                {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
                                {message.text}
                            </div>
                        )}

                        <form onSubmit={activeTab === 'login' ? handleLogin : activeTab === 'register' ? handleRegistrationSubmit : handleForgotPassword} className="space-y-4">
                            {activeTab === 'register' ? (
                                <>
                                    {step === 1 ? (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-padel-green text-[10px] font-black uppercase tracking-widest">Step 1: Personal</span>
                                                <span className="text-gray-500 text-[10px] font-bold">1 / 3</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="relative">
                                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                    <input
                                                        type="text"
                                                        placeholder="Name"
                                                        value={firstName}
                                                        onChange={(e) => setFirstName(e.target.value)}
                                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-padel-green transition-all text-sm"
                                                        required
                                                    />
                                                </div>
                                                <div className="relative">
                                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                    <input
                                                        type="text"
                                                        placeholder="Surname"
                                                        value={lastName}
                                                        onChange={(e) => setLastName(e.target.value)}
                                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white focus:outline-none focus:border-padel-green transition-all text-sm"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-gray-400 mt-1 pl-1">
                                                <Info className="inline-block w-3 h-3 mr-1 -mt-0.5 text-padel-green/70" />
                                                Please use your name exactly as it is shown on Rankedin
                                            </p>
                                            <div className="relative">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                <input
                                                    type="email"
                                                    placeholder="Email Address"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                                    required
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="relative">
                                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                    <input
                                                        type={showPassword ? 'text' : 'password'}
                                                        placeholder="Password"
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-11 pr-10 text-white text-sm focus:outline-none focus:border-padel-green transition-all"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                                    >
                                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                                <div className="relative">
                                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                    <input
                                                        type={showPassword ? 'text' : 'password'}
                                                        placeholder="Confirm"
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-11 pr-10 text-white text-sm focus:outline-none focus:border-padel-green transition-all"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                                    >
                                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                <input
                                                    type="tel"
                                                    placeholder="Contact Number"
                                                    value={contactNumber}
                                                    onChange={(e) => setContactNumber(e.target.value)}
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                                    required
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <select
                                                    value={gender}
                                                    onChange={(e) => setGender(e.target.value)}
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl h-12 px-4 text-white text-sm focus:outline-none focus:border-padel-green transition-all appearance-none cursor-pointer"
                                                    required
                                                >
                                                    <option value="" disabled>Gender</option>
                                                    <option value="Male">Male</option>
                                                    <option value="Female">Female</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    placeholder="Nationality"
                                                    value={nationality}
                                                    onChange={(e) => setNationality(e.target.value)}
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green transition-all"
                                                    required
                                                />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="relative">
                                                    <input
                                                        type="text"
                                                        placeholder="ID / Passport Number"
                                                        value={idNumber}
                                                        onChange={(e) => setIdNumber(e.target.value)}
                                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green transition-all"
                                                        required
                                                    />
                                                </div>
                                                <select
                                                    value={region}
                                                    onChange={(e) => setRegion(e.target.value)}
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl h-12 px-4 text-white text-sm focus:outline-none focus:border-padel-green transition-all appearance-none cursor-pointer"
                                                    required
                                                >
                                                    <option value="" disabled>Region</option>
                                                    <option value="Eastern Cape">Eastern Cape</option>
                                                    <option value="Free State">Free State</option>
                                                    <option value="Gauteng">Gauteng</option>
                                                    <option value="KwaZulu-Natal">KwaZulu-Natal</option>
                                                    <option value="Limpopo">Limpopo</option>
                                                    <option value="Mpumalanga">Mpumalanga</option>
                                                    <option value="Northern Cape">Northern Cape</option>
                                                    <option value="North West">North West</option>
                                                    <option value="Western Cape">Western Cape</option>
                                                </select>
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={loading}
                                                className="w-full bg-padel-green text-black font-black uppercase tracking-widest py-4 rounded-xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-padel-green/20 disabled:opacity-50"
                                            >
                                                {loading ? 'Checking...' : 'Next Step'}
                                            </button>
                                        </div>
                                    ) : step === 2 ? (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between mb-4">
                                                <span className="text-padel-green text-[10px] font-black uppercase tracking-widest">Step 2: Padel Profile</span>
                                                <span className="text-gray-500 text-[10px] font-bold">2 / 3</span>
                                            </div>

                                            {/* Profile Picture Upload */}
                                            <div className="flex flex-col items-center gap-4 py-2">
                                                <div className="relative group">
                                                    <div className="w-24 h-24 rounded-full border-2 border-dashed border-white/20 bg-black/40 flex items-center justify-center overflow-hidden transition-all group-hover:border-padel-green/50">
                                                        {previewUrl ? (
                                                            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Camera size={28} className="text-gray-500 group-hover:text-padel-green transition-colors" />
                                                        )}
                                                    </div>
                                                    <label className="absolute -bottom-1 -right-1 bg-padel-green text-black p-2 rounded-full cursor-pointer hover:bg-white transition-all shadow-lg">
                                                        <Upload size={14} />
                                                        <input 
                                                            type="file" 
                                                            className="hidden" 
                                                            accept="image/*" 
                                                            onChange={handleImageChange}
                                                        />
                                                    </label>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Profile Picture</p>
                                                    <p className="text-[9px] text-gray-500 uppercase mt-0.5">JPG, PNG allowed • Max 2MB</p>
                                                </div>
                                            </div>

                                            <select
                                                value={category}
                                                onChange={(e) => setCategory(e.target.value)}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl h-12 px-4 text-white focus:outline-none focus:border-padel-green transition-all appearance-none cursor-pointer"
                                                required
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
                                            <input
                                                type="text"
                                                placeholder="Home Club"
                                                value={homeClub}
                                                onChange={(e) => setHomeClub(e.target.value)}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                                required
                                            />
                                            <textarea
                                                placeholder="Tell us about your padel journey..."
                                                value={bio}
                                                onChange={(e) => setBio(e.target.value)}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-padel-green transition-all min-h-[100px] resize-none"
                                                required
                                            />
                                            <input
                                                type="url"
                                                placeholder="Instagram Link (Optional)"
                                                value={instagramLink}
                                                onChange={(e) => setInstagramLink(e.target.value)}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                            />
                                            <input
                                                type="text"
                                                placeholder="Sponsors (Optional)"
                                                value={sponsors}
                                                onChange={(e) => setSponsors(e.target.value)}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                            />

                                            <div className="space-y-3">
                                                <select
                                                    value={racketBrand}
                                                    onChange={(e) => setRacketBrand(e.target.value)}
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl h-12 px-4 text-white text-sm focus:outline-none focus:border-padel-green transition-all appearance-none cursor-pointer"
                                                    required
                                                >
                                                    <option value="" disabled>Racket Brand</option>
                                                    <option value="Adidas">Adidas</option>
                                                    <option value="Babolat">Babolat</option>
                                                    <option value="Bull Padel">Bull Padel</option>
                                                    <option value="Nox">Nox</option>
                                                    <option value="Varlion">Varlion</option>
                                                    <option value="Oxdog">Oxdog</option>
                                                    <option value="Wilson">Wilson</option>
                                                    <option value="Head">Head</option>
                                                    <option value="Siux">Siux</option>
                                                    <option value="Other">Other</option>
                                                </select>

                                                {racketBrand === 'Other' && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                    >
                                                        <input
                                                            type="text"
                                                            placeholder="Please specify your racket brand"
                                                            value={customRacketBrand}
                                                            onChange={(e) => setCustomRacketBrand(e.target.value)}
                                                            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-padel-green transition-all text-sm"
                                                            required
                                                        />
                                                    </motion.div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    id="acceptTerms"
                                                    checked={acceptTerms}
                                                    onChange={(e) => setAcceptTerms(e.target.checked)}
                                                    className="w-4 h-4 rounded border-white/20 bg-black/50 text-padel-green focus:ring-padel-green focus:ring-offset-0 cursor-pointer"
                                                />
                                                <label htmlFor="acceptTerms" className="text-sm text-gray-300 cursor-pointer select-none">
                                                    Accept &quot;Terms &amp; Conditions&quot;
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowTermsModal(true)}
                                                    className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-gray-400 hover:text-padel-green transition-colors"
                                                    title="View Terms & Conditions"
                                                >
                                                    <Info size={14} />
                                                </button>
                                            </div>
                                            <div className="flex gap-3 pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setStep(1)}
                                                    className="w-1/3 bg-white/5 text-white font-bold py-4 rounded-xl hover:bg-white/10 transition-all border border-white/10"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    type="submit"
                                                    className="flex-1 bg-padel-green text-black font-black uppercase tracking-widest py-4 rounded-xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-padel-green/20"
                                                >
                                                    Next Step
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-padel-green text-[10px] font-black uppercase tracking-widest">Step 3: Payment Options</span>
                                                <span className="text-gray-500 text-[10px] font-bold">3 / 3</span>
                                            </div>

                                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-4">
                                                <label className="block text-[10px] font-black text-padel-green uppercase tracking-widest mb-3">Payment Option</label>
                                                <div className="space-y-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPaymentOption('pay_now')}
                                                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${paymentOption === 'pay_now' ? 'bg-black/40 border-padel-green/50' : 'bg-black/30 border-white/10 hover:border-white/20'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center p-1.5">
                                                                <img src="https://upload.wikimedia.org/wikipedia/commons/0/0b/Paystack_Logo.png" alt="Paystack" className="w-full h-full object-contain" />
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="text-white font-bold text-sm">Pay Now</p>
                                                                <p className="text-gray-500 text-[10px] uppercase font-bold">Annual License Fee: {formatCurrency(FEES.FULL_LICENSE)} • Profile visible immediately</p>
                                                            </div>
                                                        </div>
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentOption === 'pay_now' ? 'border-padel-green' : 'border-white/30'}`}>
                                                            {paymentOption === 'pay_now' && <div className="w-2.5 h-2.5 bg-padel-green rounded-full"></div>}
                                                        </div>
                                                    </button>
                                                    <div className={`w-full flex-col rounded-xl border transition-all ${paymentOption === 'temporary' ? 'bg-black/40 border-padel-green/50' : 'bg-black/30 border-white/10 hover:border-white/20'}`}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPaymentOption('temporary')}
                                                            className="w-full flex items-center justify-between p-4"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center p-1.5">
                                                                    <img src="https://upload.wikimedia.org/wikipedia/commons/0/0b/Paystack_Logo.png" alt="Paystack" className="w-full h-full object-contain" />
                                                                </div>
                                                                <div className="text-left">
                                                                    <p className="text-white font-bold text-sm">Temporary License</p>
                                                                    <p className="text-gray-500 text-[10px] uppercase font-bold">Single Event Fee: {formatCurrency(FEES.TEMPORARY_LICENSE)}</p>
                                                                </div>
                                                            </div>
                                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentOption === 'temporary' ? 'border-padel-green' : 'border-white/30'}`}>
                                                                {paymentOption === 'temporary' && <div className="w-2.5 h-2.5 bg-padel-green rounded-full"></div>}
                                                            </div>
                                                        </button>

                                                        {paymentOption === 'temporary' && (
                                                            <div className="p-4 border-t border-white/10 w-full animate-in fade-in slide-in-from-top-2">
                                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 text-left">Select Event</label>
                                                                {eventsLoading ? (
                                                                    <div className="text-center py-4 bg-black/40 rounded-xl border border-white/5">
                                                                        <div className="w-5 h-5 border-2 border-padel-green border-t-transparent rounded-full animate-spin mx-auto"></div>
                                                                    </div>
                                                                ) : upcomingEvents?.length > 0 ? (
                                                                    <select
                                                                        value={selectedEventId}
                                                                        onChange={(e) => setSelectedEventId(e.target.value)}
                                                                        className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-white text-sm focus:border-padel-green outline-none"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <option value="">Select an upcoming event...</option>
                                                                        {upcomingEvents.map((event, i) => (
                                                                            <option key={event.id || i} value={event.id}>
                                                                                {event.event_name} ({new Date(event.start_date).toLocaleDateString()})
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                ) : (
                                                                    <p className="text-[10px] text-yellow-500 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20 text-left">No upcoming events found. You must wait for an event to be posted to buy a temporary license.</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPaymentOption('pay_later')}
                                                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${paymentOption === 'pay_later' ? 'bg-black/40 border-padel-green/50' : 'bg-black/30 border-white/10 hover:border-white/20'}`}
                                                    >
                                                        <div className="text-left">
                                                            <p className="text-white font-bold text-sm">Pay Later</p>
                                                            <p className="text-gray-500 text-[10px] uppercase font-bold">Create profile now • Pay for license later to appear on Players page</p>
                                                        </div>
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentOption === 'pay_later' ? 'border-padel-green' : 'border-white/30'}`}>
                                                            {paymentOption === 'pay_later' && <div className="w-2.5 h-2.5 bg-padel-green rounded-full"></div>}
                                                        </div>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex gap-3 pt-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setStep(2)}
                                                    className="w-1/3 bg-white/5 text-white font-bold py-4 rounded-xl hover:bg-white/10 transition-all border border-white/10"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={loading || (paymentOption === 'pay_now' && !isPaystackConfigured())}
                                                    className="flex-1 bg-padel-green text-black font-black uppercase tracking-widest py-4 rounded-xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-padel-green/20 disabled:opacity-50"
                                                >
                                                    {loading ? 'Processing...' : paymentOption === 'pay_later' ? 'Register' : !isPaystackConfigured() ? 'Paystack Key Missing' : 'Pay & Register'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : activeTab === 'login' ? (
                                <div className="space-y-4">
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                        <input
                                            type="email"
                                            placeholder="Email Address"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                            required
                                        />
                                    </div>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="Password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-12 text-white focus:outline-none focus:border-padel-green transition-all"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('forgot_password')}
                                            className="text-[11px] text-gray-500 hover:text-padel-green font-bold uppercase tracking-widest transition-colors"
                                        >
                                            Forgot Password?
                                        </button>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full bg-padel-green text-black font-black uppercase tracking-widest py-4 rounded-xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-padel-green/20 disabled:opacity-50"
                                    >
                                        {loading ? 'Entering...' : 'Sign In'}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="text-center mb-6">
                                        <h3 className="text-white font-bold mb-2">Reset Password</h3>
                                        <p className="text-gray-400 text-xs">Enter your email address and we'll send you a link to reset your password.</p>
                                    </div>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                        <input
                                            type="email"
                                            placeholder="Email Address"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                            required
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full bg-padel-green text-black font-black uppercase tracking-widest py-4 rounded-xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-padel-green/20 disabled:opacity-50"
                                    >
                                        {loading ? 'Sending...' : 'Send Reset Link'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('login')}
                                        className="w-full text-center text-xs text-gray-500 hover:text-white font-bold py-2 transition-colors"
                                    >
                                        Back to Login
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>
                </motion.div>

                {/* Terms & Conditions Modal */}
                <AnimatePresence>
                    {showTermsModal && (
                        <>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/90 backdrop-blur-sm z-[101]"
                                onClick={() => setShowTermsModal(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="absolute z-[102] w-full max-w-lg max-h-[85vh] bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                            >
                                <div className="flex items-center justify-between p-4 border-b border-white/10 bg-white/5">
                                    <h3 className="text-lg font-bold text-white">Terms & Conditions</h3>
                                    <button
                                        onClick={() => setShowTermsModal(false)}
                                        className="text-gray-400 hover:text-white transition-colors p-1"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="overflow-y-auto p-6 space-y-6 text-sm text-gray-300">
                                    <section>
                                        <h4 className="text-padel-green font-bold mb-2 uppercase tracking-wider text-xs">General Terms & Conditions</h4>
                                        <p className="mb-2">By registering for 4M Padel, you agree to the following:</p>
                                        <ul className="list-disc list-inside space-y-1 text-gray-400">
                                            <li>You must provide accurate and complete information during registration.</li>
                                            <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                                            <li>Registration fees are non-refundable unless otherwise stated.</li>
                                            <li>You agree to participate in good faith and respect other players and organisers.</li>
                                            <li>You consent to your profile information being displayed on the platform for ranking and tournament purposes.</li>
                                            <li>We reserve the right to suspend or remove accounts that violate these terms.</li>
                                        </ul>
                                    </section>
                                    <section>
                                        <h4 className="text-padel-green font-bold mb-2 uppercase tracking-wider text-xs">POPI Act (Protection of Personal Information)</h4>
                                        <p className="mb-2">In compliance with the Protection of Personal Information Act (Act 4 of 2013), we:</p>
                                        <ul className="list-disc list-inside space-y-1 text-gray-400">
                                            <li>Process your personal information only for lawful purposes related to padel registration and tournament management.</li>
                                            <li>Collect only the information necessary for your player profile and participation.</li>
                                            <li>Implement appropriate security measures to protect your data.</li>
                                            <li>Will not share your personal information with third parties without your consent, except as required by law.</li>
                                            <li>Will notify you of any data breaches affecting your information.</li>
                                            <li>Allow you to access, correct, or request deletion of your personal information.</li>
                                        </ul>
                                        <p className="mt-2 text-gray-500 text-xs">By registering, you consent to the processing of your personal information as described above.</p>
                                    </section>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>
        </AnimatePresence>
    );
};

export default AuthModal;
