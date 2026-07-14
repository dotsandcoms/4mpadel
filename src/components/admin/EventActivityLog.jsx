import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ScrollText, RefreshCw, Search, UserPlus, CreditCard, UserX, Trophy,
    Edit3, CheckCircle2, XCircle, Coins, Filter, RotateCcw, Link2,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';

const PAGE_SIZE = 25;

const CATEGORY_STYLES = {
    REGISTRATION: 'text-blue-300 bg-blue-500/15 border-blue-500/30',
    PAYMENT: 'text-padel-green bg-padel-green/15 border-padel-green/30',
    PLAYER: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
    ADMIN: 'text-purple-300 bg-purple-500/15 border-purple-500/30',
    PUBLISH: 'text-purple-300 bg-purple-500/15 border-purple-500/30',
    CONFIGURATION: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
    AMENDMENT: 'text-orange-300 bg-orange-500/15 border-orange-500/30',
    SYSTEM: 'text-gray-300 bg-white/5 border-white/15',
};

const ACTION_ICONS = {
    'registration.created': UserPlus,
    'registration.withdrawn': UserX,
    'registration.moved': Edit3,
    'registration.partner_linked': Link2,
    'registration.profile_updated': Link2,
    'payment.status_changed': CreditCard,
    'payment.success': CreditCard,
    'payment.refunded': RotateCcw,
    'payment.abandoned': Coins,
    'payment.processing': Coins,
    'admin.marked_paid': CreditCard,
    'admin.unmarked_paid': CreditCard,
    'admin.removed': UserX,
    'admin.moved_entries': Edit3,
    'event.submitted': Trophy,
    'event.sanctioned': CheckCircle2,
    'event.rejected': XCircle,
};

const initials = (name) => {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
};

const formatStamp = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).toUpperCase();
};

const mapLogRow = (row) => {
    const details = row.details || {};
    const Icon = ACTION_ICONS[row.action] || ScrollText;
    const isAdmin = String(row.actor_role || '').toUpperCase() === 'ADMIN';
    const detailBits = [
        details.note,
        details.player_name && isAdmin ? `Player: ${details.player_name}` : null,
        details.partner_name,
        details.from_division && details.to_division
            ? `${details.from_division} → ${details.to_division}`
            : (details.division || details.to_division || null),
    ].filter(Boolean);

    return {
        id: row.id,
        at: row.created_at,
        userName: isAdmin
            ? (row.actor_email || 'Admin')
            : (details.player_name || row.actor_email || 'System'),
        userEmail: row.actor_email || '',
        userRole: row.actor_role || 'SYSTEM',
        activity: row.summary,
        detail: detailBits.join(' · '),
        category: row.category || 'SYSTEM',
        Icon,
    };
};

/**
 * Event-scoped activity timeline for Event Manager.
 * Prefers event_activity_log (triggers + admin RPC); falls back to synthesized history.
 */
