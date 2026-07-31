import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';
import {
    X, ChevronDown, MapPin, Building2, Check, Loader2, Upload, Plus, Minus,
    Crosshair, BadgeCheck, ExternalLink, Users, CalendarPlus, Share2, AlertTriangle,
    Search, Eye, EyeOff, Lock,
} from 'lucide-react';
import { slugifyClub, SA_REGIONS, CLAIMABLE_CLUB_STATUSES } from '../../utils/club';
import { attachPlacesAutocomplete } from '../../utils/googleMaps';
import { sendEmail } from '../../utils/emails';
import VerifiedBadge from '../VerifiedBadge';

const ADMIN_NOTIFY_EMAIL = 'markstillerman@gmail.com';

/**
 * Step-by-step Create Club wizard (admin + public register flow).
 *
 * Steps: Basic info → Location → Facilities → Courts → Photos → Hours →
 * Review → Publishing → Success. The step indicator groups Courts/Photos/Hours
 * under "More" to match the 5-chip design.
 */

const STEP_GROUPS = ['Basic info', 'Location', 'Facilities', 'More', 'Review'];

const ADMIN_STEPS = [
    { key: 'basic', group: 0 },
    { key: 'location', group: 1 },
    { key: 'facilities', group: 2 },
    { key: 'courts', group: 3 },
    { key: 'photos', group: 3 },
    { key: 'hours', group: 3 },
    { key: 'review', group: 4 },
];

// Public registration adds a contact step (who is applying) before review.
const PUBLIC_STEPS = [
    { key: 'basic', group: 0 },
    { key: 'location', group: 1 },
    { key: 'facilities', group: 2 },
    { key: 'courts', group: 3 },
    { key: 'photos', group: 3 },
    { key: 'hours', group: 3 },
    { key: 'contact', group: 4 },
    { key: 'review', group: 4 },
];

// Claiming an existing club: no profile steps, just who you are + review.
const CLAIM_STEPS = [
    { key: 'basic', group: 0 },
    { key: 'contact', group: 4 },
    { key: 'review', group: 4 },
];

const ROLE_OPTIONS = ['Owner', 'Manager', 'Club Director', 'Operations', 'Admin', 'Other'];

const AFFILIATIONS = ['Private', 'SAPA Affiliated', 'None'];

const FACILITIES = [
    'Racket Rentals', 'Pro Shop', 'Showers', 'Changing Rooms', 'Parking',
    'Coffee Shop', 'Restaurant / Bar', 'Coaching', 'Gym / Fitness', 'Kids Area',
    'WiFi', 'Lounge / Chill Area', 'Physio / Recovery', 'Meeting Room',
];

const COURT_SURFACES = ['World Padel Tour (WPT)', 'Mondo Supercourt', 'Sand-dressed turf', 'Artificial grass', 'Concrete / Other'];
const LIGHTING_OPTIONS = ['LED', 'Halogen', 'Natural light only', 'Mixed'];

const PHOTO_TAGS = ['Courts', 'Facilities', 'Lounge', 'Pro Shop', 'Exterior', 'Cafe', 'Events', 'Other'];

const COUNTRIES = ['South Africa', 'Botswana', 'Namibia', 'Zimbabwe', 'Mozambique', 'Other'];

const TIME_OPTIONS = (() => {
    const out = [];
    for (let h = 0; h < 24; h += 1) {
        out.push(`${String(h).padStart(2, '0')}:00`);
        out.push(`${String(h).padStart(2, '0')}:30`);
    }
    return out;
})();

const inputClass = 'mt-1.5 w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-padel-green transition-colors';
const labelClass = 'block text-xs font-bold uppercase tracking-wider text-gray-400';
const selectClass = `${inputClass} appearance-none pr-9 cursor-pointer`;

