import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    X, Save, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Plus, Trash2, UploadCloud, Loader2,
    Info, Layers, FileText, ImageIcon, Check, Eye, Copy, Pencil, ClipboardList, Shield, AlertTriangle,
    Bold, Italic, Underline, List, ListOrdered, Heading, UserPlus
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useClubs } from '../../hooks/useClubs';
import { getDefaultBackgroundForStatus } from '../../utils/imageUtils';

const STANDARD_DIVISIONS = [
    // Men / Ladies / Mixed — levels
    "Men's Elite", "Men's Open", "Men's Advanced", "Men's Intermediate",
    "Ladies Elite", "Ladies Open", "Ladies Advanced", "Ladies Intermediate",
    "Mixed", "Mixed Elite", "Mixed Open", "Mixed Advanced", "Mixed Intermediate",
    // Open (elite / advanced)
    "Men's Open Elite", "Men's Open Advanced",
    "Ladies Open Elite", "Ladies Open Advanced",
    // Masters + age groups
    "Men's Masters", "Ladies Masters",
    "Men's 35+", "Ladies 35+",
    "Men's 40+", "Ladies 40+",
    "Men's 45+", "Ladies 45+",
    "Men's 50+", "Ladies 50+",
    "Men's 55+", "Ladies 55+",
    // Juniors
    "Juniors",
    "Juniors U12", "Juniors U14", "Juniors U16", "Juniors U18",
    "Juniors U19", "Juniors U19 Boys", "Juniors U19 Girls",
    "Juniors U21", "Juniors U21 Boys", "Juniors U21 Girls",
];

const FORMATS = ['TBC','Knockout', 'Groups', 'Groups + Knockout', 'Round Robin', 'Americano', 'Mexicano'];
const SAPA_STATUSES = ['None', 'Bronze', 'Silver', 'Gold', 'Super Gold', 'Major'];
const SAPA_WINNER_POINTS = { None: '', Bronze: '300', Silver: '500', Gold: '1000', 'Super Gold': '1500', Major: '2600' };
const SCORING_POINTS = [
    { value: 'golden', label: 'Golden Point' },
    { value: 'silver', label: 'Silver Point' },
    { value: 'star', label: 'Star Point' },
    { value: 'advantage', label: 'Advantage (no deciding point)' },
];
const scoringPointLabel = (value) =>
    SCORING_POINTS.find((o) => o.value === value)?.label || 'Golden Point';
const resolveScoringPoint = (source) => {
    if (source?.scoring_point && SCORING_POINTS.some((o) => o.value === source.scoring_point)) {
        return source.scoring_point;
    }
    if (source?.golden_point === false) return 'advantage';
    return 'golden';
};
const sapaBadgeText = (status) => {
    const points = SAPA_WINNER_POINTS[status];
    if (!status || status === 'None' || !points) return '';
    return `SAPA ${status.toUpperCase()} ${points}`;
};
const ENTRY_FEE_WARN_THRESHOLD = 50;

const safeISOString = (val) => {
    if (!val) return null;
    try {
        const date = new Date(val);
        return isNaN(date.getTime()) ? null : date.toISOString();
    } catch {
        return null;
    }
};

// Convert a UTC ISO string from the DB into a local-time string suitable for
// a <input type="datetime-local"> (which always works in local time).
const toLocalInput = (utcStr) => {
    if (!utcStr) return '';
    try {
        const date = new Date(utcStr);
        if (isNaN(date.getTime())) return '';
        // Shift from UTC to local so the picker shows the correct local time.
        const offsetMs = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - offsetMs);
        return localDate.toISOString().substring(0, 16);
    } catch {
        return '';
    }
};

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
const GENDERS = ['', 'Men', 'Ladies', 'Mixed', 'Junior'];
const AGE_CATEGORIES = ['', 'Open', '35+', '40+', '45+', '50+', '55+', 'Masters', 'Junior'];
const TOURNAMENT_TAGS = ['None', 'Broll', 'SAPA', 'Club', 'Social', 'Internal', '360 Padel', 'SA Grand'];

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
let googleMapsPromise = null;
const loadGoogleMaps = () => {
    if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
    if (!GOOGLE_MAPS_KEY) {
        return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY is not set. Add it to your host env (e.g. Vercel) and redeploy.'));
    }
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
    { id: 2, label: 'Registration', icon: ClipboardList },
    { id: 3, label: 'Divisions', icon: Layers },
    { id: 4, label: 'Tournament Info', icon: FileText },
    { id: 5, label: 'Sponsors & Media', icon: ImageIcon },
    { id: 6, label: 'Review & Publish', icon: Eye },
];

const inputClass = "w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none";
const labelClass = "block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wide";
const menuClass = "absolute z-30 left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg max-h-52 overflow-y-auto shadow-xl custom-scrollbar";
const menuItemClass = "w-full text-left px-4 py-2.5 text-sm text-white hover:bg-padel-green hover:text-black transition-colors";

const parseCoAdminEmails = (value) =>
    String(value || '')
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

