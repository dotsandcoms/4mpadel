import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';
import {
    Building, Upload, Trash2, Plus, Save, Palette, Image as ImageIcon,
    Instagram, Facebook, Youtube, ExternalLink, Eye, ChevronLeft, ChevronRight,
    ChevronDown, AlertTriangle,
} from 'lucide-react';

const inputClass = 'w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-padel-green focus:outline-none transition-colors placeholder:text-gray-600';
const labelClass = 'block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest';

const COLOR_PRESETS = ['#9AE900', '#F97316', '#3B82F6', '#EF4444', '#A855F7', '#14B8A6', '#EAB308', '#EC4899'];

const ORG_TYPE_OPTIONS = [
    'Tournament Organiser',
    'League Organiser',
    'Corporate / Event Company',
    'Padel Association / Federation',
    'Other',
];

const LINKED_OPTIONS = [
    'Independent',
    'Linked to a Club / Group of Clubs',
];

const SAPA_INTENT_OPTIONS = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'not_sure', label: 'Not sure yet' },
];

const emptyContact = () => ({ role: '', name: '', email: '', phone: '', whatsapp: '' });
const emptySponsor = () => ({ name: '', tier: 'Official Partner', logo_url: '' });

const SPONSOR_TIER_OPTIONS = [
    'Title Sponsor',
    'Gold Partner',
    'Silver Partner',
    'Official Partner',
    'Supporting Partner',
];

const CONTACT_ROLE_OPTIONS = [
    'Founder',
    'Director',
    'Manager',
    'Operations Manager',
    'Tournament Director',
    'Tournament Referee',
    'Admin',
    'Registrations & Admin',
    'Media Contact',
    'Sponsorship Contact',
    'Club Manager',
    'General Enquiries',
    'Other',
];

/** Preserve legacy/custom roles already saved on the org profile. */
const roleOptionsForContact = (currentRole) => {
    const role = (currentRole || '').trim();
    if (role && !CONTACT_ROLE_OPTIONS.includes(role)) {
        return [role, ...CONTACT_ROLE_OPTIONS];
    }
    return CONTACT_ROLE_OPTIONS;
};

const orgTypeOptionsFor = (current) => {
    const value = (current || '').trim();
    if (value && !ORG_TYPE_OPTIONS.includes(value)) {
        return [value, ...ORG_TYPE_OPTIONS];
    }
    return ORG_TYPE_OPTIONS;
};

/**
 * Org portal / admin profile editor.
 * Multi-step accordion-style sections so editors only see one block at a time.
 */
