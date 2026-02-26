import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, Phone, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { usePaystackPayment } from 'react-paystack';

const AuthModal = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('login'); // 'login' or 'register'
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

        // Validation for Step 2
        if (step === 2) {
            if (!category || !homeClub || !bio) {
                setMessage({ type: 'error', text: 'Please fill in all required fields for Step 2.' });
                return;
            }

            setLoading(true);
            console.log('Initializing Paystack for R100 Registration...');
            handlePaystackPayment({ onSuccess, onClose: onClosePayment });
        }
    };

    const paystackConfig = {
        reference: (new Date()).getTime().toString(),
        email: email,
        amount: 10000,
        publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
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
            p_sponsors: sponsors
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
                    className="relative w-full max-w-md bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                >
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
                    >
                        <X size={20} />
                    </button>

                    <div className="pt-8 pb-6 px-8 text-center border-b border-white/5 bg-white/5">
                        <h2 className="text-2xl font-bold text-white mb-2">
                            {activeTab === 'login' ? 'Welcome Back' : 'Create Profile'}
                        </h2>
                        <p className="text-gray-400 text-sm">
                            {activeTab === 'login'
                                ? 'Enter your credentials to access your profile'
                                : 'Register to manage your player profile and stats'}
                        </p>
                    </div>

                    <div className="flex border-b border-white/10">
                        <button
                            onClick={() => { setActiveTab('login'); resetForm(); }}
                            className={`flex-1 py-4 text-sm font-bold transition-colors ${activeTab === 'login' ? 'text-padel-green border-b-2 border-padel-green' : 'text-gray-400 hover:text-white'}`}
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

                    <div className="p-8">
                        {message && (
                            <div className={`flex items-center gap-3 p-4 rounded-xl mb-6 text-sm font-medium ${message.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-padel-green/10 text-padel-green border border-padel-green/20'}`}>
                                {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
                                {message.text}
                            </div>
                        )}

                        <form onSubmit={activeTab === 'login' ? handleLogin : handleRegistrationSubmit} className="space-y-4">
                            {activeTab === 'register' ? (
                                <>
                                    {step === 1 ? (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-padel-green text-[10px] font-black uppercase tracking-widest">Step 1: Personal</span>
                                                <span className="text-gray-500 text-[10px] font-bold">1 / 2</span>
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
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-padel-green text-[10px] font-black uppercase tracking-widest">Step 2: Padel Profile</span>
                                                <span className="text-gray-500 text-[10px] font-bold">2 / 2</span>
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
                                                type="text"
                                                placeholder="Sponsors (Optional)"
                                                value={sponsors}
                                                onChange={(e) => setSponsors(e.target.value)}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                            />
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
                                                    disabled={loading}
                                                    className="flex-1 bg-padel-green text-black font-black uppercase tracking-widest py-4 rounded-xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-padel-green/20 disabled:opacity-50"
                                                >
                                                    {loading ? 'Processing...' : 'Pay & Register'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
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
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full bg-padel-green text-black font-black uppercase tracking-widest py-4 rounded-xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-padel-green/20 disabled:opacity-50"
                                    >
                                        {loading ? 'Entering...' : 'Sign In'}
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default AuthModal;
