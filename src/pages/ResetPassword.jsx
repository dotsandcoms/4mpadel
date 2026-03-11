import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { Lock, CheckCircle, AlertCircle, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import Navbar from '../components/Navbar';
import heroBg from '../assets/hero_bg.png';

const ResetPassword = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [message, setMessage] = useState(null);
    const navigate = useNavigate();

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        if (type === 'success') {
            setTimeout(() => {
                navigate('/profile');
            }, 3000);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (password.length < 6) {
            showMessage('Password must be at least 6 characters long.', 'error');
            return;
        }
        if (password !== confirmPassword) {
            showMessage('Passwords do not match.', 'error');
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.updateUser({
            password: password
        });

        if (error) {
            showMessage(error.message, 'error');
        } else {
            showMessage('Your password has been reset successfully! Redirecting...', 'success');
        }
        setLoading(false);
    };

    return (
        <div className="bg-[#0F172A] min-h-screen text-white font-sans selection:bg-padel-green selection:text-black">
            <Navbar />

            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-padel-green/10 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[150px] rounded-full" />
                <img src={heroBg} className="absolute inset-0 w-full h-full object-cover opacity-[0.05] pointer-events-none" alt="" />
            </div>

            <main className="relative z-10 flex items-center justify-center pt-32 pb-20 px-6 min-h-screen">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
                >
                    <div className="p-8 text-center border-b border-white/5 bg-white/5">
                        <div className="w-16 h-16 bg-padel-green/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <Lock className="text-padel-green w-8 h-8" />
                        </div>
                        <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">Set New Password</h1>
                        <p className="text-gray-400 text-sm font-medium">Create a new secure password for your account</p>
                    </div>

                    <div className="p-8">
                        <AnimatePresence>
                            {message && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className={`flex items-center gap-3 p-4 rounded-2xl mb-6 text-sm font-bold uppercase tracking-wide ${message.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-padel-green/10 text-padel-green border border-padel-green/20'}`}
                                >
                                    {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
                                    {message.text}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <form onSubmit={handleResetPassword} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">New Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Minimum 6 characters"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white focus:outline-none focus:border-padel-green transition-all"
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
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-padel-green ml-4">Confirm Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Repeat new password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full bg-black/50 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-padel-green transition-all"
                                        required
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-padel-green text-black font-black uppercase tracking-widest py-5 rounded-2xl hover:bg-white hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-padel-green/20 disabled:opacity-50"
                            >
                                {loading ? 'Updating Password...' : 'Reset Password'}
                            </button>

                            <button
                                type="button"
                                onClick={() => navigate('/')}
                                className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-gray-500 hover:text-white uppercase tracking-widest transition-colors"
                            >
                                <ArrowLeft size={14} /> Back to Home
                            </button>
                        </form>
                    </div>
                </motion.div>
            </main>
        </div>
    );
};

export default ResetPassword;