/** Chip + player type-ahead for event_co_admins (stored as comma-separated emails). */
const CoAdminsPicker = ({ value, onChange }) => {
    const emails = useMemo(() => parseCoAdminEmails(value), [value]);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const [searching, setSearching] = useState(false);
    const wrapRef = useRef(null);
    const selectedRef = useRef(false);

    const setEmails = (next) => {
        const unique = [];
        const seen = new Set();
        for (const email of next) {
            const key = normalizeEmail(email);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            unique.push(email.trim());
        }
        onChange(unique.join(', '));
    };

    const addEmail = (email) => {
        const cleaned = String(email || '').trim();
        if (!cleaned) return;
        if (emails.some((e) => normalizeEmail(e) === normalizeEmail(cleaned))) {
            toast.message('Already added as co-admin');
            return;
        }
        setEmails([...emails, cleaned]);
        setQuery('');
        setResults([]);
        setOpen(false);
    };

    const removeEmail = (email) => {
        setEmails(emails.filter((e) => normalizeEmail(e) !== normalizeEmail(email)));
    };

    useEffect(() => {
        if (selectedRef.current) {
            selectedRef.current = false;
            return undefined;
        }
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            setSearching(false);
            return undefined;
        }
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const safe = q.replace(/[%_,]/g, ' ').trim();
                const { data, error } = await supabase
                    .from('players')
                    .select('id, name, email, image_url, home_club')
                    .or(`name.ilike.%${safe}%,email.ilike.%${safe}%`)
                    .not('email', 'is', null)
                    .neq('email', '')
                    .eq('approved', true)
                    .order('name')
                    .limit(8);
                if (error) throw error;
                const existing = new Set(emails.map(normalizeEmail));
                setResults((data || []).filter((p) => p.email && !existing.has(normalizeEmail(p.email))));
                setOpen(true);
            } catch (err) {
                console.warn('Co-admin player search failed:', err);
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 280);
        return () => clearTimeout(timer);
    }, [query, emails]);

    useEffect(() => {
        const onDown = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    const commitTyped = () => {
        const q = query.trim();
        if (!q) return;
        if (looksLikeEmail(q)) {
            addEmail(q);
            return;
        }
        if (results.length === 1 && results[0].email) {
            selectedRef.current = true;
            addEmail(results[0].email);
        }
    };

    return (
        <div className="space-y-2">
            {emails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {emails.map((email) => (
                        <span
                            key={normalizeEmail(email)}
                            className="inline-flex items-center gap-1.5 bg-padel-green/15 border border-padel-green/30 text-padel-green text-xs font-semibold pl-2.5 pr-1.5 py-1 rounded-full"
                        >
                            {email}
                            <button
                                type="button"
                                onClick={() => removeEmail(email)}
                                className="p-0.5 rounded-full hover:bg-padel-green/20 text-padel-green"
                                aria-label={`Remove ${email}`}
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="relative" ref={wrapRef}>
                <div className="relative">
                    <UserPlus size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onFocus={() => { if (results.length) setOpen(true); }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',') {
                                e.preventDefault();
                                commitTyped();
                            } else if (e.key === 'Backspace' && !query && emails.length) {
                                removeEmail(emails[emails.length - 1]);
                            }
                        }}
                        placeholder="Search players by name or email…"
                        className={`${inputClass} pl-10`}
                        autoComplete="off"
                    />
                    {searching && (
                        <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
                    )}
                </div>
                {open && (results.length > 0 || (query.trim().length >= 2 && !searching)) && (
                    <div className={menuClass}>
                        {results.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-400">
                                {looksLikeEmail(query)
                                    ? (
                                        <button
                                            type="button"
                                            className={menuItemClass}
                                            onClick={() => addEmail(query.trim())}
                                        >
                                            Add email “{query.trim()}”
                                        </button>
                                    )
                                    : 'No matching players — type a full email and press Enter'}
                            </div>
                        ) : (
                            results.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    className={`${menuItemClass} flex items-center gap-3`}
                                    onClick={() => {
                                        selectedRef.current = true;
                                        addEmail(p.email);
                                    }}
                                >
                                    <div className="w-8 h-8 rounded-full overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
                                        {p.image_url ? (
                                            <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-[10px] font-bold text-gray-400">
                                                {(p.name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="min-w-0 text-left">
                                        <p className="font-semibold truncate">{p.name}</p>
                                        <p className="text-[11px] opacity-70 truncate">{p.email}{p.home_club ? ` · ${p.home_club}` : ''}</p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
            <p className="text-[11px] text-gray-500">
                Pick players from the database, or type any email and press Enter.
            </p>
        </div>
    );
};

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

const emptyDivision = (licenseRequired = false, scoringPoint = 'golden') => ({
    _key: Math.random().toString(36).slice(2),
    id: null,
    name: '',
    entry_fee: '',
    format: 'Knockout',
    entries_close_at: '',
    license_required: !!licenseRequired,
    scoring_point: scoringPoint || 'golden',
    age_category: '',
    gender: '',
    suggested_level: '',
    entry_limit: '',
    details: '',
    is_active: true,
});

const slugify = (value) =>
    (value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

/**
 * Returns a calendar.slug that is not already taken.
 * Tries base, then base-YYYY (from startDate if provided), then base-2, base-3, …
 */
const ensureUniqueSlug = async (baseSlug, { excludeId = null, startDate = null } = {}) => {
    const base = slugify(baseSlug) || `event-${Date.now()}`;
    const year = startDate ? String(startDate).slice(0, 4) : null;
    const candidates = [base];
    if (year && /^\d{4}$/.test(year)) candidates.push(`${base}-${year}`);
    for (let n = 2; n <= 30; n++) candidates.push(`${base}-${n}`);
    candidates.push(`${base}-${Date.now()}`);

    for (const candidate of candidates) {
        let query = supabase.from('calendar').select('id').eq('slug', candidate).limit(1);
        if (excludeId) query = query.neq('id', excludeId);
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        if (!data) return candidate;
    }
    return `${base}-${Date.now()}`;
};

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

const resizeImage = (file, maxWidth = 1200, quality = 0.8, preserveAlpha = false) =>
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
                const ctx = canvas.getContext('2d');
                if (preserveAlpha) {
                    ctx.clearRect(0, 0, width, height);
                }
                ctx.drawImage(img, 0, 0, width, height);
                const mime = preserveAlpha ? 'image/png' : 'image/jpeg';
                canvas.toBlob(
                    (blob) => {
                        const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
                        resolve(new File(
                            [blob],
                            `${baseName}.${preserveAlpha ? 'png' : 'jpg'}`,
                            { type: mime, lastModified: Date.now() }
                        ));
                    },
                    mime,
                    quality
                );
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });

const uploadToGallery = async (file, prefix) => {
    const preserveAlpha = prefix === 'sponsors' || prefix === 'org-logos';
    const resized = await resizeImage(file, 1200, 0.8, preserveAlpha);
    const ext = preserveAlpha ? 'png' : 'jpg';
    const fileName = `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}.${ext}`;
    const filePath = `${prefix}/${fileName}`;
    const { error } = await supabase.storage.from('gallery').upload(filePath, resized);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(filePath);
    return publicUrl;
};

const blankForm = {
    event_name: '',
    slug: '',
    organisation_id: null,
    organizer_name: 'SAPA',
    organizer_logo_url: '',
    organizer_badge_text: '',
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
    courts: 'Outdoor',
    indoor_outdoor: 'Outdoor',
    courts_count: '',
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
    registration_opens_at: '',
    registration_closes_at: '',
    featured_event: false,
    is_visible: true,
    finance_managed: true,
    allow_payments: true,
    show_in_recent_results: false,
    allow_temporary_license: true,
    license_required_default: false,
    entry_fee_notes: '',
    // format & capacity
    golden_point: true,
    scoring_point: 'golden',
    is_league: false,
    max_teams_capacity: '',
    partner_requirement: 'Required',
    back_draw_options: 'Plate Included',
    event_co_admins: '',
};

const SAPA_DEFAULTS = {
    description: `<p>This SAPA-sanctioned tournament forms part of the official SAPA tournament calendar and offers players the opportunity to compete for SAPA ranking points in a structured, competitive event.</p><p>The tournament will include multiple divisions to cater for different playing levels, subject to the final number of entries received. Spaces in each division may be limited, and players are encouraged to register early.</p><p>All event information, registration, payment, SAPA Player License checks and event updates will be managed through the 4M Padel platform.</p><h3>Registration</h3><p>Registration must be completed through the 4M Padel website before the official closing date and time listed on the event card. Late entries may not be accepted once registration has closed.</p><p>Entry is only confirmed once the player has completed registration, paid the applicable entry fee, and holds a valid SAPA Player License.</p><h3>SAPA Player License</h3><p>For the 2026 season, a valid SAPA Player License is mandatory for all players entering SAPA Gold, Super Gold and Major events. SAPA Bronze and Silver events do not require a SAPA Player License, unless specifically stated on the event card.</p><p>Where a SAPA Player License is required, players may use either:</p><ul><li>Annual SAPA Player License — R450</li><li>Temporary SAPA Player License — R120, valid for one event only</li></ul><p>SAPA Player Licenses can be purchased through the 4M Padel website during the registration process.</p><p>Players entering a Gold, Super Gold or Major event without a valid SAPA Player License will not be eligible to compete, and may be removed from the entry list or draw.</p><h3>Divisions</h3><p>The tournament may include one or more divisions such as:</p><ul><li>Men’s Open</li><li>Men’s Advanced</li><li>Men’s Intermediate</li><li>Ladies Open</li><li>Ladies Advanced</li><li>Ladies Intermediate</li><li>Mixed or additional divisions, where applicable</li></ul><p>Suggested playing levels may be provided for each division to help players enter the most appropriate category.</p><p>Players may be permitted to enter more than one division, but SAPA ranking points will only be awarded in accordance with SAPA rules, usually in the highest eligible division entered.</p><p>The Tournament Director and SAPA Tournament Committee reserve the right to move or remove players from a division where their level is considered inappropriate for that division or unfair to the rest of the draw.</p><h3>Format</h3><p>The Men’s Open and Ladies Open divisions will be played as knockout draws with a back draw. All Men’s Open and Ladies Open matches will be played as best of three full sets, with Star Point used in all rounds and all matches.</p><p>Other divisions may follow the same knockout format, or may be played as group stages leading into knockout rounds, plate draws or another format determined by the final number of entries. The final format for each division will be confirmed once entries have closed and will be published on the event card and/or final tournament fact sheet.</p><p>Star Point is the default sudden-death scoring format for SAPA events. Silver Point may be used in divisions other than Men’s Open and Ladies Open, where approved by the Tournament Director and/or SAPA Tournament Committee.</p><h3>Seeding</h3><p>From 1 July 2026, seeding for SAPA-sanctioned events will be determined according to SAPA ranking points. Seedings will be calculated in accordance with the applicable SAPA tournament rules and the official SAPA rankings at the time of the draw.</p><p>The SAPA Tournament Committee may review seedings where required to ensure they are correctly applied in line with SAPA rules. The SAPA Tournament Committee’s decision on seeding is final.</p><h3>Draws, Fixtures and Results</h3><p>Draws and fixtures will be published after registration closes and once seedings, withdrawals and substitutions have been finalised. Players are responsible for checking their scheduled match times and ensuring that they are available from their first scheduled match.</p><p>Results may be published on the official tournament platform and/or the 4M Padel website.</p><h3>Player Availability</h3><p>Players must be available to play at their scheduled match times. Depending on the size of the draw, matches may begin on the evening before the main tournament dates, particularly where divisions are full or additional playing windows are required.</p><p>Players are responsible for checking their own fixtures and ensuring that they know the correct date, time, venue and court for each match. Any player or team arriving late for a scheduled match may be disqualified, and a walkover may be awarded to the opposing team.</p><p>Players should remain available for the full duration of the tournament, or until they have been eliminated from all applicable draws.</p><h3>Player Conduct</h3><p>All players are expected to conduct themselves in a respectful and sportsmanlike manner at all times. Bad conduct, abusive behaviour, unsportsmanlike behaviour or disrespect towards opponents, officials, organisers, venues or spectators will not be tolerated.</p><p>All SAPA regulations, the SAPA Code of Conduct and any applicable disciplinary framework will apply.</p><h3>Entry Fee</h3><p>The entry fee for the event will be listed on the event card. The entry fee generally includes participation in the tournament, court fees and official match balls, unless otherwise stated.</p><p>Additional inclusions, such as refreshments, player gifts, parking or venue access, may vary from event to event.</p><h3>Venues</h3><p>Matches may be played at one or more host venues. Players should carefully check the venue information and match location for each fixture.</p><p>Where multiple venues are used, players are responsible for ensuring that they arrive at the correct venue on time.</p><h3>Important Notes</h3><p>Tournament dates, playing windows, formats, divisions, venues and schedules may be adjusted depending on entries, weather, court availability or operational requirements. The Tournament Director and SAPA Tournament Committee reserve the right to make changes where necessary to ensure the fair and efficient running of the event.</p><h3>Assistance</h3><p>For registration, payment or SAPA Player License assistance, players may contact 4M Padel via WhatsApp on 0837909091. For venue-specific queries, players should contact the relevant host venue or tournament organiser.</p><p>Players are encouraged to read all event information carefully before registering.</p>`,
    points_breakdown: `<p>SAPA ranking points will be awarded according to the official SAPA points structure for the relevant event tier. Points breakdowns are available on the 4M Padel website.</p><p>The number of points available may depend on the tournament category, the size of the draw, the strength of the draw, the division entered and the player’s final finishing position. SAPA reserves the right to grade or re-grade a tournament based on the strength and size of the draw.</p><p>Final ranking points calculations are completed after the conclusion of the draw and once all results have been accurately submitted. Where final positions are played for, points will be allocated according to the position achieved by the player or team.</p><p>If a player or team is required to play in a back draw, plate draw, position play-off or any other match used to determine final position, they must play that match in order to be eligible for ranking points. A player or team that does not play in the back draw, plate draw or required position play-off will not earn SAPA ranking points for that event.</p><p>Where a player enters more than one division, ranking points will generally only be awarded in one division, being the highest eligible division entered.</p><p>It is the tournament organiser’s responsibility to enter all results accurately and completely into the approved tournament management system. If results are not entered properly, SAPA reserves the right to withhold ranking points, amend the points allocation, or withdraw the sanctioning of the event.</p>`,
    sanctioning_details: `<p>This event is officially sanctioned by SAPA and forms part of the SAPA tournament calendar. The event will be run in accordance with the applicable SAPA tournament rules, regulations, code of conduct and disciplinary framework.</p><p>SAPA ranking points will be awarded to eligible players in accordance with the tournament tier and the official SAPA points structure. All players must hold a valid SAPA Player License in order to participate, unless otherwise stated for the specific event.</p><p>Seedings, draw approval, player eligibility and any exceptional tournament decisions may be reviewed by the SAPA Tournament Committee. The Tournament Director, Tournament Referee and SAPA Tournament Committee reserve the right to make any decisions necessary to ensure the event is run fairly, consistently and in line with SAPA standards.</p>`,
    rules_regs: `<p>All players must comply with the rules and regulations published for this event, together with the applicable SAPA tournament rules, code of conduct and disciplinary framework.</p><p>Event-specific rules, including match format, scoring, player eligibility, withdrawals, substitutions, late arrivals, seeding, ranking points and scheduling requirements, will be confirmed on the event card and/or final tournament fact sheet.</p><p>By entering the event, players acknowledge that they have read and accepted these rules and agree to follow all instructions from the Tournament Director, Tournament Referee and SAPA Tournament Committee.</p>`,
    withdrawal_substitution: `<p>Players may withdraw from an event before the official registration closing date and time.</p><p>Once registration has closed, all pairs are considered confirmed and the draw process may begin. After this point, substitutions will only be considered in exceptional circumstances, such as a genuine injury, medical issue or other valid reason accepted by the Tournament Director and/or SAPA Tournament Committee.</p><p>Any substitution must be approved in writing before the player may compete. The replacement player must hold a valid SAPA Player License and must not materially increase the strength of the pair or compromise the fairness of the draw.</p><p>No substitutions will be allowed once the draw has been published, unless specifically approved by the SAPA Tournament Committee in exceptional circumstances.</p><p>If a player withdraws after registration closes and no approved substitution is granted, the pair may be removed from the draw and may forfeit their entry fee.</p><p>SAPA, the Tournament Director and the Tournament Referee reserve the right to make the final decision on all withdrawals, substitutions and related draw changes.</p>`,
    cut_off_times: `<p>Registration closes strictly on the Monday of event week at 17:00.</p><p>A team’s entry is only confirmed once both partners have completed registration and paid the full event registration fee. Players who have not completed payment by the registration deadline may be removed from the entry list or excluded from the draw.</p><p>Registration for divisions other than Men’s Open and Ladies Open may be extended slightly at the discretion of the Tournament Director and/or SAPA Tournament Committee, depending on entries, court availability and event requirements.</p><p>No late entries will be accepted after the final registration deadline unless specifically approved by the Tournament Director and/or SAPA Tournament Committee.</p>`,
};

// Monday of the week the event starts in, at 17:00 local time — the default
// registration deadline (e.g. event starts Fri 31 July → closes Mon 27 July 17:00).
const mondayCloseFor = (startDateStr) => {
    if (!startDateStr) return '';
    const d = new Date(`${startDateStr}T00:00:00`);
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday of that week
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T17:00`;
};

// Exactly 1 month before the event start date, at 09:00 local — default registration opens.
const opensOneMonthBefore = (startDateStr) => {
    if (!startDateStr) return '';
    const d = new Date(`${startDateStr}T00:00:00`);
    if (isNaN(d.getTime())) return '';
    d.setMonth(d.getMonth() - 1);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
};

const genderFromDivisionName = (name) => {
    const n = (name || '').toLowerCase();
    if (n.includes('ladies') || n.includes('women') || n.includes('girls')) return 'Ladies';
    if (n.includes('mixed')) return 'Mixed';
    if (n.includes('junior') && !n.includes('boys') && !n.includes('girls')) return 'Junior';
    if (n.includes('boys') || n.includes("men's") || n.includes('men ')) return 'Men';
    if (n.includes('junior')) return 'Junior';
    if (n.includes('men')) return 'Men';
    return '';
};

const ageFromDivisionName = (name) => {
    const n = (name || '').toLowerCase();
    if (n.includes('junior') || n.includes('boys') || n.includes('girls') || /\bu\d+/.test(n)) return 'Junior';
    if (n.includes('masters')) return 'Masters';
    if (n.includes('55+') || n.includes('over 55')) return '55+';
    if (n.includes('50+') || n.includes('over 50')) return '50+';
    if (n.includes('45+') || n.includes('over 45')) return '45+';
    if (n.includes('40+') || n.includes('over 40')) return '40+';
    if (n.includes('35+') || n.includes('over 35')) return '35+';
    if (n.includes('open') || n.includes('elite') || n.includes('advanced') || n.includes('intermediate')) return 'Open';
    return '';
};

const EventBuilder = ({ isOpen, onClose, onSaved, editingEvent = null, organization = null }) => {
    // Org editing an already-sanctioned event → changes become a draft
    // amendment that a 4M admin must approve (event stays live meanwhile).
    const isAmendment = !!(organization && editingEvent && editingEvent.sanction_status === 'approved');
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(blankForm);
    const [divisions, setDivisions] = useState([emptyDivision()]);
    const [removedDivisionIds, setRemovedDivisionIds] = useState([]);
    const [standardPrice, setStandardPrice] = useState('');
    const [bulkCloseDate, setBulkCloseDate] = useState('');
    const [showPrizeBreakdown, setShowPrizeBreakdown] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingPoster, setUploadingPoster] = useState(false);
    const [uploadingOrgLogo, setUploadingOrgLogo] = useState(false);
    const [uploadingSponsor, setUploadingSponsor] = useState(false);
    const [expandedDivisionKey, setExpandedDivisionKey] = useState(null);
    const [openPanels, setOpenPanels] = useState({
        identity: true, venue: false, display: false,
        regWindow: true, entryPayment: false, partnerCapacity: false, licenseDefaults: false,
        divTools: false, divisions: true,
        operations: true, points: false, rules: false, contact: false,
        sponsors: true, websiteDisplay: false,
    });
    const [showPreview, setShowPreview] = useState(false);

    const { clubs } = useClubs();
    const [venueOpen, setVenueOpen] = useState(false);
    const [orgSuggestions, setOrgSuggestions] = useState([]);
    const [orgSearchOpen, setOrgSearchOpen] = useState(false);
    const [searchingOrgs, setSearchingOrgs] = useState(false);
    const orgSearchRef = useRef(null);
    const orgSelectedRef = useRef(false);

    const addressInputRef = useRef(null);
    const autocompleteRef = useRef(null);
    // True once the user has manually set/cleared the registration deadline —
    // stops the start-date auto-fill from overwriting their choice.
    const regCloseTouchedRef = useRef(false);
    const regOpenTouchedRef = useRef(false);
    const pointsTouchedRef = useRef(false);

    const filteredClubs = clubs.filter(
        (c) => !form.venue || c.name.toLowerCase().includes(form.venue.toLowerCase())
    );

    // Admin calendar: type-ahead search for organisations to link the event
    useEffect(() => {
        if (!isOpen || organization) return undefined;
        const q = (form.organizer_name || '').trim();
        if (orgSelectedRef.current) {
            orgSelectedRef.current = false;
            return undefined;
        }
        if (q.length < 2) {
            setOrgSuggestions([]);
            setSearchingOrgs(false);
            return undefined;
        }
        const timer = setTimeout(async () => {
            setSearchingOrgs(true);
            try {
                const safe = q.replace(/[%_,]/g, ' ').trim();
                const { data, error } = await supabase
                    .from('organisations')
                    .select('id, name, slug, logo_url, contact_email, contact_phone, website_url, status')
                    .ilike('name', `%${safe}%`)
                    .eq('status', 'approved')
                    .order('name')
                    .limit(10);
                if (error) throw error;
                setOrgSuggestions(data || []);
                setOrgSearchOpen(true);
            } catch (err) {
                console.warn('Organisation search failed:', err);
                setOrgSuggestions([]);
            } finally {
                setSearchingOrgs(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [form.organizer_name, isOpen, organization]);

    useEffect(() => {
        const onDown = (e) => {
            if (orgSearchRef.current && !orgSearchRef.current.contains(e.target)) {
                setOrgSearchOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, []);

    const selectOrganisation = (org) => {
        orgSelectedRef.current = true;
        setOrgSuggestions([]);
        setOrgSearchOpen(false);
        setForm((prev) => ({
            ...prev,
            organisation_id: org.id,
            organizer_name: org.name || prev.organizer_name,
            organizer_logo_url: org.logo_url || '',
            organizer_email: org.contact_email || prev.organizer_email,
            organizer_phone: org.contact_phone || prev.organizer_phone,
            organizer_website: org.website_url || prev.organizer_website,
        }));
    };

    const handleOrganiserNameChange = (value) => {
        orgSelectedRef.current = false;
        setForm((prev) => ({
            ...prev,
            organizer_name: value,
            organisation_id: null,
        }));
    };

    const clearOrganisationLink = () => {
        orgSelectedRef.current = false;
        setForm((prev) => ({
            ...prev,
            organisation_id: null,
        }));
    };

    const togglePanel = (key) =>
        setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));

    // Google Places autocomplete on the address field (step 1, when Date & Venue is open).
    useEffect(() => {
        if (!isOpen || step !== 1 || !openPanels.venue) return;
        let cancelled = false;
        // Allow the collapsible panel to mount the input before attaching.
        const timer = setTimeout(() => {
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
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            autocompleteRef.current = null;
        };
    }, [isOpen, step, openPanels.venue]);

    useEffect(() => {
        if (!isOpen) return;
        setStep(1);
        setRemovedDivisionIds([]);
        setStandardPrice('');
        setBulkCloseDate('');
        setExpandedDivisionKey(null);
        setOpenPanels({
            identity: true, venue: false, display: false,
            regWindow: true, entryPayment: false, partnerCapacity: false, licenseDefaults: false,
            divTools: false, divisions: true,
            operations: true, points: false, rules: false, contact: false,
            sponsors: true, websiteDisplay: false,
        });
        setShowPreview(false);
        if (editingEvent) {
            regCloseTouchedRef.current = true;
            regOpenTouchedRef.current = true;
            pointsTouchedRef.current = true;
            // If the org has a pending amendment draft, resume editing THAT
            // draft rather than the live event data.
            const draft = (organization && editingEvent.sanction_status === 'approved'
                && ['pending', 'rejected'].includes(editingEvent.pending_changes_status)
                && editingEvent.pending_changes?.payload)
                ? editingEvent.pending_changes : null;
            loadExisting(draft ? { ...editingEvent, ...draft.payload } : editingEvent, draft?.divisions || null);
        } else {
            regCloseTouchedRef.current = false;
            regOpenTouchedRef.current = false;
            pointsTouchedRef.current = false;
            // New events start with the standard SAPA content pre-filled (editable per event).
            const base = { ...blankForm, ...SAPA_DEFAULTS };
            // Org portal mode: prefill organiser identity from the organisation
            setForm(organization ? {
                ...base,
                organisation_id: organization.id,
                organizer_name: organization.name || base.organizer_name,
                organizer_logo_url: organization.logo_url || '',
                organizer_email: organization.contact_email || '',
                organizer_phone: organization.contact_phone || '',
                organizer_website: organization.website_url || '',
            } : base);
            setDivisions([emptyDivision(base.license_required_default)]);
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

    const mapDivisionRow = (d, key) => ({
        _key: key || d.id || Math.random().toString(36).slice(2),
        id: d.id || null,
        name: d.name || '',
        entry_fee: d.entry_fee != null ? String(d.entry_fee) : '',
        format: d.format || 'Knockout',
        entries_close_at: toLocalInput(d.entries_close_at),
        license_required: !!d.license_required,
        scoring_point: resolveScoringPoint(d),
        age_category: d.age_category || '',
        gender: d.gender || '',
        suggested_level: d.suggested_level || '',
        entry_limit: d.entry_limit != null && d.entry_limit !== '' ? String(d.entry_limit) : '',
        details: d.details || '',
        is_active: d.is_active !== false,
    });

    const loadExisting = async (ev, draftDivisions = null) => {
        const prizeBreakdown = parsePrizeBreakdownField(ev.prize_money_breakdown);
        setShowPrizeBreakdown(prizeBreakdown.length > 0);
        const rawCourt = ev.indoor_outdoor
            || (['Indoor', 'Outdoor', 'Mixed', 'Covered', 'Indoor & Outdoor'].includes(ev.courts) ? ev.courts : '')
            || 'Outdoor';
        const courtType = rawCourt === 'Indoor & Outdoor' ? 'Mixed'
            : rawCourt === 'Covered' ? 'Outdoor'
            : rawCourt;
        const drawReleased = (() => {
            const v = ev.draw_released || '';
            if (!v) return '';
            if (v.includes('T')) return toLocalInput(v) || v.substring(0, 16);
            // Date-only legacy values → noon local for the datetime picker
            return `${String(v).substring(0, 10)}T12:00`;
        })();
        setForm({
            ...blankForm,
            ...Object.fromEntries(Object.keys(blankForm).map((k) => [k, ev[k] ?? blankForm[k]])),
            start_date: ev.start_date ? ev.start_date.substring(0, 10) : '',
            end_date: ev.end_date ? ev.end_date.substring(0, 10) : '',
            registration_opens_at: toLocalInput(ev.registration_opens_at),
            registration_closes_at: toLocalInput(ev.registration_closes_at),
            draw_released: drawReleased,
            prize_money_total: ev.prize_money_total != null ? String(ev.prize_money_total) : '',
            prize_money_breakdown: prizeBreakdown,
            sponsor_logos: Array.isArray(ev.sponsor_logos) ? ev.sponsor_logos : [],
            is_visible: ev.is_visible !== false,
            allow_payments: ev.allow_payments ?? true,
            finance_managed: ev.finance_managed ?? true,
            golden_point: resolveScoringPoint(ev) === 'golden',
            scoring_point: resolveScoringPoint(ev),
            is_league: !!ev.is_league,
            max_teams_capacity: ev.max_teams_capacity != null ? String(ev.max_teams_capacity) : '',
            partner_requirement: ev.partner_requirement || 'Required',
            back_draw_options: ev.back_draw_options || 'Plate Included',
            event_co_admins: Array.isArray(ev.event_co_admins) ? ev.event_co_admins.join(', ') : (ev.event_co_admins || ''),
            indoor_outdoor: courtType,
            courts: courtType,
            courts_count: ev.courts_count != null && ev.courts_count !== '' ? String(ev.courts_count) : '',
            allow_temporary_license: ev.allow_temporary_license !== false,
            license_required_default: !!ev.license_required_default,
            entry_fee_notes: ev.entry_fee_notes || '',
            organisation_id: ev.organisation_id || null,
        });
        // Prefer the linked organisation profile logo over a stale event.organizer_logo_url
        // (that field often still holds a SAPA mark from older edits).
        if (ev.organisation_id) {
            const { data: linkedOrg } = await supabase
                .from('organisations')
                .select('logo_url')
                .eq('id', ev.organisation_id)
                .maybeSingle();
            if (linkedOrg?.logo_url) {
                setForm((prev) => ({ ...prev, organizer_logo_url: linkedOrg.logo_url }));
            }
        } else if (organization?.logo_url) {
            setForm((prev) => ({ ...prev, organizer_logo_url: organization.logo_url }));
        }
        if (draftDivisions && draftDivisions.length > 0) {
            setDivisions(draftDivisions.map((d, i) => mapDivisionRow(d, d.id || `draft_${i}`)));
            return;
        }
        const { data, error } = await supabase
            .from('tournament_divisions')
            .select('*')
            .eq('event_id', ev.id)
            .order('sort_order', { ascending: true });
        if (!error && data && data.length > 0) {
            setDivisions(data.map((d) => mapDivisionRow(d, d.id)));
        } else {
            setDivisions([emptyDivision(!!ev.license_required_default, resolveScoringPoint(ev))]);
        }
    };

    const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

    const handleInput = (e) => {
        const { name, value, type, checked } = e.target;
        const val = type === 'checkbox' ? checked : value;
        if (name === 'registration_closes_at') regCloseTouchedRef.current = true;
        if (name === 'registration_opens_at') regOpenTouchedRef.current = true;
        if (name === 'points') pointsTouchedRef.current = true;
        setForm((prev) => {
            const next = { ...prev, [name]: val };
            if (name === 'event_name' && !editingEvent) next.slug = slugify(value);
            // When start date changes, default the end date to match so the picker
            // opens on the right month (only if empty or before the new start date).
            if (name === 'start_date' && val && (!prev.end_date || prev.end_date < val)) {
                next.end_date = val;
            }
            // Auto-set registration opens/closes for new events until user edits them.
            if (name === 'start_date' && val && !editingEvent) {
                if (!regCloseTouchedRef.current) next.registration_closes_at = mondayCloseFor(val);
                if (!regOpenTouchedRef.current) next.registration_opens_at = opensOneMonthBefore(val);
            }
            return next;
        });
    };

    const handleSapaStatusChange = (v) => {
        setForm((prev) => {
            const next = { ...prev, sapa_status: v };
            if (!editingEvent || !prev.points) {
                if (!pointsTouchedRef.current) {
                    next.points = SAPA_WINNER_POINTS[v] ?? '';
                }
            }
            // Always pre-populate the public badge text from the selected SAPA tier.
            next.organizer_badge_text = sapaBadgeText(v);
            return next;
        });
    };

    const handleCourtTypeChange = (v) => {
        setForm((prev) => ({ ...prev, indoor_outdoor: v, courts: v }));
    };

    const updateDivision = (key, patch) =>
        setDivisions((prev) => prev.map((d) => (d._key === key ? { ...d, ...patch } : d)));

    const addDivision = () => {
        const d = emptyDivision(form.license_required_default, form.scoring_point || 'golden');
        if (standardPrice !== '') d.entry_fee = standardPrice;
        setDivisions((prev) => [...prev, d]);
        setExpandedDivisionKey(d._key);
    };

    const duplicateDivision = (key) => {
        setDivisions((prev) => {
            const src = prev.find((d) => d._key === key);
            if (!src) return prev;
            const copy = {
                ...src,
                _key: Math.random().toString(36).slice(2),
                id: null,
                name: src.name ? `${src.name} (copy)` : '',
            };
            setExpandedDivisionKey(copy._key);
            const idx = prev.findIndex((d) => d._key === key);
            const next = [...prev];
            next.splice(idx + 1, 0, copy);
            return next;
        });
    };

    const removeDivision = (key) =>
        setDivisions((prev) => {
            const target = prev.find((d) => d._key === key);
            if (target?.id) setRemovedDivisionIds((ids) => [...ids, target.id]);
            const next = prev.filter((d) => d._key !== key);
            if (expandedDivisionKey === key) setExpandedDivisionKey(null);
            return next.length ? next : [emptyDivision(form.license_required_default)];
        });

    const applyStandardPrice = () => {
        if (standardPrice === '') return;
        setDivisions((prev) => prev.map((d) => ({ ...d, entry_fee: standardPrice })));
        toast.success('Standard price applied to all divisions');
    };

    const applyLicenseToAll = () => {
        setDivisions((prev) => prev.map((d) => ({ ...d, license_required: !!form.license_required_default })));
        toast.success('License rule applied to all divisions');
    };

    const applyScoringToAll = () => {
        const scoring = form.scoring_point || 'golden';
        setDivisions((prev) => prev.map((d) => ({ ...d, scoring_point: scoring })));
        toast.success(`${scoringPointLabel(scoring)} applied to all divisions`);
    };

    const applyCloseDateToAll = () => {
        const close = bulkCloseDate || form.registration_closes_at;
        if (!close) {
            toast.error('Set a registration close date first');
            return;
        }
        setDivisions((prev) => prev.map((d) => ({ ...d, entries_close_at: close })));
        toast.success('Close date applied to all divisions');
    };

    const createStandardSapaDivisions = () => {
        const status = form.sapa_status || 'None';
        const forceLicense = ['Major', 'Super Gold', 'Gold'].includes(status);
        const license = forceLicense ? true : !!form.license_required_default;
        const fee = standardPrice;
        let names;
        if (status === 'None') {
            names = ["Men's Open", "Ladies Open"];
        } else {
            names = [
                "Men's Open", "Men's Advanced", "Men's Intermediate",
                "Ladies Open", "Ladies Advanced", "Ladies Intermediate",
            ];
        }
        const rows = names.map((name) => ({
            ...emptyDivision(license, form.scoring_point || 'golden'),
            name,
            entry_fee: fee,
            gender: genderFromDivisionName(name),
            age_category: ageFromDivisionName(name) || 'Open',
            format: 'Knockout',
        }));
        setDivisions(rows);
        setExpandedDivisionKey(rows[0]?._key || null);
        toast.success(`Created ${rows.length} standard SAPA divisions`);
    };

    // Prize money breakdown rows
    const addPrizeRow = () =>
        setField('prize_money_breakdown', [...(form.prize_money_breakdown || []), { label: '', amount: '' }]);
    const updatePrizeRow = (idx, patch) =>
        setField('prize_money_breakdown', form.prize_money_breakdown.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    const removePrizeRow = (idx) =>
        setField('prize_money_breakdown', form.prize_money_breakdown.filter((_, i) => i !== idx));

    // Pull the divisions selected into the prize-money breakdown, keeping a row
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

    const handleOrgLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingOrgLogo(true);
            const url = await uploadToGallery(file, 'org-logos');
            setField('organizer_logo_url', url);
            toast.success('Organisation logo uploaded');
        } catch (err) {
            toast.error('Failed to upload organisation logo');
        } finally {
            setUploadingOrgLogo(false);
        }
    };

    const removeOrgLogo = () => setField('organizer_logo_url', '');

    const handleSponsorUpload = async (e, { asMain = false } = {}) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        try {
            setUploadingSponsor(true);
            const urls = [];
            for (const file of files) urls.push(await uploadToGallery(file, 'sponsors'));
            setForm((prev) => {
                const current = [...(prev.sponsor_logos || [])];
                if (asMain) {
                    // Replace or insert main sponsor at index 0
                    if (current.length === 0) return { ...prev, sponsor_logos: urls };
                    return { ...prev, sponsor_logos: [urls[0], ...current.slice(1), ...urls.slice(1)] };
                }
                return { ...prev, sponsor_logos: [...current, ...urls] };
            });
            toast.success(`${urls.length} sponsor logo(s) uploaded`);
        } catch (err) {
            toast.error('Failed to upload sponsor logo');
        } finally {
            setUploadingSponsor(false);
            e.target.value = '';
        }
    };

    const removeSponsor = (idx) =>
        setField('sponsor_logos', form.sponsor_logos.filter((_, i) => i !== idx));

    const moveSponsor = (idx, direction) => {
        setForm((prev) => {
            const list = [...(prev.sponsor_logos || [])];
            const next = idx + direction;
            if (next < 0 || next >= list.length) return prev;
            [list[idx], list[next]] = [list[next], list[idx]];
            return { ...prev, sponsor_logos: list };
        });
    };

    const validateBasics = () => {
        if (!form.event_name.trim()) { toast.error('Event name is required'); return false; }
        if (!form.start_date) { toast.error('Start date is required'); return false; }
        return true;
    };

    const validateDivisionsNamed = () => {
        const valid = divisions.filter((d) => d.name.trim());
        if (valid.length === 0) { toast.error('Add at least one division'); return false; }
        return true;
    };

    const confirmLowFees = () => {
        const named = divisions.filter((d) => d.name.trim());
        const low = named.filter((d) => {
            if (d.entry_fee === '' || d.entry_fee == null) return false;
            const fee = Number(d.entry_fee);
            return fee === 1 || (fee > 0 && fee < ENTRY_FEE_WARN_THRESHOLD);
        });
        if (low.length === 0) return true;
        return window.confirm(
            `Warning: ${low.length} division(s) have a low entry fee (under R${ENTRY_FEE_WARN_THRESHOLD} or R1). Continue anyway?`
        );
    };

    const validateDraft = () => {
        if (!form.event_name.trim()) { toast.error('Event name is required'); return false; }
        if (!form.start_date) { toast.error('Start date is required'); return false; }
        if (!form.end_date) { toast.error('End date is required'); return false; }
        if (!form.venue.trim()) { toast.error('Venue is required'); return false; }
        if (!form.city.trim()) { toast.error('City is required'); return false; }
        if (!validateDivisionsNamed()) return false;
        return true;
    };

    const validatePublish = () => {
        if (!validateDraft()) return false;
        if (!form.registration_opens_at) { toast.error('Registration opens date is required'); return false; }
        if (!form.registration_closes_at) { toast.error('Registration closes date is required'); return false; }
        if (!form.partner_requirement) { toast.error('Partner requirement is required'); return false; }
        if (typeof form.allow_payments !== 'boolean') { toast.error('Allow payments must be set'); return false; }
        if (!form.organizer_phone?.trim() && !form.organizer_email?.trim()) {
            toast.error('Contact phone or email is required');
            return false;
        }
        const named = divisions.filter((d) => d.name.trim());
        for (const d of named) {
            if (d.entry_fee === '' || d.entry_fee == null) {
                toast.error(`Entry fee required for division: ${d.name}`);
                return false;
            }
            if (!d.gender) {
                toast.error(`Gender required for division: ${d.name}`);
                return false;
            }
            if (!d.format) {
                toast.error(`Format required for division: ${d.name}`);
                return false;
            }
        }
        return true;
    };

    /** Non-toast review checklist for Step 6 — blocking errors + soft warnings. */
    const getReviewIssues = () => {
        const errors = [];
        const warnings = [];
        if (!form.event_name?.trim()) errors.push('Event name is required');
        if (!form.start_date) errors.push('Start date is required');
        if (!form.end_date) errors.push('End date is required');
        if (!form.venue?.trim()) errors.push('Venue is required');
        if (!form.city?.trim()) errors.push('City is required');
        if (!form.registration_opens_at) errors.push('Registration opens date is required');
        if (!form.registration_closes_at) errors.push('Registration closes date is required');
        if (!form.partner_requirement) errors.push('Partner requirement is required');
        if (!form.organizer_phone?.trim() && !form.organizer_email?.trim()) {
            errors.push('Contact phone or email is required');
        }
        const named = divisions.filter((d) => d.name.trim());
        if (named.length === 0) errors.push('Add at least one division');
        named.forEach((d) => {
            if (d.entry_fee === '' || d.entry_fee == null) errors.push(`Entry fee missing: ${d.name}`);
            if (!d.gender) errors.push(`Gender missing: ${d.name}`);
            if (!d.format) errors.push(`Format missing: ${d.name}`);
            const fee = Number(d.entry_fee);
            if (d.entry_fee !== '' && d.entry_fee != null && (fee === 1 || (fee > 0 && fee < ENTRY_FEE_WARN_THRESHOLD))) {
                warnings.push(`Low entry fee on ${d.name} (R${d.entry_fee})`);
            }
        });
        if (!form.custom_image_url) {
            warnings.push('No custom poster uploaded — SAPA tier default hero will be used on the site');
        }
        if (!form.organizer_badge_text?.trim() && form.sapa_status && form.sapa_status !== 'None') {
            warnings.push('No event subtitle / badge text set');
        }
        if (!(form.sponsor_logos || []).length) warnings.push('No sponsor logos added');
        if (!organization && !form.is_visible) warnings.push('Event is not visible on the website');
        if (form.registration_opens_at && form.registration_closes_at && form.registration_opens_at >= form.registration_closes_at) {
            warnings.push('Registration opens at or after the close date');
        }
        return { errors, warnings };
    };

    const formatDateTimeLabel = (val) => (val ? String(val).replace('T', ' ') : '—');

    const next = () => {
        if (step === 1 && !validateBasics()) return;
        if (step === 3 && !validateDivisionsNamed()) return;
        if (step === 3 && showPrizeBreakdown) syncPrizeBreakdownToDivisions();
        setStep((s) => Math.min(6, s + 1));
    };
    const back = () => setStep((s) => Math.max(1, s - 1));

    const buildPayload = (mode = 'publish') => {
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
            registration_opens_at: safeISOString(form.registration_opens_at),
            registration_closes_at: safeISOString(form.registration_closes_at),
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            start_time: form.start_time || null,
            end_time: form.end_time || null,
            max_teams_capacity: form.max_teams_capacity === '' || form.max_teams_capacity == null
                ? null : Number(form.max_teams_capacity),
            courts_count: form.courts_count === '' || form.courts_count == null
                ? null : Number(form.courts_count),
            indoor_outdoor: form.indoor_outdoor || form.courts || null,
            courts: form.indoor_outdoor || form.courts || null,
            event_co_admins: String(form.event_co_admins || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            allow_temporary_license: !!form.allow_temporary_license,
            license_required_default: !!form.license_required_default,
            entry_fee_notes: form.entry_fee_notes || null,
            scoring_point: form.scoring_point || 'golden',
            // Keep legacy boolean in sync for older UI / EventDetails fallback
            golden_point: (form.scoring_point || 'golden') === 'golden',
        };
        if (organization) {
            // Org-created events: tie to the org and stay hidden until a 4M
            // admin sanctions them (DB trigger also forces sanction_status).
            payload.organisation_id = organization.id;
            if (!editingEvent) {
                payload.is_visible = false;
                payload.featured_event = false;
                payload.show_in_recent_results = false;
            }
        } else {
            // Admin calendar: link to selected organisation (or clear)
            payload.organisation_id = form.organisation_id || null;
            if (!editingEvent) {
                // Admin create: draft stays hidden; publish is visible.
                payload.is_visible = mode === 'publish';
            } else if (mode === 'publish') {
                payload.is_visible = true;
            }
        }
        return payload;
    };

    const divisionRecord = (d, i) => ({
        name: d.name.trim(),
        entry_fee: d.entry_fee === '' ? 0 : Number(d.entry_fee),
        format: d.format || null,
        entries_close_at: safeISOString(d.entries_close_at),
        license_required: !!d.license_required,
        scoring_point: d.scoring_point || form.scoring_point || 'golden',
        age_category: d.age_category || null,
        gender: d.gender || null,
        suggested_level: d.suggested_level || null,
        entry_limit: d.entry_limit === '' || d.entry_limit == null ? null : Number(d.entry_limit),
        details: d.details?.trim() || null,
        sort_order: i,
        is_active: d.is_active !== false,
    });

    const persistDivisions = async (eventId) => {
        if (removedDivisionIds.length) {
            await supabase.from('tournament_divisions').delete().in('id', removedDivisionIds);
        }
        const rows = divisions.filter((d) => d.name.trim());
        for (let i = 0; i < rows.length; i++) {
            const d = rows[i];
            const record = { event_id: eventId, ...divisionRecord(d, i) };
            if (d.id) {
                const { error } = await supabase.from('tournament_divisions').update(record).eq('id', d.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('tournament_divisions').insert([record]);
                if (error) throw error;
            }
        }
    };

    const handleSave = async (mode = 'publish') => {
        if (mode === 'draft') {
            if (!validateDraft()) return;
        } else {
            if (!validatePublish()) return;
        }
        if (!confirmLowFees()) return;

        setSaving(true);
        try {
            const payload = buildPayload(mode);
            let eventId = editingEvent?.id;

            if (isAmendment) {
                // Store draft amendment only — live event data stays untouched
                // until a 4M admin approves. Divisions draft included.
                const divisionsDraft = divisions
                    .filter((d) => d.name.trim())
                    .map((d, i) => ({
                        id: d.id || null,
                        ...divisionRecord(d, i),
                    }));

                const { error } = await supabase
                    .from('calendar')
                    .update({
                        pending_changes: {
                            payload,
                            divisions: divisionsDraft,
                            removed_division_ids: removedDivisionIds,
                        },
                        pending_changes_status: 'pending',
                        pending_changes_notes: null,
                        pending_changes_submitted_at: new Date().toISOString(),
                    })
                    .eq('id', editingEvent.id);
                if (error) throw error;

                toast.success('Amendment submitted — awaiting 4M Padel approval. Your event stays live with its current details.');
                onSaved?.({ eventId, isNew: false, isAmendment: true, eventName: payload.event_name });
                onClose?.();
                return;
            }

            if (editingEvent) {
                // Keep existing slug on edit unless it's empty; if regenerating, stay unique
                if (!payload.slug) {
                    payload.slug = await ensureUniqueSlug(form.event_name, {
                        excludeId: editingEvent.id,
                        startDate: form.start_date,
                    });
                }
                const { error } = await supabase.from('calendar').update(payload).eq('id', editingEvent.id);
                if (error) throw error;
            } else {
                payload.slug = await ensureUniqueSlug(payload.slug || form.event_name, {
                    startDate: form.start_date,
                });
                const { data, error } = await supabase.from('calendar').insert([payload]).select('id').single();
                if (error) throw error;
                eventId = data.id;
            }
            await persistDivisions(eventId);
            toast.success(
                organization
                    ? (editingEvent ? 'Event updated — pending 4M Padel sanctioning' : 'Event submitted for 4M Padel sanctioning')
                    : (mode === 'draft'
                        ? (editingEvent ? 'Draft saved' : 'Draft created')
                        : (editingEvent ? 'Manual event updated' : 'Manual event created'))
            );
            onSaved?.({ eventId, isNew: !editingEvent, eventName: payload.event_name, mode });
            onClose?.();
        } catch (err) {
            console.error('Error saving manual event:', err);
            toast.error(`Failed to save: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const PanelHeader = ({ id, title }) => (
        <button
            type="button"
            onClick={() => togglePanel(id)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-left"
        >
            <span className="text-sm font-bold text-white">{title}</span>
            <ChevronDown size={16} className={`text-gray-400 transition-transform ${openPanels[id] ? 'rotate-180' : ''}`} />
        </button>
    );

    if (!isOpen) return null;

    const namedDivisions = divisions.filter((d) => d.name.trim());
    const reviewIssues = step === 6 ? getReviewIssues() : { errors: [], warnings: [] };

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
                    className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {editingEvent ? 'Edit Event' : 'Create Event'}
                            </h2>
                            <p className="text-xs text-gray-400">Step {step} of 6 — {STEPS[step - 1].label}</p>
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
                            <div className="space-y-4">
                                {/* Event Identity */}
                                <div className="space-y-2">
                                    <PanelHeader id="identity" title="Event Identity" />
                                    {openPanels.identity && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>Event Name *</label>
                                                <input name="event_name" value={form.event_name} onChange={handleInput} className={inputClass} required />
                                            </div>
                                            <div>
                                                <label className={labelClass}>SAPA Status</label>
                                                <SelectMenu value={form.sapa_status} onChange={handleSapaStatusChange} options={SAPA_STATUSES} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Event Series / Tag</label>
                                                <SelectMenu value={form.tournament_tag} onChange={(v) => setField('tournament_tag', v)} options={TOURNAMENT_TAGS} />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>Event subtitle / badge text</label>
                                                <input
                                                    name="organizer_badge_text"
                                                    value={form.organizer_badge_text}
                                                    onChange={handleInput}
                                                    placeholder="e.g. SAPA GOLD 1000"
                                                    className={inputClass}
                                                />
                                                <p className="text-[11px] text-gray-500 mt-1">Auto-filled from SAPA status — editable if needed.</p>
                                            </div>
                                            <div className="relative md:col-span-2" ref={orgSearchRef}>
                                                <label className={labelClass}>Organiser</label>
                                                <input
                                                    name="organizer_name"
                                                    value={form.organizer_name}
                                                    onChange={(e) => {
                                                        if (organization) {
                                                            setForm((prev) => ({ ...prev, organizer_name: e.target.value }));
                                                        } else {
                                                            handleOrganiserNameChange(e.target.value);
                                                        }
                                                    }}
                                                    onFocus={() => {
                                                        if (!organization && orgSuggestions.length > 0) setOrgSearchOpen(true);
                                                    }}
                                                    placeholder={organization ? undefined : 'Select an organisation or type a custom name…'}
                                                    autoComplete="off"
                                                    className={inputClass}
                                                    readOnly={!!organization}
                                                />
                                                {!organization && form.organisation_id && (
                                                    <div className="mt-1.5 flex items-center justify-between gap-2">
                                                        <p className="text-[11px] text-padel-green font-bold">
                                                            Linked to organisation page
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={clearOrganisationLink}
                                                            className="text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-red-400 transition-colors"
                                                        >
                                                            Unlink
                                                        </button>
                                                    </div>
                                                )}
                                                {!organization && !form.organisation_id && (
                                                    <p className="text-[11px] text-gray-500 mt-1">
                                                        Pick from the list to link their page, or type a custom organiser name.
                                                    </p>
                                                )}
                                                {!organization && orgSearchOpen && (orgSuggestions.length > 0 || searchingOrgs) && (
                                                    <div className="absolute z-30 left-0 right-0 mt-1 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                                                        {searchingOrgs && orgSuggestions.length === 0 ? (
                                                            <p className="px-4 py-3 text-xs text-gray-500">Searching…</p>
                                                        ) : (
                                                            orgSuggestions.map((org) => (
                                                                <button
                                                                    key={org.id}
                                                                    type="button"
                                                                    onClick={() => selectOrganisation(org)}
                                                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-left transition-colors"
                                                                >
                                                                    {org.logo_url ? (
                                                                        <img src={org.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover bg-white/5 shrink-0" />
                                                                    ) : (
                                                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-padel-green shrink-0">
                                                                            <Shield size={14} />
                                                                        </div>
                                                                    )}
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-bold text-white truncate">{org.name}</p>
                                                                        {org.slug && (
                                                                            <p className="text-[10px] text-gray-500 truncate">/{org.slug}</p>
                                                                        )}
                                                                    </div>
                                                                </button>
                                                            ))
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>Organisation Logo</label>
                                                {(organization || form.organisation_id) ? (
                                                    <>
                                                        <p className="text-[11px] text-gray-500 mb-2">
                                                            Linked org logo — shown first in the sponsor strip. SAPA branding appears next to the badge text on the event page.
                                                        </p>
                                                        {(organization?.logo_url || form.organizer_logo_url) ? (
                                                            <img
                                                                src={organization?.logo_url || form.organizer_logo_url}
                                                                alt="Organisation logo"
                                                                className="w-14 h-14 rounded-full object-cover border border-white/10 bg-white"
                                                            />
                                                        ) : (
                                                            <p className="text-xs text-gray-500 italic">This organisation has no logo yet — add one on their profile.</p>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <p className="text-[11px] text-gray-500 mb-2">
                                                            Shown first in the sponsor strip. SAPA branding appears next to the badge text on the event page.
                                                        </p>
                                                        <div className="flex items-center gap-4">
                                                            {form.organizer_logo_url && (
                                                                <div className="relative group">
                                                                    <img src={form.organizer_logo_url} alt="Organisation logo" className="w-14 h-14 rounded-full object-cover border border-white/10" />
                                                                    <button
                                                                        type="button"
                                                                        onClick={removeOrgLogo}
                                                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                            <label className="cursor-pointer bg-white/5 border border-dashed border-white/20 rounded-xl px-5 py-4 flex flex-col items-center gap-2 text-gray-300 hover:border-padel-green hover:text-padel-green transition-colors">
                                                                {uploadingOrgLogo ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />}
                                                                <span className="text-xs font-bold">{uploadingOrgLogo ? 'Uploading...' : 'Upload Logo'}</span>
                                                                <input type="file" accept="image/*" className="hidden" onChange={handleOrgLogoUpload} disabled={uploadingOrgLogo} />
                                                            </label>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Date & Venue */}
                                <div className="space-y-2">
                                    <PanelHeader id="venue" title="Date & Venue" />
                                    {openPanels.venue && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div>
                                                <label className={labelClass}>Start Date *</label>
                                                <input type="date" name="start_date" value={form.start_date} onChange={handleInput} className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>End Date *</label>
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
                                            <div className="relative md:col-span-2">
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
                                                    <div className="absolute z-20 left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg max-h-52 overflow-y-auto shadow-xl custom-scrollbar">
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
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>City</label>
                                                <input name="city" value={form.city} onChange={handleInput} className={inputClass} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Public Display */}
                                <div className="space-y-2">
                                    <PanelHeader id="display" title="Public Display" />
                                    {openPanels.display && (
                                        <div className="grid grid-cols-1 gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div>
                                                <label className={labelClass}>Event Poster</label>
                                                <div className="flex items-center gap-4">
                                                    <div className="relative shrink-0">
                                                        <img
                                                            src={form.custom_image_url || getDefaultBackgroundForStatus(form.sapa_status)}
                                                            alt="Poster"
                                                            className="w-24 h-32 object-cover rounded-lg border border-white/10"
                                                        />
                                                        {!form.custom_image_url && (
                                                            <span className="absolute bottom-1 left-1 right-1 text-center text-[8px] font-bold uppercase tracking-wider bg-black/70 text-padel-green rounded px-1 py-0.5">
                                                                {form.sapa_status && form.sapa_status !== 'None' ? `${form.sapa_status} default` : 'Default hero'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <label className="cursor-pointer bg-white/5 border border-dashed border-white/20 rounded-xl px-5 py-6 flex flex-col items-center gap-2 text-gray-300 hover:border-padel-green hover:text-padel-green transition-colors">
                                                        {uploadingPoster ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />}
                                                        <span className="text-xs font-bold">{uploadingPoster ? 'Uploading...' : 'Upload Poster'}</span>
                                                        <span className="text-[10px] text-gray-500 text-center max-w-[140px]">
                                                            Optional — SAPA tier default used on the site when empty
                                                        </span>
                                                        <input type="file" accept="image/*" className="hidden" onChange={handlePosterUpload} disabled={uploadingPoster} />
                                                    </label>
                                                </div>
                                            </div>
                                            <div>
                                                <label className={labelClass}>Event Description / About</label>
                                                <RichTextEditor value={form.description} onChange={(html) => setField('description', html)} placeholder="Describe the event..." />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 2 && (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-400">
                                    Core setup rules for registration — set these before configuring divisions.
                                </p>

                                {/* Registration Window */}
                                <div className="space-y-2">
                                    <PanelHeader id="regWindow" title="Registration Window" />
                                    {openPanels.regWindow && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className={labelClass} style={{ marginBottom: 0 }}>Registration Opens At</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            regOpenTouchedRef.current = true;
                                                            setField('registration_opens_at',
                                                                form.registration_opens_at ? '' : (
                                                                    opensOneMonthBefore(form.start_date) || (() => {
                                                                        const now = new Date();
                                                                        const offsetMs = now.getTimezoneOffset() * 60000;
                                                                        return new Date(now.getTime() - offsetMs).toISOString().substring(0, 16);
                                                                    })()
                                                                )
                                                            );
                                                        }}
                                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                                                            form.registration_opens_at ? 'bg-padel-green' : 'bg-white/20'
                                                        }`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                                            form.registration_opens_at ? 'translate-x-4.5' : 'translate-x-0.5'
                                                        }`} />
                                                    </button>
                                                </div>
                                                {form.registration_opens_at ? (
                                                    <input
                                                        type="datetime-local"
                                                        name="registration_opens_at"
                                                        value={form.registration_opens_at}
                                                        onChange={handleInput}
                                                        className={inputClass}
                                                    />
                                                ) : (
                                                    <div className="w-full bg-black/20 border border-white/5 rounded-lg px-4 py-3 text-gray-600 text-sm italic">
                                                        Open immediately
                                                    </div>
                                                )}
                                                <p className="text-[11px] text-gray-500 mt-1">
                                                    Default: 1 month before the event at 09:00.
                                                </p>
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className={labelClass} style={{ marginBottom: 0 }}>Registration Closes At</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            regCloseTouchedRef.current = true;
                                                            setField('registration_closes_at',
                                                                form.registration_closes_at ? '' : (
                                                                    mondayCloseFor(form.start_date) || (() => {
                                                                        const now = new Date();
                                                                        const offsetMs = now.getTimezoneOffset() * 60000;
                                                                        return new Date(now.getTime() - offsetMs).toISOString().substring(0, 16);
                                                                    })()
                                                                )
                                                            );
                                                        }}
                                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                                                            form.registration_closes_at ? 'bg-padel-green' : 'bg-white/20'
                                                        }`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                                            form.registration_closes_at ? 'translate-x-4.5' : 'translate-x-0.5'
                                                        }`} />
                                                    </button>
                                                </div>
                                                {form.registration_closes_at ? (
                                                    <input
                                                        type="datetime-local"
                                                        name="registration_closes_at"
                                                        value={form.registration_closes_at}
                                                        onChange={handleInput}
                                                        className={inputClass}
                                                    />
                                                ) : (
                                                    <div className="w-full bg-black/20 border border-white/5 rounded-lg px-4 py-3 text-gray-600 text-sm italic">
                                                        No deadline set
                                                    </div>
                                                )}
                                                <p className="text-[11px] text-gray-500 mt-1">
                                                    Default: Monday of the event week at 17:00 (global fallback).
                                                </p>
                                            </div>
                                            <p className="md:col-span-2 text-[11px] text-gray-500">
                                                Division-specific close dates override the global close date. Toggle off to clear, or edit the date/time when on.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Entry & Payment Settings */}
                                <div className="space-y-2">
                                    <PanelHeader id="entryPayment" title="Entry & Payment Settings" />
                                    {openPanels.entryPayment && (
                                        <div className="space-y-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <label className="flex items-center justify-between bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
                                                    <span className="text-sm font-medium text-gray-200">Allow payments</span>
                                                    <input type="checkbox" name="allow_payments" checked={!!form.allow_payments} onChange={handleInput} className="accent-padel-green w-5 h-5" />
                                                </label>
                                                {!organization && (
                                                    <label className="flex items-center justify-between bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
                                                        <span className="text-sm font-medium text-gray-200">Payment / finance manager</span>
                                                        <input type="checkbox" name="finance_managed" checked={!!form.finance_managed} onChange={handleInput} className="accent-padel-green w-5 h-5" />
                                                    </label>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-end gap-3">
                                                <div className="flex-1 min-w-[160px]">
                                                    <label className={labelClass}>Standard entry fee (R)</label>
                                                    <input
                                                        type="number"
                                                        value={standardPrice}
                                                        onChange={(e) => setStandardPrice(e.target.value)}
                                                        placeholder="e.g. 500"
                                                        className={inputClass}
                                                    />
                                                    <p className="text-[11px] text-gray-500 mt-1">Can be applied to all divisions.</p>
                                                </div>
                                                <button type="button" onClick={applyStandardPrice} className="bg-white/10 text-white px-4 py-3 rounded-lg font-bold hover:bg-white/20 transition-colors">
                                                    Apply to all
                                                </button>
                                            </div>
                                            <div>
                                                <label className={labelClass}>Entry fee notes</label>
                                                <textarea
                                                    name="entry_fee_notes"
                                                    value={form.entry_fee_notes}
                                                    onChange={handleInput}
                                                    rows={3}
                                                    placeholder="Optional notes about entry fees..."
                                                    className={inputClass}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Partner & Capacity Rules */}
                                <div className="space-y-2">
                                    <PanelHeader id="partnerCapacity" title="Partner & Capacity Rules" />
                                    {openPanels.partnerCapacity && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div>
                                                <label className={labelClass}>Partner Requirement</label>
                                                <select
                                                    name="partner_requirement"
                                                    value={form.partner_requirement}
                                                    onChange={handleInput}
                                                    className={inputClass}
                                                >
                                                    <option value="Required">Required</option>
                                                    <option value="Optional">Optional</option>
                                                    <option value="Not required">Not required</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelClass}>Maximum Teams / Entries</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    name="max_teams_capacity"
                                                    value={form.max_teams_capacity}
                                                    onChange={handleInput}
                                                    placeholder="Leave empty for unlimited"
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Plate / Back Draw</label>
                                                <select
                                                    name="back_draw_options"
                                                    value={form.back_draw_options}
                                                    onChange={handleInput}
                                                    className={inputClass}
                                                >
                                                    <option value="Plate Included">Plate Included (Guaranteed 2 Matches)</option>
                                                    <option value="No Plate">No Plate (Direct Elimination Only)</option>
                                                </select>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3">
                                                <div>
                                                    <label className={labelClass}>Deciding point (event default)</label>
                                                    <SelectMenu
                                                        value={form.scoring_point || 'golden'}
                                                        onChange={(v) => setField('scoring_point', v)}
                                                        options={SCORING_POINTS}
                                                    />
                                                    <p className="text-[11px] text-gray-500 mt-1">
                                                        Default for new divisions. Use Apply to push to existing ones.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={applyScoringToAll}
                                                    className="w-full border border-dashed border-white/20 text-gray-300 rounded-xl py-3 font-bold flex items-center justify-center gap-2 hover:border-padel-green hover:text-padel-green transition-colors"
                                                >
                                                    Apply scoring to all divisions
                                                </button>
                                                <label className="flex items-center justify-between bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
                                                    <span className="text-sm font-medium text-gray-200">League format</span>
                                                    <input type="checkbox" name="is_league" checked={!!form.is_league} onChange={handleInput} className="accent-padel-green w-5 h-5" />
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* License Defaults */}
                                <div className="space-y-2">
                                    <PanelHeader id="licenseDefaults" title="License Defaults" />
                                    {openPanels.licenseDefaults && (
                                        <div className="space-y-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <label className="flex items-center justify-between bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
                                                    <span className="text-sm font-medium text-gray-200">License required for event</span>
                                                    <input type="checkbox" name="license_required_default" checked={!!form.license_required_default} onChange={handleInput} className="accent-padel-green w-5 h-5" />
                                                </label>
                                                <label className="flex items-center justify-between bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
                                                    <span className="text-sm font-medium text-gray-200">Allow temporary license</span>
                                                    <input type="checkbox" name="allow_temporary_license" checked={!!form.allow_temporary_license} onChange={handleInput} className="accent-padel-green w-5 h-5" />
                                                </label>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={applyLicenseToAll}
                                                className="w-full border border-dashed border-white/20 text-gray-300 rounded-xl py-3 font-bold flex items-center justify-center gap-2 hover:border-padel-green hover:text-padel-green transition-colors"
                                            >
                                                <Shield size={16} /> Apply license requirement to all divisions
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-400">
                                    Compact cards by default — expand a division only when you need to edit it.
                                </p>

                                {/* Quick tools */}
                                <div className="space-y-2">
                                    <PanelHeader id="divTools" title="Quick Tools" />
                                    {openPanels.divTools && (
                                        <div className="space-y-3 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div className="flex flex-wrap items-end gap-3">
                                                <div className="flex-1 min-w-[140px]">
                                                    <label className={labelClass}>Standard Price (R)</label>
                                                    <input
                                                        type="number"
                                                        value={standardPrice}
                                                        onChange={(e) => setStandardPrice(e.target.value)}
                                                        placeholder="e.g. 500"
                                                        className={inputClass}
                                                    />
                                                </div>
                                                <button type="button" onClick={applyStandardPrice} className="bg-white/10 text-white px-3 py-3 rounded-lg text-xs font-bold hover:bg-white/20">Apply price</button>
                                                <button type="button" onClick={applyLicenseToAll} className="bg-white/10 text-white px-3 py-3 rounded-lg text-xs font-bold hover:bg-white/20">Apply license</button>
                                                <div className="flex-1 min-w-[160px]">
                                                    <label className={labelClass}>Close date (bulk)</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={bulkCloseDate || form.registration_closes_at || ''}
                                                        onChange={(e) => setBulkCloseDate(e.target.value)}
                                                        className={inputClass}
                                                    />
                                                </div>
                                                <button type="button" onClick={applyCloseDateToAll} className="bg-white/10 text-white px-3 py-3 rounded-lg text-xs font-bold hover:bg-white/20">Apply close</button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { createStandardSapaDivisions(); setExpandedDivisionKey(null); }}
                                                className="w-full border border-dashed border-padel-green/40 text-padel-green rounded-xl py-3 font-bold flex items-center justify-center gap-2 hover:bg-padel-green/10 transition-colors"
                                            >
                                                <Layers size={16} /> Create standard SAPA divisions
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Divisions list */}
                                <div className="space-y-2">
                                    <PanelHeader id="divisions" title={`Divisions (${divisions.length})`} />
                                    {openPanels.divisions && (
                                        <div className="space-y-3">
                                            {divisions.map((d) => {
                                                const expanded = expandedDivisionKey === d._key;
                                                const closeLabel = d.entries_close_at
                                                    ? d.entries_close_at.replace('T', ' ')
                                                    : (form.registration_closes_at ? `Global · ${form.registration_closes_at.replace('T', ' ')}` : '—');
                                                return (
                                                    <div key={d._key} className={['border rounded-xl overflow-hidden transition-colors bg-[#1a1a1a]', expanded ? 'border-padel-green/40' : 'border-white/10'].join(' ')}>
                                                        {/* Compact card summary */}
                                                        <div className="flex items-center gap-2 px-4 py-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedDivisionKey(expanded ? null : d._key)}
                                                                className="flex-1 text-left min-w-0"
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                                                    <p className="text-sm text-white font-semibold truncate">
                                                                        {d.name || 'Untitled division'}
                                                                    </p>
                                                                </div>
                                                                {!expanded && (
                                                                    <p className="text-[11px] text-gray-400 mt-1 pl-5 truncate">
                                                                        {[
                                                                            d.gender || null,
                                                                            d.age_category || null,
                                                                            d.format || null,
                                                                            `R${d.entry_fee || '0'}`,
                                                                            d.license_required ? 'License' : 'No license',
                                                                            scoringPointLabel(d.scoring_point || form.scoring_point),
                                                                            d.entry_limit ? `Cap ${d.entry_limit}` : null,
                                                                            `Closes ${closeLabel}`,
                                                                        ].filter(Boolean).join(' · ')}
                                                                    </p>
                                                                )}
                                                            </button>
                                                            <button type="button" onClick={() => setExpandedDivisionKey(expanded ? null : d._key)} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5" title={expanded ? 'Collapse' : 'Edit'}>
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button type="button" onClick={() => duplicateDivision(d._key)} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5" title="Duplicate">
                                                                <Copy size={14} />
                                                            </button>
                                                            <button type="button" onClick={() => removeDivision(d._key)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg" title="Delete">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>

                                                        {/* Expanded edit fields */}
                                                        {expanded && (
                                                            <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                                    <div className="md:col-span-1">
                                                                        <label className={labelClass}>Division name</label>
                                                                        <ComboBox value={d.name} onChange={(v) => {
                                                                            const inferredGender = genderFromDivisionName(v);
                                                                            const inferredAge = ageFromDivisionName(v);
                                                                            updateDivision(d._key, {
                                                                                name: v,
                                                                                // Always re-derive from the selected name so switching
                                                                                // divisions updates Gender / Age Category automatically.
                                                                                ...(inferredGender ? { gender: inferredGender } : {}),
                                                                                ...(inferredAge ? { age_category: inferredAge } : {}),
                                                                            });
                                                                        }} options={STANDARD_DIVISIONS} placeholder="e.g. Men's Open" />
                                                                    </div>
                                                                    <div>
                                                                        <label className={labelClass}>Gender</label>
                                                                        <SelectMenu value={d.gender} onChange={(v) => updateDivision(d._key, { gender: v })} options={GENDERS.map((g) => ({ value: g, label: g || '—' }))} placeholder="—" />
                                                                    </div>
                                                                    <div>
                                                                        <label className={labelClass}>Age category</label>
                                                                        <SelectMenu value={d.age_category} onChange={(v) => updateDivision(d._key, { age_category: v })} options={AGE_CATEGORIES.map((a) => ({ value: a, label: a || '—' }))} placeholder="—" />
                                                                    </div>
                                                                    <div>
                                                                        <label className={labelClass}>Format</label>
                                                                        <SelectMenu value={d.format} onChange={(v) => updateDivision(d._key, { format: v })} options={FORMATS} />
                                                                    </div>
                                                                    <div>
                                                                        <label className={labelClass}>Entry fee (R)</label>
                                                                        <input type="number" value={d.entry_fee} onChange={(e) => updateDivision(d._key, { entry_fee: e.target.value })} placeholder={standardPrice || 'From registration step'} className={inputClass} />
                                                                    </div>
                                                                    <div>
                                                                        <label className={labelClass}>Suggested level</label>
                                                                        <input value={d.suggested_level} onChange={(e) => updateDivision(d._key, { suggested_level: e.target.value })} placeholder="e.g. Playtomic 3.5–5" className={inputClass} />
                                                                    </div>
                                                                    <div>
                                                                        <label className={labelClass}>Entry limit / capacity</label>
                                                                        <input type="number" value={d.entry_limit} onChange={(e) => updateDivision(d._key, { entry_limit: e.target.value })} placeholder="Optional override" className={inputClass} />
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <label className={labelClass} style={{ marginBottom: 0 }}>Entries close override</label>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => updateDivision(d._key, {
                                                                                    entries_close_at: d.entries_close_at ? '' : (form.registration_closes_at || (() => {
                                                                                        const now = new Date();
                                                                                        const offsetMs = now.getTimezoneOffset() * 60000;
                                                                                        return new Date(now.getTime() - offsetMs).toISOString().substring(0, 16);
                                                                                    })())
                                                                                })}
                                                                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                                                                                    d.entries_close_at ? 'bg-padel-green' : 'bg-white/20'
                                                                                }`}
                                                                            >
                                                                                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                                                                    d.entries_close_at ? 'translate-x-4.5' : 'translate-x-0.5'
                                                                                }`} />
                                                                            </button>
                                                                        </div>
                                                                        {d.entries_close_at ? (
                                                                            <input
                                                                                type="datetime-local"
                                                                                value={d.entries_close_at}
                                                                                onChange={(e) => updateDivision(d._key, { entries_close_at: e.target.value })}
                                                                                className={inputClass}
                                                                            />
                                                                        ) : (
                                                                            <div className="w-full bg-black/20 border border-white/5 rounded-lg px-4 py-3 text-gray-600 text-sm italic">
                                                                                Uses global close date
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div>
                                                                        <label className={labelClass}>Deciding point</label>
                                                                        <SelectMenu
                                                                            value={d.scoring_point || form.scoring_point || 'golden'}
                                                                            onChange={(v) => updateDivision(d._key, { scoring_point: v })}
                                                                            options={SCORING_POINTS}
                                                                        />
                                                                    </div>
                                                                    <div className="flex items-end">
                                                                        <label className="flex items-center justify-between w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
                                                                            <span className="text-sm font-medium text-gray-200">License required</span>
                                                                            <input type="checkbox" checked={d.license_required} onChange={(e) => updateDivision(d._key, { license_required: e.target.checked })} className="accent-padel-green w-4 h-4" />
                                                                        </label>
                                                                    </div>
                                                                    <div className="md:col-span-3">
                                                                        <label className={labelClass}>Division notes</label>
                                                                        <RichTextEditor
                                                                            value={d.details ?? ''}
                                                                            onChange={(html) => updateDivision(d._key, { details: html })}
                                                                            placeholder="Optional notes about this division (format, eligibility, schedule, etc.)"
                                                                            minHeight={100}
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setExpandedDivisionKey(null)}
                                                                    className="w-full bg-white/5 text-gray-300 rounded-lg py-2.5 text-xs font-bold hover:bg-white/10 transition-colors"
                                                                >
                                                                    Done editing
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            <button type="button" onClick={addDivision} className="w-full border border-dashed border-white/20 text-gray-300 rounded-xl py-3 font-bold flex items-center justify-center gap-2 hover:border-padel-green hover:text-padel-green transition-colors">
                                                <Plus size={16} /> Add Division
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 4 && (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-400">
                                    Grouped tournament details — open a section to edit, leave the rest collapsed.
                                </p>

                                {/* Tournament Operations */}
                                <div className="space-y-2">
                                    <PanelHeader id="operations" title="Tournament Operations" />
                                    {openPanels.operations && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div>
                                                <label className={labelClass}>Match balls</label>
                                                <input name="balls" value={form.balls} onChange={handleInput} className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Court type</label>
                                                <SelectMenu
                                                    value={form.indoor_outdoor || form.courts}
                                                    onChange={handleCourtTypeChange}
                                                    options={['Indoor', 'Outdoor', 'Mixed']}
                                                    placeholder="Indoor / Outdoor / Mixed"
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Number of courts</label>
                                                <input type="number" name="courts_count" value={form.courts_count} onChange={handleInput} min="0" className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Draw release date/time</label>
                                                <input type="datetime-local" name="draw_released" value={form.draw_released} onChange={handleInput} className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Tournament director</label>
                                                <input name="tournament_director" value={form.tournament_director} onChange={handleInput} className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Referees</label>
                                                <input name="referees" value={form.referees} onChange={handleInput} placeholder="Optional" className={inputClass} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Points & Prize Money */}
                                <div className="space-y-2">
                                    <PanelHeader id="points" title="Points & Prize Money" />
                                    {openPanels.points && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div>
                                                <label className={labelClass}>Winner points</label>
                                                <input type="number" name="points" value={form.points} onChange={handleInput} placeholder="e.g. 1000" className={inputClass} />
                                                <p className="text-[11px] text-gray-500 mt-1">
                                                    Auto-filled from SAPA status — admin can override.
                                                </p>
                                            </div>
                                            <div>
                                                <label className={labelClass}>Prize money total (R)</label>
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
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>Points breakdown</label>
                                                <RichTextEditor value={form.points_breakdown} onChange={(html) => setField('points_breakdown', html)} placeholder="Optional — e.g. Winner: 1000 pts, Finalist: 750 pts..." />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>Prize money breakdown</label>
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
                                        </div>
                                    )}
                                </div>

                                {/* Rules & Policies */}
                                <div className="space-y-2">
                                    <PanelHeader id="rules" title="Rules & Policies" />
                                    {openPanels.rules && (
                                        <div className="space-y-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div>
                                                <label className={labelClass}>Sanctioning details</label>
                                                <RichTextEditor value={form.sanctioning_details} onChange={(html) => setField('sanctioning_details', html)} placeholder="Sanctioning information..." />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Specific rules and regulations</label>
                                                <RichTextEditor value={form.rules_regs} onChange={(html) => setField('rules_regs', html)} placeholder="List the rules and regulations..." />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Withdrawal and substitution policy</label>
                                                <RichTextEditor value={form.withdrawal_substitution} onChange={(html) => setField('withdrawal_substitution', html)} placeholder="Withdrawal and substitution policy..." />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Contact */}
                                <div className="space-y-2">
                                    <PanelHeader id="contact" title="Contact" />
                                    {openPanels.contact && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div>
                                                <label className={labelClass}>Contact person</label>
                                                <input name="contact_details" value={form.contact_details} onChange={handleInput} className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>WhatsApp / phone</label>
                                                <input name="organizer_phone" value={form.organizer_phone} onChange={handleInput} className={inputClass} />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>Contact email</label>
                                                <input name="organizer_email" value={form.organizer_email} onChange={handleInput} className={inputClass} />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>Event Co-Admins</label>
                                                <CoAdminsPicker
                                                    value={form.event_co_admins}
                                                    onChange={(v) => setField('event_co_admins', v)}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 5 && (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-400">
                                    Marketing and presentation only — registration settings live in earlier steps.
                                </p>

                                {/* Sponsors */}
                                <div className="space-y-2">
                                    <PanelHeader id="sponsors" title="Sponsors" />
                                    {openPanels.sponsors && (
                                        <div className="space-y-5 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div>
                                                <label className={labelClass}>Main sponsor logo</label>
                                                <p className="text-[11px] text-gray-500 mb-2">Shown first in the sponsor strip on the event page.</p>
                                                <div className="flex items-center gap-4">
                                                    {(form.sponsor_logos || [])[0] ? (
                                                        <div className="relative group">
                                                            <img src={form.sponsor_logos[0]} alt="Main sponsor" className="w-24 h-24 object-contain rounded-xl border border-padel-green/30 bg-white/5 p-2" />
                                                            <button
                                                                type="button"
                                                                onClick={() => removeSponsor(0)}
                                                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                    <label className="cursor-pointer bg-white/5 border border-dashed border-white/20 rounded-xl px-5 py-4 flex flex-col items-center gap-2 text-gray-300 hover:border-padel-green hover:text-padel-green transition-colors">
                                                        {uploadingSponsor ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />}
                                                        <span className="text-xs font-bold">{uploadingSponsor ? 'Uploading...' : ((form.sponsor_logos || [])[0] ? 'Replace main' : 'Upload main')}</span>
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className="hidden"
                                                            onChange={(e) => handleSponsorUpload(e, { asMain: true })}
                                                            disabled={uploadingSponsor}
                                                        />
                                                    </label>
                                                </div>
                                            </div>

                                            <div>
                                                <label className={labelClass}>Additional sponsor logos</label>
                                                <p className="text-[11px] text-gray-500 mb-2">Use the arrows to set display order (left → right after the main sponsor).</p>
                                                <div className="flex flex-wrap items-start gap-3">
                                                    {(form.sponsor_logos || []).slice(1).map((url, i) => {
                                                        const idx = i + 1;
                                                        return (
                                                            <div key={`${url}-${idx}`} className="relative group flex flex-col items-center gap-1">
                                                                <div className="relative">
                                                                    <img src={url} alt={`Sponsor ${idx}`} className="w-20 h-20 object-contain rounded-lg border border-white/10 bg-white/5 p-1" />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeSponsor(idx)}
                                                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => moveSponsor(idx, -1)}
                                                                        disabled={idx <= 0}
                                                                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 rounded hover:bg-white/5"
                                                                        title="Move earlier"
                                                                    >
                                                                        <ChevronUp size={14} />
                                                                    </button>
                                                                    <span className="text-[10px] text-gray-500 font-bold w-4 text-center">{idx + 1}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => moveSponsor(idx, 1)}
                                                                        disabled={idx >= (form.sponsor_logos || []).length - 1}
                                                                        className="p-1 text-gray-400 hover:text-white disabled:opacity-30 rounded hover:bg-white/5"
                                                                        title="Move later"
                                                                    >
                                                                        <ChevronDown size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    <label className="cursor-pointer bg-white/5 border border-dashed border-white/20 rounded-xl w-20 h-20 flex flex-col items-center justify-center gap-1 text-gray-300 hover:border-padel-green hover:text-padel-green transition-colors">
                                                        {uploadingSponsor ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                                                        <span className="text-[9px] font-bold">Add</span>
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            multiple
                                                            className="hidden"
                                                            onChange={(e) => handleSponsorUpload(e, { asMain: false })}
                                                            disabled={uploadingSponsor}
                                                        />
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Website Display */}
                                <div className="space-y-2">
                                    <PanelHeader id="websiteDisplay" title="Website Display" />
                                    {openPanels.websiteDisplay && (
                                        <div className="space-y-3 p-4 rounded-xl border border-white/10 bg-black/20">
                                            {organization ? (
                                                <div className="bg-padel-green/5 border border-padel-green/20 rounded-xl px-4 py-3 text-xs text-padel-green font-semibold">
                                                    {isAmendment
                                                        ? 'This event is already sanctioned. Your changes will be submitted as an amendment for 4M Padel approval — the event stays live with its current details until approved.'
                                                        : 'This event will be submitted to 4M Padel for sanctioning. It goes live on the calendar once approved.'}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {[
                                                        ['featured_event', 'Featured event'],
                                                        ['show_in_recent_results', 'Show in recent results'],
                                                        ['is_visible', 'Visible on website'],
                                                    ].map(([key, label]) => (
                                                        <label key={key} className="flex items-center justify-between bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
                                                            <span className="text-sm font-medium text-gray-200">{label}</span>
                                                            <input type="checkbox" name={key} checked={!!form[key]} onChange={handleInput} className="accent-padel-green w-5 h-5" />
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 6 && (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-400">
                                    Review everything below before publishing — fix any blocking issues first.
                                </p>

                                {/* Validation */}
                                {(reviewIssues.errors.length > 0 || reviewIssues.warnings.length > 0) ? (
                                    <div className="space-y-2">
                                        {reviewIssues.errors.length > 0 && (
                                            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 space-y-1.5">
                                                <p className="text-xs font-bold uppercase tracking-wide text-red-300 flex items-center gap-2">
                                                    <AlertTriangle size={14} /> Blocking issues ({reviewIssues.errors.length})
                                                </p>
                                                <ul className="space-y-1">
                                                    {reviewIssues.errors.map((msg) => (
                                                        <li key={msg} className="text-sm text-red-200">• {msg}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {reviewIssues.warnings.length > 0 && (
                                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-1.5">
                                                <p className="text-xs font-bold uppercase tracking-wide text-amber-300 flex items-center gap-2">
                                                    <AlertTriangle size={14} /> Warnings ({reviewIssues.warnings.length})
                                                </p>
                                                <ul className="space-y-1">
                                                    {reviewIssues.warnings.map((msg) => (
                                                        <li key={msg} className="text-sm text-amber-100/90">• {msg}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-padel-green/30 bg-padel-green/10 px-4 py-3 text-sm text-padel-green font-semibold flex items-center gap-2">
                                        <Check size={16} /> Ready to publish — no blocking issues found.
                                    </div>
                                )}

                                {/* Event Summary */}
                                <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wide">Event Summary</p>
                                    <div className="flex gap-4">
                                        <img
                                            src={form.custom_image_url || getDefaultBackgroundForStatus(form.sapa_status)}
                                            alt="Poster"
                                            className="w-24 h-32 object-cover rounded-lg border border-white/10 shrink-0"
                                        />
                                        <div className="min-w-0 flex-1 space-y-2 text-sm">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-white font-bold text-lg leading-tight">{form.event_name || 'Untitled event'}</p>
                                                {form.sapa_status && form.sapa_status !== 'None' && (
                                                    <span className={`text-[10px] font-black uppercase tracking-wide rounded-full px-2 py-0.5 ${sapaBadgeClass(form.sapa_status)}`}>{form.sapa_status}</span>
                                                )}
                                                {form.tournament_tag && form.tournament_tag !== 'None' && (
                                                    <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 bg-white/10 text-gray-300 border border-white/10">{form.tournament_tag}</span>
                                                )}
                                            </div>
                                            {form.organizer_badge_text && (
                                                <p className="text-xs text-padel-green font-semibold">{form.organizer_badge_text}</p>
                                            )}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-gray-300">
                                                <p><span className="text-gray-500">Dates:</span> {formatEventDates(form.start_date, form.end_date) || '—'}</p>
                                                <p><span className="text-gray-500">Venue:</span> {[form.venue, form.city].filter(Boolean).join(', ') || '—'}</p>
                                                <p><span className="text-gray-500">Reg opens:</span> {formatDateTimeLabel(form.registration_opens_at)}</p>
                                                <p><span className="text-gray-500">Reg closes:</span> {formatDateTimeLabel(form.registration_closes_at)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Division Summary */}
                                <div className="rounded-xl border border-white/10 bg-black/20 p-4 overflow-x-auto">
                                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wide mb-3">Division Summary</p>
                                    <table className="w-full text-sm text-left min-w-[640px]">
                                        <thead>
                                            <tr className="text-xs text-gray-500 border-b border-white/10">
                                                <th className="py-2 pr-3 font-bold">Division</th>
                                                <th className="py-2 pr-3 font-bold">Fee</th>
                                                <th className="py-2 pr-3 font-bold">Format</th>
                                                <th className="py-2 pr-3 font-bold">Entries close</th>
                                                <th className="py-2 pr-3 font-bold">License</th>
                                                <th className="py-2 font-bold">Capacity</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {namedDivisions.map((d) => {
                                                const closeLabel = d.entries_close_at
                                                    ? formatDateTimeLabel(d.entries_close_at)
                                                    : (form.registration_closes_at
                                                        ? `Global · ${formatDateTimeLabel(form.registration_closes_at)}`
                                                        : '—');
                                                return (
                                                    <tr key={d._key} className="border-t border-white/5 text-gray-300">
                                                        <td className="py-2.5 pr-3 text-white font-medium">{d.name}</td>
                                                        <td className="py-2.5 pr-3">R{d.entry_fee || 0}</td>
                                                        <td className="py-2.5 pr-3">{d.format || '—'}</td>
                                                        <td className="py-2.5 pr-3 whitespace-nowrap">{closeLabel}</td>
                                                        <td className="py-2.5 pr-3">{d.license_required ? 'Required' : 'No'}</td>
                                                        <td className="py-2.5">{d.entry_limit || '—'}</td>
                                                    </tr>
                                                );
                                            })}
                                            {namedDivisions.length === 0 && (
                                                <tr><td colSpan={6} className="py-3 text-gray-500 italic">No divisions yet</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Settings Summary */}
                                <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wide">Settings Summary</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                        <p className="text-gray-300"><span className="text-gray-500">Payments enabled:</span> {form.allow_payments ? 'Yes' : 'No'}</p>
                                        <p className="text-gray-300"><span className="text-gray-500">Partner requirement:</span> {form.partner_requirement || '—'}</p>
                                        <p className="text-gray-300"><span className="text-gray-500">Maximum teams / entries:</span> {form.max_teams_capacity || 'Unlimited'}</p>
                                        <p className="text-gray-300"><span className="text-gray-500">Plate / back draw:</span> {form.back_draw_options || '—'}</p>
                                        <p className="text-gray-300"><span className="text-gray-500">Deciding point:</span> {scoringPointLabel(form.scoring_point)}</p>
                                        {!organization && (
                                            <p className="text-gray-300"><span className="text-gray-500">Visible on website:</span> {form.is_visible ? 'Yes' : 'No'}</p>
                                        )}
                                    </div>
                                </div>

                                {organization && (
                                    <div className="bg-padel-green/5 border border-padel-green/20 rounded-xl px-4 py-3 text-xs text-padel-green font-semibold">
                                        {isAmendment
                                            ? 'Save Draft and Publish both submit an amendment for 4M Padel approval. Publish runs full validation.'
                                            : 'Save Draft and Publish both submit this event for 4M Padel sanctioning. Publish runs full validation.'}
                                    </div>
                                )}
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
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            {step < 6 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleSave('draft')}
                                        disabled={saving}
                                        className="px-4 py-2 rounded-xl font-bold text-gray-200 border border-white/15 hover:bg-white/5 flex items-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                        {saving ? 'Saving...' : 'Save Draft'}
                                    </button>
                                    <button type="button" onClick={next} className="bg-padel-green text-black px-5 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-white transition-colors">
                                        Next <ChevronRight size={16} />
                                    </button>
                                </>
                            )}
                            {step === 6 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleSave('draft')}
                                        disabled={saving}
                                        className="px-4 py-2 rounded-xl font-bold text-gray-200 border border-white/15 hover:bg-white/5 flex items-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                        {saving ? 'Saving...' : 'Save Draft'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowPreview(true)}
                                        className="px-4 py-2 rounded-xl font-bold text-gray-200 border border-white/15 hover:bg-white/5 flex items-center gap-2 transition-colors"
                                    >
                                        <Eye size={16} /> Preview Event Card
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSave('publish')}
                                        disabled={saving || reviewIssues.errors.length > 0}
                                        title={reviewIssues.errors.length > 0 ? 'Fix blocking issues before publishing' : undefined}
                                        className="bg-padel-green text-black px-5 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-white transition-colors disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                        {saving ? 'Saving...' : editingEvent ? 'Update Event' : 'Publish Event'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>

                {showPreview && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="fixed inset-0 z-[1200] bg-black/70 flex items-center justify-center p-4"
                        onClick={() => setShowPreview(false)}
                    >
                        <div
                            className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img
                                src={form.custom_image_url || getDefaultBackgroundForStatus(form.sapa_status)}
                                alt="Poster"
                                className="w-full h-48 object-cover"
                            />
                            <div className="p-4 space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-white font-bold text-lg">{form.event_name || 'Untitled event'}</h3>
                                    {form.sapa_status && form.sapa_status !== 'None' && (
                                        <span className={`text-[10px] font-black uppercase tracking-wide rounded-full px-2 py-0.5 ${sapaBadgeClass(form.sapa_status)}`}>{form.sapa_status}</span>
                                    )}
                                </div>
                                <p className="text-gray-400 text-sm">{formatEventDates(form.start_date, form.end_date) || 'Dates TBC'}</p>
                                <p className="text-gray-400 text-sm">{[form.venue, form.city].filter(Boolean).join(', ') || 'Venue TBC'}</p>
                                <button
                                    type="button"
                                    onClick={() => setShowPreview(false)}
                                    className="mt-2 w-full bg-white/10 text-white py-2 rounded-xl font-bold hover:bg-white/20"
                                >
                                    Close Preview
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </motion.div>
        </AnimatePresence>
    );
};

export default EventBuilder;
