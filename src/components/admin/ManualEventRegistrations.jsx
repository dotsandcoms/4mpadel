import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    X, Users, CheckCircle, Clock, DollarSign, Download, Loader2, Check, Search, UserX, Trash2, RotateCcw
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { buildPlayersByEmailMap, fetchPlayersByEmails } from '../../utils/playerLookup';

const fmtR = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

const ABANDONED_CHECKOUT_AFTER_MS = 24 * 60 * 60 * 1000;
const ACTIVE_CHECKOUT_WINDOW_MS = 60 * 60 * 1000;

const PAYMENT_METHOD_LABELS = {
    paystack: 'Paystack',
    manual: 'Manual',
    cash: 'Cash',
    system: 'System',
};

const labelPaymentMethod = (method) => {
    if (!method) return '';
    const key = String(method).toLowerCase();
    return PAYMENT_METHOD_LABELS[key] || method;
};

const buildPlayersByEmail = buildPlayersByEmailMap;

const ManualEventRegistrations = ({ isOpen, onClose, event }) => {
    const [registrations, setRegistrations] = useState([]);
    const [payments, setPayments] = useState([]);
    const [divisions, setDivisions] = useState([]);
    const [refunds, setRefunds] = useState([]);
    const [playersByEmail, setPlayersByEmail] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all | paid | pending | withdrawn
    const [markingId, setMarkingId] = useState(null);
    const [removeTarget, setRemoveTarget] = useState(null);
    const [removePair, setRemovePair] = useState(false);
    const [removeBusy, setRemoveBusy] = useState(false);

    const load = useCallback(async () => {
        if (!event?.id) return;
        setLoading(true);

        const abandonCutoff = new Date(Date.now() - ABANDONED_CHECKOUT_AFTER_MS).toISOString();
        await supabase
            .from('payments')
            .update({ status: 'abandoned' })
            .eq('event_id', event.id)
            .eq('status', 'processing')
            .lt('created_at', abandonCutoff);

        const [regRes, payRes, divRes] = await Promise.all([
            supabase.from('event_registrations').select('*').eq('event_id', event.id).order('created_at', { ascending: false }),
            supabase.from('payments').select('*').eq('event_id', event.id),
            supabase.from('tournament_divisions').select('*').eq('event_id', event.id),
        ]);
        const regs = regRes.data || [];
        setRegistrations(regs);
        setPayments(payRes.data || []);
        setDivisions(divRes.data || []);

        const regIds = regs.map((r) => r.id);
        if (regIds.length > 0) {
            const { data: refundRows } = await supabase
                .from('payment_refunds')
                .select('*')
                .in('event_registration_id', regIds);
            setRefunds(refundRows || []);
        } else {
            setRefunds([]);
        }

        const emails = [...new Set(regs.map((r) => r.email).filter(Boolean))];
        if (emails.length > 0) {
            const players = await fetchPlayersByEmails(
                supabase,
                emails,
                'id, email, license_type, paid_registration, temporary_licenses(event_id, event_date)',
            );
            setPlayersByEmail(buildPlayersByEmail(players));
        } else {
            setPlayersByEmail(new Map());
        }

        setLoading(false);
    }, [event?.id]);

    useEffect(() => {
        if (isOpen) { load(); setSearch(''); setStatusFilter('all'); }
    }, [isOpen, load]);

    const divFee = useCallback(
        (name) => Number(divisions.find((d) => d.name === name)?.entry_fee || 0),
        [divisions]
    );

    const stats = useMemo(() => {
        const active = registrations.filter((r) => r.status !== 'withdrawn');
        const paid = active.filter((r) => r.payment_status === 'paid').length;
        const pending = active.filter((r) => r.payment_status !== 'paid').length;
        const revenue = payments.filter((p) => p.status === 'success').reduce((s, p) => s + Number(p.amount || 0), 0);
        const now = Date.now();
        const activeCheckouts = payments.filter((p) => {
            if (p.status !== 'processing') return false;
            return now - new Date(p.created_at).getTime() <= ACTIVE_CHECKOUT_WINDOW_MS;
        });
        const activeCheckoutTotal = activeCheckouts.reduce((s, p) => s + Number(p.amount || 0), 0);
        const abandonedCheckouts = payments.filter((p) => p.status === 'abandoned');
        const abandonedCheckoutTotal = abandonedCheckouts.reduce((s, p) => s + Number(p.amount || 0), 0);
        return {
            total: active.length,
            paid,
            pending,
            revenue,
            activeCheckoutTotal,
            activeCheckoutCount: activeCheckouts.length,
            abandonedCheckoutTotal,
            abandonedCheckoutCount: abandonedCheckouts.length,
            withdrawn: registrations.length - active.length,
        };
    }, [registrations, payments]);

    const refundByReg = useMemo(() => {
        const m = new Map();
        for (const rf of refunds) {
            const id = rf.event_registration_id;
            if (!id) continue;
            const cur = m.get(id) || { amount: 0, statuses: [] };
            cur.amount += Number(rf.amount || 0);
            cur.statuses.push(rf.status);
            m.set(id, cur);
        }
        return m;
    }, [refunds]);

    const refundSummaryFor = (regId) => {
        const e = refundByReg.get(regId);
        if (!e) return null;
        let status = 'pending';
        if (e.statuses.some((s) => s === 'failed' || s === 'needs_attention')) status = 'failed';
        else if (e.statuses.length && e.statuses.every((s) => s === 'processed')) status = 'processed';
        return { amount: e.amount, status };
    };

    const filtered = useMemo(() => {
        let rows = registrations;
        if (statusFilter === 'withdrawn') rows = rows.filter((r) => r.status === 'withdrawn');
        else {
            rows = rows.filter((r) => r.status !== 'withdrawn');
            if (statusFilter === 'paid') rows = rows.filter((r) => r.payment_status === 'paid');
            if (statusFilter === 'pending') rows = rows.filter((r) => r.payment_status !== 'paid');
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            rows = rows.filter((r) =>
                [r.full_name, r.email, r.division, r.partner_name, r.partner_email].filter(Boolean).some((v) => v.toLowerCase().includes(q))
            );
        }
        return rows;
    }, [registrations, statusFilter, search]);

    const markPaid = async (reg) => {
        setMarkingId(reg.id);
        try {
            const { error } = await supabase
                .from('event_registrations')
                .update({ payment_status: 'paid' })
                .eq('id', reg.id);
            if (error) throw error;

            // Record a manual payment for the finance ledger (idempotent-ish by reference).
            const reference = `MANUAL-ADMIN-${reg.id}`;
            const { data: existing } = await supabase.from('payments').select('id').eq('reference', reference).maybeSingle();
            if (!existing) {
                await supabase.from('payments').insert([{
                    event_id: event.id,
                    amount: divFee(reg.division),
                    currency: 'ZAR',
                    status: 'success',
                    payment_type: 'event_entry_fee',
                    payment_method: 'manual',
                    reference,
                    metadata: { source: 'manual_event_admin', division: reg.division, email: reg.email, marked_by_admin: true },
                }]);
            }
            toast.success(`Marked ${reg.full_name} as paid`);
            load();
        } catch (err) {
            toast.error(`Failed: ${err.message}`);
        } finally {
            setMarkingId(null);
        }
    };

    const invokeAdminRefund = async (body) => {
        const { data, error } = await supabase.functions.invoke('paystack-refund', { body });
        if (error) {
            let payload = null;
            try {
                if (error.context && typeof error.context.json === 'function') {
                    payload = await error.context.json();
                }
            } catch {
                // ignore
            }
            throw new Error(payload?.error || payload?.message || error.message || 'Request failed');
        }
        if (data?.error) throw new Error(data.message || data.error);
        return data;
    };

    const partnerRegOf = (reg) => {
        if (!reg?.partner_email) return null;
        const pe = reg.partner_email.toLowerCase();
        return registrations.find(
            (x) => x.id !== reg.id
                && (x.email || '').toLowerCase() === pe
                && x.division === reg.division
                && x.status !== 'withdrawn',
        ) || null;
    };

    // mode: 'refund' (Paystack/auto) | 'cash_refund' (mark refunded, no Paystack) | 'no_refund'
    const removeRegistration = async (reg, mode) => {
        setRemoveBusy(true);
        try {
            const flags = {};
            if (mode === 'cash_refund') flags.skip_paystack = true;
            if (mode === 'no_refund') flags.no_refund = true;

            const toRemove = [reg];
            if (removePair) {
                const pr = partnerRegOf(reg);
                if (pr) toRemove.push(pr);
            }

            let totalRefunded = 0;
            for (const t of toRemove) {
                const res = await invokeAdminRefund({ action: 'admin_remove', registration_id: t.id, ...flags });
                totalRefunded += Number(res?.total_refunded_rands || 0);
            }

            toast.success(totalRefunded > 0 ? `Removed — ${fmtR(totalRefunded)} refunded` : 'Removed');
            setRemoveTarget(null);
            setRemovePair(false);
            load();
        } catch (err) {
            toast.error(err.message || 'Failed to remove');
        } finally {
            setRemoveBusy(false);
        }
    };

    const formatPaymentStatusForExport = useCallback((r) => {
        if (r.payment_status !== 'paid') return r.payment_status || 'pending';

        const selfEmail = (r.email || '').toLowerCase();
        const registeredBy = (r.registered_by || '').toLowerCase();
        if (!registeredBy || registeredBy === selfEmail) return 'Paid';

        let payerName = r.partner_name;
        if (!payerName || (r.partner_email || '').toLowerCase() !== registeredBy) {
            payerName = registrations.find((x) => (x.email || '').toLowerCase() === registeredBy)?.full_name;
        }
        return `Paid by Partner ${payerName || r.registered_by}`;
    }, [registrations]);

    const formatPaymentMethodForExport = useCallback((r) => {
        if (r.payment_status !== 'paid') return '';

        if (r.payment_method) return labelPaymentMethod(r.payment_method);

        const email = (r.email || '').toLowerCase();
        const division = r.division;

        for (const p of payments.filter((x) => x.status === 'success')) {
            const covers = p.metadata?.covers;
            if (Array.isArray(covers)) {
                const covered = covers.some(
                    (c) => c.type === 'entry'
                        && (c.email || '').toLowerCase() === email
                        && c.division === division,
                );
                if (covered) return labelPaymentMethod(p.payment_method || 'paystack');
            }
            if (
                p.metadata?.source === 'manual_event_admin'
                && (p.metadata?.email || '').toLowerCase() === email
                && p.metadata?.division === division
            ) {
                return labelPaymentMethod(p.payment_method || 'manual');
            }
        }

        return '';
    }, [payments]);

    const formatLicenseForExport = useCallback((r) => {
        const email = (r.email || '').toLowerCase();
        if (!email) return '';

        for (const p of payments.filter((x) => x.status === 'success')) {
            const cover = (p.metadata?.covers || []).find(
                (c) => c.type === 'license' && (c.email || '').toLowerCase() === email,
            );
            if (cover) {
                return cover.license === 'full' ? 'Full (purchased for event)' : 'Temporary (purchased for event)';
            }
        }

        const player = playersByEmail.get(email);
        if (!player) return 'Not on file';
        if (String(player.license_type || '').toLowerCase() === 'full') return 'Full';
        const hasTempForEvent = (player.temporary_licenses || []).some(
            (lic) => Number(lic.event_id) === Number(event?.id),
        );
        if (hasTempForEvent) return 'Temporary';
        if (player.paid_registration) return 'Active';
        return 'None';
    }, [playersByEmail, payments, event?.id]);

    const exportCsv = () => {
        const headers = ['Name', 'Email', 'Phone', 'Division', 'Partner', 'Partner Email', 'License', 'Payment Status', 'Payment Method', 'Status', 'Registered'];
        const lines = [headers.join(',')];
        for (const r of registrations) {
            const row = [
                r.full_name, r.email, r.phone || '', r.division, r.partner_name || '', r.partner_email || '',
                formatLicenseForExport(r), formatPaymentStatusForExport(r), formatPaymentMethodForExport(r), r.status || '',
                r.created_at ? new Date(r.created_at).toLocaleString() : '',
            ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
            lines.push(row.join(','));
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(event.slug || event.event_name || 'event').toString().replace(/[^a-z0-9]+/gi, '-')}-registrations.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    const statusBadge = (r) => {
        if (r.status === 'withdrawn') return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-500/10 text-gray-400">Withdrawn</span>;
        if (r.payment_status === 'paid') return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400">Paid</span>;
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/10 text-amber-400">Pending</span>;
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1100] flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.97, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 20 }}
                    className="bg-[#0F172A] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div>
                            <h2 className="text-xl font-bold text-white">Registrations & Payments</h2>
                            <p className="text-xs text-gray-400 truncate max-w-[60vw]">{event.event_name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={exportCsv} className="bg-white/5 text-white border border-white/10 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-white/10">
                                <Download size={16} /> Export CSV
                            </button>
                            <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5">
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-4 border-b border-white/5">
                        {[
                            { label: 'Entries', value: stats.total, icon: Users, color: '#beff00' },
                            { label: 'Paid', value: stats.paid, icon: CheckCircle, color: '#22c55e' },
                            { label: 'Pending', value: stats.pending, icon: Clock, color: '#f59e0b' },
                            { label: 'Revenue', value: fmtR(stats.revenue), icon: DollarSign, color: '#beff00' },
                        ].map((s) => (
                            <div key={s.label} className="bg-[#1E293B]/50 border border-white/10 rounded-xl p-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{s.label}</p>
                                    <s.icon size={16} style={{ color: s.color }} />
                                </div>
                                <p className="text-2xl font-black text-white mt-1">{s.value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Controls */}
                    <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-white/5">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search name, email, division..."
                                className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:border-padel-green focus:outline-none"
                            />
                        </div>
                        <div className="flex gap-1">
                            {['all', 'paid', 'pending', 'withdrawn'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setStatusFilter(f)}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold capitalize ${statusFilter === f ? 'bg-padel-green text-black' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {loading ? (
                            <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                                <UserX size={36} className="mb-3 opacity-40" />
                                <p className="text-sm">No registrations found</p>
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-[#0F172A] z-10">
                                    <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-white/10">
                                        <th className="py-3 px-6">Player</th>
                                        <th className="py-3 px-4">Division</th>
                                        <th className="py-3 px-4">Partner</th>
                                        <th className="py-3 px-4">Status</th>
                                        <th className="py-3 px-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((r) => (
                                        <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                                            <td className="py-3 px-6">
                                                <div className="font-bold text-white">{r.full_name}</div>
                                                <div className="text-[11px] text-gray-500">{r.email}</div>
                                            </td>
                                            <td className="py-3 px-4 text-gray-300">{r.division}</td>
                                            <td className="py-3 px-4 text-gray-400">
                                                {r.partner_name || '—'}
                                                {r.partner_email && <div className="text-[10px] text-gray-600">{r.partner_email}</div>}
                                            </td>
                                            <td className="py-3 px-4">
                                                {statusBadge(r)}
                                                {(() => {
                                                    const rf = refundSummaryFor(r.id);
                                                    if (!rf) return null;
                                                    const cfg = rf.status === 'processed'
                                                        ? { cls: 'bg-emerald-500/10 text-emerald-400', text: `Refunded ${fmtR(rf.amount)}` }
                                                        : rf.status === 'failed'
                                                            ? { cls: 'bg-red-500/10 text-red-400', text: 'Refund failed' }
                                                            : { cls: 'bg-sky-500/10 text-sky-400', text: `Refund pending ${fmtR(rf.amount)}` };
                                                    return (
                                                        <div className={`mt-1 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cfg.cls}`}>
                                                            {cfg.text}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            <td className="py-3 px-4 text-right">
                                                <div className="inline-flex items-center gap-2 justify-end">
                                                    {r.status !== 'withdrawn' && r.payment_status !== 'paid' && (
                                                        <button
                                                            onClick={() => markPaid(r)}
                                                            disabled={markingId === r.id}
                                                            className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-500 hover:text-white inline-flex items-center gap-1.5 disabled:opacity-50"
                                                        >
                                                            {markingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                                            Mark Paid
                                                        </button>
                                                    )}
                                                    {r.status !== 'withdrawn' && (
                                                        <button
                                                            onClick={() => { setRemovePair(false); setRemoveTarget(r); }}
                                                            className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500 hover:text-white inline-flex items-center gap-1.5"
                                                        >
                                                            <Trash2 size={12} />
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {removeTarget && (() => {
                        const paid = removeTarget.payment_status === 'paid';
                        const method = formatPaymentMethodForExport(removeTarget);
                        const isCash = method === 'Cash' || method === 'Manual';
                        const partner = partnerRegOf(removeTarget);
                        return (
                            <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-black/60" onClick={() => !removeBusy && setRemoveTarget(null)}>
                                <div className="bg-[#0F172A] border border-white/10 rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                                            <Trash2 size={16} className="text-red-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-white font-bold">Remove {removeTarget.full_name}?</h3>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {removeTarget.division}
                                                {paid ? ` · Paid${method ? ` (${method})` : ''}` : ' · Not paid'}
                                            </p>
                                        </div>
                                    </div>

                                    {partner && (
                                        <label className="flex items-center gap-2 mb-4 text-xs text-gray-300 cursor-pointer">
                                            <input type="checkbox" checked={removePair} onChange={(e) => setRemovePair(e.target.checked)} disabled={removeBusy} className="accent-red-500" />
                                            Also remove partner <span className="font-bold text-white">{partner.full_name}</span> (pair)
                                        </label>
                                    )}

                                    <div className="flex flex-col gap-2">
                                        {paid && !isCash && (
                                            <button onClick={() => removeRegistration(removeTarget, 'refund')} disabled={removeBusy}
                                                className="w-full py-2.5 rounded-lg text-sm font-bold bg-padel-green text-black hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                                                {removeBusy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Remove &amp; Refund
                                            </button>
                                        )}
                                        {paid && isCash && (
                                            <button onClick={() => removeRegistration(removeTarget, 'cash_refund')} disabled={removeBusy}
                                                className="w-full py-2.5 rounded-lg text-sm font-bold bg-padel-green text-black hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                                                {removeBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Mark Refunded &amp; Remove
                                            </button>
                                        )}
                                        <button onClick={() => removeRegistration(removeTarget, 'no_refund')} disabled={removeBusy}
                                            className="w-full py-2.5 rounded-lg text-sm font-bold bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 disabled:opacity-50">
                                            {paid ? 'Remove without refund' : 'Remove'}
                                        </button>
                                        <button onClick={() => setRemoveTarget(null)} disabled={removeBusy}
                                            className="w-full py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {(stats.activeCheckoutCount > 0 || stats.abandonedCheckoutCount > 0) && (
                        <div className="px-6 py-2 border-t border-white/5 text-[11px] space-y-1">
                            {stats.activeCheckoutCount > 0 && (
                                <p className="text-amber-400">
                                    {fmtR(stats.activeCheckoutTotal)} in {stats.activeCheckoutCount} active checkout{stats.activeCheckoutCount === 1 ? '' : 's'} (last hour, not yet paid).
                                </p>
                            )}
                            {stats.abandonedCheckoutCount > 0 && (
                                <p className="text-gray-500">
                                    {stats.abandonedCheckoutCount} abandoned checkout{stats.abandonedCheckoutCount === 1 ? '' : 's'} ({fmtR(stats.abandonedCheckoutTotal)} — not charged).
                                </p>
                            )}
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default ManualEventRegistrations;
