import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Check, Copy, Eye, EyeOff, FileText,
    Image as ImageIcon, KeyRound, Loader2, LockKeyhole, Shield, SlidersHorizontal, Trophy, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../supabaseClient';
import { useClubs } from '../../hooks/useClubs';
import { attachPlacesAutocomplete } from '../../utils/googleMaps';

const STEPS = ['Event details', 'Event setup', 'Media & prizes', 'Additional info', 'Review & create'];
const STEP_ICONS = [CalendarDays, SlidersHorizontal, ImageIcon, FileText, Eye];
const FORMATS = ['TBC', 'Americano', 'Mexicano', 'King of the Court', 'Knockout', 'Round Robin', 'Free Play'];
const ENTRY_OPTIONS = [
    { value: 'Required', label: 'Partner' },
    { value: 'Not required', label: 'Solo' },
    { value: 'Optional', label: 'Either' },
];
const PAYMENT_OPTIONS = [
    { value: 'platform', label: '4M Event Manager' },
    { value: 'eft', label: 'EFT' },
    { value: 'external', label: 'External link' },
    { value: 'free', label: 'Free entry' },
];

const STEP_FIELDS = {
    1: ['event_name', 'organiser_name', 'start_date', 'end_date', 'start_time', 'end_time', 'registration_closes_at', 'venue', 'max_players'],
    2: ['division_name', 'format', 'entry_fee', 'payment_bank_name', 'payment_account_number', 'external_payment_url', 'access_code'],
};

const slugify = (value) => String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const findAvailableSlug = async (baseSlug, editingId = null) => {
    const base = baseSlug || `quick-event-${Date.now()}`;
    for (let suffix = 0; suffix < 100; suffix += 1) {
        const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
        let query = supabase.from('calendar').select('id').eq('slug', candidate).limit(1);
        if (editingId) query = query.neq('id', editingId);
        const { data, error } = await query;
        if (error) throw error;
        if (!data?.length) return candidate;
    }
    return `${base}-${Date.now()}`;
};

const dateLabel = (start, end) => {
    if (!start) return '';
    const format = (value) => new Date(`${value}T12:00:00`).toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'long', year: 'numeric',
    });
    return end && end !== start ? `${format(start)} - ${format(end)}` : format(start);
};

const toLocalDateTimeInput = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const generateAccessCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
};

