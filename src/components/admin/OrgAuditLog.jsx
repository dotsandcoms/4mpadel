import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { ScrollText, RefreshCw, CheckCircle2, XCircle, UserPlus, UserMinus, Edit3, Trophy, Building, ShieldCheck, ChevronDown, Layers3 } from 'lucide-react';

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
    'event.created':       { label: 'Event Created',      cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20', Icon: Trophy },
    'event.updated':       { label: 'Event Updated',      cls: 'text-padel-green bg-padel-green/10 border-padel-green/20', Icon: Edit3 },
    'event.deleted':       { label: 'Event Deleted',      cls: 'text-red-400 bg-red-500/10 border-red-500/20', Icon: XCircle },
    'division.created':    { label: 'Division Added',     cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20', Icon: Layers3 },
    'division.updated':    { label: 'Division Updated',   cls: 'text-padel-green bg-padel-green/10 border-padel-green/20', Icon: Layers3 },
    'division.deleted':    { label: 'Division Removed',   cls: 'text-red-400 bg-red-500/10 border-red-500/20', Icon: Layers3 },
    'event.sanctioned':    { label: 'Event Sanctioned',   cls: 'text-padel-green bg-padel-green/10 border-padel-green/20', Icon: CheckCircle2 },
    'event.rejected':      { label: 'Event Rejected',     cls: 'text-red-400 bg-red-500/10 border-red-500/20', Icon: XCircle },
    'event.pending':       { label: 'Event Re-Pending',   cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20', Icon: Trophy },
    'amendment.submitted': { label: 'Amendment In',       cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20', Icon: Edit3 },
    'amendment.approved':  { label: 'Amendment Applied',  cls: 'text-padel-green bg-padel-green/10 border-padel-green/20', Icon: CheckCircle2 },
    'amendment.rejected':  { label: 'Amendment Declined', cls: 'text-red-400 bg-red-500/10 border-red-500/20', Icon: XCircle },
};

const FIELD_LABELS = {
    event_name: 'Event name', start_date: 'Start date', end_date: 'End date', start_time: 'Start time', end_time: 'End time',
    event_dates: 'Display dates', venue: 'Venue', venue_ids: 'Clubs / venues', address: 'Address', city: 'City', description: 'Description',
    entry_fee: 'Entry fee', registration_deadline: 'Registration deadline', registration_open_date: 'Registration opens',
    is_visible: 'Visible on website', featured: 'Featured event', show_in_recent_results: 'Show in recent results',
    sapa_status: 'SAPA tier', federation_id: 'Federation', federation_sanction_status: 'Federation sanction status',
    court_type: 'Court type', number_of_courts: 'Number of courts', match_balls: 'Match balls', poster_url: 'Poster', cover_image: 'Cover image',
    name: 'Division name', max_entries: 'Maximum entries', max_players: 'Maximum players', license_required: 'Licence required',
};

const formatValue = (value) => {
    if (value === null || value === undefined || value === '') return 'Not set';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

const summarise = (row) => {
    const d = row.details || {};
    if (row.action?.startsWith('division.')) {
        return `${d.event_name || 'Event'} · ${d.division_name || 'Division'}`;
    }
    if (row.action === 'event.updated') {
        const count = Object.keys(d.changes || {}).length;
        return `${d.event_name || 'Event'}${count ? ` · ${count} field${count === 1 ? '' : 's'}` : ''}`;
    }
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
    const [expandedId, setExpandedId] = useState(null);

    const fetchRows = async (pageIdx = 0, entityFilter = filter) => {
        setLoading(true);
        try {
            let query = supabase
                .from('org_audit_log')
                .select('*')
                .order('created_at', { ascending: false })
                .range(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE); // +1 row to detect more
            if (entityFilter !== 'all') {
                // Accept both spellings so historical audit rows still filter correctly
                query = entityFilter === 'organisation'
                    ? query.in('entity_type', ['organisation', 'organization'])
                    : entityFilter === 'event'
                        ? query.in('entity_type', ['event', 'division'])
                        : query.eq('entity_type', entityFilter);
            }
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
                    {['all', 'organisation', 'member', 'event'].map(f => (
                        <button
                            key={f}
                            onClick={() => { setFilter(f); setPage(0); }}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${filter === f ? 'bg-padel-green text-black' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                        >
                            {f === 'all' ? 'All' : f === 'organisation' ? 'Orgs' : f + 's'}
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
                <div
                    className={`space-y-1.5 ${
                        embedded
                            ? 'max-h-[min(420px,50vh)] overflow-y-auto overscroll-contain custom-scrollbar pr-1 -mr-1'
                            : 'max-h-[520px] overflow-y-auto overscroll-contain custom-scrollbar pr-1'
                    }`}
                >
                    {rows.map((row) => {
                        const meta = ACTION_META[row.action] || { label: row.action, cls: 'text-gray-400 bg-white/5 border-white/10', Icon: ScrollText };
                        const changes = row.details?.changes || {};
                        const canExpand = Object.keys(changes).length > 0;
                        const expanded = expandedId === row.id;
                        return (
                            <div key={row.id} className="overflow-hidden rounded-xl border border-white/5 bg-black/25">
                                <button
                                    type="button"
                                    disabled={!canExpand}
                                    onClick={() => canExpand && setExpandedId(expanded ? null : row.id)}
                                    className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left ${canExpand ? 'cursor-pointer hover:bg-white/[0.03]' : 'cursor-default'}`}
                                >
                                    <span className={`inline-flex items-center gap-1.5 shrink-0 border px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${meta.cls}`}>
                                        <meta.Icon size={11} /> {meta.label}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-xs text-gray-300">{summarise(row)}</span>
                                    <span className="hidden max-w-[160px] shrink-0 truncate text-[10px] text-gray-500 sm:block" title={row.actor_email}>{row.actor_email}</span>
                                    <span className="shrink-0 whitespace-nowrap text-[10px] text-gray-600">{new Date(row.created_at).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                    {canExpand && <ChevronDown size={14} className={`shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
                                </button>
                                {expanded && (
                                    <div className="border-t border-white/5 px-3.5 py-3">
                                        <div className="mb-2 grid grid-cols-[minmax(110px,.7fr)_1fr_1fr] gap-3 px-2 text-[9px] font-black uppercase tracking-wider text-gray-600">
                                            <span>Field</span><span>Before</span><span>After</span>
                                        </div>
                                        <div className="space-y-1">
                                            {Object.entries(changes).map(([field, change]) => (
                                                <div key={field} className="grid grid-cols-[minmax(110px,.7fr)_1fr_1fr] gap-3 rounded-lg bg-white/[0.025] px-2 py-2 text-[11px]">
                                                    <span className="font-bold text-gray-300">{FIELD_LABELS[field] || field.replaceAll('_', ' ')}</span>
                                                    <span className="break-words text-gray-500">{formatValue(change?.from)}</span>
                                                    <span className="break-words text-white">{formatValue(change?.to)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
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
