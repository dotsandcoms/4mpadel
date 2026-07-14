import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Building, Mail, Phone, Globe, X, Loader2, Plus, Lock, Eye, EyeOff, Upload, Trash2, User } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { sendEmail } from '../../utils/emails';
import { toast } from 'sonner';

const inputClass = 'w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-padel-green transition-colors placeholder:text-gray-600';
const passwordInputClass = 'w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-11 py-3 text-sm text-white focus:outline-none focus:border-padel-green transition-colors placeholder:text-gray-600';

const slugify = (name) => name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeWebsiteUrl = (raw) => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed.replace(/^\/+/, '')}`;
};

/**
 * Super-admin modal to create an organisation already approved on the platform,
 * including auth login + minimal organisation player profile for the owner.
 * Owner is found by name first; email autofills when a profile exists.
 */
const CreateOrganisationModal = ({ isOpen, onClose, onCreated }) => {
    const [form, setForm] = useState({
        name: '',
        owner_name: '',
        contact_email: '',
        contact_phone: '',
        website_url: '',
        logo_url: '',
    });
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    /** idle | checking | existing | new */
    const [profileStatus, setProfileStatus] = useState('idle');
    const [matchedProfile, setMatchedProfile] = useState(null);
    const [nameSuggestions, setNameSuggestions] = useState([]);
    const [searchingNames, setSearchingNames] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const ownerNameRef = useRef(null);
    const selectedFromListRef = useRef(false);

    useEffect(() => {
        if (!isOpen) return undefined;

        const q = form.owner_name.trim();
        if (selectedFromListRef.current) {
            setNameSuggestions([]);
            setSearchingNames(false);
            return undefined;
        }
        if (q.length < 2) {
            setNameSuggestions([]);
            setSearchingNames(false);
            setProfileStatus('idle');
            setMatchedProfile(null);
            return undefined;
        }

        const timer = setTimeout(async () => {
            setSearchingNames(true);
            setProfileStatus('checking');
            try {
                const safe = q.replace(/[%_,]/g, ' ').trim();
                const { data, error } = await supabase
                    .from('players')
                    .select('id, name, email, contact_number, account_type')
                    .ilike('name', `%${safe}%`)
                    .order('name')
                    .limit(12);

                if (error) throw error;

                const rows = data || [];
                const sorted = [...rows].sort((a, b) => {
                    const ao = a.account_type === 'organisation' ? 0 : 1;
                    const bo = b.account_type === 'organisation' ? 0 : 1;
                    if (ao !== bo) return ao - bo;
                    return String(a.name || '').localeCompare(String(b.name || ''));
                });

                setNameSuggestions(sorted);
                setShowSuggestions(true);

                const exact = sorted.find(
                    (p) => String(p.name || '').toLowerCase() === q.toLowerCase(),
                );
                if (exact?.email) {
                    setMatchedProfile(exact);
                    setProfileStatus('existing');
                    setForm((prev) => ({
                        ...prev,
                        contact_email: exact.email,
                        contact_phone: exact.contact_number || prev.contact_phone,
                    }));
                    setPassword('');
                    setConfirmPassword('');
                } else {
                    setMatchedProfile(null);
                    setProfileStatus('new');
                }
            } catch {
                setNameSuggestions([]);
                setProfileStatus('new');
                setMatchedProfile(null);
            } finally {
                setSearchingNames(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [form.owner_name, isOpen]);

    useEffect(() => {
        const onDown = (e) => {
            if (ownerNameRef.current && !ownerNameRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    if (!isOpen) return null;

    const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const selectProfile = (player) => {
        selectedFromListRef.current = true;
        setMatchedProfile(player);
        setProfileStatus('existing');
        setNameSuggestions([]);
        setShowSuggestions(false);
        setPassword('');
        setConfirmPassword('');
        setForm((prev) => ({
            ...prev,
            owner_name: player.name || prev.owner_name,
            contact_email: player.email || '',
            contact_phone: player.contact_number || prev.contact_phone,
        }));
    };

    const handleOwnerNameChange = (value) => {
        selectedFromListRef.current = false;
        setMatchedProfile(null);
        setForm((prev) => ({
            ...prev,
            owner_name: value,
            contact_email: profileStatus === 'existing' ? '' : prev.contact_email,
        }));
        setProfileStatus(value.trim().length >= 2 ? 'checking' : 'idle');
        setShowSuggestions(true);
    };

    const handleWebsiteChange = (value) => {
        const withoutProtocol = value.replace(/^https?:\/\//i, '');
        setField('website_url', withoutProtocol);
    };

    const resetForm = () => {
        setForm({ name: '', owner_name: '', contact_email: '', contact_phone: '', website_url: '', logo_url: '' });
        setPassword('');
        setConfirmPassword('');
        setProfileStatus('idle');
        setMatchedProfile(null);
        setNameSuggestions([]);
        selectedFromListRef.current = false;
    };

    const handleLogoUpload = async (event) => {
        try {
            setUploadingLogo(true);
            const file = event.target.files?.[0];
            if (!file) return;

            if (file.size > 2 * 1024 * 1024) {
                throw new Error('Logo file size must be less than 2MB.');
            }

            const fileExt = file.name.split('.').pop();
            const fileName = `logo_${Date.now()}.${fileExt}`;
            const filePath = `organisations/logos/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('profile-pics')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from('profile-pics')
                .getPublicUrl(filePath);

            if (publicUrlData) {
                setField('logo_url', publicUrlData.publicUrl);
                toast.success('Logo uploaded successfully!');
            }
        } catch (error) {
            toast.error(`Upload failed: ${error.message}`);
        } finally {
            setUploadingLogo(false);
        }
    };

    const needsNewLogin = profileStatus === 'new' || (!matchedProfile && profileStatus !== 'existing');

    const resolveOwnerPlayerId = async (ownerEmail, ownerDisplayName, phone, createLogin) => {
        if (createLogin) {
            if (password.length < 6) {
                throw new Error('Password must be at least 6 characters.');
            }
            if (password !== confirmPassword) {
                throw new Error('Passwords do not match.');
            }

            const { data: authResult, error: authError } = await supabase.functions.invoke('admin-set-password', {
                body: {
                    email: ownerEmail,
                    newPassword: password,
                    createIfMissing: true,
                },
            });

            if (authError) throw new Error(authError.message || 'Failed to create owner login.');
            if (authResult?.error) throw new Error(authResult.error);

            const { error: profileError } = await supabase.rpc('create_player_profile', {
                p_email: ownerEmail,
                p_name: ownerDisplayName.trim(),
                p_contact: phone.trim() || '',
                p_category: 'Organisation',
                p_gender: null,
                p_nationality: null,
                p_id_number: null,
                p_bio: null,
                p_home_club: null,
                p_sponsors: null,
                p_region: null,
                p_paid_registration: false,
                p_license_type: 'none',
                p_image_url: null,
                p_racket_brand: null,
                p_account_type: 'organisation',
            });

            if (profileError) throw profileError;
        }

        if (matchedProfile?.id && !createLogin) return matchedProfile.id;

        const { data: ownerPlayer, error: lookupError } = await supabase
            .from('players')
            .select('id')
            .ilike('email', ownerEmail)
            .maybeSingle();

        if (lookupError) throw lookupError;
        if (!ownerPlayer?.id && createLogin) {
            throw new Error('Owner profile could not be created.');
        }
        return ownerPlayer?.id ?? null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return toast.error('Organisation name is required.');
        if (!form.owner_name.trim()) return toast.error('Owner name is required.');
        if (!form.contact_email.trim()) return toast.error('Contact email is required.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim())) {
            return toast.error('Please enter a valid email address.');
        }
        if (needsNewLogin && !password.trim()) {
            return toast.error('Set an initial password for the new organisation login.');
        }

        setSubmitting(true);
        try {
            const slug = slugify(form.name);
            const ownerEmail = form.contact_email.trim().toLowerCase();
            const ownerDisplayName = form.owner_name.trim();
            const now = new Date().toISOString();

            const ownerPlayerId = await resolveOwnerPlayerId(
                ownerEmail,
                ownerDisplayName,
                form.contact_phone,
                needsNewLogin,
            );

            const { data: newOrg, error: orgError } = await supabase
                .from('organisations')
                .insert({
                    name: form.name.trim(),
                    slug,
                    contact_email: ownerEmail,
                    contact_phone: form.contact_phone.trim() || null,
                    website_url: normalizeWebsiteUrl(form.website_url) || null,
                    logo_url: form.logo_url.trim() || null,
                    created_by: ownerPlayerId,
                    status: 'approved',
                    approved_at: now,
                    verified: true,
                    sapa_sanctioned: true,
                })
                .select()
                .single();

            if (orgError) {
                if (orgError.code === '23505') throw new Error('An organisation with this name or slug already exists.');
                throw orgError;
            }

            const { error: memberError } = await supabase
                .from('organisation_members')
                .upsert({
                    organisation_id: newOrg.id,
                    user_email: ownerEmail,
                    player_id: ownerPlayerId,
                    role: 'owner',
                }, { onConflict: 'organisation_id,user_email' });

            if (memberError) console.warn('Owner membership assignment warning:', memberError);

            sendEmail(ownerEmail, 'org_approved', { orgName: form.name.trim() });

            toast.success(
                needsNewLogin
                    ? `Created organisation and login for ${ownerEmail}`
                    : `Created organisation for ${ownerEmail}`,
            );
            resetForm();
            onCreated?.(newOrg);
            onClose();
        } catch (err) {
            console.error('Create organisation failed:', err);
            toast.error(err.message || 'Failed to create organisation.');
        } finally {
            setSubmitting(false);
        }
    };

    const showEmailPassword = needsNewLogin && form.owner_name.trim().length >= 2 && profileStatus !== 'checking';
    const showMatchedEmail = profileStatus === 'existing' && !!form.contact_email;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[210] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                className="max-w-lg w-full bg-[#0a0a0a] border border-white/10 rounded-3xl p-6 relative shadow-2xl text-left max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-5 right-5 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
                >
                    <X size={16} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-padel-green/10 text-padel-green rounded-xl flex items-center justify-center">
                        <Building size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-extrabold text-white">Create Organisation</h3>
                        <p className="text-xs text-gray-500">Creates an approved host, owner login, and Organisation Dashboard access</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">Organisation Name *</label>
                        <div className="relative">
                            <Building size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                required
                                value={form.name}
                                onChange={(e) => setField('name', e.target.value)}
                                className={inputClass}
                                placeholder="Cape Town Padel Club"
                            />
                        </div>
                    </div>

                    <div ref={ownerNameRef} className="relative">
                        <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">Owner Name *</label>
                        <div className="relative">
                            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                required
                                value={form.owner_name}
                                onChange={(e) => handleOwnerNameChange(e.target.value)}
                                onFocus={() => nameSuggestions.length > 0 && setShowSuggestions(true)}
                                className={inputClass}
                                placeholder="Start typing owner or organisation profile name"
                                autoComplete="off"
                            />
                            {searchingNames && (
                                <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
                            )}
                        </div>

                        {showSuggestions && nameSuggestions.length > 0 && (
                            <div className="absolute z-30 left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl max-h-52 overflow-y-auto shadow-xl">
                                {nameSuggestions.map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => selectProfile(p)}
                                        className="w-full text-left px-4 py-2.5 hover:bg-padel-green hover:text-black transition-colors border-b border-white/5 last:border-0"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-semibold truncate">{p.name}</span>
                                            {p.account_type === 'organisation' && (
                                                <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-padel-green/15 text-padel-green shrink-0">
                                                    Org
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[11px] opacity-70 truncate block">{p.email}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {profileStatus === 'checking' && (
                            <p className="text-[10px] text-gray-500 mt-1.5">Looking up profiles...</p>
                        )}
                        {profileStatus === 'existing' && matchedProfile && (
                            <p className="text-[10px] text-padel-green mt-1.5">
                                Profile found — email filled in. No password needed.
                            </p>
                        )}
                        {profileStatus === 'new' && form.owner_name.trim().length >= 2 && (
                            <p className="text-[10px] text-amber-400 mt-1.5">
                                No matching profile — enter email and set a password below.
                            </p>
                        )}
                    </div>

                    {showMatchedEmail && (
                        <div>
                            <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">Owner / Contact Email *</label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="email"
                                    readOnly
                                    value={form.contact_email}
                                    className={`${inputClass} opacity-80 cursor-default`}
                                />
                            </div>
                        </div>
                    )}

                    {showEmailPassword && (
                        <>
                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">Owner / Contact Email *</label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="email"
                                        required
                                        value={form.contact_email}
                                        onChange={(e) => setField('contact_email', e.target.value)}
                                        className={inputClass}
                                        placeholder="owner@club.co.za"
                                        autoComplete="email"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">Initial Password *</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        minLength={6}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={passwordInputClass}
                                        placeholder="Min. 6 characters"
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((v) => !v)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white cursor-pointer"
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">Confirm Password *</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        minLength={6}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className={passwordInputClass}
                                        placeholder="Repeat password"
                                        autoComplete="new-password"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    <div>
                        <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">Contact Phone</label>
                        <div className="relative">
                            <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="tel"
                                value={form.contact_phone}
                                onChange={(e) => setField('contact_phone', e.target.value)}
                                className={inputClass}
                                placeholder="+27 82 123 4567"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">Website URL</label>
                        <div className="relative flex items-center">
                            <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10" />
                            <span className="absolute left-11 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none pointer-events-none">
                                https://
                            </span>
                            <input
                                type="text"
                                inputMode="url"
                                autoComplete="url"
                                value={form.website_url.replace(/^https?:\/\//i, '')}
                                onChange={(e) => handleWebsiteChange(e.target.value)}
                                onBlur={() => {
                                    setForm((prev) => ({
                                        ...prev,
                                        website_url: prev.website_url.replace(/^https?:\/\//i, '').replace(/^\/+/, ''),
                                    }));
                                }}
                                className={`${inputClass} !pl-[5.75rem] placeholder:text-gray-600`}
                                placeholder="myclub.co.za"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-widest">
                            Club Logo <span className="text-[9px] text-gray-500 font-normal">(Optional)</span>
                        </label>
                        {form.logo_url ? (
                            <div className="flex items-center gap-4 bg-black/40 border border-white/10 p-3.5 rounded-xl">
                                <img
                                    src={form.logo_url}
                                    alt="Club logo"
                                    className="w-14 h-14 object-cover rounded-xl border border-white/10"
                                />
                                <div className="flex-1">
                                    <span className="text-xs text-white font-bold block truncate">Logo uploaded</span>
                                    <button
                                        type="button"
                                        onClick={() => setField('logo_url', '')}
                                        className="text-[10px] text-red-400 font-extrabold uppercase tracking-wider mt-1 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                                    >
                                        <Trash2 size={12} /> Remove Image
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center border border-dashed border-white/15 bg-black/20 hover:border-padel-green/30 hover:bg-black/40 rounded-xl cursor-pointer group transition-all p-5">
                                <div className="flex flex-col items-center justify-center text-center">
                                    {uploadingLogo ? (
                                        <>
                                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-padel-green mb-2" />
                                            <span className="text-xs text-gray-400">Uploading logo...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-8 h-8 text-gray-500 group-hover:text-padel-green mb-2 transition-colors" />
                                            <span className="text-xs text-gray-300 font-bold group-hover:text-white transition-colors">Select Club Logo</span>
                                            <span className="text-[10px] text-gray-500 mt-1">PNG, JPG (max 2MB)</span>
                                        </>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    disabled={uploadingLogo}
                                    onChange={handleLogoUpload}
                                    className="hidden"
                                />
                            </label>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={submitting || uploadingLogo || profileStatus === 'checking' || !form.owner_name.trim()}
                        className="w-full bg-padel-green text-black font-black uppercase tracking-widest text-xs py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-white transition-all disabled:opacity-50 cursor-pointer mt-2"
                    >
                        {submitting ? (
                            <>
                                <Loader2 size={14} className="animate-spin" /> Creating...
                            </>
                        ) : (
                            <>
                                <Plus size={14} /> {needsNewLogin ? 'Create Organisation & Login' : 'Create Organisation'}
                            </>
                        )}
                    </button>
                </form>
            </motion.div>
        </div>
    );
};

export default CreateOrganisationModal;
