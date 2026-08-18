import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, Phone, CheckCircle, AlertCircle, Eye, EyeOff, Info, Camera, Upload, ChevronRight, Building, GraduationCap, Landmark, ChevronLeft } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useNavigate, useLocation } from 'react-router-dom';
import { useClubs } from '../hooks/useClubs';
import SearchableSelect from './SearchableSelect';
import { Trophy } from 'lucide-react';
import { collectWebSignupDevice } from '../utils/signupDevice';
import RegisterOrganisationForm from './RegisterOrganisationForm';
import RegisterCoachForm from './RegisterCoachForm';
import ClubCreateWizard from './clubs/ClubCreateWizard';

const REGISTRATION_OPTIONS = [
    {
        id: 'profile',
        label: 'Profile',
        description: 'Create your player profile and enter tournaments.',
        icon: User,
    },
    {
        id: 'organisation',
        label: 'Organisation',
        description: 'Apply to host approved tournaments on 4M Padel.',
        icon: Building,
    },
    {
        id: 'coach',
        label: 'Coach',
        description: 'Apply to join the approved coach network.',
        icon: GraduationCap,
    },
    {
        id: 'club',
        label: 'Club',
        description: 'Register your padel club on the platform.',
        icon: Landmark,
    },
];

const REGISTER_HEADINGS = {
    null: {
        title: 'Create Account',
        subtitle: 'What are you registering for?',
    },
    profile: {
        title: 'Create Player Profile',
        subtitle: 'Register to manage your player profile and stats',
    },
    organisation: {
        title: 'Organisation Registration',
        subtitle: 'Apply to host sanctioned tournaments on 4M Padel',
    },
    coach: {
        title: 'Coach Registration',
        subtitle: 'Apply to join the approved 4M Padel coach network',
    },
    club: {
        title: 'Club Registration',
        subtitle: 'Register or claim your padel club on 4M Padel',
    },
};