const uploadImage = async (file, folder) => {
    if (!file?.type?.startsWith('image/')) throw new Error('Choose an image file');
    if (file.size > 5 * 1024 * 1024) throw new Error('Image must be smaller than 5 MB');
    const safeName = String(file.name || 'image').toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
    const { error } = await supabase.storage.from('gallery').upload(path, file, {
        contentType: file.type,
        upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from('gallery').getPublicUrl(path).data.publicUrl;
};

const blankForm = {
    event_name: '', organiser_name: '', organisation_id: '', start_date: '', end_date: '', start_time: '', end_time: '',
    registration_closes_at: '', club_id: '', venue: '', address: '', city: '', indoor_outdoor: 'Indoor',
    courts_count: '1', max_players: '8', division_name: 'Open', format: 'TBC',
    partner_requirement: 'Required', payment_method: 'platform', entry_fee: '',
    payment_bank_name: '', payment_account_name: '', payment_account_number: '', payment_branch_code: '',
    payment_reference_note: '', external_payment_url: '', require_access_code: false, access_code: '',
    custom_image_url: '', sponsor_logos: [], prize_money_total: '', description: '',
    contact_details: '', organiser_phone: '', organiser_email: '', other_info: '',
};

const QuickEventBuilder = ({ isOpen, onClose, onSaved, organisation = null, editingEvent = null }) => {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(blankForm);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState('');
    const [showCode, setShowCode] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [savedDetails, setSavedDetails] = useState(null);
    const [organisations, setOrganisations] = useState([]);
    const [organisationsLoading, setOrganisationsLoading] = useState(false);
    const [organiserOpen, setOrganiserOpen] = useState(false);
    const [activeOrganisationIndex, setActiveOrganisationIndex] = useState(0);
    const [clubQuery, setClubQuery] = useState('');
    const [clubOpen, setClubOpen] = useState(false);
    const [activeClubIndex, setActiveClubIndex] = useState(0);
    const addressInputRef = useRef(null);
    const organiserSearchRef = useRef(null);
    const clubSearchRef = useRef(null);
    const endDateTouchedRef = useRef(false);
    const { clubs, loadingClubs } = useClubs();

    const isEditing = !!editingEvent?.id;
    const inputClass = 'w-full min-h-11 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-base sm:text-sm text-white outline-none placeholder:text-gray-600 focus-visible:border-padel-green focus-visible:ring-2 focus-visible:ring-padel-green/25';
    const labelClass = 'mb-1.5 block text-xs font-bold text-gray-300';

    useEffect(() => {
        if (!isOpen) return;
        setStep(1);
        setShowCode(false);
        setSavedDetails(null);
        setFieldErrors({});
        setOrganiserOpen(false);
        setActiveOrganisationIndex(0);
        setClubOpen(false);
        setActiveClubIndex(0);
        const source = editingEvent || {};
        endDateTouchedRef.current = Boolean(source.end_date && source.end_date !== source.start_date);
        setClubQuery(source.club_id ? (source.venue || '') : '');
        const sponsorLogos = Array.isArray(source.sponsor_logos) ? source.sponsor_logos : [];
        setForm({
            ...blankForm,
            event_name: source.event_name || '',
            organiser_name: source.organiser_name || organisation?.name || '',
            organisation_id: organisation?.id || source.organisation_id || '',
            start_date: source.start_date?.slice(0, 10) || '',
            end_date: source.end_date?.slice(0, 10) || source.start_date?.slice(0, 10) || '',
            start_time: source.start_time || '', end_time: source.end_time || '',
            registration_closes_at: toLocalDateTimeInput(source.registration_closes_at),
            club_id: source.club_id || '',
            venue: source.venue || '', address: source.address || '', city: source.city || '',
            indoor_outdoor: source.indoor_outdoor || source.courts || 'Indoor',
            courts_count: source.courts_count != null ? String(source.courts_count) : '1',
            max_players: source.max_players != null ? String(source.max_players) : (source.max_teams_capacity != null ? String(source.max_teams_capacity) : '8'),
            division_name: source._quickDivision?.name || 'Open',
            format: source.default_match_format || source._quickDivision?.format || 'TBC',
            partner_requirement: source.partner_requirement || 'Required',
            payment_method: source.payment_method || (source.allow_payments === false ? 'free' : 'platform'),
            entry_fee: source._quickDivision?.entry_fee != null ? String(source._quickDivision.entry_fee) : (source.entry_fee != null ? String(source.entry_fee) : ''),
            payment_bank_name: source.payment_bank_name || organisation?.payment_bank_name || '',
            payment_account_name: source.payment_account_name || organisation?.payment_account_name || '',
            payment_account_number: source.payment_account_number || organisation?.payment_account_number || '',
            payment_branch_code: source.payment_branch_code || organisation?.payment_branch_code || '',
            payment_reference_note: source.payment_reference_note || organisation?.payment_reference_note || '',
            external_payment_url: source.external_payment_url || '',
            require_access_code: source.registration_access === 'code', access_code: '',
            custom_image_url: source.custom_image_url || '', sponsor_logos: sponsorLogos,
            prize_money_total: source.prize_money_total != null ? String(source.prize_money_total) : '',
            description: source.description || '', contact_details: source.contact_details || '',
            organiser_phone: source.organiser_phone || organisation?.contact_phone || '',
            organiser_email: source.organiser_email || organisation?.contact_email || '',
            other_info: source.rules_regs || '',
        });
    }, [isOpen, editingEvent, organisation]);

    useEffect(() => {
        if (!isOpen || organisation) return undefined;
        let cancelled = false;
        setOrganisationsLoading(true);
        supabase
            .from('organisations')
            .select('id, name, slug, logo_url, contact_email, contact_phone, payment_bank_name, payment_account_name, payment_account_number, payment_branch_code, payment_reference_note')
            .eq('status', 'approved')
            .order('name')
            .limit(500)
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) {
                    console.warn('Organisation list failed to load:', error.message);
                    setOrganisations([]);
                } else {
                    setOrganisations(data || []);
                }
                setOrganisationsLoading(false);
            });
        return () => { cancelled = true; };
    }, [isOpen, organisation]);

    useEffect(() => {
        const handlePointerDown = (event) => {
            if (organiserSearchRef.current && !organiserSearchRef.current.contains(event.target)) {
                setOrganiserOpen(false);
            }
            if (clubSearchRef.current && !clubSearchRef.current.contains(event.target)) {
                setClubOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, []);

    useEffect(() => {
        if (!isOpen || !editingEvent?.id || editingEvent?._quickDivision) return undefined;
        let cancelled = false;
        supabase
            .from('tournament_divisions')
            .select('id, name, entry_fee, format')
            .eq('event_id', editingEvent.id)
            .order('sort_order', { ascending: true })
            .limit(1)
            .maybeSingle()
            .then(({ data }) => {
                if (!cancelled && data) {
                    setForm((prev) => ({
                        ...prev,
                        division_name: data.name || prev.division_name,
                        entry_fee: data.entry_fee != null ? String(data.entry_fee) : prev.entry_fee,
                        format: data.format || prev.format,
                    }));
                }
            });
        return () => { cancelled = true; };
    }, [isOpen, editingEvent]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !saving) onClose?.();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, saving, onClose]);

    useEffect(() => {
        if (step !== 1) {
            setOrganiserOpen(false);
            setClubOpen(false);
        }
    }, [step]);

    useEffect(() => {
        if (!isOpen || step !== 1 || !addressInputRef.current) return undefined;
        let cancelled = false;
        let attachment = null;
        attachPlacesAutocomplete(addressInputRef.current, {
            country: 'za',
            onPlace: (place) => {
                const components = place.address_components || [];
                const component = (type) => components.find((item) => item.types.includes(type))?.long_name || '';
                const city = component('locality')
                    || component('administrative_area_level_2')
                    || component('administrative_area_level_1');
                setForm((prev) => ({
                    ...prev,
                    address: place.formatted_address || prev.address,
                    city: city || prev.city,
                    venue: prev.venue || place.name || '',
                }));
            },
        }).then((value) => {
            if (cancelled) value.destroy();
            else attachment = value;
        }).catch((error) => {
            console.warn('Google address autocomplete unavailable:', error.message);
        });
        return () => {
            cancelled = true;
            attachment?.destroy();
        };
    }, [isOpen, step]);

    const clearFieldError = (name) => setFieldErrors((prev) => {
        if (!prev[name]) return prev;
        const nextErrors = { ...prev };
        delete nextErrors[name];
        return nextErrors;
    });
    const update = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
        clearFieldError(name);
    };
    const handleStartDateChange = (value) => {
        setForm((prev) => ({
            ...prev,
            start_date: value,
            end_date: endDateTouchedRef.current ? prev.end_date : value,
        }));
        clearFieldError('start_date');
        if (!endDateTouchedRef.current) clearFieldError('end_date');
    };

    const handleEndDateChange = (value) => {
        endDateTouchedRef.current = true;
        update('end_date', value);
    };
    const filteredOrganisations = useMemo(() => {
        const query = form.organiser_name.trim().toLowerCase();
        if (!query || form.organisation_id) return organisations;
        return organisations.filter((item) => String(item.name || '').toLowerCase().includes(query));
    }, [form.organiser_name, form.organisation_id, organisations]);

    useEffect(() => {
        if (!organiserOpen) return;
        const active = filteredOrganisations[activeOrganisationIndex];
        if (active) document.getElementById(`quick-event-organisation-${active.id}`)?.scrollIntoView({ block: 'nearest' });
    }, [organiserOpen, activeOrganisationIndex, filteredOrganisations]);

    const selectOrganisation = (selected) => {
        setForm((prev) => ({
            ...prev,
            organisation_id: selected.id,
            organiser_name: selected.name || '',
            organiser_email: selected.contact_email || prev.organiser_email,
            organiser_phone: selected.contact_phone || prev.organiser_phone,
            payment_bank_name: selected.payment_bank_name || prev.payment_bank_name,
            payment_account_name: selected.payment_account_name || prev.payment_account_name,
            payment_account_number: selected.payment_account_number || prev.payment_account_number,
            payment_branch_code: selected.payment_branch_code || prev.payment_branch_code,
            payment_reference_note: selected.payment_reference_note || prev.payment_reference_note,
        }));
        setOrganiserOpen(false);
        setActiveOrganisationIndex(0);
        clearFieldError('organiser_name');
    };

    const handleOrganiserChange = (value) => {
        setForm((prev) => ({ ...prev, organiser_name: value, organisation_id: '' }));
        clearFieldError('organiser_name');
        setActiveOrganisationIndex(0);
        setOrganiserOpen(true);
    };

    const handleOrganiserKeyDown = (event) => {
        if (organisation) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!organiserOpen) {
                setOrganiserOpen(true);
                setActiveOrganisationIndex(0);
            } else {
                setActiveOrganisationIndex((index) => Math.min(index + 1, Math.max(0, filteredOrganisations.length - 1)));
            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!organiserOpen) {
                setOrganiserOpen(true);
                setActiveOrganisationIndex(Math.max(0, filteredOrganisations.length - 1));
            } else {
                setActiveOrganisationIndex((index) => Math.max(0, index - 1));
            }
        } else if (event.key === 'Enter' && organiserOpen && filteredOrganisations[activeOrganisationIndex]) {
            event.preventDefault();
            selectOrganisation(filteredOrganisations[activeOrganisationIndex]);
        } else if (event.key === 'Escape') {
            event.stopPropagation();
            setOrganiserOpen(false);
        }
    };
    const filteredClubs = useMemo(() => {
        const query = clubQuery.trim().toLowerCase();
        if (!query || form.club_id) return clubs;
        return clubs.filter((item) => String(item.name || '').toLowerCase().includes(query));
    }, [clubQuery, form.club_id, clubs]);

    useEffect(() => {
        if (!form.club_id) return;
        const selected = clubs.find((item) => String(item.id) === String(form.club_id));
        if (selected && clubQuery !== selected.name) setClubQuery(selected.name || '');
    }, [clubs, form.club_id, clubQuery]);

    useEffect(() => {
        if (!clubOpen) return;
        const active = filteredClubs[activeClubIndex];
        if (active) document.getElementById(`quick-event-club-${active.id}`)?.scrollIntoView({ block: 'nearest' });
    }, [clubOpen, activeClubIndex, filteredClubs]);

    const selectClub = (club) => {
        setForm((prev) => ({
            ...prev,
            club_id: club.id,
            venue: club.name || prev.venue,
            address: club.address || '',
            city: club.city || '',
        }));
        setClubQuery(club.name || '');
        setClubOpen(false);
        setActiveClubIndex(0);
        clearFieldError('venue');
    };

    const handleClubChange = (value) => {
        setClubQuery(value);
        setForm((prev) => ({ ...prev, club_id: '' }));
        setActiveClubIndex(0);
        setClubOpen(true);
    };

    const clearClub = () => {
        setClubQuery('');
        setForm((prev) => ({ ...prev, club_id: '' }));
        setActiveClubIndex(0);
        setClubOpen(true);
    };

    const handleClubKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!clubOpen) {
                setClubOpen(true);
                setActiveClubIndex(0);
            } else {
                setActiveClubIndex((index) => Math.min(index + 1, Math.max(0, filteredClubs.length - 1)));
            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!clubOpen) {
                setClubOpen(true);
                setActiveClubIndex(Math.max(0, filteredClubs.length - 1));
            } else {
                setActiveClubIndex((index) => Math.max(0, index - 1));
            }
        } else if (event.key === 'Enter' && clubOpen && filteredClubs[activeClubIndex]) {
            event.preventDefault();
            selectClub(filteredClubs[activeClubIndex]);
        } else if (event.key === 'Escape') {
            event.stopPropagation();
            setClubOpen(false);
        }
    };
    const copyText = async (value, label) => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
        } catch {
            toast.error(`Unable to copy ${label.toLowerCase()}`);
        }
    };
    const priceLabel = form.payment_method === 'free' || Number(form.entry_fee || 0) === 0
        ? 'Free'
        : `R${Number(form.entry_fee || 0).toLocaleString('en-ZA')}`;

    const getStepErrors = (targetStep) => {
        const errors = {};
        if (targetStep === 1) {
            if (!form.event_name.trim()) errors.event_name = 'Enter an event name.';
            if (!form.organiser_name.trim()) errors.organiser_name = 'Enter or select an organiser.';
            if (!form.start_date) errors.start_date = 'Choose a start date.';
            if (!form.end_date) errors.end_date = 'Choose an end date.';
            if (!form.start_time) errors.start_time = 'Choose a start time.';
            if (!form.end_time) errors.end_time = 'Choose an end time.';
            if (form.start_date && form.end_date && form.end_date < form.start_date) errors.end_date = 'The end date cannot be before the start date.';
            if (form.start_date === form.end_date && form.start_time && form.end_time && form.end_time <= form.start_time) errors.end_time = 'The end time must be after the start time.';
            if (!form.registration_closes_at) errors.registration_closes_at = 'Choose when registration closes.';
            if (!form.venue.trim()) errors.venue = 'Enter a venue or select a club.';
            if (!Number.isInteger(Number(form.max_players)) || Number(form.max_players) < 1) errors.max_players = 'Enter a valid maximum number of players.';
        }
        if (targetStep === 2) {
            if (!form.division_name.trim()) errors.division_name = 'Enter a division.';
            if (!form.format) errors.format = 'Choose a format.';
            if (form.payment_method !== 'free' && form.entry_fee === '') errors.entry_fee = 'Enter the entry price.';
            if (form.payment_method === 'eft' && !form.payment_bank_name.trim()) errors.payment_bank_name = 'Enter the bank name.';
            if (form.payment_method === 'eft' && !form.payment_account_number.trim()) errors.payment_account_number = 'Enter the account number.';
            if (form.payment_method === 'external' && !/^https?:\/\//i.test(form.external_payment_url)) errors.external_payment_url = 'Enter a complete URL beginning with http:// or https://.';
            if (form.require_access_code && !isEditing && form.access_code.trim().length < 6) errors.access_code = 'Use at least 6 characters.';
            if (form.require_access_code && form.access_code && form.access_code.trim().length < 6) errors.access_code = 'Use at least 6 characters.';
        }
        return errors;
    };

    const focusFirstError = (targetStep, errors) => {
        const firstField = STEP_FIELDS[targetStep]?.find((field) => errors[field]);
        if (!firstField) return;
        if (step !== targetStep) setStep(targetStep);
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            document.querySelector(`[data-quick-event-field="${firstField}"]`)?.focus();
        }));
    };

    const validateStep = (targetStep = step) => {
        const errors = getStepErrors(targetStep);
        const stepFields = STEP_FIELDS[targetStep] || [];
        setFieldErrors((prev) => {
            const nextErrors = { ...prev };
            stepFields.forEach((field) => delete nextErrors[field]);
            return { ...nextErrors, ...errors };
        });
        if (Object.keys(errors).length) {
            const firstError = STEP_FIELDS[targetStep].find((field) => errors[field]);
            toast.error(errors[firstError]);
            focusFirstError(targetStep, errors);
            return false;
        }
        return true;
    };

    const fieldClass = (name, extra = '') => `${inputClass} ${fieldErrors[name] ? 'border-red-500/80 bg-red-500/[0.06] ring-2 ring-red-500/20 focus-visible:border-red-400 focus-visible:ring-red-500/30' : ''} ${extra}`;
    const fieldA11y = (name) => ({
        'data-quick-event-field': name,
        'aria-invalid': fieldErrors[name] ? 'true' : undefined,
        'aria-describedby': fieldErrors[name] ? `quick-event-${name}-error` : undefined,
    });
    const renderFieldError = (name) => fieldErrors[name] ? (
        <p id={`quick-event-${name}-error`} className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-300">
            <AlertTriangle size={13} aria-hidden="true" />{fieldErrors[name]}
        </p>
    ) : null;

    const next = () => {
        if (!validateStep()) return;
        setStep((current) => Math.min(5, current + 1));
    };

    const handleUpload = async (event, type) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setUploading(type);
        try {
            const url = await uploadImage(file, type === 'poster' ? 'quick-event-posters' : 'quick-event-sponsors');
            if (type === 'poster') update('custom_image_url', url);
            else update('sponsor_logos', [url]);
            toast.success(type === 'poster' ? 'Event poster uploaded' : 'Sponsor logo uploaded');
        } catch (error) {
            toast.error(error.message || 'Unable to upload image');
        } finally {
            setUploading('');
            event.target.value = '';
        }
    };

    const save = async () => {
        if (!validateStep(1) || !validateStep(2)) return;
        setSaving(true);
        let eventId = editingEvent?.id || null;
        try {
            const isOrgEvent = !!organisation?.id;
            const fee = form.payment_method === 'free' ? 0 : Number(form.entry_fee || 0);
            const slug = editingEvent?.slug || await findAvailableSlug(`${slugify(form.event_name)}-${form.start_date}`, editingEvent?.id);
            const payload = {
                event_name: form.event_name.trim(),
                organiser_name: form.organiser_name.trim(),
                organisation_id: organisation?.id || form.organisation_id || null,
                club_id: form.club_id || null,
                slug,
                start_date: form.start_date, end_date: form.end_date,
                start_time: form.start_time, end_time: form.end_time,
                event_dates: dateLabel(form.start_date, form.end_date),
                registration_opens_at: editingEvent?.registration_opens_at || new Date().toISOString(),
                registration_closes_at: new Date(form.registration_closes_at).toISOString(),
                venue: form.venue.trim(), venues: [form.venue.trim()], address: form.address.trim() || null,
                city: form.city.trim() || null, indoor_outdoor: form.indoor_outdoor,
                courts: form.indoor_outdoor, courts_count: Number(form.courts_count || 0) || null,
                max_players: Number(form.max_players), max_teams_capacity: Number(form.max_players),
                partner_requirement: form.partner_requirement, default_match_format: form.format,
                entry_fee: fee, payment_method: form.payment_method,
                allow_payments: form.payment_method !== 'free', finance_managed: form.payment_method === 'platform',
                payment_bank_name: form.payment_method === 'eft' ? form.payment_bank_name.trim() : null,
                payment_account_name: form.payment_method === 'eft' ? form.payment_account_name.trim() : null,
                payment_account_number: form.payment_method === 'eft' ? form.payment_account_number.trim() : null,
                payment_branch_code: form.payment_method === 'eft' ? form.payment_branch_code.trim() : null,
                payment_reference_note: form.payment_method === 'eft' ? form.payment_reference_note.trim() : null,
                external_payment_url: form.payment_method === 'external' ? form.external_payment_url.trim() : null,
                custom_image_url: form.custom_image_url || null, sponsor_logos: form.sponsor_logos,
                prize_money_total: form.prize_money_total ? Number(form.prize_money_total) : null,
                description: form.description.trim() || null, rules_regs: form.other_info.trim() || null,
                contact_details: form.contact_details.trim() || null,
                organiser_phone: form.organiser_phone.trim() || null,
                organiser_email: form.organiser_email.trim() || null,
                is_manual: true, is_quick_event: true, is_weekly: false, sapa_status: 'None',
                tournament_tag: 'Social', registration_access: editingEvent?.registration_access || 'public',
                is_visible: isEditing ? editingEvent.is_visible !== false : false,
                ...(!isEditing ? { sanction_status: isOrgEvent ? 'pending' : 'approved' } : {}),
            };

            if (isEditing) {
                const { error } = await supabase.from('calendar').update(payload).eq('id', eventId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('calendar').insert([payload]).select('id').single();
                if (error) throw error;
                eventId = data.id;
            }

            const division = {
                event_id: eventId, name: form.division_name.trim(), entry_fee: fee,
                format: form.format, entry_limit: Number(form.max_players),
                gender: 'Mixed', scoring_point: 'golden', is_active: true, sort_order: 0,
            };
            let divisionId = editingEvent?._quickDivision?.id || null;
            if (isEditing && !divisionId) {
                const { data } = await supabase
                    .from('tournament_divisions')
                    .select('id')
                    .eq('event_id', eventId)
                    .order('sort_order', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                divisionId = data?.id || null;
            }
            if (divisionId) {
                const { error } = await supabase.from('tournament_divisions').update(division).eq('id', divisionId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('tournament_divisions').insert([division]);
                if (error) throw error;
            }

            const protectedBefore = editingEvent?.registration_access === 'code';
            if (form.require_access_code && (!protectedBefore || form.access_code)) {
                const { error } = await supabase.rpc('set_event_access_code', {
                    p_event_id: eventId, p_enabled: true, p_code: form.access_code.trim(),
                });
                if (error) throw error;
            } else if (!form.require_access_code && protectedBefore) {
                const { error } = await supabase.rpc('set_event_access_code', {
                    p_event_id: eventId, p_enabled: false, p_code: null,
                });
                if (error) throw error;
            }

            if (!isOrgEvent && !isEditing) {
                const { error } = await supabase.from('calendar').update({ is_visible: true }).eq('id', eventId);
                if (error) throw error;
            }

            toast.success(isEditing ? 'Quick event updated' : 'Quick event created');
            onSaved?.({ eventId, isNew: !isEditing, eventName: form.event_name });
            setSavedDetails({
                eventId,
                eventName: form.event_name,
                shareUrl: `${window.location.origin}/calendar/${slug}`,
                accessCode: form.require_access_code && form.access_code ? form.access_code.trim() : null,
                wasEditing: isEditing,
            });
        } catch (error) {
            console.error(error);
            toast.error(error.message || 'Unable to save quick event');
        } finally {
            setSaving(false);
        }
    };

    const selectedEntry = ENTRY_OPTIONS.find((option) => option.value === form.partner_requirement)?.label || 'Either';
    const selectedPayment = PAYMENT_OPTIONS.find((option) => option.value === form.payment_method)?.label || 'Not set';
    const reviewLink = `${window.location.origin}/calendar/${slugify(form.event_name) || 'quick-event'}${form.start_date ? `-${form.start_date}` : ''}`;
    const quickReviewIssues = useMemo(() => {
        const issues = [];
        if (!form.event_name.trim()) issues.push('Add an event name.');
        if (!form.organiser_name.trim()) issues.push('Choose or enter an organiser.');
        if (!form.start_date || !form.end_date) issues.push('Complete the event dates.');
        if (form.start_date && form.end_date && form.end_date < form.start_date) issues.push('The end date cannot be before the start date.');
        if (!form.start_time || !form.end_time) issues.push('Complete the event times.');
        if (!form.registration_closes_at) issues.push('Set the registration closing date.');
        if (!form.venue.trim()) issues.push('Add a venue.');
        if (!form.division_name.trim()) issues.push('Add a division.');
        if (!form.format) issues.push('Choose an event format.');
        if (!Number.isInteger(Number(form.max_players)) || Number(form.max_players) < 1) issues.push('Add a valid maximum number of players.');
        if (form.payment_method !== 'free' && form.entry_fee === '') issues.push('Add the entry price.');
        if (form.payment_method === 'eft' && (!form.payment_bank_name.trim() || !form.payment_account_number.trim())) issues.push('Complete the required EFT details.');
        if (form.payment_method === 'external' && !/^https?:\/\//i.test(form.external_payment_url)) issues.push('Add a valid external payment URL.');
        if (form.require_access_code && editingEvent?.registration_access !== 'code' && form.access_code.trim().length < 6) issues.push('Add an access code of at least six characters.');
        if (form.require_access_code && editingEvent?.registration_access === 'code' && form.access_code && form.access_code.trim().length < 6) issues.push('The new access code must be at least six characters.');
        return issues;
    }, [form, editingEvent?.registration_access]);

    if (!isOpen) return null;
    if (savedDetails) return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="quick-event-success-title">
            <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl sm:p-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-padel-green/15 text-padel-green"><Check size={28} strokeWidth={3} /></div>
                <h2 id="quick-event-success-title" className="mt-5 text-2xl font-black text-white">{savedDetails.wasEditing ? 'Quick event updated' : 'Quick event created'}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-400">{savedDetails.eventName} is ready. Copy the link to share it with players.</p>
                <div className="mt-6 space-y-4">
                    <div>
                        <label className={labelClass}>Event link</label>
                        <div className="flex gap-2"><input readOnly value={savedDetails.shareUrl} className={`${inputClass} min-w-0`} /><button type="button" onClick={() => copyText(savedDetails.shareUrl, 'Event link')} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/10 text-white hover:border-padel-green" aria-label="Copy event link"><Copy size={17} /></button></div>
                    </div>
                    {savedDetails.accessCode && <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4"><label className="mb-2 block text-xs font-bold text-amber-200">Access code · copy this now</label><div className="flex gap-2"><input readOnly value={savedDetails.accessCode} className={`${inputClass} font-mono tracking-widest`} /><button type="button" onClick={() => copyText(savedDetails.accessCode, 'Access code')} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-amber-400/30 text-amber-200 hover:border-amber-300" aria-label="Copy access code"><Copy size={17} /></button></div><p className="mt-2 text-[11px] leading-5 text-amber-100/70">For security, the saved code cannot be displayed again. You can replace it later when editing the event.</p></div>}
                </div>
                <button type="button" onClick={onClose} className="mt-7 min-h-12 w-full rounded-xl bg-padel-green px-5 text-sm font-black text-black hover:brightness-110">Done</button>
            </div>
        </div>
    );
    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6" role="dialog" aria-modal="true" aria-labelledby="quick-event-title">
            <div className="flex max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl">
                <div className="flex min-w-0 flex-1 flex-col">
                    <header className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
                        <div><h2 id="quick-event-title" className="text-xl font-bold text-white">{isEditing ? 'Edit quick event' : 'Create quick event'}</h2><p className="mt-0.5 text-xs text-gray-400">Step {step} of 5 — {STEPS[step - 1]}</p></div>
                        <button type="button" onClick={onClose} aria-label="Close quick event builder" className="flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-padel-green"><X size={20} /></button>
                    </header>

                    <nav aria-label="Quick event steps" className="flex items-center gap-2 overflow-x-auto border-b border-white/5 px-5 py-4 sm:px-6">
                        {STEPS.map((label, index) => {
                            const stepNumber = index + 1;
                            const Icon = STEP_ICONS[index];
                            const active = stepNumber === step;
                            const done = stepNumber < step;
                            return (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => setStep(stepNumber)}
                                    aria-current={active ? 'step' : undefined}
                                    className={`flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition-colors focus-visible:ring-2 focus-visible:ring-padel-green ${active ? 'bg-padel-green text-black' : done ? 'bg-white/10 text-white' : 'bg-white/5 text-gray-500 hover:text-gray-300'}`}
                                >
                                    {done ? <Check size={14} /> : <Icon size={14} />}
                                    {label}
                                </button>
                            );
                        })}
                    </nav>
                    <main className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
                        {step === 1 && <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div><label htmlFor="quick-event-event-name" className={labelClass}>Event name *</label><input id="quick-event-event-name" value={form.event_name} onChange={(e) => update('event_name', e.target.value)} className={fieldClass('event_name')} {...fieldA11y('event_name')} />{renderFieldError('event_name')}</div>
                            <div className="relative" ref={organiserSearchRef}>
                                <label htmlFor="quick-event-organiser" className={labelClass}>Organiser *</label>
                                <input
                                    id="quick-event-organiser"
                                    role={organisation ? undefined : 'combobox'}
                                    aria-autocomplete={organisation ? undefined : 'list'}
                                    aria-expanded={organisation ? undefined : organiserOpen}
                                    aria-controls={organisation ? undefined : 'quick-event-organiser-options'}
                                    aria-activedescendant={!organisation && organiserOpen && filteredOrganisations[activeOrganisationIndex] ? `quick-event-organisation-${filteredOrganisations[activeOrganisationIndex].id}` : undefined}
                                    value={form.organiser_name}
                                    onChange={(e) => handleOrganiserChange(e.target.value)}
                                    onFocus={() => { if (!organisation) setOrganiserOpen(true); }}
                                    onKeyDown={handleOrganiserKeyDown}
                                    readOnly={!!organisation}
                                    autoComplete="off"
                                    placeholder="Search organisations…"
                                    className={fieldClass('organiser_name')}
                                    {...fieldA11y('organiser_name')}
                                />
                                {!organisation && organiserOpen && (
                                    <div id="quick-event-organiser-options" role="listbox" aria-label="Organisations" className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a0a] p-1 shadow-2xl">
                                        {organisationsLoading ? (
                                            <p role="status" className="px-3 py-3 text-xs text-gray-500">Loading organisations…</p>
                                        ) : filteredOrganisations.length === 0 ? (
                                            <p role="status" className="px-3 py-3 text-xs text-gray-500">No approved organisations found. You can use the name you entered.</p>
                                        ) : filteredOrganisations.map((item, index) => (
                                            <button
                                                id={`quick-event-organisation-${item.id}`}
                                                key={item.id}
                                                type="button"
                                                role="option"
                                                aria-selected={index === activeOrganisationIndex}
                                                tabIndex={-1}
                                                onMouseDown={(event) => event.preventDefault()}
                                                onMouseEnter={() => setActiveOrganisationIndex(index)}
                                                onClick={() => selectOrganisation(item)}
                                                className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${index === activeOrganisationIndex ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                            >
                                                {item.logo_url ? <img src={item.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white/5 object-cover outline outline-1 -outline-offset-1 outline-white/10" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-padel-green"><Shield size={15} /></span>}
                                                <span className="min-w-0"><span className="block truncate text-sm font-bold text-white">{item.name}</span>{item.slug && <span className="block truncate text-[10px] text-gray-500">/{item.slug}</span>}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {renderFieldError('organiser_name')}
                                {!fieldErrors.organiser_name && !organisation && form.organisation_id && <p className="mt-1.5 text-[11px] font-bold text-padel-green">Linked to organisation page</p>}
                                {!fieldErrors.organiser_name && !organisation && !form.organisation_id && <p className="mt-1.5 text-[11px] leading-5 text-gray-500">Select an organisation to link its page, or enter a custom organiser.</p>}
                            </div>
                            <div><label htmlFor="quick-event-start-date" className={labelClass}>Start date *</label><input id="quick-event-start-date" type="date" value={form.start_date} onChange={(e) => handleStartDateChange(e.target.value)} className={fieldClass('start_date')} {...fieldA11y('start_date')} />{renderFieldError('start_date')}</div>
                            <div><label htmlFor="quick-event-end-date" className={labelClass}>End date *</label><input id="quick-event-end-date" type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => handleEndDateChange(e.target.value)} className={fieldClass('end_date')} {...fieldA11y('end_date')} />{renderFieldError('end_date')}</div>
                            <div><label htmlFor="quick-event-start-time" className={labelClass}>Start time *</label><input id="quick-event-start-time" type="time" value={form.start_time} onChange={(e) => update('start_time', e.target.value)} className={fieldClass('start_time')} {...fieldA11y('start_time')} />{renderFieldError('start_time')}</div>
                            <div><label htmlFor="quick-event-end-time" className={labelClass}>End time *</label><input id="quick-event-end-time" type="time" value={form.end_time} onChange={(e) => update('end_time', e.target.value)} className={fieldClass('end_time')} {...fieldA11y('end_time')} />{renderFieldError('end_time')}</div>
                            <div className="md:col-span-2"><label htmlFor="quick-event-registration-closes" className={labelClass}>Registration closes *</label><input id="quick-event-registration-closes" type="datetime-local" value={form.registration_closes_at} onChange={(e) => update('registration_closes_at', e.target.value)} className={fieldClass('registration_closes_at')} {...fieldA11y('registration_closes_at')} />{renderFieldError('registration_closes_at')}</div>
                            <div className="relative md:col-span-2" ref={clubSearchRef}>
                                <label htmlFor="quick-event-club" className={labelClass}>Club</label>
                                <div className="relative">
                                    <input
                                        id="quick-event-club"
                                        role="combobox"
                                        aria-autocomplete="list"
                                        aria-expanded={clubOpen}
                                        aria-controls="quick-event-club-options"
                                        aria-activedescendant={clubOpen && filteredClubs[activeClubIndex] ? `quick-event-club-${filteredClubs[activeClubIndex].id}` : undefined}
                                        value={clubQuery}
                                        onChange={(event) => handleClubChange(event.target.value)}
                                        onFocus={() => setClubOpen(true)}
                                        onKeyDown={handleClubKeyDown}
                                        autoComplete="off"
                                        placeholder={loadingClubs ? 'Loading clubs…' : 'Search clubs…'}
                                        className={`${inputClass} ${form.club_id ? 'pr-12' : ''}`}
                                    />
                                    {form.club_id && <button type="button" onClick={clearClub} aria-label="Clear selected club" className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-xl text-gray-400 hover:text-white focus-visible:ring-2 focus-visible:ring-padel-green"><X size={16} /></button>}
                                </div>
                                {clubOpen && (
                                    <div id="quick-event-club-options" role="listbox" aria-label="Clubs" className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a0a] p-1 shadow-2xl">
                                        {loadingClubs ? (
                                            <p role="status" className="px-3 py-3 text-xs text-gray-500">Loading clubs…</p>
                                        ) : filteredClubs.length === 0 ? (
                                            <p role="status" className="px-3 py-3 text-xs text-gray-500">No clubs match “{clubQuery}”. Use the venue field below for a custom location.</p>
                                        ) : filteredClubs.map((club, index) => (
                                            <button
                                                id={`quick-event-club-${club.id}`}
                                                key={club.id}
                                                type="button"
                                                role="option"
                                                aria-selected={index === activeClubIndex}
                                                tabIndex={-1}
                                                onMouseDown={(event) => event.preventDefault()}
                                                onMouseEnter={() => setActiveClubIndex(index)}
                                                onClick={() => selectClub(club)}
                                                className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${index === activeClubIndex ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                            >
                                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-padel-green"><Shield size={15} /></span>
                                                <span className="min-w-0"><span className="block truncate text-sm font-bold text-white">{club.name}</span>{(club.city || club.address) && <span className="block truncate text-[10px] text-gray-500">{[club.city, club.address].filter(Boolean).join(' · ')}</span>}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <p className="mt-1.5 text-[11px] leading-5 text-gray-500">Selecting a club fills its saved venue, address, and city.</p>
                            </div>
                            <div className="md:col-span-2"><label htmlFor="quick-event-venue" className={labelClass}>Venue *</label><input id="quick-event-venue" value={form.venue} onChange={(e) => update('venue', e.target.value)} className={fieldClass('venue')} placeholder="Enter a venue or select a club above" {...fieldA11y('venue')} />{renderFieldError('venue')}</div>
                            <div className="md:col-span-2"><label htmlFor="quick-event-address" className={labelClass}>Address</label><input ref={addressInputRef} id="quick-event-address" value={form.address} onChange={(e) => update('address', e.target.value)} placeholder="Start typing to search Google…" autoComplete="off" className={inputClass} /><p className="mt-1.5 text-[11px] leading-5 text-gray-500">Powered by Google — selecting a result fills the city and, when empty, the venue.</p></div>
                            <div className="md:col-span-2"><label htmlFor="quick-event-city" className={labelClass}>City</label><input id="quick-event-city" value={form.city} onChange={(e) => update('city', e.target.value)} className={inputClass} placeholder="City" /></div>
                            <div><label className={labelClass}>Court type</label><select value={form.indoor_outdoor} onChange={(e) => update('indoor_outdoor', e.target.value)} className={inputClass}><option>Indoor</option><option>Outdoor</option><option>Mixed</option><option>Panoramic</option></select></div>
                            <div><label className={labelClass}>Number of courts</label><input type="number" min="1" value={form.courts_count} onChange={(e) => update('courts_count', e.target.value)} className={inputClass} /></div>
                            <div><label htmlFor="quick-event-max-players" className={labelClass}>Maximum players *</label><input id="quick-event-max-players" type="number" min="1" value={form.max_players} onChange={(e) => update('max_players', e.target.value)} className={fieldClass('max_players')} {...fieldA11y('max_players')} />{renderFieldError('max_players')}</div>
                        </div>}

                        {step === 2 && <div className="space-y-6">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div><label htmlFor="quick-event-division" className={labelClass}>Division *</label><input id="quick-event-division" value={form.division_name} onChange={(e) => update('division_name', e.target.value)} className={fieldClass('division_name')} {...fieldA11y('division_name')} />{renderFieldError('division_name')}</div>
                                <div><label htmlFor="quick-event-format" className={labelClass}>Format *</label><select id="quick-event-format" value={form.format} onChange={(e) => update('format', e.target.value)} className={fieldClass('format')} {...fieldA11y('format')}>{FORMATS.map((format) => <option key={format}>{format}</option>)}</select>{renderFieldError('format')}</div>
                            </div>
                            <fieldset><legend className={labelClass}>Entry option</legend><div className="grid grid-cols-3 gap-2">{ENTRY_OPTIONS.map((option) => <label key={option.value} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-3 text-sm font-bold ${form.partner_requirement === option.value ? 'border-padel-green bg-padel-green/10 text-padel-green' : 'border-white/10 text-gray-300'}`}><input type="radio" name="quick-entry-option" value={option.value} checked={form.partner_requirement === option.value} onChange={() => update('partner_requirement', option.value)} className="sr-only" />{option.label}</label>)}</div></fieldset>
                            <fieldset><legend className={labelClass}>Payment method</legend><div className="grid grid-cols-2 gap-2 md:grid-cols-4">{PAYMENT_OPTIONS.map((option) => <label key={option.value} className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-3 text-center text-xs font-bold ${form.payment_method === option.value ? 'border-padel-green bg-padel-green/10 text-padel-green' : 'border-white/10 text-gray-300'}`}><input type="radio" name="quick-payment" value={option.value} checked={form.payment_method === option.value} onChange={() => update('payment_method', option.value)} className="sr-only" />{option.label}</label>)}</div></fieldset>
                            {form.payment_method !== 'free' && <div><label htmlFor="quick-event-entry-fee" className={labelClass}>Price per player (R) *</label><input id="quick-event-entry-fee" type="number" min="0" value={form.entry_fee} onChange={(e) => update('entry_fee', e.target.value)} className={fieldClass('entry_fee')} {...fieldA11y('entry_fee')} />{renderFieldError('entry_fee')}</div>}
                            {form.payment_method === 'eft' && <div className="grid grid-cols-1 gap-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 md:grid-cols-2">
                                <div><label htmlFor="quick-event-bank-name" className={labelClass}>Bank name *</label><input id="quick-event-bank-name" value={form.payment_bank_name} onChange={(e) => update('payment_bank_name', e.target.value)} className={fieldClass('payment_bank_name')} {...fieldA11y('payment_bank_name')} />{renderFieldError('payment_bank_name')}</div><div><label className={labelClass}>Account name</label><input value={form.payment_account_name} onChange={(e) => update('payment_account_name', e.target.value)} className={inputClass} /></div><div><label htmlFor="quick-event-account-number" className={labelClass}>Account number *</label><input id="quick-event-account-number" value={form.payment_account_number} onChange={(e) => update('payment_account_number', e.target.value)} className={fieldClass('payment_account_number')} {...fieldA11y('payment_account_number')} />{renderFieldError('payment_account_number')}</div><div><label className={labelClass}>Branch code</label><input value={form.payment_branch_code} onChange={(e) => update('payment_branch_code', e.target.value)} className={inputClass} /></div><div className="md:col-span-2"><label className={labelClass}>Reference instructions</label><input value={form.payment_reference_note} onChange={(e) => update('payment_reference_note', e.target.value)} className={inputClass} /></div>
                            </div>}
                            {form.payment_method === 'external' && <div><label htmlFor="quick-event-external-url" className={labelClass}>External payment URL *</label><input id="quick-event-external-url" type="url" value={form.external_payment_url} onChange={(e) => update('external_payment_url', e.target.value)} className={fieldClass('external_payment_url')} {...fieldA11y('external_payment_url')} />{renderFieldError('external_payment_url')}</div>}
                            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                                <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={form.require_access_code} onChange={(e) => update('require_access_code', e.target.checked)} className="mt-1 h-5 w-5 accent-padel-green" /><span><span className="block text-sm font-bold text-white">Require an access code</span><span className="mt-1 block text-xs leading-relaxed text-gray-500">Only signed-in players with the code can unlock registration.</span></span></label>
                                {form.require_access_code && <div className="mt-4"><label htmlFor="quick-event-access-code" className={labelClass}>{isEditing && editingEvent?.registration_access === 'code' ? 'New access code (leave blank to keep the current code)' : 'Access code *'}</label><div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><input id="quick-event-access-code" type={showCode ? 'text' : 'password'} value={form.access_code} onChange={(e) => update('access_code', e.target.value)} minLength={6} maxLength={64} autoComplete="new-password" className={fieldClass('access_code', 'pr-12')} {...fieldA11y('access_code')} /><button type="button" onClick={() => setShowCode((visible) => !visible)} aria-label={showCode ? 'Hide access code' : 'Show access code'} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-white">{showCode ? <EyeOff size={17} /> : <Eye size={17} />}</button></div><div className="flex gap-2"><button type="button" onClick={() => update('access_code', generateAccessCode())} className="min-h-11 flex-1 rounded-xl border border-white/10 px-4 text-xs font-bold text-white hover:border-padel-green sm:flex-none">Generate</button><button type="button" onClick={() => copyText(form.access_code, 'Access code')} aria-label="Copy access code" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/10 text-gray-300 hover:border-padel-green"><Copy size={16} /></button></div></div>{renderFieldError('access_code')}<p className="mt-2 text-[11px] text-gray-500">Use 6-64 characters. The code is case-sensitive and cannot be viewed after saving.</p></div>}
                            </div>
                        </div>}

                        {step === 3 && <div className="space-y-6"><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[['poster', 'Event poster', form.custom_image_url], ['sponsor', 'Sponsor logo', form.sponsor_logos[0]]].map(([type, label, url]) => <label key={type} className="flex min-h-48 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-center hover:border-padel-green/50">{url ? <img src={url} alt={`${label} preview`} className="mb-3 h-28 max-w-full rounded-xl object-contain outline outline-1 -outline-offset-1 outline-white/10" /> : <ImageIcon size={32} className="mb-3 text-gray-600" />}{uploading === type ? <Loader2 size={18} className="animate-spin text-padel-green" /> : <><span className="text-sm font-bold text-white">{label}</span><span className="mt-1 text-xs text-gray-500">PNG, JPG or WebP · max 5 MB</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleUpload(e, type)} className="sr-only" /></>}</label>)}</div><div><label className={labelClass}>Prize value (R)</label><input type="number" min="0" value={form.prize_money_total} onChange={(e) => update('prize_money_total', e.target.value)} className={inputClass} /></div></div>}

                        {step === 4 && <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className="md:col-span-2"><label className={labelClass}>About this event</label><textarea rows={5} value={form.description} onChange={(e) => update('description', e.target.value)} className={inputClass} /></div><div><label className={labelClass}>Contact person</label><input value={form.contact_details} onChange={(e) => update('contact_details', e.target.value)} className={inputClass} /></div><div><label className={labelClass}>Phone / WhatsApp</label><input type="tel" value={form.organiser_phone} onChange={(e) => update('organiser_phone', e.target.value)} className={inputClass} /></div><div className="md:col-span-2"><label className={labelClass}>Contact email</label><input type="email" value={form.organiser_email} onChange={(e) => update('organiser_email', e.target.value)} className={inputClass} /></div><div className="md:col-span-2"><label className={labelClass}>Other information</label><textarea rows={5} value={form.other_info} onChange={(e) => update('other_info', e.target.value)} className={inputClass} /></div></div>}

                            {step === 5 && (
                                <div className="space-y-4">
                                    <p className="text-xs text-gray-400">Review everything below before creating the event.</p>

                                    {quickReviewIssues.length === 0 ? (
                                        <div className="flex items-center gap-2 rounded-xl border border-padel-green/30 bg-padel-green/10 px-4 py-3 text-sm font-semibold text-padel-green"><Check size={16} /> Ready to create — no blocking issues found.</div>
                                    ) : (
                                        <div className="space-y-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-300"><AlertTriangle size={14} /> Blocking issues ({quickReviewIssues.length})</p><ul className="space-y-1">{quickReviewIssues.map((issue) => <li key={issue} className="text-sm text-red-200">• {issue}</li>)}</ul></div>
                                    )}

                                    <section className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                                        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Event Summary</h3>
                                        <div className="flex flex-col gap-4 sm:flex-row">
                                            {form.custom_image_url ? (
                                                <img src={form.custom_image_url} alt="Event poster preview" className="h-32 w-24 shrink-0 rounded-lg object-cover outline outline-1 -outline-offset-1 outline-white/10" />
                                            ) : (
                                                <div className="flex h-32 w-24 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-600"><ImageIcon size={24} /></div>
                                            )}
                                            <div className="min-w-0 flex-1 space-y-2 text-sm">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="text-lg font-bold leading-tight text-white">{form.event_name || 'Untitled event'}</p>
                                                    <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-300">Quick event</span>
                                                    {form.require_access_code && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">Code required</span>}
                                                </div>
                                                <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-gray-300 sm:grid-cols-2">
                                                    <p><span className="text-gray-500">Dates:</span> {dateLabel(form.start_date, form.end_date) || '—'}</p>
                                                    <p><span className="text-gray-500">Time:</span> {[form.start_time, form.end_time].filter(Boolean).join('–') || '—'}</p>
                                                    <p><span className="text-gray-500">Venue:</span> {[form.venue, form.city].filter(Boolean).join(', ') || '—'}</p>
                                                    <p><span className="text-gray-500">Registration closes:</span> {form.registration_closes_at ? new Date(form.registration_closes_at).toLocaleString('en-ZA') : '—'}</p>
                                                    <p><span className="text-gray-500">Organiser:</span> {form.organiser_name || '—'}</p>
                                                    <p><span className="text-gray-500">Courts:</span> {form.courts_count || '—'} · {form.indoor_outdoor || '—'}</p>
                                                </div>
                                                {form.address && <p className="text-gray-300"><span className="text-gray-500">Address:</span> {form.address}</p>}
                                            </div>
                                        </div>
                                    </section>

                                    <section className="overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-4">
                                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Division Summary</h3>
                                        <table className="w-full min-w-[620px] text-left text-sm">
                                            <thead><tr className="border-b border-white/10 text-xs text-gray-500"><th className="py-2 pr-3 font-bold">Division</th><th className="py-2 pr-3 font-bold">Fee</th><th className="py-2 pr-3 font-bold">Format</th><th className="py-2 pr-3 font-bold">Player setup</th><th className="py-2 font-bold">Capacity</th></tr></thead>
                                            <tbody><tr className="text-gray-300"><td className="py-2.5 pr-3 font-medium text-white">{form.division_name || '—'}</td><td className="py-2.5 pr-3">{priceLabel}</td><td className="py-2.5 pr-3">{form.format || '—'}</td><td className="py-2.5 pr-3">{selectedEntry}</td><td className="py-2.5">{form.max_players || '—'} players</td></tr></tbody>
                                        </table>
                                    </section>

                                    <section className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
                                        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Settings Summary</h3>
                                        <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                            <p className="text-gray-300"><span className="text-gray-500">Payment method:</span> {selectedPayment}</p>
                                            <p className="text-gray-300"><span className="text-gray-500">Entry access:</span> {form.require_access_code ? 'Access code required' : 'Public'}</p>
                                            <p className="text-gray-300"><span className="text-gray-500">Maximum players:</span> {form.max_players || '—'}</p>
                                            <p className="text-gray-300"><span className="text-gray-500">Prize value:</span> {form.prize_money_total ? `R${Number(form.prize_money_total).toLocaleString('en-ZA')}` : 'None'}</p>
                                            <p className="text-gray-300"><span className="text-gray-500">Poster:</span> {form.custom_image_url ? 'Uploaded' : 'Default event artwork'}</p>
                                            <p className="text-gray-300"><span className="text-gray-500">Sponsor logo:</span> {form.sponsor_logos[0] ? 'Uploaded' : 'None'}</p>
                                        </div>
                                    </section>

                                    {form.description && <section className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-4"><h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">About this event</h3><p className="whitespace-pre-wrap text-sm leading-6 text-gray-300">{form.description}</p></section>}

                                    {['eft', 'external'].includes(form.payment_method) && <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" /><div><p className="text-sm font-bold text-amber-100">Manual payment confirmation required</p><p className="mt-1 text-xs leading-relaxed text-amber-100/80">Registrations will remain pending until an event admin checks the {form.payment_method === 'eft' ? 'bank account' : 'external provider'} and marks the player as paid in Event Manager.</p></div></div>}

                                    {form.require_access_code && <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"><KeyRound size={18} className="mt-0.5 shrink-0 text-amber-300" /><div><p className="text-sm font-bold text-amber-100">Save the access code securely</p><p className="mt-1 text-xs leading-relaxed text-amber-100/80">The saved code cannot be displayed later. You can copy it from the confirmation screen after creating the event.</p></div></div>}

                                    <section className="rounded-xl border border-white/10 bg-black/20 p-4">
                                        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Event link</h3>
                                        <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-xs text-gray-300">{reviewLink}</code><button type="button" onClick={() => copyText(reviewLink, 'Event link')} aria-label="Copy event link" className="rounded-lg border border-white/10 p-2.5 text-gray-300 hover:border-padel-green/40 hover:text-padel-green focus-visible:ring-2 focus-visible:ring-padel-green"><Copy size={16} /></button></div>
                                    </section>
                                </div>
                            )}
                    </main>

                    <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4 sm:px-6">
                        <button type="button" onClick={step === 1 ? onClose : () => setStep((current) => current - 1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-bold text-gray-300 hover:bg-white/5">{step === 1 ? 'Cancel' : <><ArrowLeft size={16} /> Back</>}</button>
                        {step < 5 ? <button type="button" onClick={next} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-padel-green px-5 text-sm font-black text-black hover:brightness-110">Continue <ArrowRight size={16} /></button> : <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-padel-green px-5 text-sm font-black text-black hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 size={17} className="animate-spin" /> : <Trophy size={17} />}{saving ? (isEditing ? 'Saving changes…' : 'Creating event…') : isEditing ? 'Save quick event' : 'Create quick event'}</button>}
                    </footer>
                </div>
            </div>
        </div>
    );
};

export default QuickEventBuilder;
