import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    X, Save, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Plus, Trash2, UploadCloud, Loader2,
    Info, Layers, FileText, ImageIcon, Check, Eye, Copy, Pencil, ClipboardList, Shield, AlertTriangle,
    Bold, Italic, Underline, List, ListOrdered, Heading, UserPlus, RefreshCcw, ExternalLink, Repeat, Ban
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useClubs } from '../../hooks/useClubs';
import { useAdminPermissions } from '../../hooks/useAdminPermissions';
import { getDefaultBackgroundForStatus } from '../../utils/imageUtils';
import { buildRankedinTournamentUrl, downloadRankedinSkipReport, extractRankedinId } from '../../utils/rankedinLink';
import { loadGoogleMaps } from '../../utils/googleMaps';
import {
    isCalendarEventFinished,
    isRecentResultsAutoTier,
} from '../../utils/recentResults';

const DIVISION_GROUPS = [
    {
        label: 'Men & Ladies',
        items: [
            "Men's Open", "Men's Advanced", "Men's Intermediate",
            "Ladies Open", "Ladies Advanced", "Ladies Intermediate",
        ],
    },
    {
        label: 'Juniors',
        items: [
            "Boys U12", "Boys U14", "Boys U16", "Boys U18", "Boys U19", "Boys U21",
            "Girls U12", "Girls U14", "Girls U16", "Girls U18", "Girls U19", "Girls U21",
        ],
    },
];

const STANDARD_DIVISIONS = DIVISION_GROUPS.flatMap((g) => g.items);

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
    rankedin_class_id: null,
    ranking_tier_id: '',
    ranking_category: '',
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