const AuthModal = ({ isOpen, onClose, initialTab = 'login', initialRegisterType = null, initialClubClaim = null }) => {
    const [activeTab, setActiveTab] = useState(initialTab); // 'login', 'register', 'forgot_password'
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
    const [clubId, setClubId] = useState('');
    const [customClub, setCustomClub] = useState('');
    const [sponsors, setSponsors] = useState('');
    const [instagramLink, setInstagramLink] = useState('');
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [profilePic, setProfilePic] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [region, setRegion] = useState('');
    const [racketBrand, setRacketBrand] = useState('');
    const [customRacketBrand, setCustomRacketBrand] = useState('');
    const [registerType, setRegisterType] = useState(null);
    const { clubs } = useClubs();

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
            setRegisterType(initialRegisterType || null);
        }
    }, [isOpen, initialTab, initialRegisterType]);

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
        setClubId('');
        setCustomClub('');
        setSponsors('');
        setInstagramLink('');
        setAcceptTerms(false);
        setRegion('');
        setRacketBrand('');
        setCustomRacketBrand('');
        setMessage(null);
        setRegisterType(null);
    };

    const handleSelectRegisterType = (type) => {
        // Organisation, coach, and club applications do not require a player profile.
        setRegisterType(type);
        setStep(1);
    };

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        if (type === 'success') {
            setTimeout(() => {
                setMessage(null);
                onClose();

                // Determine redirect path based on where the user logged in from
                const isAdminContext = location.pathname.startsWith('/admin') || location.pathname.startsWith('/reports');
                if (isAdminContext) {
                    navigate('/admin');
                } else if (location.pathname === '/' || location.pathname === '/login') {
                    navigate('/');
                } else {
                    // Stay on the current page
                    navigate(location.pathname + location.search, { replace: true });
                }
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

        if (step !== 2) return;

        if (!category || !clubId || (clubId === 'Other' && !customClub) || !bio) {
            setMessage({ type: 'error', text: 'Please fill in all required fields for Step 2.' });
            return;
        }
        if (!acceptTerms) {
            setMessage({ type: 'error', text: 'You must accept the Terms & Conditions to register.' });
            return;
        }

        setLoading(true);

        const hasSupabase = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
        if (!hasSupabase) {
            showMessage('Supabase is not configured. Add VITE_SUPABASE_URL to your .env file.', 'error');
            setLoading(false);
            return;
        }

        const { error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { signup_source: 'web', signup_device: collectWebSignupDevice() } },
        });

        if (authError) {
            showMessage('Registration failed: ' + authError.message, 'error');
            setLoading(false);
            return;
        }

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
            } finally {
                setIsUploading(false);
            }
        }

        const { error: insertError } = await supabase.rpc('create_player_profile', {
            p_email: email,
            p_name: `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim(),
            p_contact: contactNumber,
            p_category: category || 'Unranked',
            p_gender: gender,
            p_nationality: nationality,
            p_id_number: idNumber,
            p_bio: bio,
            p_home_club: clubId === 'Other' ? customClub : (clubId ? clubs.find(c => c.id === clubId)?.name : ''),
            p_sponsors: sponsors,
            p_region: region,
            p_paid_registration: false,
            p_license_type: 'none',
            p_image_url: uploadedImageUrl,
            p_racket_brand: racketBrand === 'Other' ? customRacketBrand : racketBrand,
            p_club_id: clubId === 'Other' ? null : (clubId || null)
        });

        if (insertError) {
            showMessage('Account created, but failed to setup profile: ' + insertError.message, 'error');
            setLoading(false);
            return;
        }

        await supabase.rpc('set_player_signup_source', {
            p_source: 'web',
            p_device: collectWebSignupDevice(),
        });

        showMessage('Registration successful! Your profile is created. When you enter an event, you can add a temporary license if sales are open.', 'success');
        setLoading(false);
    };



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
                    className={`relative w-full max-h-[90vh] flex flex-col bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden ${
                        activeTab === 'register' && (registerType === 'organisation' || registerType === 'coach')
                            ? 'max-w-lg'
                            : 'max-w-md'
                    }`}
                >
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
                    >
                        <X size={20} />
                    </button>

                    <div className="pt-8 pb-6 px-8 text-center border-b border-white/5 bg-white/5">
                        <h2 className="text-2xl font-bold text-white mb-2">
                            {activeTab === 'login'
                                ? 'Welcome Back'
                                : activeTab === 'register'
                                    ? (REGISTER_HEADINGS[registerType ?? 'null']?.title || 'Create Account')
                                    : 'Reset Password'}
                        </h2>
                        <p className="text-gray-400 text-sm">
                            {activeTab === 'login'
                                ? 'Enter your credentials to access your profile'
                                : activeTab === 'register'
                                    ? (REGISTER_HEADINGS[registerType ?? 'null']?.subtitle || 'What are you registering for?')
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

                        {activeTab === 'register' && registerType === null ? (
                            <div className="space-y-3">
                                {REGISTRATION_OPTIONS.map((option) => {
                                    const Icon = option.icon;
                                    const isDisabled = option.comingSoon;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            disabled={isDisabled}
                                            onClick={() => handleSelectRegisterType(option.id)}
                                            className={`w-full text-left rounded-xl border p-4 transition-all flex items-center gap-4 ${
                                                isDisabled
                                                    ? 'border-white/5 bg-white/[0.02] opacity-50 cursor-not-allowed'
                                                    : 'border-white/10 bg-black/30 hover:border-padel-green/40 hover:bg-black/50 cursor-pointer'
                                            }`}
                                        >
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isDisabled ? 'bg-white/5' : 'bg-padel-green/10'}`}>
                                                <Icon size={18} className={isDisabled ? 'text-gray-500' : 'text-padel-green'} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-white text-sm">{option.label}</span>
                                                    {option.comingSoon && (
                                                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                                            Coming soon
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
                                            </div>
                                            {!isDisabled && <ChevronRight size={16} className="text-gray-600 shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : activeTab === 'register' && registerType === 'organisation' ? (
                            <RegisterOrganisationForm
                                onBack={() => setRegisterType(null)}
                                onClose={onClose}
                                contactEmail={email}
                            />
                        ) : activeTab === 'register' && registerType === 'club' ? (
                            <ClubCreateWizard
                                mode="public"
                                embedded
                                onCancel={() => setRegisterType(null)}
                                onComplete={onClose}
                                contactEmail={email}
                                initialClubClaim={initialClubClaim}
                            />
                        ) : activeTab === 'register' && registerType === 'coach' ? (
                            <RegisterCoachForm
                                onBack={() => setRegisterType(null)}
                                onClose={onClose}
                            />
                        ) : (
                        <form onSubmit={activeTab === 'login' ? handleLogin : activeTab === 'register' ? handleRegistrationSubmit : handleForgotPassword} className="space-y-4">
                            {activeTab === 'register' && registerType === 'profile' ? (
                                <>
                                    {step === 1 ? (
                                        <div className="space-y-4">
                                            <button
                                                type="button"
                                                onClick={() => setRegisterType(null)}
                                                className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                                            >
                                                <ChevronLeft size={14} /> Back to registration options
                                            </button>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-padel-green text-[10px] font-black uppercase tracking-widest">Step 1: Personal</span>
                                                <span className="text-gray-500 text-[10px] font-bold">1 / 2</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="relative">
                                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                    <input
                                                        type="text"
                                                        placeholder="First Name"
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
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between mb-4">
                                                <span className="text-padel-green text-[10px] font-black uppercase tracking-widest">Step 2: Padel Profile</span>
                                                <span className="text-gray-500 text-[10px] font-bold">2 / 2</span>
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
                                                <optgroup label="Men's" className="bg-[#0a0a0a]">
                                                    <option value="Men's Open (Pro/Elite)">Men's Open (Pro/Elite)</option>
                                                    <option value="Men's Advanced">Men's Advanced</option>
                                                    <option value="Men's Intermediate">Men's Intermediate</option>
                                                </optgroup>
                                                <optgroup label="Ladies" className="bg-[#0a0a0a]">
                                                    <option value="Ladies Open (Pro/Elite)">Ladies Open (Pro/Elite)</option>
                                                    <option value="Ladies Advanced">Ladies Advanced</option>
                                                    <option value="Ladies Intermediate">Ladies Intermediate</option>
                                                </optgroup>
                                            </select>
                                            <SearchableSelect
                                                options={[...clubs.map(club => ({ label: club.name, value: club.id })), { label: "Other (Type your own)", value: "Other" }]}
                                                value={clubId}
                                                onChange={(e) => setClubId(e.target.value)}
                                                placeholder="Select Home Club"
                                                icon={Trophy}
                                            />
                                            {clubId === 'Other' && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                >
                                                    <input
                                                        type="text"
                                                        placeholder="Please specify your club name"
                                                        value={customClub}
                                                        onChange={(e) => setCustomClub(e.target.value)}
                                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                                        required
                                                    />
                                                </motion.div>
                                            )}
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
                                                    disabled={loading || isUploading}
                                                    className="flex-1 bg-padel-green text-black font-black uppercase tracking-widest py-4 rounded-xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-padel-green/20 disabled:opacity-50"
                                                >
                                                    {loading ? 'Registering...' : 'Register'}
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-gray-500 text-center leading-relaxed">
                                                A temporary license can be added when you enter an event, if sales are open.
                                            </p>
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
                        )}
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
                                className="absolute z-[102] w-full max-w-lg max-h-[85vh] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
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
                                            <li>Entry fees are automatically refunded if you withdraw before registration closes. After registration closes, refunds are at the organiser's discretion. Paystack processing fees are non-refundable. Annual SAPA licenses are non-refundable.</li>
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
