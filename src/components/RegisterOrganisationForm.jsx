import React, { useState, useEffect } from 'react';
import {
    Building, Mail, Phone, Globe, Send, Loader2, ChevronLeft,
    ShieldAlert, Upload, Trash2, Lock, Eye, EyeOff,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendEmail } from '../utils/emails';
import { toast } from 'sonner';

const RegisterOrganisationForm = ({
    onBack,
    onClose,
    onSuccess,
    playerProfile = null,
    contactEmail = '',
    contactPhone = '',
    compact = false,
}) => {
    const [formData, setFormData] = useState({
        name: '',
        contact_email: playerProfile?.email || contactEmail,
        contact_phone: playerProfile?.contact_number || contactPhone,
        logo_url: '',
        website_url: '',
    });
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [emailStatus, setEmailStatus] = useState('idle'); // idle | checking | existing | new
    const [submitting, setSubmitting] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    useEffect(() => {
        const email = formData.contact_email.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setEmailStatus('idle');
            return undefined;
        }

        const timer = setTimeout(async () => {
            setEmailStatus('checking');
            try {
                const { data, error } = await supabase
                    .from('players')
                    .select('id')
                    .ilike('email', email)
                    .maybeSingle();

                if (error) throw error;
                setEmailStatus(data ? 'existing' : 'new');
            } catch {
                setEmailStatus('idle');
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [formData.contact_email]);

    const handleLogoUpload = async (event) => {
        try {
            setUploadingLogo(true);
            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('You must select a logo image.');
            }
            const file = event.target.files[0];

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
                setFormData((prev) => ({ ...prev, logo_url: publicUrlData.publicUrl }));
                toast.success('Logo uploaded successfully!');
            }
        } catch (error) {
            toast.error(`Upload Failed: ${error.message}`);
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleRemoveLogo = () => {
        setFormData((prev) => ({ ...prev, logo_url: '' }));
        toast.info('Logo removed.');
    };

    const normalizeWebsiteUrl = (raw) => {
        const trimmed = (raw || '').trim();
        if (!trimmed) return '';
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        return `https://${trimmed.replace(/^\/+/, '')}`;
    };

    const handleWebsiteChange = (value) => {
        const withoutProtocol = value.replace(/^https?:\/\//i, '');
        setFormData((prev) => ({ ...prev, website_url: withoutProtocol }));
    };

    const resolveCreatedBy = async (sessionEmail) => {
        if (!sessionEmail) return null;
        const { data: ownPlayer } = await supabase
            .from('players')
            .select('id')
            .ilike('email', sessionEmail)
            .maybeSingle();
        return ownPlayer?.id ?? null;
    };

    const createOrgAccount = async (email, phone, orgName) => {
        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters.');
        }
        if (password !== confirmPassword) {
            throw new Error('Passwords do not match.');
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email.trim(),
            password,
        });

        if (authError) {
            if (authError.message?.toLowerCase().includes('already registered')) {
                throw new Error('An account with this email already exists. Please sign in and apply again.');
            }
            throw authError;
        }

        const { error: profileError } = await supabase.rpc('create_player_profile', {
            p_email: email.trim(),
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

        const { data: newPlayer, error: lookupError } = await supabase
            .from('players')
            .select('id')
            .ilike('email', email.trim())
            .maybeSingle();

        if (lookupError) throw lookupError;
        if (!newPlayer?.id && authData?.user) {
            return await resolveCreatedBy(authData.user.email);
        }
        return newPlayer?.id ?? null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            toast.error('Please specify the Organisation Name.');
            return;
        }
        if (!formData.contact_email.trim()) {
            toast.error('Please specify a contact email.');
            return;
        }
        if (emailStatus === 'new' && !password.trim()) {
            toast.error('Please create a password for your organisation login.');
            return;
        }

        setSubmitting(true);
        try {
            const contactEmail = formData.contact_email.trim();
            let createdBy = null;

            if (emailStatus === 'new') {
                createdBy = await createOrgAccount(contactEmail, formData.contact_phone, formData.name);
            } else {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user?.email?.toLowerCase() === contactEmail.toLowerCase()) {
                    createdBy = await resolveCreatedBy(session.user.email);
                }
            }

            const slug = formData.name
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');

            const { error } = await supabase
                .from('organisations')
                .insert({
                    name: formData.name.trim(),
                    slug,
                    contact_email: contactEmail,
                    contact_phone: formData.contact_phone.trim() || null,
                    logo_url: formData.logo_url.trim() || null,
                    website_url: normalizeWebsiteUrl(formData.website_url) || null,
                    created_by: createdBy,
                    status: 'pending',
                });

            if (error) {
                if (error.code === '23505') {
                    throw new Error('An organisation with this name already exists.');
                }
                throw error;
            }

            const emailVars = {
                orgName: formData.name.trim(),
                contactEmail,
                contactPhone: formData.contact_phone.trim(),
                creatorName: playerProfile?.name || formData.name.trim(),
                createdLogin: emailStatus === 'new',
            };

            const [applicantMail, adminMail] = await Promise.all([
                sendEmail(contactEmail, 'org_applied', emailVars),
                sendEmail('markstillerman@gmail.com', 'admin_org_applied', emailVars),
            ]);

            if (applicantMail?.success) {
                toast.success('Application submitted — check your email for confirmation.');
            } else {
                console.error('org_applied email failed:', applicantMail?.error);
                toast.success('Application submitted successfully!');
                toast.message('We could not send the confirmation email just now. Our team still received your application.');
            }

            if (!adminMail?.success) {
                console.error('admin_org_applied email failed:', adminMail?.error);
            }

            onSuccess?.();
            onClose?.();
        } catch (err) {
            console.error('Organisation application failed:', err);
            toast.error(err.message || 'Application failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const fieldClass = compact
        ? 'w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-padel-green transition-colors'
        : 'w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-padel-green transition-colors';

    const passwordFieldClass = compact
        ? 'w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:border-padel-green transition-colors'
        : 'w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-11 py-3.5 text-sm focus:outline-none focus:border-padel-green transition-colors';

    return (
        <form onSubmit={handleSubmit} className={`text-left ${compact ? 'space-y-3' : 'space-y-4'}`}>
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                >
                    <ChevronLeft size={14} /> Back to registration options
                </button>
            )}

            <div className={`bg-black/20 border border-white/5 rounded-xl flex items-start gap-2.5 ${compact ? 'p-3' : 'p-4 rounded-2xl gap-3'}`}>
                <ShieldAlert className={`text-padel-green shrink-0 mt-0.5 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                <p className={`text-gray-400 leading-relaxed ${compact ? 'text-[11px]' : 'text-xs'}`}>
                    Apply to host tournaments on 4M Padel. If your email is not already on the platform, you will create a login for your organisation account. Applications are reviewed within 24–48 hours.
                </p>
            </div>

            <div>
                <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>Organisation / Club Name</label>
                <div className="relative">
                    <Building size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        className={`${fieldClass} placeholder:text-gray-600`}
                        placeholder="Cape Town Padel Club"
                    />
                </div>
            </div>

            <div>
                <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>Business Email</label>
                <div className="relative">
                    <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="email"
                        required
                        value={formData.contact_email}
                        onChange={(e) => setFormData((prev) => ({ ...prev, contact_email: e.target.value }))}
                        className={fieldClass}
                    />
                </div>
                {emailStatus === 'checking' && (
                    <p className="text-[10px] text-gray-500 mt-1.5">Checking email...</p>
                )}
                {emailStatus === 'existing' && (
                    <p className="text-[10px] text-padel-green mt-1.5">Profile found — sign in with this email if prompted.</p>
                )}
                {emailStatus === 'new' && (
                    <p className="text-[10px] text-amber-400 mt-1.5">New email — create a password below for your organisation login.</p>
                )}
            </div>

            {emailStatus === 'new' && (
                <>
                    <div>
                        <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>Password</label>
                        <div className="relative">
                            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                minLength={6}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={passwordFieldClass}
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
                        <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>Confirm Password</label>
                        <div className="relative">
                            <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                minLength={6}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className={passwordFieldClass}
                                placeholder="Repeat password"
                                autoComplete="new-password"
                            />
                        </div>
                    </div>
                </>
            )}

            <div>
                <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>Contact Phone</label>
                <div className="relative">
                    <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="tel"
                        value={formData.contact_phone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, contact_phone: e.target.value }))}
                        className={`${fieldClass} placeholder:text-gray-600`}
                        placeholder="+27 82 123 4567"
                    />
                </div>
            </div>

            <div>
                <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                    Club Logo <span className="text-[9px] text-gray-500 font-normal">(Optional)</span>
                </label>
                {formData.logo_url ? (
                    <div className="flex items-center gap-4 bg-black/40 border border-white/10 p-3.5 rounded-xl">
                        <img
                            src={formData.logo_url}
                            alt="Club logo"
                            className="w-14 h-14 object-cover rounded-xl border border-white/10"
                        />
                        <div className="flex-1">
                            <span className="text-xs text-white font-bold block truncate">logo_uploaded.png</span>
                            <button
                                type="button"
                                onClick={handleRemoveLogo}
                                className="text-[10px] text-red-400 font-extrabold uppercase tracking-wider mt-1 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                            >
                                <Trash2 size={12} /> Remove Image
                            </button>
                        </div>
                    </div>
                ) : (
                    <label className={`flex flex-col items-center justify-center border border-dashed border-white/15 bg-black/20 hover:border-padel-green/30 hover:bg-black/40 rounded-xl cursor-pointer group transition-all ${compact ? 'p-4' : 'p-5'}`}>
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

            <div>
                <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                    Club Website URL <span className="text-[9px] text-gray-500 font-normal">(Optional)</span>
                </label>
                <div className="relative flex items-center">
                    <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none z-10" />
                    <span className="absolute left-11 top-1/2 -translate-y-1/2 text-gray-500 text-sm select-none pointer-events-none">
                        https://
                    </span>
                    <input
                        type="text"
                        inputMode="url"
                        autoComplete="url"
                        value={formData.website_url.replace(/^https?:\/\//i, '')}
                        onChange={(e) => handleWebsiteChange(e.target.value)}
                        onBlur={() => {
                            setFormData((prev) => ({
                                ...prev,
                                website_url: prev.website_url.replace(/^https?:\/\//i, '').replace(/^\/+/, ''),
                            }));
                        }}
                        className={`${fieldClass} placeholder:text-gray-600 !pl-[5.75rem]`}
                        placeholder="myclub.co.za"
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={submitting || emailStatus === 'checking'}
                className={`w-full bg-padel-green text-black font-black uppercase tracking-widest text-xs rounded-xl flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(154,233,0,0.3)] hover:scale-[1.01] transition-all disabled:opacity-50 cursor-pointer ${compact ? 'py-3.5' : 'py-4'}`}
            >
                {submitting ? (
                    <>
                        <Loader2 size={14} className="animate-spin" /> Submitting Application...
                    </>
                ) : (
                    <>
                        <Send size={14} /> Submit Application
                    </>
                )}
            </button>
        </form>
    );
};

export default RegisterOrganisationForm;
