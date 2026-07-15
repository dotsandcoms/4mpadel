import React, { useState, useEffect, useRef } from 'react';
import {
    Building, Mail, Globe, Send, Loader2, ChevronLeft, ChevronDown,
    Upload, Trash2, Lock, Eye, EyeOff, User, CheckCircle2, Instagram, Facebook,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendEmail } from '../utils/emails';
import { toast } from 'sonner';

const TOTAL_STEPS = 6;

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

const SAPA_OPTIONS = [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'not_sure', label: 'Not sure yet' },
];

const ROLE_OPTIONS = [
    'Founder',
    'Director',
    'Manager',
    'Operations Manager',
    'Tournament Director',
    'Admin',
    'Registrations & Admin',
    'Media Contact',
    'Other',
];

const STEP_TITLES = [
    'Basic Information',
    'Organisation Details',
    'Primary Contact',
    'Additional Contact Person',
    'Organisation Information',
    'Review & Submit',
];

/** WhatsApp brand-style icon for input adornments */
const WhatsAppIcon = ({ className = 'w-4 h-4' }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.85 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

const RequiredMark = () => <span className="text-red-500 ml-0.5">*</span>;

const ProgressBar = ({ step }) => (
    <div className="flex gap-1.5 w-full mb-5" aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                    i < step ? 'bg-padel-green' : 'bg-white/10'
                }`}
            />
        ))}
    </div>
);

const SelectField = ({ value, onChange, options, placeholder, compact }) => (
    <div className="relative">
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full appearance-none bg-black/40 border border-white/10 text-white rounded-xl pl-4 pr-10 ${
                compact ? 'py-3 text-sm' : 'py-3.5 text-sm'
            } focus:outline-none focus:border-padel-green transition-colors ${
                !value ? 'text-gray-500' : ''
            }`}
        >
            <option value="" disabled className="text-gray-500 bg-[#1a1a1a]">
                {placeholder}
            </option>
            {options.map((opt) => {
                const val = typeof opt === 'string' ? opt : opt.value;
                const label = typeof opt === 'string' ? opt : opt.label;
                return (
                    <option key={val} value={val} className="bg-[#1a1a1a] text-white">
                        {label}
                    </option>
                );
            })}
        </select>
        <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
    </div>
);

