import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../supabaseClient';
import { sendEmail } from '../../utils/emails';
import { toast } from 'sonner';
import {
    Landmark, Plus, RefreshCw, Users, Building, Trophy, Check, X,
    Edit3, Link2, Save, Loader2, ExternalLink, AlertCircle, Upload, Trash2,
    Image as ImageIcon, ChevronDown,
} from 'lucide-react';
import FederationMembersManager from './FederationMembersManager';

/**
 * Collapsible admin section — matches OrganisationManager pattern.
 */
const CollapsibleSection = ({
    open,
    onToggle,
    title,
    icon: Icon,
    iconClassName = 'text-padel-green',
    count,
    borderClassName = 'border-white/10',
    actions,
    children,
}) => (
    <div className={`bg-white/[0.02] border ${borderClassName} backdrop-blur-md rounded-2xl shadow-xl overflow-hidden`}>
        <div className="flex items-center gap-2 p-4 md:p-5">
            <button
                type="button"
                onClick={onToggle}
                className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left hover:opacity-90 transition-opacity cursor-pointer"
            >
                <h3 className="text-base md:text-lg font-bold text-white flex items-center gap-2 min-w-0 flex-wrap">
                    {Icon && <Icon size={18} className={`shrink-0 ${iconClassName}`} />}
                    <span>{title}{count !== undefined ? ` (${count})` : ''}</span>
                </h3>
                <ChevronDown
                    size={18}
                    className={`text-gray-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {actions && (
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {actions}
                </div>
            )}
        </div>
        <AnimatePresence initial={false}>
            {open && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                >
                    <div className="px-4 md:px-5 pb-5 border-t border-white/5 pt-4 space-y-4">
                        {children}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    </div>
);

const emptyForm = () => ({
    name: '',
    short_name: '',
    slug: '',
    about: '',
    website_url: '',
    brand_color: '#1B5E3B',
    status: 'draft',
    contact_email: '',
    contact_phone: '',
    whatsapp_number: '',
    logo_url: '',
    cover_image_url: '',
    is_national_governing_body: false,
    verified: false,
    rankedin_events_org_id: '',
    rankedin_rankings_org_id: '',
    personnel: [],
    committees: [],
});

const slugify = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const emptyPerson = () => ({ name: '', role: '' });
const emptyCommittee = () => ({ name: '', membersText: '' });

const PERSONNEL_ROLE_OPTIONS = [
    'President',
    'Vice President',
    'Chairperson',
    'Deputy Chairperson',
    'Secretary',
    'Treasurer',
    'CEO',
    'COO',
    'Director',
    'Board Member',
    'Exco Member',
    'Technical Director',
    'High Performance Director',
    'Juniors Director',
    'Development Director',
    'Marketing & Media',
    'Legal Advisor',
    'Other',
];

/**
 * Role options for a personnel row, preserving any custom/legacy value.
 * @param {string} currentRole
 */
const roleOptionsForPerson = (currentRole) => {
    const role = (currentRole || '').trim();
    if (role && !PERSONNEL_ROLE_OPTIONS.includes(role)) {
        return [role, ...PERSONNEL_ROLE_OPTIONS];
    }
    return PERSONNEL_ROLE_OPTIONS;
};

/**
 * Normalise stored personnel rows for the form.
 * @param {unknown} list
 */
const normalisePersonnel = (list) => {
    if (!Array.isArray(list)) return [];
    return list.map((p) => ({
        name: p?.name || p?.title || '',
        role: p?.role || p?.position || '',
    }));
};

/**
 * Normalise stored committee rows for the form (members as editable text).
 * @param {unknown} list
 */
const normaliseCommittees = (list) => {
    if (!Array.isArray(list)) return [];
    return list.map((c) => ({
        name: c?.name || c?.title || '',
        membersText: Array.isArray(c?.members)
            ? c.members.join(', ')
            : (c?.members || ''),
    }));
};

/**
 * Persist committees with members as a string array.
 * @param {{ name: string, membersText: string }[]} list
 */
const serialiseCommittees = (list) => (list || [])
    .filter((c) => (c.name || '').trim() || (c.membersText || '').trim())
    .map((c) => ({
        name: (c.name || '').trim(),
        members: String(c.membersText || '')
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean),
    }));

/**
 * Platform Federations admin — sits above Organisations.
 * Profile CRUD, members, manual org assignment, federation-scoped sanctioning.
 */
const FederationManager = ({ permissions }) => {
    const isSuper = permissions?.role === 'super_admin';
    const [loading, setLoading] = useState(true);
    const [federations, setFederations] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [form, setForm] = useState(emptyForm());
    const [saving, setSaving] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [membersOpen, setMembersOpen] = useState(false);
    const [uploading, setUploading] = useState(null);

    const [linkedOrgs, setLinkedOrgs] = useState([]);
    const [unassignedOrgs, setUnassignedOrgs] = useState([]);
    const [assignOrgId, setAssignOrgId] = useState('');

    const [pendingOrgs, setPendingOrgs] = useState([]);
    const [pendingEvents, setPendingEvents] = useState([]);
    const [pendingAmendments, setPendingAmendments] = useState([]);
    const [sectionOpen, setSectionOpen] = useState({
        profile: true,
        personnel: false,
        committees: false,
        linkedOrgs: false,
        sanctioning: false,
    });

    const toggleSection = (key) => {
        setSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const pendingSanctionCount = pendingOrgs.length + pendingEvents.length + pendingAmendments.length;

    const selected = useMemo(
        () => federations.find((f) => f.id === selectedId) || null,
        [federations, selectedId],
    );

    const loadFederations = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('federations')
                .select('*')
                .order('name', { ascending: true });
            if (error) throw error;
            setFederations(data || []);
            if (!selectedId && data?.length) {
                setSelectedId(data[0].id);
            }
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load federations');
        } finally {
            setLoading(false);
        }
    }, [selectedId]);

    const loadFederationScoped = useCallback(async (federationId) => {
        if (!federationId) {
            setLinkedOrgs([]);
            setUnassignedOrgs([]);
            setPendingOrgs([]);
            setPendingEvents([]);
            setPendingAmendments([]);
            return;
        }
        try {
            const [
                { data: linked },
                { data: unassigned },
                { data: pendingO },
            ] = await Promise.all([
                supabase
                    .from('organisations')
                    .select('id, name, slug, status, contact_email, created_by, verified, sapa_sanctioned')
                    .eq('federation_id', federationId)
                    .order('name'),
                supabase
                    .from('organisations')
                    .select('id, name, slug, status')
                    .is('federation_id', null)
                    .order('name'),
                supabase
                    .from('organisations')
                    .select('id, name, slug, status, contact_email, created_by')
                    .eq('federation_id', federationId)
                    .eq('status', 'pending')
                    .order('created_at', { ascending: false }),
            ]);

            setLinkedOrgs(linked || []);
            setUnassignedOrgs(unassigned || []);
            setPendingOrgs(pendingO || []);

            const orgIds = (linked || []).map((o) => o.id);
            if (orgIds.length === 0) {
                setPendingEvents([]);
                setPendingAmendments([]);
                if ((pendingO || []).length > 0) {
                    setSectionOpen((prev) => ({ ...prev, sanctioning: true }));
                }
                return;
            }

            const [{ data: events }, { data: amendments }] = await Promise.all([
                supabase
                    .from('calendar')
                    .select('id, event_name, start_date, organisation_id, sanction_status, slug')
                    .in('organisation_id', orgIds)
                    .eq('sanction_status', 'pending')
                    .order('start_date', { ascending: true }),
                supabase
                    .from('calendar')
                    .select('id, event_name, start_date, organisation_id, pending_changes_status, pending_changes_notes, pending_changes, slug')
                    .in('organisation_id', orgIds)
                    .eq('pending_changes_status', 'pending')
                    .order('start_date', { ascending: true }),
            ]);
            setPendingEvents(events || []);
            setPendingAmendments(amendments || []);
            if ((pendingO || []).length + (events || []).length + (amendments || []).length > 0) {
                setSectionOpen((prev) => ({ ...prev, sanctioning: true }));
            }
        } catch (err) {
            console.error(err);
            toast.error('Failed to load federation organisations / sanctions');
        }
    }, []);

    useEffect(() => {
        loadFederations();
    }, [loadFederations]);

    useEffect(() => {
        if (selected) {
            setForm({
                ...emptyForm(),
                ...selected,
                personnel: normalisePersonnel(selected.personnel),
                committees: normaliseCommittees(selected.committees),
                rankedin_events_org_id: selected.rankedin_events_org_id || '',
                rankedin_rankings_org_id: selected.rankedin_rankings_org_id || '',
            });
            setIsCreating(false);
            loadFederationScoped(selected.id);
            setSectionOpen((prev) => ({ ...prev, profile: true }));
        }
    }, [selected, loadFederationScoped]);

    const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const updatePerson = (idx, key, value) => {
        setForm((prev) => ({
            ...prev,
            personnel: (prev.personnel || []).map((p, i) => (i === idx ? { ...p, [key]: value } : p)),
        }));
    };

    const updateCommittee = (idx, key, value) => {
        setForm((prev) => ({
            ...prev,
            committees: (prev.committees || []).map((c, i) => (i === idx ? { ...c, [key]: value } : c)),
        }));
    };

    /**
     * Upload federation logo or cover to profile-pics storage.
     * @param {React.ChangeEvent<HTMLInputElement>} e
     * @param {'logo'|'cover'} kind
     */
    const handleUpload = async (e, kind) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const maxMb = kind === 'logo' ? 2 : 5;
        if (file.size > maxMb * 1024 * 1024) {
            return toast.error(`${kind === 'logo' ? 'Logo' : 'Cover'} must be under ${maxMb}MB.`);
        }
        setUploading(kind);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const folder = kind === 'logo' ? 'logos' : 'covers';
            const idPart = selectedId || form.slug || 'new';
            const path = `federations/${folder}/${idPart}_${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from('profile-pics').upload(path, file, {
                cacheControl: '3600',
                upsert: true,
            });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('profile-pics').getPublicUrl(path);
            updateField(kind === 'logo' ? 'logo_url' : 'cover_image_url', publicUrl);
            toast.success(`${kind === 'logo' ? 'Logo' : 'Cover image'} uploaded — save to keep`);
        } catch (err) {
            toast.error(`Upload failed: ${err.message}`);
        } finally {
            setUploading(null);
            e.target.value = '';
        }
    };

    const startCreate = () => {
        setIsCreating(true);
        setSelectedId(null);
        setForm(emptyForm());
        setLinkedOrgs([]);
        setPendingOrgs([]);
        setPendingEvents([]);
        setPendingAmendments([]);
    };

    const handleSave = async () => {
        if (!form.name.trim() || !form.slug.trim()) {
            toast.error('Name and slug are required');
            return;
        }
        const personnel = (form.personnel || [])
            .filter((p) => (p.name || '').trim() || (p.role || '').trim())
            .map((p) => ({ name: (p.name || '').trim(), role: (p.role || '').trim() }));
        const committees = serialiseCommittees(form.committees);
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                short_name: form.short_name?.trim() || null,
                slug: slugify(form.slug),
                about: form.about || null,
                website_url: form.website_url || null,
                brand_color: form.brand_color || null,
                status: form.status || 'draft',
                contact_email: form.contact_email || null,
                contact_phone: form.contact_phone || null,
                whatsapp_number: form.whatsapp_number || null,
                logo_url: form.logo_url || null,
                cover_image_url: form.cover_image_url || null,
                is_national_governing_body: !!form.is_national_governing_body,
                verified: !!form.verified,
                rankedin_events_org_id: form.rankedin_events_org_id || null,
                rankedin_rankings_org_id: form.rankedin_rankings_org_id || null,
                personnel,
                committees,
                updated_at: new Date().toISOString(),
            };

            if (isCreating || !selectedId) {
                const { data, error } = await supabase.from('federations').insert([payload]).select('*').single();
                if (error) throw error;
                toast.success('Federation created');
                setFederations((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                setSelectedId(data.id);
                setIsCreating(false);
            } else {
                const { data, error } = await supabase
                    .from('federations')
                    .update(payload)
                    .eq('id', selectedId)
                    .select('*')
                    .single();
                if (error) throw error;
                toast.success('Federation saved');
                setFederations((prev) => prev.map((f) => (f.id === data.id ? data : f)));
            }
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleAssignOrg = async () => {
        if (!selectedId || !assignOrgId) return;
        try {
            const { error } = await supabase
                .from('organisations')
                .update({ federation_id: selectedId })
                .eq('id', assignOrgId);
            if (error) throw error;
            toast.success('Organisation linked to federation');
            setAssignOrgId('');
            loadFederationScoped(selectedId);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleUnlinkOrg = async (orgId) => {
        try {
            const { error } = await supabase
                .from('organisations')
                .update({ federation_id: null })
                .eq('id', orgId);
            if (error) throw error;
            toast.success('Organisation unlinked');
            loadFederationScoped(selectedId);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleApproveOrg = async (org) => {
        try {
            const { error } = await supabase
                .from('organisations')
                .update({
                    status: 'approved',
                    approved_at: new Date().toISOString(),
                    verified: true,
                    sapa_sanctioned: true,
                })
                .eq('id', org.id);
            if (error) throw error;

            if (org.contact_email) {
                try {
                    await supabase.from('organisation_members').upsert({
                        organisation_id: org.id,
                        player_id: org.created_by || null,
                        user_email: org.contact_email,
                        role: 'owner',
                    }, { onConflict: 'organisation_id,user_email' });
                } catch (e) {
                    console.warn(e);
                }
                sendEmail(org.contact_email, 'org_approved', { orgName: org.name });
            }
            toast.success(`Approved ${org.name}`);
            loadFederationScoped(selectedId);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleRejectOrg = async (org) => {
        const notes = window.prompt('Rejection notes (optional):') || null;
        try {
            const { error } = await supabase
                .from('organisations')
                .update({ status: 'rejected', rejection_notes: notes })
                .eq('id', org.id);
            if (error) throw error;
            toast.success('Organisation rejected');
            loadFederationScoped(selectedId);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleApproveEvent = async (event) => {
        try {
            const { error } = await supabase
                .from('calendar')
                .update({ sanction_status: 'approved', is_visible: true })
                .eq('id', event.id);
            if (error) throw error;
            toast.success(`Sanctioned ${event.event_name}`);
            loadFederationScoped(selectedId);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleRejectEvent = async (event) => {
        const notes = window.prompt('Rejection notes (optional):') || null;
        try {
            const { error } = await supabase
                .from('calendar')
                .update({ sanction_status: 'rejected', rejection_notes: notes })
                .eq('id', event.id);
            if (error) throw error;
            toast.success('Event rejected');
            loadFederationScoped(selectedId);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleApproveAmendment = async (event) => {
        try {
            const changes = event.pending_changes || {};
            const { error } = await supabase
                .from('calendar')
                .update({
                    ...changes,
                    pending_changes: null,
                    pending_changes_status: null,
                    pending_changes_notes: null,
                    pending_changes_submitted_at: null,
                })
                .eq('id', event.id);
            if (error) throw error;
            toast.success('Amendment approved');
            loadFederationScoped(selectedId);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleRejectAmendment = async (event) => {
        try {
            const { error } = await supabase
                .from('calendar')
                .update({
                    pending_changes: null,
                    pending_changes_status: 'rejected',
                    pending_changes_notes: event.pending_changes_notes || null,
                })
                .eq('id', event.id);
            if (error) throw error;
            toast.success('Amendment rejected');
            loadFederationScoped(selectedId);
        } catch (err) {
            toast.error(err.message);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                <Loader2 className="animate-spin" size={18} /> Loading federations…
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                        <Landmark className="text-padel-green" size={22} /> Federations
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Parent layer above Organisations. Sanctioning is federation-scoped when an org is linked.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => loadFederations()}
                        className="px-3 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-bold flex items-center gap-2"
                    >
                        <RefreshCw size={14} /> Refresh
                    </button>
                    {isSuper && (
                        <button
                            type="button"
                            onClick={startCreate}
                            className="px-3 py-2 rounded-xl bg-padel-green text-black text-sm font-black flex items-center gap-2"
                        >
                            <Plus size={14} /> New Federation
                        </button>
                    )}
                </div>
            </div>

            <div className="grid lg:grid-cols-[240px_1fr] gap-4">
                <aside className="bg-white/[0.02] border border-white/10 rounded-2xl p-3 space-y-1 max-h-[70vh] overflow-y-auto">
                    {federations.length === 0 && !isCreating && (
                        <p className="text-xs text-gray-500 p-3">No federations yet. Apply the migration and seed SAPA.</p>
                    )}
                    {federations.map((f) => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => { setSelectedId(f.id); setIsCreating(false); }}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2.5 ${
                                selectedId === f.id && !isCreating
                                    ? 'bg-padel-green/15 text-padel-green border border-padel-green/30'
                                    : 'text-gray-300 hover:bg-white/5 border border-transparent'
                            }`}
                        >
                            {f.logo_url ? (
                                <img
                                    src={f.logo_url}
                                    alt=""
                                    className="w-9 h-9 rounded-lg object-cover bg-white/10 border border-white/10 shrink-0"
                                />
                            ) : (
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                                    selectedId === f.id && !isCreating
                                        ? 'bg-padel-green/10 border-padel-green/20 text-padel-green'
                                        : 'bg-white/5 border-white/10 text-gray-500'
                                }`}>
                                    <Landmark size={16} />
                                </div>
                            )}
                            <span className="min-w-0 flex-1">
                                <span className="block truncate">{f.short_name || f.name}</span>
                                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">{f.status}</span>
                            </span>
                        </button>
                    ))}
                </aside>

                <div className="space-y-4">
                    {(selected || isCreating) ? (
                        <>
                            <CollapsibleSection
                                open={sectionOpen.profile}
                                onToggle={() => toggleSection('profile')}
                                title={isCreating ? 'Create federation' : 'Federation profile'}
                                icon={Edit3}
                                actions={(
                                    <>
                                        {!isCreating && selected && (
                                            <>
                                                <a
                                                    href={`/federations/${selected.slug}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold text-gray-300 hover:bg-white/5 flex items-center gap-1"
                                                >
                                                    <ExternalLink size={12} /> Public
                                                </a>
                                                <button
                                                    type="button"
                                                    onClick={() => setMembersOpen(true)}
                                                    className="px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold text-gray-300 hover:bg-white/5 flex items-center gap-1"
                                                >
                                                    <Users size={12} /> Members
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            disabled={saving || !!uploading}
                                            onClick={handleSave}
                                            className="px-3 py-1.5 rounded-lg bg-padel-green text-black text-xs font-black flex items-center gap-1 disabled:opacity-50"
                                        >
                                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                                            Save
                                        </button>
                                    </>
                                )}
                            >
                                <div className="grid md:grid-cols-2 gap-3">
                                    {[
                                        ['name', 'Name'],
                                        ['short_name', 'Short name'],
                                        ['slug', 'Slug'],
                                        ['website_url', 'Website'],
                                        ['contact_email', 'Contact email'],
                                        ['contact_phone', 'Contact phone'],
                                        ['whatsapp_number', 'WhatsApp'],
                                        ['brand_color', 'Brand colour'],
                                        ['rankedin_events_org_id', 'RankedIn events org ID'],
                                        ['rankedin_rankings_org_id', 'RankedIn rankings org ID'],
                                    ].map(([key, label]) => (
                                        <label key={key} className="block text-[10px] font-black uppercase tracking-wider text-gray-500">
                                            {label}
                                            <input
                                                value={form[key] || ''}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    updateField(key, v);
                                                    if (key === 'name' && isCreating && !form.slug) {
                                                        updateField('slug', slugify(v));
                                                    }
                                                }}
                                                className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-medium normal-case tracking-normal"
                                            />
                                        </label>
                                    ))}
                                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">
                                        Status
                                        <select
                                            value={form.status}
                                            onChange={(e) => updateField('status', e.target.value)}
                                            className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-medium normal-case tracking-normal"
                                        >
                                            <option value="draft">draft</option>
                                            <option value="published">published</option>
                                            <option value="archived">archived</option>
                                        </select>
                                    </label>
                                    <div className="flex items-center gap-4 pt-6">
                                        <label className="flex items-center gap-2 text-xs text-gray-300 font-bold">
                                            <input
                                                type="checkbox"
                                                checked={!!form.verified}
                                                onChange={(e) => updateField('verified', e.target.checked)}
                                            />
                                            Verified
                                        </label>
                                        <label className="flex items-center gap-2 text-xs text-gray-300 font-bold">
                                            <input
                                                type="checkbox"
                                                checked={!!form.is_national_governing_body}
                                                onChange={(e) => updateField('is_national_governing_body', e.target.checked)}
                                            />
                                            National governing body
                                        </label>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-3">
                                    <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                                        {form.logo_url ? (
                                            <img src={form.logo_url} alt="logo" className="w-16 h-16 rounded-2xl object-cover bg-white border border-white/10 shrink-0" />
                                        ) : (
                                            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                                <Landmark size={24} />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-white">Federation Logo</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">Square, max 2MB</p>
                                            <div className="flex gap-2 mt-2">
                                                <label className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer transition-all">
                                                    <Upload size={11} /> {uploading === 'logo' ? 'Uploading…' : 'Upload'}
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={(e) => handleUpload(e, 'logo')}
                                                        disabled={uploading === 'logo'}
                                                    />
                                                </label>
                                                {form.logo_url && (
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('logo_url', '')}
                                                        className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                                        {form.cover_image_url ? (
                                            <img src={form.cover_image_url} alt="cover" className="w-24 h-16 rounded-xl object-cover border border-white/10 shrink-0" />
                                        ) : (
                                            <div className="w-24 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                                <ImageIcon size={22} />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-white">Hero Cover Image</p>
                                            <p className="text-[10px] text-gray-500 mt-0.5">Wide (16:9), max 5MB</p>
                                            <div className="flex gap-2 mt-2">
                                                <label className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer transition-all">
                                                    <Upload size={11} /> {uploading === 'cover' ? 'Uploading…' : 'Upload'}
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="hidden"
                                                        onChange={(e) => handleUpload(e, 'cover')}
                                                        disabled={uploading === 'cover'}
                                                    />
                                                </label>
                                                {form.cover_image_url && (
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('cover_image_url', '')}
                                                        className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-500">
                                    About
                                    <textarea
                                        value={form.about || ''}
                                        onChange={(e) => updateField('about', e.target.value)}
                                        rows={3}
                                        className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-medium normal-case tracking-normal"
                                    />
                                </label>
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.personnel}
                                onToggle={() => toggleSection('personnel')}
                                title="Key Personnel (Exco)"
                                icon={Users}
                                count={(form.personnel || []).length}
                                actions={(
                                    <button
                                        type="button"
                                        onClick={() => {
                                            updateField('personnel', [...(form.personnel || []), emptyPerson()]);
                                            setSectionOpen((prev) => ({ ...prev, personnel: true }));
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Add
                                    </button>
                                )}
                            >
                                <p className="text-[11px] text-gray-500 -mt-1">
                                    Executive committee members shown on the public federation page — e.g. President, Secretary, Treasurer.
                                </p>
                                {(form.personnel || []).length === 0 ? (
                                    <p className="text-sm text-gray-600">No personnel added yet.</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {(form.personnel || []).map((person, idx) => (
                                            <li key={idx} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 items-center bg-black/30 border border-white/5 rounded-xl p-2.5">
                                                <input
                                                    value={person.name || ''}
                                                    onChange={(e) => updatePerson(idx, 'name', e.target.value)}
                                                    placeholder="Full name"
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                                />
                                                <select
                                                    value={person.role || ''}
                                                    onChange={(e) => updatePerson(idx, 'role', e.target.value)}
                                                    className={`w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm cursor-pointer ${
                                                        person.role ? 'text-white' : 'text-gray-500'
                                                    }`}
                                                >
                                                    <option value="" disabled className="bg-[#1a1a1a] text-gray-500">
                                                        Select role
                                                    </option>
                                                    {roleOptionsForPerson(person.role).map((role) => (
                                                        <option key={role} value={role} className="bg-[#1a1a1a] text-white">
                                                            {role}
                                                        </option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => updateField('personnel', (form.personnel || []).filter((_, i) => i !== idx))}
                                                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                                                    title="Remove"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.committees}
                                onToggle={() => toggleSection('committees')}
                                title="Committees"
                                icon={Users}
                                count={(form.committees || []).length}
                                actions={(
                                    <button
                                        type="button"
                                        onClick={() => {
                                            updateField('committees', [...(form.committees || []), emptyCommittee()]);
                                            setSectionOpen((prev) => ({ ...prev, committees: true }));
                                        }}
                                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Add
                                    </button>
                                )}
                            >
                                <p className="text-[11px] text-gray-500 -mt-1">
                                    Working groups under the federation — e.g. Rules, Juniors, High Performance. List members separated by commas.
                                </p>
                                {(form.committees || []).length === 0 ? (
                                    <p className="text-sm text-gray-600">No committees added yet.</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {(form.committees || []).map((committee, idx) => (
                                            <li key={idx} className="space-y-2 bg-black/30 border border-white/5 rounded-xl p-2.5">
                                                <div className="flex gap-2 items-center">
                                                    <input
                                                        value={committee.name || ''}
                                                        onChange={(e) => updateCommittee(idx, 'name', e.target.value)}
                                                        placeholder="Committee name (e.g. Rules Committee)"
                                                        className="flex-1 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => updateField('committees', (form.committees || []).filter((_, i) => i !== idx))}
                                                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg shrink-0"
                                                        title="Remove"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                                <input
                                                    value={committee.membersText || ''}
                                                    onChange={(e) => updateCommittee(idx, 'membersText', e.target.value)}
                                                    placeholder="Members — Jane Doe, John Smith, …"
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CollapsibleSection>

                            {!isCreating && selectedId && (
                                <>
                                    <CollapsibleSection
                                        open={sectionOpen.linkedOrgs}
                                        onToggle={() => toggleSection('linkedOrgs')}
                                        title="Linked organisations"
                                        icon={Building}
                                        count={linkedOrgs.length}
                                    >
                                        <div className="flex flex-wrap gap-2">
                                            <select
                                                value={assignOrgId}
                                                onChange={(e) => setAssignOrgId(e.target.value)}
                                                className="flex-1 min-w-[200px] bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                                            >
                                                <option value="">Assign unlinked organisation…</option>
                                                {unassignedOrgs.map((o) => (
                                                    <option key={o.id} value={o.id}>{o.name} ({o.status})</option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={handleAssignOrg}
                                                disabled={!assignOrgId}
                                                className="px-3 py-2 rounded-xl bg-white/10 text-white text-sm font-bold flex items-center gap-1 disabled:opacity-40"
                                            >
                                                <Link2 size={14} /> Assign
                                            </button>
                                        </div>
                                        {linkedOrgs.length === 0 ? (
                                            <p className="text-sm text-gray-500">No organisations linked yet — assign manually.</p>
                                        ) : (
                                            <ul className="divide-y divide-white/5 border border-white/10 rounded-xl overflow-hidden">
                                                {linkedOrgs.map((o) => (
                                                    <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-black/20">
                                                        <div className="min-w-0">
                                                            <p className="text-sm text-white font-bold truncate">{o.name}</p>
                                                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{o.status}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUnlinkOrg(o.id)}
                                                            className="text-[10px] font-black uppercase tracking-wider text-red-400 hover:text-red-300"
                                                        >
                                                            Unlink
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </CollapsibleSection>

                                    <CollapsibleSection
                                        open={sectionOpen.sanctioning}
                                        onToggle={() => toggleSection('sanctioning')}
                                        title="Sanctioning inbox"
                                        icon={AlertCircle}
                                        iconClassName="text-amber-400"
                                        count={pendingSanctionCount}
                                        borderClassName="border-amber-500/20"
                                    >
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">
                                                Pending organisations ({pendingOrgs.length})
                                            </p>
                                            {pendingOrgs.length === 0 ? (
                                                <p className="text-sm text-gray-600">None</p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {pendingOrgs.map((o) => (
                                                        <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2">
                                                            <span className="text-sm text-white font-bold">{o.name}</span>
                                                            <div className="flex gap-2">
                                                                <button type="button" onClick={() => handleApproveOrg(o)} className="px-2 py-1 rounded-lg bg-padel-green/20 text-padel-green text-xs font-black flex items-center gap-1">
                                                                    <Check size={12} /> Approve
                                                                </button>
                                                                <button type="button" onClick={() => handleRejectOrg(o)} className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs font-black flex items-center gap-1">
                                                                    <X size={12} /> Reject
                                                                </button>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1">
                                                <Trophy size={12} /> Pending events ({pendingEvents.length})
                                            </p>
                                            {pendingEvents.length === 0 ? (
                                                <p className="text-sm text-gray-600">None</p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {pendingEvents.map((ev) => (
                                                        <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2">
                                                            <span className="text-sm text-white font-bold">{ev.event_name}</span>
                                                            <div className="flex gap-2">
                                                                <button type="button" onClick={() => handleApproveEvent(ev)} className="px-2 py-1 rounded-lg bg-padel-green/20 text-padel-green text-xs font-black flex items-center gap-1">
                                                                    <Check size={12} /> Sanction
                                                                </button>
                                                                <button type="button" onClick={() => handleRejectEvent(ev)} className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs font-black flex items-center gap-1">
                                                                    <X size={12} /> Reject
                                                                </button>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">
                                                Pending amendments ({pendingAmendments.length})
                                            </p>
                                            {pendingAmendments.length === 0 ? (
                                                <p className="text-sm text-gray-600">None</p>
                                            ) : (
                                                <ul className="space-y-2">
                                                    {pendingAmendments.map((ev) => (
                                                        <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 bg-black/30 border border-white/10 rounded-xl px-3 py-2">
                                                            <span className="text-sm text-white font-bold">{ev.event_name}</span>
                                                            <div className="flex gap-2">
                                                                <button type="button" onClick={() => handleApproveAmendment(ev)} className="px-2 py-1 rounded-lg bg-padel-green/20 text-padel-green text-xs font-black flex items-center gap-1">
                                                                    <Check size={12} /> Approve
                                                                </button>
                                                                <button type="button" onClick={() => handleRejectAmendment(ev)} className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs font-black flex items-center gap-1">
                                                                    <X size={12} /> Reject
                                                                </button>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </CollapsibleSection>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-10 text-center text-gray-500">
                            Select a federation or create one.
                        </div>
                    )}
                </div>
            </div>

            {membersOpen && selected && (
                <FederationMembersManager
                    federation={selected}
                    onClose={() => setMembersOpen(false)}
                />
            )}
        </div>
    );
};

export default FederationManager;
