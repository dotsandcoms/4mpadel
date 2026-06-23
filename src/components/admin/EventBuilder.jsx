import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    X, Save, ChevronRight, ChevronLeft, ChevronDown, Plus, Trash2, UploadCloud, Loader2,
    Info, Layers, FileText, ImageIcon, Settings, Check,
    Bold, Italic, Underline, List, ListOrdered, Heading
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useClubs } from '../../hooks/useClubs';

const STANDARD_DIVISIONS = [
    "Men's Open", "Men's Pro", "Men's Advanced", "Men's Intermediate", "Men's A", "Men's B", "Men's C", "Men's D",
    "Ladies Open", "Ladies Pro", "Ladies Advanced", "Ladies Intermediate", "Ladies A", "Ladies B", "Ladies C",
    "Mixed Open", "Mixed Advanced", "Mixed A", "Mixed B", "Mixed C",
    "Men's 40+", "Men's 45+", "Men's 50+", "Ladies 40+", "Ladies 45+",
    "Juniors U12", "Juniors U14", "Juniors U16", "Juniors U18"
];

const FORMATS = ['Knockout', 'Groups', 'Groups + Knockout', 'Round Robin', 'Americano', 'Mexicano'];
const SAPA_STATUSES = ['None', 'Bronze', 'Silver', 'Gold', 'Super Gold', 'Major'];

