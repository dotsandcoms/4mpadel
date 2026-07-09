import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Building, Mail, Phone, Globe, X, Loader2, Plus, Lock, Eye, EyeOff, Upload, Trash2 } from 'lucide-react';
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
 * including auth login + minimal organisation player profile for the owner email.
 */
const CreateOrganisationModal = ({ isOpen, onClose, onCreated }) => {
    const [form, setForm] = useState({
        name: '',
        contact_email: '',
        contact_phone: '',
        website_url: '',
        logo_url: '',
    });
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [emailStatus, setEmailStatus] = useState('idle'); // idle | checking | existing | new
    const [submitting, setSubmitting] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    useEffect(() => {
        if (!isOpen) return undefined;

        const email = form.contact_email.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setEmailStatus('idle');
            return undefined;
        }

        const timer = setTimeout(async () => {
            setEmailStatus('checking');
            try {
                const { data, error } = await supabase
                    .from('players')
                    .select('id, account_type')
                    .ilike('email', email)
                    .maybeSingle();

                if (error) throw error;
                setEmailStatus(data ? 'existing' : 'new');
            } catch {
                setEmailStatus('idle');
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [form.contact_email, isOpen]);

    useEffect(() => {
        if (emailStatus === 'existing') {
            setPassword('');
            setConfirmPassword('');
        }
    }, [emailStatus]);

    if (!isOpen) return null;

    const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const handleWebsiteChange = (value) => {
        const withoutProtocol = value.replace(/^https?:\/\//i, '');
        setField('website_url', withoutProtocol);
    };

    const resetForm = () => {
        setForm({ name: '', contact_email: '', contact_phone: '', website_url: '', logo_url: '' });
        setPassword('');
        setConfirmPassword('');
        setEmailStatus('idle');
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

    const resolveOwnerPlayerId = async (ownerEmail, orgName, phone, needsNewLogin) => {
        if (needsNewLogin) {
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
                p_name: orgName.trim(),
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

        const { data: ownerPlayer, error: lookupError } = await supabase
            .from('players')
            .select('id')
            .ilike('email', ownerEmail)
            .maybeSingle();

        if (lookupError) throw lookupError;
        if (!ownerPlayer?.id && needsNewLogin) {
            throw new Error('Owner profile could not be created.');
        }
        return ownerPlayer?.id ?? null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return toast.error('Organisation name is required.');
        if (!form.contact_email.trim()) return toast.error('Contact email is required.');
        if (emailStatus === 'new' && !password.trim()) {
            return toast.error('Set an initial password for the new organisation login.');
        }

        setSubmitting(true);
        try {
            const slug = slugify(form.name);
            const ownerEmail = form.contact_email.trim().toLowerCase();
            const now = new Date().toISOString();
            const needsNewLogin = emailStatus === 'new';

            const ownerPlayerId = await resolveOwnerPlayerId(
                ownerEmail,
                form.name,
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

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[210] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                className="max-w-lg w-full bg-[#0F172A] border border-white/10 rounded-3xl p-6 relative shadow-2xl text-left max-h-[90vh] overflow-y-auto custom-scrollbar"
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
                            />
                        </div>
                        {emailStatus === 'checking' && (
                            <p className="text-[10px] text-gray-500 mt-1.5">Checking email...</p>
                        )}
                        {emailStatus === 'existing' && (
                            <p className="text-[10px] text-padel-green mt-1.5">Existing profile found — no password needed.</p>
                        )}
                        {emailStatus === 'new' && (
                            <p className="text-[10px] text-amber-400 mt-1.5">No profile found — set a password below to create their login.</p>
                        )}
                    </div>

                    {emailStatus === 'new' && (
                        <>
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
                        disabled={submitting || uploadingLogo || emailStatus === 'checking'}
                        className="w-full bg-padel-green text-black font-black uppercase tracking-widest text-xs py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-white transition-all disabled:opacity-50 cursor-pointer mt-2"
                    >
                        {submitting ? (
                            <>
                                <Loader2 size={14} className="animate-spin" /> Creating...
                            </>
                        ) : (
                            <>
                                <Plus size={14} /> {emailStatus === 'new' ? 'Create Organisation & Login' : 'Create Organisation'}
                            </>
                        )}
                    </button>
                </form>
            </motion.div>
        </div>
    );
};

export default CreateOrganisationModal;