/** Unique trimmed venue names, order preserved. */
const normalizeVenues = (list) => {
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(list) ? list : []) {
        const name = String(raw || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
};

const venuesDisplayLabel = (venues, city) => {
    const list = normalizeVenues(venues);
    const venuePart = list.join(' / ');
    return [venuePart, city].filter(Boolean).join(', ');
};

/** Prefer venues[]; fall back to single venue string. */
const venuesFromEvent = (ev) => {
    if (Array.isArray(ev?.venues) && ev.venues.length > 0) return normalizeVenues(ev.venues);
    if (ev?.venue?.trim()) return [ev.venue.trim()];
    return [];
};

const blankForm = {
    event_name: '',
    slug: '',
    organisation_id: null,
    organiser_name: 'SAPA',
    organiser_logo_url: '',
    organiser_badge_text: '',
    city: '',
    venue: '',
    venues: [],
    address: '',
    start_date: '',
    end_date: '',
    start_time: '17:00',
    end_time: '22:00',
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
    organiser_phone: '',
    organiser_email: '',
    organiser_website: '',
    // media
    custom_image_url: '', // cover / hero
    poster_image_url: '', // event poster (sponsors strip / modal)
    sponsor_logos: [],
    // settings
    registration_opens_at: '',
    registration_closes_at: '',
    early_bird_ends_at: '',
    early_bird_fee: '',
    rankings_updated_at: '',
    featured_event: false,
    is_visible: true,
    finance_managed: true,
    allow_payments: true,
    show_in_recent_results: false,
    allow_temporary_license: true,
    license_required_default: false,
    collect_tshirt_size: false,
    entry_fee_notes: '',
    // format & capacity
    golden_point: true,
    scoring_point: 'golden',
    is_league: false,
    max_teams_capacity: '',
    partner_requirement: 'Required',
    back_draw_options: 'Plate Included',
    event_co_admins: '',
    // RankedIn link (manual events stay is_manual; used for draws/results sync)
    rankedin_id: '',
    rankedin_url: '',
    // Weekly social nights (UI + persisted is_weekly / series_id on publish)
    is_weekly: false,
    weekly_count: 8,
    weekly_payment_policy: 'pay_now', // pay_now | allow_reserve
    series_id: null,
};

const SOCIAL_DEFAULTS = {
    description: `<p>This is a weekly social / club event hosted on 4M Padel. Register and pay on the event page to secure your spot.</p><p>Event details, format and any partner requirements are listed on this page. Please arrive on time and ready to play.</p>`,
    points: '',
    points_breakdown: '',
    sanctioning_details: '',
    rules_regs: `<p>By entering this event, players agree to follow the organiser’s house rules and the venue’s code of conduct. The organiser reserves the right to adjust format, schedule or entries to ensure a fair and enjoyable night.</p>`,
    withdrawal_substitution: `<p>Please contact the organiser if you need to withdraw. Refunds are at the organiser’s discretion unless otherwise stated.</p>`,
    cut_off_times: `<p>Registration closes at the time shown on the event card. Late entries may not be accepted once the session is full.</p>`,
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

/**
 * Shift a YYYY-MM-DD date by N days.
 * @param {string} dateStr
 * @param {number} days
 */
const addDaysToDate = (dateStr, days) => {
    if (!dateStr) return '';
    const d = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Shift a datetime-local value (YYYY-MM-DDTHH:mm) by N days.
 * @param {string} value
 * @param {number} days
 */
const addDaysToLocalDateTime = (value, days) => {
    if (!value) return '';
    const [datePart, timePart = '00:00'] = String(value).split('T');
    const nextDate = addDaysToDate(datePart, days);
    if (!nextDate) return '';
    return `${nextDate}T${timePart.slice(0, 5)}`;
};

/**
 * List of weekly occurrence dates from the first start date.
 * @param {string} startDate
 * @param {number} count
 */
const buildWeeklyDates = (startDate, count) => {
    const n = Math.min(26, Math.max(2, Number(count) || 8));
    const dates = [];
    for (let i = 0; i < n; i += 1) {
        dates.push(addDaysToDate(startDate, i * 7));
    }
    return dates.filter(Boolean);
};

/**
 * Fields that must stay unique / untouched when cascading a weekly series edit.
 */
const stripWeeklySiblingSharedPayload = (payload) => {
    const shared = { ...payload };
    delete shared.id;
    delete shared.slug;
    delete shared.created_at;
    delete shared.updated_at;
    delete shared.weekly_count;
    delete shared.pending_changes;
    delete shared.pending_changes_status;
    delete shared.pending_changes_notes;
    delete shared.pending_changes_submitted_at;
    delete shared.sanction_status;
    delete shared.rejection_notes;
    delete shared.start_date;
    delete shared.end_date;
    delete shared.event_dates;
    delete shared.registration_opens_at;
    delete shared.registration_closes_at;
    delete shared.early_bird_ends_at;
    return shared;
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

const EventBuilder = ({ isOpen, onClose, onSaved, editingEvent = null, organisation = null }) => {
    // Tracks the event currently being edited inside this session (survives first create
    // when the parent still has editingEvent=null, so Save can keep the modal open).
    const [workingEvent, setWorkingEvent] = useState(null);
    const activeEvent = workingEvent;
    // Org editing an already-sanctioned event → changes become a draft
    // amendment that a 4M admin must approve (event stays live meanwhile).
    const isAmendment = !!(organisation && activeEvent && activeEvent.sanction_status === 'approved');
    const isEditing = !!activeEvent?.id;
    const [step, setStep] = useState(1);
    const [form, setForm] = useState(blankForm);
    const [divisions, setDivisions] = useState([emptyDivision()]);
    const [rankingTiers, setRankingTiers] = useState([]);
    const [adminEmail, setAdminEmail] = useState(null);
    const [removedDivisionIds, setRemovedDivisionIds] = useState([]);
    const [standardPrice, setStandardPrice] = useState('');
    const [bulkCloseDate, setBulkCloseDate] = useState('');
    const [showPrizeBreakdown, setShowPrizeBreakdown] = useState(false);
    const [showEventDescription, setShowEventDescription] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [cancellationReason, setCancellationReason] = useState('');
    /** Sibling calendar rows for the weekly series being edited (sorted by start_date). */
    const [seriesSiblings, setSeriesSiblings] = useState([]);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [uploadingPoster, setUploadingPoster] = useState(false);
    const [uploadingOrgLogo, setUploadingOrgLogo] = useState(false);
    const [uploadingSponsor, setUploadingSponsor] = useState(false);
    const [expandedDivisionKey, setExpandedDivisionKey] = useState(null);
    const [divisionMultiOpen, setDivisionMultiOpen] = useState(false);
    const [pendingDivisionPicks, setPendingDivisionPicks] = useState([]);
    const divisionMultiRef = useRef(null);
    const [openPanels, setOpenPanels] = useState({
        identity: true, federation: true, venue: false, display: true, rankedin: false,
        regWindow: true, entryPayment: false, partnerCapacity: false, licenseDefaults: false,
        playerGifts: false,
        divTools: false, divisions: true,
        integrations: false, operations: true, points: false, rules: false, contact: false,
        organiserBrand: false, sponsors: true, websiteDisplay: false,
    });

    const { permissions } = useAdminPermissions(adminEmail);
    const isSuperAdmin = permissions?.role === 'super_admin';

    useEffect(() => {
        let active = true;
        supabase.auth.getUser().then(({ data }) => {
            if (active) setAdminEmail(data?.user?.email || null);
        });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        supabase.from('ranking_tiers').select('id, code, name, max_points, display_order')
            .eq('is_active', true).order('display_order')
            .then(({ data, error }) => {
                if (!error) setRankingTiers(data || []);
            });
    }, []);
    const [showPreview, setShowPreview] = useState(false);
    const [syncingRankedin, setSyncingRankedin] = useState(false);

    const { clubs } = useClubs();
    const [venueOpen, setVenueOpen] = useState(false);
    const [venueQuery, setVenueQuery] = useState('');
    const [orgSuggestions, setOrgSuggestions] = useState([]);
    const [orgSearchOpen, setOrgSearchOpen] = useState(false);
    const [searchingOrgs, setSearchingOrgs] = useState(false);
    const orgSearchRef = useRef(null);

    const addressInputRef = useRef(null);
    const autocompleteRef = useRef(null);
    // True once the user has manually set/cleared the registration deadline —
    // stops the start-date auto-fill from overwriting their choice.
    const regCloseTouchedRef = useRef(false);
    const regOpenTouchedRef = useRef(false);
    const pointsTouchedRef = useRef(false);

    const selectedVenues = useMemo(() => normalizeVenues(form.venues), [form.venues]);
    const selectedVenueKeys = useMemo(
        () => new Set(selectedVenues.map((v) => v.toLowerCase())),
        [selectedVenues],
    );
    const filteredClubs = useMemo(() => {
        const q = venueQuery.trim().toLowerCase();
        return clubs.filter((c) => {
            if (selectedVenueKeys.has(String(c.name || '').toLowerCase())) return false;
            if (!q) return true;
            return String(c.name || '').toLowerCase().includes(q);
        });
    }, [clubs, venueQuery, selectedVenueKeys]);

    const addVenue = (clubOrName) => {
        const selectedClub = typeof clubOrName === 'object' && clubOrName !== null ? clubOrName : null;
        const trimmed = String(selectedClub?.name || clubOrName || '').trim();
        if (!trimmed) return;
        setForm((prev) => {
            const next = normalizeVenues([...(prev.venues || []), trimmed]);
            return {
                ...prev,
                venues: next,
                venue: next.join(' / '),
                address: prev.address || selectedClub?.address || '',
                city: prev.city || selectedClub?.city || '',
            };
        });
        setVenueQuery('');
        setVenueOpen(false);
    };

    const removeVenue = (name) => {
        const key = String(name || '').toLowerCase();
        setForm((prev) => {
            const next = normalizeVenues(prev.venues).filter((v) => v.toLowerCase() !== key);
            return { ...prev, venues: next, venue: next.join(' / ') };
        });
    };

    // Admin calendar: type-ahead search for organisations to link the event
    useEffect(() => {
        if (!isOpen || organisation || form.organisation_id || !orgSearchOpen) return undefined;
        let cancelled = false;
        const q = (form.organiser_name || '').trim();
        const timer = setTimeout(async () => {
            setSearchingOrgs(true);
            try {
                const safe = q.replace(/[%_,]/g, ' ').trim();
                let query = supabase
                    .from('organisations')
                    .select('id, name, slug, logo_url, contact_email, contact_phone, website_url, status')
                    .eq('status', 'approved')
                    .order('name')
                    .limit(q.length >= 2 ? 20 : 50);
                if (q.length >= 2) query = query.ilike('name', `%${safe}%`);
                const { data, error } = await query;
                if (error) throw error;
                if (cancelled) return;
                setOrgSuggestions(data || []);
                setOrgSearchOpen(true);
            } catch (err) {
                if (cancelled) return;
                console.warn('Organisation search failed:', err);
                setOrgSuggestions([]);
            } finally {
                if (!cancelled) setSearchingOrgs(false);
            }
        }, q.length >= 2 ? 250 : 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [form.organiser_name, form.organisation_id, isOpen, organisation, orgSearchOpen]);

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
        setOrgSuggestions([]);
        setOrgSearchOpen(false);
        setForm((prev) => ({
            ...prev,
            organisation_id: org.id,
            organiser_name: org.name || prev.organiser_name,
            organiser_logo_url: org.logo_url || '',
            organiser_email: org.contact_email || prev.organiser_email,
            organiser_phone: org.contact_phone || prev.organiser_phone,
            organiser_website: org.website_url || prev.organiser_website,
        }));
    };

    const handleOrganiserNameChange = (value) => {
        setOrgSearchOpen(true);
        setForm((prev) => ({
            ...prev,
            organiser_name: value,
            organisation_id: null,
        }));
    };

    const clearOrganisationLink = () => {
        setForm((prev) => ({
            ...prev,
            organisation_id: null,
        }));
    };

    const togglePanel = (key) =>
        setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));

    // Google Places autocomplete on the address field (step 1, when Date & Venue is open).
    useEffect(() => {
        if (!isOpen || step !== 1 || (!openPanels.venue && !openPanels.identity)) return;
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
                        setForm((prev) => {
                            const existing = normalizeVenues(prev.venues);
                            // Only seed the first venue from Places when none selected yet.
                            const nextVenues = existing.length > 0
                                ? existing
                                : normalizeVenues(place.name ? [place.name] : []);
                            return {
                                ...prev,
                                address: place.formatted_address || prev.address,
                                city: city || prev.city,
                                venues: nextVenues,
                                venue: nextVenues.join(' / '),
                            };
                        });
                    });
                })
                .catch((err) => { console.warn('Google Maps failed to load:', err); });
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            autocompleteRef.current = null;
        };
    }, [isOpen, step, openPanels.venue, openPanels.identity]);

    useEffect(() => {
        if (!isOpen) {
            setWorkingEvent(null);
            setSeriesSiblings([]);
            return;
        }
        setWorkingEvent(editingEvent);
        setSeriesSiblings([]);
        setStep(1);
        setRemovedDivisionIds([]);
        setStandardPrice('');
        setBulkCloseDate('');
        setExpandedDivisionKey(null);
        setShowEventDescription(false);
        setOpenPanels({
            identity: true, venue: false, display: false,
            regWindow: true, entryPayment: false, partnerCapacity: false, licenseDefaults: false,
            playerGifts: false,
            divTools: false, divisions: true,
            operations: true, points: false, rules: false, contact: false,
            sponsors: true, websiteDisplay: false,
        });
        setShowPreview(false);
        setShowCancelConfirm(false);
        setCancelling(false);
        setCancellationReason('');
        setVenueQuery('');
        setVenueOpen(false);
        if (editingEvent) {
            regCloseTouchedRef.current = true;
            regOpenTouchedRef.current = true;
            pointsTouchedRef.current = true;
            // If the org has a pending amendment draft, resume editing THAT
            // draft rather than the live event data.
            const draft = (organisation && editingEvent.sanction_status === 'approved'
                && ['pending', 'rejected'].includes(editingEvent.pending_changes_status)
                && editingEvent.pending_changes?.payload)
                ? editingEvent.pending_changes : null;
            loadExisting(draft ? { ...editingEvent, ...draft.payload } : editingEvent, draft?.divisions || null);
        } else {
            regCloseTouchedRef.current = false;
            regOpenTouchedRef.current = false;
            pointsTouchedRef.current = false;
            // New events start with the standard SAPA content pre-filled (editable per event).
            const base = { ...blankForm, ...SAPA_DEFAULTS, is_weekly: false, weekly_count: 8 };
            // Org portal mode: prefill organiser identity from the organisation
            setForm(organisation ? {
                ...base,
                organisation_id: organisation.id,
                organiser_name: organisation.name || base.organiser_name,
                organiser_logo_url: organisation.logo_url || '',
                organiser_email: organisation.contact_email || '',
                organiser_phone: organisation.contact_phone || '',
                organiser_website: organisation.website_url || '',
            } : base);
            setDivisions([emptyDivision(base.license_required_default)]);
            setShowPrizeBreakdown(false);
        }
        // Only re-init when the modal opens or a different event is loaded — not after in-session saves.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, editingEvent?.id]);

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
        rankedin_class_id: d.rankedin_class_id || null,
        ranking_tier_id: d.ranking_tier_id || '',
        ranking_category: d.ranking_category != null ? String(d.ranking_category) : '',
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
            early_bird_ends_at: toLocalInput(ev.early_bird_ends_at),
            early_bird_fee: ev.early_bird_fee != null && ev.early_bird_fee !== '' ? String(ev.early_bird_fee) : '',
            rankings_updated_at: toLocalInput(ev.rankings_updated_at),
            draw_released: drawReleased,
            prize_money_total: ev.prize_money_total != null ? String(ev.prize_money_total) : '',
            prize_money_breakdown: prizeBreakdown,
            sponsor_logos: Array.isArray(ev.sponsor_logos) ? ev.sponsor_logos : [],
            is_visible: ev.is_visible !== false,
            allow_payments: ev.allow_payments ?? true,
            finance_managed: ev.finance_managed ?? true,
            show_in_recent_results: !!(ev.show_in_recent_results || ev.featured_result),
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
            collect_tshirt_size: !!ev.collect_tshirt_size,
            entry_fee_notes: ev.entry_fee_notes || '',
            organisation_id: ev.organisation_id || null,
            venues: venuesFromEvent(ev),
            venue: venuesFromEvent(ev).join(' / ') || ev.venue || '',
            rankedin_id: ev.rankedin_id ? String(ev.rankedin_id) : '',
            rankedin_url: ev.rankedin_url || '',
            is_weekly: !!ev.is_weekly,
            weekly_count: 8,
            weekly_payment_policy: ev.weekly_payment_policy === 'allow_reserve' ? 'allow_reserve' : 'pay_now',
            series_id: ev.series_id || null,
            entry_fee: ev.entry_fee != null && ev.entry_fee !== '' ? String(ev.entry_fee) : '',
        });
        if (ev.is_weekly && ev.series_id) {
            const { data: siblings, error: seriesErr } = await supabase
                .from('calendar')
                .select('id, start_date, slug, event_name')
                .eq('series_id', ev.series_id)
                .eq('is_weekly', true)
                .order('start_date', { ascending: true });
            if (seriesErr) {
                console.error('[EventBuilder] load series siblings failed:', seriesErr.message);
                setSeriesSiblings([]);
            } else {
                const list = siblings || [];
                setSeriesSiblings(list);
                setForm((prev) => ({
                    ...prev,
                    weekly_count: Math.max(2, list.length || 8),
                    series_id: ev.series_id,
                }));
            }
        } else {
            setSeriesSiblings([]);
        }
        // Prefer the linked organisation profile logo over a stale event.organiser_logo_url
        // (that field often still holds a SAPA mark from older edits).
        if (ev.organisation_id) {
            const { data: linkedOrg } = await supabase
                .from('organisations')
                .select('logo_url')
                .eq('id', ev.organisation_id)
                .maybeSingle();
            if (linkedOrg?.logo_url) {
                setForm((prev) => ({ ...prev, organiser_logo_url: linkedOrg.logo_url }));
            }
        } else if (organisation?.logo_url) {
            setForm((prev) => ({ ...prev, organiser_logo_url: organisation.logo_url }));
        }
        if (draftDivisions && draftDivisions.length > 0) {
            setDivisions(draftDivisions.map((d, i) => mapDivisionRow(d, d.id || `draft_${i}`)));
            if (ev.entry_fee != null && ev.entry_fee !== '') setStandardPrice(String(ev.entry_fee));
            return;
        }
        const { data, error } = await supabase
            .from('tournament_divisions')
            .select('*')
            .eq('event_id', ev.id)
            .order('sort_order', { ascending: true });
        if (!error && data && data.length > 0) {
            setDivisions(data.map((d) => mapDivisionRow(d, d.id)));
            if (ev.entry_fee != null && ev.entry_fee !== '') {
                setStandardPrice(String(ev.entry_fee));
            } else if (data[0]?.entry_fee != null) {
                setStandardPrice(String(data[0].entry_fee));
            }
        } else {
            setDivisions([emptyDivision(!!ev.license_required_default, resolveScoringPoint(ev))]);
            if (ev.entry_fee != null && ev.entry_fee !== '') setStandardPrice(String(ev.entry_fee));
        }
    };

    const setField = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

    /**
     * Enable/disable weekly social occurrence mode and apply non-SAPA defaults.
     * Turning OFF restores standard SAPA starter content for new events only.
     * @param {boolean} enabled
     */
    const setWeeklyMode = (enabled) => {
        setForm((prev) => {
            if (!enabled) {
                if (isEditing) {
                    return { ...prev, is_weekly: false };
                }
                // Restore the normal EventBuilder defaults so toggling weekly
                // on/off does not leave Social-only content on a SAPA draft.
                return {
                    ...prev,
                    ...SAPA_DEFAULTS,
                    is_weekly: false,
                    weekly_count: Math.min(26, Math.max(2, Number(prev.weekly_count) || 8)),
                    weekly_payment_policy: 'pay_now',
                    sapa_status: prev.sapa_status === 'None' ? 'None' : (prev.sapa_status || 'None'),
                    tournament_tag: prev.tournament_tag === 'Social' ? 'None' : (prev.tournament_tag || 'None'),
                    partner_requirement: 'Required',
                    allow_temporary_license: true,
                    license_required_default: false,
                    organiser_badge_text: '',
                };
            }
            const start = prev.start_date || '';
            const next = {
                ...prev,
                ...SOCIAL_DEFAULTS,
                is_weekly: true,
                weekly_count: Math.min(26, Math.max(2, Number(prev.weekly_count) || 8)),
                weekly_payment_policy: prev.weekly_payment_policy === 'allow_reserve' ? 'allow_reserve' : 'pay_now',
                end_date: start || prev.end_date,
                sapa_status: 'None',
                tournament_tag: 'Social',
                organiser_badge_text: prev.organiser_badge_text?.trim() ? prev.organiser_badge_text : 'Weekly',
                partner_requirement: 'Optional',
                license_required_default: false,
                allow_temporary_license: false,
                show_in_recent_results: false,
                featured_result: false,
                featured_event: false,
                // Private by default — share the event link; toggle on to list on /calendar
                is_visible: false,
                rankedin_id: '',
                rankedin_url: '',
                points: '',
                points_breakdown: '',
                prize_money_total: '',
                prize_money_breakdown: [],
                sanctioning_details: '',
            };
            if (organisation) {
                next.organiser_name = organisation.name || next.organiser_name;
            }
            if (start && !isEditing) {
                if (!regCloseTouchedRef.current) {
                    next.registration_closes_at = `${start}T${(prev.start_time || '17:00').slice(0, 5)}`;
                }
                if (!regOpenTouchedRef.current) {
                    next.registration_opens_at = `${addDaysToDate(start, -7)}T09:00`;
                }
            }
            return next;
        });
        if (enabled) {
            setDivisions((prev) => prev.map((d) => ({ ...d, license_required: false })));
            if (step === 3 || step === 4) setStep(2);
        }
    };

    const handleInput = (e) => {
        const { name, value, type, checked } = e.target;
        const val = type === 'checkbox' ? checked : value;
        if (name === 'registration_closes_at') regCloseTouchedRef.current = true;
        if (name === 'registration_opens_at') regOpenTouchedRef.current = true;
        if (name === 'points') pointsTouchedRef.current = true;
        setForm((prev) => {
            const next = { ...prev, [name]: val };
            if (name === 'event_name' && !isEditing) next.slug = slugify(value);
            // When start date changes, default the end date to match so the picker
            // opens on the right month (only if empty or before the new start date).
            if (name === 'start_date' && val && (!prev.end_date || prev.end_date < val || prev.is_weekly)) {
                next.end_date = val;
            }
            // Auto-set registration opens/closes for new events until user edits them.
            if (name === 'start_date' && val && !isEditing) {
                if (prev.is_weekly) {
                    if (!regCloseTouchedRef.current) {
                        next.registration_closes_at = `${val}T${(prev.start_time || '17:00').slice(0, 5)}`;
                    }
                    if (!regOpenTouchedRef.current) {
                        next.registration_opens_at = `${addDaysToDate(val, -7)}T09:00`;
                    }
                } else {
                    if (!regCloseTouchedRef.current) next.registration_closes_at = mondayCloseFor(val);
                    if (!regOpenTouchedRef.current) next.registration_opens_at = opensOneMonthBefore(val);
                }
            }
            // Keep homepage Recent Results flag in sync with Event Builder toggle.
            if (name === 'show_in_recent_results') {
                next.featured_result = !!val;
            }
            return next;
        });
    };

    const handleSapaStatusChange = (v) => {
        setForm((prev) => {
            const next = { ...prev, sapa_status: v };
            if (!isEditing || !prev.points) {
                if (!pointsTouchedRef.current) {
                    next.points = SAPA_WINNER_POINTS[v] ?? '';
                }
            }
            // Always pre-populate the public badge text from the selected SAPA tier.
            next.organiser_badge_text = sapaBadgeText(v);
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

    const buildDivisionFromName = (name) => {
        const status = form.sapa_status || 'None';
        const forceLicense = ['Major', 'Super Gold', 'Gold'].includes(status);
        const license = forceLicense ? true : !!form.license_required_default;
        return {
            ...emptyDivision(license, form.scoring_point || 'golden'),
            name,
            entry_fee: standardPrice !== '' ? standardPrice : '',
            gender: genderFromDivisionName(name),
            age_category: ageFromDivisionName(name) || 'Open',
            format: 'Knockout',
        };
    };

    const namedDivisionCount = useMemo(
        () => divisions.filter((d) => d.name.trim()).length,
        [divisions],
    );

    const openDivisionMultiSelect = () => {
        const current = divisions.map((d) => d.name.trim()).filter(Boolean);
        setPendingDivisionPicks(current.filter((n) => STANDARD_DIVISIONS.includes(n)));
        setDivisionMultiOpen(true);
    };

    const togglePendingDivision = (name) => {
        setPendingDivisionPicks((prev) => (
            prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
        ));
    };

    const applyPendingDivisions = () => {
        if (pendingDivisionPicks.length === 0) {
            toast.error('Select at least one division');
            return;
        }
        const pickSet = new Set(pendingDivisionPicks);
        const removedIds = divisions
            .filter((d) => {
                const name = d.name.trim();
                return d.id && STANDARD_DIVISIONS.includes(name) && !pickSet.has(name);
            })
            .map((d) => d.id);
        if (removedIds.length) {
            setRemovedDivisionIds((ids) => [...new Set([...ids, ...removedIds])]);
        }

        const customOrKept = divisions.filter((d) => {
            const name = d.name.trim();
            if (!name) return false;
            if (!STANDARD_DIVISIONS.includes(name)) return true;
            return pickSet.has(name);
        });
        const existingNames = new Set(customOrKept.map((d) => d.name.trim()));
        const toAdd = pendingDivisionPicks
            .filter((n) => !existingNames.has(n))
            .map(buildDivisionFromName);
        const next = [...customOrKept, ...toAdd];
        setDivisions(
            next.length
                ? next
                : [emptyDivision(form.license_required_default, form.scoring_point || 'golden')],
        );
        setDivisionMultiOpen(false);
        setExpandedDivisionKey(null);
        toast.success(`${pendingDivisionPicks.length} division${pendingDivisionPicks.length === 1 ? '' : 's'} ready — edit details below`);
    };

    const createStandardSapaDivisions = () => {
        const status = form.sapa_status || 'None';
        const names = status === 'None'
            ? ["Men's Open", "Ladies Open"]
            : [
                "Men's Open", "Men's Advanced", "Men's Intermediate",
                "Ladies Open", "Ladies Advanced", "Ladies Intermediate",
            ];
        setPendingDivisionPicks(names);
        setDivisionMultiOpen(true);
    };

    useEffect(() => {
        if (!divisionMultiOpen) return undefined;
        const onDown = (e) => {
            if (divisionMultiRef.current && !divisionMultiRef.current.contains(e.target)) {
                setDivisionMultiOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [divisionMultiOpen]);

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

    const handleCoverUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingCover(true);
            const url = await uploadToGallery(file, 'covers');
            setField('custom_image_url', url);
            toast.success('Cover photo uploaded');
        } catch (err) {
            toast.error('Failed to upload cover photo');
        } finally {
            setUploadingCover(false);
            e.target.value = '';
        }
    };

    const handlePosterUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingPoster(true);
            const url = await uploadToGallery(file, 'posters');
            setField('poster_image_url', url);
            toast.success('Event poster uploaded');
        } catch (err) {
            toast.error('Failed to upload event poster');
        } finally {
            setUploadingPoster(false);
            e.target.value = '';
        }
    };

    const handleOrgLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingOrgLogo(true);
            const url = await uploadToGallery(file, 'org-logos');
            setField('organiser_logo_url', url);
            toast.success('Organisation logo uploaded');
        } catch (err) {
            toast.error('Failed to upload organisation logo');
        } finally {
            setUploadingOrgLogo(false);
        }
    };

    const removeOrgLogo = () => setField('organiser_logo_url', '');

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
        if (form.is_weekly) {
            if (!form.start_time) { toast.error('Start time is required for weekly events'); return false; }
            if (!isEditing) {
                const count = Number(form.weekly_count);
                if (!Number.isFinite(count) || count < 2 || count > 26) {
                    toast.error('Weekly count must be between 2 and 26');
                    return false;
                }
            }
        }
        return true;
    };

    const validateDivisionsNamed = () => {
        if (form.is_weekly) return true;
        const valid = divisions.filter((d) => d.name.trim());
        if (valid.length === 0) { toast.error('Add at least one division'); return false; }
        return true;
    };

    /** Event-level fee required for weekly series (no divisions). */
    const resolveWeeklyEntryFee = () => {
        const raw = standardPrice !== '' ? standardPrice : form.entry_fee;
        if (raw === '' || raw == null) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    };

    const confirmLowFees = () => {
        if (form.is_weekly) {
            const fee = resolveWeeklyEntryFee();
            if (fee === 1 || (fee > 0 && fee < ENTRY_FEE_WARN_THRESHOLD)) {
                return window.confirm(
                    `Warning: entry fee is low (under R${ENTRY_FEE_WARN_THRESHOLD} or R1). Continue anyway?`
                );
            }
            return true;
        }
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
        if (form.is_weekly) {
            if (!form.start_time) { toast.error('Start time is required for weekly events'); return false; }
            if (!isEditing) {
                const count = Number(form.weekly_count);
                if (!Number.isFinite(count) || count < 2 || count > 26) {
                    toast.error('Weekly count must be between 2 and 26');
                    return false;
                }
            }
        } else if (!form.end_date) {
            toast.error('End date is required');
            return false;
        }
        if (!normalizeVenues(form.venues).length) { toast.error('Add at least one venue'); return false; }
        if (!form.city.trim()) { toast.error('City is required'); return false; }
        if (!form.is_weekly && !validateDivisionsNamed()) return false;
        return true;
    };

    const validatePublish = () => {
        if (!validateDraft()) return false;
        if (!form.registration_opens_at) { toast.error('Registration opens date is required'); return false; }
        if (!form.registration_closes_at) { toast.error('Registration closes date is required'); return false; }
        if (!form.partner_requirement) { toast.error('Partner requirement is required'); return false; }
        if (typeof form.allow_payments !== 'boolean') { toast.error('Allow payments must be set'); return false; }
        if (!form.organiser_phone?.trim() && !form.organiser_email?.trim()) {
            toast.error('Contact phone or email is required');
            return false;
        }
        if (form.is_weekly) {
            const fee = resolveWeeklyEntryFee();
            if (fee === null || fee < 0) {
                toast.error('Entry fee is required for weekly events');
                return false;
            }
            return true;
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
        if (form.is_weekly) {
            if (!form.start_time) errors.push('Start time is required for weekly events');
            if (!isEditing) {
                const count = Number(form.weekly_count);
                if (!Number.isFinite(count) || count < 2 || count > 26) {
                    errors.push('Weekly count must be between 2 and 26');
                }
            }
            const fee = resolveWeeklyEntryFee();
            if (fee === null || fee < 0) errors.push('Entry fee is required');
            else if (fee === 1 || (fee > 0 && fee < ENTRY_FEE_WARN_THRESHOLD)) {
                warnings.push(`Low entry fee (R${fee})`);
            }
        } else if (!form.end_date) {
            errors.push('End date is required');
        }
        if (!normalizeVenues(form.venues).length) errors.push('Add at least one venue');
        if (!form.city?.trim()) errors.push('City is required');
        if (!form.registration_opens_at) errors.push('Registration opens date is required');
        if (!form.registration_closes_at) errors.push('Registration closes date is required');
        if (!form.partner_requirement) errors.push('Partner requirement is required');
        if (!form.organiser_phone?.trim() && !form.organiser_email?.trim()) {
            errors.push('Contact phone or email is required');
        }
        if (!form.is_weekly) {
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
        }
        if (!form.custom_image_url) {
            warnings.push(form.is_weekly
                ? 'No custom poster uploaded — a default hero will be used'
                : 'No custom poster uploaded — SAPA tier default hero will be used on the site');
        }
        if (!form.is_weekly && !form.organiser_badge_text?.trim() && form.sapa_status && form.sapa_status !== 'None') {
            warnings.push('No event subtitle / badge text set');
        }
        if (!(form.sponsor_logos || []).length) warnings.push('No sponsor logos added');
        if (!organisation && !form.is_visible) warnings.push('Event is not visible on the website');
        if (form.registration_opens_at && form.registration_closes_at && form.registration_opens_at >= form.registration_closes_at) {
            warnings.push('Registration opens at or after the close date');
        }
        if (form.early_bird_ends_at && form.registration_closes_at && form.early_bird_ends_at > form.registration_closes_at) {
            errors.push('Early bird end must be on or before registration closes');
        }
        if (form.early_bird_ends_at && (form.early_bird_fee === '' || form.early_bird_fee == null)) {
            errors.push('Early bird fee is required when an early bird end date is set');
        }
        if ((form.early_bird_fee !== '' && form.early_bird_fee != null) && !form.early_bird_ends_at) {
            errors.push('Early bird end date is required when an early bird fee is set');
        }
        return { errors, warnings };
    };

    const formatDateTimeLabel = (val) => (val ? String(val).replace('T', ' ') : '—');

    const next = () => {
        if (step === 1 && !validateBasics()) return;
        if (step === 3 && !form.is_weekly && !validateDivisionsNamed()) return;
        if (step === 3 && !form.is_weekly && showPrizeBreakdown) syncPrizeBreakdownToDivisions();
        setStep((s) => {
            let n = Math.min(6, s + 1);
            // Weekly: skip Divisions (3) and Tournament Info (4)
            if (form.is_weekly && (n === 3 || n === 4)) n = 5;
            return n;
        });
    };
    const back = () => {
        setStep((s) => {
            let n = Math.max(1, s - 1);
            if (form.is_weekly && (n === 3 || n === 4)) n = 2;
            return n;
        });
    };

    const buildPayload = (mode = 'publish') => {
        const venues = normalizeVenues(form.venues);
        const isWeekly = !!form.is_weekly;
        const linkedRankedinId = isWeekly
            ? null
            : (extractRankedinId(form.rankedin_id) || extractRankedinId(form.rankedin_url));
        const endDate = isWeekly ? (form.start_date || form.end_date) : form.end_date;
        const weeklyFee = isWeekly ? resolveWeeklyEntryFee() : null;
        const payload = {
            ...form,
            is_manual: true,
            is_weekly: isWeekly,
            weekly_payment_policy: isWeekly
                ? (form.weekly_payment_policy === 'allow_reserve' ? 'allow_reserve' : 'pay_now')
                : 'pay_now',
            entry_fee: isWeekly
                ? (weeklyFee ?? 0)
                : (form.entry_fee === '' || form.entry_fee == null ? null : Number(form.entry_fee)),
            slug: form.slug || slugify(form.event_name),
            venues,
            venue: venues.join(' / '),
            event_dates: formatEventDates(form.start_date, endDate),
            points: isWeekly || form.points === '' || form.points == null ? null : String(form.points),
            prize_money_total: form.prize_money_total === '' ? null : Number(form.prize_money_total),
            prize_money_breakdown: (form.prize_money_breakdown || [])
                .filter((r) => r.label && r.amount)
                .map((r) => ({ label: r.label, amount: r.amount })),
            registration_opens_at: safeISOString(form.registration_opens_at),
            registration_closes_at: safeISOString(form.registration_closes_at),
            early_bird_ends_at: safeISOString(form.early_bird_ends_at),
            early_bird_fee: form.early_bird_fee === '' || form.early_bird_fee == null
                ? null
                : Number(form.early_bird_fee),
            rankings_updated_at: isWeekly ? null : safeISOString(form.rankings_updated_at),
            start_date: form.start_date || null,
            end_date: endDate || null,
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
            allow_temporary_license: isWeekly ? false : !!form.allow_temporary_license,
            license_required_default: isWeekly ? false : !!form.license_required_default,
            collect_tshirt_size: !!form.collect_tshirt_size,
            entry_fee_notes: form.entry_fee_notes || null,
            custom_image_url: form.custom_image_url || null,
            poster_image_url: form.poster_image_url || null,
            scoring_point: form.scoring_point || 'golden',
            // Keep legacy boolean in sync for older UI / EventDetails fallback
            golden_point: (form.scoring_point || 'golden') === 'golden',
            rankedin_id: linkedRankedinId || null,
            rankedin_url: linkedRankedinId
                ? (form.rankedin_url?.includes(`/${linkedRankedinId}`)
                    ? form.rankedin_url
                    : buildRankedinTournamentUrl(linkedRankedinId, form.slug || form.event_name))
                : null,
            sapa_status: isWeekly ? 'None' : form.sapa_status,
            tournament_tag: isWeekly ? 'Social' : form.tournament_tag,
        };
        // UI-only — never send to calendar table
        delete payload.weekly_count;
        // Never invent a series for normal events
        if (!isWeekly) {
            delete payload.series_id;
            delete payload.weekly_payment_policy;
        } else {
            payload.series_id = form.series_id || activeEvent?.series_id || null;
        }

        if (organisation) {
            payload.organisation_id = organisation.id;
            if (!isEditing) {
                if (isWeekly && mode === 'publish') {
                    // Weekly: respect visibility toggle (default hidden for private links)
                    payload.is_visible = !!form.is_visible;
                    payload.sanction_status = 'approved';
                    payload.featured_event = false;
                    payload.show_in_recent_results = false;
                } else {
                    // Org-created events: stay hidden until 4M sanctions (DB trigger too).
                    payload.is_visible = false;
                    payload.featured_event = false;
                    payload.show_in_recent_results = false;
                }
            }
        } else {
            payload.organisation_id = form.organisation_id || null;
            if (!isEditing) {
                if (isWeekly) {
                    payload.is_visible = !!form.is_visible;
                    if (mode === 'publish') payload.sanction_status = 'approved';
                } else {
                    payload.is_visible = mode === 'publish';
                }
            } else if (mode === 'publish' && !isWeekly) {
                payload.is_visible = true;
            }
            // Weekly edits keep form.is_visible (cascade via persistWeeklySeriesUpdate)
        }

        // Finished Gold / Super Gold / Major events auto-enter Recent Results.
        if (!isWeekly && isRecentResultsAutoTier(payload.sapa_status) && isCalendarEventFinished(payload)) {
            payload.show_in_recent_results = true;
        }
        // Keep Calendar Manager + homepage flag aligned with the Event Builder toggle.
        payload.featured_result = !!payload.show_in_recent_results;

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
        // Preserve existing RankedIn class link; never clear on ordinary saves
        ...(d.rankedin_class_id ? { rankedin_class_id: d.rankedin_class_id } : {}),
        ranking_tier_id: d.ranking_tier_id || null,
        ranking_category: d.ranking_category === '' || d.ranking_category == null ? null : Number(d.ranking_category),
    });

    const handleRankedinIdChange = (value) => {
        const id = extractRankedinId(value);
        setForm((prev) => ({
            ...prev,
            rankedin_id: id || value.trim(),
            rankedin_url: id
                ? buildRankedinTournamentUrl(id, prev.slug || prev.event_name)
                : (prev.rankedin_url || ''),
        }));
    };

    const handleSyncToRankedin = async () => {
        const eventId = activeEvent?.id;
        if (!eventId) {
            toast.error('Save the event first, then sync to RankedIn');
            return;
        }
        const rankedinId = extractRankedinId(form.rankedin_id) || extractRankedinId(form.rankedin_url);
        if (!rankedinId) {
            toast.error('Paste a RankedIn tournament ID or URL first');
            setOpenPanels((p) => ({ ...p, rankedin: true }));
            return;
        }

        setSyncingRankedin(true);
        const toastId = toast.loading('Syncing with RankedIn…');
        try {
            // Persist the link before calling the edge function
            await supabase
                .from('calendar')
                .update({
                    rankedin_id: rankedinId,
                    rankedin_url: buildRankedinTournamentUrl(rankedinId, form.slug || form.event_name),
                })
                .eq('id', eventId);

            const { data, error } = await supabase.functions.invoke('sync-to-rankedin', {
                body: { eventId, rankedinId },
            });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.error || 'Sync failed');

            setForm((prev) => ({
                ...prev,
                rankedin_id: String(data.rankedinId || rankedinId),
                rankedin_url: data.rankedinUrl || prev.rankedin_url,
            }));
            await reloadDivisionsForEvent(eventId);

            const mappedCount = data.mapping?.mapped?.length || 0;
            const missing = data.mapping?.unmatchedLocal || [];
            const pushed = data.writePush?.pushed || 0;
            const pushSkipped = data.writePush?.skipped || [];
            const pushErrors = data.writePush?.errors || [];
            const detailsUpdated = data.detailsPush?.updated || [];
            const detailsErrors = data.detailsPush?.errors || [];
            const skipCounts = pushSkipped.reduce((acc, s) => {
                const key = s.reason || 'other';
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
            const skipSummary = Object.entries(skipCounts)
                .map(([reason, count]) => `${count} ${reason}`)
                .join(', ');
            if ((pushErrors.length > 0 && pushed === 0) || (detailsErrors.length > 0 && detailsUpdated.length === 0 && data.detailsPush?.status === 'error')) {
                toast.error(
                    detailsErrors[0] || pushErrors[0] || 'Sync push failed',
                    { id: toastId, duration: 8000 },
                );
            } else if (missing.length > 0) {
                toast.warning(
                    `Linked RankedIn #${data.rankedinId}. Mapped ${mappedCount} division(s). Create on RankedIn: ${missing.map((d) => d.divisionName).join(', ')}`,
                    { id: toastId, duration: 8000 },
                );
            } else {
                const detailsBit = detailsUpdated.length > 0
                    ? ` Details: ${detailsUpdated.join(', ')}.`
                    : (data.detailsPush?.status === 'noop' ? ' Details already up to date.' : '');
                const pushBit = data.writePush?.credentialsConfigured
                    ? (pushed > 0
                        ? ` Pushed ${pushed} paid team(s)${pushSkipped.length ? ` (${skipSummary})` : ''}.`
                        : (pushSkipped.length
                            ? ` No new teams pushed (${skipSummary}).`
                            : ' No paid doubles teams to push yet.'))
                    : ' Set RankedIn edge secrets to push paid entries.';
                toast.success(
                    `Linked RankedIn #${data.rankedinId} — ${mappedCount} division(s) mapped.${detailsBit}${pushBit}`,
                    { id: toastId, duration: 9000 },
                );
            }
            if (data.writePush || data.detailsPush) {
                console.info('[sync-to-rankedin]', { writePush: data.writePush, detailsPush: data.detailsPush });
            }
            if (pushSkipped.length > 0) {
                const rowCount = downloadRankedinSkipReport(pushSkipped, {
                    eventName: form.event_name || form.slug || `event-${eventId}`,
                    rankedinId: data.rankedinId || rankedinId,
                });
                if (rowCount > 0) {
                    toast.message(`Downloaded skip report (${rowCount} player row${rowCount === 1 ? '' : 's'})`, {
                        duration: 5000,
                    });
                }
            }
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to sync to RankedIn', { id: toastId });
        } finally {
            setSyncingRankedin(false);
        }
    };

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

    const reloadDivisionsForEvent = async (eventId) => {
        const { data, error } = await supabase
            .from('tournament_divisions')
            .select('*')
            .eq('event_id', eventId)
            .order('sort_order', { ascending: true });
        if (!error && data) {
            setDivisions(
                data.length > 0
                    ? data.map((d) => mapDivisionRow(d, d.id))
                    : [emptyDivision(!!form.license_required_default, form.scoring_point || 'golden')],
            );
        }
        setRemovedDivisionIds([]);
    };

    /**
     * Apply a weekly edit to every occurrence in the series.
     * Shared fields copy from the edited form; dates/reg windows stay week-offset
     * relative to the occurrence being edited.
     * @param {object} payload - built calendar payload for the edited occurrence
     * @param {{ id: number|string, start_date?: string, series_id?: string }} editedEvent
     */
    const persistWeeklySeriesUpdate = async (payload, editedEvent) => {
        const seriesId = payload.series_id || editedEvent.series_id || form.series_id;
        if (!seriesId) {
            const { error } = await supabase.from('calendar').update(payload).eq('id', editedEvent.id);
            if (error) throw error;
            return 1;
        }

        let siblings = seriesSiblings;
        if (!siblings.length) {
            const { data, error } = await supabase
                .from('calendar')
                .select('id, start_date, slug')
                .eq('series_id', seriesId)
                .eq('is_weekly', true)
                .order('start_date', { ascending: true });
            if (error) throw error;
            siblings = data || [];
            setSeriesSiblings(siblings);
        }
        if (!siblings.length) {
            const { error } = await supabase.from('calendar').update(payload).eq('id', editedEvent.id);
            if (error) throw error;
            return 1;
        }

        const editIdx = Math.max(0, siblings.findIndex((s) => String(s.id) === String(editedEvent.id)));
        const shared = stripWeeklySiblingSharedPayload(payload);
        shared.series_id = seriesId;
        shared.is_weekly = true;

        for (let j = 0; j < siblings.length; j += 1) {
            const sibling = siblings[j];
            const weekOffsetDays = (j - editIdx) * 7;
            const occurrenceDate = addDaysToDate(form.start_date, weekOffsetDays);
            const instancePayload = {
                ...shared,
                start_date: occurrenceDate,
                end_date: occurrenceDate,
                event_dates: formatEventDates(occurrenceDate, occurrenceDate),
                registration_opens_at: form.registration_opens_at
                    ? safeISOString(addDaysToLocalDateTime(form.registration_opens_at, weekOffsetDays))
                    : null,
                registration_closes_at: form.registration_closes_at
                    ? safeISOString(addDaysToLocalDateTime(form.registration_closes_at, weekOffsetDays))
                    : null,
                early_bird_ends_at: form.early_bird_ends_at
                    ? safeISOString(addDaysToLocalDateTime(form.early_bird_ends_at, weekOffsetDays))
                    : null,
            };
            // Keep existing slug so public links stay stable
            delete instancePayload.slug;

            const { error } = await supabase
                .from('calendar')
                .update(instancePayload)
                .eq('id', sibling.id);
            if (error) throw error;
        }
        return siblings.length;
    };

    /**
     * @param {'draft'|'publish'} mode
     * @param {{ stayOpen?: boolean }} options - stayOpen (default true) keeps the builder open after save
     */
    const handleSave = async (mode = 'publish', { stayOpen = true } = {}) => {
        if (mode === 'draft') {
            if (!validateDraft()) return;
        } else {
            if (!validatePublish()) return;
        }
        if (!confirmLowFees()) return;

        setSaving(true);
        const wasNew = !activeEvent?.id;
        try {
            const payload = buildPayload(mode);
            let eventId = activeEvent?.id;

            if (isAmendment && !form.is_weekly) {
                // Store draft amendment only — live event data stays untouched
                // until a 4M admin approves. Divisions draft included.
                // Weekly series skip this path — edits apply live across the series.
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
                    .eq('id', activeEvent.id);
                if (error) throw error;

                toast.success(
                    stayOpen
                        ? 'Amendment saved — awaiting 4M Padel approval. You can keep editing.'
                        : 'Amendment submitted — awaiting 4M Padel approval. Your event stays live with its current details.',
                );
                onSaved?.({ eventId, isNew: false, isAmendment: true, eventName: payload.event_name, stayOpen, mode });
                if (!stayOpen) onClose?.();
                return;
            }

            if (activeEvent?.id) {
                // Keep existing slug on edit unless it's empty; if regenerating, stay unique
                if (!payload.slug) {
                    payload.slug = await ensureUniqueSlug(form.event_name, {
                        excludeId: activeEvent.id,
                        startDate: form.start_date,
                    });
                }
                if (form.is_weekly) {
                    payload.series_id = payload.series_id || activeEvent.series_id || form.series_id || null;
                    const updatedCount = await persistWeeklySeriesUpdate(payload, {
                        id: activeEvent.id,
                        start_date: activeEvent.start_date || form.start_date,
                        series_id: payload.series_id,
                    });
                    eventId = activeEvent.id;
                    setWorkingEvent((prev) => ({
                        ...(prev || activeEvent || {}),
                        id: eventId,
                        event_name: payload.event_name,
                        slug: activeEvent.slug || payload.slug,
                        series_id: payload.series_id,
                        is_weekly: true,
                        sanction_status: prev?.sanction_status || activeEvent?.sanction_status || 'approved',
                    }));
                    toast.success(
                        updatedCount > 1
                            ? `Updated all ${updatedCount} weekly events in this series`
                            : 'Weekly event updated',
                    );
                    onSaved?.({
                        eventId,
                        isNew: false,
                        eventName: payload.event_name,
                        mode,
                        stayOpen,
                        seriesCount: updatedCount,
                    });
                    if (!stayOpen) onClose?.();
                    return;
                }
                const { error } = await supabase.from('calendar').update(payload).eq('id', activeEvent.id);
                if (error) throw error;
                await persistDivisions(eventId);
            } else if (form.is_weekly && mode === 'publish') {
                const weeklyDates = buildWeeklyDates(form.start_date, form.weekly_count);
                if (weeklyDates.length < 2) {
                    throw new Error('Weekly events need at least 2 dates');
                }
                const seriesId = (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                const divisionRows = divisions
                    .filter((d) => d.name.trim())
                    .map((d, i) => divisionRecord({ ...d, id: null }, i));
                const createdIds = [];
                for (let i = 0; i < weeklyDates.length; i += 1) {
                    const occurrenceDate = weeklyDates[i];
                    const dayOffset = i * 7;
                    const instancePayload = {
                        ...payload,
                        series_id: seriesId,
                        is_weekly: true,
                        start_date: occurrenceDate,
                        end_date: occurrenceDate,
                        event_dates: formatEventDates(occurrenceDate, occurrenceDate),
                        registration_opens_at: safeISOString(
                            addDaysToLocalDateTime(form.registration_opens_at, dayOffset),
                        ),
                        registration_closes_at: safeISOString(
                            addDaysToLocalDateTime(form.registration_closes_at, dayOffset),
                        ),
                        early_bird_ends_at: form.early_bird_ends_at
                            ? safeISOString(addDaysToLocalDateTime(form.early_bird_ends_at, dayOffset))
                            : null,
                        is_visible: !!payload.is_visible,
                        sanction_status: 'approved',
                    };
                    instancePayload.slug = await ensureUniqueSlug(
                        `${payload.slug || form.event_name}-${occurrenceDate}`,
                        { startDate: occurrenceDate },
                    );
                    const { data, error } = await supabase
                        .from('calendar')
                        .insert([instancePayload])
                        .select('id')
                        .single();
                    if (error) throw error;
                    createdIds.push(data.id);
                    if (divisionRows.length > 0) {
                        const { error: divErr } = await supabase
                            .from('tournament_divisions')
                            .insert(divisionRows.map((row) => ({ ...row, event_id: data.id })));
                        if (divErr) throw divErr;
                    }
                }
                eventId = createdIds[0];
                setWorkingEvent({
                    id: eventId,
                    event_name: payload.event_name,
                    slug: payload.slug,
                    sanction_status: 'approved',
                    is_weekly: true,
                    series_id: seriesId,
                });
                await reloadDivisionsForEvent(eventId);
                toast.success(`Created ${createdIds.length} weekly events`);
                onSaved?.({
                    eventId,
                    isNew: true,
                    eventName: payload.event_name,
                    mode,
                    stayOpen,
                    seriesCount: createdIds.length,
                });
                if (!stayOpen) onClose?.();
                return;
            } else {
                payload.slug = await ensureUniqueSlug(payload.slug || form.event_name, {
                    startDate: form.start_date,
                });
                const { data, error } = await supabase.from('calendar').insert([payload]).select('id').single();
                if (error) throw error;
                eventId = data.id;
                await persistDivisions(eventId);
            }

            // Stay in edit mode for this session and sync division IDs so the next save updates rows.
            setWorkingEvent((prev) => ({
                ...(prev || activeEvent || {}),
                id: eventId,
                event_name: payload.event_name,
                slug: payload.slug,
                sanction_status: prev?.sanction_status || activeEvent?.sanction_status
                    || (form.is_weekly ? 'approved' : (organisation ? 'pending' : undefined)),
            }));
            await reloadDivisionsForEvent(eventId);

            toast.success(
                organisation
                    ? (wasNew
                        ? (stayOpen ? 'Event saved — pending 4M Padel sanctioning. You can keep editing.' : 'Event submitted for 4M Padel sanctioning')
                        : (stayOpen ? 'Event saved — you can keep editing.' : 'Event updated — pending 4M Padel sanctioning'))
                    : (mode === 'draft'
                        ? (stayOpen ? 'Draft saved — you can keep editing.' : (wasNew ? 'Draft created' : 'Draft saved'))
                        : (stayOpen ? 'Event saved — you can keep editing.' : (wasNew ? 'Manual event created' : 'Manual event updated')))
            );
            onSaved?.({ eventId, isNew: wasNew, eventName: payload.event_name, mode, stayOpen });
            if (!stayOpen) onClose?.();
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

    const handleCancelEvent = async () => {
        if (!activeEvent?.id || cancelling) return;
        setCancelling(true);
        try {
            const { data, error } = await supabase.functions.invoke('paystack-refund', {
                body: {
                    action: 'cancel_event',
                    event_id: activeEvent.id,
                    cancellation_reason: cancellationReason.trim() || undefined,
                },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            const cancelledAt = new Date().toISOString();
            setWorkingEvent((prev) => ({
                ...(prev || activeEvent),
                event_status: 'cancelled',
                cancelled_at: cancelledAt,
                cancellation_reason: cancellationReason.trim() || null,
                cancellation_refund_status: data?.refund_status || 'complete',
            }));
            setShowCancelConfirm(false);
            const refundMessage = data?.refund_status === 'needs_attention'
                ? 'Event cancelled. Some refunds need administrator attention.'
                : `Event cancelled. ${data?.registrations_processed || 0} player entr${data?.registrations_processed === 1 ? 'y' : 'ies'} processed.`;
            data?.refund_status === 'needs_attention' ? toast.warning(refundMessage) : toast.success(refundMessage);
            onSaved?.({ eventId: activeEvent.id, cancelled: true });
        } catch (err) {
            console.error('Event cancellation failed:', err);
            toast.error(err?.message || 'Could not cancel the event');
        } finally {
            setCancelling(false);
        }
    };

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
                    className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {isEditing ? 'Edit Event' : 'Create Event'}
                            </h2>
                            <p className="text-xs text-gray-400">
                                Step {step} of 6 — {STEPS[step - 1]?.label}
                                {form.is_weekly ? ' · Weekly series' : ''}
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-2 px-6 py-4 border-b border-white/5 overflow-x-auto">
                        {STEPS.map((s) => {
                            if (form.is_weekly && (s.id === 3 || s.id === 4)) return null;
                            const Icon = s.icon;
                            const active = s.id === step;
                            const done = s.id < step;
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => {
                                        let target = s.id;
                                        if (form.is_weekly && (target === 3 || target === 4)) target = 5;
                                        setStep(target);
                                    }}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                                        active
                                            ? 'bg-padel-green text-black'
                                            : done
                                                ? 'bg-white/10 text-white'
                                                : 'bg-white/5 text-gray-500'
                                    }`}
                                >
                                    <Icon size={14} />
                                    {s.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
                        {step === 1 && (
                            <div className="space-y-4">
                                {isEditing && form.is_weekly && (
                                    <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
                                        <p className="text-xs font-bold text-sky-300 flex items-center gap-2">
                                            <Repeat size={14} /> Editing weekly series
                                        </p>
                                        <p className="text-[11px] text-gray-400 mt-1">
                                            Saving updates all {seriesSiblings.length || form.weekly_count || ''} nights in this series
                                            (name, fee, times, venue, policy, and content). Date and registration windows
                                            shift for each week relative to this occurrence.
                                        </p>
                                    </div>
                                )}

                                {!form.is_weekly ? (
                                    <>
                                        {/* Simplified event information */}
                                        <div className="space-y-2">
                                            <PanelHeader id="identity" title="Event Info" />
                                            {openPanels.identity && (
                                                <div className="space-y-5 rounded-xl border border-white/10 bg-black/20 p-4">
                                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                        <div>
                                                            <label className={labelClass}>Event Name *</label>
                                                            <input name="event_name" value={form.event_name} onChange={handleInput} className={inputClass} required />
                                                        </div>
                                                        <div className="relative" ref={orgSearchRef}>
                                                            <label className={labelClass}>Organiser</label>
                                                            <input
                                                                name="organiser_name"
                                                                value={form.organiser_name}
                                                                onChange={(e) => organisation
                                                                    ? setForm((prev) => ({ ...prev, organiser_name: e.target.value }))
                                                                    : handleOrganiserNameChange(e.target.value)}
                                                                onFocus={() => { if (!organisation && !form.organisation_id) setOrgSearchOpen(true); }}
                                                                placeholder={organisation ? undefined : 'Select an organisation or type a custom name...'}
                                                                autoComplete="off"
                                                                className={inputClass}
                                                                readOnly={!!organisation}
                                                            />
                                                            {!organisation && form.organisation_id && (
                                                                <div className="mt-1.5 flex items-center justify-between gap-2">
                                                                    <p className="text-[11px] font-bold text-padel-green">Linked to organisation page</p>
                                                                    <button type="button" onClick={clearOrganisationLink} className="text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-red-400">Unlink</button>
                                                                </div>
                                                            )}
                                                            {!organisation && !form.organisation_id && (
                                                                <p className="mt-1 text-[11px] text-gray-500">Pick from the list to link their page, or type a custom organiser name.</p>
                                                            )}
                                                            {!organisation && !form.organisation_id && orgSearchOpen && (
                                                                <div className="absolute inset-x-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl">
                                                                    {searchingOrgs && orgSuggestions.length === 0 ? (
                                                                        <p className="px-4 py-3 text-xs text-gray-500">Searching...</p>
                                                                    ) : orgSuggestions.length === 0 ? (
                                                                        <p className="px-4 py-3 text-xs text-gray-500">No approved organisations found.</p>
                                                                    ) : orgSuggestions.map((org) => (
                                                                        <button key={org.id} type="button" onClick={() => selectOrganisation(org)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5">
                                                                            {org.logo_url ? <img src={org.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white/5 object-cover outline outline-1 -outline-offset-1 outline-white/10" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-padel-green"><Shield size={14} /></span>}
                                                                            <span className="min-w-0"><span className="block truncate text-sm font-bold text-white">{org.name}</span>{org.slug && <span className="block truncate text-[10px] text-gray-500">/{org.slug}</span>}</span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                                                        <button type="button" onClick={() => setShowEventDescription((open) => !open)} aria-expanded={showEventDescription} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-bold text-gray-200 hover:bg-white/[0.03]">
                                                            <span>Event description / about</span>
                                                            <ChevronDown size={16} className={`shrink-0 text-padel-green transition-transform ${showEventDescription ? 'rotate-180' : ''}`} />
                                                        </button>
                                                        {showEventDescription && <div className="border-t border-white/10 p-4">
                                                            <RichTextEditor
                                                                value={form.description}
                                                                onChange={(html) => setField('description', html)}
                                                                placeholder="Describe the event, format, highlights and important information..."
                                                            />
                                                        </div>}
                                                    </div>

                                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                                        <div>
                                                            <label className={labelClass}>Event Start Date *</label>
                                                            <input type="date" name="start_date" value={form.start_date} onChange={handleInput} className={inputClass} />
                                                        </div>
                                                        <div>
                                                            <label className={labelClass}>Event End Date *</label>
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
                                                    </div>

                                                    <div className="relative">
                                                        <label className={labelClass}>Venues / Clubs *</label>
                                                        {selectedVenues.length > 0 && (
                                                            <div className="mb-2 flex flex-wrap gap-2">
                                                                {selectedVenues.map((name) => (
                                                                    <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-padel-green/40 bg-padel-green/10 px-2.5 py-1 text-xs font-semibold text-padel-green">
                                                                        {name}
                                                                        <button type="button" onClick={() => removeVenue(name)} className="rounded-full p-0.5 text-padel-green/80 hover:bg-white/10 hover:text-white" aria-label={`Remove ${name}`}>
                                                                            <X className="h-3 w-3" />
                                                                        </button>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <input
                                                            value={venueQuery}
                                                            onChange={(e) => { setVenueQuery(e.target.value); setVenueOpen(true); }}
                                                            onFocus={() => setVenueOpen(true)}
                                                            onBlur={() => setTimeout(() => setVenueOpen(false), 150)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    if (venueQuery.trim()) addVenue(venueQuery);
                                                                }
                                                            }}
                                                            placeholder="Select one or more venues or clubs..."
                                                            autoComplete="off"
                                                            className={inputClass}
                                                        />
                                                        {venueOpen && (filteredClubs.length > 0 || venueQuery.trim()) && (
                                                            <div className={menuClass}>
                                                                {filteredClubs.map((club) => (
                                                                    <button key={club.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addVenue(club)} className={menuItemClass}>
                                                                        {club.name}
                                                                    </button>
                                                                ))}
                                                                {venueQuery.trim() && !selectedVenueKeys.has(venueQuery.trim().toLowerCase()) && (
                                                                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => addVenue(venueQuery)} className={`${menuItemClass} border-t border-white/10 text-padel-green`}>
                                                                        Add “{venueQuery.trim()}”
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div>
                                                        <label className={labelClass}>Address</label>
                                                        <input ref={addressInputRef} name="address" value={form.address} onChange={handleInput} placeholder="Start typing to search Google..." autoComplete="off" className={inputClass} />
                                                    </div>

                                                    <div>
                                                        <label className={labelClass}>City</label>
                                                        <input name="city" value={form.city} onChange={handleInput} placeholder="Enter city" className={inputClass} />
                                                    </div>

                                                    <div className="space-y-3 border-t border-white/10 pt-5">
                                                        <p className={labelClass}>Display Options</p>
                                                        {organisation ? (
                                                            <div className="rounded-xl border border-padel-green/20 bg-padel-green/5 px-4 py-3 text-xs font-semibold text-padel-green">
                                                                {isAmendment ? 'Changes will be submitted for approval while the current event stays live.' : 'This event will go live after 4M Padel sanctioning.'}
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                                                {[
                                                                    ['featured_event', 'Featured event'],
                                                                    ['show_in_recent_results', 'Show in recent results'],
                                                                    ['is_visible', 'Visible on website'],
                                                                ].map(([key, label]) => (
                                                                    <label key={key} className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3">
                                                                        <span className="text-sm font-medium text-gray-200">{label}</span>
                                                                        <input type="checkbox" name={key} checked={!!form[key]} onChange={handleInput} className="h-5 w-5 accent-padel-green" />
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <PanelHeader id="federation" title="Federation Sanctioning" />
                                            {openPanels.federation && (
                                                <div className="grid grid-cols-1 gap-4 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-2">
                                                    <div>
                                                        <label className={labelClass}>SAPA Status</label>
                                                        <SelectMenu value={form.sapa_status} onChange={handleSapaStatusChange} options={SAPA_STATUSES} />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className={labelClass}>Event Subtitle / Badge Text</label>
                                                        <input name="organiser_badge_text" value={form.organiser_badge_text} onChange={handleInput} placeholder="e.g. SAPA GOLD 1000" className={inputClass} />
                                                        <p className="mt-1 text-[11px] text-gray-500">Auto-filled from SAPA status — editable if needed.</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                    </>
                                ) : (
                                    <>
                                {/* Event Identity */}
                                <div className="space-y-2">
                                    <PanelHeader id="identity" title="Event Identity" />
                                    {openPanels.identity && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>Event Name *</label>
                                                <input name="event_name" value={form.event_name} onChange={handleInput} className={inputClass} required />
                                            </div>
                                            {!form.is_weekly && (
                                                <>
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
                                                            name="organiser_badge_text"
                                                            value={form.organiser_badge_text}
                                                            onChange={handleInput}
                                                            placeholder="e.g. SAPA GOLD 1000"
                                                            className={inputClass}
                                                        />
                                                        <p className="text-[11px] text-gray-500 mt-1">Auto-filled from SAPA status — editable if needed.</p>
                                                    </div>
                                                </>
                                            )}
                                            {form.is_weekly && (
                                                <div className="md:col-span-2 rounded-xl border border-padel-green/30 bg-padel-green/5 px-4 py-3">
                                                    <p className="text-xs font-bold text-padel-green flex items-center gap-2">
                                                        <Repeat size={14} /> Weekly social event
                                                    </p>
                                                    <p className="text-[11px] text-gray-400 mt-1">
                                                        Non-ranking · Social tag · No SAPA sanctioning. Book and pay on 4M.
                                                    </p>
                                                </div>
                                            )}
                                            <div className="relative md:col-span-2" ref={orgSearchRef}>
                                                <label className={labelClass}>Organiser</label>
                                                <input
                                                    name="organiser_name"
                                                    value={form.organiser_name}
                                                    onChange={(e) => {
                                                        if (organisation) {
                                                            setForm((prev) => ({ ...prev, organiser_name: e.target.value }));
                                                        } else {
                                                            handleOrganiserNameChange(e.target.value);
                                                        }
                                                    }}
                                                    onFocus={() => { if (!organisation && !form.organisation_id) setOrgSearchOpen(true); }}
                                                    placeholder={organisation ? undefined : 'Select an organisation or type a custom name…'}
                                                    autoComplete="off"
                                                    className={inputClass}
                                                    readOnly={!!organisation}
                                                />
                                                {!organisation && form.organisation_id && (
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
                                                {!organisation && !form.organisation_id && (
                                                    <p className="text-[11px] text-gray-500 mt-1">
                                                        Pick from the list to link their page, or type a custom organiser name.
                                                    </p>
                                                )}
                                                {!organisation && !form.organisation_id && orgSearchOpen && (
                                                    <div className="absolute z-30 left-0 right-0 mt-1 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                                                        {searchingOrgs && orgSuggestions.length === 0 ? (
                                                            <p className="px-4 py-3 text-xs text-gray-500">Searching…</p>
                                                        ) : orgSuggestions.length === 0 ? (
                                                            <p className="px-4 py-3 text-xs text-gray-500">No approved organisations found.</p>
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
                                                {(organisation || form.organisation_id) ? (
                                                    <>
                                                        <p className="text-[11px] text-gray-500 mb-2">
                                                            Linked org logo — shown first in the sponsor strip. SAPA branding appears next to the badge text on the event page.
                                                        </p>
                                                        {(organisation?.logo_url || form.organiser_logo_url) ? (
                                                            <img
                                                                src={organisation?.logo_url || form.organiser_logo_url}
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
                                                            {form.organiser_logo_url && (
                                                                <div className="relative group">
                                                                    <img src={form.organiser_logo_url} alt="Organisation logo" className="w-14 h-14 rounded-full object-cover border border-white/10" />
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
                                                <label className={labelClass}>
                                                    {form.is_weekly
                                                        ? (isEditing ? 'This occurrence date *' : 'First date *')
                                                        : 'Start Date *'}
                                                </label>
                                                <input type="date" name="start_date" value={form.start_date} onChange={handleInput} className={inputClass} />
                                            </div>
                                            {!form.is_weekly ? (
                                                <div>
                                                    <label className={labelClass}>End Date *</label>
                                                    <input type="date" name="end_date" value={form.end_date} onChange={handleInput} className={inputClass} />
                                                </div>
                                            ) : isEditing ? (
                                                <div>
                                                    <label className={labelClass}>Series length</label>
                                                    <div className="rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3">
                                                        <p className="text-sm font-medium text-gray-200">
                                                            {seriesSiblings.length || form.weekly_count || '—'} weekly events
                                                        </p>
                                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                                            Changing this date shifts every night in the series by the same amount.
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <label className={labelClass}>Number of weeks *</label>
                                                    <input
                                                        type="number"
                                                        min={2}
                                                        max={26}
                                                        name="weekly_count"
                                                        value={form.weekly_count}
                                                        onChange={handleInput}
                                                        className={inputClass}
                                                    />
                                                    <p className="text-[11px] text-gray-500 mt-1">Creates {Math.min(26, Math.max(2, Number(form.weekly_count) || 8))} events on the same weekday.</p>
                                                </div>
                                            )}
                                            <div>
                                                <label className={labelClass}>{form.is_weekly ? 'Start Time *' : 'Start Time'}</label>
                                                <input type="time" name="start_time" value={form.start_time} onChange={handleInput} className={inputClass} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>End Time</label>
                                                <input type="time" name="end_time" value={form.end_time} onChange={handleInput} className={inputClass} />
                                            </div>
                                            {form.is_weekly && form.start_date && !isEditing && (
                                                <div className="md:col-span-2 text-[11px] text-gray-400 leading-relaxed">
                                                    Occurrences:{' '}
                                                    {buildWeeklyDates(form.start_date, form.weekly_count)
                                                        .slice(0, 6)
                                                        .map((d) => d)
                                                        .join(', ')}
                                                    {Number(form.weekly_count) > 6 ? '…' : ''}
                                                </div>
                                            )}
                                            {form.is_weekly && isEditing && seriesSiblings.length > 0 && (
                                                <div className="md:col-span-2 text-[11px] text-gray-400 leading-relaxed">
                                                    Series dates:{' '}
                                                    {seriesSiblings
                                                        .slice(0, 8)
                                                        .map((s) => {
                                                            const editIdx = seriesSiblings.findIndex((x) => String(x.id) === String(activeEvent?.id));
                                                            const idx = seriesSiblings.findIndex((x) => x.id === s.id);
                                                            const preview = form.start_date
                                                                ? addDaysToDate(form.start_date, (idx - Math.max(0, editIdx)) * 7)
                                                                : (s.start_date || '').substring(0, 10);
                                                            return preview;
                                                        })
                                                        .join(', ')}
                                                    {seriesSiblings.length > 8 ? '…' : ''}
                                                </div>
                                            )}
                                            <div className="relative md:col-span-2">
                                                <label className={labelClass}>Venues / Clubs *</label>
                                                {selectedVenues.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 mb-2">
                                                        {selectedVenues.map((name) => (
                                                            <span
                                                                key={name}
                                                                className="inline-flex items-center gap-1.5 rounded-full border border-padel-green/40 bg-padel-green/10 text-padel-green px-2.5 py-1 text-xs font-semibold"
                                                            >
                                                                {name}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeVenue(name)}
                                                                    className="rounded-full p-0.5 hover:bg-white/10 text-padel-green/80 hover:text-white"
                                                                    aria-label={`Remove ${name}`}
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                <input
                                                    value={venueQuery}
                                                    onChange={(e) => { setVenueQuery(e.target.value); setVenueOpen(true); }}
                                                    onFocus={() => setVenueOpen(true)}
                                                    onBlur={() => setTimeout(() => setVenueOpen(false), 150)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            if (venueQuery.trim()) addVenue(venueQuery);
                                                        }
                                                    }}
                                                    placeholder="Select a club or type a venue"
                                                    autoComplete="off"
                                                    className={inputClass}
                                                />
                                                <p className="text-[11px] text-gray-500 mt-1">Add one or more clubs. Press Enter to add a custom venue.</p>
                                                {venueOpen && (filteredClubs.length > 0 || venueQuery.trim()) && (
                                                    <div className="absolute z-20 left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-lg max-h-52 overflow-y-auto shadow-xl custom-scrollbar">
                                                        {filteredClubs.map((c) => (
                                                            <button
                                                                key={c.id}
                                                                type="button"
                                                                onMouseDown={(e) => e.preventDefault()}
                                                                onClick={() => addVenue(c)}
                                                                className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-padel-green hover:text-black transition-colors"
                                                            >
                                                                {c.name}
                                                            </button>
                                                        ))}
                                                        {venueQuery.trim() && !selectedVenueKeys.has(venueQuery.trim().toLowerCase()) && (
                                                            <button
                                                                type="button"
                                                                onMouseDown={(e) => e.preventDefault()}
                                                                onClick={() => addVenue(venueQuery)}
                                                                className="w-full text-left px-4 py-2.5 text-sm text-padel-green hover:bg-padel-green hover:text-black transition-colors border-t border-white/10"
                                                            >
                                                                Add “{venueQuery.trim()}”
                                                            </button>
                                                        )}
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
                                                <p className="text-[11px] text-gray-500 mt-1">Powered by Google — selecting a result auto-fills city (and venue if none selected yet).</p>
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>City</label>
                                                <input name="city" value={form.city} onChange={handleInput} className={inputClass} />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* RankedIn link (for draws & results) */}
                                {!form.is_weekly && (
                                <div className="space-y-2">
                                    <PanelHeader id="rankedin" title="RankedIn (Draws & Results)" />
                                    {openPanels.rankedin && (
                                        <div className="grid grid-cols-1 gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <p className="text-[11px] text-gray-400 leading-relaxed">
                                                Registration stays on 4M. Link a blank RankedIn tournament for draws and results.
                                                Sync pushes tournament name, dates, location and regulations, maps divisions to RankedIn classes by name,
                                                then pushes paid doubles teams. Create matching classes on RankedIn first if they don’t exist yet.
                                            </p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className={labelClass}>RankedIn tournament ID or URL</label>
                                                    <input
                                                        value={form.rankedin_id}
                                                        onChange={(e) => handleRankedinIdChange(e.target.value)}
                                                        placeholder="e.g. 70399 or https://www.rankedin.com/en/tournament/70399/…"
                                                        className={inputClass}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>RankedIn URL</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            value={form.rankedin_url}
                                                            onChange={(e) => {
                                                                const id = extractRankedinId(e.target.value);
                                                                setForm((prev) => ({
                                                                    ...prev,
                                                                    rankedin_url: e.target.value,
                                                                    rankedin_id: id || prev.rankedin_id,
                                                                }));
                                                            }}
                                                            placeholder="Auto-filled from ID"
                                                            className={inputClass}
                                                        />
                                                        {form.rankedin_url && (
                                                            <a
                                                                href={form.rankedin_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="shrink-0 p-2.5 rounded-xl border border-white/10 text-gray-300 hover:text-padel-green hover:border-padel-green/40 transition-colors"
                                                                title="Open on RankedIn"
                                                            >
                                                                <ExternalLink size={16} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleSyncToRankedin}
                                                    disabled={syncingRankedin}
                                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-padel-green text-black text-xs font-black uppercase tracking-wider hover:brightness-110 disabled:opacity-40 transition-all"
                                                >
                                                    {syncingRankedin ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                                                    Sync to RankedIn
                                                </button>
                                                {!activeEvent?.id && (
                                                    <span className="text-[11px] text-amber-400/90">Save the event once before syncing.</span>
                                                )}
                                            </div>
                                            {divisions.some((d) => d.rankedin_class_id) && (
                                                <p className="text-[11px] text-padel-green/90">
                                                    {divisions.filter((d) => d.rankedin_class_id).length} division(s) linked to RankedIn classes.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                                )}

                                {/* Event description */}
                                <div className="space-y-2">
                                    <PanelHeader id="display" title="Event Description" />
                                    {openPanels.display && (
                                        <div className="grid grid-cols-1 gap-4 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <div>
                                                <label className={labelClass}>Event Description / About</label>
                                                <RichTextEditor value={form.description} onChange={(html) => setField('description', html)} placeholder="Describe the event..." />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Website Display */}
                                <div className="space-y-2">
                                    <PanelHeader id="websiteDisplay" title="Website Display" />
                                    {openPanels.websiteDisplay && (
                                        <div className="space-y-3 p-4 rounded-xl border border-white/10 bg-black/20">
                                            {organisation && !form.is_weekly ? (
                                                <div className="bg-padel-green/5 border border-padel-green/20 rounded-xl px-4 py-3 text-xs text-padel-green font-semibold">
                                                    {isAmendment
                                                        ? 'This event is already sanctioned. Your changes will be submitted as an amendment for 4M Padel approval — the event stays live with its current details until approved.'
                                                        : 'This event will be submitted to 4M Padel for sanctioning. It goes live on the calendar once approved.'}
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    {form.is_weekly && (
                                                        <div className="rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3 text-[11px] text-gray-400 leading-relaxed">
                                                            Leave <span className="text-gray-200 font-medium">Visible on website</span> off to keep this series off the public calendar.
                                                            Anyone with the event link can still open and register. Copy links from Calendar Manager.
                                                        </div>
                                                    )}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {[
                                                            ...(!form.is_weekly ? [['featured_event', 'Featured event']] : []),
                                                            ...(!form.is_weekly ? [['show_in_recent_results', 'Show in recent results']] : []),
                                                            ['is_visible', form.is_weekly ? 'Visible on public calendar' : 'Visible on website'],
                                                        ].map(([key, label]) => (
                                                            <label key={key} className="flex items-center justify-between bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
                                                                <span className="text-sm font-medium text-gray-200">{label}</span>
                                                                <input type="checkbox" name={key} checked={!!form[key]} onChange={handleInput} className="accent-padel-green w-5 h-5" />
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                    </>
                                )}
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
                                            <div className="md:col-span-2 rounded-xl border border-white/10 bg-[#1a1a1a]/60 p-4 space-y-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-200">Early bird pricing</p>
                                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                                            Toggle off to clear the early bird date and fee (hidden from tournament progress).
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (form.early_bird_ends_at) {
                                                                setForm((prev) => ({
                                                                    ...prev,
                                                                    early_bird_ends_at: '',
                                                                    early_bird_fee: '',
                                                                }));
                                                            } else {
                                                                const now = new Date();
                                                                const offsetMs = now.getTimezoneOffset() * 60000;
                                                                const defaultAt = form.registration_closes_at
                                                                    || new Date(now.getTime() - offsetMs).toISOString().substring(0, 16);
                                                                setForm((prev) => ({
                                                                    ...prev,
                                                                    early_bird_ends_at: defaultAt,
                                                                    early_bird_fee: prev.early_bird_fee || (standardPrice || ''),
                                                                }));
                                                            }
                                                        }}
                                                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                                                            form.early_bird_ends_at ? 'bg-padel-green' : 'bg-white/20'
                                                        }`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                                            form.early_bird_ends_at ? 'translate-x-4.5' : 'translate-x-0.5'
                                                        }`} />
                                                    </button>
                                                </div>
                                                {form.early_bird_ends_at ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className={labelClass}>Early bird ends at</label>
                                                            <input
                                                                type="datetime-local"
                                                                name="early_bird_ends_at"
                                                                value={form.early_bird_ends_at}
                                                                onChange={handleInput}
                                                                className={inputClass}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className={labelClass}>Early bird fee (R per player)</label>
                                                            <input
                                                                type="number"
                                                                name="early_bird_fee"
                                                                value={form.early_bird_fee}
                                                                onChange={handleInput}
                                                                placeholder="e.g. 400"
                                                                min="0"
                                                                className={inputClass}
                                                            />
                                                            <p className="text-[11px] text-gray-500 mt-1">
                                                                {form.is_weekly
                                                                    ? 'Overrides the event entry fee until early bird ends.'
                                                                    : 'Overrides each division’s entry fee until early bird ends.'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="w-full bg-black/20 border border-white/5 rounded-lg px-4 py-3 text-gray-600 text-sm italic">
                                                        Early bird off — standard division prices apply
                                                    </div>
                                                )}
                                            </div>
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
                                                {!organisation && (
                                                    <label className="flex items-center justify-between bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
                                                        <span className="text-sm font-medium text-gray-200">Payment / finance manager</span>
                                                        <input type="checkbox" name="finance_managed" checked={!!form.finance_managed} onChange={handleInput} className="accent-padel-green w-5 h-5" />
                                                    </label>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-end gap-3">
                                                <div className="flex-1 min-w-[160px]">
                                                    <label className={labelClass}>
                                                        {form.is_weekly ? 'Entry fee per player (R) *' : 'Standard entry fee (R)'}
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={standardPrice}
                                                        onChange={(e) => {
                                                            setStandardPrice(e.target.value);
                                                            if (form.is_weekly) {
                                                                setForm((prev) => ({ ...prev, entry_fee: e.target.value }));
                                                            }
                                                        }}
                                                        placeholder="e.g. 150"
                                                        min="0"
                                                        className={inputClass}
                                                    />
                                                    <p className="text-[11px] text-gray-500 mt-1">
                                                        {form.is_weekly
                                                            ? 'One price for the night — charged per selected week.'
                                                            : 'Can be applied to all divisions.'}
                                                    </p>
                                                </div>
                                                {!form.is_weekly && (
                                                    <button type="button" onClick={applyStandardPrice} className="bg-white/10 text-white px-4 py-3 rounded-lg font-bold hover:bg-white/20 transition-colors">
                                                        Apply to all
                                                    </button>
                                                )}
                                            </div>
                                            {form.is_weekly && (
                                                <div className="space-y-2">
                                                    <label className={labelClass}>Payment policy</label>
                                                    <div className="grid grid-cols-1 gap-2">
                                                        <label className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer ${form.weekly_payment_policy !== 'allow_reserve' ? 'border-padel-green/50 bg-padel-green/5' : 'border-white/10 bg-[#1a1a1a]'}`}>
                                                            <input
                                                                type="radio"
                                                                name="weekly_payment_policy"
                                                                checked={form.weekly_payment_policy !== 'allow_reserve'}
                                                                onChange={() => setField('weekly_payment_policy', 'pay_now')}
                                                                className="accent-padel-green mt-1"
                                                            />
                                                            <span>
                                                                <span className="text-sm font-medium text-gray-200 block">Pay selected weeks upfront</span>
                                                                <span className="text-[11px] text-gray-500">Players must pay for every week they book at checkout.</span>
                                                            </span>
                                                        </label>
                                                        <label className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer ${form.weekly_payment_policy === 'allow_reserve' ? 'border-padel-green/50 bg-padel-green/5' : 'border-white/10 bg-[#1a1a1a]'}`}>
                                                            <input
                                                                type="radio"
                                                                name="weekly_payment_policy"
                                                                checked={form.weekly_payment_policy === 'allow_reserve'}
                                                                onChange={() => setField('weekly_payment_policy', 'allow_reserve')}
                                                                className="accent-padel-green mt-1"
                                                            />
                                                            <span>
                                                                <span className="text-sm font-medium text-gray-200 block">Allow reserve + remind later</span>
                                                                <span className="text-[11px] text-gray-500">Players can book seats unpaid and get payment reminders before each week.</span>
                                                            </span>
                                                        </label>
                                                    </div>
                                                </div>
                                            )}
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
                                                {form.is_weekly ? (
                                                    <div className="rounded-xl border border-white/10 bg-[#1a1a1a] px-4 py-3">
                                                        <p className="text-sm font-medium text-gray-200">Optional — players choose</p>
                                                        <p className="text-[11px] text-gray-500 mt-0.5">
                                                            At registration, players pick Single entry or With partner.
                                                        </p>
                                                    </div>
                                                ) : (
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
                                                )}
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
                                {!form.is_weekly && (
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
                                )}

                                {/* Player gifts */}
                                <div className="space-y-2">
                                    <PanelHeader id="playerGifts" title="Player Gifts" />
                                    {openPanels.playerGifts && (
                                        <div className="space-y-3 p-4 rounded-xl border border-white/10 bg-black/20">
                                            <label className="flex items-center justify-between bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
                                                <div className="pr-3">
                                                    <span className="text-sm font-medium text-gray-200 block">Collect T-shirt size</span>
                                                    <span className="text-[11px] text-gray-500">
                                                        Ask players for Men / Ladies / Juniors size, optional sponsor name, and logo during registration
                                                    </span>
                                                </div>
                                                <input type="checkbox" name="collect_tshirt_size" checked={!!form.collect_tshirt_size} onChange={handleInput} className="accent-padel-green w-5 h-5 shrink-0" />
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-400">
                                    1) Multi-select the divisions you want. 2) Edit fees, format and close dates on each card below.
                                </p>

                                {/* Multi-select divisions dropdown */}
                                <div className="space-y-2" ref={divisionMultiRef}>
                                    <label className={labelClass}>Add divisions</label>
                                    <button
                                        type="button"
                                        onClick={() => (divisionMultiOpen ? setDivisionMultiOpen(false) : openDivisionMultiSelect())}
                                        className="w-full flex items-center justify-between gap-3 bg-black/40 border border-white/10 hover:border-padel-green/40 rounded-xl px-4 py-3.5 text-left transition-colors"
                                    >
                                        <span className={`text-sm ${namedDivisionCount ? 'text-white font-semibold' : 'text-gray-500'}`}>
                                            {namedDivisionCount
                                                ? `${namedDivisionCount} division${namedDivisionCount === 1 ? '' : 's'} selected — click to change`
                                                : 'Select multiple divisions…'}
                                        </span>
                                        <ChevronDown size={16} className={`text-gray-400 shrink-0 transition-transform ${divisionMultiOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {namedDivisionCount > 0 && !divisionMultiOpen && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {divisions.filter((d) => d.name.trim()).map((d) => (
                                                <span
                                                    key={d._key}
                                                    className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide bg-padel-green/10 border border-padel-green/25 text-padel-green px-2 py-1 rounded-lg"
                                                >
                                                    {d.name}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {divisionMultiOpen && (
                                        <div className="rounded-xl border border-padel-green/30 bg-[#0f0f0f] shadow-2xl overflow-hidden">
                                            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10 bg-padel-green/5">
                                                <p className="text-xs text-gray-300 font-semibold">
                                                    {pendingDivisionPicks.length} selected
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={createStandardSapaDivisions}
                                                        className="text-[10px] font-black uppercase tracking-wider text-padel-green hover:text-white transition-colors flex items-center gap-1"
                                                    >
                                                        <Layers size={12} /> Standard SAPA
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPendingDivisionPicks([])}
                                                        className="text-[10px] font-black uppercase tracking-wider text-gray-500 hover:text-white transition-colors"
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="max-h-72 overflow-y-auto p-3 space-y-4 custom-scrollbar">
                                                {DIVISION_GROUPS.map((group) => {
                                                    const groupSelected = group.items.filter((n) => pendingDivisionPicks.includes(n)).length;
                                                    const allSelected = groupSelected === group.items.length;
                                                    return (
                                                        <div key={group.label}>
                                                            <div className="flex items-center justify-between mb-2 px-1">
                                                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">
                                                                    {group.label}
                                                                </p>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (allSelected) {
                                                                            setPendingDivisionPicks((prev) => prev.filter((n) => !group.items.includes(n)));
                                                                        } else {
                                                                            setPendingDivisionPicks((prev) => [
                                                                                ...new Set([...prev, ...group.items]),
                                                                            ]);
                                                                        }
                                                                    }}
                                                                    className="text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-padel-green"
                                                                >
                                                                    {allSelected ? 'Clear' : 'All'}
                                                                </button>
                                                            </div>
                                                            <div className="space-y-1">
                                                                {group.items.map((name) => {
                                                                    const checked = pendingDivisionPicks.includes(name);
                                                                    return (
                                                                        <label
                                                                            key={name}
                                                                            className={`flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                                                                                checked ? 'bg-padel-green/10 text-white' : 'hover:bg-white/5 text-gray-300'
                                                                            }`}
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={checked}
                                                                                onChange={() => togglePendingDivision(name)}
                                                                                className="accent-padel-green w-4 h-4 shrink-0"
                                                                            />
                                                                            <span className="text-sm font-medium">{name}</span>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex items-center gap-2 p-3 border-t border-white/10 bg-black/40">
                                                <button
                                                    type="button"
                                                    onClick={() => setDivisionMultiOpen(false)}
                                                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-300 border border-white/10 hover:bg-white/5"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={applyPendingDivisions}
                                                    disabled={pendingDivisionPicks.length === 0}
                                                    className="flex-1 bg-padel-green text-black px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-white transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                                                >
                                                    <Check size={14} />
                                                    Add {pendingDivisionPicks.length || ''} division{pendingDivisionPicks.length === 1 ? '' : 's'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

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
                                        </div>
                                    )}
                                </div>

                                {/* Divisions list */}
                                <div className="space-y-2">
                                    <PanelHeader id="divisions" title={`Divisions (${namedDivisionCount})`} />
                                    {openPanels.divisions && (
                                        <div className="space-y-3">
                                            {namedDivisionCount === 0 && (
                                                <p className="text-xs text-gray-500 bg-black/20 border border-dashed border-white/10 rounded-xl px-4 py-6 text-center">
                                                    No divisions yet — use the multi-select above to add several at once.
                                                </p>
                                            )}
                                            {divisions.filter((d) => d.name.trim() || expandedDivisionKey === d._key || d.id).map((d) => {
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
                                                                    {isSuperAdmin && <>
                                                                        <div>
                                                                            <label className={labelClass}>Ranking tier</label>
                                                                            <select value={d.ranking_tier_id} onChange={(e) => updateDivision(d._key, { ranking_tier_id: e.target.value })} className={inputClass}>
                                                                                <option value="">No native points</option>
                                                                                {rankingTiers.map((tier) => (
                                                                                    <option key={tier.id} value={tier.id}>{tier.name} · max {tier.max_points.toLocaleString()} pts</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                        <div>
                                                                            <label className={labelClass}>Ranking category</label>
                                                                            <select value={d.ranking_category} onChange={(e) => updateDivision(d._key, { ranking_category: e.target.value })} className={inputClass} disabled={!d.ranking_tier_id}>
                                                                                <option value="">Select category</option>
                                                                                {[1, 2, 3, 4].map((category) => <option key={category} value={category}>Category {category}</option>)}
                                                                            </select>
                                                                        </div>
                                                                    </>}
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
                                                <Plus size={16} /> Add custom division
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 4 && !form.is_weekly && (
                            <div className="space-y-4">
                                <p className="text-xs text-gray-400">
                                    Grouped tournament details — open a section to edit, leave the rest collapsed.
                                </p>

                                {/* Series tagging and results integration moved out of Basics. */}
                                <div className="space-y-2">
                                    <PanelHeader id="integrations" title="Series & Results Integration" />
                                    {openPanels.integrations && (
                                        <div className="grid grid-cols-1 gap-4 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-2">
                                            <div>
                                                <label className={labelClass}>Event Series / Tag</label>
                                                <SelectMenu value={form.tournament_tag} onChange={(value) => setField('tournament_tag', value)} options={TOURNAMENT_TAGS} />
                                            </div>
                                            <div className="md:col-span-2 grid grid-cols-1 gap-4 md:grid-cols-2">
                                                <div>
                                                    <label className={labelClass}>RankedIn Tournament ID or URL</label>
                                                    <input value={form.rankedin_id} onChange={(e) => handleRankedinIdChange(e.target.value)} placeholder="e.g. 70399 or a RankedIn tournament URL" className={inputClass} />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>RankedIn URL</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            value={form.rankedin_url}
                                                            onChange={(e) => {
                                                                const id = extractRankedinId(e.target.value);
                                                                setForm((prev) => ({ ...prev, rankedin_url: e.target.value, rankedin_id: id || prev.rankedin_id }));
                                                            }}
                                                            placeholder="Auto-filled from ID"
                                                            className={inputClass}
                                                        />
                                                        {form.rankedin_url && (
                                                            <a href={form.rankedin_url} target="_blank" rel="noopener noreferrer" aria-label="Open tournament on RankedIn" className="shrink-0 rounded-xl border border-white/10 p-3 text-gray-300 hover:border-padel-green/40 hover:text-padel-green">
                                                                <ExternalLink size={16} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                                                <button type="button" onClick={handleSyncToRankedin} disabled={syncingRankedin} className="inline-flex items-center gap-2 rounded-xl bg-padel-green px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black hover:brightness-110 disabled:opacity-40">
                                                    {syncingRankedin ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
                                                    Sync to RankedIn
                                                </button>
                                                {!activeEvent?.id && <span className="text-[11px] text-amber-400/90">Save the event once before syncing.</span>}
                                            </div>
                                        </div>
                                    )}
                                </div>

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
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className={labelClass} style={{ marginBottom: 0 }}>Draw release date/time</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (form.draw_released) {
                                                                setField('draw_released', '');
                                                            } else {
                                                                const now = new Date();
                                                                const offsetMs = now.getTimezoneOffset() * 60000;
                                                                setField('draw_released', new Date(now.getTime() - offsetMs).toISOString().substring(0, 16));
                                                            }
                                                        }}
                                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                                                            form.draw_released ? 'bg-padel-green' : 'bg-white/20'
                                                        }`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                                            form.draw_released ? 'translate-x-4.5' : 'translate-x-0.5'
                                                        }`} />
                                                    </button>
                                                </div>
                                                {form.draw_released ? (
                                                    <input type="datetime-local" name="draw_released" value={form.draw_released} onChange={handleInput} className={inputClass} />
                                                ) : (
                                                    <div className="w-full bg-black/20 border border-white/5 rounded-lg px-4 py-3 text-gray-600 text-sm italic">
                                                        Not set — hidden from tournament progress
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className={labelClass} style={{ marginBottom: 0 }}>Rankings updated date/time</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (form.rankings_updated_at) {
                                                                setField('rankings_updated_at', '');
                                                            } else {
                                                                const base = form.end_date
                                                                    ? new Date(`${form.end_date}T12:00:00`)
                                                                    : new Date();
                                                                if (form.end_date) base.setDate(base.getDate() + 1);
                                                                const offsetMs = base.getTimezoneOffset() * 60000;
                                                                setField('rankings_updated_at', new Date(base.getTime() - offsetMs).toISOString().substring(0, 16));
                                                            }
                                                        }}
                                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                                                            form.rankings_updated_at ? 'bg-padel-green' : 'bg-white/20'
                                                        }`}
                                                    >
                                                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                                                            form.rankings_updated_at ? 'translate-x-4.5' : 'translate-x-0.5'
                                                        }`} />
                                                    </button>
                                                </div>
                                                {form.rankings_updated_at ? (
                                                    <input type="datetime-local" name="rankings_updated_at" value={form.rankings_updated_at} onChange={handleInput} className={inputClass} />
                                                ) : (
                                                    <div className="w-full bg-black/20 border border-white/5 rounded-lg px-4 py-3 text-gray-600 text-sm italic">
                                                        Not set — hidden from tournament progress
                                                    </div>
                                                )}
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
                                                <input name="organiser_phone" value={form.organiser_phone} onChange={handleInput} className={inputClass} />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className={labelClass}>Contact email</label>
                                                <input name="organiser_email" value={form.organiser_email} onChange={handleInput} className={inputClass} />
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

                                <div className="space-y-2">
                                    <PanelHeader id="display" title="Event Media" />
                                    {openPanels.display && (
                                        <div className="grid grid-cols-1 gap-5 rounded-xl border border-white/10 bg-black/20 p-4 md:grid-cols-2">
                                            <div>
                                                <label className={labelClass}>Cover Photo</label>
                                                <div className="flex items-center gap-3">
                                                    <div className="relative shrink-0">
                                                        <img src={form.custom_image_url || getDefaultBackgroundForStatus(form.sapa_status)} alt="Event cover preview" className="h-28 w-20 rounded-lg object-cover outline outline-1 -outline-offset-1 outline-white/10" />
                                                        {!form.custom_image_url && <span className="absolute inset-x-1 bottom-1 rounded bg-black/70 px-1 py-0.5 text-center text-[8px] font-bold uppercase tracking-wider text-padel-green">Default</span>}
                                                    </div>
                                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                                        <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-4 text-gray-300 hover:border-padel-green hover:text-padel-green">
                                                            {uploadingCover ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
                                                            <span className="text-xs font-bold">{uploadingCover ? 'Uploading...' : (form.custom_image_url ? 'Replace Cover' : 'Upload Cover')}</span>
                                                            <span className="text-center text-[10px] text-gray-500">Event page hero / calendar card</span>
                                                            <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} disabled={uploadingCover} />
                                                        </label>
                                                        {form.custom_image_url && (
                                                            <button type="button" onClick={() => setField('custom_image_url', '')} className="text-left text-[11px] font-bold uppercase tracking-wider text-red-400 hover:text-red-300">
                                                                Use tier default
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <label className={labelClass}>Event Poster</label>
                                                <div className="flex items-center gap-3">
                                                    {form.poster_image_url ? <img src={form.poster_image_url} alt="Event poster preview" className="h-28 w-20 shrink-0 rounded-lg object-cover outline outline-1 -outline-offset-1 outline-white/10" /> : <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/30"><ImageIcon size={18} className="text-gray-600" /></div>}
                                                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                                                        <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-4 text-gray-300 hover:border-padel-green hover:text-padel-green">
                                                            {uploadingPoster ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
                                                            <span className="text-xs font-bold">{uploadingPoster ? 'Uploading...' : (form.poster_image_url ? 'Replace Poster' : 'Upload Poster')}</span>
                                                            <span className="text-center text-[10px] text-gray-500">Opens in event details</span>
                                                            <input type="file" accept="image/*" className="hidden" onChange={handlePosterUpload} disabled={uploadingPoster} />
                                                        </label>
                                                        {form.poster_image_url && (
                                                            <button type="button" onClick={() => setField('poster_image_url', '')} className="text-left text-[11px] font-bold uppercase tracking-wider text-red-400 hover:text-red-300">
                                                                Remove poster
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <PanelHeader id="organiserBrand" title="Organiser Branding" />
                                    {openPanels.organiserBrand && (
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                                            <label className={labelClass}>Organisation Logo</label>
                                            {(organisation || form.organisation_id) ? (
                                                (organisation?.logo_url || form.organiser_logo_url) ? (
                                                    <img src={organisation?.logo_url || form.organiser_logo_url} alt="Organisation logo" className="h-16 w-16 rounded-full bg-white object-cover outline outline-1 -outline-offset-1 outline-white/10" />
                                                ) : (
                                                    <p className="text-xs italic text-gray-500">This organisation has no logo yet — add one on its profile.</p>
                                                )
                                            ) : (
                                                <div className="flex flex-wrap items-center gap-4">
                                                    {form.organiser_logo_url && (
                                                        <div className="relative">
                                                            <img src={form.organiser_logo_url} alt="Organisation logo" className="h-16 w-16 rounded-full object-cover outline outline-1 -outline-offset-1 outline-white/10" />
                                                            <button type="button" onClick={removeOrgLogo} className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white" aria-label="Remove organisation logo"><X size={12} /></button>
                                                        </div>
                                                    )}
                                                    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 px-5 py-4 text-gray-300 hover:border-padel-green hover:text-padel-green">
                                                        {uploadingOrgLogo ? <Loader2 className="animate-spin" size={20} /> : <UploadCloud size={20} />}
                                                        <span className="text-xs font-bold">{uploadingOrgLogo ? 'Uploading...' : 'Upload Logo'}</span>
                                                        <input type="file" accept="image/*" className="hidden" onChange={handleOrgLogoUpload} disabled={uploadingOrgLogo} />
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

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

                                {form.is_weekly && !isEditing && (
                                    <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 space-y-2">
                                        <p className="text-xs font-bold uppercase tracking-wide text-sky-300 flex items-center gap-2">
                                            <Repeat size={14} /> Creates {buildWeeklyDates(form.start_date, form.weekly_count).length} weekly events
                                        </p>
                                        <p className="text-[11px] text-gray-400">
                                            Same time each week · Social / non-ranking · Publishes live (no SAPA sanction wait)
                                        </p>
                                        <ul className="text-sm text-sky-100/90 space-y-0.5 max-h-40 overflow-y-auto">
                                            {buildWeeklyDates(form.start_date, form.weekly_count).map((d) => (
                                                <li key={d}>• {d}{form.start_time ? ` · ${form.start_time}` : ''}{form.end_time ? `–${form.end_time}` : ''}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {form.is_weekly && isEditing && (
                                    <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 space-y-2">
                                        <p className="text-xs font-bold uppercase tracking-wide text-sky-300 flex items-center gap-2">
                                            <Repeat size={14} /> Updates {seriesSiblings.length || form.weekly_count || 'all'} weekly events
                                        </p>
                                        <p className="text-[11px] text-gray-400">
                                            Shared details apply to every night. Dates and registration windows stay week-offset from this occurrence.
                                        </p>
                                        {seriesSiblings.length > 0 && form.start_date && (
                                            <ul className="text-sm text-sky-100/90 space-y-0.5 max-h-40 overflow-y-auto">
                                                {seriesSiblings.map((s, idx) => {
                                                    const editIdx = Math.max(0, seriesSiblings.findIndex((x) => String(x.id) === String(activeEvent?.id)));
                                                    const d = addDaysToDate(form.start_date, (idx - editIdx) * 7);
                                                    return (
                                                        <li key={s.id}>
                                                            • {d}{form.start_time ? ` · ${form.start_time}` : ''}{form.end_time ? `–${form.end_time}` : ''}
                                                            {String(s.id) === String(activeEvent?.id) ? ' (editing)' : ''}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
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
                                            {form.organiser_badge_text && (
                                                <p className="text-xs text-padel-green font-semibold">{form.organiser_badge_text}</p>
                                            )}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-gray-300">
                                                <p><span className="text-gray-500">Dates:</span> {formatEventDates(form.start_date, form.end_date) || '—'}</p>
                                                <p><span className="text-gray-500">Venue:</span> {venuesDisplayLabel(form.venues, form.city) || '—'}</p>
                                                <p><span className="text-gray-500">Reg opens:</span> {formatDateTimeLabel(form.registration_opens_at)}</p>
                                                <p><span className="text-gray-500">Reg closes:</span> {formatDateTimeLabel(form.registration_closes_at)}</p>
                                                <p><span className="text-gray-500">Early bird:</span> {form.early_bird_ends_at ? `${formatDateTimeLabel(form.early_bird_ends_at)} · R${form.early_bird_fee || '—'}` : '—'}</p>
                                                <p><span className="text-gray-500">Rankings updated:</span> {formatDateTimeLabel(form.rankings_updated_at) || '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Division / fee Summary */}
                                {form.is_weekly ? (
                                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-2">
                                        <p className="text-gray-400 text-xs font-bold uppercase tracking-wide">Entry</p>
                                        <p className="text-sm text-gray-300">
                                            <span className="text-gray-500">Fee per player / week:</span>{' '}
                                            R{resolveWeeklyEntryFee() ?? '—'}
                                        </p>
                                        <p className="text-sm text-gray-300">
                                            <span className="text-gray-500">Payment policy:</span>{' '}
                                            {form.weekly_payment_policy === 'allow_reserve'
                                                ? 'Allow reserve + remind later'
                                                : 'Pay selected weeks upfront'}
                                        </p>
                                        <p className="text-sm text-gray-300">
                                            <span className="text-gray-500">Entry mode:</span> Single or with partner (player chooses)
                                        </p>
                                    </div>
                                ) : (
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
                                )}

                                {/* Settings Summary */}
                                <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-3">
                                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wide">Settings Summary</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                        <p className="text-gray-300"><span className="text-gray-500">Payments enabled:</span> {form.allow_payments ? 'Yes' : 'No'}</p>
                                        <p className="text-gray-300"><span className="text-gray-500">Partner requirement:</span> {form.is_weekly ? 'Optional (player chooses)' : (form.partner_requirement || '—')}</p>
                                        <p className="text-gray-300"><span className="text-gray-500">Maximum teams / entries:</span> {form.max_teams_capacity || 'Unlimited'}</p>
                                        {!form.is_weekly && (
                                            <>
                                                <p className="text-gray-300"><span className="text-gray-500">Plate / back draw:</span> {form.back_draw_options || '—'}</p>
                                                <p className="text-gray-300"><span className="text-gray-500">Deciding point:</span> {scoringPointLabel(form.scoring_point)}</p>
                                            </>
                                        )}
                                        {!organisation && (
                                        <p className="text-gray-300"><span className="text-gray-500">Visible on public calendar:</span> {form.is_visible ? 'Yes' : 'No (link-only)'}</p>
                                        )}
                                    </div>
                                </div>

                                {organisation && (
                                    <div className="bg-padel-green/5 border border-padel-green/20 rounded-xl px-4 py-3 text-xs text-padel-green font-semibold">
                                        {isAmendment
                                            ? 'Save and Publish both submit an amendment for 4M Padel approval. You stay on this page so you can keep editing.'
                                            : 'Save and Publish both submit this event for 4M Padel sanctioning. You stay on this page so you can keep editing.'}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={back}
                                disabled={step === 1}
                                className="px-4 py-2 rounded-xl font-bold text-gray-300 hover:bg-white/5 disabled:opacity-30 flex items-center gap-2"
                            >
                                <ChevronLeft size={16} /> Back
                            </button>
                            {isEditing && activeEvent?.event_status !== 'cancelled' && (
                                <button
                                    type="button"
                                    onClick={() => setShowCancelConfirm(true)}
                                    className="px-4 py-2 rounded-xl font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10 flex items-center gap-2"
                                >
                                    <Ban size={16} /> Cancel event
                                </button>
                            )}
                            {activeEvent?.event_status === 'cancelled' && (
                                <span className="px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-red-300 bg-red-500/10 border border-red-500/30">
                                    Event cancelled
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                            {step < 6 && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => handleSave('draft', { stayOpen: true })}
                                        disabled={saving}
                                        title="Save progress and keep editing"
                                        className="px-4 py-2 rounded-xl font-bold text-gray-200 border border-white/15 hover:bg-white/5 flex items-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                        {saving ? 'Saving...' : 'Save'}
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
                                        onClick={() => handleSave('draft', { stayOpen: true })}
                                        disabled={saving}
                                        title="Save progress and keep editing"
                                        className="px-4 py-2 rounded-xl font-bold text-gray-200 border border-white/15 hover:bg-white/5 flex items-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                        {saving ? 'Saving...' : 'Save'}
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
                                        onClick={() => handleSave('publish', { stayOpen: true })}
                                        disabled={saving || reviewIssues.errors.length > 0}
                                        title={reviewIssues.errors.length > 0 ? 'Fix blocking issues before publishing' : 'Publish and keep editing'}
                                        className="bg-padel-green text-black px-5 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-white transition-colors disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                        {saving ? 'Saving...' : isEditing ? 'Update Event' : 'Publish Event'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>

                {showCancelConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="fixed inset-0 z-[1300] bg-black/80 flex items-center justify-center p-4"
                        onClick={() => !cancelling && setShowCancelConfirm(false)}
                    >
                        <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-[#111] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-start gap-4">
                                <div className="rounded-xl bg-red-500/10 p-3 text-red-400"><AlertTriangle size={24} /></div>
                                <div>
                                    <h3 className="text-xl font-bold text-white">Cancel this event?</h3>
                                    <p className="mt-2 text-sm leading-6 text-gray-400">
                                        This will withdraw every active player entry, automatically refund all eligible payments, remove the event from every player’s schedule, and mark it as cancelled publicly.
                                    </p>
                                </div>
                            </div>
                            <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-gray-400">Reason (optional)</label>
                            <textarea
                                value={cancellationReason}
                                onChange={(e) => setCancellationReason(e.target.value)}
                                rows={3}
                                placeholder="Tell registered players why the event was cancelled…"
                                className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none focus:border-red-500/50"
                            />
                            <div className="mt-6 flex justify-end gap-3">
                                <button type="button" disabled={cancelling} onClick={() => setShowCancelConfirm(false)} className="px-4 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 disabled:opacity-50">Keep event</button>
                                <button type="button" disabled={cancelling} onClick={handleCancelEvent} className="px-4 py-2 rounded-xl bg-red-500 text-white font-bold flex items-center gap-2 hover:bg-red-400 disabled:opacity-50">
                                    {cancelling ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
                                    {cancelling ? 'Cancelling and refunding…' : 'Cancel event and refund players'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

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
                                <p className="text-gray-400 text-sm">{venuesDisplayLabel(form.venues, form.city) || 'Venue TBC'}</p>
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