// SAPA status badge colours — kept in sync with the site-wide tiers (see Calendar.jsx).
const sapaBadgeClass = (status) => {
    switch (status) {
        case 'Major': return 'bg-red-500/20 text-red-400 border border-red-500/30';
        case 'Super Gold':
        case 'S Gold': return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
        case 'Gold': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
        case 'Silver': return 'bg-gray-500/20 text-gray-300 border border-gray-400/30';
        case 'Bronze': return 'bg-orange-700/20 text-orange-400 border border-orange-700/30';
        case 'FIP event': return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
        default: return 'bg-white/10 text-gray-400 border border-white/10';
    }
};
const GENDERS = ['', 'Men', 'Ladies', 'Mixed'];
const TOURNAMENT_TAGS = ['None', 'Broll', '360 Padel', 'SA Grand'];

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
let googleMapsPromise = null;
const loadGoogleMaps = () => {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
    if (window.google?.maps?.places) return Promise.resolve(window.google);
    if (googleMapsPromise) return googleMapsPromise;
    googleMapsPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-google-maps]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.google));
            existing.addEventListener('error', reject);
            return;
        }
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=places`;
        s.async = true;
        s.defer = true;
        s.setAttribute('data-google-maps', 'true');
        s.onload = () => resolve(window.google);
        s.onerror = reject;
        document.head.appendChild(s);
    });
    return googleMapsPromise;
};

const STEPS = [
    { id: 1, label: 'Basics', icon: Info },
    { id: 2, label: 'Divisions', icon: Layers },
    { id: 3, label: 'Tournament Info', icon: FileText },
    { id: 4, label: 'Media & Sponsors', icon: ImageIcon },
    { id: 5, label: 'Settings & Review', icon: Settings },
];

const inputClass = "w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none";
const labelClass = "block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wide";
const menuClass = "absolute z-30 left-0 right-0 mt-1 bg-[#1E293B] border border-white/10 rounded-lg max-h-52 overflow-y-auto shadow-xl custom-scrollbar";
const menuItemClass = "w-full text-left px-4 py-2.5 text-sm text-white hover:bg-padel-green hover:text-black transition-colors";

// Styled dropdown (matches the Venue / Club dropdown) for fixed option lists.
const SelectMenu = ({ value, onChange, options, placeholder = 'Select...' }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
    const selected = opts.find((o) => o.value === value);
    const hasValue = selected && selected.label;
    return (
        <div className="relative" ref={ref}>
            <button type="button" onClick={() => setOpen((v) => !v)} className={`${inputClass} flex items-center justify-between text-left`}>
                <span className={hasValue ? 'text-white' : 'text-gray-500'}>{hasValue ? selected.label : placeholder}</span>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className={menuClass}>
                    {opts.map((o) => (
                        <button
                            key={o.value}
                            type="button"
                            onClick={() => { onChange(o.value); setOpen(false); }}
                            className={o.value === value ? `${menuItemClass} bg-padel-green/15` : menuItemClass}
                        >
                            {o.label || '—'}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// Styled typeable combobox (matches the Venue / Club dropdown) that also allows custom text.
const ComboBox = ({ value, onChange, options, placeholder = 'Select or type' }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);
    const filtered = options.filter((o) => o.toLowerCase().includes((value || '').toLowerCase()));
    return (
        <div className="relative" ref={ref}>
            <input
                value={value}
                onChange={(e) => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                placeholder={placeholder}
                autoComplete="off"
                className={inputClass}
            />
            {open && filtered.length > 0 && (
                <div className={menuClass}>
                    {filtered.map((o) => (
                        <button key={o} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(o); setOpen(false); }} className={menuItemClass}>
                            {o}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// Lightweight WYSIWYG editor (no external dependency) producing simple HTML so the
// formatted layout is preserved when shown on the public event page.
const RichTextEditor = ({ value, onChange, placeholder = 'Type here...', minHeight = 130 }) => {
    const ref = useRef(null);

    // Sync external value into the editor without clobbering the caret while typing.
    useEffect(() => {
        if (ref.current && ref.current.innerHTML !== (value || '')) {
            ref.current.innerHTML = value || '';
        }
    }, [value]);

    const emit = () => onChange(ref.current ? ref.current.innerHTML : '');
    const exec = (command, arg = null) => {
        ref.current?.focus();
        document.execCommand(command, false, arg);
        emit();
    };

    const ToolBtn = ({ onClick, title, children }) => (
        <button
            type="button"
            title={title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            className="p-1.5 rounded text-gray-300 hover:bg-padel-green hover:text-black transition-colors"
        >
            {children}
        </button>
    );

    return (
        <div className="border border-white/10 rounded-lg overflow-hidden bg-black/40 focus-within:border-padel-green">
            <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-white/10 bg-white/5">
                <ToolBtn title="Bold" onClick={() => exec('bold')}><Bold size={15} /></ToolBtn>
                <ToolBtn title="Italic" onClick={() => exec('italic')}><Italic size={15} /></ToolBtn>
                <ToolBtn title="Underline" onClick={() => exec('underline')}><Underline size={15} /></ToolBtn>
                <span className="w-px h-5 bg-white/10 mx-1" />
                <ToolBtn title="Heading" onClick={() => exec('formatBlock', '<h3>')}><Heading size={15} /></ToolBtn>
                <ToolBtn title="Bullet list" onClick={() => exec('insertUnorderedList')}><List size={15} /></ToolBtn>
                <ToolBtn title="Numbered list" onClick={() => exec('insertOrderedList')}><ListOrdered size={15} /></ToolBtn>
                <span className="w-px h-5 bg-white/10 mx-1" />
                <ToolBtn title="Clear formatting" onClick={() => exec('removeFormat')}><X size={15} /></ToolBtn>
            </div>
            <div
                ref={ref}
                contentEditable
                suppressContentEditableWarning
                onInput={emit}
                onBlur={emit}
                data-placeholder={placeholder}
                className="rte-content px-4 py-3 text-white text-sm leading-relaxed focus:outline-none overflow-y-auto custom-scrollbar"
                style={{ minHeight }}
            />
        </div>
    );
};

const emptyDivision = () => ({
    _key: Math.random().toString(36).slice(2),
    id: null,
    name: '',
    entry_fee: '',
    format: 'Knockout',
    entries_close_at: '',
    license_required: false,
    age_category: '',
    gender: '',
    is_active: true,
});

const slugify = (value) =>
    (value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

const formatEventDates = (start, end) => {
    if (!start) return '';
    const toLocal = (d) => {
        const date = new Date(d);
        return new Date(date.getTime() + date.getTimezoneOffset() * 60000);
    };
    const s = toLocal(start);
    const e = end ? toLocal(end) : null;
    const opts = { month: 'long' };
    if (!e || start === end) return `${s.getDate()} ${s.toLocaleString('default', opts)} ${s.getFullYear()}`;
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
        return `${s.getDate()} - ${e.getDate()} ${s.toLocaleString('default', opts)} ${s.getFullYear()}`;
    return `${s.getDate()} ${s.toLocaleString('default', { month: 'short' })} - ${e.getDate()} ${e.toLocaleString('default', { month: 'short' })} ${e.getFullYear()}`;
};

const resizeImage = (file, maxWidth = 1200, quality = 0.8) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (ev) => {
            const img = new Image();
            img.src = ev.target.result;
            img.onload = () => {
                let { width, height } = img;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })),
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });

const uploadToGallery = async (file, prefix) => {
    const resized = await resizeImage(file);
    const fileName = `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}.jpg`;
    const filePath = `${prefix}/${fileName}`;
    const { error } = await supabase.storage.from('gallery').upload(filePath, resized);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(filePath);
    return publicUrl;
};

const blankForm = {
    event_name: '',
    slug: '',
    organizer_name: 'SAPA',
    city: '',
    venue: '',
    address: '',
    start_date: '',
    end_date: '',
    start_time: '',
    end_time: '',
    sapa_status: 'None',
    tournament_tag: 'None',
    description: '',
    registered_players: 0,
    // tournament info
    points: '',
    points_breakdown: '',
    prize_money_total: '',
    prize_money_breakdown: [],
    balls: '',
    courts: '',
    tournament_director: '',
    referees: '',
    sanctioning_details: '',
    rules_regs: '',
    withdrawal_substitution: '',
    cut_off_times: '',
    draw_released: '',
    contact_details: '',
    organizer_phone: '',
    organizer_email: '',
    organizer_website: '',
    // media
    custom_image_url: '',
    sponsor_logos: [],
    // settings
    registration_closes_at: '',
    featured_event: false,
    is_visible: true,
    finance_managed: true,
    allow_payments: true,
    show_in_recent_results: false,
};

const EventBuilder = ({ isOpen, onClose, onSaved, editingEvent = null }) => {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(blankForm);
    const [divisions, setDivisions] = useState([emptyDivision()]);
    const [removedDivisionIds, setRemovedDivisionIds] = useState([]);
    const [standardPrice, setStandardPrice] = useState('');
    const [showPrizeBreakdown, setShowPrizeBreakdown] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingPoster, setUploadingPoster] = useState(false);
    const [uploadingSponsor, setUploadingSponsor] = useState(false);

    const { clubs } = useClubs();
    const [venueOpen, setVenueOpen] = useState(false);

    const addressInputRef = useRef(null);
    const autocompleteRef = useRef(null);

    const filteredClubs = clubs.filter(
        (c) => !form.venue || c.name.toLowerCase().includes(form.venue.toLowerCase())
    );

    // Google Places autocomplete on the address field (step 1 only).
    useEffect(() => {
        if (!isOpen || step !== 1) return;
        let cancelled = false;
        loadGoogleMaps()
            .then((google) => {
                if (cancelled || !addressInputRef.current || autocompleteRef.current) return;
                if (!google?.maps?.places?.Autocomplete) {
                    console.warn('Google Places library not available. Check that the Places API is enabled for this key.');
                    return;
                }
                const ac = new google.maps.places.Autocomplete(addressInputRef.current, {
                    fields: ['formatted_address', 'address_components', 'name'],
                    types: ['establishment', 'geocode'],
                    componentRestrictions: { country: 'za' },
                });
                autocompleteRef.current = ac;
                ac.addListener('place_changed', () => {
                    const place = ac.getPlace();
                    const comps = place.address_components || [];
                    const get = (type) => comps.find((c) => c.types.includes(type))?.long_name || '';
                    const city = get('locality') || get('administrative_area_level_2') || get('administrative_area_level_1');
                    setForm((prev) => ({
                        ...prev,
                        address: place.formatted_address || prev.address,
                        city: city || prev.city,
                        venue: prev.venue || place.name || prev.venue,
                    }));
                });
            })
            .catch((err) => { console.warn('Google Maps failed to load:', err); });
        return () => { cancelled = true; autocompleteRef.current = null; };
    }, [isOpen, step]);

    useEffect(() => {
        if (!isOpen) return;
        setStep(1);
        setRemovedDivisionIds([]);
        setStandardPrice('');
        if (editingEvent) {
            loadExisting(editingEvent);
        } else {
            setForm(blankForm);
            setDivisions([emptyDivision()]);
            setShowPrizeBreakdown(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, editingEvent]);

    const parsePrizeBreakdownField = (raw) => {
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
        }
        return [];
    };

    const loadExisting = async (ev) => {
        const prizeBreakdown = parsePrizeBreakdownField(ev.prize_money_breakdown);
        setShowPrizeBreakdown(prizeBreakdown.length > 0);
        setForm({
            ...blankForm,
            ...Object.fromEntries(Object.keys(blankForm).map((k) => [k, ev[k] ?? blankForm[k]])),
            start_date: ev.start_date ? ev.start_date.substring(0, 10) : '',
            end_date: ev.end_date ? ev.end_date.substring(0, 10) : '',
            registration_closes_at: ev.registration_closes_at ? ev.registration_closes_at.substring(0, 16) : '',
            prize_money_total: ev.prize_money_total != null ? String(ev.prize_money_total) : '',
            prize_money_breakdown: prizeBreakdown,
            sponsor_logos: Array.isArray(ev.sponsor_logos) ? ev.sponsor_logos : [],
            is_visible: ev.is_visible !== false,
            allow_payments: ev.allow_payments ?? true,
            finance_managed: ev.finance_managed ?? true,
        });
        const { data, error } = await supabase
            .from('tournament_divisions')
            .select('*')
            .eq('event_id', ev.id)
            .order('sort_order', { ascending: true });
        if (!error && data && data.length > 0) {
            setDivisions(
                data.map((d) => ({
                    _key: d.id,
                    id: d.id,
                    name: d.name || '',
                    entry_fee: d.entry_fee != null ? String(d.entry_fee) : '',
                    format: d.format || 'Knockout',
                    entries_close_at: d.entries_close_at ? d.entries_close_at.substring(0, 16) : '',
                    license_required: !!d.license_required,
                    age_category: d.age_category || '',
                    gender: d.gender || '',
                    is_active: d.is_active !== false,
                }))
            );
        } else {
            setDivisions([emptyDivision()]);
        }
    };

    const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

    const handleInput = (e) => {
        const { name, value, type, checked } = e.target;
        const val = type === 'checkbox' ? checked : value;
        setForm((prev) => {
            const next = { ...prev, [name]: val };
            if (name === 'event_name' && !editingEvent) next.slug = slugify(value);
            // When start date changes, default the end date to match so the picker
            // opens on the right month (only if empty or before the new start date).
            if (name === 'start_date' && val && (!prev.end_date || prev.end_date < val)) {
                next.end_date = val;
            }
            return next;
        });
    };

    const updateDivision = (key, patch) =>
        setDivisions((prev) => prev.map((d) => (d._key === key ? { ...d, ...patch } : d)));

    const addDivision = () => setDivisions((prev) => [...prev, emptyDivision()]);

    const removeDivision = (key) =>
        setDivisions((prev) => {
            const target = prev.find((d) => d._key === key);
            if (target?.id) setRemovedDivisionIds((ids) => [...ids, target.id]);
            const next = prev.filter((d) => d._key !== key);
            return next.length ? next : [emptyDivision()];
        });

    const applyStandardPrice = () => {
        if (standardPrice === '') return;
        setDivisions((prev) => prev.map((d) => ({ ...d, entry_fee: standardPrice })));
        toast.success('Standard price applied to all divisions');
    };

    // Prize money breakdown rows
    const addPrizeRow = () =>
        setField('prize_money_breakdown', [...(form.prize_money_breakdown || []), { label: '', amount: '' }]);
    const updatePrizeRow = (idx, patch) =>
        setField('prize_money_breakdown', form.prize_money_breakdown.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    const removePrizeRow = (idx) =>
        setField('prize_money_breakdown', form.prize_money_breakdown.filter((_, i) => i !== idx));

    // Pull the divisions selected in step 2 into the prize-money breakdown, keeping a row
    // per division (with any amount already entered) and preserving extra custom lines.
    const syncPrizeBreakdownToDivisions = () => {
        const divNames = divisions.map((d) => d.name.trim()).filter(Boolean);
        setForm((prev) => {
            const existing = prev.prize_money_breakdown || [];
            const amountFor = (name) => existing.find((r) => r.label === name)?.amount || '';
            const divRows = divNames.map((name) => ({ label: name, amount: amountFor(name), _division: true }));
            const customRows = existing.filter((r) => !r._division && !divNames.includes(r.label));
            return { ...prev, prize_money_breakdown: [...divRows, ...customRows] };
        });
    };

    const handlePosterUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingPoster(true);
            const url = await uploadToGallery(file, 'posters');
            setField('custom_image_url', url);
            toast.success('Poster uploaded');
        } catch (err) {
            toast.error('Failed to upload poster');
        } finally {
            setUploadingPoster(false);
        }
    };

    const handleSponsorUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        try {
            setUploadingSponsor(true);
            const urls = [];
            for (const file of files) urls.push(await uploadToGallery(file, 'sponsors'));
            setField('sponsor_logos', [...(form.sponsor_logos || []), ...urls]);
            toast.success(`${urls.length} sponsor logo(s) uploaded`);
        } catch (err) {
            toast.error('Failed to upload sponsor logo');
        } finally {
            setUploadingSponsor(false);
        }
    };

    const removeSponsor = (idx) =>
        setField('sponsor_logos', form.sponsor_logos.filter((_, i) => i !== idx));

    const validateBasics = () => {
        if (!form.event_name.trim()) { toast.error('Event name is required'); return false; }
        if (!form.start_date) { toast.error('Start date is required'); return false; }
        return true;
    };

    const validateDivisions = () => {
        const valid = divisions.filter((d) => d.name.trim());
        if (valid.length === 0) { toast.error('Add at least one division'); return false; }
        return true;
    };

    const next = () => {
        if (step === 1 && !validateBasics()) return;
        if (step === 2 && !validateDivisions()) return;
        if (step === 2 && showPrizeBreakdown) syncPrizeBreakdownToDivisions();
        setStep((s) => Math.min(5, s + 1));
    };
    const back = () => setStep((s) => Math.max(1, s - 1));

    const buildPayload = () => {
        const payload = {
            ...form,
            is_manual: true,
            slug: form.slug || slugify(form.event_name),
            event_dates: formatEventDates(form.start_date, form.end_date),
            points: form.points === '' || form.points == null ? null : String(form.points),
            prize_money_total: form.prize_money_total === '' ? null : Number(form.prize_money_total),
            prize_money_breakdown: (form.prize_money_breakdown || [])
                .filter((r) => r.label && r.amount)
                .map((r) => ({ label: r.label, amount: r.amount })),
            registration_closes_at: form.registration_closes_at || null,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            start_time: form.start_time || null,
            end_time: form.end_time || null,
        };
        return payload;
    };

    const persistDivisions = async (eventId) => {
        if (removedDivisionIds.length) {
            await supabase.from('tournament_divisions').delete().in('id', removedDivisionIds);
        }
        const rows = divisions.filter((d) => d.name.trim());
        for (let i = 0; i < rows.length; i++) {
            const d = rows[i];
            const record = {
                event_id: eventId,
                name: d.name.trim(),
                entry_fee: d.entry_fee === '' ? 0 : Number(d.entry_fee),
                format: d.format || null,
                entries_close_at: d.entries_close_at || null,
                license_required: !!d.license_required,
                age_category: d.age_category || null,
                gender: d.gender || null,
                sort_order: i,
                is_active: d.is_active !== false,
            };
            if (d.id) {
                await supabase.from('tournament_divisions').update(record).eq('id', d.id);
            } else {
                await supabase.from('tournament_divisions').insert([record]);
            }
        }
    };

    const handleSave = async () => {
        if (!validateBasics() || !validateDivisions()) return;
        setSaving(true);
        try {
            const payload = buildPayload();
            let eventId = editingEvent?.id;
            if (editingEvent) {
                const { error } = await supabase.from('calendar').update(payload).eq('id', editingEvent.id);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('calendar').insert([payload]).select('id').single();
                if (error) throw error;
                eventId = data.id;
            }
            await persistDivisions(eventId);
            toast.success(editingEvent ? 'Manual event updated' : 'Manual event created');
            onSaved?.();
            onClose?.();
        } catch (err) {
            console.error('Error saving manual event:', err);
            toast.error(`Failed to save: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1100] flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.97, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: 20 }}
                    className="bg-[#0F172A] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {editingEvent ? 'Edit Manual Event' : 'Create Manual Event'}
                            </h2>
                            <p className="text-xs text-gray-400">Step {step} of 5 — {STEPS[step - 1].label}</p>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-2 px-6 py-4 border-b border-white/5 overflow-x-auto">
                        {STEPS.map((s) => {
                            const Icon = s.icon;
                            const active = s.id === step;
                            const done = s.id < step;
                            return (
                                <button
                                    key={s.id}
                                    onClick={() => setStep(s.id)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${active
                                        ? 'bg-padel-green text-black'
                                        : done
                                            ? 'bg-padel-green/10 text-padel-green'
                                            : 'bg-white/5 text-gray-400 hover:text-white'
                                        }`}
                                >
                                    {done ? <Check size={14} /> : <Icon size={14} />}
                                    {s.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
                        {step === 1 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Event Name *</label>
                                    <input name="event_name" value={form.event_name} onChange={handleInput} className={inputClass} required />
                                </div>
                                <div>
                                    <label className={labelClass}>Slug (auto)</label>
                                    <input name="slug" value={form.slug} onChange={handleInput} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Organiser</label>
                                    <input name="organizer_name" value={form.organizer_name} onChange={handleInput} className={inputClass} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Address</label>
                                    <input
                                        ref={addressInputRef}
                                        name="address"
                                        value={form.address}
                                        onChange={handleInput}
                                        placeholder="Start typing to search Google..."
                                        autoComplete="off"
                                        className={inputClass}
                                    />
                                    <p className="text-[11px] text-gray-500 mt-1">Powered by Google — selecting a result auto-fills city &amp; venue.</p>
                                </div>
                                <div>
                                    <label className={labelClass}>City</label>
                                    <input name="city" value={form.city} onChange={handleInput} className={inputClass} />
                                </div>
                                <div className="relative">
                                    <label className={labelClass}>Venue / Club</label>
                                    <input
                                        name="venue"
                                        value={form.venue}
                                        onChange={(e) => { setField('venue', e.target.value); setVenueOpen(true); }}
                                        onFocus={() => setVenueOpen(true)}
                                        onBlur={() => setTimeout(() => setVenueOpen(false), 150)}
                                        placeholder="Select a club or type a venue"
                                        autoComplete="off"
                                        className={inputClass}
                                    />
                                    {venueOpen && filteredClubs.length > 0 && (
                                        <div className="absolute z-20 left-0 right-0 mt-1 bg-[#1E293B] border border-white/10 rounded-lg max-h-52 overflow-y-auto shadow-xl custom-scrollbar">
                                            {filteredClubs.map((c) => (
                                                <button
                                                    key={c.id}
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => { setField('venue', c.name); setVenueOpen(false); }}
                                                    className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-padel-green hover:text-black transition-colors"
                                                >
                                                    {c.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className={labelClass}>Start Date *</label>
                                    <input type="date" name="start_date" value={form.start_date} onChange={handleInput} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>End Date</label>
                                    <input type="date" name="end_date" value={form.end_date} onChange={handleInput} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Start Time</label>
                                    <input type="time" name="start_time" value={form.start_time} onChange={handleInput} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>End Time</label>
                                    <input type="time" name="end_time" value={form.end_time} onChange={handleInput} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>SAPA Status</label>
                                    <SelectMenu value={form.sapa_status} onChange={(v) => setField('sapa_status', v)} options={SAPA_STATUSES} />
                                </div>
                                <div>
                                    <label className={labelClass}>Tournament Tag</label>
                                    <SelectMenu value={form.tournament_tag} onChange={(v) => setField('tournament_tag', v)} options={TOURNAMENT_TAGS} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Short Description / About</label>
                                    <RichTextEditor value={form.description} onChange={(html) => setField('description', html)} placeholder="Describe the event..." />
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-end gap-3 bg-white/5 border border-white/10 rounded-xl p-4">
                                    <div className="flex-1 min-w-[160px]">
                                        <label className={labelClass}>Standard Price (apply to all)</label>
                                        <input
                                            type="number"
                                            value={standardPrice}
                                            onChange={(e) => setStandardPrice(e.target.value)}
                                            placeholder="e.g. 500"
                                            className={inputClass}
                                        />
                                    </div>
                                    <button onClick={applyStandardPrice} className="bg-white/10 text-white px-4 py-3 rounded-lg font-bold hover:bg-white/20 transition-colors">
                                        Apply to all
                                    </button>
                                </div>

                                {divisions.map((d) => (
                                    <div key={d._key} className="bg-[#1E293B] border border-white/10 rounded-xl p-4 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-gray-400 uppercase">Division</span>
                                            <button onClick={() => removeDivision(d._key)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div className="md:col-span-1">
                                                <label className={labelClass}>Division</label>
                                                <ComboBox value={d.name} onChange={(v) => updateDivision(d._key, { name: v })} options={STANDARD_DIVISIONS} placeholder="Select or type" />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Entry Fee (R)</label>
                                                <input type="number" value={d.entry_fee} onChange={(e) => updateDivision(d._key, { entry_fee: e.target.value })} className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Format</label>
                                                <SelectMenu value={d.format} onChange={(v) => updateDivision(d._key, { format: v })} options={FORMATS} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Entries Close</label>
                                                <input type="datetime-local" value={d.entries_close_at} onChange={(e) => updateDivision(d._key, { entries_close_at: e.target.value })} className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Age Category</label>
                                                <input value={d.age_category} onChange={(e) => updateDivision(d._key, { age_category: e.target.value })} placeholder="e.g. Open, 40+, U16" className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Gender</label>
                                                <SelectMenu value={d.gender} onChange={(v) => updateDivision(d._key, { gender: v })} options={GENDERS.map((g) => ({ value: g, label: g || '—' }))} placeholder="—" />
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                            <input type="checkbox" checked={d.license_required} onChange={(e) => updateDivision(d._key, { license_required: e.target.checked })} className="accent-padel-green w-4 h-4" />
                                            License required for this division
                                        </label>
                                    </div>
                                ))}
                                <button onClick={addDivision} className="w-full border border-dashed border-white/20 text-gray-300 rounded-xl py-3 font-bold flex items-center justify-center gap-2 hover:border-padel-green hover:text-padel-green transition-colors">
                                    <Plus size={16} /> Add Division
                                </button>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClass}>Prize Money Total (R)</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">R</span>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            name="prize_money_total"
                                            value={form.prize_money_total ? Number(form.prize_money_total).toLocaleString('en-ZA') : ''}
                                            onChange={(e) => setField('prize_money_total', e.target.value.replace(/[^\d]/g, ''))}
                                            placeholder="0"
                                            className={`${inputClass} pl-8`}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClass}>Balls</label>
                                    <input name="balls" value={form.balls} onChange={handleInput} className={inputClass} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Prize Money Breakdown</label>
                                    {!showPrizeBreakdown ? (
                                        <button
                                            type="button"
                                            onClick={() => { setShowPrizeBreakdown(true); syncPrizeBreakdownToDivisions(); }}
                                            className="w-full border border-dashed border-white/20 text-gray-300 rounded-xl py-3 font-bold flex items-center justify-center gap-2 hover:border-padel-green hover:text-padel-green transition-colors"
                                        >
                                            <Plus size={16} /> Add Prize Money Breakdown
                                        </button>
                                    ) : (
                                    <>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[11px] text-gray-500">Pulled from the divisions you selected. Set a prize amount per division, or add extra custom lines.</p>
                                        <button
                                            type="button"
                                            onClick={() => { setShowPrizeBreakdown(false); setField('prize_money_breakdown', []); }}
                                            className="text-[11px] font-bold text-red-400 hover:text-red-300 flex items-center gap-1 shrink-0"
                                        >
                                            <Trash2 size={12} /> Remove
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {(form.prize_money_breakdown || []).map((row, idx) => (
                                            <div key={idx} className="flex gap-2">
                                                {row._division ? (
                                                    <div className={`${inputClass} flex items-center font-semibold text-white/90`}>{row.label}</div>
                                                ) : (
                                                    <input value={row.label} onChange={(e) => updatePrizeRow(idx, { label: e.target.value })} placeholder="e.g. Men's Open Winner" className={inputClass} />
                                                )}
                                                <div className="relative max-w-[160px]">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">R</span>
                                                    <input
                                                        inputMode="numeric"
                                                        value={row.amount ? Number(String(row.amount).replace(/[^\d]/g, '')).toLocaleString('en-ZA') : ''}
                                                        onChange={(e) => updatePrizeRow(idx, { amount: e.target.value.replace(/[^\d]/g, '') })}
                                                        placeholder="Amount"
                                                        className={`${inputClass} pl-8`}
                                                    />
                                                </div>
                                                {row._division ? (
                                                    <span className="px-3 w-[40px]" />
                                                ) : (
                                                    <button onClick={() => removePrizeRow(idx)} className="px-3 text-red-400 hover:bg-red-500/10 rounded-lg"><Trash2 size={14} /></button>
                                                )}
                                            </div>
                                        ))}
                                        <button onClick={addPrizeRow} className="text-xs font-bold text-padel-green flex items-center gap-1"><Plus size={14} /> Add custom prize line</button>
                                    </div>
                                    </>
                                    )}
                                </div>
                                <div>
                                    <label className={labelClass}>Courts</label>
                                    <SelectMenu value={form.courts} onChange={(v) => setField('courts', v)} options={['Indoor', 'Outdoor', 'Covered']} placeholder="Select court type" />
                                </div>
                                <div>
                                    <label className={labelClass}>Draw Released</label>
                                    <input type="date" name="draw_released" value={form.draw_released} onChange={handleInput} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Tournament Director</label>
                                    <input name="tournament_director" value={form.tournament_director} onChange={handleInput} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Referees</label>
                                    <input name="referees" value={form.referees} onChange={handleInput} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Points (winner / tier)</label>
                                    <input type="number" name="points" value={form.points} onChange={handleInput} placeholder="e.g. 1000" className={inputClass} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Points Breakdown</label>
                                    <RichTextEditor value={form.points_breakdown} onChange={(html) => setField('points_breakdown', html)} placeholder="e.g. Winner: 1000 pts, Finalist: 750 pts..." />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Sanctioning Details</label>
                                    <RichTextEditor value={form.sanctioning_details} onChange={(html) => setField('sanctioning_details', html)} placeholder="Sanctioning information..." />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Specific Rules & Regulations</label>
                                    <RichTextEditor value={form.rules_regs} onChange={(html) => setField('rules_regs', html)} placeholder="List the rules and regulations..." />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Withdrawal & Substitution Policy</label>
                                    <RichTextEditor value={form.withdrawal_substitution} onChange={(html) => setField('withdrawal_substitution', html)} placeholder="Withdrawal and substitution policy..." />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClass}>Registration Closes</label>
                                    <RichTextEditor value={form.cut_off_times} onChange={(html) => setField('cut_off_times', html)} minHeight={90} placeholder='e.g. Registration closes strictly on 28 June at 17:00. No late entries will be accepted.' />
                                </div>
                                <div>
                                    <label className={labelClass}>Contact Details</label>
                                    <input name="contact_details" value={form.contact_details} onChange={handleInput} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Organiser Phone</label>
                                    <input name="organizer_phone" value={form.organizer_phone} onChange={handleInput} className={inputClass} />
                                </div>
                                <div>
                                    <label className={labelClass}>Organiser Email</label>
                                    <input name="organizer_email" value={form.organizer_email} onChange={handleInput} className={inputClass} />
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="space-y-6">
                                <div>
                                    <label className={labelClass}>Event Poster</label>
                                    <div className="flex items-center gap-4">
                                        {form.custom_image_url && (
                                            <img src={form.custom_image_url} alt="Poster" className="w-24 h-32 object-cover rounded-lg border border-white/10" />
                                        )}
                                        <label className="cursor-pointer bg-white/5 border border-dashed border-white/20 rounded-xl px-5 py-6 flex flex-col items-center gap-2 text-gray-300 hover:border-padel-green hover:text-padel-green transition-colors">
                                            {uploadingPoster ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />}
                                            <span className="text-xs font-bold">{uploadingPoster ? 'Uploading...' : 'Upload Poster'}</span>
                                            <input type="file" accept="image/*" className="hidden" onChange={handlePosterUpload} disabled={uploadingPoster} />
                                        </label>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClass}>Sponsor Logos</label>
                                    <div className="flex flex-wrap items-center gap-3">
                                        {(form.sponsor_logos || []).map((url, idx) => (
                                            <div key={idx} className="relative group">
                                                <img src={url} alt="Sponsor" className="w-20 h-20 object-contain rounded-lg border border-white/10 bg-white/5 p-1" />
                                                <button onClick={() => removeSponsor(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                        <label className="cursor-pointer bg-white/5 border border-dashed border-white/20 rounded-xl w-20 h-20 flex flex-col items-center justify-center gap-1 text-gray-300 hover:border-padel-green hover:text-padel-green transition-colors">
                                            {uploadingSponsor ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                                            <span className="text-[9px] font-bold">Add</span>
                                            <input type="file" accept="image/*" multiple className="hidden" onChange={handleSponsorUpload} disabled={uploadingSponsor} />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {step === 5 && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Registration Closes At</label>
                                        <input type="datetime-local" name="registration_closes_at" value={form.registration_closes_at} onChange={handleInput} className={inputClass} />
                                        <p className="text-[11px] text-gray-500 mt-1">Event-wide fallback. Per-division close dates take priority.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {[
                                        ['allow_payments', 'Allow payments'],
                                        ['is_visible', 'Visible on website'],
                                        ['featured_event', 'Featured event'],
                                        ['finance_managed', 'Finance manager'],
                                        ['show_in_recent_results', 'Show in recent results'],
                                    ].map(([key, label]) => (
                                        <label key={key} className="flex items-center justify-between bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
                                            <span className="text-sm font-medium text-gray-200">{label}</span>
                                            <input type="checkbox" name={key} checked={!!form[key]} onChange={handleInput} className="accent-padel-green w-5 h-5" />
                                        </label>
                                    ))}
                                </div>

                                {/* Review summary */}
                                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2 text-sm">
                                    <p className="text-gray-400 text-xs font-bold uppercase mb-2">Review</p>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-white font-bold">{form.event_name || 'Untitled event'}</p>
                                        {form.sapa_status && form.sapa_status !== 'None' && (
                                            <span className={`text-[10px] font-black uppercase tracking-wide rounded-full px-2 py-0.5 ${sapaBadgeClass(form.sapa_status)}`}>{form.sapa_status}</span>
                                        )}
                                    </div>
                                    <p className="text-gray-400">{formatEventDates(form.start_date, form.end_date) || 'No dates set'} · {[form.venue, form.city].filter(Boolean).join(', ')}</p>
                                    <div className="pt-2 space-y-1">
                                        {divisions.filter((d) => d.name.trim()).map((d) => (
                                            <div key={d._key} className="flex items-center justify-between text-xs text-gray-300 border-t border-white/5 pt-1">
                                                <span>{d.name} · {d.format}</span>
                                                <span>R{d.entry_fee || 0}{d.license_required ? ' · license' : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
                        <button
                            onClick={back}
                            disabled={step === 1}
                            className="px-4 py-2 rounded-xl font-bold text-gray-300 hover:bg-white/5 disabled:opacity-30 flex items-center gap-2"
                        >
                            <ChevronLeft size={16} /> Back
                        </button>
                        {step < 5 ? (
                            <button onClick={next} className="bg-padel-green text-black px-5 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-white transition-colors">
                                Next <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button onClick={handleSave} disabled={saving} className="bg-padel-green text-black px-5 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-white transition-colors disabled:opacity-50">
                                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                {saving ? 'Saving...' : editingEvent ? 'Update Event' : 'Create Event'}
                            </button>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default EventBuilder;
