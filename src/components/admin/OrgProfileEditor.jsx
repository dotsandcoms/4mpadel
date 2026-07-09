import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';
import {
    Building, Globe, Mail, Phone, MessageCircle, Upload, Trash2, Plus,
    Save, Palette, Image as ImageIcon, Instagram, Facebook, Youtube,
    ExternalLink, User, Eye
} from 'lucide-react';

const inputClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-padel-green focus:outline-none transition-colors placeholder:text-gray-600";
const labelClass = "block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest";

const COLOR_PRESETS = ['#9AE900', '#F97316', '#3B82F6', '#EF4444', '#A855F7', '#14B8A6', '#EAB308', '#EC4899'];

const emptyContact = () => ({ role: '', name: '', email: '', phone: '', whatsapp: '' });

const CONTACT_ROLE_OPTIONS = [
    'Tournament Director',
    'Tournament Referee',
    'Registrations & Admin',
    'Media Contact',
    'Sponsorship Contact',
    'Club Manager',
    'General Enquiries',
];

/** Preserve legacy/custom roles already saved on the org profile. */
const roleOptionsForContact = (currentRole) => {
    const role = (currentRole || '').trim();
    if (role && !CONTACT_ROLE_OPTIONS.includes(role)) {
        return [role, ...CONTACT_ROLE_OPTIONS];
    }
    return CONTACT_ROLE_OPTIONS;
};

/**
 * Org portal profile editor — everything the public /organisations/:slug
 * page renders. Privileged fields (status, verified, sapa badges, slug)
 * are DB-protected; orgs edit content only.
 */