const OrgProfileEditor = ({ org, onSaved, onDeleted, adminMode = false, canDelete = false }) => {
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [uploading, setUploading] = useState(null);
    const [step, setStep] = useState(0);
    const [openAccordion, setOpenAccordion] = useState(null);
    const [linkedAlbums, setLinkedAlbums] = useState([]);
    const [availableAlbums, setAvailableAlbums] = useState([]);
    const [albumToAdd, setAlbumToAdd] = useState('');
    const [albumsLoading, setAlbumsLoading] = useState(false);
    const [linkingAlbum, setLinkingAlbum] = useState(false);
    const [deleteConfirmName, setDeleteConfirmName] = useState('');

    const steps = useMemo(() => {
        const list = [];
        if (adminMode) list.push({ id: 'admin', title: 'Platform Admin' });
        list.push(
            { id: 'identity', title: 'Identity' },
            { id: 'branding', title: 'Branding' },
            { id: 'contact', title: 'Contact & Website' },
            { id: 'socials', title: 'Social Media' },
            { id: 'sponsors', title: 'Sponsors & Partners' },
            { id: 'media', title: 'Media Albums' },
            { id: 'contacts', title: 'Contact Directory' },
        );
        return list;
    }, [adminMode]);

    const fetchOrgAlbums = async (orgId) => {
        if (!orgId) return;
        setAlbumsLoading(true);
        try {
            const [{ data: linked, error: linkedErr }, { data: all, error: allErr }] = await Promise.all([
                supabase
                    .from('albums')
                    .select('id, title, slug, cover_image_url, album_date, is_active, is_featured')
                    .eq('organisation_id', orgId)
                    .is('parent_album_id', null)
                    .order('album_date', { ascending: false }),
                supabase
                    .from('albums')
                    .select('id, title, slug, album_date, organisation_id')
                    .is('parent_album_id', null)
                    .order('title', { ascending: true }),
            ]);
            if (linkedErr) throw linkedErr;
            if (allErr) throw allErr;
            setLinkedAlbums(linked || []);
            const linkedIds = new Set((linked || []).map((a) => a.id));
            setAvailableAlbums((all || []).filter((a) => !linkedIds.has(a.id)));
        } catch (err) {
            console.error('Failed to load organisation albums:', err);
            toast.error('Could not load albums. Ensure the organisation_id column exists on albums.');
        } finally {
            setAlbumsLoading(false);
        }
    };

    useEffect(() => {
        if (!org?.id) return;
        fetchOrgAlbums(org.id);
    }, [org?.id]);

    useEffect(() => {
        if (!org) return;
        setForm({
            name: org.name || '',
            short_name: org.short_name || '',
            org_type: org.org_type || 'Tournament Organiser',
            linked_status: org.linked_status || '',
            linked_club_name: org.linked_club_name || '',
            sapa_intent: org.sapa_intent || '',
            coverage: org.coverage || '',
            year_established: org.year_established != null ? String(org.year_established) : '',
            about: org.about || '',
            brand_color: org.brand_color || '#9AE900',
            logo_url: org.logo_url || '',
            cover_image_url: org.cover_image_url || '',
            contact_email: org.contact_email || '',
            contact_phone: org.contact_phone || '',
            whatsapp_number: org.whatsapp_number || '',
            website_url: org.website_url || '',
            socials: {
                instagram: org.socials?.instagram || '',
                facebook: org.socials?.facebook || '',
                tiktok: org.socials?.tiktok || '',
                youtube: org.socials?.youtube || '',
            },
            contacts: Array.isArray(org.contacts) && org.contacts.length > 0
                ? org.contacts.map((c) => ({ ...emptyContact(), ...c }))
                : [],
            sponsors: Array.isArray(org.sponsors)
                ? org.sponsors.map((s) => ({
                    name: s.name || '',
                    tier: s.tier || 'Official Partner',
                    logo_url: s.logo_url || '',
                }))
                : [],
            ...(adminMode ? {
                status: org.status || 'pending',
                verified: Boolean(org.verified),
                sapa_sanctioned: Boolean(org.sapa_sanctioned),
            } : {}),
        });
        setStep(0);
        setOpenAccordion(null);
    }, [org, adminMode]);

    if (!org || !form) return null;

    const currentStep = steps[step] || steps[0];
    const isLastStep = step === steps.length - 1;

    const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));
    const setSocial = (name, value) => setForm((prev) => ({ ...prev, socials: { ...prev.socials, [name]: value } }));
    const setContact = (idx, key, value) =>
        setForm((prev) => ({ ...prev, contacts: prev.contacts.map((c, i) => (i === idx ? { ...c, [key]: value } : c)) }));
    const setSponsor = (idx, key, value) =>
        setForm((prev) => ({ ...prev, sponsors: prev.sponsors.map((s, i) => (i === idx ? { ...s, [key]: value } : s)) }));

    const handleLinkAlbum = async () => {
        if (!albumToAdd || !org?.id) return;
        setLinkingAlbum(true);
        try {
            const { error } = await supabase
                .from('albums')
                .update({ organisation_id: org.id })
                .eq('id', albumToAdd);
            if (error) throw error;
            toast.success('Album linked to organisation');
            setAlbumToAdd('');
            await fetchOrgAlbums(org.id);
        } catch (err) {
            console.error('Link album failed:', err);
            toast.error(`Could not link album: ${err.message}`);
        } finally {
            setLinkingAlbum(false);
        }
    };

    const handleUnlinkAlbum = async (albumId) => {
        if (!albumId || !org?.id) return;
        setLinkingAlbum(true);
        try {
            const { error } = await supabase
                .from('albums')
                .update({ organisation_id: null })
                .eq('id', albumId);
            if (error) throw error;
            toast.success('Album unlinked');
            await fetchOrgAlbums(org.id);
        } catch (err) {
            console.error('Unlink album failed:', err);
            toast.error(`Could not unlink album: ${err.message}`);
        } finally {
            setLinkingAlbum(false);
        }
    };

    const handleDeleteOrganisation = async () => {
        if (!canDelete || !org?.id) {
            toast.error('Only super admins can delete organisations.');
            return;
        }
        if (deleteConfirmName.trim() !== (org.name || '').trim()) {
            toast.error('Type the organisation name exactly to confirm deletion.');
            return;
        }
        if (!window.confirm(`Permanently delete "${org.name}"? This cannot be undone.`)) return;

        setDeleting(true);
        try {
            // Detach linked records that would otherwise block deletion
            await supabase.from('albums').update({ organisation_id: null }).eq('organisation_id', org.id);
            await supabase.from('calendar').update({ organisation_id: null }).eq('organisation_id', org.id);
            await supabase.from('organisation_members').delete().eq('organisation_id', org.id);

            const { error } = await supabase
                .from('organisations')
                .delete()
                .eq('id', org.id);
            if (error) throw error;

            toast.success(`"${org.name}" has been deleted.`);
            onDeleted?.(org.id);
        } catch (err) {
            console.error('Organisation delete failed:', err);
            toast.error(`Delete failed: ${err.message}`);
        } finally {
            setDeleting(false);
        }
    };

    const toggleAccordion = (id) => {
        setOpenAccordion((prev) => (prev === id ? null : id));
    };

    const handleUpload = async (e, kind, sponsorIdx = null) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const isSponsor = kind === 'sponsor';
        const maxMb = kind === 'logo' || isSponsor ? 2 : 5;
        if (file.size > maxMb * 1024 * 1024) {
            return toast.error(`${isSponsor ? 'Sponsor logo' : kind === 'logo' ? 'Logo' : 'Cover'} must be under ${maxMb}MB.`);
        }
        const uploadKey = isSponsor ? `sponsor-${sponsorIdx}` : kind;
        setUploading(uploadKey);
        try {
            const ext = file.name.split('.').pop();
            const folder = isSponsor ? 'sponsors' : (kind === 'logo' ? 'logos' : 'covers');
            const path = `organisations/${folder}/${org.id}_${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from('profile-pics').upload(path, file, { cacheControl: '3600', upsert: true });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('profile-pics').getPublicUrl(path);
            if (isSponsor && sponsorIdx != null) {
                setSponsor(sponsorIdx, 'logo_url', publicUrl);
                toast.success('Sponsor logo uploaded');
            } else {
                setField(kind === 'logo' ? 'logo_url' : 'cover_image_url', publicUrl);
                toast.success(`${kind === 'logo' ? 'Logo' : 'Cover image'} uploaded`);
            }
        } catch (err) {
            toast.error(`Upload failed: ${err.message}`);
        } finally {
            setUploading(null);
            e.target.value = '';
        }
    };

    const validateCurrentStep = () => {
        if (currentStep.id === 'identity' && !form.name.trim()) {
            return 'Organisation name is required.';
        }
        if (currentStep.id === 'contact' && !form.contact_email.trim()) {
            return 'Contact email is required.';
        }
        return null;
    };

    const goNext = () => {
        const error = validateCurrentStep();
        if (error) return toast.error(error);
        setStep((s) => Math.min(steps.length - 1, s + 1));
        setOpenAccordion(null);
    };

    const goBack = () => {
        setStep((s) => Math.max(0, s - 1));
        setOpenAccordion(null);
    };

    const handleSave = async (e) => {
        e?.preventDefault?.();
        if (!form.name.trim()) return toast.error('Organisation name is required.');
        if (!form.contact_email.trim()) return toast.error('Contact email is required.');
        setSaving(true);
        try {
            const websiteRaw = (form.website_url || '').trim().replace(/^https?:\/\//i, '');
            const websiteUrl = websiteRaw
                ? (/^https?:\/\//i.test(form.website_url.trim())
                    ? form.website_url.trim()
                    : `https://${websiteRaw}`)
                : null;

            const payload = {
                name: form.name.trim(),
                short_name: form.short_name.trim() || null,
                org_type: form.org_type.trim() || 'Tournament Organiser',
                linked_status: form.linked_status || null,
                linked_club_name: form.linked_status === 'Linked to a Club / Group of Clubs'
                    ? (form.linked_club_name.trim() || null)
                    : null,
                sapa_intent: form.sapa_intent || null,
                coverage: form.coverage.trim() || null,
                year_established: form.year_established === '' ? null : parseInt(form.year_established, 10),
                about: form.about.trim() || null,
                brand_color: form.brand_color || null,
                logo_url: form.logo_url || null,
                cover_image_url: form.cover_image_url || null,
                contact_email: form.contact_email.trim(),
                contact_phone: form.contact_phone.trim() || null,
                whatsapp_number: form.whatsapp_number.trim() || null,
                website_url: websiteUrl,
                socials: Object.fromEntries(Object.entries(form.socials).map(([k, v]) => [k, v.trim()])),
                contacts: form.contacts
                    .filter((c) => c.role || c.name || c.email || c.phone || c.whatsapp)
                    .map((c) => ({
                        role: (c.role || '').trim(),
                        name: (c.name || '').trim(),
                        email: (c.email || '').trim(),
                        phone: (c.phone || '').trim(),
                        whatsapp: (c.whatsapp || '').trim(),
                    })),
                sponsors: (form.sponsors || [])
                    .filter((s) => (s.name || '').trim() || s.logo_url)
                    .map((s) => ({
                        name: (s.name || '').trim(),
                        tier: (s.tier || 'Official Partner').trim(),
                        logo_url: s.logo_url || '',
                    })),
            };

            if (adminMode) {
                payload.status = form.status;
                payload.verified = form.verified;
                payload.sapa_sanctioned = form.sapa_sanctioned;
                if (form.status === 'approved' && org.status !== 'approved') {
                    payload.approved_at = new Date().toISOString();
                }
            }

            const { data, error } = await supabase
                .from('organisations')
                .update(payload)
                .eq('id', org.id)
                .select();
            if (error) throw error;
            if (!data || data.length === 0) throw new Error('Update was not permitted. Ensure you are an owner/admin of this organisation.');

            toast.success(adminMode ? 'Organisation updated successfully.' : 'Profile updated — your public page is live with the changes');
            onSaved?.(data[0]);
        } catch (err) {
            console.error('Org profile save failed:', err);
            toast.error(`Save failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const renderStepContent = (stepId) => {
        if (stepId === 'admin' && adminMode) {
            return (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
                        <div>
                            <label className={labelClass}>Status</label>
                            <select
                                value={form.status}
                                onChange={(e) => setField('status', e.target.value)}
                                className={inputClass}
                            >
                                <option value="pending">Pending</option>
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                                <option value="suspended">Suspended</option>
                            </select>
                        </div>
                        <label className="flex items-center gap-3 cursor-pointer pt-6">
                            <input
                                type="checkbox"
                                checked={form.verified}
                                onChange={(e) => setField('verified', e.target.checked)}
                                className="w-4 h-4 accent-padel-green"
                            />
                            <span className="text-sm text-white font-bold">Verified badge</span>
                        </label>
                        <label className="flex items-center gap-3 cursor-pointer pt-6">
                            <input
                                type="checkbox"
                                checked={form.sapa_sanctioned}
                                onChange={(e) => setField('sapa_sanctioned', e.target.checked)}
                                className="w-4 h-4 accent-padel-green"
                            />
                            <span className="text-sm text-white font-bold">SAPA sanctioned</span>
                        </label>
                    </div>

                    {canDelete && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 space-y-3">
                            <div className="flex items-start gap-2">
                                <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-bold text-red-300">Danger zone</p>
                                    <p className="text-xs text-red-200/70 mt-1 leading-relaxed">
                                        Permanently delete this organisation. Linked events keep their data but are unlinked; members and album links are removed.
                                    </p>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Type “{org.name}” to confirm</label>
                                <input
                                    type="text"
                                    value={deleteConfirmName}
                                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                                    placeholder={org.name}
                                    className={`${inputClass} border-red-500/20 focus:border-red-400`}
                                    autoComplete="off"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleDeleteOrganisation}
                                disabled={deleting || deleteConfirmName.trim() !== (org.name || '').trim()}
                                className="inline-flex items-center gap-2 bg-red-500/15 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/30 text-[10px] font-black uppercase tracking-wider px-4 py-3 rounded-xl transition-all disabled:opacity-40 cursor-pointer"
                            >
                                <Trash2 size={13} />
                                {deleting ? 'Deleting…' : 'Delete Organisation'}
                            </button>
                        </div>
                    )}
                </div>
            );
        }

        if (stepId === 'identity') {
            return (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Organisation Name *</label>
                            <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Short Name / Abbreviation</label>
                            <input
                                type="text"
                                value={form.short_name}
                                onChange={(e) => setField('short_name', e.target.value)}
                                placeholder="Optional short name"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Organisation Type</label>
                            <select
                                value={form.org_type}
                                onChange={(e) => setField('org_type', e.target.value)}
                                className={`${inputClass} cursor-pointer`}
                            >
                                {orgTypeOptionsFor(form.org_type).map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Linked Status</label>
                            <select
                                value={form.linked_status}
                                onChange={(e) => setField('linked_status', e.target.value)}
                                className={`${inputClass} cursor-pointer`}
                            >
                                <option value="">Select an option</option>
                                {LINKED_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                        {form.linked_status === 'Linked to a Club / Group of Clubs' && (
                            <div className="md:col-span-2">
                                <label className={labelClass}>Club / Group Name</label>
                                <input
                                    type="text"
                                    value={form.linked_club_name}
                                    onChange={(e) => setField('linked_club_name', e.target.value)}
                                    placeholder="Enter club or group name"
                                    className={inputClass}
                                />
                            </div>
                        )}
                        <div>
                            <label className={labelClass}>SAPA Sanction Intent</label>
                            <select
                                value={form.sapa_intent}
                                onChange={(e) => setField('sapa_intent', e.target.value)}
                                className={`${inputClass} cursor-pointer`}
                            >
                                <option value="">Select an option</option>
                                {SAPA_INTENT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Coverage</label>
                            <input type="text" value={form.coverage} onChange={(e) => setField('coverage', e.target.value)} placeholder="National – South Africa" className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Year Established</label>
                            <input type="number" min="1900" max="2100" value={form.year_established} onChange={(e) => setField('year_established', e.target.value)} placeholder="2019" className={inputClass} />
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>About / Mission</label>
                        <textarea
                            rows={4}
                            value={form.about}
                            onChange={(e) => setField('about', e.target.value)}
                            placeholder="Tell players who you are, what you host, and why they should play your events..."
                            className={`${inputClass} resize-y leading-relaxed`}
                        />
                    </div>
                </div>
            );
        }

        if (stepId === 'branding') {
            return (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                            {form.logo_url ? (
                                <img src={form.logo_url} alt="logo" className="w-16 h-16 rounded-2xl object-cover bg-white border border-white/10 shrink-0" />
                            ) : (
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0"><Building size={24} /></div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-white">Organisation Logo</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">Square, max 2MB</p>
                                <div className="flex gap-2 mt-2">
                                    <label className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer transition-all">
                                        <Upload size={11} /> {uploading === 'logo' ? 'Uploading...' : 'Upload'}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'logo')} disabled={uploading === 'logo'} />
                                    </label>
                                    {form.logo_url && (
                                        <button type="button" onClick={() => setField('logo_url', '')} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={13} /></button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                            {form.cover_image_url ? (
                                <img src={form.cover_image_url} alt="cover" className="w-24 h-16 rounded-xl object-cover border border-white/10 shrink-0" />
                            ) : (
                                <div className="w-24 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0"><ImageIcon size={22} /></div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-white">Hero Cover Image</p>
                                <p className="text-[10px] text-gray-500 mt-0.5">Wide (16:9), max 5MB</p>
                                <div className="flex gap-2 mt-2">
                                    <label className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer transition-all">
                                        <Upload size={11} /> {uploading === 'cover' ? 'Uploading...' : 'Upload'}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'cover')} disabled={uploading === 'cover'} />
                                    </label>
                                    {form.cover_image_url && (
                                        <button type="button" onClick={() => setField('cover_image_url', '')} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 size={13} /></button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Palette size={14} style={{ color: form.brand_color }} />
                            <p className="text-xs font-bold text-white">Brand Colour</p>
                            <span className="text-[10px] text-gray-500">— drives buttons & accents on your public page</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {COLOR_PRESETS.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setField('brand_color', c)}
                                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${form.brand_color === c ? 'border-white scale-110' : 'border-transparent'}`}
                                    style={{ background: c }}
                                />
                            ))}
                            <input
                                type="color"
                                value={form.brand_color}
                                onChange={(e) => setField('brand_color', e.target.value)}
                                className="w-8 h-8 rounded-full border border-white/20 bg-transparent cursor-pointer"
                                title="Custom colour"
                            />
                            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 ml-1">{form.brand_color}</span>
                        </div>
                    </div>
                </div>
            );
        }

        if (stepId === 'contact') {
            return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Contact Email *</label>
                        <input type="email" value={form.contact_email} onChange={(e) => setField('contact_email', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Contact Phone</label>
                        <input type="tel" value={form.contact_phone} onChange={(e) => setField('contact_phone', e.target.value)} placeholder="+27 ..." className={inputClass} />
                    </div>
                    <div>
                        <label className={labelClass}>WhatsApp Number</label>
                        <input type="tel" value={form.whatsapp_number} onChange={(e) => setField('whatsapp_number', e.target.value)} placeholder="Defaults to phone if empty" className={inputClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Website</label>
                        <div className="relative flex items-center">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none pointer-events-none">
                                https://
                            </span>
                            <input
                                type="text"
                                value={(form.website_url || '').replace(/^https?:\/\//i, '')}
                                onChange={(e) => setField('website_url', e.target.value.replace(/^https?:\/\//i, '').replace(/^\/+/, ''))}
                                placeholder="www.yourorg.co.za"
                                className={`${inputClass} !pl-[5.25rem]`}
                            />
                        </div>
                    </div>
                </div>
            );
        }

        if (stepId === 'socials') {
            return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                        ['instagram', 'Instagram URL', Instagram],
                        ['facebook', 'Facebook URL', Facebook],
                        ['tiktok', 'TikTok URL', ExternalLink],
                        ['youtube', 'YouTube URL', Youtube],
                    ].map(([key, label, Icon]) => (
                        <div key={key}>
                            <label className={labelClass}>{label}</label>
                            <div className="relative">
                                <Icon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    value={form.socials[key]}
                                    onChange={(e) => setSocial(key, e.target.value)}
                                    placeholder="https://..."
                                    className={`${inputClass} pl-10`}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            );
        }

        if (stepId === 'sponsors') {
            return (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, sponsors: [...prev.sponsors, emptySponsor()] }))}
                            className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-2 rounded-lg transition-all cursor-pointer"
                        >
                            <Plus size={12} /> Add Sponsor
                        </button>
                    </div>
                    {form.sponsors.length === 0 ? (
                        <p className="text-xs text-gray-500">Add sponsor logos and tiers — they appear on your public organisation page.</p>
                    ) : (
                        <div className="space-y-3">
                            {form.sponsors.map((s, i) => (
                                <div key={i} className="bg-black/30 border border-white/5 rounded-2xl p-4 relative">
                                    <button
                                        type="button"
                                        onClick={() => setForm((prev) => ({ ...prev, sponsors: prev.sponsors.filter((_, idx) => idx !== i) }))}
                                        className="absolute top-3 right-3 p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                    <div className="flex flex-col sm:flex-row gap-4 pr-8">
                                        <div className="shrink-0">
                                            <div className="w-20 h-20 rounded-xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
                                                {s.logo_url ? (
                                                    <img src={s.logo_url} alt={s.name || 'Sponsor'} className="w-full h-full object-contain p-2" />
                                                ) : (
                                                    <ImageIcon size={22} className="text-gray-600" />
                                                )}
                                            </div>
                                            <label className="mt-2 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-padel-green cursor-pointer hover:text-white transition-colors">
                                                <Upload size={11} />
                                                {uploading === `sponsor-${i}` ? 'Uploading…' : (s.logo_url ? 'Replace' : 'Upload')}
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => handleUpload(e, 'sponsor', i)}
                                                    disabled={uploading === `sponsor-${i}`}
                                                />
                                            </label>
                                        </div>
                                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                                            <div>
                                                <label className={labelClass}>Tier</label>
                                                <select
                                                    value={s.tier}
                                                    onChange={(e) => setSponsor(i, 'tier', e.target.value)}
                                                    className={`${inputClass} cursor-pointer`}
                                                >
                                                    {SPONSOR_TIER_OPTIONS.map((tier) => (
                                                        <option key={tier} value={tier}>{tier}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelClass}>Name</label>
                                                <input
                                                    type="text"
                                                    value={s.name}
                                                    onChange={(e) => setSponsor(i, 'name', e.target.value)}
                                                    placeholder="Sponsor name"
                                                    className={inputClass}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (stepId === 'media') {
            return (
                <div className="space-y-4">
                    <p className="text-xs text-gray-500">
                        Link gallery albums to this organisation. Their cover images appear in the Media section on the public page.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <select
                            value={albumToAdd}
                            onChange={(e) => setAlbumToAdd(e.target.value)}
                            className={`${inputClass} cursor-pointer flex-1`}
                            disabled={albumsLoading || linkingAlbum}
                        >
                            <option value="">Select an album to link…</option>
                            {availableAlbums.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.title}{a.album_date ? ` (${String(a.album_date).substring(0, 10)})` : ''}
                                    {a.organisation_id ? ' — linked elsewhere' : ''}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={handleLinkAlbum}
                            disabled={!albumToAdd || linkingAlbum}
                            className="inline-flex items-center justify-center gap-1.5 bg-padel-green text-black text-[10px] font-black uppercase tracking-wider px-4 py-3 rounded-xl hover:bg-white transition-all disabled:opacity-40 cursor-pointer shrink-0"
                        >
                            <Plus size={12} />
                            {linkingAlbum ? 'Linking…' : 'Add Album'}
                        </button>
                    </div>

                    {albumsLoading ? (
                        <p className="text-xs text-gray-500">Loading albums…</p>
                    ) : linkedAlbums.length === 0 ? (
                        <p className="text-xs text-gray-500">No albums linked yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {linkedAlbums.map((album) => (
                                <div
                                    key={album.id}
                                    className="flex items-center gap-3 bg-black/30 border border-white/5 rounded-2xl p-3"
                                >
                                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-black/40 border border-white/10 shrink-0 flex items-center justify-center">
                                        {album.cover_image_url ? (
                                            <img src={album.cover_image_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon size={18} className="text-gray-600" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-white truncate">{album.title}</p>
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                                            {album.album_date ? String(album.album_date).substring(0, 10) : 'No date'}
                                            {album.is_featured ? ' · Featured' : ''}
                                            {!album.is_active ? ' · Hidden' : ''}
                                            {!album.cover_image_url ? ' · No cover' : ''}
                                        </p>
                                    </div>
                                    {album.slug && (
                                        <a
                                            href={`/gallery/${album.slug}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 text-gray-400 hover:text-white transition-colors"
                                            title="View album"
                                        >
                                            <ExternalLink size={14} />
                                        </a>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleUnlinkAlbum(album.id)}
                                        disabled={linkingAlbum}
                                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-40"
                                        title="Unlink album"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (stepId === 'contacts') {
            return (
                <div className="space-y-4">
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setForm((prev) => ({ ...prev, contacts: [...prev.contacts, emptyContact()] }))}
                            className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-2 rounded-lg transition-all cursor-pointer"
                        >
                            <Plus size={12} /> Add Contact
                        </button>
                    </div>
                    {form.contacts.length === 0 ? (
                        <p className="text-xs text-gray-500">Choose a role from the list for each contact — they appear on your public page with WhatsApp and email buttons.</p>
                    ) : (
                        <div className="space-y-3">
                            {form.contacts.map((c, i) => (
                                <div key={i} className="bg-black/30 border border-white/5 rounded-2xl p-4 relative">
                                    <button
                                        type="button"
                                        onClick={() => setForm((prev) => ({ ...prev, contacts: prev.contacts.filter((_, idx) => idx !== i) }))}
                                        className="absolute top-3 right-3 p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-8">
                                        <select
                                            value={c.role}
                                            onChange={(e) => setContact(i, 'role', e.target.value)}
                                            className={`${inputClass} cursor-pointer`}
                                        >
                                            <option value="">Select role...</option>
                                            {roleOptionsForContact(c.role).map((role) => (
                                                <option key={role} value={role}>{role}</option>
                                            ))}
                                        </select>
                                        <input type="text" value={c.name} onChange={(e) => setContact(i, 'name', e.target.value)} placeholder="Full name" className={inputClass} />
                                        <input type="email" value={c.email} onChange={(e) => setContact(i, 'email', e.target.value)} placeholder="Email" className={inputClass} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <input type="tel" value={c.phone} onChange={(e) => setContact(i, 'phone', e.target.value)} placeholder="Phone" className={inputClass} />
                                            <input type="tel" value={c.whatsapp} onChange={(e) => setContact(i, 'whatsapp', e.target.value)} placeholder="WhatsApp" className={inputClass} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        return null;
    };

    return (
        <form onSubmit={handleSave} className="space-y-5 text-left">
            <div className={`flex flex-col gap-3 ${adminMode ? 'items-start pr-12' : 'sm:flex-row sm:items-center justify-between'}`}>
                <div>
                    <h3 className="text-lg font-bold text-white">{adminMode ? 'Edit Organisation' : 'Organisation Profile'}</h3>
                    <p className="text-gray-500 text-xs mt-0.5">
                        {adminMode
                            ? 'Platform admin — includes status and verification badges'
                            : 'Everything here appears on your public 4M Padel page'}
                    </p>
                </div>
                {org.slug && (
                    <a
                        href={`/organisations/${org.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#000000' }}
                        className="inline-flex items-center gap-2 bg-padel-green hover:bg-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all shrink-0 w-fit"
                    >
                        <Eye size={13} /> View Public Page
                    </a>
                )}
            </div>

            {/* Progress */}
            <div className="flex gap-1.5 w-full" aria-label={`Step ${step + 1} of ${steps.length}`}>
                {steps.map((s, i) => (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => { setStep(i); setOpenAccordion(null); }}
                        title={s.title}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i <= step ? 'bg-padel-green' : 'bg-white/10 hover:bg-white/20'
                        }`}
                    />
                ))}
            </div>

            {/* Accordion jump list */}
            <div className="space-y-2">
                {steps.map((s, i) => {
                    const isActive = i === step;
                    const isOpen = openAccordion === s.id || isActive;
                    return (
                        <div
                            key={s.id}
                            className={`border rounded-2xl overflow-hidden transition-colors ${
                                isActive ? 'border-padel-green/40 bg-padel-green/5' : 'border-white/10 bg-black/20'
                            }`}
                        >
                            <button
                                type="button"
                                onClick={() => {
                                    setStep(i);
                                    toggleAccordion(s.id);
                                }}
                                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className={`text-[10px] font-black tabular-nums ${isActive ? 'text-padel-green' : 'text-gray-500'}`}>
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <span className={`text-[11px] font-black uppercase tracking-[0.2em] truncate ${
                                        s.id === 'admin' ? 'text-amber-400' : (isActive ? 'text-padel-green' : 'text-gray-300')
                                    }`}>
                                        {s.title}
                                    </span>
                                </div>
                                <ChevronDown
                                    size={16}
                                    className={`shrink-0 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                />
                            </button>
                            {isOpen && (
                                <div className="px-4 pb-4 pt-1 border-t border-white/5">
                                    {renderStepContent(s.id)}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Nav + Save */}
            <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={goBack}
                        disabled={step === 0}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-white/10 text-gray-300 text-xs font-bold uppercase tracking-wider hover:bg-white/5 disabled:opacity-40 cursor-pointer"
                    >
                        <ChevronLeft size={14} /> Back
                    </button>
                    {!isLastStep && (
                        <button
                            type="button"
                            onClick={goNext}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border border-white/10 text-white text-xs font-bold uppercase tracking-wider hover:bg-white/5 cursor-pointer"
                        >
                            Next <ChevronRight size={14} />
                        </button>
                    )}
                </div>
                <button
                    type="submit"
                    disabled={saving || uploading}
                    className="inline-flex items-center justify-center gap-2 bg-padel-green text-black font-black uppercase tracking-widest text-xs px-8 py-3.5 rounded-xl hover:bg-white transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-padel-green/10"
                >
                    <Save size={14} /> {saving ? 'Saving...' : (adminMode ? 'Save Organisation' : 'Save Profile')}
                </button>
            </div>
        </form>
    );
};

export default OrgProfileEditor;
