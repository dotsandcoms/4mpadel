import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { usePaystackPayment } from 'react-paystack';
import { supabase } from '../supabaseClient';
import { FEES, toPaystackAmount, formatCurrency } from '../constants/fees';
import { useRankedin } from '../hooks/useRankedin';

const PAYSTACK_PUBLIC_KEY = String(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '')
    .trim()
    .replace(/['"]/g, '')
    .split(/\s+/)[0]
    .replace(/[^a-zA-Z0-9_]/g, '');

console.log('Paystack Config Check (Modal):', {
    keyPrefix: PAYSTACK_PUBLIC_KEY ? PAYSTACK_PUBLIC_KEY.substring(0, 12) + '...' : 'MISSING',
    keyLength: PAYSTACK_PUBLIC_KEY.length,
    isLive: PAYSTACK_PUBLIC_KEY.startsWith('pk_live_')
});

const isPaystackConfigured = () => PAYSTACK_PUBLIC_KEY.startsWith('pk_');

const handlePaymentComplete = async (onDone, onSuccessCallback, setError, closeModal, licenseType = 'full') => {
    const { error: rpcError } = await supabase.rpc('mark_player_paid', { p_license_type: licenseType });
    if (rpcError) {
        setError('Payment received but failed to update profile. Please contact support.');
    } else {
        onSuccessCallback?.();
        closeModal();
    }
    onDone();
};

const LicensePaymentModal = ({ isOpen, onClose, userEmail, userName, onPaymentSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showTempOptions, setShowTempOptions] = useState(false);

    // Temporary License Addition
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const [selectedEventId, setSelectedEventId] = useState('');
    const [eventsLoading, setEventsLoading] = useState(false);

    React.useEffect(() => {
        if (isOpen && upcomingEvents.length === 0) {
            const fetchEvents = async () => {
                setEventsLoading(true);
                try {
                    const { data: events, error } = await supabase
                        .from('calendar')
                        .select('id, event_name, start_date, end_date')
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
    }, [isOpen, upcomingEvents.length]);


    const getConfig = (amountInRands) => {
        let nameParams = {};
        if (userName) {
            const parts = userName.trim().split(' ');
            nameParams.firstname = parts[0];
            if (parts.length > 1) {
                nameParams.lastname = parts.slice(1).join(' ');
            }
        }

        const isTemp = amountInRands < 450;
        const eventDetails = isTemp ? upcomingEvents.find(e => e.id?.toString() === selectedEventId.toString()) : null;

        return {
            reference: `${(new Date()).getTime()}-${amountInRands}`,
            email: userEmail || '',
            amount: toPaystackAmount(amountInRands),
            publicKey: PAYSTACK_PUBLIC_KEY,
            currency: 'ZAR',
            metadata: {
                license_type: isTemp ? 'temporary' : 'full',
                source: 'web_license_modal',
                ...(isTemp && eventDetails ? {
                    event_id: eventDetails.id,
                    event_name: eventDetails.event_name
                } : {})
            },
            ...nameParams
        };
    };

    const handleFullLicensePay = usePaystackPayment(getConfig(FEES.FULL_LICENSE));
    const handleTemporaryLicensePay = usePaystackPayment(getConfig(FEES.TEMPORARY_LICENSE));

    const runPayment = (paymentFn, licenseType) => {
        setError(null);
        setLoading(true);
        paymentFn({
            onSuccess: async () => {
                let successCallback = onPaymentSuccess;

                if (licenseType === 'temporary' && selectedEventId) {
                    const eventDetails = upcomingEvents.find(e => e.id?.toString() === selectedEventId.toString());
                    if (eventDetails) {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                            const { data: pData } = await supabase.from('players').select('id').ilike('email', userEmail).maybeSingle();
                            if (pData?.id) {
                                await supabase.from('temporary_licenses').insert({
                                    player_id: pData.id,
                                    event_id: eventDetails.id,
                                    event_name: eventDetails.event_name || 'Calendar Event',
                                    event_date: eventDetails.end_date || eventDetails.start_date
                                });
                            }
                        }
                    }
                }

                await handlePaymentComplete(
                    () => setLoading(false),
                    successCallback,
                    setError,
                    onClose,
                    licenseType
                );
            },
            onClose: () => setLoading(false),
        });
    };


    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
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

                    <div className="p-8">
                        <h3 className="text-xl font-bold text-white mb-2">Get Your License</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            Pay for a license to make your profile visible on the Players page and participate in SAPA tournaments.
                        </p>

                        {error && (
                            <div className="mb-4 p-4 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="space-y-3">
                            <button
                                onClick={() => runPayment(handleFullLicensePay, 'full')}
                                disabled={loading || !isPaystackConfigured()}
                                className="w-full flex items-center justify-between p-4 rounded-xl bg-padel-green/20 border border-padel-green/50 hover:bg-padel-green/30 transition-all group"
                            >
                                <div className="text-left">
                                    <p className="text-white font-bold">Pay Now - Full License</p>
                                    <p className="text-gray-400 text-xs">{formatCurrency(FEES.FULL_LICENSE)} • Profile visible on Players page</p>
                                </div>
                                <div className="bg-padel-green text-black font-black px-4 py-2 rounded-lg text-sm group-hover:scale-105 transition-transform">
                                    {loading ? 'Processing...' : 'Pay'}
                                </div>
                            </button>

                            <div className="w-full flex-col rounded-xl bg-white/5 border border-white/10 transition-all">
                                <button
                                    onClick={() => {
                                        if (showTempOptions) {
                                            if (selectedEventId) {
                                                runPayment(handleTemporaryLicensePay, 'temporary');
                                            }
                                        } else {
                                            setShowTempOptions(true);
                                        }
                                    }}
                                    disabled={loading || !isPaystackConfigured() || (showTempOptions && (!selectedEventId || upcomingEvents.length === 0))}
                                    className="w-full flex items-center justify-between p-4 hover:bg-white/10 transition-all group rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="text-left">
                                        <p className="text-white font-bold">Buy Temporary License</p>
                                        <p className="text-gray-400 text-xs">{formatCurrency(FEES.TEMPORARY_LICENSE)}</p>
                                    </div>
                                    <div className={`text-black font-black px-4 py-2 rounded-lg text-sm transition-transform ${(!showTempOptions || (selectedEventId && upcomingEvents.length > 0)) ? 'bg-padel-green group-hover:scale-105' : 'bg-gray-500'}`}>
                                        {loading ? 'Processing...' : (
                                            !showTempOptions ? 'Select Event' : 
                                            (upcomingEvents.length === 0 ? 'Unavailable' : (selectedEventId ? 'Pay For Event' : 'Select Event'))
                                        )}
                                    </div>
                                </button>

                                {showTempOptions && (
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
                        </div>

                        <p className="text-gray-500 text-xs mt-4 text-center">
                            Only full license holders are displayed on the public Players page.
                        </p>

                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default LicensePaymentModal;
