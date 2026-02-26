import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Instagram, Youtube, Facebook, Globe, Loader, CheckCircle, AlertCircle, X } from 'lucide-react';

const SettingsManager = () => {
    const [loading, setLoading] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [settings, setSettings] = useState({
        instagram: 'https://instagram.com/4mpadel',
        youtube: 'https://youtube.com/channel/UC12345678',
        facebook: 'https://facebook.com/4mpadel',
        website: 'https://4mpadel.co.za'
    });

    const showToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 3000);
    };

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const handleChange = (e) => {
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleSave = () => {
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setLoading(false);
            showToast('Settings saved successfully!');
        }, 1500);
    };

    return (
        <div className="space-y-8 relative">
            {/* Toast Container */}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border pointer-events-auto ${toast.type === 'error'
                                    ? 'bg-red-900/90 border-red-500/50 text-white'
                                    : 'bg-gray-900/90 border-padel-green/50 text-white'
                                }`}
                        >
                            {toast.type === 'error' ? <AlertCircle size={20} className="text-red-400" /> : <CheckCircle size={20} className="text-padel-green" />}
                            <span className="font-medium text-sm">{toast.message}</span>
                            <button onClick={() => removeToast(toast.id)} className="ml-2 hover:opacity-70"><X size={16} /></button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div>
                <h2 className="text-3xl font-bold text-white">System Settings</h2>
                <p className="text-gray-400">Global configurations and integrations</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Social Media Integration */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#1E293B]/50 backdrop-blur-md p-8 rounded-3xl border border-white/10"
                >
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Globe size={20} className="text-padel-green" /> Social Media Links
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Instagram size={16} /> Instagram URL
                            </label>
                            <input
                                type="text"
                                name="instagram"
                                value={settings.instagram}
                                onChange={handleChange}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                            />
                            <p className="text-xs text-gray-500 mt-1">Used for pulling latest feed updates.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Youtube size={16} /> YouTube Channel / Stream URL
                            </label>
                            <input
                                type="text"
                                name="youtube"
                                value={settings.youtube}
                                onChange={handleChange}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                            />
                            <p className="text-xs text-gray-500 mt-1">Enter your live stream URL to embed it on the dashboard.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Facebook size={16} /> Facebook Page
                            </label>
                            <input
                                type="text"
                                name="facebook"
                                value={settings.facebook}
                                onChange={handleChange}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                            />
                        </div>
                    </div>
                </motion.div>

                {/* General Settings (Placeholder) */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-[#1E293B]/50 backdrop-blur-md p-8 rounded-3xl border border-white/10"
                >
                    <h3 className="text-xl font-bold text-white mb-6">Site Configuration</h3>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Site Name</label>
                            <input
                                type="text"
                                value="4M Padel"
                                disabled
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-gray-400 cursor-not-allowed"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Admin Email</label>
                            <input
                                type="text"
                                value="admin@4mpadel.co.za"
                                disabled
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-gray-400 cursor-not-allowed"
                            />
                        </div>
                    </div>
                </motion.div>
            </div>

            <div className="flex justify-end pt-6 border-t border-white/10">
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="bg-padel-green text-black px-8 py-3 rounded-xl font-bold hover:bg-white transition-all flex items-center gap-2"
                >
                    {loading ? <Loader className="animate-spin" size={20} /> : <Save size={20} />}
                    Save Changes
                </button>
            </div>
        </div>
    );
};

export default SettingsManager;