const EventActivityLog = ({ eventId, eventName = '' }) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const [page, setPage] = useState(0);
    const [filtersOpen, setFiltersOpen] = useState(false);

    const load = useCallback(async () => {
        if (!eventId) return;
        setLoading(true);
        try {
            const { data: logData, error: logError } = await supabase
                .from('event_activity_log')
                .select('*')
                .eq('event_id', eventId)
                .order('created_at', { ascending: false })
                .limit(500);

            if (!logError && Array.isArray(logData) && logData.length > 0) {
                setItems(logData.map(mapLogRow));
                return;
            }

            // Fallback / pre-migration: synthesize from registrations + payments
            const [regRes, payRes] = await Promise.all([
                supabase
                    .from('event_registrations')
                    .select('id, full_name, email, partner_name, partner_email, division, status, payment_status, partner_payment_status, created_at, updated_at')
                    .eq('event_id', eventId)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('payments')
                    .select('id, status, amount, payment_type, metadata, created_at, updated_at')
                    .eq('event_id', eventId)
                    .order('created_at', { ascending: false }),
            ]);

            const rows = [];
            (regRes.data || []).forEach((reg) => {
                const name = reg.full_name || reg.email || 'Player';
                rows.push({
                    id: `reg_create_${reg.id}`,
                    at: reg.created_at,
                    userName: name,
                    userRole: 'PLAYER',
                    activity: `Registered for ${reg.division || 'event'}`,
                    detail: reg.partner_name ? `Partner: ${reg.partner_name}` : (reg.email || ''),
                    category: 'REGISTRATION',
                    Icon: UserPlus,
                });
                if (String(reg.status || '').toLowerCase() === 'withdrawn') {
                    rows.push({
                        id: `reg_withdraw_${reg.id}`,
                        at: reg.updated_at || reg.created_at,
                        userName: name,
                        userRole: 'PLAYER',
                        activity: 'Withdrawn from event',
                        detail: reg.division || '',
                        category: 'PLAYER',
                        Icon: UserX,
                    });
                }
            });
            (payRes.data || []).forEach((pay) => {
                const meta = pay.metadata || {};
                const payer = meta.email || meta.registrant_email || 'Payer';
                const amount = Number(pay.amount || 0);
                const status = String(pay.status || '').toLowerCase();
                rows.push({
                    id: `pay_${pay.id}`,
                    at: pay.updated_at || pay.created_at,
                    userName: payer,
                    userRole: meta.marked_by_admin ? 'ADMIN' : 'PLAYER',
                    activity: status === 'success'
                        ? `Payment received${amount ? ` · R ${amount.toLocaleString('en-ZA')}` : ''}`
                        : `Payment ${status}`,
                    detail: meta.note || meta.payment_note || pay.payment_type || '',
                    category: 'PAYMENT',
                    Icon: CreditCard,
                });
            });
            rows.sort((a, b) => new Date(b.at) - new Date(a.at));
            setItems(rows);
        } catch (err) {
            console.error('EventActivityLog load failed:', err);
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [eventId, eventName]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        setPage(0);
    }, [search, category]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter((row) => {
            if (category !== 'all' && row.category !== category) return false;
            if (!q) return true;
            return [row.userName, row.userEmail, row.activity, row.detail, row.category, row.userRole]
                .join(' ')
                .toLowerCase()
                .includes(q);
        });
    }, [items, search, category]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount - 1);
    const pageRows = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
    const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
    const to = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE);

    const categories = useMemo(() => {
        const set = new Set(items.map((i) => i.category));
        return ['all', ...Array.from(set).sort()];
    }, [items]);

    return (
        <div className="p-6">
            <div className="bg-[#1a1a1a]/60 border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-5 pt-5 pb-4 flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-white/10">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                            <ScrollText size={16} className="text-padel-green" />
                            Event Activity Log
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            Registrations, withdrawals, payments, and admin edits for this event.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
                        <div className="relative flex-1 sm:min-w-[220px]">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="search"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search activity..."
                                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-padel-green/40"
                            />
                        </div>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setFiltersOpen((v) => !v)}
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-gray-300 hover:text-white"
                            >
                                <Filter size={14} /> Filters
                            </button>
                            {filtersOpen && (
                                <div className="absolute right-0 top-full mt-2 z-20 w-48 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl p-2">
                                    {categories.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => { setCategory(c); setFiltersOpen(false); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                                category === c ? 'bg-padel-green text-black' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                                            }`}
                                        >
                                            {c === 'all' ? 'All categories' : c}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={load}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white"
                            title="Refresh"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left">
                        <thead>
                            <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-500">
                                <th className="px-5 py-3 font-black">Date & Time</th>
                                <th className="px-5 py-3 font-black">User</th>
                                <th className="px-5 py-3 font-black">Activity</th>
                                <th className="px-5 py-3 font-black text-right">Category</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && pageRows.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-5 py-10 text-center text-xs text-gray-500">Loading activity...</td>
                                </tr>
                            ) : pageRows.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-5 py-10 text-center text-xs text-gray-500">
                                        No activity recorded yet. New registrations, withdrawals, and admin edits will appear here.
                                    </td>
                                </tr>
                            ) : (
                                pageRows.map((row) => {
                                    const Icon = row.Icon || ScrollText;
                                    const catCls = CATEGORY_STYLES[row.category] || CATEGORY_STYLES.SYSTEM;
                                    const avatarTone = row.userRole === 'ADMIN'
                                        ? 'bg-padel-green/20 text-padel-green'
                                        : 'bg-sky-500/20 text-sky-300';
                                    return (
                                        <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                                            <td className="px-5 py-3.5 text-[11px] text-gray-400 whitespace-nowrap align-top">
                                                {formatStamp(row.at)}
                                            </td>
                                            <td className="px-5 py-3.5 align-top">
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${avatarTone}`}>
                                                        {initials(row.userName)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-white truncate">{row.userName}</p>
                                                        <p className="text-[9px] font-black uppercase tracking-wider text-gray-500">{row.userRole}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 align-top">
                                                <div className="flex items-start gap-2 min-w-0">
                                                    <Icon size={14} className="text-gray-500 mt-0.5 shrink-0" />
                                                    <div className="min-w-0">
                                                        <p className="text-xs text-white font-medium">{row.activity}</p>
                                                        {row.detail ? (
                                                            <p className="text-[11px] text-gray-500 mt-0.5 truncate">{row.detail}</p>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 text-right align-top">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-wider ${catCls}`}>
                                                    {row.category}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                        {filtered.length === 0 ? '0 of 0' : `${from} – ${to} of ${filtered.length}`}
                    </p>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            disabled={safePage === 0}
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-black text-gray-400 disabled:opacity-30 hover:text-white"
                        >
                            ←
                        </button>
                        {Array.from({ length: Math.min(pageCount, 5) }, (_, i) => {
                            const start = Math.max(0, Math.min(safePage - 2, pageCount - 5));
                            const pageIdx = start + i;
                            if (pageIdx >= pageCount) return null;
                            return (
                                <button
                                    key={pageIdx}
                                    type="button"
                                    onClick={() => setPage(pageIdx)}
                                    className={`w-8 h-8 rounded-lg text-[10px] font-black ${
                                        pageIdx === safePage
                                            ? 'bg-padel-green text-black'
                                            : 'border border-white/10 text-gray-400 hover:text-white'
                                    }`}
                                >
                                    {pageIdx + 1}
                                </button>
                            );
                        })}
                        <button
                            type="button"
                            disabled={safePage >= pageCount - 1}
                            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                            className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-black text-gray-400 disabled:opacity-30 hover:text-white"
                        >
                            →
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EventActivityLog;
