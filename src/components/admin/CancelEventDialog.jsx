import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion as Motion } from 'framer-motion';
import { AlertTriangle, Ban, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../supabaseClient';

export default function CancelEventDialog({ event, divisions, onClose, onCancelled }) {
    const [divisionId, setDivisionId] = useState('');
    const division = divisions?.find((d) => String(d.id) === divisionId);
    const isDivision = Boolean(divisions);
    const subject = isDivision ? 'division' : 'event';
    const [cancelling, setCancelling] = useState(false);
    const [cancellationReason, setCancellationReason] = useState('');

    const handleCancelEvent = async () => {
        if (!event?.id || cancelling || (isDivision && !division)) return;
        setCancelling(true);
        try {
            const { data, error } = await supabase.functions.invoke('paystack-refund', {
                body: {
                    action: isDivision ? 'cancel_division' : 'cancel_event',
                    division_id: division?.id,
                    event_id: event.id,
                    cancellation_reason: cancellationReason.trim() || undefined,
                },
            });
            if (error) {
                const details = await error.context?.json?.().catch(() => null);
                throw new Error(details?.error || error.message);
            }
            if (data?.error) throw new Error(data.error);

            if (isDivision) {
                const message = data?.refund_status === 'needs_attention'
                    ? `${division.name} cancelled. Some payments need manual refund review in the Income Statement.`
                    : `${division.name} cancelled. ${data?.registrations_processed || 0} player entries processed; refunds ${data?.refund_status === 'processing' ? 'initiated' : 'complete'}.`;
                data?.refund_status === 'needs_attention' ? toast.warning(message) : toast.success(message);
                onCancelled(data);
                return;
            }
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
            toast.error(err?.message || `Could not cancel the ${subject}. Refresh to check cancellation and refund status.`);
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
                        <h3 id="cancel-event-title" className="text-xl font-bold text-white">Cancel this {subject}?</h3>
                        <p className="mt-2 text-sm leading-6 text-gray-400">
                            {isDivision ? 'This will close the selected division, withdraw its players and automatically initiate eligible Paystack refunds. Other divisions will continue. Cash and EFT payments need manual refund handling.' : 'This will withdraw every active player entry, automatically refund all eligible payments, remove the event from every player’s schedule, and mark it as cancelled publicly.'}
                        </p>
                    </div>
                </div>
                {isDivision && <div className="mt-5">
                    <label htmlFor="cancel-division" className="block text-sm font-bold text-gray-300">Division</label>
                    <select id="cancel-division" value={divisionId} onChange={(e) => setDivisionId(e.target.value)} disabled={cancelling} className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-white">
                        <option value="">Select a division</option>
                        {divisions.filter((d) => !d.cancelled_at).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    {divisions.filter((d) => d.cancelled_at).map((d) => <p key={d.id} className="mt-2 text-sm text-red-300">{d.name}: cancelled · refunds {d.cancellation_refund_status?.replaceAll('_', ' ') || 'pending review'}</p>)}
                </div>}
                <label htmlFor="event-cancellation-reason" className="mt-5 block text-xs font-bold uppercase tracking-wider text-gray-400">Reason (optional)</label>
                <textarea
                    id="event-cancellation-reason"
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    rows={3}
                    placeholder={`Tell registered players why the ${subject} was cancelled…`}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none focus:border-red-500/50"
                />
                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" disabled={cancelling} onClick={() => onClose()} className="px-4 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-50">Keep {subject}</button>
                    <button type="button" disabled={cancelling || (isDivision && !division)} onClick={handleCancelEvent} className="px-4 py-2 rounded-xl bg-red-500 text-white font-bold flex items-center gap-2 hover:bg-red-400 disabled:opacity-50">
                        {cancelling ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                        {cancelling ? 'Cancelling and refunding…' : `Cancel ${subject} and refund players`}
                    </button>
                </div>
            </div>
        </Motion.div>,
        document.body
    );
}
