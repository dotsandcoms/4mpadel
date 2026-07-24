import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';
import {
    MapPin, Plus, RefreshCw, Users, Building, Save, Loader2, ExternalLink,
    Upload, Trash2, Image as ImageIcon, ChevronDown, Instagram, Facebook, Youtube,
    Search, Check, X, Clock, Palette,
} from 'lucide-react';
import ClubMembersManager from './ClubMembersManager';
import { slugifyClub } from '../../utils/club';
import { sendEmail } from '../../utils/emails';
import { attachPlacesAutocomplete } from '../../utils/googleMaps';

const COLOR_PRESETS = ['#CC1414', '#9AE900', '#F97316', '#3B82F6', '#EF4444', '#A855F7', '#14B8A6', '#EAB308', '#EC4899'];

const CollapsibleSection = ({
    open,
    onToggle,
    title,
    icon: Icon,
    iconClassName = 'text-padel-green',
    count,
    actions,
    children,
}) => (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl shadow-xl">
        <div className="flex items-center gap-2 p-4 md:p-5">
            <button
                type="button"
                onClick={onToggle}
                className="flex-1 flex items-center justify-between gap-3 text-left hover:opacity-90 transition-opacity cursor-pointer bg-transparent border-0 p-0"
            >
                <h3 className="text-base font-bold text-white flex items-center gap-2 min-w-0">
                    {Icon && <Icon size={16} className={`shrink-0 ${iconClassName}`} />}
                    <span className="truncate">{title}{count !== undefined ? ` (${count})` : ''}</span>
                </h3>
                <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {actions}
        </div>
        {open && (
            <div className="px-4 md:px-5 pb-5 border-t border-white/5 pt-4 space-y-4">
                {children}
            </div>
        )}
    </div>
);

const emptySocials = () => ({ instagram: '', facebook: '', tiktok: '', youtube: '' });
const emptyCourts = () => ({
    indoor: { count: 0, features: [], image_url: '' },
    outdoor: { count: 0, features: [], image_url: '' },
});
const emptyHours = () => ({
    mon: { open: '06:00', close: '22:00', closed: false },
    tue: { open: '06:00', close: '22:00', closed: false },
    wed: { open: '06:00', close: '22:00', closed: false },
    thu: { open: '06:00', close: '22:00', closed: false },
    fri: { open: '06:00', close: '22:00', closed: false },
    sat: { open: '07:00', close: '21:00', closed: false },
    sun: { open: '07:00', close: '20:00', closed: false },
});

const DAY_LABELS = {
    mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
    fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
};

const emptyForm = () => ({
    name: '',
    short_name: '',
    slug: '',
    about: '',
    website_url: '',
    brand_color: '#CC1414',
    status: 'draft',
    contact_email: '',
    contact_phone: '',
    whatsapp_number: '',
    city: '',
    address: '',
    lat: '',
    lng: '',
    logo_url: '',
    cover_image_url: '',
    verified: false,
    sapa_registered: false,
    federation_id: '',
    socials: emptySocials(),
    contacts: [],
    opening_hours: emptyHours(),
    courts: emptyCourts(),
    services: [],
    cafe: null,
    sponsors: [],
    principal_sponsor: null,
    gallery: [],
    stats: {},
});

const normaliseSocials = (value) => {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
        instagram: src.instagram || '',
        facebook: src.facebook || '',
        tiktok: src.tiktok || '',
        youtube: src.youtube || '',
    };
};

const normaliseCourts = (value) => {
    const base = emptyCourts();
    if (!value || typeof value !== 'object') return base;
    return {
        indoor: {
            count: Number(value.indoor?.count) || 0,
            features: Array.isArray(value.indoor?.features) ? value.indoor.features : [],
            image_url: value.indoor?.image_url || '',
        },
        outdoor: {
            count: Number(value.outdoor?.count) || 0,
            features: Array.isArray(value.outdoor?.features) ? value.outdoor.features : [],
            image_url: value.outdoor?.image_url || '',
        },
    };
};

const inputClass = 'mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-medium normal-case tracking-normal placeholder:text-gray-500 focus:outline-none focus:border-padel-green';
const labelClass = 'block text-[10px] font-black uppercase tracking-wider text-gray-400';
const ghostBtnClass = 'px-3 py-1.5 rounded-lg border border-white/10 text-xs font-bold text-gray-300 hover:bg-white/5 flex items-center gap-1';

/**
 * Platform Clubs admin — full club card content editor.
 */