const SelectField = ({ label, required, optional, value, onChange, options, placeholder }) => (
    <div>
        <label className={labelClass}>
            {label}
            {required && <span className="text-red-500 ml-0.5">*</span>}
            {optional && <span className="text-gray-600 normal-case tracking-normal font-medium ml-1">(optional)</span>}
        </label>
        <div className="relative">
            <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
                {placeholder && <option value="">{placeholder}</option>}
                {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
            <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
        </div>
    </div>
);

const TimeSelect = ({ value, onChange }) => (
    <div className="relative">
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="appearance-none bg-black/40 border border-white/10 rounded-xl pl-3 pr-8 py-2.5 text-sm text-white focus:outline-none focus:border-padel-green cursor-pointer"
        >
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
    </div>
);

const StepHeader = ({ title, subtitle }) => (
    <div className="mb-5">
        <h3 className="text-xl font-black text-white tracking-tight">{title}</h3>
        {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
    </div>
);

const StepIndicator = ({ activeGroup }) => (
    <div className="flex items-start justify-between gap-1 mb-6">
        {STEP_GROUPS.map((label, i) => {
            const done = i < activeGroup;
            const active = i === activeGroup;
            return (
                <React.Fragment key={label}>
                    {i > 0 && <div className={`flex-1 h-px mt-3.5 ${done || active ? 'bg-padel-green/40' : 'bg-white/10'}`} />}
                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black border transition-colors ${
                                active
                                    ? 'bg-padel-green text-black border-padel-green'
                                    : done
                                        ? 'bg-padel-green/10 text-padel-green border-padel-green/40'
                                        : 'bg-white/5 text-gray-500 border-white/10'
                            }`}
                        >
                            {done ? <Check size={13} /> : i + 1}
                        </div>
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${active ? 'text-padel-green' : done ? 'text-gray-300' : 'text-gray-600'}`}>
                            {label}
                        </span>
                    </div>
                </React.Fragment>
            );
        })}
    </div>
);

const emptyHoursBlock = (open, close) => ({ open, close, closed: false });

const initialForm = () => ({
    name: '',
    tagline: '',
    club_type: 'Padel Club',
    affiliation: 'Private',
    logo_url: '',
    address: '',
    city: '',
    province: '',
    country: 'South Africa',
    lat: '',
    lng: '',
    facilities: [],
    total_courts: 4,
    indoor_courts: 0,
    outdoor_courts: 4,
    court_surface: 'World Padel Tour (WPT)',
    lighting: 'LED',
    photos: [], // { url, tag }
    hours: {
        mon: emptyHoursBlock('06:00', '23:00'),
        tue: emptyHoursBlock('06:00', '23:00'),
        wed: emptyHoursBlock('06:00', '23:00'),
        thu: emptyHoursBlock('06:00', '23:00'),
        fri: emptyHoursBlock('06:00', '23:00'),
        sat: emptyHoursBlock('07:00', '23:00'),
        sun: emptyHoursBlock('07:00', '23:00'),
        holidays: emptyHoursBlock('07:00', '23:00'),
    },
    custom_days: false,
    access_247: false,
    hours_notes: '',
    // Public registration contact (who is applying)
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    primary_role: '',
    claim_notes: '',
});

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

// Grouped by default (Mon–Fri edited together); "Customise individual days"
// switches to one row per day for clubs whose e.g. Tuesday differs.
const GROUPED_HOUR_ROWS = [
    { keys: WEEKDAY_KEYS, label: 'Mon – Fri' },
    { keys: ['sat'], label: 'Saturday' },
    { keys: ['sun'], label: 'Sunday' },
    { keys: ['holidays'], label: 'Public Holidays' },
];

const CUSTOM_HOUR_ROWS = [
    { keys: ['mon'], label: 'Monday' },
    { keys: ['tue'], label: 'Tuesday' },
    { keys: ['wed'], label: 'Wednesday' },
    { keys: ['thu'], label: 'Thursday' },
    { keys: ['fri'], label: 'Friday' },
    { keys: ['sat'], label: 'Saturday' },
    { keys: ['sun'], label: 'Sunday' },
    { keys: ['holidays'], label: 'Public Holidays' },
];

const PUBLISH_TASKS = [
    'Saving club details',
    'Uploading photos',
    'Configuring facilities',
    'Finalising your profile',
];

const ClubCreateWizard = ({
    mode = 'admin',
    onCancel,
    onComplete,
    onOpenExisting,
    contactEmail = '',
    initialClubClaim = null,
    embedded = false,
}) => {
    const isPublic = mode === 'public';
    const [stepIndex, setStepIndex] = useState(0);
    const [phase, setPhase] = useState('form'); // form | publishing | success
    const [form, setForm] = useState(() => ({ ...initialForm(), contact_email: contactEmail || '' }));
    const [uploading, setUploading] = useState(false);
    const [publishTasksDone, setPublishTasksDone] = useState(0);
    const [createdClub, setCreatedClub] = useState(null);
    const [duplicates, setDuplicates] = useState([]);
    const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(null);
    // Public flow: who is applying (linked to an existing player profile)
    const [claimClub, setClaimClub] = useState(null);
    const [submitMode, setSubmitMode] = useState('create'); // create | claim
    const [sessionEmail, setSessionEmail] = useState('');
    const [sessionPlayerId, setSessionPlayerId] = useState(null);
    const [matchedProfile, setMatchedProfile] = useState(null);
    const [playerResults, setPlayerResults] = useState([]);
    const [showPlayerResults, setShowPlayerResults] = useState(false);
    const [searchingPlayers, setSearchingPlayers] = useState(false);
    const [accountPassword, setAccountPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const playerSelectedRef = useRef(false);
    const addressRef = useRef(null);
    const publishingRef = useRef(false);
    const containerRef = useRef(null);

    const steps = isPublic ? (claimClub ? CLAIM_STEPS : PUBLIC_STEPS) : ADMIN_STEPS;
    const step = steps[Math.min(stepIndex, steps.length - 1)];
    const needsSignIn = Boolean(matchedProfile && !sessionEmail);

    // Keep the wizard header in view when moving between steps.
    useEffect(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [stepIndex, phase]);
    const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    // Public flow: pick up the signed-in user's player profile for the contact step.
    useEffect(() => {
        if (!isPublic) return undefined;
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
            if (cancelled || !player) return;
            playerSelectedRef.current = true;
            setSessionPlayerId(player.id);
            setMatchedProfile(player);
            setForm((prev) => ({
                ...prev,
                contact_name: player.name || prev.contact_name,
                contact_email: player.email || session.user.email,
                contact_phone: player.contact_number || prev.contact_phone,
            }));
        })();
        return () => {
            cancelled = true;
        };
    }, [isPublic]);

    // Deep-linked claim (e.g. from a claim invite).
    useEffect(() => {
        if (!isPublic || !initialClubClaim?.id) return;
        setClaimClub(initialClubClaim);
        setForm((prev) => ({ ...prev, name: initialClubClaim.name || prev.name }));
        setStepIndex(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialClubClaim?.id, isPublic]);

    // Duplicate club check — warn when the name matches an existing club.
    useEffect(() => {
        const q = form.name.trim();
        if (q.length < 3 || claimClub) {
            setDuplicates([]);
            return undefined;
        }
        let cancelled = false;
        const t = setTimeout(async () => {
            const safe = q.replace(/[%_,]/g, ' ').trim();
            let query = supabase
                .from('clubs')
                .select('id, name, short_name, city, status, logo_url')
                .or(`name.ilike.%${safe}%,short_name.ilike.%${safe}%`)
                .limit(4);
            if (isPublic) query = query.in('status', CLAIMABLE_CLUB_STATUSES);
            const { data, error } = await query;
            if (cancelled || error) return;
            setDuplicates(data || []);
        }, 350);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [form.name, claimClub, isPublic]);

    // Public flow: player search for the contact step.
    useEffect(() => {
        if (!isPublic || step.key !== 'contact') return undefined;
        const q = form.contact_name.trim();
        if (q.length < 2 || playerSelectedRef.current) {
            setPlayerResults([]);
            return undefined;
        }
        let cancelled = false;
        const t = setTimeout(async () => {
            setSearchingPlayers(true);
            try {
                const { data, error } = await supabase
                    .from('players')
                    .select('id, name, email, contact_number, image_url')
                    .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
                    .not('email', 'is', null)
                    .limit(6);
                if (error) throw error;
                if (cancelled) return;
                setPlayerResults(data || []);
                setShowPlayerResults(true);
            } catch {
                if (!cancelled) setPlayerResults([]);
            } finally {
                if (!cancelled) setSearchingPlayers(false);
            }
        }, 350);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [form.contact_name, isPublic, step.key]);

    const selectPlayer = (player) => {
        playerSelectedRef.current = true;
        setMatchedProfile(player);
        setSessionPlayerId(player.id);
        setPlayerResults([]);
        setShowPlayerResults(false);
        setForm((prev) => ({
            ...prev,
            contact_name: player.name || prev.contact_name,
            contact_email: player.email || prev.contact_email,
            contact_phone: player.contact_number || prev.contact_phone,
        }));
    };

    const handleContactNameChange = (value) => {
        playerSelectedRef.current = false;
        setMatchedProfile(null);
        if (!sessionEmail) setSessionPlayerId(null);
        setAccountPassword('');
        setForm((prev) => ({ ...prev, contact_name: value }));
        setShowPlayerResults(true);
    };

    const selectClaim = (club) => {
        setClaimClub(club);
        setDuplicates([]);
        setForm((prev) => ({ ...prev, name: club.name || prev.name }));
        setStepIndex(1);
    };

    const clearClaim = () => {
        setClaimClub(null);
        setStepIndex(0);
    };

    // Google Places autocomplete on the address field.
    useEffect(() => {
        if (step.key !== 'location') return undefined;
        let cancelled = false;
        let attached = null;
        const timer = setTimeout(() => {
            const input = addressRef.current;
            if (!input) return;
            attachPlacesAutocomplete(input, {
                country: 'za',
                onPlace: (place) => {
                    const comps = place.address_components || [];
                    const get = (type) => comps.find((c) => c.types.includes(type))?.long_name || '';
                    const city = get('locality') || get('sublocality') || get('administrative_area_level_2');
                    const provinceRaw = get('administrative_area_level_1');
                    const province = SA_REGIONS.find((r) => r.toLowerCase() === provinceRaw.toLowerCase()) || provinceRaw;
                    const country = get('country');
                    const loc = place.geometry?.location;
                    const formatted = place.formatted_address || '';
                    if (formatted && addressRef.current) addressRef.current.value = formatted;
                    setForm((prev) => ({
                        ...prev,
                        address: formatted || prev.address,
                        city: city || prev.city,
                        province: province || prev.province,
                        country: country || prev.country,
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
                })
                .catch((err) => console.warn('Google Maps failed to load:', err));
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            attached?.destroy();
        };
    }, [step.key]);

    const useMyLocation = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation is not available in this browser');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setForm((prev) => ({
                    ...prev,
                    lat: String(pos.coords.latitude),
                    lng: String(pos.coords.longitude),
                }));
                toast.success('Location captured');
            },
            () => toast.error('Could not get your location'),
        );
    };

    const toggleFacility = (facility) => {
        setForm((prev) => ({
            ...prev,
            facilities: prev.facilities.includes(facility)
                ? prev.facilities.filter((f) => f !== facility)
                : [...prev.facilities, facility],
        }));
    };

    const setTotalCourts = (next) => {
        const total = Math.max(1, Math.min(64, next));
        setForm((prev) => {
            const indoor = Math.min(Number(prev.indoor_courts) || 0, total);
            return { ...prev, total_courts: total, indoor_courts: indoor, outdoor_courts: total - indoor };
        });
    };

    // Allow the field to be cleared while typing (avoids a stuck leading 0);
    // blur normalises back to a clamped number.
    const setIndoorCourts = (raw) => {
        if (raw === '') {
            setForm((prev) => ({ ...prev, indoor_courts: '' }));
            return;
        }
        const indoor = Math.max(0, Math.min(parseInt(raw, 10) || 0, form.total_courts));
        setForm((prev) => ({ ...prev, indoor_courts: indoor, outdoor_courts: prev.total_courts - indoor }));
    };

    const setOutdoorCourts = (raw) => {
        if (raw === '') {
            setForm((prev) => ({ ...prev, outdoor_courts: '' }));
            return;
        }
        const outdoor = Math.max(0, Math.min(parseInt(raw, 10) || 0, form.total_courts));
        setForm((prev) => ({ ...prev, outdoor_courts: outdoor, indoor_courts: prev.total_courts - outdoor }));
    };

    const normaliseCourtCounts = () => {
        setForm((prev) => {
            const indoor = Math.max(0, Math.min(Number(prev.indoor_courts) || 0, prev.total_courts));
            return { ...prev, indoor_courts: indoor, outdoor_courts: prev.total_courts - indoor };
        });
    };

    const handlePhotoUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        setUploading(true);
        try {
            const uploaded = [];
            for (const file of files) {
                const ext = file.name.split('.').pop() || 'jpg';
                const path = `clubs/gallery/new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
                const { error } = await supabase.storage.from('profile-pics').upload(path, file, { upsert: true });
                if (error) throw error;
                const { data: { publicUrl } } = supabase.storage.from('profile-pics').getPublicUrl(path);
                uploaded.push({ url: publicUrl, tag: '' });
            }
            setForm((prev) => ({ ...prev, photos: [...prev.photos, ...uploaded] }));
            toast.success(`${uploaded.length} photo${uploaded.length > 1 ? 's' : ''} uploaded`);
        } catch (err) {
            toast.error(`Upload failed: ${err.message}`);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const removePhoto = (idx) => {
        setForm((prev) => ({ ...prev, photos: prev.photos.filter((_, i) => i !== idx) }));
        setSelectedPhotoIdx((cur) => (cur === idx ? null : cur > idx ? cur - 1 : cur));
    };

    const tagSelectedPhoto = (tag) => {
        if (selectedPhotoIdx == null) {
            toast.info('Select a photo first, then pick a tag');
            return;
        }
        setForm((prev) => ({
            ...prev,
            photos: prev.photos.map((p, i) => (i === selectedPhotoIdx ? { ...p, tag: p.tag === tag ? '' : tag } : p)),
        }));
    };

    const setHours = (keys, patch) => {
        setForm((prev) => ({
            ...prev,
            hours: {
                ...prev.hours,
                ...Object.fromEntries(keys.map((key) => [key, { ...prev.hours[key], ...patch }])),
            },
        }));
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const path = `clubs/logo/new_${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from('profile-pics').upload(path, file, { upsert: true });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('profile-pics').getPublicUrl(path);
            setField('logo_url', publicUrl);
            toast.success('Logo uploaded');
        } catch (err) {
            toast.error(`Upload failed: ${err.message}`);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const validateStep = () => {
        switch (step.key) {
            case 'basic':
                if (!form.name.trim()) return 'Club name is required';
                if (!form.club_type) return 'Select a club type';
                return null;
            case 'location':
                if (!form.address.trim()) return 'Address is required';
                if (!form.city.trim()) return 'City is required';
                if (!form.province.trim()) return 'Province is required';
                return null;
            case 'courts':
                if (form.total_courts < 1) return 'Add at least one court';
                return null;
            case 'contact':
                if (!form.contact_name.trim()) return 'Please enter and select your name';
                if (!sessionPlayerId) return 'Select your player profile from the list so we can link this club to your account';
                if (needsSignIn && !accountPassword.trim()) return 'Enter the password for this player account to continue';
                if (!form.contact_email.trim()) return 'Selected player is missing an email address';
                if (!form.contact_phone.trim()) return 'Please enter a contact phone / WhatsApp number';
                if (!form.primary_role.trim()) return 'Please select your role at the club';
                return null;
            default:
                return null;
        }
    };

    const goNext = () => {
        const err = validateStep();
        if (err) {
            toast.error(err);
            return;
        }
        setStepIndex((i) => Math.min(i + 1, steps.length - 1));
    };

    const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));
    const goToStep = (key) => setStepIndex(Math.max(0, steps.findIndex((s) => s.key === key)));

    // Public submissions run as the applicant's account (RLS requires auth).
    const ensureSignedIn = async () => {
        if (sessionEmail) return;
        const email = (matchedProfile?.email || form.contact_email || '').trim().toLowerCase();
        if (!email || !accountPassword.trim()) {
            throw new Error('Enter the password for this player account to continue.');
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password: accountPassword });
        if (error) throw new Error(error.message || 'Could not sign in. Check the password for this account.');
        setSessionEmail(email);
    };

    const buildPayload = async () => {
        const baseSlug = slugifyClub(form.name) || 'club';
        const { data: slugTaken } = await supabase
            .from('clubs')
            .select('id')
            .eq('slug', baseSlug)
            .maybeSingle();
        const slug = slugTaken ? `${baseSlug}-${Date.now().toString(36).slice(-4)}` : baseSlug;
        const isAdmin = mode === 'admin';
        const now = new Date().toISOString();
        const openingHours = Object.fromEntries(
            ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => [day, { ...form.hours[day] }]),
        );
        openingHours.public_holidays = { ...form.hours.holidays };
        openingHours.access_247 = !!form.access_247;
        if (form.hours_notes.trim()) openingHours.notes = form.hours_notes.trim();

        return {
            name: form.name.trim(),
            slug,
            tagline: form.tagline.trim() || null,
            club_type: form.club_type || null,
            affiliation: form.affiliation || null,
            status: isAdmin ? 'published' : 'in_review',
            verified: isAdmin,
            approved_at: isAdmin ? now : null,
            address: form.address.trim() || null,
            city: form.city.trim() || null,
            province: form.province.trim() || null,
            country: form.country.trim() || null,
            lat: form.lat === '' ? null : Number(form.lat),
            lng: form.lng === '' ? null : Number(form.lng),
            logo_url: form.logo_url || null,
            contact_email: (isPublic ? form.contact_email.trim().toLowerCase() : contactEmail) || null,
            ...(isPublic
                ? {
                    contact_phone: form.contact_phone.trim() || null,
                    whatsapp_number: form.contact_phone.trim() || null,
                    contacts: [{
                        name: form.contact_name.trim(),
                        email: form.contact_email.trim().toLowerCase(),
                        phone: form.contact_phone.trim(),
                        whatsapp: form.contact_phone.trim(),
                        role: form.primary_role.trim(),
                        is_primary: true,
                    }],
                    created_by: sessionPlayerId || matchedProfile?.id || null,
                }
                : {}),
            services: form.facilities.map((title) => ({ title, description: '', tags: ['facility'] })),
            courts: {
                indoor: { count: Number(form.indoor_courts) || 0, features: [], image_url: '' },
                outdoor: { count: Number(form.outdoor_courts) || 0, features: [], image_url: '' },
                surface: form.court_surface || null,
                lighting: form.lighting || null,
            },
            opening_hours: openingHours,
            gallery: form.photos.map((p) => ({
                url: p.url,
                category: (p.tag || 'other').toLowerCase(),
                caption: '',
            })),
            cover_image_url: form.photos[0]?.url || null,
            sapa_registered: form.affiliation === 'SAPA Affiliated',
            updated_at: now,
        };
    };

    const submitClaim = async () => {
        const email = form.contact_email.trim().toLowerCase();
        const { error } = await supabase.from('club_claim_requests').insert({
            club_id: claimClub.id,
            requester_player_id: sessionPlayerId || matchedProfile?.id || null,
            requester_email: email,
            full_name: form.contact_name.trim(),
            contact_phone: form.contact_phone.trim(),
            primary_role: form.primary_role.trim(),
            notes: form.claim_notes.trim() || null,
            status: 'pending',
        });
        if (error) {
            if (error.code === '23505') throw new Error('You already have a pending club claim for this club.');
            throw error;
        }
        const emailVars = {
            clubName: claimClub.name,
            contactEmail: email,
            contactPhone: form.contact_phone.trim(),
            creatorName: form.contact_name.trim(),
            role: form.primary_role.trim(),
        };
        await Promise.all([
            sendEmail(email, 'club_claim_applied', emailVars),
            sendEmail(ADMIN_NOTIFY_EMAIL, 'admin_club_claim_applied', emailVars),
        ]);
        setSubmitMode('claim');
        setCreatedClub(claimClub);
    };

    const submitCreate = async () => {
        const payload = await buildPayload();
        const { data, error } = await supabase.from('clubs').insert([payload]).select('*').single();
        if (error) {
            if (error.code === '23505') throw new Error('A club with this name or slug already exists.');
            throw error;
        }
        if (isPublic) {
            const emailVars = {
                clubName: data.name,
                contactEmail: form.contact_email.trim().toLowerCase(),
                contactPhone: form.contact_phone.trim(),
                creatorName: form.contact_name.trim(),
            };
            await Promise.all([
                sendEmail(emailVars.contactEmail, 'club_applied', emailVars),
                sendEmail(ADMIN_NOTIFY_EMAIL, 'admin_club_applied', emailVars),
            ]);
        }
        setSubmitMode('create');
        setCreatedClub(data);
    };

    const publishTasks = isPublic && claimClub
        ? ['Submitting your club claim', 'Notifying the 4M Padel team']
        : PUBLISH_TASKS;

    const handlePublish = async () => {
        if (publishingRef.current) return;
        publishingRef.current = true;
        setPhase('publishing');
        setPublishTasksDone(0);

        // Tick the checklist while the insert runs — the last item completes
        // only once the insert has actually succeeded.
        const ticker = setInterval(() => {
            setPublishTasksDone((n) => Math.min(n + 1, publishTasks.length - 1));
        }, 650);

        try {
            if (isPublic) await ensureSignedIn();
            if (isPublic && claimClub) await submitClaim();
            else await submitCreate();
            clearInterval(ticker);
            setPublishTasksDone(publishTasks.length);
            setTimeout(() => setPhase('success'), 700);
        } catch (err) {
            clearInterval(ticker);
            console.error(err);
            toast.error(err.message || 'Failed to submit');
            setPhase('form');
        } finally {
            publishingRef.current = false;
        }
    };

    const activeGroup = step.group;
    const isAdmin = mode === 'admin';

    const summaryRows = useMemo(() => ([
        { key: 'basic', label: 'Basic info', filled: !!form.name.trim() },
        { key: 'location', label: 'Location', filled: !!form.address.trim() },
        { key: 'facilities', label: 'Facilities', filled: form.facilities.length > 0 },
        { key: 'courts', label: 'Courts', filled: form.total_courts > 0 },
        { key: 'photos', label: 'Photos', filled: form.photos.length > 0 },
        { key: 'hours', label: 'Opening hours', filled: true },
        ...(isPublic
            ? [{ key: 'contact', label: 'Contact details', filled: !!(form.contact_name.trim() && form.contact_email.trim()) }]
            : []),
    ]), [form, isPublic]);

    /* ------------------------------ phases ------------------------------ */

    if (phase === 'publishing') {
        return (
            <div ref={containerRef} className={`${embedded ? 'w-full' : 'max-w-md mx-auto rounded-3xl border border-white/10 bg-[#0d0d0d] p-8 shadow-2xl'} scroll-mt-28`}>
                <StepHeader
                    title={isPublic && claimClub ? 'Submitting your club claim…' : isPublic ? 'Submitting your club…' : 'Creating your club…'}
                    subtitle={isPublic ? "We're sending your application to the 4M Padel team." : "We're setting up your club profile."}
                />
                <ul className="space-y-3 mb-8">
                    {publishTasks.map((task, i) => {
                        const done = i < publishTasksDone;
                        const current = i === publishTasksDone;
                        return (
                            <li key={task} className="flex items-center gap-3 text-sm">
                                {done ? (
                                    <Check size={16} className="text-padel-green shrink-0" />
                                ) : current ? (
                                    <Loader2 size={16} className="text-padel-green animate-spin shrink-0" />
                                ) : (
                                    <div className="w-4 h-4 rounded-full border border-white/15 shrink-0" />
                                )}
                                <span className={done || current ? 'text-white font-bold' : 'text-gray-600'}>{task}</span>
                            </li>
                        );
                    })}
                </ul>
                <div className="flex flex-col items-center gap-4 py-4">
                    <Loader2 size={44} className="text-padel-green animate-spin" />
                    <p className="text-xs text-gray-500">This may take a few moments.</p>
                </div>
            </div>
        );
    }

    if (phase === 'success' && createdClub) {
        const locationLabel = [createdClub.city, createdClub.province].filter(Boolean).join(', ') || 'Location set';
        const isClaimSuccess = !isAdmin && submitMode === 'claim';
        const isCreatePending = !isAdmin && submitMode !== 'claim';

        return (
            <div ref={containerRef} className={`${embedded ? 'w-full' : 'max-w-md mx-auto rounded-3xl border border-white/10 bg-[#0d0d0d] p-8 shadow-2xl'} text-center scroll-mt-28`}>
                <div className="w-16 h-16 mx-auto rounded-full border-2 border-padel-green flex items-center justify-center mb-5">
                    <Check size={30} className="text-padel-green" />
                </div>
                <h3 className="text-2xl font-black text-white tracking-tight">
                    {isAdmin ? 'Your club is live!' : isClaimSuccess ? 'Club claim received!' : 'Application submitted!'}
                </h3>
                <p className="text-sm text-gray-400 mt-2">
                    {isAdmin
                        ? `${createdClub.name} is now visible on 4M Padel.`
                        : isClaimSuccess
                            ? `Your club claim for ${createdClub.name} is pending review. We'll email you once an admin approves it — you'll then get Club Dashboard access.`
                            : `${createdClub.name} has been submitted for review. We'll email you once it's approved.`}
                </p>

                <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-4 flex items-center gap-3 text-left">
                    {(createdClub.logo_url || createdClub.cover_image_url) ? (
                        <img src={createdClub.logo_url || createdClub.cover_image_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0" />
                    ) : (
                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                            <Building2 size={18} />
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{createdClub.name}</p>
                        <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                            <MapPin size={10} /> {locationLabel}
                        </p>
                        {isAdmin && (
                            <span className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded bg-padel-green/10 border border-padel-green/25 text-padel-green text-[9px] font-black uppercase tracking-wider">
                                <VerifiedBadge tone="green" size={12} title="4M approved" /> 4M approved
                            </span>
                        )}
                    </div>
                </div>

                {(isClaimSuccess || isCreatePending) && (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-left">
                        <p className="text-sm font-bold text-white mb-3">What happens next?</p>
                        <ul className="space-y-2.5 text-sm text-gray-300">
                            <li className="flex items-start gap-2.5">
                                <span className="mt-0.5 w-5 h-5 rounded-full bg-padel-green/15 border border-padel-green/30 flex items-center justify-center shrink-0">
                                    <Check size={11} className="text-padel-green" />
                                </span>
                                <span>4M Padel will review your request</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <span className="mt-0.5 w-5 h-5 rounded-full bg-padel-green/15 border border-padel-green/30 flex items-center justify-center shrink-0">
                                    <Check size={11} className="text-padel-green" />
                                </span>
                                <span>We may contact you for verification</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                                <span className="mt-0.5 w-5 h-5 rounded-full bg-padel-green/15 border border-padel-green/30 flex items-center justify-center shrink-0">
                                    <Check size={11} className="text-padel-green" />
                                </span>
                                <span>You will be notified once a decision has been made</span>
                            </li>
                        </ul>
                    </div>
                )}

                {isAdmin && (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-left">
                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">What's next?</p>
                        <ul className="space-y-1.5 text-xs text-gray-300">
                            <li className="flex items-center gap-2"><Users size={12} className="text-padel-green shrink-0" /> Invite your team to manage your club</li>
                            <li className="flex items-center gap-2"><CalendarPlus size={12} className="text-padel-green shrink-0" /> Add upcoming events</li>
                            <li className="flex items-center gap-2"><Share2 size={12} className="text-padel-green shrink-0" /> Share your club with the community</li>
                        </ul>
                    </div>
                )}

                <div className="mt-6 space-y-2">
                    <button
                        type="button"
                        onClick={() => onComplete?.(createdClub)}
                        className="w-full py-3 rounded-xl bg-padel-green text-black text-sm font-black"
                    >
                        {isAdmin ? 'Open club profile' : 'Done'}
                    </button>
                    {createdClub.slug && isAdmin && (
                        <a
                            href={`/clubs/${createdClub.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full py-3 rounded-xl border border-white/10 text-gray-300 text-sm font-bold flex items-center justify-center gap-2 hover:bg-white/5"
                        >
                            <ExternalLink size={14} /> View public page
                        </a>
                    )}
                </div>
            </div>
        );
    }

    /* ------------------------------ form ------------------------------- */

    return (
        <div ref={containerRef} className={`${embedded ? 'w-full' : 'max-w-xl mx-auto rounded-3xl border border-white/10 bg-[#0d0d0d] p-5 md:p-8 shadow-2xl'} scroll-mt-28`}>
            <div className="flex items-center justify-between mb-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                    {isAdmin ? 'New club' : claimClub ? 'Claim this club' : 'Register your club'}
                </p>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5"
                        aria-label="Close"
                    >
                        <X size={15} />
                    </button>
                )}
            </div>

            {claimClub ? (
                <div className="mb-6 rounded-2xl border border-padel-green/25 bg-padel-green/5 p-4 flex items-center gap-3">
                    {claimClub.logo_url ? (
                        <img src={claimClub.logo_url} alt="" className="w-11 h-11 rounded-xl object-cover border border-white/10 shrink-0" />
                    ) : (
                        <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                            <Building2 size={16} />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{claimClub.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                            {claimClub.city || 'Existing club'} — requesting admin access
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={clearClaim}
                        className="shrink-0 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-white"
                    >
                        Change
                    </button>
                </div>
            ) : (
                <StepIndicator activeGroup={activeGroup} />
            )}

            {step.key === 'basic' && claimClub && (
                <div>
                    <StepHeader
                        title="Claim this club"
                        subtitle="This club already exists on 4M Padel. Request admin access to manage and update the club profile."
                    />
                </div>
            )}

            {step.key === 'basic' && !claimClub && (
                <div>
                    <StepHeader title="Basic information" subtitle="Let's start with your club details." />
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                            {form.logo_url ? (
                                <img src={form.logo_url} alt="Club logo" className="w-16 h-16 rounded-2xl object-cover bg-white border border-white/10 shrink-0" />
                            ) : (
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                    <Building2 size={22} />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-black uppercase tracking-wider text-gray-400">Club logo</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <label className={`inline-flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg cursor-pointer hover:bg-white/10 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                                        {form.logo_url ? 'Replace' : 'Upload'}
                                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
                                    </label>
                                    {form.logo_url && (
                                        <button type="button" onClick={() => setField('logo_url', '')} className="text-[10px] font-black uppercase tracking-wider text-red-400 hover:underline">
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Club name<span className="text-red-500 ml-0.5">*</span></label>
                            <input
                                value={form.name}
                                onChange={(e) => setField('name', e.target.value)}
                                placeholder="e.g. Net Set Sandton City"
                                className={inputClass}
                            />
                            {duplicates.length > 0 && (
                                <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 space-y-2">
                                    <p className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                                        <AlertTriangle size={12} />
                                        {isPublic
                                            ? 'Is this your club? Claim this club instead of creating a duplicate:'
                                            : 'Similar clubs already exist on 4M Padel:'}
                                    </p>
                                    {duplicates.map((club) => (
                                        <div key={club.id} className="flex items-center gap-2.5">
                                            {club.logo_url ? (
                                                <img src={club.logo_url} alt="" className="w-7 h-7 rounded-lg object-cover border border-white/10 shrink-0" />
                                            ) : (
                                                <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                                    <Building2 size={12} />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-bold text-white truncate">{club.name}</p>
                                                <p className="text-[10px] text-gray-500 truncate">{club.city || 'No city'}</p>
                                            </div>
                                            {isPublic ? (
                                                <button
                                                    type="button"
                                                    onClick={() => selectClaim(club)}
                                                    className="px-2.5 py-1 rounded-lg bg-padel-green text-black text-[10px] font-black uppercase tracking-wider shrink-0"
                                                >
                                                    Claim club
                                                </button>
                                            ) : onOpenExisting && (
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenExisting(club.id)}
                                                    className="px-2 py-1 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-wider text-gray-300 hover:bg-white/5 shrink-0"
                                                >
                                                    Open
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div>
                            <label className={labelClass}>
                                Tagline <span className="text-gray-600 normal-case tracking-normal font-medium">(optional)</span>
                            </label>
                            <input
                                value={form.tagline}
                                onChange={(e) => setField('tagline', e.target.value)}
                                placeholder="e.g. Premium rooftop padel in Sandton City."
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Club type<span className="text-red-500 ml-0.5">*</span></label>
                            <input
                                value="Padel Club"
                                readOnly
                                tabIndex={-1}
                                className={`${inputClass} text-gray-400 cursor-default focus:border-white/10`}
                            />
                        </div>
                        <SelectField
                            label="Affiliation"
                            optional
                            value={form.affiliation}
                            onChange={(v) => setField('affiliation', v)}
                            options={AFFILIATIONS}
                        />
                    </div>
                </div>
            )}

            {step.key === 'location' && (
                <div>
                    <StepHeader title="Where are you located?" subtitle="Help players find your club." />
                    <div className="space-y-4">
                        <div>
                            <label className={labelClass}>Address<span className="text-red-500 ml-0.5">*</span></label>
                            <input
                                ref={addressRef}
                                defaultValue={form.address}
                                onChange={(e) => setField('address', e.target.value)}
                                placeholder="Start typing to search…"
                                autoComplete="off"
                                className={inputClass}
                            />
                            <p className="text-[10px] text-gray-600 mt-1">
                                Powered by Google — selecting a result auto-fills city, province and map pin.
                            </p>
                        </div>
                        <div>
                            <label className={labelClass}>City<span className="text-red-500 ml-0.5">*</span></label>
                            <input
                                value={form.city}
                                onChange={(e) => setField('city', e.target.value)}
                                placeholder="e.g. Sandton"
                                className={inputClass}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <SelectField
                                label="Province"
                                required
                                value={form.province}
                                onChange={(v) => setField('province', v)}
                                options={SA_REGIONS.includes(form.province) || !form.province ? SA_REGIONS : [form.province, ...SA_REGIONS]}
                                placeholder="Select…"
                            />
                            <SelectField
                                label="Country"
                                required
                                value={form.country}
                                onChange={(v) => setField('country', v)}
                                options={COUNTRIES.includes(form.country) ? COUNTRIES : [form.country, ...COUNTRIES]}
                            />
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
                            {form.lat && form.lng && (
                                <iframe
                                    title="Club location"
                                    src={`https://maps.google.com/maps?q=${Number(form.lat)},${Number(form.lng)}&z=15&output=embed`}
                                    className="w-full h-44 block border-0"
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                />
                            )}
                            <div className="p-4 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <MapPin size={16} className={form.lat && form.lng ? 'text-padel-green shrink-0' : 'text-gray-500 shrink-0'} />
                                    <p className="text-xs text-gray-400 truncate">
                                        {form.lat && form.lng
                                            ? `Pinned at ${Number(form.lat).toFixed(4)}, ${Number(form.lng).toFixed(4)}`
                                            : 'No map pin yet — pick an address or use your location.'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={useMyLocation}
                                    className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-wider text-gray-200 hover:bg-white/10 flex items-center gap-1.5"
                                >
                                    <Crosshair size={11} /> Use my location
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {step.key === 'facilities' && (
                <div>
                    <StepHeader title="What facilities do you offer?" subtitle="Select all that apply." />
                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-3">Popular facilities</p>
                    <div className="grid grid-cols-2 gap-2.5">
                        {FACILITIES.map((facility) => {
                            const on = form.facilities.includes(facility);
                            return (
                                <button
                                    key={facility}
                                    type="button"
                                    onClick={() => toggleFacility(facility)}
                                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-3 text-left text-xs font-bold transition-colors ${
                                        on
                                            ? 'border-padel-green/40 bg-padel-green/10 text-white'
                                            : 'border-white/10 bg-black/30 text-gray-400 hover:bg-white/5'
                                    }`}
                                >
                                    <span className="truncate">{facility}</span>
                                    <span
                                        className={`w-[18px] h-[18px] rounded flex items-center justify-center border shrink-0 ${
                                            on ? 'bg-padel-green border-padel-green text-black' : 'border-white/20'
                                        }`}
                                    >
                                        {on && <Check size={12} />}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {step.key === 'courts' && (
                <div>
                    <StepHeader title="Tell us about your courts" subtitle="Add details about your padel courts." />
                    <div className="space-y-4">
                        <div>
                            <label className={labelClass}>Number of courts<span className="text-red-500 ml-0.5">*</span></label>
                            <div className="mt-1.5 flex items-center justify-between bg-black/40 border border-white/10 rounded-xl px-2 py-1.5">
                                <button
                                    type="button"
                                    onClick={() => setTotalCourts(form.total_courts - 1)}
                                    className="w-9 h-9 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 flex items-center justify-center"
                                    aria-label="Fewer courts"
                                >
                                    <Minus size={14} />
                                </button>
                                <span className="text-lg font-black text-white">{form.total_courts}</span>
                                <button
                                    type="button"
                                    onClick={() => setTotalCourts(form.total_courts + 1)}
                                    className="w-9 h-9 rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 flex items-center justify-center"
                                    aria-label="More courts"
                                >
                                    <Plus size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelClass}>Indoor courts</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={form.total_courts}
                                    value={form.indoor_courts}
                                    onChange={(e) => setIndoorCourts(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    onBlur={normaliseCourtCounts}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Outdoor courts</label>
                                <input
                                    type="number"
                                    min={0}
                                    max={form.total_courts}
                                    value={form.outdoor_courts}
                                    onChange={(e) => setOutdoorCourts(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    onBlur={normaliseCourtCounts}
                                    className={inputClass}
                                />
                            </div>
                        </div>
                        <SelectField
                            label="Court surface"
                            required
                            value={form.court_surface}
                            onChange={(v) => setField('court_surface', v)}
                            options={COURT_SURFACES}
                        />
                        <SelectField
                            label="Lighting"
                            value={form.lighting}
                            onChange={(v) => setField('lighting', v)}
                            options={LIGHTING_OPTIONS}
                        />
                    </div>
                </div>
            )}

            {step.key === 'photos' && (
                <div>
                    <StepHeader title="Add photos of your club" subtitle="Showcase your club with photos." />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {form.photos.map((photo, idx) => (
                            <button
                                key={photo.url}
                                type="button"
                                onClick={() => setSelectedPhotoIdx((cur) => (cur === idx ? null : idx))}
                                className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                                    selectedPhotoIdx === idx ? 'border-padel-green' : 'border-transparent'
                                }`}
                            >
                                <img src={photo.url} alt="" className="w-full h-full object-cover" />
                                <span
                                    role="button"
                                    tabIndex={-1}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removePhoto(idx);
                                    }}
                                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500"
                                    aria-label="Remove photo"
                                >
                                    <X size={11} />
                                </span>
                                {photo.tag && (
                                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-padel-green text-[9px] font-black uppercase tracking-wider">
                                        {photo.tag}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    <label className={`mt-3 w-full py-3 rounded-xl border border-dashed border-white/15 text-gray-400 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-white/5 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                        {uploading ? 'Uploading…' : form.photos.length ? 'Add more photos' : 'Upload photos'}
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
                    </label>

                    <div className="mt-5">
                        <p className="text-xs font-black uppercase tracking-wider text-gray-400">Tag your photos</p>
                        <p className="text-[11px] text-gray-600 mt-0.5 mb-2.5">Select a photo above, then pick a tag.</p>
                        <div className="flex flex-wrap gap-2">
                            {PHOTO_TAGS.map((tag) => {
                                const activeTag = selectedPhotoIdx != null && form.photos[selectedPhotoIdx]?.tag === tag;
                                return (
                                    <button
                                        key={tag}
                                        type="button"
                                        onClick={() => tagSelectedPhoto(tag)}
                                        className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                                            activeTag
                                                ? 'bg-padel-green text-black border-padel-green'
                                                : 'border-white/10 bg-black/30 text-gray-400 hover:bg-white/5'
                                        }`}
                                    >
                                        {tag}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {step.key === 'hours' && (
                <div>
                    <StepHeader title="Opening hours" subtitle="Set your club opening hours." />
                    <div className="space-y-3">
                        {(form.custom_days ? CUSTOM_HOUR_ROWS : GROUPED_HOUR_ROWS).map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-3">
                                <p className="text-sm font-bold text-white w-28 shrink-0">{row.label}</p>
                                <div className="flex items-center gap-2">
                                    <TimeSelect value={form.hours[row.keys[0]].open} onChange={(v) => setHours(row.keys, { open: v })} />
                                    <span className="text-gray-600 text-xs">–</span>
                                    <TimeSelect value={form.hours[row.keys[0]].close} onChange={(v) => setHours(row.keys, { close: v })} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setField('custom_days', !form.custom_days)}
                        className="mt-3 text-[11px] font-black uppercase tracking-wider text-padel-green hover:underline"
                    >
                        {form.custom_days ? 'Back to simple hours (Mon – Fri together)' : 'Customise individual days'}
                    </button>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-bold text-white">24/7 access for members</p>
                            <p className="text-[11px] text-gray-500 mt-0.5">Allow members to access courts outside staffed hours.</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={form.access_247}
                            onClick={() => setField('access_247', !form.access_247)}
                            className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${form.access_247 ? 'bg-padel-green' : 'bg-white/10'}`}
                        >
                            <span
                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.access_247 ? 'left-[22px]' : 'left-0.5'}`}
                            />
                        </button>
                    </div>

                    <div className="mt-4">
                        <label className={labelClass}>
                            Additional info <span className="text-gray-600 normal-case tracking-normal font-medium">(optional)</span>
                        </label>
                        <textarea
                            value={form.hours_notes}
                            onChange={(e) => setField('hours_notes', e.target.value)}
                            rows={2}
                            placeholder="E.g. Last booking at 22:00."
                            className={inputClass}
                        />
                    </div>
                </div>
            )}

            {step.key === 'contact' && (
                <div>
                    <StepHeader
                        title="Who's applying?"
                        subtitle={claimClub
                            ? 'Tell us who you are so an admin can approve your club claim.'
                            : 'Tell us who to contact about this club.'}
                    />
                    <div className="space-y-4">
                        <div className="relative">
                            <label className={labelClass}>Your full name<span className="text-red-500 ml-0.5">*</span></label>
                            <div className="relative">
                                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                <input
                                    value={form.contact_name}
                                    onChange={(e) => handleContactNameChange(e.target.value)}
                                    onFocus={() => playerResults.length > 0 && setShowPlayerResults(true)}
                                    placeholder="Search your player profile…"
                                    autoComplete="off"
                                    className={`${inputClass} pl-9`}
                                />
                                {searchingPlayers && (
                                    <Loader2 size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 animate-spin" />
                                )}
                            </div>
                            {showPlayerResults && !matchedProfile && playerResults.length > 0 && (
                                <div className="absolute z-20 left-0 right-0 mt-1.5 bg-[#111] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                                    {playerResults.map((player) => (
                                        <button
                                            key={player.id}
                                            type="button"
                                            onClick={() => selectPlayer(player)}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5"
                                        >
                                            {player.image_url ? (
                                                <img src={player.image_url} alt="" className="w-7 h-7 rounded-full object-cover border border-white/10 shrink-0" />
                                            ) : (
                                                <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[9px] font-black text-gray-400 shrink-0">
                                                    {(player.name || '?').slice(0, 1).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-white truncate">{player.name}</p>
                                                <p className="text-[10px] text-gray-500 truncate">{player.email}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <p className="text-[10px] text-gray-600 mt-1">
                                Select your existing 4M Padel player profile so we can link the club to your account.
                            </p>
                        </div>

                        {matchedProfile && (
                            <div className="rounded-xl border border-padel-green/25 bg-padel-green/5 px-3.5 py-2.5 flex items-center gap-2 text-xs text-gray-300">
                                <BadgeCheck size={14} className="text-padel-green shrink-0" />
                                Linked to <span className="font-bold text-white">{matchedProfile.name}</span>
                                {sessionEmail ? '(signed in)' : ''}
                            </div>
                        )}

                        {needsSignIn && (
                            <div>
                                <label className={labelClass}>Account password<span className="text-red-500 ml-0.5">*</span></label>
                                <div className="relative">
                                    <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={accountPassword}
                                        onChange={(e) => setAccountPassword(e.target.value)}
                                        placeholder="Password for this player account"
                                        className={`${inputClass} pl-9 pr-10`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-600 mt-1">
                                    We'll sign you in to submit the application under your account.
                                </p>
                            </div>
                        )}

                        <div>
                            <label className={labelClass}>Contact email<span className="text-red-500 ml-0.5">*</span></label>
                            <input
                                value={form.contact_email}
                                onChange={(e) => setField('contact_email', e.target.value)}
                                readOnly={!!matchedProfile?.email}
                                className={`${inputClass} ${matchedProfile?.email ? 'text-gray-400 cursor-default' : ''}`}
                                placeholder="you@example.com"
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Phone / WhatsApp<span className="text-red-500 ml-0.5">*</span></label>
                            <input
                                value={form.contact_phone}
                                onChange={(e) => setField('contact_phone', e.target.value)}
                                placeholder="+27…"
                                className={inputClass}
                            />
                        </div>
                        <SelectField
                            label="Your role at the club"
                            required
                            value={form.primary_role}
                            onChange={(v) => setField('primary_role', v)}
                            options={ROLE_OPTIONS}
                            placeholder="Select…"
                        />
                        {claimClub && (
                            <div>
                                <label className={labelClass}>
                                    Notes for the 4M Padel team <span className="text-gray-600 normal-case tracking-normal font-medium">(optional)</span>
                                </label>
                                <textarea
                                    value={form.claim_notes}
                                    onChange={(e) => setField('claim_notes', e.target.value)}
                                    rows={2}
                                    placeholder="E.g. I'm the owner — you can verify via the club's website."
                                    className={inputClass}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {step.key === 'review' && claimClub && (
                <div>
                    <StepHeader title="Review your club claim" subtitle="Check your details before submitting." />
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 flex items-center gap-3">
                        {claimClub.logo_url ? (
                            <img src={claimClub.logo_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0" />
                        ) : (
                            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                <Building2 size={18} />
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{claimClub.name}</p>
                            <p className="text-xs text-gray-500 truncate">{claimClub.city || 'Existing club on 4M Padel'}</p>
                        </div>
                    </div>
                    <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4 space-y-1.5 text-xs text-gray-300">
                        <p><span className="text-gray-500">Applicant:</span> <span className="font-bold text-white">{form.contact_name}</span></p>
                        <p><span className="text-gray-500">Email:</span> {form.contact_email}</p>
                        <p><span className="text-gray-500">Phone:</span> {form.contact_phone}</p>
                        <p><span className="text-gray-500">Role:</span> {form.primary_role}</p>
                        {form.claim_notes.trim() && <p><span className="text-gray-500">Notes:</span> {form.claim_notes}</p>}
                    </div>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Next steps</p>
                        <ul className="space-y-1.5 text-xs text-gray-400">
                            <li>• The 4M Padel team will review your club claim.</li>
                            <li>• Once approved, you'll get Club Dashboard access to manage the club.</li>
                        </ul>
                    </div>
                </div>
            )}

            {step.key === 'review' && !claimClub && (
                <div>
                    <StepHeader title="Review & publish" subtitle="Check your details before publishing." />
                    <div className="rounded-2xl border border-white/10 bg-black/40 p-4 flex items-center gap-3">
                        {(form.logo_url || form.photos[0]?.url) ? (
                            <img src={form.logo_url || form.photos[0].url} alt="" className="w-12 h-12 rounded-xl object-cover border border-white/10 shrink-0" />
                        ) : (
                            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 shrink-0">
                                <Building2 size={18} />
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{form.name || 'New club'}</p>
                            <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                                <MapPin size={10} /> {[form.city, form.province].filter(Boolean).join(', ') || 'Location not set'}
                            </p>
                        </div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-white/10 divide-y divide-white/5 overflow-hidden">
                        {summaryRows.map((row) => (
                            <div key={row.key} className="flex items-center justify-between gap-3 px-4 py-3 bg-black/30">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    {row.filled ? (
                                        <Check size={13} className="text-padel-green shrink-0" />
                                    ) : (
                                        <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
                                    )}
                                    <p className="text-sm font-bold text-white truncate">{row.label}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => goToStep(row.key)}
                                    className="text-[11px] font-black uppercase tracking-wider text-padel-green hover:underline shrink-0"
                                >
                                    Edit
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-2">Next steps</p>
                        <ul className="space-y-1.5 text-xs text-gray-400">
                            <li>• Coaches can link their profile to your club.</li>
                            <li>
                                {isAdmin
                                    ? '• Your club will be visible to players on 4M Padel immediately.'
                                    : '• Your club will be reviewed by the 4M Padel team before going live.'}
                            </li>
                        </ul>
                    </div>
                </div>
            )}

            <div className="mt-7 flex items-center gap-3">
                {stepIndex > 0 ? (
                    <button
                        type="button"
                        onClick={goBack}
                        className="flex-1 py-3 rounded-xl border border-white/10 text-gray-300 text-sm font-bold hover:bg-white/5"
                    >
                        Back
                    </button>
                ) : (
                    onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 py-3 rounded-xl border border-white/10 text-gray-300 text-sm font-bold hover:bg-white/5"
                        >
                            Cancel
                        </button>
                    )
                )}
                {step.key === 'review' ? (
                    <button
                        type="button"
                        onClick={handlePublish}
                        disabled={uploading}
                        className="flex-1 py-3 rounded-xl bg-padel-green text-black text-sm font-black disabled:opacity-50"
                    >
                        {isAdmin ? 'Publish Club' : claimClub ? 'Submit club claim' : 'Submit for review'}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={goNext}
                        className="flex-1 py-3 rounded-xl bg-padel-green text-black text-sm font-black"
                    >
                        Continue
                    </button>
                )}
            </div>
        </div>
    );
};

export default ClubCreateWizard;
