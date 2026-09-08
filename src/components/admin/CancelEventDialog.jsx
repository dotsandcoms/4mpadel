import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion as Motion } from 'framer-motion';
import { AlertTriangle, Ban, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../supabaseClient';

export default function CancelEventDialog({ event, onClose, onCancelled }) {
    const [cancelling, setCancelling] = useState(false);
    const [cancellationReason, setCancellationReason] = useState('');

    const handleCancelEvent = async () => {
        if (!event?.id || cancelling) return;
        setCancelling(true);
        try {
            const { data, error } = await supabase.functions.invoke('paystack-refund', {
                body: {
                    action: 'cancel_event',
                    event_id: event.id,
                    cancellation_reason: cancellationReason.trim() || undefined,
                },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            const cancelledAt = new Date().toISOString();
            const updatedEvent = {
                ...event,
                event_status: 'cancelled',
                cancelled_at: cancelledAt,
                cancellation_reason: cancellationReason.trim() || null,
                cancellation_refund_status: data?.refund_status || 'complete',
            };

            const refundMessage = data?.refund_status === 'needs_attention'
                ? 'Event cancelled. Some refunds need administrator attention.'
                : `Event cancelled. ${data?.registrations_processed || 0} player entr${data?.registrations_processed === 1 ? 'y' : 'ies'} processed.`;
            data?.refund_status === 'needs_attention' ? toast.warning(refundMessage) : toast.success(refundMessage);
            onCancelled(updatedEvent);
        } catch (err) {
            console.error('Event cancellation failed:', err);
            toast.error(err?.message || 'Could not cancel the event');
        } finally {
            setCancelling(false);
        }
    };

    return createPortal(
        <Motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[1300] bg-black/80 flex items-center justify-center p-4"
            onClick={(e) => { e.stopPropagation(); if (!cancelling) onClose(); }}
        >
            <div role="dialog" aria-modal="true" aria-labelledby="cancel-event-title" className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-[#111] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-red-500/10 p-3 text-red-400"><AlertTriangle size={24} /></div>
                    <div>
                        <h3 id="cancel-event-title" className="text-xl font-bold text-white">Cancel this event?</h3>
                        <p className="mt-2 text-sm leading-6 text-gray-400">
                            This will withdraw every active player entry, automatically refund all eligible payments, remove the event from every player’s schedule, and mark it as cancelled publicly.
                        </p>
                    </div>
                </div>
                <label htmlFor="event-cancellation-reason" className="mt-5 block text-xs font-bold uppercase tracking-wider text-gray-400">Reason (optional)</label>
                <textarea
                    id="event-cancellation-reason"
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    rows={3}
                    placeholder="Tell registered players why the event was cancelled…"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none focus:border-red-500/50"
                />
                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" disabled={cancelling} onClick={() => onClose()} className="px-4 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-50">Keep event</button>
                    <button type="button" disabled={cancelling} onClick={handleCancelEvent} className="px-4 py-2 rounded-xl bg-red-500 text-white font-bold flex items-center gap-2 hover:bg-red-400 disabled:opacity-50">
                        {cancelling ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                        {cancelling ? 'Cancelling and refunding…' : 'Cancel event and refund players'}
                    </button>
                </div>
            </div>
        </Motion.div>,
        document.body
    );
}
