import React, { useEffect, useState } from 'react';
import {
    MapPin, Mail, Phone, Globe, Send, Loader2, ChevronLeft, Lock, Eye, EyeOff,
    User, CheckCircle2, Instagram, Facebook, ExternalLink, MessageCircle,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendEmail } from '../utils/emails';
import { toast } from 'sonner';
import { slugifyClub } from '../utils/club';

const TOTAL_STEPS = 3;

const ROLE_OPTIONS = [
    'Owner',
    'Manager',
    'Club Director',
    'Operations',
    'Admin',
    'Other',
];

const STEP_TITLES = [
    'Club details',
    'Primary contact',
    'Review & submit',
];

const RequiredMark = () => <span className="text-red-500 ml-0.5">*</span>;

const ProgressBar = ({ step }) => (
    <div className="flex gap-1.5 w-full mb-5" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${i < step ? 'bg-padel-green' : 'bg-white/10'}`}
            />
        ))}
    </div>
);

/**
 * Public club registration — inserts clubs.status = pending for admin approval.
 */
const RegisterClubForm = ({ onBack, onClose, contactEmail = '' }) => {
    const [step, setStep] = useState(1);
    const [submitted, setSubmitted] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [sessionEmail, setSessionEmail] = useState('');
    const [sessionPlayerId, setSessionPlayerId] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        short_name: '',
        city: '',
        address: '',
        about: '',
        website_url: '',
        instagram: '',
        facebook: '',
        tiktok: '',
        playtomic: '',
        whatsapp_number: '',
        full_name: '',
        contact_email: contactEmail || '',
        contact_phone: '',
        primary_role: '',
    });

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [profileStatus, setProfileStatus] = useState('idle'); // idle | checking | existing | new

    const setField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

    const labelClass = 'block text-gray-400 font-bold uppercase tracking-wider mb-1.5 text-xs';
    const fieldClass = 'w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-padel-green transition-colors placeholder:text-gray-600';
    const plainFieldClass = 'w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-padel-green transition-colors placeholder:text-gray-600';

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.email || cancelled) return;
            setSessionEmail(session.user.email);
            const { data: player } = await supabase
                .from('players')
                .select('id, name, email, contact_number')
                .ilike('email', session.user.email)
                .maybeSingle();
            if (cancelled) return;
            if (player) {
                setSessionPlayerId(player.id);
                setProfileStatus('existing');
                setFormData((prev) => ({
                    ...prev,
                    contact_email: player.email || session.user.email,
                    full_name: player.name || prev.full_name,
                    contact_phone: player.contact_number || prev.contact_phone,
                }));
            } else {
                setFormData((prev) => ({
                    ...prev,
                    contact_email: prev.contact_email || session.user.email,
                }));
            }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (sessionEmail || !formData.contact_email.trim()) return undefined;
        const email = formData.contact_email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined;
        const t = setTimeout(async () => {
            setProfileStatus('checking');
            const { data } = await supabase
                .from('players')
                .select('id, name, email, contact_number')
                .ilike('email', email)
                .maybeSingle();
            if (data) {
                setProfileStatus('existing');
                setSessionPlayerId(data.id);
                setFormData((prev) => ({
                    ...prev,
                    full_name: prev.full_name || data.name || '',
                    contact_phone: prev.contact_phone || data.contact_number || '',
                }));
            } else {
                setProfileStatus('new');
                setSessionPlayerId(null);
            }
        }, 400);
        return () => clearTimeout(t);
    }, [formData.contact_email, sessionEmail]);

    const needsNewAccount = !sessionEmail && profileStatus === 'new';

    const validateStep = (currentStep) => {
        if (currentStep === 1) {
            if (!formData.name.trim()) return 'Please enter a club name.';
            if (!formData.city.trim()) return 'Please enter the city.';
            if (!formData.about.trim()) return 'Please add a short about for the club.';
        }
        if (currentStep === 2) {
            if (!formData.full_name.trim()) return 'Please enter the primary contact name.';
            if (!formData.contact_email.trim()) return 'Please enter an email address.';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email.trim())) {
                return 'Please enter a valid email address.';
            }
            if (!formData.contact_phone.trim()) return 'Please enter a contact phone / WhatsApp number.';
            if (!formData.primary_role.trim()) return 'Please select a role.';
            if (profileStatus === 'checking') return 'Please wait while we look up your profile.';
            if (needsNewAccount) {
                if (!password.trim()) return 'Please create a password for your club login.';
                if (password.length < 6) return 'Password must be at least 6 characters.';
                if (password !== confirmPassword) return 'Passwords do not match.';
            }
        }
        if (currentStep === 3 && !acceptedTerms) {
            return 'Please confirm the information is accurate and agree to the Terms & Conditions.';
        }
        return null;
    };

    const goNext = () => {
        const err = validateStep(step);
        if (err) {
            toast.error(err);
            return;
        }
        setStep((s) => Math.min(TOTAL_STEPS, s + 1));
    };

    const ensureApplicantAccount = async () => {
        const email = formData.contact_email.trim().toLowerCase();
        const applicantName = formData.full_name.trim();
        const phone = formData.contact_phone.trim();

        if (sessionPlayerId) return sessionPlayerId;

        if (needsNewAccount) {
            const { error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: { data: { full_name: applicantName } },
            });
            if (authError) throw authError;

            const { error: profileError } = await supabase.rpc('create_player_profile', {
                p_email: email,
                p_name: applicantName,
                p_contact: phone || '',
                p_category: 'Club',
                p_gender: null,
                p_nationality: null,
                p_id_number: null,
                p_bio: null,
                p_home_club: formData.name.trim(),
                p_sponsors: null,
                p_region: null,
                p_paid_registration: false,
                p_license_type: 'none',
                p_image_url: null,
                p_racket_brand: null,
                p_account_type: 'organisation',
            });
            if (profileError) console.warn('create_player_profile warning:', profileError);

            const { data: newPlayer } = await supabase
                .from('players')
                .select('id')
                .ilike('email', email)
                .maybeSingle();
            return newPlayer?.id || null;
        }

        const { data: byEmail } = await supabase
            .from('players')
            .select('id')
            .ilike('email', email)
            .maybeSingle();
        return byEmail?.id || null;
    };

    const handleSubmit = async () => {
        const err = validateStep(3);
        if (err) {
            toast.error(err);
            return;
        }

        setSubmitting(true);
        try {
            const clubName = formData.name.trim();
            const contactEmailValue = formData.contact_email.trim().toLowerCase();
            const createdBy = await ensureApplicantAccount();
            let slug = slugifyClub(clubName) || 'club';

            // Avoid unique slug collisions for pending applications
            const { data: existingSlug } = await supabase
                .from('clubs')
                .select('id')
                .eq('slug', slug)
                .maybeSingle();
            if (existingSlug) {
                slug = `${slug}-${Date.now().toString(36).slice(-5)}`;
            }

            const contacts = [{
                name: formData.full_name.trim(),
                email: contactEmailValue,
                phone: formData.contact_phone.trim(),
                whatsapp: formData.contact_phone.trim(),
                role: formData.primary_role.trim(),
                is_primary: true,
            }];

            const insertPayload = {
                name: clubName,
                short_name: formData.short_name.trim() || null,
                slug,
                city: formData.city.trim() || null,
                address: formData.address.trim() || null,
                about: formData.about.trim() || null,
                website_url: formData.website_url.trim() || null,
                contact_email: contactEmailValue,
                contact_phone: formData.contact_phone.trim() || null,
                whatsapp_number: formData.whatsapp_number.trim() || formData.contact_phone.trim() || null,
                socials: {
                    instagram: formData.instagram.trim() || '',
                    facebook: formData.facebook.trim() || '',
                    tiktok: formData.tiktok.trim() || '',
                    playtomic: formData.playtomic.trim() || '',
                },
                contacts,
                created_by: createdBy,
                status: 'pending',
            };

            const { error } = await supabase.from('clubs').insert(insertPayload);
            if (error) {
                if (error.code === '23505') {
                    throw new Error('A club with this name or slug already exists.');
                }
                throw error;
            }

            const emailVars = {
                clubName,
                contactEmail: contactEmailValue,
                contactPhone: formData.contact_phone.trim(),
                creatorName: formData.full_name.trim(),
            };

            await Promise.all([
                sendEmail(contactEmailValue, 'club_applied', emailVars),
                sendEmail('markstillerman@gmail.com', 'admin_club_applied', emailVars),
            ]);

            setSubmitted(true);
            toast.success('Club application submitted — awaiting approval.');
        } catch (submitErr) {
            console.error(submitErr);
            toast.error(submitErr.message || 'Failed to submit club application.');
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-padel-green/15 flex items-center justify-center">
                    <CheckCircle2 className="text-padel-green" size={32} />
                </div>
                <h3 className="text-xl font-black text-white">Application received</h3>
                <p className="text-sm text-gray-400 max-w-sm mx-auto">
                    Thanks — your club registration is pending review. We&apos;ll email you once it&apos;s approved.
                    After approval you&apos;ll get a Club Dashboard in your account menu.
                </p>
                <button
                    type="button"
                    onClick={onClose}
                    className="mt-2 px-6 py-3 rounded-xl bg-padel-green text-black text-xs font-black uppercase tracking-widest"
                >
                    Done
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <button
                type="button"
                onClick={step === 1 ? onBack : () => setStep((s) => s - 1)}
                className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-white"
            >
                <ChevronLeft size={14} /> {step === 1 ? 'Back' : 'Previous'}
            </button>

            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">
                    Step {step} of {TOTAL_STEPS}
                </p>
                <h3 className="text-lg font-black text-white mt-1">{STEP_TITLES[step - 1]}</h3>
            </div>
            <ProgressBar step={step} />

            {step === 1 && (
                <div className="space-y-3">
                    <label className={labelClass}>
                        Club name <RequiredMark />
                        <div className="relative mt-1.5">
                            <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input value={formData.name} onChange={(e) => setField('name', e.target.value)} className={fieldClass} placeholder="e.g. Atlantic Padel" />
                        </div>
                    </label>
                    <label className={labelClass}>
                        Short name
                        <input value={formData.short_name} onChange={(e) => setField('short_name', e.target.value)} className={`${plainFieldClass} mt-1.5`} placeholder="Optional display name" />
                    </label>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <label className={labelClass}>
                            City <RequiredMark />
                            <input value={formData.city} onChange={(e) => setField('city', e.target.value)} className={`${plainFieldClass} mt-1.5`} placeholder="Cape Town" />
                        </label>
                        <label className={labelClass}>
                            Address
                            <input value={formData.address} onChange={(e) => setField('address', e.target.value)} className={`${plainFieldClass} mt-1.5`} placeholder="Street / venue" />
                        </label>
                    </div>
                    <label className={labelClass}>
                        About the club <RequiredMark />
                        <textarea
                            value={formData.about}
                            onChange={(e) => setField('about', e.target.value)}
                            rows={3}
                            className={`${plainFieldClass} mt-1.5`}
                            placeholder="Courts, facilities, and what makes your club unique…"
                        />
                    </label>
                    <label className={labelClass}>
                        Website
                        <div className="relative mt-1.5">
                            <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input value={formData.website_url} onChange={(e) => setField('website_url', e.target.value)} className={fieldClass} placeholder="https://" />
                        </div>
                    </label>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <label className={labelClass}>
                            Instagram
                            <div className="relative mt-1.5">
                                <Instagram size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input value={formData.instagram} onChange={(e) => setField('instagram', e.target.value)} className={fieldClass} placeholder="https://instagram.com/…" />
                            </div>
                        </label>
                        <label className={labelClass}>
                            Facebook
                            <div className="relative mt-1.5">
                                <Facebook size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input value={formData.facebook} onChange={(e) => setField('facebook', e.target.value)} className={fieldClass} placeholder="https://facebook.com/…" />
                            </div>
                        </label>
                        <label className={labelClass}>
                            TikTok
                            <div className="relative mt-1.5">
                                <ExternalLink size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input value={formData.tiktok} onChange={(e) => setField('tiktok', e.target.value)} className={fieldClass} placeholder="https://tiktok.com/@…" />
                            </div>
                        </label>
                        <label className={labelClass}>
                            Playtomic
                            <div className="relative mt-1.5">
                                <ExternalLink size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input value={formData.playtomic} onChange={(e) => setField('playtomic', e.target.value)} className={fieldClass} placeholder="https://playtomic.com/…" />
                            </div>
                        </label>
                        <label className={`${labelClass} sm:col-span-2`}>
                            WhatsApp
                            <div className="relative mt-1.5">
                                <MessageCircle size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input value={formData.whatsapp_number} onChange={(e) => setField('whatsapp_number', e.target.value)} className={fieldClass} placeholder="0XX XXX XXXX" />
                            </div>
                        </label>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="space-y-3">
                    <label className={labelClass}>
                        Full name <RequiredMark />
                        <div className="relative mt-1.5">
                            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input value={formData.full_name} onChange={(e) => setField('full_name', e.target.value)} className={fieldClass} placeholder="Your name" />
                        </div>
                    </label>
                    <label className={labelClass}>
                        Email <RequiredMark />
                        <div className="relative mt-1.5">
                            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="email"
                                value={formData.contact_email}
                                onChange={(e) => setField('contact_email', e.target.value)}
                                className={fieldClass}
                                placeholder="you@club.com"
                                disabled={!!sessionEmail}
                            />
                        </div>
                        {profileStatus === 'existing' && (
                            <p className="text-[10px] text-padel-green mt-1">Linked to an existing 4M account.</p>
                        )}
                        {profileStatus === 'new' && !sessionEmail && (
                            <p className="text-[10px] text-amber-400 mt-1">We&apos;ll create a login for this email.</p>
                        )}
                    </label>
                    <label className={labelClass}>
                        Phone / WhatsApp <RequiredMark />
                        <div className="relative mt-1.5">
                            <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input value={formData.contact_phone} onChange={(e) => setField('contact_phone', e.target.value)} className={fieldClass} placeholder="0XX XXX XXXX" />
                        </div>
                    </label>
                    <label className={labelClass}>
                        Your role <RequiredMark />
                        <select
                            value={formData.primary_role}
                            onChange={(e) => setField('primary_role', e.target.value)}
                            className={`${plainFieldClass} mt-1.5`}
                        >
                            <option value="">Select role</option>
                            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </label>
                    {needsNewAccount && (
                        <div className="grid sm:grid-cols-2 gap-3 pt-1">
                            <label className={labelClass}>
                                Password <RequiredMark />
                                <div className="relative mt-1.5">
                                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className={`${fieldClass} pr-11`}
                                    />
                                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </label>
                            <label className={labelClass}>
                                Confirm password <RequiredMark />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className={`${plainFieldClass} mt-1.5`}
                                />
                            </label>
                        </div>
                    )}
                </div>
            )}

            {step === 3 && (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2 text-sm">
                        <p className="text-white font-bold">{formData.name}</p>
                        <p className="text-gray-400">{formData.city}{formData.address ? ` · ${formData.address}` : ''}</p>
                        <p className="text-gray-500 text-xs line-clamp-3">{formData.about}</p>
                        <div className="pt-2 border-t border-white/5 text-xs text-gray-400 space-y-1">
                            <p><span className="text-gray-500">Contact:</span> {formData.full_name} ({formData.primary_role})</p>
                            <p>{formData.contact_email} · {formData.contact_phone}</p>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500">
                        Your club will stay private until a 4M admin approves it. After approval you can manage the club card from Club Dashboard.
                    </p>
                    <label className="flex items-start gap-3 text-xs text-gray-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={acceptedTerms}
                            onChange={(e) => setAcceptedTerms(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span>
                            I confirm this information is accurate and agree to the 4M Padel Terms &amp; Conditions for club hosts.
                        </span>
                    </label>
                </div>
            )}

            <div className="pt-2">
                {step < TOTAL_STEPS ? (
                    <button
                        type="button"
                        onClick={goNext}
                        className="w-full py-3.5 rounded-xl bg-padel-green text-black text-xs font-black uppercase tracking-widest hover:bg-white transition-colors"
                    >
                        Continue
                    </button>
                ) : (
                    <button
                        type="button"
                        disabled={submitting}
                        onClick={handleSubmit}
                        className="w-full py-3.5 rounded-xl bg-padel-green text-black text-xs font-black uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        Submit application
                    </button>
                )}
            </div>
        </div>
    );
};

export default RegisterClubForm;
