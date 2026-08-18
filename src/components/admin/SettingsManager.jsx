import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Instagram, Youtube, Facebook, Globe, Loader, CheckCircle, AlertCircle, X, CreditCard, Percent } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useCommerceConfig } from '../../hooks/useCommerceConfig';
import {
    COMMERCE_DEFAULTS,
    formatPercent,
    licenseQuote,
    eventEntryQuote,
    normalizeCommerce,
} from '../../utils/commerce';
import { formatCurrency } from '../../constants/fees';

const SwitchRow = ({ checked, onChange, label, description, disabled = false }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="w-full flex items-center justify-between gap-4 bg-black/20 p-4 rounded-xl border border-white/5 text-left min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green disabled:opacity-50"
    >
        <span>
            <span className="block text-white font-bold">{label}</span>
            {description && <span className="block text-gray-500 text-xs mt-1">{description}</span>}
        </span>
        <span
            aria-hidden="true"
            className={`relative w-12 h-7 rounded-full p-1 shrink-0 transition-colors ${checked ? 'bg-padel-green' : 'bg-gray-600'}`}
        >
            <span className={`block w-5 h-5 bg-black rounded-full transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </span>
    </button>
);

const MoneyField = ({ id, label, value, onChange, hint }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-400 mb-2">{label}</label>
        <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold" aria-hidden="true">R</span>
            <input
                id={id}
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white tabular-nums focus:border-padel-green focus:outline-none"
            />
        </div>
        {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
);

const PercentField = ({ id, label, value, onChange, hint }) => (
    <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-400 mb-2">{label}</label>
        <div className="relative">
            <input
                id={id}
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.1"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white tabular-nums focus:border-padel-green focus:outline-none"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold" aria-hidden="true">%</span>
        </div>
        {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
);

const quotePreviewLine = (quote, name) => {
    if (!quote.enabled) return `${name} is off — players cannot buy this type.`;
    if (quote.fee > 0) {
        return `${name}: ${formatCurrency(quote.total)} (${formatCurrency(quote.base)} + ${formatPercent(quote.percent)}% ${quote.feeLabel.toLowerCase()})`;
    }
    return `${name}: ${formatCurrency(quote.total)}`;
};

const SettingsManager = () => {
    const [loading, setLoading] = useState(false);
    const [commerceSaving, setCommerceSaving] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [settings, setSettings] = useState({
        instagram: 'https://instagram.com/4mpadel',
        youtube: 'https://youtube.com/channel/UC12345678',
        facebook: 'https://facebook.com/4mpadel',
        whatsapp: 'https://chat.whatsapp.com/',
        website: 'https://4mpadel.co.za'
    });

    const { config: liveCommerce, loading: commerceLoading, refresh: refreshCommerce } = useCommerceConfig();
    const [commerceDraft, setCommerceDraft] = useState(COMMERCE_DEFAULTS);

    useEffect(() => {
        fetchSettings();
    }, []);

    useEffect(() => {
        if (!commerceLoading) {
            setCommerceDraft(liveCommerce);
        }
    }, [commerceLoading, liveCommerce]);

    const fetchSettings = async () => {
        try {
            const { data, error } = await supabase.from('settings').select('*');
            if (error) throw error;
            if (data && data.length > 0) {
                const settingsObj = {};
                data.forEach(item => {
                    settingsObj[item.key] = item.value;
                });
                setSettings(prev => ({ ...prev, ...settingsObj }));
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
        }
    };

    const showToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 3000);
    };

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t !== id && t.id !== id));
    };

    const handleChange = (e) => {
        setSettings({ ...settings, [e.target.name]: e.target.value });
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const updates = Object.entries(settings).map(([key, value]) => ({
                key,
                value,
                updated_at: new Date().toISOString()
            }));

            const { error } = await supabase.from('settings').upsert(updates);
            if (error) throw error;

            showToast('Settings saved successfully!');
        } catch (error) {
            console.error('Error saving settings:', error);
            showToast('Unable to save settings. Try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const preview = useMemo(() => {
        const draft = normalizeCommerce(commerceDraft);
        return {
            full: licenseQuote('full', draft),
            temp: licenseQuote('temporary', draft),
            entry: eventEntryQuote(600, draft),
        };
    }, [commerceDraft]);

    const patchCommerce = (patch) => {
        setCommerceDraft((prev) => ({ ...prev, ...patch }));
    };

    const handleSaveCommerce = async () => {
        const draft = normalizeCommerce(commerceDraft);
        if (!draft.fee_label.trim()) {
            showToast('Enter a fee name, or leave Management fee.', 'error');
            return;
        }
        setCommerceSaving(true);
        try {
            const { data: auth } = await supabase.auth.getUser();
            const { error } = await supabase.from('commerce_config').upsert({
                id: 'default',
                full_license_enabled: draft.full_license_enabled,
                full_license_price: draft.full_license_price,
                temp_license_enabled: draft.temp_license_enabled,
                temp_license_price: draft.temp_license_price,
                license_fee_percent: draft.license_fee_percent,
                event_fee_percent: draft.event_fee_percent,
                fee_label: draft.fee_label,
                updated_by: auth?.user?.id || null,
            });
            if (error) throw error;
            await refreshCommerce();
            showToast('License settings saved. Checkout will use these prices immediately.');
        } catch (error) {
            console.error('Error saving commerce config:', error);
            showToast('Unable to save license settings. Try again.', 'error');
        } finally {
            setCommerceSaving(false);
        }
    };

    return (
        <div className="space-y-8 relative">
            <div className="fixed bottom-6 right-6 z-[1100] flex flex-col gap-2 pointer-events-none">
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
                            role={toast.type === 'error' ? 'alert' : 'status'}
                        >
                            {toast.type === 'error' ? <AlertCircle size={20} className="text-red-400" /> : <CheckCircle size={20} className="text-padel-green" />}
                            <span className="font-medium text-sm">{toast.message}</span>
                            <button type="button" onClick={() => removeToast(toast.id)} className="ml-2 hover:opacity-70" aria-label="Dismiss"><X size={16} /></button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div>
                <h2 className="text-3xl font-bold text-white">System Settings</h2>
                <p className="text-gray-400">Global configurations and integrations</p>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#1a1a1a]/50 backdrop-blur-md p-8 rounded-3xl border border-white/10"
            >
                <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                    <CreditCard size={20} className="text-padel-green" /> Licenses and fees
                </h3>
                <p className="text-gray-400 text-sm mb-6">
                    Turn license types on or off and set the prices charged at event checkout.
                    Players only see the types you have turned on.
                </p>

                {commerceLoading ? (
                    <div className="flex items-center gap-3 text-gray-400 py-8">
                        <Loader className="animate-spin" size={20} />
                        Loading license settings…
                    </div>
                ) : (
                    <div className="space-y-8">
                        {!preview.full.enabled && !preview.temp.enabled && (
                            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
                                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                                <p className="text-sm">
                                    Both license types are off. Players with an existing license can still enter events.
                                    Anyone who needs a new license cannot complete checkout until you turn a type back on.
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Full license</p>
                                <SwitchRow
                                    checked={!!commerceDraft.full_license_enabled}
                                    onChange={(next) => patchCommerce({ full_license_enabled: next })}
                                    label="Sell full licenses"
                                    description="Annual SAPA license. Shown at event checkout and on the player profile when this option is on."
                                />
                                <MoneyField
                                    id="full-license-price"
                                    label="Full license price"
                                    value={commerceDraft.full_license_price}
                                    onChange={(value) => patchCommerce({ full_license_price: value })}
                                    hint="Published amount before any percentage fee."
                                />
                            </div>
                            <div className="space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Temporary license</p>
                                <SwitchRow
                                    checked={!!commerceDraft.temp_license_enabled}
                                    onChange={(next) => patchCommerce({ temp_license_enabled: next })}
                                    label="Sell temporary licenses"
                                    description="Single-event license. Shown at event checkout when this option is on."
                                />
                                <MoneyField
                                    id="temp-license-price"
                                    label="Temporary license price"
                                    value={commerceDraft.temp_license_price}
                                    onChange={(value) => patchCommerce({ temp_license_price: value })}
                                    hint="Published amount before any percentage fee."
                                />
                            </div>
                        </div>

                        <div className="border-t border-white/10 pt-8 space-y-6">
                            <h4 className="text-white font-bold flex items-center gap-2">
                                <Percent size={18} className="text-padel-green" /> Percentage fee
                            </h4>
                            <p className="text-gray-400 text-sm">
                                Added on top of the published price at checkout. Set either rate to 0 to charge the published amount only.
                                You can rename the fee (for example Management fee, Platform fee, or Commission).
                            </p>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <div>
                                    <label htmlFor="fee-label" className="block text-sm font-medium text-gray-400 mb-2">Fee name</label>
                                    <input
                                        id="fee-label"
                                        type="text"
                                        maxLength={40}
                                        value={commerceDraft.fee_label}
                                        onChange={(e) => patchCommerce({ fee_label: e.target.value })}
                                        placeholder="Management fee"
                                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Shown on checkout breakdowns.</p>
                                </div>
                                <PercentField
                                    id="license-fee-percent"
                                    label="License fee"
                                    value={commerceDraft.license_fee_percent}
                                    onChange={(value) => patchCommerce({ license_fee_percent: value })}
                                    hint="Added to full and temporary licenses."
                                />
                                <PercentField
                                    id="event-fee-percent"
                                    label="Event booking fee"
                                    value={commerceDraft.event_fee_percent}
                                    onChange={(value) => patchCommerce({ event_fee_percent: value })}
                                    hint="Added to event entry fees."
                                />
                            </div>
                        </div>

                        <div className="rounded-2xl border border-padel-green/20 bg-padel-green/5 p-5 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Checkout preview</p>
                            <p className="text-sm text-white">{quotePreviewLine(preview.full, 'Full license')}</p>
                            <p className="text-sm text-white">{quotePreviewLine(preview.temp, 'Temporary license')}</p>
                            <p className="text-sm text-gray-300">
                                {preview.entry.fee > 0
                                    ? `Example event entry of R600.00: players pay ${formatCurrency(preview.entry.total)} (R600.00 + ${formatPercent(preview.entry.percent)}% ${preview.entry.feeLabel.toLowerCase()}).`
                                    : 'Example event entry of R600.00: players pay R600.00 (no booking fee).'}
                            </p>
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={handleSaveCommerce}
                                disabled={commerceSaving}
                                className="bg-padel-green text-black px-8 py-3 rounded-xl font-bold hover:bg-white transition-all flex items-center gap-2 active:scale-[0.96] disabled:opacity-50"
                            >
                                {commerceSaving ? <Loader className="animate-spin" size={20} /> : <Save size={20} />}
                                Save license settings
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#1a1a1a]/50 backdrop-blur-md p-8 rounded-3xl border border-white/10"
                >
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Globe size={20} className="text-padel-green" /> Social Media Links
                    </h3>
                    <div className="space-y-6">
                        <div>
                            <label htmlFor="instagram" className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Instagram size={16} /> Instagram URL
                            </label>
                            <input
                                id="instagram"
                                type="url"
                                name="instagram"
                                value={settings.instagram}
                                onChange={handleChange}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                            />
                            <p className="text-xs text-gray-500 mt-1">Used for pulling latest feed updates.</p>
                        </div>

                        <div>
                            <label htmlFor="youtube" className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Youtube size={16} /> YouTube Channel / Stream URL
                            </label>
                            <input
                                id="youtube"
                                type="url"
                                name="youtube"
                                value={settings.youtube}
                                onChange={handleChange}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                            />
                            <p className="text-xs text-gray-500 mt-1">Enter your live stream URL to embed it on the dashboard.</p>
                        </div>

                        <div>
                            <label htmlFor="facebook" className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Facebook size={16} /> Facebook Page
                            </label>
                            <input
                                id="facebook"
                                type="url"
                                name="facebook"
                                value={settings.facebook}
                                onChange={handleChange}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                            />
                        </div>
                        <div>
                            <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg> WhatsApp Community Link
                            </label>
                            <input
                                id="whatsapp"
                                type="url"
                                name="whatsapp"
                                value={settings.whatsapp}
                                onChange={handleChange}
                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none"
                            />
                            <p className="text-xs text-gray-500 mt-1">Used for the "Join our WhatsApp Community" call-to-action.</p>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-[#1a1a1a]/50 backdrop-blur-md p-8 rounded-3xl border border-white/10"
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
                    type="button"
                    onClick={handleSave}
                    disabled={loading}
                    className="bg-padel-green text-black px-8 py-3 rounded-xl font-bold hover:bg-white transition-all flex items-center gap-2 active:scale-[0.96]"
                >
                    {loading ? <Loader className="animate-spin" size={20} /> : <Save size={20} />}
                    Save Changes
                </button>
            </div>
        </div>
    );
};

export default SettingsManager;
