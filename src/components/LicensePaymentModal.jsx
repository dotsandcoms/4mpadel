import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Calendar, Check, ChevronRight } from 'lucide-react';
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
    const [existingLicenses, setExistingLicenses] = useState([]);
    const [eventSearchQuery, setEventSearchQuery] = useState('');

    const filteredEvents = upcomingEvents.filter(event =>
        event.event_name?.toLowerCase().includes(eventSearchQuery.toLowerCase())
    );

    React.useEffect(() => {
        if (isOpen) {
            setEventSearchQuery('');
            const fetchEventsAndLicenses = async () => {
                setEventsLoading(true);
                try {
                    const { data: events, error: eventsError } = await supabase
                        .from('calendar')
                        .select('id, event_name, start_date, end_date')
                        .gte('start_date', new Date().toISOString())
                        .order('start_date', { ascending: true });

                    if (!eventsError && events) {
                        setUpcomingEvents(events);
                    }

                    if (userEmail) {
                        const { data: pData } = await supabase
                            .from('players')
                            .select('id')
                            .ilike('email', userEmail)
                            .maybeSingle();

                        if (pData?.id) {
                            const { data: licenses } = await supabase
                                .from('temporary_licenses')
                                .select('event_id')
                                .eq('player_id', pData.id);

                            if (licenses) {
                                const eventIds = licenses.map(l => l.event_id?.toString()).filter(Boolean);
                                setExistingLicenses(eventIds);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Failed to load events or licenses", e);
                } finally {
                    setEventsLoading(false);
                }
            };
            fetchEventsAndLicenses();
        }
    }, [isOpen, userEmail]);


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
        if (licenseType === 'temporary' && selectedEventId) {
            const hasLicense = existingLicenses.includes(selectedEventId.toString());
            if (hasLicense) {
                setError('You already have an active temporary license for this event.');
                return;
            }
        }
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

                            <div className={`w-full flex-col rounded-xl transition-all ${
                                showTempOptions 
                                    ? 'bg-blue-500/[0.02] border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.05)]' 
                                    : 'bg-white/5 border border-white/10 hover:border-white/20'
                            }`}>
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
                                    disabled={loading || !isPaystackConfigured() || (showTempOptions && (!selectedEventId || upcomingEvents.length === 0 || existingLicenses.includes(selectedEventId.toString())))}
                                    className="w-full flex items-center justify-between p-4 hover:bg-white/10 transition-all group rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="text-left">
                                        <p className="text-white font-bold">Buy Temporary License</p>
                                        <p className="text-gray-400 text-xs">{formatCurrency(FEES.TEMPORARY_LICENSE)}</p>
                                    </div>
                                    <div className={`font-black px-4 py-2 rounded-lg text-sm transition-transform ${
                                        (!showTempOptions || (selectedEventId && upcomingEvents.length > 0 && !existingLicenses.includes(selectedEventId.toString()))) 
                                            ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-md shadow-blue-500/20 group-hover:scale-105' 
                                            : 'bg-gray-500 text-black'
                                    }`}>
                                        {loading ? 'Processing...' : (
                                            !showTempOptions ? 'Select Event' : 
                                            (upcomingEvents.length === 0 ? 'Unavailable' : 
                                             (selectedEventId ? 
                                              (existingLicenses.includes(selectedEventId.toString()) ? 'Licensed' : 'Pay For Event') 
                                              : 'Select Event'))
                                        )}
                                    </div>
                                </button>

                                {showTempOptions && (
                                    <div className="p-4 border-t border-white/10 w-full animate-in fade-in slide-in-from-top-2 flex flex-col gap-3">
                                        <div className="text-left">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Event Registration</label>
                                            
                                            {eventsLoading ? (
                                                <div className="text-center py-6 bg-black/40 rounded-xl border border-white/5">
                                                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                                    <span className="text-[10px] text-gray-500 mt-2 block font-medium animate-pulse">Loading upcoming events...</span>
                                                </div>
                                            ) : upcomingEvents?.length === 0 ? (
                                                <p className="text-[10px] text-yellow-500 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
                                                    No upcoming events found. You must wait for an event to be posted to buy a temporary license.
                                                </p>
                                            ) : selectedEventId ? (
                                                // Selected Event Card View
                                                (() => {
                                                    const selectedEvent = upcomingEvents.find(e => e.id?.toString() === selectedEventId.toString());
                                                    if (!selectedEvent) return null;
                                                    
                                                    return (
                                                        <div className="bg-black/40 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between gap-3 animate-in fade-in zoom-in-95 duration-200">
                                                            <div className="flex-1 min-w-0">
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] font-bold text-blue-400 uppercase tracking-wide mb-1.5">
                                                                    <Check size={10} className="stroke-[3]" /> Selected Event
                                                                </span>
                                                                <h4 className="text-white font-bold text-sm truncate">{selectedEvent.event_name}</h4>
                                                                <p className="text-gray-400 text-[10px] mt-1 flex items-center gap-1">
                                                                    <Calendar size={12} className="text-gray-500" />
                                                                    {new Date(selectedEvent.start_date).toLocaleDateString(undefined, {
                                                                        day: 'numeric',
                                                                        month: 'short',
                                                                        year: 'numeric'
                                                                    })}
                                                                    {selectedEvent.end_date && selectedEvent.end_date !== selectedEvent.start_date && (
                                                                        <> - {new Date(selectedEvent.end_date).toLocaleDateString(undefined, {
                                                                            day: 'numeric',
                                                                            month: 'short',
                                                                            year: 'numeric'
                                                                        })}</>
                                                                    )}
                                                                </p>
                                                            </div>
                                                            
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedEventId('');
                                                                }}
                                                                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-white transition-all cursor-pointer whitespace-nowrap self-center"
                                                            >
                                                                Change
                                                                </button>
                                                        </div>
                                                    );
                                                })()
                                            ) : (
                                                // Live Search Input and Autocomplete Selection List View
                                                <div className="flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                                    <div className="relative">
                                                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                                        <input
                                                            type="text"
                                                            placeholder="Type to search events..."
                                                            value={eventSearchQuery}
                                                            onChange={(e) => setEventSearchQuery(e.target.value)}
                                                            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:border-blue-500 outline-none placeholder:text-gray-500 font-sans transition-colors"
                                                            onClick={(e) => e.stopPropagation()}
                                                            autoFocus
                                                        />
                                                        {eventSearchQuery && (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEventSearchQuery('');
                                                                }}
                                                                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 bg-white/5 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                    
                                                    <div className="max-h-[160px] overflow-y-auto flex flex-col gap-1.5 pr-0.5 custom-scrollbar">
                                                        {filteredEvents.length > 0 ? (
                                                            filteredEvents.map((event, i) => {
                                                                const hasLicense = existingLicenses.includes(event.id?.toString());
                                                                return (
                                                                    <button
                                                                        key={event.id || i}
                                                                        type="button"
                                                                        disabled={hasLicense}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (!hasLicense) {
                                                                                setSelectedEventId(event.id.toString());
                                                                            }
                                                                        }}
                                                                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all group ${
                                                                            hasLicense
                                                                                ? 'bg-white/[0.02] border-white/5 opacity-55 cursor-not-allowed'
                                                                                : 'bg-black/30 border-white/5 hover:border-blue-500/30 hover:bg-blue-500/5 cursor-pointer'
                                                                        }`}
                                                                    >
                                                                        <div className="min-w-0 flex-1 pr-3">
                                                                            <p className={`font-bold text-xs truncate transition-colors ${hasLicense ? 'text-gray-500' : 'text-white group-hover:text-blue-400'}`}>
                                                                                {event.event_name}
                                                                            </p>
                                                                            <p className="text-[9px] text-gray-500 font-medium uppercase tracking-wider mt-0.5 flex items-center gap-1">
                                                                                <Calendar size={10} className="text-gray-600" />
                                                                                {new Date(event.start_date).toLocaleDateString(undefined, {
                                                                                    day: 'numeric',
                                                                                    month: 'short',
                                                                                    year: 'numeric'
                                                                                })}
                                                                            </p>
                                                                        </div>
                                                                        
                                                                        <div>
                                                                            {hasLicense ? (
                                                                                <span className="inline-flex text-[8px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                                                                                    LICENSED
                                                                                </span>
                                                                            ) : (
                                                                                <span className="inline-flex items-center gap-0.5 text-[8px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                                                                    Select <ChevronRight size={10} />
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })
                                                        ) : (
                                                            <div className="py-6 text-center text-gray-500 bg-black/20 rounded-xl border border-white/5">
                                                                <Search className="w-5 h-5 mx-auto mb-1.5 opacity-20 text-blue-500" />
                                                                <p className="text-[10px] font-medium text-white/60">No matching events found</p>
                                                                <p className="text-[8px] mt-0.5 text-gray-600">Try typing a different name</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
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
