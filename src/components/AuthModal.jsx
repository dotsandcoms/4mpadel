import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, Phone, CheckCircle, AlertCircle, Eye, EyeOff, Info } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { usePaystackPayment } from 'react-paystack';
import { FEES, toPaystackAmount, formatCurrency } from '../constants/fees';

const AuthModal = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('login'); // 'login', 'register', 'forgot_password'
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const navigate = useNavigate();

    // Form states
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
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
    const [paymentOption, setPaymentOption] = useState('pay_now'); // 'pay_now' | 'pay_later'
    const [showPassword, setShowPassword] = useState(false);

    const resetForm = () => {
        setStep(1);
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setName('');
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
        setMessage(null);
    };

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        if (type === 'success') {
            setTimeout(() => {
                setMessage(null);
                onClose();
                navigate('/profile');
            }, 2000);
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
            redirectTo: window.location.origin + '/profile',
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

    const handleRegistrationSubmit = (e) => {
        e.preventDefault();
        setMessage(null);

        // Validation for Step 1
        if (step === 1) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                setMessage({ type: 'error', text: 'Please enter a valid email address.' });
                return;
            }
            if (password.length < 6) {
                setMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
                return;
            }
            if (password !== confirmPassword) {
                setMessage({ type: 'error', text: 'Passwords do not match.' });
                return;
            }
            if (!name || !contactNumber || !gender || !nationality || !idNumber) {
                setMessage({ type: 'error', text: 'Please fill in all required fields for Step 1.' });
                return;
            }
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
            setLoading(true);

            if (paymentOption === 'pay_later') {
                handlePayLaterRegistration();
                return;
            }

            console.log(`Initializing Paystack for ${formatCurrency(FEES.FULL_LICENSE)} Registration...`);
            handlePaystackPayment({ onSuccess, onClose: onClosePayment });
        }
    };

    const handlePayLaterRegistration = async () => {
        const hasSupabase = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
        if (!hasSupabase) {
            showMessage('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.', 'error');
            setLoading(false);
            return;
        }
        const { error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) {
            showMessage(authError.message, 'error');
            setLoading(false);
            return;
        }

        const baseParams = {
            p_email: email,
            p_name: name,
            p_contact: contactNumber,
            p_category: category || 'Unranked',
            p_gender: gender,
            p_nationality: nationality,
            p_id_number: idNumber,
            p_bio: bio,
            p_home_club: homeClub,
            p_sponsors: sponsors,
        };

        let insertError = (await supabase.rpc('create_player_profile_pay_later', {
            ...baseParams,
            p_instagram_link: instagramLink || null,
        })).error;

        if (insertError) {
            const fallback = await supabase.rpc('create_player_profile_pay_later', baseParams);
            insertError = fallback.error;
        }

        if (insertError) {
            showMessage('Account created, but failed to setup profile: ' + (insertError.message || insertError.code || 'Unknown error'), 'error');
            setLoading(false);
            return;
        }

        showMessage('Registration successful! Your profile is created. Pay for a license to make it visible on the Players page.', 'success');
        setLoading(false);
    };

    const paystackConfig = {
        reference: (new Date()).getTime().toString(),
        email: email,
        amount: toPaystackAmount(FEES.FULL_LICENSE),
        publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
        currency: 'ZAR',
    };

    const handlePaystackPayment = usePaystackPayment(paystackConfig);

    const onSuccess = async (reference) => {
        console.log('Payment successful. Reference:', reference);

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) {
            showMessage('Payment successful but auth failed: ' + authError.message, 'error');
            setLoading(false);
            return;
        }

        const { data: rpcData, error: insertError } = await supabase.rpc('create_player_profile', {
            p_email: email,
            p_name: name,
            p_contact: contactNumber,
            p_category: category || 'Unranked',
            p_gender: gender,
            p_nationality: nationality,
            p_id_number: idNumber,
            p_bio: bio,
            p_home_club: homeClub,
            p_sponsors: sponsors,
            p_instagram_link: instagramLink || null,
            p_paid_registration: true,
        });

        if (insertError) {
            showMessage('Account created, but failed to setup profile: ' + insertError.message, 'error');
            setLoading(false);
            return;
        }

        showMessage('Payment and Registration successful! Please check your email for confirmation.', 'success');
        setLoading(false);
    };

    const onClosePayment = () => {
        showMessage('Registration cancelled.', 'error');
        setLoading(false);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4">
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
                                            <div className="relative">
                                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                <input
                                                    type="text"
                                                    placeholder="Full Name"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                                    required
                                                />
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
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="relative">
                                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                    <input
                                                        type={showPassword ? 'text' : 'password'}
                                                        placeholder="Password"
                                                        value={password}
                                                        onChange={(e) => setPassword(e.target.value)}
                                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white text-sm focus:outline-none focus:border-padel-green transition-all"
                                                        required
                                                    />
                                                </div>
                                                <div className="relative">
                                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                                    <input
                                                        type={showPassword ? 'text' : 'password'}
                                                        placeholder="Confirm"
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white text-sm focus:outline-none focus:border-padel-green transition-all"
                                                        required
                                                    />
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
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    placeholder="ID / Passport Number"
                                                    value={idNumber}
                                                    onChange={(e) => setIdNumber(e.target.value)}
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                                    required
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                className="w-full bg-padel-green text-black font-black uppercase tracking-widest py-4 rounded-xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-padel-green/20"
                                            >
                                                Next Step
                                            </button>
                                        </div>
                                    ) : step === 2 ? (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-padel-green text-[10px] font-black uppercase tracking-widest">Step 2: Padel Profile</span>
                                                <span className="text-gray-500 text-[10px] font-bold">2 / 3</span>
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
                                                                <p className="text-gray-500 text-[10px] uppercase font-bold">Registration Fee: {formatCurrency(FEES.FULL_LICENSE)} • Profile visible immediately</p>
                                                            </div>
                                                        </div>
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentOption === 'pay_now' ? 'border-padel-green' : 'border-white/30'}`}>
                                                            {paymentOption === 'pay_now' && <div className="w-2.5 h-2.5 bg-padel-green rounded-full"></div>}
                                                        </div>
                                                    </button>
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
                                                    disabled={loading || (paymentOption === 'pay_now' && !import.meta.env.VITE_PAYSTACK_PUBLIC_KEY)}
                                                    className="flex-1 bg-padel-green text-black font-black uppercase tracking-widest py-4 rounded-xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-padel-green/20 disabled:opacity-50"
                                                >
                                                    {loading ? 'Processing...' : paymentOption === 'pay_later' ? 'Register' : !import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ? 'Paystack Key Missing' : 'Pay & Register'}
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
