import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    ArrowLeft, Building2, ExternalLink, Facebook, Instagram, Loader2, Plus, RefreshCw, Save, Search, Upload, UserPlus, Users, X,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import {
    CLUB_STATUSES,
    clubStatusBadgeClass,
    clubStatusLabel,
    normalizeClubStatus,
    slugifyClub,
} from '../../utils/club';
import {
    cascadeGroupBrandingToVenues,
    setClubGroupVenues,
} from '../../utils/clubGroup';

const emptyForm = () => ({
    name: '',
    short_name: '',
    slug: '',
    about: '',
    website_url: '',
    brand_color: '#CC1414',
    status: 'published',
    contact_email: '',
    contact_phone: '',
    whatsapp_number: '',
    city: '',
    province: '',
    logo_url: '',
    cover_image_url: '',
    share_logo: false,
    share_website: false,
    socials: { instagram: '', facebook: '', tiktok: '', playtomic: '' },
});

const inputClass =
    'w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-padel-green';
const labelClass = 'block text-[10px] font-black uppercase tracking-wider text-gray-500 space-y-1.5';

/**
 * Admin CRUD for club groups (brand umbrellas) and venue linking.
 * @param {{ onBack: () => void }} props
 */
const ClubGroupManager = ({ onBack }) => {
    const [groups, setGroups] = useState([]);
    const [allClubs, setAllClubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(null);
    const [selectedId, setSelectedId] = useState(null);
    const [isCreating, setIsCreating] = useState(false);
    const [form, setForm] = useState(emptyForm());
    const [slugManual, setSlugManual] = useState(false);
    const [venueIds, setVenueIds] = useState([]);
    const [venueSearch, setVenueSearch] = useState('');
    const [listSearch, setListSearch] = useState('');
    const [memberSearch, setMemberSearch] = useState('');
    const [memberResults, setMemberResults] = useState([]);
    const [memberRole, setMemberRole] = useState('owner');
    const [assigningMember, setAssigningMember] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [gRes, cRes] = await Promise.all([
                supabase.from('club_groups').select('*').order('name', { ascending: true }),
                supabase
                    .from('clubs')
                    .select('id, name, short_name, city, logo_url, status, group_id')
                    .order('name', { ascending: true }),
            ]);
            if (gRes.error) throw gRes.error;
            if (cRes.error) throw cRes.error;
            setGroups(gRes.data || []);
            setAllClubs(cRes.data || []);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to load groups');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        const query = memberSearch.trim().replace(/[,%()]/g, ' ');
        if (query.length < 2) {
            setMemberResults([]);
            return undefined;
        }

        const timer = setTimeout(async () => {
            const { data, error } = await supabase
                .from('players')
                .select('id, name, email, image_url')
                .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
                .not('email', 'is', null)
                .limit(8);

            if (error) {
                console.error(error);
                setMemberResults([]);
                return;
            }
            setMemberResults(data || []);
        }, 300);

        return () => clearTimeout(timer);
    }, [memberSearch]);

    const venueCounts = useMemo(() => {
        const counts = {};
        for (const club of allClubs) {
            if (!club.group_id) continue;
            counts[club.group_id] = (counts[club.group_id] || 0) + 1;
        }
        return counts;
    }, [allClubs]);

    const filteredGroups = useMemo(() => {
        const q = listSearch.trim().toLowerCase();
        if (!q) return groups;
        return groups.filter(
            (g) =>
                g.name?.toLowerCase().includes(q)
                || g.short_name?.toLowerCase().includes(q)
                || g.slug?.toLowerCase().includes(q)
                || g.city?.toLowerCase().includes(q),
        );
    }, [groups, listSearch]);

    const updateField = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const startCreate = () => {
        setSelectedId(null);
        setIsCreating(true);
        setForm(emptyForm());
        setSlugManual(false);
        setVenueIds([]);
        setVenueSearch('');
        setMemberSearch('');
        setMemberResults([]);
        setMemberRole('owner');
    };

    const openGroup = (group) => {
        setIsCreating(false);
        setSelectedId(group.id);
        setForm({
            ...emptyForm(),
            ...group,
            status: normalizeClubStatus(group.status) || 'published',
            socials: {
                instagram: group.socials?.instagram || '',
                facebook: group.socials?.facebook || '',
                tiktok: group.socials?.tiktok || '',
                playtomic: group.socials?.playtomic || '',
            },
            share_logo: !!group.share_logo,
            share_website: !!group.share_website,
        });
        setSlugManual(true);
        setVenueIds(allClubs.filter((c) => c.group_id === group.id).map((c) => c.id));
        setVenueSearch('');
        setMemberSearch('');
        setMemberResults([]);
        setMemberRole('owner');
    };

    const handleUpload = async (e, kind) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(kind);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const path = `club-groups/${selectedId || 'new'}/${kind}-${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from('profile-pics').upload(path, file, {
                upsert: true,
                contentType: file.type,
            });
            if (upErr) throw upErr;
            const { data: { publicUrl } } = supabase.storage.from('profile-pics').getPublicUrl(path);
            if (!publicUrl) throw new Error('Could not resolve public URL');
            if (kind === 'logo') updateField('logo_url', publicUrl);
            else updateField('cover_image_url', publicUrl);
            toast.success('Image uploaded');
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Upload failed');
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
                status: normalizeClubStatus(form.status) || 'published',
                contact_email: form.contact_email || null,
                contact_phone: form.contact_phone || null,
                whatsapp_number: form.whatsapp_number || null,
                city: form.city || null,
                province: form.province || null,
                logo_url: form.logo_url || null,
                cover_image_url: form.cover_image_url || null,
                share_logo: !!form.share_logo,
                share_website: !!form.share_website,
                socials: {
                    instagram: form.socials?.instagram || '',
                    facebook: form.socials?.facebook || '',
                    tiktok: form.socials?.tiktok || '',
                    playtomic: form.socials?.playtomic || '',
                },
                updated_at: new Date().toISOString(),
            };

            let groupId = selectedId;
            if (isCreating || !selectedId) {
                const { data, error } = await supabase
                    .from('club_groups')
                    .insert([payload])
                    .select('*')
                    .single();
                if (error) throw error;
                groupId = data.id;
                setSelectedId(data.id);
                setIsCreating(false);
                setGroups((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            } else {
                const { data, error } = await supabase
                    .from('club_groups')
                    .update(payload)
                    .eq('id', selectedId)
                    .select('*')
                    .single();
                if (error) throw error;
                setGroups((prev) => prev.map((g) => (g.id === data.id ? data : g)));
            }

            await setClubGroupVenues(groupId, venueIds);
            await cascadeGroupBrandingToVenues({
                id: groupId,
                logo_url: payload.logo_url,
                website_url: payload.website_url,
                share_logo: payload.share_logo,
                share_website: payload.share_website,
            });

            toast.success(isCreating ? 'Group created' : 'Group saved');
            await load();
            const refreshed = (await supabase.from('club_groups').select('*').eq('id', groupId).maybeSingle()).data;
            if (refreshed) openGroup(refreshed);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const toggleVenue = (clubId) => {
        setVenueIds((prev) =>
            prev.includes(clubId) ? prev.filter((id) => id !== clubId) : [...prev, clubId],
        );
    };

    const assignMemberToAllVenues = async (player) => {
        if (!player?.email) {
            toast.error('This player does not have an email address');
            return;
        }
        if (venueIds.length === 0) {
            toast.error('Link at least one venue before assigning group access');
            return;
        }

        setAssigningMember(true);
        try {
            const email = player.email.trim().toLowerCase();
            let targetClubIds = venueIds;

            // Assigning admin must never downgrade an existing owner membership.
            if (memberRole === 'admin') {
                const { data: existing, error: existingError } = await supabase
                    .from('club_members')
                    .select('club_id, role')
                    .in('club_id', venueIds)
                    .ilike('user_email', email);
                if (existingError) throw existingError;
                const ownerClubIds = new Set(
                    (existing || []).filter((member) => member.role === 'owner').map((member) => member.club_id),
                );
                targetClubIds = venueIds.filter((clubId) => !ownerClubIds.has(clubId));
            }

            if (targetClubIds.length > 0) {
                const rows = targetClubIds.map((clubId) => ({
                    club_id: clubId,
                    player_id: player.id,
                    user_email: email,
                    role: memberRole,
                }));
                const { error } = await supabase
                    .from('club_members')
                    .upsert(rows, { onConflict: 'club_id,user_email' });
                if (error) throw error;
            }

            toast.success(`${player.name || email} is now ${memberRole} across ${venueIds.length} ${venueIds.length === 1 ? 'venue' : 'venues'}`);
            setMemberSearch('');
            setMemberResults([]);
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Could not assign group access');
        } finally {
            setAssigningMember(false);
        }
    };

    const clubPickerOptions = useMemo(() => {
        const q = venueSearch.trim().toLowerCase();
        return allClubs.filter((c) => {
            const inThisGroup = venueIds.includes(c.id);
            const available = !c.group_id || c.group_id === selectedId || inThisGroup;
            if (!available) return false;
            if (!q) return true;
            return (
                c.name?.toLowerCase().includes(q)
                || c.short_name?.toLowerCase().includes(q)
                || c.city?.toLowerCase().includes(q)
            );
        });
    }, [allClubs, venueIds, venueSearch, selectedId]);

    const editing = isCreating || !!selectedId;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
                <Loader2 className="animate-spin" size={18} /> Loading groups…
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="mt-1 p-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5"
                        aria-label="Back to clubs"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                            <Building2 className="text-padel-green" size={22} /> Club Groups
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">
                            Brand umbrellas with linked venue clubs. Groups are optional — most clubs stay standalone.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={load}
                        className="px-3 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-bold flex items-center gap-2"
                    >
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button
                        type="button"
                        onClick={startCreate}
                        className="px-3 py-2 rounded-xl bg-padel-green text-black text-sm font-black flex items-center gap-2"
                    >
                        <Plus size={14} /> New Group
                    </button>
                </div>
            </div>

            {!editing ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden shadow-2xl">
                    <div className="flex flex-col gap-3 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between">
                        <p className="text-sm text-gray-500">{filteredGroups.length} groups</p>
                        <div className="relative w-full md:w-[320px]">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                            <input
                                type="search"
                                value={listSearch}
                                onChange={(e) => setListSearch(e.target.value)}
                                placeholder="Search groups..."
                                className="w-full bg-black/40 border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-padel-green"
                            />
                        </div>
                    </div>
                    {filteredGroups.length === 0 ? (
                        <div className="p-10 text-center text-sm text-gray-500">
                            No groups yet. Create one for brands like Atlantic Padel or 10by20.
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {filteredGroups.map((group) => (
                                <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => openGroup(group)}
                                    className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-white/[0.04] transition-colors bg-transparent border-0 cursor-pointer"
                                >
                                    {group.logo_url ? (
                                        <img src={group.logo_url} alt="" className="w-12 h-12 rounded-2xl object-cover border border-white/10 shrink-0" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                            <Building2 size={16} />
                                        </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-white truncate">{group.name}</p>
                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                            {venueCounts[group.id] || 0} venues
                                            {group.city ? ` · ${group.city}` : ''}
                                        </p>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${clubStatusBadgeClass(group.status)}`}>
                                        {clubStatusLabel(group.status)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedId(null);
                                setIsCreating(false);
                            }}
                            className="text-sm font-bold text-gray-400 hover:text-white flex items-center gap-1.5"
                        >
                            <X size={14} /> Close editor
                        </button>
                        <div className="flex items-center gap-2">
                            {form.slug && isPublicStatus(form.status) && (
                                <a
                                    href={`/groups/${slugifyClub(form.slug)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-bold flex items-center gap-2"
                                >
                                    <ExternalLink size={14} /> View page
                                </a>
                            )}
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 rounded-xl bg-padel-green text-black text-sm font-black flex items-center gap-2 disabled:opacity-60"
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                Save group
                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:p-5 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-padel-green/10 text-padel-green">
                                <Users size={16} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-wider text-white">Group access</h3>
                                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                                    Assign one person as owner or admin across all {venueIds.length} currently selected {venueIds.length === 1 ? 'venue' : 'venues'}.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 md:flex-row">
                            <div className="relative flex-1">
                                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="search"
                                    value={memberSearch}
                                    onChange={(e) => setMemberSearch(e.target.value)}
                                    placeholder="Search a player by name or email…"
                                    className={`${inputClass} pl-9`}
                                />
                            </div>
                            <select
                                value={memberRole}
                                onChange={(e) => setMemberRole(e.target.value)}
                                className={`${inputClass} md:w-40`}
                                aria-label="Group club role"
                            >
                                <option value="owner">Owner</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>

                        {memberSearch.trim().length >= 2 && (
                            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30 divide-y divide-white/5">
                                {memberResults.length === 0 ? (
                                    <p className="px-3 py-3 text-xs text-gray-500">No matching player profiles found.</p>
                                ) : (
                                    memberResults.map((player) => (
                                        <button
                                            key={player.id}
                                            type="button"
                                            onClick={() => assignMemberToAllVenues(player)}
                                            disabled={assigningMember || venueIds.length === 0}
                                            className="flex w-full items-center gap-3 bg-transparent px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {player.image_url ? (
                                                <img src={player.image_url} alt="" className="h-9 w-9 rounded-full border border-white/10 object-cover" />
                                            ) : (
                                                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-gray-500">
                                                    <Users size={14} />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-bold text-white">{player.name || player.email}</p>
                                                <p className="truncate text-[11px] text-gray-500">{player.email}</p>
                                            </div>
                                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-padel-green">
                                                {assigningMember ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                                                Add to all
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:p-5 space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-wider text-white">Profile</h3>
                        <div className="grid md:grid-cols-2 gap-3">
                            <label className={labelClass}>
                                Name
                                <input
                                    value={form.name}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setForm((prev) => ({
                                            ...prev,
                                            name: v,
                                            ...(isCreating && !slugManual ? { slug: slugifyClub(v) } : {}),
                                        }));
                                    }}
                                    className={inputClass}
                                />
                            </label>
                            <label className={labelClass}>
                                Short name
                                <input
                                    value={form.short_name}
                                    onChange={(e) => updateField('short_name', e.target.value)}
                                    className={inputClass}
                                />
                            </label>
                            <label className={labelClass}>
                                Slug
                                <input
                                    value={form.slug}
                                    onChange={(e) => {
                                        setSlugManual(true);
                                        updateField('slug', e.target.value);
                                    }}
                                    className={inputClass}
                                />
                            </label>
                            <label className={labelClass}>
                                Status
                                <select
                                    value={normalizeClubStatus(form.status)}
                                    onChange={(e) => updateField('status', e.target.value)}
                                    className={inputClass}
                                >
                                    {CLUB_STATUSES.map((status) => (
                                        <option key={status.value} value={status.value}>
                                            {status.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className={labelClass}>
                                City
                                <input
                                    value={form.city}
                                    onChange={(e) => updateField('city', e.target.value)}
                                    className={inputClass}
                                />
                            </label>
                            <label className={labelClass}>
                                Province
                                <input
                                    value={form.province}
                                    onChange={(e) => updateField('province', e.target.value)}
                                    className={inputClass}
                                />
                            </label>
                            <label className={`${labelClass} md:col-span-2`}>
                                About
                                <textarea
                                    value={form.about}
                                    onChange={(e) => updateField('about', e.target.value)}
                                    rows={3}
                                    className={inputClass}
                                />
                            </label>
                            <label className={labelClass}>
                                Website
                                <input
                                    value={form.website_url}
                                    onChange={(e) => updateField('website_url', e.target.value)}
                                    className={inputClass}
                                />
                            </label>
                            <label className={labelClass}>
                                Brand colour
                                <div className="flex min-h-11 items-center gap-3">
                                    <input
                                        type="color"
                                        value={form.brand_color || '#CC1414'}
                                        onChange={(e) => updateField('brand_color', e.target.value)}
                                        className="h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-white/15 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-full [&::-moz-color-swatch]:border-0"
                                        aria-label="Choose brand colour"
                                    />
                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                        {form.brand_color || '#CC1414'}
                                    </span>
                                </div>
                            </label>
                            <label className={labelClass}>
                                Contact email
                                <input
                                    value={form.contact_email}
                                    onChange={(e) => updateField('contact_email', e.target.value)}
                                    className={inputClass}
                                />
                            </label>
                            <label className={labelClass}>
                                Contact phone
                                <input
                                    value={form.contact_phone}
                                    onChange={(e) => updateField('contact_phone', e.target.value)}
                                    className={inputClass}
                                />
                            </label>
                            <label className={labelClass}>
                                WhatsApp
                                <input
                                    value={form.whatsapp_number}
                                    onChange={(e) => updateField('whatsapp_number', e.target.value)}
                                    className={inputClass}
                                />
                            </label>
                        </div>

                        <div className="border-t border-white/5 pt-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Instagram size={14} className="text-padel-green" />
                                <h4 className="text-xs font-black uppercase tracking-wider text-white">Social networks</h4>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                {[
                                    ['instagram', 'Instagram', Instagram, 'https://instagram.com/...'],
                                    ['facebook', 'Facebook', Facebook, 'https://facebook.com/...'],
                                    ['tiktok', 'TikTok', ExternalLink, 'https://tiktok.com/@...'],
                                    ['playtomic', 'Playtomic', ExternalLink, 'https://playtomic.com/...'],
                                ].map(([key, label, SocialIcon, placeholder]) => (
                                    <label key={key} className={labelClass}>
                                        {label}
                                        <div className="relative">
                                            {React.createElement(SocialIcon, {
                                                size: 14,
                                                className: 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500',
                                            })}
                                            <input
                                                type="url"
                                                value={form.socials?.[key] || ''}
                                                onChange={(e) => updateField('socials', {
                                                    ...form.socials,
                                                    [key]: e.target.value,
                                                })}
                                                placeholder={placeholder}
                                                className={`${inputClass} pl-9`}
                                            />
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-3">
                            <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
                                {form.logo_url ? (
                                    <img src={form.logo_url} alt="logo" className="w-16 h-16 rounded-2xl object-cover bg-white border border-white/10 shrink-0" />
                                ) : (
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                        <Building2 size={24} />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-white">Group Logo</p>
                                    <label className="inline-flex items-center gap-1.5 mt-2 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer">
                                        <Upload size={11} /> {uploading === 'logo' ? 'Uploading…' : 'Upload'}
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUpload(e, 'logo')} disabled={!!uploading} />
                                    </label>
                                </div>
                            </div>
                            <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-3">
                                <p className="text-xs font-bold text-white">Share with venues</p>
                                <label className="flex items-center gap-2 text-xs text-gray-300 font-bold cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!form.share_logo}
                                        onChange={(e) => updateField('share_logo', e.target.checked)}
                                    />
                                    Apply group logo to all venues
                                </label>
                                <label className="flex items-center gap-2 text-xs text-gray-300 font-bold cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!form.share_website}
                                        onChange={(e) => updateField('share_website', e.target.checked)}
                                    />
                                    Apply group website to all venues
                                </label>
                                <p className="text-[10px] text-gray-500 font-medium normal-case tracking-normal">
                                    When enabled, venue pages inherit these fields. Saving also writes them onto linked clubs.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-sm font-black uppercase tracking-wider text-white">
                                Venues ({venueIds.length})
                            </h3>
                            <div className="relative w-full md:w-[280px]">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                <input
                                    type="search"
                                    value={venueSearch}
                                    onChange={(e) => setVenueSearch(e.target.value)}
                                    placeholder="Find clubs to link…"
                                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-padel-green"
                                />
                            </div>
                        </div>
                        <div className="max-h-72 overflow-y-auto rounded-xl border border-white/5 divide-y divide-white/5">
                            {clubPickerOptions.length === 0 ? (
                                <p className="p-4 text-sm text-gray-500">No matching clubs available to link.</p>
                            ) : (
                                clubPickerOptions.map((club) => {
                                    const checked = venueIds.includes(club.id);
                                    return (
                                        <label
                                            key={club.id}
                                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03] cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleVenue(club.id)}
                                            />
                                            {club.logo_url ? (
                                                <img src={club.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-white/10" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-white font-bold truncate">{club.name}</p>
                                                <p className="text-[10px] text-gray-500">{club.city || 'No city'}</p>
                                            </div>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * @param {string|null|undefined} status
 */
function isPublicStatus(status) {
    const n = normalizeClubStatus(status);
    return n === 'published' || n === '4m_approved' || n === '4m_premium';
}

export default ClubGroupManager;