const OrgProfileEditor = ({ org, onSaved, adminMode = false }) => {
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(null); // 'logo' | 'cover'

    useEffect(() => {
        if (!org) return;
        setForm({
            name: org.name || '',
            org_type: org.org_type || 'Tournament Organiser',
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
                ? org.contacts.map(c => ({ ...emptyContact(), ...c }))
                : [],
            ...(adminMode ? {
                status: org.status || 'pending',
                verified: Boolean(org.verified),
                sapa_sanctioned: Boolean(org.sapa_sanctioned),
            } : {}),
        });
    }, [org, adminMode]);

    if (!org || !form) return null;

    const setField = (name, value) => setForm(prev => ({ ...prev, [name]: value }));
    const setSocial = (name, value) => setForm(prev => ({ ...prev, socials: { ...prev.socials, [name]: value } }));
    const setContact = (idx, key, value) =>
        setForm(prev => ({ ...prev, contacts: prev.contacts.map((c, i) => i === idx ? { ...c, [key]: value } : c) }));

    const handleUpload = async (e, kind) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const maxMb = kind === 'logo' ? 2 : 5;
        if (file.size > maxMb * 1024 * 1024) return toast.error(`${kind === 'logo' ? 'Logo' : 'Cover'} must be under ${maxMb}MB.`);
        setUploading(kind);
        try {
            const ext = file.name.split('.').pop();
            const path = `organisations/${kind === 'logo' ? 'logos' : 'covers'}/${org.id}_${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from('profile-pics').upload(path, file, { cacheControl: '3600', upsert: true });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('profile-pics').getPublicUrl(path);
            setField(kind === 'logo' ? 'logo_url' : 'cover_image_url', publicUrl);
            toast.success(`${kind === 'logo' ? 'Logo' : 'Cover image'} uploaded 🎨`);
        } catch (err) {
            toast.error(`Upload failed: ${err.message}`);
        } finally {
            setUploading(null);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return toast.error('Organisation name is required.');
        if (!form.contact_email.trim()) return toast.error('Contact email is required.');
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                org_type: form.org_type.trim() || 'Tournament Organiser',
                coverage: form.coverage.trim() || null,
                year_established: form.year_established === '' ? null : parseInt(form.year_established),
                about: form.about.trim() || null,
                brand_color: form.brand_color || null,
                logo_url: form.logo_url || null,
                cover_image_url: form.cover_image_url || null,
                contact_email: form.contact_email.trim(),
                contact_phone: form.contact_phone.trim() || null,
                whatsapp_number: form.whatsapp_number.trim() || null,
                website_url: form.website_url.trim() || null,
                socials: Object.fromEntries(Object.entries(form.socials).map(([k, v]) => [k, v.trim()])),
                contacts: form.contacts
                    .filter(c => (c.role || c.name || c.email || c.phone).trim?.() !== '' || c.role || c.name || c.email || c.phone)
                    .map(c => ({
                        role: c.role.trim(), name: c.name.trim(), email: c.email.trim(),
                        phone: c.phone.trim(), whatsapp: c.whatsapp.trim(),
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

            toast.success(adminMode ? 'Organisation updated successfully.' : 'Profile updated — your public page is live with the changes 🎾');
            onSaved?.(data[0]);
        } catch (err) {
            console.error('Org profile save failed:', err);
            toast.error(`Save failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSave} className="space-y-8 text-left">
            {/* Header + preview link */}
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

            {adminMode && (
                <div className="space-y-4">
                    <span className="block text-[10px] font-black uppercase tracking-[0.25em] text-amber-400">Platform Admin</span>
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
                </div>
            )}

            {/* Branding: logo, cover, colour */}
            <div className="space-y-4">
                <span className="block text-[10px] font-black uppercase tracking-[0.25em] text-padel-green">Branding</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Logo */}
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

                    {/* Cover */}
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

                {/* Brand colour */}
                <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Palette size={14} style={{ color: form.brand_color }} />
                        <p className="text-xs font-bold text-white">Brand Colour</p>
                        <span className="text-[10px] text-gray-500">— drives buttons & accents on your public page</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {COLOR_PRESETS.map(c => (
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

            {/* Identity */}
            <div className="space-y-4">
                <span className="block text-[10px] font-black uppercase tracking-[0.25em] text-padel-green">Identity</span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Organisation Name *</label>
                        <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} className={inputClass} />
                    </div>
                    <div>
                        <label className={labelClass}>Organisation Type</label>
                        <input type="text" value={form.org_type} onChange={(e) => setField('org_type', e.target.value)} placeholder="Tournament Organiser" className={inputClass} />
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

            {/* Contact channels */}
            <div className="space-y-4">
                <span className="block text-[10px] font-black uppercase tracking-[0.25em] text-padel-green">Contact & Website</span>
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
                        <input type="text" value={form.website_url} onChange={(e) => setField('website_url', e.target.value)} placeholder="www.yourorg.co.za" className={inputClass} />
                    </div>
                </div>
            </div>

            {/* Socials */}
            <div className="space-y-4">
                <span className="block text-[10px] font-black uppercase tracking-[0.25em] text-padel-green">Social Media</span>
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
                                    placeholder={`https://...`}
                                    className={`${inputClass} pl-10`}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Contacts directory */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <span className="block text-[10px] font-black uppercase tracking-[0.25em] text-padel-green">Contact Directory</span>
                    <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, contacts: [...prev.contacts, emptyContact()] }))}
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
                                    onClick={() => setForm(prev => ({ ...prev, contacts: prev.contacts.filter((_, idx) => idx !== i) }))}
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

            {/* Save */}
            <div className="pt-2 border-t border-white/5 flex justify-end">
                <button
                    type="submit"
                    disabled={saving || uploading}
                    className="inline-flex items-center gap-2 bg-padel-green text-black font-black uppercase tracking-widest text-xs px-8 py-4 rounded-xl hover:bg-white transition-all cursor-pointer disabled:opacity-50 shadow-lg shadow-padel-green/10"
                >
                    <Save size={14} /> {saving ? 'Saving...' : (adminMode ? 'Save Organisation' : 'Save Profile')}
                </button>
            </div>
        </form>
    );
};

export default OrgProfileEditor;
