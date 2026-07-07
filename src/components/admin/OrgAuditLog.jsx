import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { ScrollText, RefreshCw, CheckCircle2, XCircle, UserPlus, UserMinus, Edit3, Trophy, Building, ShieldCheck } from 'lucide-react';

const PAGE_SIZE = 30;

const ACTION_META = {
    'org.applied':         { label: 'Org Applied',        cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20', Icon: Building },
    'org.approved':        { label: 'Org Approved',       cls: 'text-padel-green bg-padel-green/10 border-padel-green/20', Icon: CheckCircle2 },
    'org.rejected':        { label: 'Org Rejected',       cls: 'text-red-400 bg-red-500/10 border-red-500/20', Icon: XCircle },
    'org.suspended':       { label: 'Org Suspended',      cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20', Icon: XCircle },
    'org.pending':         { label: 'Org Re-Pending',     cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20', Icon: Building },
    'org.badges_changed':  { label: 'Badges Changed',     cls: 'text-purple-400 bg-purple-500/10 border-purple-500/20', Icon: ShieldCheck },
    'org.profile_updated': { label: 'Profile Updated',    cls: 'text-gray-300 bg-white/5 border-white/10', Icon: Edit3 },
    'member.added':        { label: 'Member Added',       cls: 'text-padel-green bg-padel-green/10 border-padel-green/20', Icon: UserPlus },
    'member.role_changed': { label: 'Role Changed',       cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20', Icon: UserPlus },
    'member.removed':      { label: 'Member Removed',     cls: 'text-red-400 bg-red-500/10 border-red-500/20', Icon: UserMinus },
    'event.submitted':     { label: 'Event Submitted',    cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20', Icon: Trophy },
    'event.sanctioned':    { label: 'Event Sanctioned',   cls: 'text-padel-green bg-padel-green/10 border-padel-green/20', Icon: CheckCircle2 },
    'event.rejected':      { label: 'Event Rejected',     cls: 'text-red-400 bg-red-500/10 border-red-500/20', Icon: XCircle },
    'event.pending':       { label: 'Event Re-Pending',   cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20', Icon: Trophy },
    'amendment.submitted': { label: 'Amendment In',       cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20', Icon: Edit3 },
    'amendment.approved':  { label: 'Amendment Applied',  cls: 'text-padel-green bg-padel-green/10 border-padel-green/20', Icon: CheckCircle2 },
    'amendment.rejected':  { label: 'Amendment Declined', cls: 'text-red-400 bg-red-500/10 border-red-500/20', Icon: XCircle },
};

const summarise = (row) => {
    const d = row.details || {};
    switch (row.action) {
        case 'org.applied':
        case 'org.approved':
        case 'org.rejected':
        case 'org.suspended':
        case 'org.pending':
        case 'org.badges_changed':
            return d.name || '';
        case 'org.profile_updated':
            return `${d.name || ''} — ${(d.fields || []).join(', ')}`;
        case 'member.added':
        case 'member.removed':
            return `${d.member_email || ''} (${d.role || ''})`;
        case 'member.role_changed':
            return `${d.member_email || ''}: ${d.from} → ${d.to}`;
        default:
            return `${d.event_name || ''}${d.notes ? ` — "${d.notes}"` : ''}${d.tier && d.tier !== 'None' ? ` · ${d.tier}` : ''}`;
    }
};

/**
 * Immutable activity trail for all organisation actions.
 * Rows are written by DB triggers only — nothing here can be edited.
 */
const OrgAuditLog = ({ embedded = false }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [filter, setFilter] = useState('all'); // all | org | member | event

    const fetchRows = async (pageIdx = 0, entityFilter = filter) => {
        setLoading(true);
        try {
            let query = supabase
                .from('org_audit_log')
                .select('*')
                .order('created_at', { ascending: false })
                .range(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE); // +1 row to detect more
            if (entityFilter !== 'all') query = query.eq('entity_type', entityFilter);
            const { data, error } = await query;
            if (error) throw error;
            setHasMore((data || []).length > PAGE_SIZE);
            setRows((data || []).slice(0, PAGE_SIZE));
        } catch (err) {
            console.error('Failed to load audit log:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRows(page, filter);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, filter]);

    const content = (
        <>
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${embedded ? '' : 'mb-5'}`}>
                {!embedded && (
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <ScrollText size={18} className="text-gray-400" />
                        Activity Log
                        <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">Immutable</span>
                    </h3>
                )}
                <div className={`flex items-center gap-2 ${embedded ? 'w-full justify-between mb-4' : ''}`}>
                    {['all', 'organization', 'member', 'event'].map(f => (
                        <button
                            key={f}
                            onClick={() => { setFilter(f); setPage(0); }}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${filter === f ? 'bg-padel-green text-black' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                        >
                            {f === 'all' ? 'All' : f + 's'}
                        </button>
                    ))}
                    <button onClick={() => fetchRows(page, filter)} className="p-2 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer" title="Refresh">
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {loading && rows.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">Loading activity...</p>
            ) : rows.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">No activity recorded yet.</p>
            ) : (
                <div className="space-y-1.5">
                    {rows.map((row) => {
                        const meta = ACTION_META[row.action] || { label: row.action, cls: 'text-gray-400 bg-white/5 border-white/10', Icon: ScrollText };
                        return (
                            <div key={row.id} className="flex items-center gap-3 bg-black/25 border border-white/5 px-3.5 py-2.5 rounded-xl">
                                <span className={`inline-flex items-center gap-1.5 shrink-0 border px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${meta.cls}`}>
                                    <meta.Icon size={11} /> {meta.label}
                                </span>
                                <span className="text-xs text-gray-300 truncate flex-1">{summarise(row)}</span>
                                <span className="text-[10px] text-gray-500 shrink-0 hidden sm:block truncate max-w-[160px]" title={row.actor_email}>
                                    {row.actor_email}
                                </span>
                                <span className="text-[10px] text-gray-600 shrink-0 whitespace-nowrap">
                                    {new Date(row.created_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex justify-between items-center mt-4">
                <button
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    className="text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                    ← Newer
                </button>
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-600">Page {page + 1}</span>
                <button
                    disabled={!hasMore}
                    onClick={() => setPage(p => p + 1)}
                    className="text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                    Older →
                </button>
            </div>
        </>
    );

    if (embedded) return content;

    return (
        <div className="bg-white/[0.02] border border-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl">
            {content}
        </div>
    );
};

export default OrgAuditLog;
