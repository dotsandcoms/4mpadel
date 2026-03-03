import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { usePaystackPayment } from 'react-paystack';
import { supabase } from '../supabaseClient';
import { FEES, toPaystackAmount, formatCurrency } from '../constants/fees';

const handlePaymentComplete = async (onDone, onSuccessCallback, setError, closeModal) => {
    const { error: rpcError } = await supabase.rpc('mark_player_paid');
    if (rpcError) {
        setError('Payment received but failed to update profile. Please contact support.');
    } else {
        onSuccessCallback?.();
        closeModal();
    }
    onDone();
};

const LicensePaymentModal = ({ isOpen, onClose, userEmail, onPaymentSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const getConfig = (amountInRands) => ({
        reference: `${(new Date()).getTime()}-${amountInRands}`,
        email: userEmail || '',
        amount: toPaystackAmount(amountInRands),
        publicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '',
        currency: 'ZAR',
    });

    const handleFullLicensePay = usePaystackPayment(getConfig(FEES.FULL_LICENSE));
    const handleTemporaryLicensePay = usePaystackPayment(getConfig(FEES.TEMPORARY_LICENSE));

    const runPayment = (paymentFn) => {
        setError(null);
        setLoading(true);
        paymentFn({
            onSuccess: async () => {
                await handlePaymentComplete(
                    () => setLoading(false),
                    onPaymentSuccess,
                    setError,
                    onClose
                );
            },
            onClose: () => setLoading(false),
        });
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
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
                                onClick={() => runPayment(handleFullLicensePay)}
                                disabled={loading || !import.meta.env.VITE_PAYSTACK_PUBLIC_KEY}
                                className="w-full flex items-center justify-between p-4 rounded-xl bg-padel-green/20 border border-padel-green/50 hover:bg-padel-green/30 transition-all group"
                            >
                                <div className="text-left">
                                    <p className="text-white font-bold">Pay Now - Full License</p>
                                    <p className="text-gray-400 text-xs">{formatCurrency(FEES.FULL_LICENSE)} • Profile visible immediately</p>
                                </div>
                                <div className="bg-padel-green text-black font-black px-4 py-2 rounded-lg text-sm group-hover:scale-105 transition-transform">
                                    {loading ? 'Processing...' : 'Pay'}
                                </div>
                            </button>

                            <button
                                onClick={() => runPayment(handleTemporaryLicensePay)}
                                disabled={loading || !import.meta.env.VITE_PAYSTACK_PUBLIC_KEY}
                                className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group"
                            >
                                <div className="text-left">
                                    <p className="text-white font-bold">Buy Temporary License</p>
                                    <p className="text-gray-400 text-xs">{formatCurrency(FEES.TEMPORARY_LICENSE)} • Profile visible immediately</p>
                                </div>
                                <div className="bg-padel-green text-black font-black px-4 py-2 rounded-lg text-sm group-hover:scale-105 transition-transform">
                                    {loading ? 'Processing...' : 'Pay'}
                                </div>
                            </button>
                        </div>

                        <p className="text-gray-500 text-xs mt-4 text-center">
                            Both options process payment in this modal. Your profile will be visible immediately after payment.
                        </p>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default LicensePaymentModal;