const RegisterOrganisationForm = ({
    onBack,
    onClose,
    onSuccess,
    playerProfile = null,
    contactEmail = '',
    contactPhone = '',
    compact = false,
    /** Super-admin create: approved + verified + owner membership (no public apply emails) */
    autoApprove = false,
}) => {
    const isLoggedInApplicant = !autoApprove && Boolean(playerProfile?.id || playerProfile?.email);

    const [step, setStep] = useState(1);
    const [submitted, setSubmitted] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        short_name: '',
        org_type: '',
        about: '',
        linked_status: '',
        linked_club_name: '',
        sapa_intent: '',
        full_name: playerProfile?.name || '',
        primary_whatsapp: playerProfile?.contact_number || contactPhone || '',
        contact_email: playerProfile?.email || contactEmail || '',
        primary_role: '',
        add_additional_contact: false,
        additional_name: '',
        additional_whatsapp: '',
        additional_email: '',
        additional_role: '',
        website_url: '',
        instagram: '',
        facebook: '',
        logo_url: '',
        cover_image_url: '',
    });

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    /** idle | checking | existing | new */
    const [profileStatus, setProfileStatus] = useState(playerProfile?.email ? 'existing' : 'idle');
    const [matchedProfile, setMatchedProfile] = useState(playerProfile || null);
    const [nameSuggestions, setNameSuggestions] = useState([]);
    const [searchingNames, setSearchingNames] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const fullNameFieldRef = useRef(null);
    const selectedFromListRef = useRef(!!playerProfile);

    const labelClass = `block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`;
    const fieldClass = compact
        ? 'w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-padel-green transition-colors placeholder:text-gray-600'
        : 'w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-padel-green transition-colors placeholder:text-gray-600';
    const plainFieldClass = compact
        ? 'w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-padel-green transition-colors placeholder:text-gray-600'
        : 'w-full bg-black/40 border border-white/10 text-white rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-padel-green transition-colors placeholder:text-gray-600';
    const passwordFieldClass = compact
        ? 'w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:border-padel-green transition-colors'
        : 'w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-11 py-3.5 text-sm focus:outline-none focus:border-padel-green transition-colors';

    const setField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

    useEffect(() => {
        if (!playerProfile) return;
        setFormData((prev) => ({
            ...prev,
            contact_email: playerProfile.email || prev.contact_email,
            primary_whatsapp: playerProfile.contact_number || prev.primary_whatsapp,
            full_name: playerProfile.name || prev.full_name,
        }));
        setMatchedProfile(playerProfile);
        setProfileStatus('existing');
        selectedFromListRef.current = true;
    }, [playerProfile]);

    useEffect(() => {
        if (isLoggedInApplicant) {
            setNameSuggestions([]);
            setSearchingNames(false);
            return undefined;
        }

        const q = formData.full_name.trim();
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
            if (!q) {
                setFormData((prev) => ({ ...prev, contact_email: contactEmail || '' }));
            }
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
                    setFormData((prev) => ({
                        ...prev,
                        full_name: exact.name || prev.full_name,
                        contact_email: exact.email,
                        primary_whatsapp: exact.contact_number || prev.primary_whatsapp,
                    }));
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
    }, [formData.full_name, contactEmail, isLoggedInApplicant]);

    useEffect(() => {
        const onDown = (e) => {
            if (fullNameFieldRef.current && !fullNameFieldRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    const selectProfile = (player) => {
        selectedFromListRef.current = true;
        setMatchedProfile(player);
        setProfileStatus('existing');
        setNameSuggestions([]);
        setShowSuggestions(false);
        setPassword('');
        setConfirmPassword('');
        setFormData((prev) => ({
            ...prev,
            full_name: player.name || prev.full_name,
            contact_email: player.email || '',
            primary_whatsapp: player.contact_number || prev.primary_whatsapp,
        }));
    };

    const handleFullNameChange = (value) => {
        selectedFromListRef.current = false;
        setMatchedProfile(null);
        setFormData((prev) => ({
            ...prev,
            full_name: value,
            contact_email: profileStatus === 'existing' ? '' : prev.contact_email,
        }));
        setProfileStatus(value.trim().length >= 2 ? 'checking' : 'idle');
        setShowSuggestions(true);
    };

    const uploadImage = async (file, kind) => {
        const maxMb = kind === 'logo' ? 2 : 5;
        if (file.size > maxMb * 1024 * 1024) {
            throw new Error(`${kind === 'logo' ? 'Logo' : 'Cover'} file size must be less than ${maxMb}MB.`);
        }
        const fileExt = file.name.split('.').pop();
        const folder = kind === 'logo' ? 'logos' : 'covers';
        const filePath = `organisations/${folder}/${kind}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from('profile-pics')
            .upload(filePath, file, { cacheControl: '3600', upsert: true });
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('profile-pics').getPublicUrl(filePath);
        return publicUrlData?.publicUrl || '';
    };

    const handleLogoUpload = async (event) => {
        try {
            setUploadingLogo(true);
            const file = event.target.files?.[0];
            if (!file) throw new Error('You must select a logo image.');
            const url = await uploadImage(file, 'logo');
            setField('logo_url', url);
            toast.success('Logo uploaded successfully!');
        } catch (error) {
            toast.error(`Upload Failed: ${error.message}`);
        } finally {
            setUploadingLogo(false);
            event.target.value = '';
        }
    };

    const handleCoverUpload = async (event) => {
        try {
            setUploadingCover(true);
            const file = event.target.files?.[0];
            if (!file) throw new Error('You must select a cover image.');
            const url = await uploadImage(file, 'cover');
            setField('cover_image_url', url);
            toast.success('Cover image uploaded successfully!');
        } catch (error) {
            toast.error(`Upload Failed: ${error.message}`);
        } finally {
            setUploadingCover(false);
            event.target.value = '';
        }
    };

    const normalizeWebsiteUrl = (raw) => {
        const trimmed = (raw || '').trim();
        if (!trimmed) return '';
        if (/^https?:\/\//i.test(trimmed)) return trimmed;
        return `https://${trimmed.replace(/^\/+/, '')}`;
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

    const createOrgAccount = async (email, phone, applicantName) => {
        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters.');
        }
        if (password !== confirmPassword) {
            throw new Error('Passwords do not match.');
        }

        // Super-admin path: create login without switching the current session
        if (autoApprove) {
            const { data: authResult, error: authError } = await supabase.functions.invoke('admin-set-password', {
                body: {
                    email: email.trim().toLowerCase(),
                    newPassword: password,
                    createIfMissing: true,
                },
            });
            if (authError) throw new Error(authError.message || 'Failed to create owner login.');
            if (authResult?.error) throw new Error(authResult.error);

            const { error: profileError } = await supabase.rpc('create_player_profile', {
                p_email: email.trim(),
                p_name: applicantName.trim(),
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
            if (!newPlayer?.id) throw new Error('Owner profile could not be created.');
            return newPlayer.id;
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
            p_name: applicantName.trim(),
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

    const needsNewAccount = !isLoggedInApplicant
        && (profileStatus === 'new' || (!matchedProfile && profileStatus !== 'existing'));

    const showEmailPassword = needsNewAccount && formData.full_name.trim().length >= 2 && profileStatus !== 'checking';
    const showMatchedEmail = profileStatus === 'existing' && !!formData.contact_email;

    const validateStep = (currentStep) => {
        if (currentStep === 1) {
            if (!formData.name.trim()) return 'Please enter an organisation name.';
            if (!formData.org_type) return 'Please select an organisation type.';
            if (!formData.about.trim()) return 'Please enter a description.';
            if (formData.about.trim().length > 400) return 'Description must be 400 characters or less.';
        }
        if (currentStep === 2) {
            if (!formData.linked_status) return 'Please select whether your organisation is independent or linked.';
            if (formData.linked_status === 'Linked to a Club / Group of Clubs' && !formData.linked_club_name.trim()) {
                return 'Please specify the club or group of clubs.';
            }
            if (!formData.sapa_intent) return 'Please select whether you will apply for SAPA sanctioning.';
        }
        if (currentStep === 3) {
            if (!formData.full_name.trim()) return 'Please enter the primary contact full name.';
            if (!formData.primary_whatsapp.trim()) return 'Please enter a WhatsApp number.';
            if (!formData.contact_email.trim()) return 'Please enter an email address.';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contact_email.trim())) {
                return 'Please enter a valid email address.';
            }
            if (!formData.primary_role.trim()) return 'Please select a role / position.';
            if (profileStatus === 'checking') return 'Please wait while we look up profiles.';
            if (needsNewAccount) {
                if (!password.trim()) return 'Please create a password for your organisation login.';
                if (password.length < 6) return 'Password must be at least 6 characters.';
                if (password !== confirmPassword) return 'Passwords do not match.';
            }
        }
        if (currentStep === 4 && formData.add_additional_contact) {
            if (!formData.additional_name.trim()) return 'Please enter the additional contact full name.';
            if (!formData.additional_whatsapp.trim()) return 'Please enter the additional contact WhatsApp number.';
            if (!formData.additional_email.trim()) return 'Please enter the additional contact email.';
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.additional_email.trim())) {
                return 'Please enter a valid additional contact email.';
            }
            if (!formData.additional_role.trim()) return 'Please select the additional contact role.';
        }
        if (currentStep === 6 && !autoApprove) {
            if (!acceptedTerms) return 'Please confirm the information is accurate and agree to the Terms & Conditions.';
        }
        return null;
    };

    const goNext = () => {
        const error = validateStep(step);
        if (error) {
            toast.error(error);
            return;
        }
        setStep((s) => Math.min(TOTAL_STEPS, s + 1));
    };

    const goBack = () => {
        if (step === 1) {
            onBack?.();
            return;
        }
        setStep((s) => Math.max(1, s - 1));
    };

    const handleSubmit = async () => {
        for (let s = 1; s <= TOTAL_STEPS; s += 1) {
            const error = validateStep(s);
            if (error) {
                toast.error(error);
                setStep(s);
                return;
            }
        }

        setSubmitting(true);
        try {
            const contactEmailValue = formData.contact_email.trim();
            const orgName = formData.name.trim();
            const applicantName = formData.full_name.trim()
                || playerProfile?.name
                || matchedProfile?.name
                || orgName;
            let createdBy = matchedProfile?.id || playerProfile?.id || null;

            if (isLoggedInApplicant) {
                const { data: { session } } = await supabase.auth.getSession();
                createdBy = playerProfile?.id
                    || (session?.user?.email ? await resolveCreatedBy(session.user.email) : null)
                    || createdBy;
                if (!createdBy) {
                    throw new Error('Could not resolve your player profile. Please refresh and try again.');
                }
            } else if (needsNewAccount) {
                createdBy = await createOrgAccount(contactEmailValue, formData.primary_whatsapp, applicantName);
            } else {
                const { data: { session } } = await supabase.auth.getSession();
                if (!autoApprove && session?.user?.email?.toLowerCase() === contactEmailValue.toLowerCase()) {
                    createdBy = await resolveCreatedBy(session.user.email) || createdBy;
                } else if (!createdBy) {
                    const { data: byEmail } = await supabase
                        .from('players')
                        .select('id')
                        .ilike('email', contactEmailValue)
                        .maybeSingle();
                    createdBy = byEmail?.id ?? null;
                }
            }

            const slug = orgName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');

            const contacts = [
                {
                    name: formData.full_name.trim(),
                    email: contactEmailValue,
                    phone: formData.primary_whatsapp.trim(),
                    whatsapp: formData.primary_whatsapp.trim(),
                    role: formData.primary_role.trim(),
                    is_primary: true,
                },
            ];

            if (formData.add_additional_contact) {
                contacts.push({
                    name: formData.additional_name.trim(),
                    email: formData.additional_email.trim(),
                    phone: formData.additional_whatsapp.trim(),
                    whatsapp: formData.additional_whatsapp.trim(),
                    role: formData.additional_role.trim(),
                    is_primary: false,
                });
            }

            const now = new Date().toISOString();
            const insertPayload = {
                name: orgName,
                slug,
                short_name: formData.short_name.trim() || null,
                org_type: formData.org_type,
                about: formData.about.trim(),
                linked_status: formData.linked_status,
                linked_club_name: formData.linked_status === 'Linked to a Club / Group of Clubs'
                    ? formData.linked_club_name.trim() || null
                    : null,
                sapa_intent: formData.sapa_intent,
                contact_email: contactEmailValue,
                contact_phone: formData.primary_whatsapp.trim() || null,
                whatsapp_number: formData.primary_whatsapp.trim() || null,
                logo_url: formData.logo_url.trim() || null,
                cover_image_url: formData.cover_image_url.trim() || null,
                website_url: normalizeWebsiteUrl(formData.website_url) || null,
                socials: {
                    instagram: formData.instagram.trim() || '',
                    facebook: formData.facebook.trim() || '',
                },
                contacts,
                created_by: createdBy,
                status: autoApprove ? 'approved' : 'pending',
                ...(autoApprove ? {
                    approved_at: now,
                    verified: true,
                    sapa_sanctioned: formData.sapa_intent === 'yes',
                } : {}),
            };

            const { data: newOrg, error } = await supabase
                .from('organisations')
                .insert(insertPayload)
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    throw new Error('An organisation with this name already exists.');
                }
                throw error;
            }

            if (autoApprove && newOrg?.id) {
                const { error: memberError } = await supabase
                    .from('organisation_members')
                    .upsert({
                        organisation_id: newOrg.id,
                        user_email: contactEmailValue.toLowerCase(),
                        player_id: createdBy,
                        role: 'owner',
                    }, { onConflict: 'organisation_id,user_email' });
                if (memberError) console.warn('Owner membership assignment warning:', memberError);

                sendEmail(contactEmailValue, 'org_approved', { orgName });
                toast.success(
                    needsNewAccount
                        ? `Created organisation and login for ${contactEmailValue}`
                        : `Created organisation for ${contactEmailValue}`,
                );
            } else {
                const emailVars = {
                    orgName,
                    contactEmail: contactEmailValue,
                    contactPhone: formData.primary_whatsapp.trim(),
                    creatorName: applicantName,
                    createdLogin: needsNewAccount,
                };

                const [applicantMail, adminMail] = await Promise.all([
                    sendEmail(contactEmailValue, 'org_applied', emailVars),
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
            }

            onSuccess?.(newOrg);
            setSubmitted(true);
        } catch (err) {
            console.error('Organisation application failed:', err);
            toast.error(err.message || 'Application failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const sapaLabel = SAPA_OPTIONS.find((o) => o.value === formData.sapa_intent)?.label || '—';

    if (submitted) {
        return (
            <div className={`text-left ${compact ? 'space-y-4' : 'space-y-5'}`}>
                <ProgressBar step={TOTAL_STEPS} />
                <div className="flex flex-col items-center text-center py-6 sm:py-8">
                    <div className="w-16 h-16 rounded-full bg-padel-green/15 border border-padel-green/30 flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-8 h-8 text-padel-green" />
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight mb-2">
                        {autoApprove ? 'Organisation Created' : 'Application Submitted'}
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed max-w-sm">
                        {autoApprove
                            ? 'The organisation is approved and the owner has access to the Organisation Dashboard.'
                            : 'Thanks for applying. Our team will review your organisation application and notify you via email.'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => onClose?.()}
                    className={`w-full bg-padel-green text-black font-black uppercase tracking-widest text-xs rounded-xl hover:shadow-[0_0_20px_rgba(154,233,0,0.3)] hover:scale-[1.01] transition-all cursor-pointer ${compact ? 'py-3.5' : 'py-4'}`}
                >
                    Done
                </button>
            </div>
        );
    }

    return (
        <div className={`text-left ${compact ? 'space-y-3' : 'space-y-4'}`}>
            {(step > 1 || onBack) && (
                <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                >
                    <ChevronLeft size={14} />
                    {step === 1 && onBack ? 'Back to registration options' : 'Back'}
                </button>
            )}

            <ProgressBar step={step} />

            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                {STEP_TITLES[step - 1]}
            </h3>

            {/* Step 1 — Basic Information */}
            {step === 1 && (
                <div className="space-y-4">
                    <div>
                        <label className={labelClass}>
                            Organisation Name <RequiredMark />
                        </label>
                        <div className="relative">
                            <Building size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setField('name', e.target.value)}
                                className={fieldClass}
                                placeholder="Enter organisation name"
                                autoComplete="organization"
                            />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Short Name / Abbreviation (optional)</label>
                        <input
                            type="text"
                            value={formData.short_name}
                            onChange={(e) => setField('short_name', e.target.value)}
                            className={plainFieldClass}
                            placeholder="Enter short name (optional)"
                        />
                    </div>

                    <div>
                        <label className={labelClass}>
                            Organisation Type <RequiredMark />
                        </label>
                        <SelectField
                            value={formData.org_type}
                            onChange={(v) => setField('org_type', v)}
                            options={ORG_TYPE_OPTIONS}
                            placeholder="Select type"
                            compact={compact}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>
                            Description <RequiredMark />
                        </label>
                        <textarea
                            value={formData.about}
                            onChange={(e) => setField('about', e.target.value.slice(0, 400))}
                            rows={4}
                            className={`${plainFieldClass} resize-none`}
                            placeholder="Tell us about your organisation..."
                        />
                        <p className="text-[10px] text-gray-500 text-right mt-1">
                            {formData.about.length}/400
                        </p>
                    </div>
                </div>
            )}

            {/* Step 2 — Organisation Details */}
            {step === 2 && (
                <div className="space-y-4">
                    <div>
                        <label className={labelClass}>
                            Is your organisation independent or linked to a club / group of clubs? <RequiredMark />
                        </label>
                        <SelectField
                            value={formData.linked_status}
                            onChange={(v) => setField('linked_status', v)}
                            options={LINKED_OPTIONS}
                            placeholder="Select an option"
                            compact={compact}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>If linked, please specify the club or group of clubs</label>
                        <input
                            type="text"
                            value={formData.linked_club_name}
                            onChange={(e) => setField('linked_club_name', e.target.value)}
                            disabled={formData.linked_status !== 'Linked to a Club / Group of Clubs'}
                            className={`${plainFieldClass} disabled:opacity-40`}
                            placeholder="Enter club or group name"
                        />
                    </div>

                    <div>
                        <label className={labelClass}>
                            Will you be applying for your events to be sanctioned by SAPA? <RequiredMark />
                        </label>
                        <SelectField
                            value={formData.sapa_intent}
                            onChange={(v) => setField('sapa_intent', v)}
                            options={SAPA_OPTIONS}
                            placeholder="Select an option"
                            compact={compact}
                        />
                    </div>
                </div>
            )}

            {/* Step 3 — Primary Contact */}
            {step === 3 && (
                <div className="space-y-4">
                    {isLoggedInApplicant && (
                        <p className="text-[10px] text-padel-green">
                            Applying as {playerProfile?.name || 'your account'} — you will be the organisation owner.
                        </p>
                    )}

                    <div ref={fullNameFieldRef} className="relative">
                        <label className={labelClass}>
                            Full Name <RequiredMark />
                        </label>
                        <div className="relative">
                            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                value={formData.full_name}
                                onChange={(e) => {
                                    if (isLoggedInApplicant) setField('full_name', e.target.value);
                                    else handleFullNameChange(e.target.value);
                                }}
                                onFocus={() => !isLoggedInApplicant && nameSuggestions.length > 0 && setShowSuggestions(true)}
                                readOnly={isLoggedInApplicant}
                                className={`${fieldClass} ${isLoggedInApplicant ? 'opacity-80 cursor-default' : ''}`}
                                placeholder="Enter full name"
                                autoComplete="name"
                            />
                            {searchingNames && (
                                <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
                            )}
                        </div>

                        {!isLoggedInApplicant && showSuggestions && nameSuggestions.length > 0 && (
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

                        {!isLoggedInApplicant && profileStatus === 'checking' && (
                            <p className="text-[10px] text-gray-500 mt-1.5">Looking up profiles...</p>
                        )}
                        {!isLoggedInApplicant && profileStatus === 'existing' && matchedProfile && (
                            <p className="text-[10px] text-padel-green mt-1.5">
                                Profile found — email filled in. Sign in with this account if prompted.
                            </p>
                        )}
                        {!isLoggedInApplicant && profileStatus === 'new' && formData.full_name.trim().length >= 2 && (
                            <p className="text-[10px] text-amber-400 mt-1.5">
                                No matching profile — enter email and create a password below.
                            </p>
                        )}
                    </div>

                    <div>
                        <label className={labelClass}>
                            Primary WhatsApp Number <RequiredMark />
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#25D366]">
                                <WhatsAppIcon className="w-4 h-4" />
                            </span>
                            <input
                                type="tel"
                                value={formData.primary_whatsapp}
                                onChange={(e) => setField('primary_whatsapp', e.target.value)}
                                className={fieldClass}
                                placeholder="Enter number"
                            />
                        </div>
                    </div>

                    {(showMatchedEmail || isLoggedInApplicant) && (
                        <div>
                            <label className={labelClass}>
                                Email Address <RequiredMark />
                            </label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="email"
                                    readOnly
                                    value={formData.contact_email}
                                    className={`${fieldClass} opacity-80 cursor-default`}
                                />
                            </div>
                        </div>
                    )}

                    {showEmailPassword && (
                        <>
                            <div>
                                <label className={labelClass}>
                                    Email Address <RequiredMark />
                                </label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="email"
                                        value={formData.contact_email}
                                        onChange={(e) => setField('contact_email', e.target.value)}
                                        className={fieldClass}
                                        placeholder="Enter email address"
                                        autoComplete="email"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>
                                    Password <RequiredMark />
                                </label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
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
                                <label className={labelClass}>
                                    Confirm Password <RequiredMark />
                                </label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
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

                    {!isLoggedInApplicant && !showMatchedEmail && !showEmailPassword && formData.full_name.trim().length < 2 && (
                        <div>
                            <label className={labelClass}>
                                Email Address <RequiredMark />
                            </label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="email"
                                    value={formData.contact_email}
                                    onChange={(e) => setField('contact_email', e.target.value)}
                                    className={fieldClass}
                                    placeholder="Enter email address"
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className={labelClass}>
                            Role / Position <RequiredMark />
                        </label>
                        <SelectField
                            value={formData.primary_role}
                            onChange={(v) => setField('primary_role', v)}
                            options={ROLE_OPTIONS}
                            placeholder="Select role / position"
                            compact={compact}
                        />
                    </div>
                </div>
            )}

            {/* Step 4 — Additional Contact */}
            {step === 4 && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 py-1">
                        <span className="text-sm text-white font-medium">Add an additional contact person?</span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={formData.add_additional_contact}
                            onClick={() => setField('add_additional_contact', !formData.add_additional_contact)}
                            className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                                formData.add_additional_contact ? 'bg-padel-green' : 'bg-white/15'
                            }`}
                        >
                            <span
                                className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                                    formData.add_additional_contact ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </div>

                    {formData.add_additional_contact && (
                        <>
                            <div>
                                <label className={labelClass}>Full Name</label>
                                <input
                                    type="text"
                                    value={formData.additional_name}
                                    onChange={(e) => setField('additional_name', e.target.value)}
                                    className={plainFieldClass}
                                    placeholder="Enter full name"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>WhatsApp Number</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#25D366]">
                                        <WhatsAppIcon className="w-4 h-4" />
                                    </span>
                                    <input
                                        type="tel"
                                        value={formData.additional_whatsapp}
                                        onChange={(e) => setField('additional_whatsapp', e.target.value)}
                                        className={fieldClass}
                                        placeholder="Enter number"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Email Address</label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        type="email"
                                        value={formData.additional_email}
                                        onChange={(e) => setField('additional_email', e.target.value)}
                                        className={fieldClass}
                                        placeholder="Enter email address"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Role / Position</label>
                                <SelectField
                                    value={formData.additional_role}
                                    onChange={(v) => setField('additional_role', v)}
                                    options={ROLE_OPTIONS}
                                    placeholder="Select role / position"
                                    compact={compact}
                                />
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Step 5 — Organisation Information */}
            {step === 5 && (
                <div className="space-y-4">
                    <div>
                        <label className={labelClass}>Website</label>
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
                                onChange={(e) => setField('website_url', e.target.value.replace(/^https?:\/\//i, '').replace(/^\/+/, ''))}
                                onBlur={() => {
                                    setField(
                                        'website_url',
                                        formData.website_url.replace(/^https?:\/\//i, '').replace(/^\/+/, ''),
                                    );
                                }}
                                className={`${fieldClass} !pl-[5.75rem]`}
                                placeholder="www.yourwebsite.co.za"
                            />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Social Media</label>
                        <p className="text-[10px] text-gray-500 mb-2">Add your main social media handles or link.</p>
                        <div className="space-y-3">
                            <div className="relative">
                                <Instagram size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    value={formData.instagram}
                                    onChange={(e) => setField('instagram', e.target.value)}
                                    className={fieldClass}
                                    placeholder="@instagramhandle"
                                />
                            </div>
                            <div className="relative">
                                <Facebook size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type="text"
                                    value={formData.facebook}
                                    onChange={(e) => setField('facebook', e.target.value)}
                                    className={fieldClass}
                                    placeholder="facebook.com/yourpage"
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Logo</label>
                        {formData.logo_url ? (
                            <div className="flex items-center gap-4 bg-black/40 border border-white/10 p-3.5 rounded-xl">
                                <img src={formData.logo_url} alt="Logo" className="w-14 h-14 object-cover rounded-xl border border-white/10" />
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs text-white font-bold block truncate">Logo uploaded</span>
                                    <button
                                        type="button"
                                        onClick={() => setField('logo_url', '')}
                                        className="text-[10px] text-red-400 font-extrabold uppercase tracking-wider mt-1 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                                    >
                                        <Trash2 size={12} /> Remove
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label className={`flex flex-col items-center justify-center border border-dashed border-white/15 bg-black/20 hover:border-padel-green/30 hover:bg-black/40 rounded-xl cursor-pointer group transition-all ${compact ? 'p-4' : 'p-5'}`}>
                                {uploadingLogo ? (
                                    <>
                                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-padel-green mb-2" />
                                        <span className="text-xs text-gray-400">Uploading logo...</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-8 h-8 text-gray-500 group-hover:text-padel-green mb-2 transition-colors" />
                                        <span className="text-xs text-gray-300 font-bold group-hover:text-white transition-colors">Upload Logo</span>
                                        <span className="text-[10px] text-gray-500 mt-1">JPG, PNG (Max 2MB)</span>
                                    </>
                                )}
                                <input type="file" accept="image/*" disabled={uploadingLogo} onChange={handleLogoUpload} className="hidden" />
                            </label>
                        )}
                    </div>

                    <div>
                        <label className={labelClass}>Cover Image</label>
                        {formData.cover_image_url ? (
                            <div className="flex items-center gap-4 bg-black/40 border border-white/10 p-3.5 rounded-xl">
                                <img src={formData.cover_image_url} alt="Cover" className="w-20 h-14 object-cover rounded-xl border border-white/10" />
                                <div className="flex-1 min-w-0">
                                    <span className="text-xs text-white font-bold block truncate">Cover uploaded</span>
                                    <button
                                        type="button"
                                        onClick={() => setField('cover_image_url', '')}
                                        className="text-[10px] text-red-400 font-extrabold uppercase tracking-wider mt-1 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                                    >
                                        <Trash2 size={12} /> Remove
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label className={`flex flex-col items-center justify-center border border-dashed border-white/15 bg-black/20 hover:border-padel-green/30 hover:bg-black/40 rounded-xl cursor-pointer group transition-all ${compact ? 'p-4' : 'p-5'}`}>
                                {uploadingCover ? (
                                    <>
                                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-padel-green mb-2" />
                                        <span className="text-xs text-gray-400">Uploading cover...</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-8 h-8 text-gray-500 group-hover:text-padel-green mb-2 transition-colors" />
                                        <span className="text-xs text-gray-300 font-bold group-hover:text-white transition-colors">Upload Cover Image</span>
                                        <span className="text-[10px] text-gray-500 mt-1">JPG, PNG (Max 5MB)</span>
                                    </>
                                )}
                                <input type="file" accept="image/*" disabled={uploadingCover} onChange={handleCoverUpload} className="hidden" />
                            </label>
                        )}
                    </div>
                </div>
            )}

            {/* Step 6 — Review & Submit */}
            {step === 6 && (
                <div className="space-y-4">
                    <div className="border border-white/10 rounded-2xl p-4 space-y-3 bg-black/30">
                        <div className="flex items-start gap-3">
                            <Building size={16} className="text-padel-green shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Organisation Name</p>
                                <p className="text-sm text-white font-bold">{formData.name || '—'}</p>
                                {formData.short_name && (
                                    <p className="text-xs text-gray-400 mt-0.5">{formData.short_name}</p>
                                )}
                            </div>
                        </div>
                        <div className="h-px bg-white/5" />
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Organisation Type</p>
                            <p className="text-sm text-white font-semibold">{formData.org_type || '—'}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Linked To</p>
                            <p className="text-sm text-white font-semibold">{formData.linked_status || '—'}</p>
                            {formData.linked_club_name && (
                                <p className="text-xs text-gray-400 mt-0.5">{formData.linked_club_name}</p>
                            )}
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">SAPA Sanctioning</p>
                            <p className="text-sm text-white font-semibold">{sapaLabel}</p>
                        </div>
                        <div className="h-px bg-white/5" />
                        <div>
                            <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Primary Contact</p>
                            <p className="text-sm text-white font-semibold">{formData.full_name}</p>
                            <p className="text-xs text-gray-400">{formData.primary_whatsapp}</p>
                            <p className="text-xs text-gray-400">{formData.contact_email}</p>
                            <p className="text-xs text-gray-400">{formData.primary_role}</p>
                        </div>
                        {formData.add_additional_contact && (
                            <div>
                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Additional Contact</p>
                                <p className="text-sm text-white font-semibold">{formData.additional_name}</p>
                                <p className="text-xs text-gray-400">{formData.additional_whatsapp}</p>
                                <p className="text-xs text-gray-400">{formData.additional_email}</p>
                                <p className="text-xs text-gray-400">{formData.additional_role}</p>
                            </div>
                        )}
                    </div>

                    {autoApprove ? (
                        <p className="text-xs text-padel-green bg-padel-green/10 border border-padel-green/20 rounded-xl px-3 py-2.5">
                            This organisation will be created as <strong className="text-white">approved</strong> with owner dashboard access.
                        </p>
                    ) : (
                        <label className="flex items-start gap-3 cursor-pointer group">
                            <button
                                type="button"
                                role="checkbox"
                                aria-checked={acceptedTerms}
                                onClick={() => setAcceptedTerms((v) => !v)}
                                className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                    acceptedTerms
                                        ? 'bg-padel-green border-padel-green text-black'
                                        : 'border-white/20 bg-black/40'
                                }`}
                            >
                                {acceptedTerms && <CheckCircle2 size={14} />}
                            </button>
                            <span className="text-xs text-gray-300 leading-relaxed group-hover:text-white transition-colors">
                                I confirm that the information provided is accurate and I agree to the 4M Padel Terms &amp; Conditions.
                            </span>
                        </label>
                    )}
                </div>
            )}

            {step < TOTAL_STEPS ? (
                <button
                    type="button"
                    onClick={goNext}
                    className={`w-full bg-padel-green text-black font-black uppercase tracking-widest text-xs rounded-xl hover:shadow-[0_0_20px_rgba(154,233,0,0.3)] hover:scale-[1.01] transition-all cursor-pointer ${compact ? 'py-3.5' : 'py-4'}`}
                >
                    Continue
                </button>
            ) : (
                <>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting}
                        className={`w-full bg-padel-green text-black font-black uppercase tracking-widest text-xs rounded-xl flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(154,233,0,0.3)] hover:scale-[1.01] transition-all disabled:opacity-50 cursor-pointer ${compact ? 'py-3.5' : 'py-4'}`}
                    >
                        {submitting ? (
                            <>
                                <Loader2 size={14} className="animate-spin" /> {autoApprove ? 'Creating...' : 'Submitting...'}
                            </>
                        ) : (
                            <>
                                <Send size={14} /> {autoApprove ? 'Create Organisation' : 'Submit for Approval'}
                            </>
                        )}
                    </button>
                    <p className="text-[10px] text-gray-500 text-center">
                        {autoApprove
                            ? 'Owner will receive an approval email and can access the Organisation Dashboard immediately.'
                            : 'Our team will review your application and you will be notified via email.'}
                    </p>
                </>
            )}
        </div>
    );
};

export default RegisterOrganisationForm;
