import React, { useEffect, useRef, useState } from 'react';
import {
    Mail, Phone, Globe, Send, Loader2, ChevronLeft, Lock, Eye, EyeOff,
    User, CheckCircle2, Instagram, Facebook, ExternalLink, MessageCircle,
    Search, BadgeCheck, Building2,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendEmail } from '../utils/emails';
import { toast } from 'sonner';
import { slugifyClub, CLAIMABLE_CLUB_STATUSES } from '../utils/club';

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
 * Public club registration — search/claim existing clubs, or create new (in review).
 */
const RegisterClubForm = ({ onBack, onClose, contactEmail = '', initialClubClaim = null }) => {
    const [step, setStep] = useState(1);
    const [submitted, setSubmitted] = useState(false);
    const [submitMode, setSubmitMode] = useState('create'); // create | claim
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [sessionEmail, setSessionEmail] = useState('');
    const [sessionPlayerId, setSessionPlayerId] = useState(null);

    const [claimClub, setClaimClub] = useState(null);
    const [clubSuggestions, setClubSuggestions] = useState([]);
    const [showClubSuggestions, setShowClubSuggestions] = useState(false);
    const [searchingClubs, setSearchingClubs] = useState(false);
    const clubNameFieldRef = useRef(null);
    const selectedClubFromListRef = useRef(false);

    const [nameSuggestions, setNameSuggestions] = useState([]);
    const [showNameSuggestions, setShowNameSuggestions] = useState(false);
    const [searchingNames, setSearchingNames] = useState(false);
    const [matchedProfile, setMatchedProfile] = useState(null);
    const fullNameFieldRef = useRef(null);
    const selectedFromListRef = useRef(false);

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
        claim_notes: '',
    });

    const [profileStatus, setProfileStatus] = useState('idle'); // idle | checking | existing
    const [accountPassword, setAccountPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const setField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));
    const isClaiming = Boolean(claimClub);
    const isLinkedUser = Boolean(matchedProfile || (sessionPlayerId && sessionEmail));
    const needsSignIn = Boolean(matchedProfile && !sessionEmail);

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
                selectedFromListRef.current = true;
                setSessionPlayerId(player.id);
                setMatchedProfile(player);
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

    // Search players by name for Full Name dropdown
    useEffect(() => {
        if (sessionEmail && matchedProfile) {
            setNameSuggestions([]);
            setSearchingNames(false);
            return undefined;
        }
        if (selectedFromListRef.current) {
            setNameSuggestions([]);
            setSearchingNames(false);
            return undefined;
        }

        const q = formData.full_name.trim();
        if (q.length < 2) {
            setNameSuggestions([]);
            setSearchingNames(false);
            setProfileStatus('idle');
            setMatchedProfile(null);
            setSessionPlayerId(null);
            return undefined;
        }

        const timer = setTimeout(async () => {
            setSearchingNames(true);
            setProfileStatus('checking');
            try {
                const safe = q.replace(/[%_,]/g, ' ').trim();
                const { data, error } = await supabase
                    .from('players')
                    .select('id, name, email, contact_number, image_url')
                    .or(`name.ilike.%${safe}%,email.ilike.%${safe}%`)
                    .not('email', 'is', null)
                    .order('name')
                    .limit(12);
                if (error) throw error;
                setNameSuggestions(data || []);
                setShowNameSuggestions(true);
                setProfileStatus('idle');
            } catch (err) {
                console.error(err);
                setNameSuggestions([]);
                setProfileStatus('idle');
            } finally {
                setSearchingNames(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [formData.full_name, sessionEmail, matchedProfile]);

    // Search existing clubs as the user types the club name
    useEffect(() => {
        if (claimClub || selectedClubFromListRef.current) {
            selectedClubFromListRef.current = false;
            return undefined;
        }
        const q = formData.name.trim();
        if (q.length < 2) {
            setClubSuggestions([]);
            setSearchingClubs(false);
            return undefined;
        }

        const timer = setTimeout(async () => {
            setSearchingClubs(true);
            try {
                const safe = q.replace(/[%_,]/g, ' ').trim();
                const { data, error } = await supabase
                    .from('clubs')
                    .select('id, name, short_name, slug, city, logo_url, status, verified')
                    .or(`name.ilike.%${safe}%,short_name.ilike.%${safe}%`)
                    .in('status', CLAIMABLE_CLUB_STATUSES)
                    .order('name')
                    .limit(8);
                if (error) throw error;
                setClubSuggestions(data || []);
                setShowClubSuggestions(true);
            } catch (err) {
                console.error(err);
                setClubSuggestions([]);
            } finally {
                setSearchingClubs(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [formData.name, claimClub]);

    useEffect(() => {
        const onDown = (e) => {
            if (clubNameFieldRef.current && !clubNameFieldRef.current.contains(e.target)) {
                setShowClubSuggestions(false);
            }
            if (fullNameFieldRef.current && !fullNameFieldRef.current.contains(e.target)) {
                setShowNameSuggestions(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    const selectExistingClub = (club) => {
        selectedClubFromListRef.current = true;
        setClaimClub(club);
        setClubSuggestions([]);
        setShowClubSuggestions(false);
        setFormData((prev) => ({
            ...prev,
            name: club.name || prev.name,
            short_name: club.short_name || prev.short_name,
            city: club.city || prev.city,
        }));
    };

    useEffect(() => {
        if (!initialClubClaim?.id) return;
        selectExistingClub(initialClubClaim);
    }, [initialClubClaim?.id]);

    const clearClaimSelection = () => {
        setClaimClub(null);
        setClubSuggestions([]);
        setShowClubSuggestions(false);
    };

    const handleClubNameChange = (value) => {
        if (claimClub) clearClaimSelection();
        setFormData((prev) => ({ ...prev, name: value }));
        setShowClubSuggestions(true);
    };

    const selectProfile = (player) => {
        selectedFromListRef.current = true;
        setMatchedProfile(player);
        setSessionPlayerId(player.id);
        setProfileStatus('existing');
        setNameSuggestions([]);
        setShowNameSuggestions(false);
        setFormData((prev) => ({
            ...prev,
            full_name: player.name || prev.full_name,
            contact_email: player.email || '',
            contact_phone: player.contact_number || prev.contact_phone,
        }));
    };

    const handleFullNameChange = (value) => {
        selectedFromListRef.current = false;
        setMatchedProfile(null);
        setSessionPlayerId(null);
        setProfileStatus(value.trim().length >= 2 ? 'checking' : 'idle');
        setFormData((prev) => ({
            ...prev,
            full_name: value,
            contact_email: sessionEmail || '',
            contact_phone: '',
        }));
        setAccountPassword('');
        setShowNameSuggestions(true);
    };

    const validateStep = (currentStep) => {
        if (currentStep === 1) {
            if (!formData.name.trim()) return 'Please enter a club name.';
            if (isClaiming) return null;
            if (!formData.city.trim()) return 'Please enter the city.';
            if (!formData.about.trim()) return 'Please add a short about for the club.';
        }
        if (currentStep === 2) {
            if (!formData.full_name.trim()) return 'Please search and select your name from the player list.';
            if (!isLinkedUser || !sessionPlayerId) {
                return 'Please select an existing player from the dropdown so we can link this club to their account.';
            }
            if (needsSignIn && !accountPassword.trim()) {
                return 'Enter the password for this player account to continue.';
            }
            if (!formData.contact_email.trim()) return 'Selected player is missing an email address.';
            if (!formData.contact_phone.trim()) return 'Please enter a contact phone / WhatsApp number.';
            if (!formData.primary_role.trim()) return 'Please select a role.';
            if (profileStatus === 'checking') return 'Please wait while we look up players.';
        }
        if (currentStep === 3 && !acceptedTerms) {
            return 'Please confirm the information is accurate and agree to the Terms & Conditions.';
        }
        return null;
    };

    const ensureSignedIn = async () => {
        if (sessionEmail) return;
        const email = (matchedProfile?.email || formData.contact_email || '').trim().toLowerCase();
        if (!email || !accountPassword.trim()) {
            throw new Error('Enter the password for this player account to continue.');
        }
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password: accountPassword,
        });
        if (error) {
            throw new Error(error.message || 'Could not sign in. Check the password for this account.');
        }
        setSessionEmail(email);
    };

    const goNext = async () => {
        const err = validateStep(step);
        if (err) {
            toast.error(err);
            return;
        }
        if (step === 2 && needsSignIn) {
            setSubmitting(true);
            try {
                await ensureSignedIn();
            } catch (signInErr) {
                toast.error(signInErr.message || 'Sign-in failed.');
                setSubmitting(false);
                return;
            }
            setSubmitting(false);
        }
        setStep((s) => Math.min(TOTAL_STEPS, s + 1));
    };

    const ensureApplicantAccount = async () => {
        if (sessionPlayerId) return sessionPlayerId;
        if (matchedProfile?.id) return matchedProfile.id;

        const email = formData.contact_email.trim().toLowerCase();
        const { data: byEmail } = await supabase
            .from('players')
            .select('id')
            .ilike('email', email)
            .maybeSingle();
        return byEmail?.id || null;
    };

    const handleSubmitClaim = async (contactEmailValue, createdBy) => {
        const { error } = await supabase.from('club_claim_requests').insert({
            club_id: claimClub.id,
            requester_player_id: createdBy,
            requester_email: contactEmailValue,
            full_name: formData.full_name.trim(),
            contact_phone: formData.contact_phone.trim(),
            primary_role: formData.primary_role.trim(),
            notes: formData.claim_notes.trim() || null,
            status: 'pending',
        });
        if (error) {
            if (error.code === '23505') {
                throw new Error('You already have a pending claim for this club.');
            }
            throw error;
        }

        const emailVars = {
            clubName: claimClub.name,
            contactEmail: contactEmailValue,
            contactPhone: formData.contact_phone.trim(),
            creatorName: formData.full_name.trim(),
            role: formData.primary_role.trim(),
        };

        await Promise.all([
            sendEmail(contactEmailValue, 'club_claim_applied', emailVars),
            sendEmail('markstillerman@gmail.com', 'admin_club_claim_applied', emailVars),
        ]);

        setSubmitMode('claim');
        setSubmitted(true);
        toast.success('Club claim submitted — awaiting approval.');
    };

    const handleSubmitCreate = async (clubName, contactEmailValue, createdBy) => {
        let slug = slugifyClub(clubName) || 'club';

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
            status: 'in_review',
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

        setSubmitMode('create');
        setSubmitted(true);
        toast.success('Club application submitted — awaiting approval.');
    };

    const handleSubmit = async () => {
        const err = validateStep(3);
        if (err) {
            toast.error(err);
            return;
        }

        setSubmitting(true);
        try {
            await ensureSignedIn();
            const clubName = formData.name.trim();
            const contactEmailValue = formData.contact_email.trim().toLowerCase();
            const createdBy = await ensureApplicantAccount();

            if (isClaiming) {
                await handleSubmitClaim(contactEmailValue, createdBy);
            } else {
                await handleSubmitCreate(clubName, contactEmailValue, createdBy);
            }
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
                <h3 className="text-2xl font-bold text-white">
                    {submitMode === 'claim' ? 'Claim received' : 'Application received'}
                </h3>
                <p className="text-sm text-gray-400 max-w-sm mx-auto">
                    {submitMode === 'claim'
                        ? 'Thanks — your club claim is pending review. We\'ll email you once an admin approves it. After approval you\'ll get Club Dashboard access.'
                        : 'Thanks — your club registration is pending review. We\'ll email you once it\'s approved. After approval you\'ll get a Club Dashboard in your account menu.'}
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
                <h3 className="text-lg font-bold text-white mt-1">
                    {isClaiming && step === 1 ? 'Claim existing club' : STEP_TITLES[step - 1]}
                </h3>
            </div>
            <ProgressBar step={step} />

            {step === 1 && (
                <div className="space-y-3">
                    <label className={labelClass}>
                        Club name <RequiredMark />
                        <div className="relative mt-1.5" ref={clubNameFieldRef}>
                            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                value={formData.name}
                                onChange={(e) => handleClubNameChange(e.target.value)}
                                onFocus={() => clubSuggestions.length > 0 && setShowClubSuggestions(true)}
                                className={fieldClass}
                                placeholder="Search existing clubs…"
                                autoComplete="off"
                            />
                            {searchingClubs && (
                                <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
                            )}
                            {showClubSuggestions && !claimClub && clubSuggestions.length > 0 && (
                                <div className="absolute z-20 left-0 right-0 mt-1.5 bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                                    {clubSuggestions.map((club) => (
                                        <button
                                            key={club.id}
                                            type="button"
                                            onClick={() => selectExistingClub(club)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 border-b border-white/5 last:border-0"
                                        >
                                            {club.logo_url ? (
                                                <img src={club.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover bg-white/5" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                                    <Building2 size={14} className="text-gray-500" />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-white font-bold truncate flex items-center gap-1.5">
                                                    {club.name}
                                                    {club.verified && <BadgeCheck size={12} className="text-padel-green shrink-0" />}
                                                </p>
                                                <p className="text-[10px] text-gray-500 truncate">
                                                    {[club.city, club.short_name].filter(Boolean).join(' · ') || 'Claim this club'}
                                                </p>
                                            </div>
                                            <span className="text-[9px] font-black uppercase tracking-wider text-padel-green shrink-0">
                                                Claim
                                            </span>
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowClubSuggestions(false);
                                            setClaimClub(null);
                                        }}
                                        className="w-full px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5"
                                    >
                                        Continue as new club
                                    </button>
                                </div>
                            )}
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1.5">
                            Search for your club first. If it already exists, claim it for admin approval. If not, continue registering a new club.
                        </p>
                    </label>

                    {isClaiming ? (
                        <div className="rounded-2xl border border-padel-green/30 bg-padel-green/5 p-4 space-y-3">
                            <div className="flex items-start gap-3">
                                {claimClub.logo_url ? (
                                    <img src={claimClub.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover" />
                                ) : (
                                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                                        <Building2 size={18} className="text-padel-green" />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">Claiming existing club</p>
                                    <p className="text-white font-bold truncate">{claimClub.name}</p>
                                    <p className="text-xs text-gray-400 truncate">
                                        {[claimClub.city, claimClub.verified ? 'Verified' : null].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={clearClaimSelection}
                                className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white"
                            >
                                Clear — register a different / new club
                            </button>
                        </div>
                    ) : (
                        <>
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
                        </>
                    )}
                </div>
            )}

            {step === 2 && (
                <div className="space-y-3">
                    {isClaiming && (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-gray-400">
                            Claiming <span className="text-white font-bold">{claimClub.name}</span>
                        </div>
                    )}
                    <label className={labelClass}>
                        Full name <RequiredMark />
                        <div className="relative mt-1.5" ref={fullNameFieldRef}>
                            <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                value={formData.full_name}
                                onChange={(e) => handleFullNameChange(e.target.value)}
                                onFocus={() => nameSuggestions.length > 0 && setShowNameSuggestions(true)}
                                className={`${fieldClass} pr-10`}
                                placeholder="Search existing players…"
                                autoComplete="off"
                                disabled={Boolean(sessionEmail && matchedProfile)}
                            />
                            {searchingNames && (
                                <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
                            )}
                            {showNameSuggestions && !matchedProfile && nameSuggestions.length > 0 && (
                                <div className="absolute z-20 left-0 right-0 mt-1.5 bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                                    {nameSuggestions.map((player) => (
                                        <button
                                            key={player.id}
                                            type="button"
                                            onClick={() => selectProfile(player)}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 border-b border-white/5 last:border-0"
                                        >
                                            {player.image_url ? (
                                                <img src={player.image_url} alt="" className="w-8 h-8 rounded-full object-cover bg-white/5" />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                                                    <User size={14} className="text-gray-500" />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-white font-bold truncate">{player.name}</p>
                                                <p className="text-[10px] text-gray-500 truncate">{player.email}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {showNameSuggestions && !matchedProfile && !searchingNames && formData.full_name.trim().length >= 2 && nameSuggestions.length === 0 && (
                                <div className="absolute z-20 left-0 right-0 mt-1.5 bg-[#111] border border-white/10 rounded-xl px-3 py-3 text-xs text-gray-400">
                                    No players found. They need a 4M Padel profile first.
                                </div>
                            )}
                        </div>
                        {isLinkedUser ? (
                            <p className="text-[10px] text-padel-green mt-1.5">Linked to an existing 4M account.</p>
                        ) : (
                            <p className="text-[10px] text-gray-500 mt-1.5">
                                Search and select the player who will manage this club.
                            </p>
                        )}
                    </label>
                    <label className={labelClass}>
                        Email <RequiredMark />
                        <div className="relative mt-1.5">
                            <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="email"
                                value={formData.contact_email}
                                className={fieldClass}
                                placeholder="Filled from selected player"
                                disabled
                            />
                        </div>
                    </label>
                    {needsSignIn && (
                        <label className={labelClass}>
                            Account password <RequiredMark />
                            <div className="relative mt-1.5">
                                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={accountPassword}
                                    onChange={(e) => setAccountPassword(e.target.value)}
                                    className={`${fieldClass} pr-11`}
                                    placeholder="Password for this player account"
                                    autoComplete="current-password"
                                />
                                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <p className="text-[10px] text-amber-400/90 mt-1.5">
                                Sign in with this player account to submit the club claim / registration.
                            </p>
                        </label>
                    )}
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
                    {isClaiming && (
                        <label className={labelClass}>
                            Why are you claiming this club?
                            <textarea
                                value={formData.claim_notes}
                                onChange={(e) => setField('claim_notes', e.target.value)}
                                rows={2}
                                className={`${plainFieldClass} mt-1.5`}
                                placeholder="Optional — role at the club, how you manage it…"
                            />
                        </label>
                    )}
                </div>
            )}

            {step === 3 && (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-2 text-sm">
                        <p className="text-[10px] font-black uppercase tracking-widest text-padel-green">
                            {isClaiming ? 'Claim request' : 'New club application'}
                        </p>
                        <p className="text-white font-bold">{formData.name}</p>
                        {!isClaiming && (
                            <>
                                <p className="text-gray-400">{formData.city}{formData.address ? ` · ${formData.address}` : ''}</p>
                                <p className="text-gray-500 text-xs line-clamp-3">{formData.about}</p>
                            </>
                        )}
                        {isClaiming && claimClub?.city && (
                            <p className="text-gray-400">{claimClub.city}</p>
                        )}
                        <div className="pt-2 border-t border-white/5 text-xs text-gray-400 space-y-1">
                            <p><span className="text-gray-500">Contact:</span> {formData.full_name} ({formData.primary_role})</p>
                            <p>{formData.contact_email} · {formData.contact_phone}</p>
                        </div>
                    </div>
                    <p className="text-xs text-gray-500">
                        {isClaiming
                            ? 'A 4M admin will review your claim. Once approved, you\'ll get Club Dashboard access for this club.'
                            : 'Your club will stay private until a 4M admin approves it. After approval you can manage the club card from Club Dashboard.'}
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
                        disabled={submitting}
                        className="w-full py-3.5 rounded-xl bg-padel-green text-black text-xs font-black uppercase tracking-widest hover:bg-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
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
                        {isClaiming ? 'Submit claim' : 'Submit application'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default RegisterClubForm;