const ClubManager = ({ permissions }) => {
    const isSuper = permissions?.role === 'super_admin';
    const [clubs, setClubs] = useState([]);
    const [federations, setFederations] = useState([]);
    const [approvedOrgs, setApprovedOrgs] = useState([]);
    const [linkedOrgIds, setLinkedOrgIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const [slugManual, setSlugManual] = useState(false);
    const [membersOpen, setMembersOpen] = useState(false);
    const [assignOrgId, setAssignOrgId] = useState('');
    const [listSearch, setListSearch] = useState('');
    const addressInputRef = useRef(null);
    const autocompleteRef = useRef(null);
    const [sectionOpen, setSectionOpen] = useState({
        profile: true,
        sponsor: false,
        socials: false,
        courts: false,
        cafe: false,
        services: false,
        hours: false,
        gallery: false,
        sponsors: false,
        contacts: false,
        orgs: false,
        federation: false,
    });

    const selected = useMemo(
        () => clubs.find((c) => c.id === selectedId) || null,
        [clubs, selectedId],
    );

    const filteredClubs = useMemo(() => {
        const q = listSearch.trim().toLowerCase();
        const base = clubs.filter((c) => c.status !== 'pending');
        if (!q) return base;
        return base.filter((c) => {
            const hay = [
                c.name,
                c.short_name,
                c.slug,
                c.city,
                c.status,
                c.address,
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [clubs, listSearch]);

    const pendingClubs = useMemo(
        () => clubs.filter((c) => c.status === 'pending'),
        [clubs],
    );

    const applicantEmail = (club) => {
        if (club?.contact_email) return club.contact_email;
        const primary = (Array.isArray(club?.contacts) ? club.contacts : []).find((c) => c.is_primary)
            || (Array.isArray(club?.contacts) ? club.contacts[0] : null);
        return primary?.email || '';
    };

    const handleApproveClub = async (club) => {
        try {
            const { error } = await supabase
                .from('clubs')
                .update({
                    status: 'published',
                    verified: true,
                    approved_at: new Date().toISOString(),
                    rejection_notes: null,
                })
                .eq('id', club.id);
            if (error) throw error;

            const email = applicantEmail(club);
            if (email) {
                const { error: memberError } = await supabase
                    .from('club_members')
                    .upsert({
                        club_id: club.id,
                        player_id: club.created_by || null,
                        user_email: email.toLowerCase(),
                        role: 'owner',
                    }, { onConflict: 'club_id,user_email' });
                if (memberError) console.warn('Owner membership assignment warning:', memberError);
                sendEmail(email, 'club_approved', { clubName: club.name });
            }

            toast.success(`Approved club: ${club.name}`);
            loadClubs();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to approve club');
        }
    };

    const handleRejectClub = async (club) => {
        const notes = window.prompt(`Rejection notes for ${club.name}:`);
        if (notes == null) return;
        if (!String(notes).trim()) {
            toast.error('Please provide rejection feedback.');
            return;
        }
        try {
            const { error } = await supabase
                .from('clubs')
                .update({
                    status: 'rejected',
                    rejection_notes: String(notes).trim(),
                })
                .eq('id', club.id);
            if (error) throw error;

            const email = applicantEmail(club);
            if (email) {
                sendEmail(email, 'club_rejected', {
                    clubName: club.name,
                    notes: String(notes).trim(),
                });
            }
            toast.success(`Rejected club application: ${club.name}`);
            loadClubs();
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to reject club');
        }
    };

    const toggleSection = (key) => {
        setSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const loadClubs = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase.from('clubs').select('*').order('name', { ascending: true });

            // Scoped: club members only see their clubs (unless super/custom with clubs tab)
            if (!isSuper && permissions?.clubs?.length) {
                const ids = permissions.clubs.map((c) => c.id);
                query = query.in('id', ids);
            }

            const { data, error } = await query;
            if (error) throw error;
            setClubs(data || []);
            if (!selectedId && (data || []).length > 0 && !isCreating) {
                setSelectedId(data[0].id);
            }
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load clubs');
        } finally {
            setLoading(false);
        }
    }, [isSuper, permissions?.clubs, selectedId, isCreating]);

    const loadLookups = useCallback(async () => {
        const [{ data: feds }, { data: orgs }] = await Promise.all([
            supabase.from('federations').select('id, name, short_name, slug').order('name'),
            supabase.from('organisations').select('id, name, slug, logo_url').eq('status', 'approved').order('name'),
        ]);
        setFederations(feds || []);
        setApprovedOrgs(orgs || []);
    }, []);

    const loadLinkedOrgs = useCallback(async (clubId) => {
        if (!clubId) {
            setLinkedOrgIds([]);
            return;
        }
        const { data, error } = await supabase
            .from('club_organisations')
            .select('organisation_id')
            .eq('club_id', clubId);
        if (error) {
            console.warn(error);
            return;
        }
        setLinkedOrgIds((data || []).map((r) => r.organisation_id));
    }, []);

    useEffect(() => {
        loadClubs();
        loadLookups();
    }, [loadClubs, loadLookups]);

    useEffect(() => {
        if (!selectedId) return;
        const club = clubs.find((c) => c.id === selectedId);
        if (!club) return;
        setForm({
            ...emptyForm(),
            ...club,
            lat: club.lat ?? '',
            lng: club.lng ?? '',
            federation_id: club.federation_id || '',
            socials: normaliseSocials(club.socials),
            contacts: Array.isArray(club.contacts) ? club.contacts : [],
            opening_hours: { ...emptyHours(), ...(club.opening_hours || {}) },
            courts: normaliseCourts(club.courts),
            services: Array.isArray(club.services) ? club.services : [],
            cafe: club.cafe || null,
            sponsors: Array.isArray(club.sponsors) ? club.sponsors : [],
            principal_sponsor: club.principal_sponsor || null,
            gallery: Array.isArray(club.gallery) ? club.gallery : [],
            stats: club.stats && typeof club.stats === 'object' ? club.stats : {},
        });
        setSlugManual(true);
        setIsCreating(false);
        loadLinkedOrgs(selectedId);
        setSectionOpen((prev) => ({ ...prev, profile: true }));
        // Only re-hydrate when the selected club id changes — not on every clubs[] refresh.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, loadLinkedOrgs]);

    const startCreate = () => {
        setIsCreating(true);
        setSelectedId(null);
        setForm(emptyForm());
        setSlugManual(false);
        setLinkedOrgIds([]);
    };

    // Google Places autocomplete — shared helper with EventBuilder.
    // Depend on selectedId (not selected object) so club list refreshes don't tear this down.
    useEffect(() => {
        if ((!selectedId && !isCreating) || !sectionOpen.profile) return undefined;
        let cancelled = false;
        let attached = null;

        const timer = setTimeout(() => {
            const input = addressInputRef.current;
            if (!input) return;

            attachPlacesAutocomplete(input, {
                country: 'za',
                onPlace: (place) => {
                    const comps = place.address_components || [];
                    const get = (type) => comps.find((c) => c.types.includes(type))?.long_name || '';
                    const city = get('locality')
                        || get('sublocality')
                        || get('administrative_area_level_2')
                        || get('administrative_area_level_1');
                    const loc = place.geometry?.location;
                    const formatted = place.formatted_address || '';
                    if (formatted && addressInputRef.current) {
                        addressInputRef.current.value = formatted;
                    }
                    setForm((prev) => ({
                        ...prev,
                        address: formatted || prev.address,
                        city: city || prev.city,
                        lat: loc ? String(loc.lat()) : prev.lat,
                        lng: loc ? String(loc.lng()) : prev.lng,
                    }));
                },
            })
                .then((api) => {
                    if (cancelled) {
                        api.destroy();
                        return;
                    }
                    attached = api;
                    autocompleteRef.current = api;
                })
                .catch((err) => {
                    console.warn('Google Maps failed to load:', err);
                });
        }, 0);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            attached?.destroy();
            autocompleteRef.current = null;
        };
    }, [selectedId, isCreating, sectionOpen.profile]);

    const handleUpload = async (e, kind) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(kind);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const idPart = selectedId || 'new';
            const path = `clubs/${kind}/${idPart}_${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from('profile-pics').upload(path, file, { upsert: true });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('profile-pics').getPublicUrl(path);
            if (kind === 'logo') updateField('logo_url', publicUrl);
            else if (kind === 'cover') updateField('cover_image_url', publicUrl);
            else if (kind === 'gallery') {
                updateField('gallery', [
                    ...(form.gallery || []),
                    { url: publicUrl, category: 'other', caption: '' },
                ]);
            } else if (kind === 'indoor') {
                updateField('courts', {
                    ...form.courts,
                    indoor: { ...form.courts.indoor, image_url: publicUrl },
                });
            } else if (kind === 'outdoor') {
                updateField('courts', {
                    ...form.courts,
                    outdoor: { ...form.courts.outdoor, image_url: publicUrl },
                });
            } else if (kind === 'cafe') {
                updateField('cafe', { ...(form.cafe || { name: '', description: '', tags: [] }), image_url: publicUrl });
            } else if (kind === 'principal') {
                updateField('principal_sponsor', {
                    ...(form.principal_sponsor || { name: '', url: '' }),
                    logo_url: publicUrl,
                });
            }
            toast.success('Uploaded — save to keep');
        } catch (err) {
            toast.error(`Upload failed: ${err.message}`);
        } finally {
            setUploading(null);
            e.target.value = '';
        }
    };

    const handleSave = async () => {
        if (!form.name.trim() || !form.slug.trim()) {
            toast.error('Name and slug are required');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                short_name: form.short_name?.trim() || null,
                slug: slugifyClub(form.slug),
                about: form.about || null,
                website_url: form.website_url || null,
                brand_color: form.brand_color || null,
                status: form.status || 'draft',
                contact_email: form.contact_email || null,
                contact_phone: form.contact_phone || null,
                whatsapp_number: form.whatsapp_number || null,
                city: form.city || null,
                address: form.address || null,
                lat: form.lat === '' || form.lat == null ? null : Number(form.lat),
                lng: form.lng === '' || form.lng == null ? null : Number(form.lng),
                logo_url: form.logo_url || null,
                cover_image_url: form.cover_image_url || null,
                verified: !!form.verified,
                sapa_registered: !!form.sapa_registered,
                federation_id: form.federation_id || null,
                socials: normaliseSocials(form.socials),
                contacts: Array.isArray(form.contacts) ? form.contacts : [],
                opening_hours: form.opening_hours || emptyHours(),
                courts: normaliseCourts(form.courts),
                services: Array.isArray(form.services) ? form.services : [],
                cafe: form.cafe || null,
                sponsors: Array.isArray(form.sponsors) ? form.sponsors : [],
                principal_sponsor: form.principal_sponsor || null,
                gallery: Array.isArray(form.gallery) ? form.gallery : [],
                stats: form.stats || {},
                updated_at: new Date().toISOString(),
            };

            if (isCreating || !selectedId) {
                const { data, error } = await supabase.from('clubs').insert([payload]).select('*').single();
                if (error) throw error;
                toast.success('Club created');
                setClubs((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
                setSelectedId(data.id);
                setIsCreating(false);
            } else {
                const { data, error } = await supabase
                    .from('clubs')
                    .update(payload)
                    .eq('id', selectedId)
                    .select('*')
                    .single();
                if (error) throw error;
                toast.success('Club saved');
                setClubs((prev) => prev.map((c) => (c.id === data.id ? data : c)));
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
            const { error } = await supabase.from('club_organisations').insert({
                club_id: selectedId,
                organisation_id: assignOrgId,
            });
            if (error) throw error;
            toast.success('Organisation linked');
            setAssignOrgId('');
            loadLinkedOrgs(selectedId);
        } catch (err) {
            toast.error(err.code === '23505' ? 'Already linked.' : err.message);
        }
    };

    const handleUnlinkOrg = async (orgId) => {
        try {
            const { error } = await supabase
                .from('club_organisations')
                .delete()
                .eq('club_id', selectedId)
                .eq('organisation_id', orgId);
            if (error) throw error;
            toast.success('Organisation unlinked');
            loadLinkedOrgs(selectedId);
        } catch (err) {
            toast.error(err.message);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                <Loader2 className="animate-spin" size={18} /> Loading clubs…
            </div>
        );
    }

    const featuresText = (side) => (form.courts?.[side]?.features || []).join(', ');
    const setFeaturesText = (side, text) => {
        const features = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
        updateField('courts', {
            ...form.courts,
            [side]: { ...form.courts[side], features },
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                        <MapPin className="text-padel-green" size={22} /> Clubs
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Club cards linked to federations, organisations and players.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => loadClubs()}
                        className="px-3 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-bold flex items-center gap-2"
                    >
                        <RefreshCw size={14} /> Refresh
                    </button>
                    {(isSuper || permissions?.allowed_tabs?.includes('clubs')) && (
                        <button
                            type="button"
                            onClick={startCreate}
                            className="px-3 py-2 rounded-xl bg-padel-green text-black text-sm font-black flex items-center gap-2"
                        >
                            <Plus size={14} /> New Club
                        </button>
                    )}
                </div>
            </div>

            {isSuper && pendingClubs.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Clock size={16} className="text-amber-400" />
                        <h3 className="text-sm font-black uppercase tracking-wider text-amber-300">
                            Pending club applications ({pendingClubs.length})
                        </h3>
                    </div>
                    <ul className="space-y-2">
                        {pendingClubs.map((club) => (
                            <li
                                key={club.id}
                                className="flex flex-wrap items-center gap-3 bg-black/40 border border-white/10 rounded-xl px-3 py-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white truncate">{club.name}</p>
                                    <p className="text-[11px] text-gray-400 truncate">
                                        {[club.city, applicantEmail(club)].filter(Boolean).join(' · ') || 'No contact email'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedId(club.id); setIsCreating(false); }}
                                        className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-wider text-gray-300 hover:bg-white/5"
                                    >
                                        Review
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleApproveClub(club)}
                                        className="px-2.5 py-1.5 rounded-lg bg-padel-green text-black text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                                    >
                                        <Check size={12} /> Approve
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleRejectClub(club)}
                                        className="px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-1"
                                    >
                                        <X size={12} /> Reject
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="grid lg:grid-cols-[260px_1fr] gap-4">
                <aside className="bg-white/[0.02] border border-white/10 rounded-2xl p-3 space-y-2 max-h-[70vh] overflow-y-auto flex flex-col">
                    <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-md pb-1 space-y-2">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                            <input
                                type="search"
                                value={listSearch}
                                onChange={(e) => setListSearch(e.target.value)}
                                placeholder="Search clubs…"
                                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-padel-green"
                            />
                        </div>
                        <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            {listSearch.trim()
                                ? `${filteredClubs.length} of ${clubs.filter((c) => c.status !== 'pending').length}`
                                : `${clubs.filter((c) => c.status !== 'pending').length} clubs`}
                        </p>
                    </div>
                    {clubs.length === 0 && !isCreating && (
                        <p className="text-xs text-gray-500 p-3">No clubs yet. Create one or apply the clubs migration.</p>
                    )}
                    {clubs.length > 0 && filteredClubs.length === 0 && (
                        <p className="text-xs text-gray-500 p-3">No clubs match “{listSearch.trim()}”.</p>
                    )}
                    {filteredClubs.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => { setSelectedId(c.id); setIsCreating(false); }}
                            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2.5 ${
                                selectedId === c.id && !isCreating
                                    ? 'bg-padel-green/15 text-padel-green border border-padel-green/30'
                                    : 'text-gray-300 hover:bg-white/5 border border-transparent'
                            }`}
                        >
                            {c.logo_url ? (
                                <img src={c.logo_url} alt="" className="w-7 h-7 rounded-lg object-cover border border-white/10" />
                            ) : (
                                <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-500">
                                    <MapPin size={12} />
                                </div>
                            )}
                            <span className="truncate flex-1">{c.short_name || c.name}</span>
                            <span className={`text-[8px] uppercase font-black ${c.status === 'published' ? 'text-padel-green' : 'text-gray-500'}`}>
                                {c.status}
                            </span>
                        </button>
                    ))}
                </aside>

                <div className="space-y-4 min-w-0">
                    {(selected || isCreating) ? (
                        <>
                            <div className="flex flex-wrap gap-2 justify-end">
                                {selected?.slug && selected.status === 'published' && (
                                    <a
                                        href={`/clubs/${selected.slug}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={ghostBtnClass}
                                    >
                                        <ExternalLink size={12} /> Public
                                    </a>
                                )}
                                {selected && (
                                    <button
                                        type="button"
                                        onClick={() => setMembersOpen(true)}
                                        className={ghostBtnClass}
                                    >
                                        <Users size={12} /> Members
                                    </button>
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
                            </div>

                            <CollapsibleSection
                                open={sectionOpen.profile}
                                onToggle={() => toggleSection('profile')}
                                title="Profile"
                                icon={MapPin}
                            >
                                <div className="grid md:grid-cols-2 gap-3">
                                    <label className={labelClass}>
                                        Name
                                        <input
                                            value={form.name ?? ''}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setForm((prev) => ({
                                                    ...prev,
                                                    name: v,
                                                    ...(isCreating && !slugManual
                                                        ? { slug: slugifyClub(v) }
                                                        : {}),
                                                }));
                                            }}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Short name
                                        <input
                                            value={form.short_name ?? ''}
                                            onChange={(e) => updateField('short_name', e.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Slug
                                        <input
                                            value={form.slug ?? ''}
                                            onChange={(e) => {
                                                setSlugManual(true);
                                                updateField('slug', e.target.value);
                                            }}
                                            className={inputClass}
                                            placeholder="auto from name"
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        City
                                        <input
                                            value={form.city ?? ''}
                                            onChange={(e) => updateField('city', e.target.value)}
                                            className={inputClass}
                                            placeholder="Auto from address"
                                        />
                                    </label>
                                    <div className="md:col-span-2">
                                        <label className={labelClass}>Address</label>
                                        <input
                                            key={selectedId || (isCreating ? 'new-club' : 'no-club')}
                                            ref={addressInputRef}
                                            value={form.address || ''}
                                            onChange={(e) => updateField('address', e.target.value)}
                                            placeholder="Start typing to search Google..."
                                            autoComplete="off"
                                            className={inputClass}
                                        />
                                        <p className="text-[10px] text-gray-500 mt-1 normal-case tracking-normal font-medium">
                                            Powered by Google — selecting a result auto-fills city, latitude and longitude.
                                        </p>
                                    </div>
                                    <label className={labelClass}>
                                        Website
                                        <input
                                            value={form.website_url ?? ''}
                                            onChange={(e) => updateField('website_url', e.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Contact email
                                        <input
                                            value={form.contact_email ?? ''}
                                            onChange={(e) => updateField('contact_email', e.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Contact phone
                                        <input
                                            value={form.contact_phone ?? ''}
                                            onChange={(e) => updateField('contact_phone', e.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        WhatsApp
                                        <input
                                            value={form.whatsapp_number ?? ''}
                                            onChange={(e) => updateField('whatsapp_number', e.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <div className="md:col-span-2 bg-black/30 border border-white/5 rounded-2xl p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Palette size={14} style={{ color: form.brand_color || '#CC1414' }} />
                                            <p className="text-xs font-bold text-white">Brand colour</p>
                                            <span className="text-[10px] text-gray-500">— accents on the public club page</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {COLOR_PRESETS.map((c) => (
                                                <button
                                                    key={c}
                                                    type="button"
                                                    onClick={() => updateField('brand_color', c)}
                                                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                                                        form.brand_color === c ? 'border-white scale-110' : 'border-transparent'
                                                    }`}
                                                    style={{ background: c }}
                                                    title={c}
                                                />
                                            ))}
                                            <input
                                                type="color"
                                                value={/^#[0-9A-Fa-f]{6}$/.test(form.brand_color || '') ? form.brand_color : '#CC1414'}
                                                onChange={(e) => updateField('brand_color', e.target.value)}
                                                className="w-8 h-8 rounded-full border border-white/20 bg-transparent cursor-pointer"
                                                title="Custom colour"
                                            />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 ml-1">
                                                {form.brand_color || '#CC1414'}
                                            </span>
                                        </div>
                                    </div>
                                    <label className={labelClass}>
                                        Latitude
                                        <input
                                            value={form.lat ?? ''}
                                            onChange={(e) => updateField('lat', e.target.value)}
                                            className={inputClass}
                                            placeholder="Auto from address"
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Longitude
                                        <input
                                            value={form.lng ?? ''}
                                            onChange={(e) => updateField('lng', e.target.value)}
                                            className={inputClass}
                                            placeholder="Auto from address"
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Status
                                        <select
                                            value={form.status}
                                            onChange={(e) => updateField('status', e.target.value)}
                                            className={inputClass}
                                        >
                                            <option value="draft">draft</option>
                                            <option value="pending">pending</option>
                                            <option value="published">published</option>
                                            <option value="archived">archived</option>
                                            <option value="rejected">rejected</option>
                                        </select>
                                    </label>
                                    <div className="flex items-center gap-4 pt-6">
                                        <label className="flex items-center gap-2 text-xs text-gray-300 font-bold">
                                            <input type="checkbox" checked={!!form.verified} onChange={(e) => updateField('verified', e.target.checked)} />
                                            Verified
                                        </label>
                                        <label className="flex items-center gap-2 text-xs text-gray-300 font-bold">
                                            <input type="checkbox" checked={!!form.sapa_registered} onChange={(e) => updateField('sapa_registered', e.target.checked)} />
                                            SAPA registered
                                        </label>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-3">
                                    <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                                        {form.logo_url ? (
                                            <img src={form.logo_url} alt="logo" className="w-16 h-16 rounded-2xl object-cover bg-white border border-white/10 shrink-0" />
                                        ) : (
                                            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                                <MapPin size={24} />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-white">Club Logo</p>
                                            <label className="inline-flex items-center gap-1.5 mt-2 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer">
                                                <Upload size={11} /> {uploading === 'logo' ? 'Uploading…' : 'Upload'}
                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'logo')} disabled={!!uploading} />
                                            </label>
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
                                            <p className="text-xs font-bold text-white">Hero Cover</p>
                                            <label className="inline-flex items-center gap-1.5 mt-2 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer">
                                                <Upload size={11} /> {uploading === 'cover' ? 'Uploading…' : 'Upload'}
                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'cover')} disabled={!!uploading} />
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <label className={labelClass}>
                                    About
                                    <textarea
                                        value={form.about || ''}
                                        onChange={(e) => updateField('about', e.target.value)}
                                        rows={3}
                                        className={inputClass}
                                    />
                                </label>
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.sponsor} onToggle={() => toggleSection('sponsor')} title="Principal Sponsor Banner" icon={Building}>
                                <div className="grid md:grid-cols-2 gap-3">
                                    <label className={labelClass}>
                                        Sponsor name
                                        <input
                                            value={form.principal_sponsor?.name || ''}
                                            onChange={(e) => updateField('principal_sponsor', { ...(form.principal_sponsor || {}), name: e.target.value })}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Sponsor URL
                                        <input
                                            value={form.principal_sponsor?.url || ''}
                                            onChange={(e) => updateField('principal_sponsor', { ...(form.principal_sponsor || {}), url: e.target.value })}
                                            className={inputClass}
                                            placeholder="https://..."
                                        />
                                    </label>
                                </div>
                                <div className="flex items-center gap-3">
                                    {form.principal_sponsor?.logo_url && (
                                        <img src={form.principal_sponsor.logo_url} alt="" className="h-10 object-contain bg-white/5 rounded-lg px-2" />
                                    )}
                                    <label className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer">
                                        <Upload size={11} /> {uploading === 'principal' ? 'Uploading…' : 'Logo'}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'principal')} disabled={!!uploading} />
                                    </label>
                                    {form.principal_sponsor && (
                                        <button type="button" onClick={() => updateField('principal_sponsor', null)} className="text-red-400 text-xs font-bold">Clear</button>
                                    )}
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.socials}
                                onToggle={() => toggleSection('socials')}
                                title="Social Media"
                                icon={Instagram}
                                count={Object.values(normaliseSocials(form.socials)).filter((v) => String(v || '').trim()).length}
                            >
                                <div className="grid md:grid-cols-2 gap-3">
                                    {[
                                        ['instagram', 'Instagram', Instagram],
                                        ['facebook', 'Facebook', Facebook],
                                        ['tiktok', 'TikTok', ExternalLink],
                                        ['youtube', 'YouTube', Youtube],
                                    ].map((entry) => {
                                        const key = entry[0];
                                        const label = entry[1];
                                        const SocialIcon = entry[2];
                                        return (
                                        <label key={key} className={labelClass}>
                                            {label}
                                            <div className="relative mt-1">
                                                <SocialIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                                <input
                                                    value={form.socials?.[key] || ''}
                                                    onChange={(e) => updateField('socials', { ...normaliseSocials(form.socials), [key]: e.target.value })}
                                                    className={`${inputClass} !mt-0 pl-9`}
                                                    placeholder="https://..."
                                                />
                                            </div>
                                        </label>
                                        );
                                    })}
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.courts} onToggle={() => toggleSection('courts')} title="Courts" icon={MapPin}>
                                {['indoor', 'outdoor'].map((side) => (
                                    <div key={side} className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-3">
                                        <p className="text-xs font-black uppercase tracking-wider text-white">{side} courts</p>
                                        <div className="grid sm:grid-cols-2 gap-3">
                                            <label className={labelClass}>
                                                Count
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={form.courts?.[side]?.count ?? 0}
                                                    onChange={(e) => updateField('courts', {
                                                        ...form.courts,
                                                        [side]: { ...form.courts[side], count: Number(e.target.value) || 0 },
                                                    })}
                                                    className={inputClass}
                                                />
                                            </label>
                                            <label className={labelClass}>
                                                Features (comma-separated)
                                                <input
                                                    value={featuresText(side)}
                                                    onChange={(e) => setFeaturesText(side, e.target.value)}
                                                    className={inputClass}
                                                    placeholder="Panoramic glass, LED lighting"
                                                />
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {form.courts?.[side]?.image_url && (
                                                <img src={form.courts[side].image_url} alt="" className="w-20 h-14 rounded-lg object-cover" />
                                            )}
                                            <label className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer">
                                                <Upload size={11} /> {uploading === side ? 'Uploading…' : 'Photo'}
                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, side)} disabled={!!uploading} />
                                            </label>
                                        </div>
                                    </div>
                                ))}
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.cafe} onToggle={() => toggleSection('cafe')} title="Café / Restaurant" icon={Building}>
                                <div className="grid md:grid-cols-2 gap-3">
                                    <label className={labelClass}>
                                        Name
                                        <input
                                            value={form.cafe?.name || ''}
                                            onChange={(e) => updateField('cafe', { ...(form.cafe || {}), name: e.target.value })}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className={labelClass}>
                                        Hours note
                                        <input
                                            value={form.cafe?.hours_note || ''}
                                            onChange={(e) => updateField('cafe', { ...(form.cafe || {}), hours_note: e.target.value })}
                                            className={inputClass}
                                            placeholder="Daily · On-site"
                                        />
                                    </label>
                                </div>
                                <label className={labelClass}>
                                    Description
                                    <textarea
                                        value={form.cafe?.description || ''}
                                        onChange={(e) => updateField('cafe', { ...(form.cafe || {}), description: e.target.value })}
                                        rows={2}
                                        className={inputClass}
                                    />
                                </label>
                                <label className={labelClass}>
                                    Tags (comma-separated)
                                    <input
                                        value={(form.cafe?.tags || []).join(', ')}
                                        onChange={(e) => updateField('cafe', {
                                            ...(form.cafe || {}),
                                            tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                                        })}
                                        className={inputClass}
                                    />
                                </label>
                                <label className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer">
                                    <Upload size={11} /> {uploading === 'cafe' ? 'Uploading…' : 'Photo'}
                                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'cafe')} disabled={!!uploading} />
                                </label>
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.services}
                                onToggle={() => toggleSection('services')}
                                title="Services"
                                icon={Building}
                                count={(form.services || []).length}
                                actions={(
                                    <button
                                        type="button"
                                        onClick={() => updateField('services', [...(form.services || []), { title: '', description: '', tags: [] }])}
                                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-wider text-white"
                                    >
                                        <Plus size={12} className="inline" /> Add
                                    </button>
                                )}
                            >
                                {(form.services || []).length === 0 ? (
                                    <p className="text-sm text-gray-500">No services yet — e.g. Pro shop, Coaching, Parking.</p>
                                ) : (
                                    <ul className="space-y-2">
                                        {(form.services || []).map((svc, idx) => (
                                            <li key={idx} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 bg-black/30 border border-white/5 rounded-xl p-2.5">
                                                <input
                                                    value={svc.title || ''}
                                                    onChange={(e) => {
                                                        const next = [...form.services];
                                                        next[idx] = { ...next[idx], title: e.target.value };
                                                        updateField('services', next);
                                                    }}
                                                    placeholder="Title"
                                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                                />
                                                <input
                                                    value={svc.description || ''}
                                                    onChange={(e) => {
                                                        const next = [...form.services];
                                                        next[idx] = { ...next[idx], description: e.target.value };
                                                        updateField('services', next);
                                                    }}
                                                    placeholder="Description"
                                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => updateField('services', form.services.filter((_, i) => i !== idx))}
                                                    className="text-red-400 p-2"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.hours} onToggle={() => toggleSection('hours')} title="Opening Hours" icon={Building}>
                                <div className="space-y-2">
                                    {Object.keys(DAY_LABELS).map((day) => (
                                        <div key={day} className="grid grid-cols-[100px_1fr_1fr_auto] gap-2 items-center">
                                            <span className="text-xs font-bold text-gray-400">{DAY_LABELS[day]}</span>
                                            <input
                                                type="time"
                                                disabled={!!form.opening_hours?.[day]?.closed}
                                                value={form.opening_hours?.[day]?.open || ''}
                                                onChange={(e) => updateField('opening_hours', {
                                                    ...form.opening_hours,
                                                    [day]: { ...form.opening_hours[day], open: e.target.value },
                                                })}
                                                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
                                            />
                                            <input
                                                type="time"
                                                disabled={!!form.opening_hours?.[day]?.closed}
                                                value={form.opening_hours?.[day]?.close || ''}
                                                onChange={(e) => updateField('opening_hours', {
                                                    ...form.opening_hours,
                                                    [day]: { ...form.opening_hours[day], close: e.target.value },
                                                })}
                                                className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white"
                                            />
                                            <label className="text-[10px] text-gray-500 font-bold flex items-center gap-1">
                                                <input
                                                    type="checkbox"
                                                    checked={!!form.opening_hours?.[day]?.closed}
                                                    onChange={(e) => updateField('opening_hours', {
                                                        ...form.opening_hours,
                                                        [day]: { ...form.opening_hours[day], closed: e.target.checked },
                                                    })}
                                                />
                                                Closed
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.gallery}
                                onToggle={() => toggleSection('gallery')}
                                title="Gallery"
                                icon={ImageIcon}
                                count={(form.gallery || []).length}
                                actions={(
                                    <label className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-wider text-white cursor-pointer flex items-center gap-1">
                                        <Upload size={12} /> {uploading === 'gallery' ? '…' : 'Add'}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'gallery')} disabled={!!uploading} />
                                    </label>
                                )}
                            >
                                {(form.gallery || []).length === 0 ? (
                                    <p className="text-sm text-gray-500">No gallery images yet.</p>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                        {(form.gallery || []).map((img, idx) => (
                                            <div key={idx} className="relative group rounded-xl overflow-hidden border border-white/10">
                                                <img src={img.url} alt="" className="w-full h-28 object-cover" />
                                                <select
                                                    value={img.category || 'other'}
                                                    onChange={(e) => {
                                                        const next = [...form.gallery];
                                                        next[idx] = { ...next[idx], category: e.target.value };
                                                        updateField('gallery', next);
                                                    }}
                                                    className="absolute bottom-2 left-2 bg-black/80 text-[10px] text-white rounded px-1.5 py-0.5 border border-white/20"
                                                >
                                                    {['courts', 'cafe', 'facilities', 'events', 'other'].map((c) => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => updateField('gallery', form.gallery.filter((_, i) => i !== idx))}
                                                    className="absolute top-2 right-2 p-1 rounded bg-black/70 text-red-400"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.sponsors}
                                onToggle={() => toggleSection('sponsors')}
                                title="Sponsors & Partners"
                                icon={Building}
                                count={(form.sponsors || []).length}
                                actions={(
                                    <button
                                        type="button"
                                        onClick={() => updateField('sponsors', [...(form.sponsors || []), { name: '', tier: 'Partner', logo_url: '' }])}
                                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-wider text-white"
                                    >
                                        Add
                                    </button>
                                )}
                            >
                                {(form.sponsors || []).map((sp, idx) => (
                                    <div key={idx} className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
                                        <input
                                            value={sp.name || ''}
                                            onChange={(e) => {
                                                const next = [...form.sponsors];
                                                next[idx] = { ...next[idx], name: e.target.value };
                                                updateField('sponsors', next);
                                            }}
                                            placeholder="Name"
                                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                        />
                                        <input
                                            value={sp.tier || ''}
                                            onChange={(e) => {
                                                const next = [...form.sponsors];
                                                next[idx] = { ...next[idx], tier: e.target.value };
                                                updateField('sponsors', next);
                                            }}
                                            placeholder="Tier"
                                            className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                        />
                                        <button type="button" onClick={() => updateField('sponsors', form.sponsors.filter((_, i) => i !== idx))} className="text-red-400 p-2">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </CollapsibleSection>

                            <CollapsibleSection
                                open={sectionOpen.contacts}
                                onToggle={() => toggleSection('contacts')}
                                title="Contacts"
                                icon={Users}
                                count={(form.contacts || []).length}
                                actions={(
                                    <button
                                        type="button"
                                        onClick={() => updateField('contacts', [...(form.contacts || []), { name: '', role: '', email: '', phone: '', whatsapp: '' }])}
                                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-wider text-white"
                                    >
                                        Add
                                    </button>
                                )}
                            >
                                {(form.contacts || []).map((c, idx) => (
                                    <div key={idx} className="grid sm:grid-cols-2 gap-2 bg-black/30 border border-white/5 rounded-xl p-3">
                                        {['name', 'role', 'email', 'phone', 'whatsapp'].map((key) => (
                                            <input
                                                key={key}
                                                value={c[key] || ''}
                                                onChange={(e) => {
                                                    const next = [...form.contacts];
                                                    next[idx] = { ...next[idx], [key]: e.target.value };
                                                    updateField('contacts', next);
                                                }}
                                                placeholder={key}
                                                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white capitalize"
                                            />
                                        ))}
                                        <button type="button" onClick={() => updateField('contacts', form.contacts.filter((_, i) => i !== idx))} className="text-red-400 text-xs font-bold text-left">
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.orgs} onToggle={() => toggleSection('orgs')} title="Linked Organisations" icon={Building} count={linkedOrgIds.length}>
                                {!selectedId ? (
                                    <p className="text-sm text-gray-500">Save the club first, then link organisations.</p>
                                ) : (
                                    <>
                                        <div className="flex gap-2">
                                            <select
                                                value={assignOrgId}
                                                onChange={(e) => setAssignOrgId(e.target.value)}
                                                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                                            >
                                                <option value="">Select organisation…</option>
                                                {approvedOrgs
                                                    .filter((o) => !linkedOrgIds.includes(o.id))
                                                    .map((o) => (
                                                        <option key={o.id} value={o.id}>{o.name}</option>
                                                    ))}
                                            </select>
                                            <button type="button" onClick={handleAssignOrg} disabled={!assignOrgId} className="px-3 py-2 rounded-xl bg-padel-green text-black text-xs font-black disabled:opacity-40">
                                                Link
                                            </button>
                                        </div>
                                        <ul className="space-y-2">
                                            {linkedOrgIds.map((oid) => {
                                                const org = approvedOrgs.find((o) => o.id === oid);
                                                if (!org) return null;
                                                return (
                                                    <li key={oid} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                                                        <span className="text-sm text-white font-bold">{org.name}</span>
                                                        <button type="button" onClick={() => handleUnlinkOrg(oid)} className="text-red-400 text-xs font-bold">Unlink</button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </>
                                )}
                            </CollapsibleSection>

                            <CollapsibleSection open={sectionOpen.federation} onToggle={() => toggleSection('federation')} title="Federation" icon={Building}>
                                <label className={labelClass}>
                                    Linked federation
                                    <select
                                        value={form.federation_id || ''}
                                        onChange={(e) => updateField('federation_id', e.target.value)}
                                        className={inputClass}
                                    >
                                        <option value="">None</option>
                                        {federations.map((f) => (
                                            <option key={f.id} value={f.id}>{f.short_name || f.name}</option>
                                        ))}
                                    </select>
                                </label>
                            </CollapsibleSection>
                        </>
                    ) : (
                        <div className="text-center py-20 text-gray-500 text-sm border border-white/5 rounded-2xl">
                            Select a club or create a new one.
                        </div>
                    )}
                </div>
            </div>

            {membersOpen && selected && (
                <ClubMembersManager club={selected} onClose={() => setMembersOpen(false)} />
            )}
        </div>
    );
};

export default ClubManager;
