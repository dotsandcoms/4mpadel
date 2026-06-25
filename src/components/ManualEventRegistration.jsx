import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    X, Check, CreditCard, Loader2, Users, Calendar as CalendarIcon, Trophy,
    AlertCircle, ChevronRight, ChevronDown, ChevronUp, ArrowRight, Award, MapPin, User,
    Search, ChevronLeft, Info, Layout
} from 'lucide-react';
import PaystackPop from '@paystack/inline-js';
import { supabase } from '../supabaseClient';
import { sendEmail } from '../utils/emails';
import { toPaystackAmount, FEES } from '../constants/fees';
import { getEventImage } from '../utils/imageUtils';
import sapaLogo from '../assets/sapa-logo.svg';

import { PAYSTACK_PUBLIC_KEY, isPaystackConfigured, isPaystackTestMode } from '../utils/paystackConfig';
import PartnerProfileInvite from './PartnerProfileInvite';
import { useMembersOnly } from '../context/MembersOnlyContext';

const STEPS = [
    { id: 1, label: 'Profile' },
    { id: 2, label: 'Division' },
    { id: 3, label: 'Partner' },
    { id: 4, label: 'Review & Pay' },
    { id: 5, label: 'Confirmed' },
];

const fmtR = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRWhole = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

const stripHtml = (html) => {
    if (!html) return '';
    const raw = String(html);
    if (typeof document !== 'undefined') {
        const tmp = document.createElement('div');
        tmp.innerHTML = raw;
        const text = (tmp.textContent || tmp.innerText || '').replace(/\u00a0/g, ' ').trim();
        if (text) return text;
    }
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
};

const getDivisionDetailsHtml = (division) => {
    const raw = (division?.details ?? division?.Details ?? '').trim();
    return raw || null;
};

const getDivisionSavedDetails = (division) =>
    stripHtml(division?.details ?? division?.Details ?? '').trim();

const DivisionDetails = ({ division, className = 'text-xs text-slate-600 font-normal leading-snug mt-1 rich-text max-w-none' }) => {
    const html = getDivisionDetailsHtml(division);
    if (html) {
        return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
    }
    const fallback = [
        division.format,
        fmtRWhole(division.entry_fee),
        division.license_required ? 'License req.' : null,
    ].filter(Boolean).join(' · ');
    if (!fallback) return null;
    return <p className={className.replace(' rich-text max-w-none', '')}>{fallback}</p>;
};

const getEventCalendarData = (ev) => {
    if (!ev) return null;

    const dateParts = ev.start_date ? ev.start_date.split('-') : [];
    let year = dateParts[0];
    let month = dateParts[1];
    let day = dateParts[2];

    if (!year) {
        const now = new Date();
        year = now.getFullYear();
        month = String(now.getMonth() + 1).padStart(2, '0');
        day = String(now.getDate()).padStart(2, '0');
    }

    let startHour = 9;
    let startMinute = 0;

    if (ev.start_time) {
        const timeMatch = ev.start_time.match(/(\d+):(\d+)\s*(AM|PM)?/i);
        if (timeMatch) {
            let h = parseInt(timeMatch[1], 10);
            startMinute = parseInt(timeMatch[2], 10);
            const ampm = timeMatch[3];
            if (ampm) {
                if (ampm.toLowerCase() === 'pm' && h < 12) h += 12;
                if (ampm.toLowerCase() === 'am' && h === 12) h = 0;
            }
            startHour = h;
        }
    }

    const startDate = new Date(year, month - 1, day, startHour, startMinute);
    const endDate = new Date(startDate.getTime() + (2 * 60 * 60 * 1000));

    return {
        title: ev.event_name,
        description: stripHtml(ev.description || 'Padel Tournament Event'),
        location: [ev.venue, ev.address].filter(Boolean).join(', '),
        start: startDate,
        end: endDate,
    };
};

const getEntryPaymentLabel = (reg, userEmail) => {
    if (reg.payment_status !== 'paid') return 'Payment pending';
    const selfEmail = (reg.email || userEmail || '').toLowerCase();
    const registeredBy = (reg.registered_by || '').toLowerCase();
    if (!registeredBy || registeredBy === selfEmail) return 'Paid';
    const payerName = reg._payerName || (
        (reg.partner_email || '').toLowerCase() === registeredBy ? reg.partner_name : null
    );
    return payerName ? `Paid for by ${payerName}` : 'Paid for by partner';
};

const isClosed = (division, event) => {
    const closeAt = division?.entries_close_at || event?.registration_closes_at;
    if (!closeAt) return false;
    return new Date(closeAt).getTime() < Date.now();
};

const normEmail = (value) => (value || '').trim().toLowerCase();

const resolveRegPartnerName = (divRegs, partnerEmail, fallbackName) => {
    if (fallbackName?.trim()) return fallbackName.trim();
    const em = normEmail(partnerEmail);
    if (!em) return 'another player';
    const match = divRegs.find((r) => normEmail(r.email) === em);
    return match?.full_name || 'another player';
};

/** Whether a player can be selected as partner for a division (solo entries can be linked). */
const getPartnerAvailability = (regs, divisionId, player, divisionName) => {
    const email = normEmail(player?.email);
    const name = player?.name || player?.full_name || 'This player';
    const divLabel = divisionName || 'this division';
    if (!email || !divisionId) return { ok: true };

    const divRegs = (regs || []).filter(
        (r) => r.division_id === divisionId && r.status !== 'withdrawn',
    );

    const primary = divRegs.find((r) => normEmail(r.email) === email);
    if (primary) {
        const registeredBy = normEmail(primary.registered_by);
        if (registeredBy && registeredBy !== email) {
            const inviter = divRegs.find((r) => normEmail(r.email) === registeredBy);
            return {
                ok: false,
                message: `${name} is already partnered with ${inviter?.full_name || 'another player'} for ${divLabel}`,
            };
        }
        if (primary.partner_name?.trim() || primary.partner_email?.trim()) {
            return {
                ok: false,
                message: `${name} is already partnered with ${resolveRegPartnerName(divRegs, primary.partner_email, primary.partner_name)} for ${divLabel}`,
            };
        }
        return { ok: true, linkSoloRegId: primary.id, isSoloLink: true };
    }

    const asPartnerOn = divRegs.find((r) => normEmail(r.partner_email) === email);
    if (asPartnerOn) {
        return {
            ok: false,
            message: `${name} is already partnered with ${asPartnerOn.full_name || 'another player'} for ${divLabel}`,
        };
    }

    return { ok: true };
};

const PartnerSearchOption = ({ player, onSelect, compact = false }) => {
    if (player._unavailable) {
        return (
            <div className={`${compact ? 'px-3 py-2.5' : 'px-4 py-3'} text-xs bg-red-50 border-b border-red-100 last:border-0 cursor-not-allowed flex items-start gap-2.5`}>
                <div className={`${compact ? 'w-8 h-8' : 'w-9 h-9'} rounded-full bg-red-100 overflow-hidden shrink-0 flex items-center justify-center`}>
                    <User className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-red-400`} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 truncate">{player.name}</p>
                    <p className="text-red-700 leading-snug mt-0.5">{player._unavailableMessage}</p>
                </div>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => onSelect(player)}
            className={`w-full text-left ${compact ? 'px-3 py-2.5 text-xs' : 'px-4 py-3 text-sm'} hover:bg-gray-50 flex items-center gap-2.5 border-b border-gray-50 last:border-0`}
        >
            <div className={`${compact ? 'w-8 h-8' : 'w-9 h-9'} rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center`}>
                {player.image_url ? (
                    <img src={player.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                    <User className={`${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-gray-400`} />
                )}
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900 truncate">{player.name}</span>
                {player._isSoloRegistrant ? (
                    <span className="text-[10px] font-medium text-emerald-700 shrink-0">Solo entry</span>
                ) : (
                    !compact && <span className="text-slate-600 text-xs truncate">{player.email}</span>
                )}
            </div>
        </button>
    );
};

const Card = ({ children, className = '', allowOverflow = false }) => (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${allowOverflow ? 'overflow-visible' : 'overflow-hidden'} ${className}`}>{children}</div>
);

const CardHeader = ({ title, subtitle, soft = false }) => (
    <div className="px-4 py-2.5 border-b border-gray-50">
        <h3 className={`text-sm text-slate-900 ${soft ? 'font-semibold tracking-normal' : 'font-bold'}`}>{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-600 mt-0.5 font-normal leading-snug">{subtitle}</p>}
    </div>
);

const CardBody = ({ children, className = '' }) => (
    <div className={`px-4 py-3 ${className}`}>{children}</div>
);

const WizardStepWrap = ({ children }) => (
    <div className="space-y-2 font-sans">{children}</div>
);

const WizardStepTitle = ({ title, subtitle }) => (
    <div className="pb-0.5">
        <h2 className="text-base font-semibold text-slate-900 tracking-normal">{title}</h2>
        {subtitle && <p className="text-xs text-slate-600 mt-0.5 font-normal leading-snug">{subtitle}</p>}
    </div>
);

const ProgressBar = ({ step, theme }) => (
    <div className="flex items-start px-1">
        {STEPS.map((s, i) => {
            const active = step === s.id;
            const done = step > s.id;
            const accentColor = theme.fill || '#CCFF00';
            const activeTextColor = theme.primaryText?.includes('text-white') ? '#fff' : '#0F172A';
            return (
                <React.Fragment key={s.id}>
                    <div className="flex flex-col items-center min-w-0 shrink-0" style={{ width: `${100 / STEPS.length}%` }}>
                        <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-colors ${done || active ? '' : 'bg-gray-100 text-gray-400'}`}
                            style={done || active ? { backgroundColor: accentColor, color: activeTextColor } : undefined}
                        >
                            {done ? <Check size={14} /> : s.id}
                        </div>
                        <span className={`text-[9px] font-bold mt-1 truncate w-full text-center leading-tight ${active ? 'text-slate-900' : 'text-slate-500'}`}>
                            {s.label}
                        </span>
                    </div>
                    {i < STEPS.length - 1 && (
                        <div
                            className="h-px flex-1 mt-3.5 mx-0.5"
                            style={{ backgroundColor: done || active ? accentColor : '#E5E7EB' }}
                        />
                    )}
                </React.Fragment>
            );
        })}
    </div>
);

const ManualEventRegistration = ({ event, userEmail, theme, initialPlayer = null, onStatusChange, onParticipantsChange, registrationActionsRef }) => {
    const navigate = useNavigate();
    const { promptMembersOnly } = useMembersOnly();
    const [divisions, setDivisions] = useState([]);
    const [divisionRegs, setDivisionRegs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [myRegs, setMyRegs] = useState([]);
    const [showWizard, setShowWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState(1);
    const [processing, setProcessing] = useState(false);
    const [withdrawTarget, setWithdrawTarget] = useState(null);
    const [withdrawing, setWithdrawing] = useState(false);

    const [selected, setSelected] = useState({});
    const [hasPartner, setHasPartner] = useState(false);
    const [buyLicenseSelf, setBuyLicenseSelf] = useState(false);
    const [licenseSelfChoice, setLicenseSelfChoice] = useState('temporary');
    const [buyLicensePartner, setBuyLicensePartner] = useState(false);
    const [licensePartnerChoice, setLicensePartnerChoice] = useState('temporary');
    const [partnerLicenseOption, setPartnerLicenseOption] = useState('none'); // annual | temporary | none
    const [payMode, setPayMode] = useState('both'); // both | self

    const [licenseInfo, setLicenseInfo] = useState({ active: false, label: 'No active license' });

    const [hasRankedinAccount, setHasRankedinAccount] = useState(null);
    const [selfPlaytomicLevel, setSelfPlaytomicLevel] = useState('');

    const [agreeRules, setAgreeRules] = useState(false);
    const [agreeComplete, setAgreeComplete] = useState(false);
    const [agreeSapa, setAgreeSapa] = useState(false);
    const [showRulesModal, setShowRulesModal] = useState(false);

    const [partnerSearch, setPartnerSearch] = useState({ query: '', results: [] });
    const [expandedDivisions, setExpandedDivisions] = useState({});
    const [divisionsBlockOpen, setDivisionsBlockOpen] = useState(true);
    const [divisionPartnerSearch, setDivisionPartnerSearch] = useState({});
    const [partnerLicenseCache, setPartnerLicenseCache] = useState({});
    const partnerSearchSeq = useRef(0);
    const partnerSearchTimeout = useRef(null);
    const divisionPartnerSearchSeq = useRef({});
    const divisionPartnerSearchTimeout = useRef({});
    const paymentRetryRef = useRef(false);
    const [confirmedPaidTotal, setConfirmedPaidTotal] = useState(null);
    const [isCalendarMenuOpen, setIsCalendarMenuOpen] = useState(false);

    const accent = theme?.fill || '#CCFF00';
    const btnTextColor = theme?.primaryText?.includes('text-white') ? '#ffffff' : '#0F172A';

    const hasLicense = licenseInfo.active;

    const displayProfile = profile || initialPlayer;
    const inviterDisplayName = useMemo(
        () => profile?.name || displayProfile?.name || (userEmail ? userEmail.split('@')[0] : 'A 4M Padel player'),
        [profile?.name, displayProfile?.name, userEmail],
    );
    const profileImageUrl = displayProfile?.image_url?.trim() || null;

    const sapaPoints = displayProfile?.points ?? null;

    useEffect(() => {
        const level = displayProfile?.level?.trim();
        if (level) setSelfPlaytomicLevel((prev) => prev || level);
    }, [displayProfile?.level]);

    const resolveLicense = useCallback(async (player, eventId) => {
        if (!player) return { active: false, label: 'No active license' };

        const lt = String(player.license_type || 'none').toLowerCase();

        if (lt === 'full') {
            return { active: true, label: 'Annual SAPA License Active' };
        }

        if (lt === 'temporary') {
            const hasEmbeddedForEvent = player.temporary_licenses?.some((lic) => lic.event_id === eventId);
            if (hasEmbeddedForEvent) {
                return { active: true, label: 'Temporary SAPA License Active' };
            }

            const { data: tempLic } = await supabase
                .from('temporary_licenses')
                .select('id, event_date')
                .eq('player_id', player.id)
                .eq('event_id', eventId)
                .maybeSingle();
            if (tempLic) {
                return { active: true, label: 'Temporary SAPA License Active' };
            }

            const { data: latestTemp } = await supabase
                .from('temporary_licenses')
                .select('id, event_date, event_id')
                .eq('player_id', player.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestTemp?.event_date) {
                const eventDate = new Date(latestTemp.event_date);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (eventDate >= today && latestTemp.event_id === eventId) {
                    return { active: true, label: 'Temporary SAPA License Active' };
                }
            }

            return { active: false, label: 'No active license for this event' };
        }

        if (player.paid_registration === true) {
            return { active: true, label: 'SAPA License Active' };
        }

        return { active: false, label: 'No active license' };
    }, []);

    const loadDivisions = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('tournament_divisions')
            .select('id, event_id, name, entry_fee, format, entries_close_at, license_required, age_category, gender, sort_order, is_active, details')
            .eq('event_id', event.id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        if (error) {
            console.error('[ManualEventRegistration] loadDivisions failed:', error.message);
        }
        setDivisions(data || []);
        setLoading(false);
    }, [event.id]);

    const loadDivisionRegs = useCallback(async () => {
        const { data } = await supabase
            .from('event_registrations')
            .select('id, email, full_name, partner_name, partner_email, division_id, division, status, registered_by, payment_status')
            .eq('event_id', event.id)
            .neq('status', 'withdrawn');
        setDivisionRegs(data || []);
    }, [event.id]);

    const loadMyRegs = useCallback(async () => {
        if (!userEmail) { setMyRegs([]); return; }
        const { data } = await supabase
            .from('event_registrations')
            .select('*')
            .eq('event_id', event.id)
            .eq('email', userEmail)
            .neq('status', 'withdrawn');
        let regs = data || [];

        const payerEmails = [...new Set(
            regs
                .map((r) => (r.registered_by || '').toLowerCase())
                .filter((em) => em && em !== userEmail.toLowerCase())
        )];

        const payerNames = {};
        if (payerEmails.length > 0) {
            const { data: payerRows } = await supabase
                .from('event_registrations')
                .select('email, full_name')
                .eq('event_id', event.id)
                .in('email', payerEmails);
            for (const row of payerRows || []) {
                const em = (row.email || '').toLowerCase();
                if (em && row.full_name) payerNames[em] = row.full_name;
            }
            for (const em of payerEmails.filter((e) => !payerNames[e])) {
                const { data: p } = await supabase.from('players').select('name').ilike('email', em).maybeSingle();
                if (p?.name) payerNames[em] = p.name;
            }
        }

        regs = regs.map((r) => {
            const rb = (r.registered_by || '').toLowerCase();
            if (!rb || rb === userEmail.toLowerCase()) return r;
            let name = r.partner_name;
            if (!name || (r.partner_email || '').toLowerCase() !== rb) name = payerNames[rb] || null;
            return { ...r, _payerName: name };
        });

        setMyRegs(regs);
    }, [event.id, userEmail]);

    const loadProfile = useCallback(async () => {
        if (!userEmail) {
            setProfile(null);
            setLicenseInfo({ active: false, label: 'No active license' });
            return;
        }
        const { data, error } = await supabase
            .from('players')
            .select('id, name, contact_number, email, license_type, paid_registration, image_url, points, level, approved, rankedin_id, temporary_licenses(event_id, event_date)')
            .ilike('email', userEmail)
            .maybeSingle();
        if (error) {
            console.error('[ManualEventRegistration] profile load failed:', error.message);
        }
        setProfile(data || null);
        const lic = await resolveLicense(data, event.id);
        setLicenseInfo(lic);
    }, [userEmail, event.id, resolveLicense]);

    useEffect(() => {
        if (!initialPlayer || !userEmail) return;
        if (initialPlayer.email?.toLowerCase() !== userEmail.toLowerCase()) return;
        if (!profile) {
            setProfile(initialPlayer);
            resolveLicense(initialPlayer, event.id).then(setLicenseInfo);
        }
    }, [initialPlayer, userEmail, event.id, profile, resolveLicense]);

    useEffect(() => {
        loadDivisions();
        loadDivisionRegs();
        loadProfile();
        loadMyRegs();
    }, [loadDivisions, loadDivisionRegs, loadProfile, loadMyRegs]);

    useEffect(() => {
        if (profile?.rankedin_id) {
            setHasRankedinAccount((prev) => (prev === null ? true : prev));
        }
    }, [profile?.rankedin_id]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('pay_token');
        if (!token) return;
        (async () => {
            const { data } = await supabase
                .from('event_registrations')
                .select('*')
                .eq('pay_token', token)
                .eq('event_id', event.id)
                .maybeSingle();
            if (data && data.payment_status !== 'paid') {
                setShowWizard(true);
                setWizardStep(4);
                toast.info(`Complete your payment for ${data.division}`);
                const div = (await supabase.from('tournament_divisions').select('*').eq('id', data.division_id).maybeSingle()).data;
                if (div) {
                    setSelected({ [div.id]: { partnerName: data.partner_name || '', partnerEmail: data.partner_email || '', partnerId: null, partnerProfile: null, payForSelf: true, payForPartner: false } });
                }
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [event.id]);

    const registeredDivisionIds = useMemo(() => new Set(
        myRegs
            .filter((reg) => {
                if (reg.payment_status === 'paid') return true;
                const div = divisions.find((d) => d.id === reg.division_id);
                return div && Number(div.entry_fee || 0) === 0;
            })
            .map((r) => r.division_id),
    ), [myRegs, divisions]);

    const confirmedRegs = useMemo(
        () => myRegs.filter((reg) => {
            if (reg.payment_status === 'paid') return true;
            const div = divisions.find((d) => d.id === reg.division_id);
            return div && Number(div.entry_fee || 0) === 0;
        }),
        [myRegs, divisions],
    );

    const pendingPaymentRegs = useMemo(
        () => myRegs.filter((reg) => {
            if (reg.payment_status === 'paid') return false;
            const div = divisions.find((d) => d.id === reg.division_id);
            return div && Number(div.entry_fee || 0) > 0;
        }),
        [myRegs, divisions]
    );

    const hasPendingPayment = pendingPaymentRegs.length > 0;
    const hasRegistrations = confirmedRegs.length > 0;
    const allRegistrationsPaid = hasRegistrations && confirmedRegs.every((reg) => {
        if (reg.payment_status === 'paid') return true;
        const div = divisions.find((d) => d.id === reg.division_id);
        return !div || Number(div.entry_fee || 0) === 0;
    });
    const hasAnyRegistration = myRegs.length > 0;

    const registrationEntries = useMemo(
        () => myRegs.map((reg) => {
            const div = divisions.find((d) => d.id === reg.division_id);
            const fee = Number(div?.entry_fee || 0);
            const isPaid = reg.payment_status === 'paid' || fee === 0;
            return {
                id: reg.id,
                division: reg.division,
                partnerName: reg.partner_name?.trim() || null,
                paymentLabel: getEntryPaymentLabel(reg, userEmail),
                isPaid,
                statusText: isPaid ? 'Paid & Confirmed' : 'Payment Pending',
                statusClassName: isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700',
            };
        }),
        [myRegs, divisions, userEmail],
    );

    const divisionsAvailableToRegister = useMemo(
        () => divisions.filter((d) => !registeredDivisionIds.has(d.id) && !isClosed(d, event)),
        [divisions, registeredDivisionIds, event]
    );
    const canAddDivision = divisionsAvailableToRegister.length > 0;

    const divisionMetaLine = (d) => {
        const saved = getDivisionSavedDetails(d);
        if (saved) return saved;
        return [d.format, fmtRWhole(d.entry_fee), d.license_required ? 'License req.' : null].filter(Boolean).join(' · ');
    };

    const formatDivisionCloseDate = (d) => {
        const closeAt = d.entries_close_at || event?.registration_closes_at;
        if (!closeAt) return null;
        return new Date(closeAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const restoreSelectedFromPending = useCallback(async () => {
        const pendingSelf = myRegs.filter((reg) => {
            if (reg.payment_status === 'paid') return false;
            const div = divisions.find((d) => d.id === reg.division_id);
            return div && Number(div.entry_fee || 0) > 0;
        });
        if (pendingSelf.length === 0) return false;

        const { data: partnerRows } = await supabase
            .from('event_registrations')
            .select('*')
            .eq('event_id', event.id)
            .eq('registered_by', userEmail)
            .neq('status', 'withdrawn')
            .neq('email', userEmail);

        const pendingPartner = (partnerRows || []).filter((reg) => {
            if (reg.payment_status === 'paid') return false;
            const div = divisions.find((d) => d.id === reg.division_id);
            return div && Number(div.entry_fee || 0) > 0;
        });

        const hasPartnerEntry = pendingSelf.some((r) => r.partner_name || r.partner_email) || pendingPartner.length > 0;
        setHasPartner(hasPartnerEntry);
        setPayMode(pendingPartner.length > 0 ? 'both' : 'self');

        const next = {};
        for (const reg of pendingSelf) {
            const div = divisions.find((d) => d.id === reg.division_id);
            if (!div) continue;

            let partnerProfile = null;
            if (reg.partner_email) {
                const { data: p } = await supabase
                    .from('players')
                    .select('id, name, email, image_url, license_type, paid_registration')
                    .ilike('email', reg.partner_email)
                    .maybeSingle();
                partnerProfile = p;
            }

            const partnerRow = pendingPartner.find((p) => p.division_id === reg.division_id);
            next[reg.division_id] = {
                partnerName: reg.partner_name || partnerRow?.full_name || '',
                partnerEmail: reg.partner_email || partnerRow?.email || '',
                partnerId: partnerProfile?.id || null,
                partnerProfile,
                payForSelf: true,
                payForPartner: !!partnerRow,
            };
        }
        setSelected(next);
        return true;
    }, [myRegs, divisions, event.id, userEmail]);

    const openPayWizard = useCallback(async () => {
        if (!userEmail) { promptMembersOnly(); return; }
        const restored = await restoreSelectedFromPending();
        if (!restored) { toast.error('No outstanding payment found'); return; }
        paymentRetryRef.current = true;
        setAgreeRules(false);
        setAgreeComplete(false);
        setAgreeSapa(false);
        await loadProfile();
        setWizardStep(4);
        setShowWizard(true);
    }, [userEmail, restoreSelectedFromPending, loadProfile, promptMembersOnly]);

    useEffect(() => {
        onStatusChange?.({
            hasPendingPayment,
            hasRegistrations,
            allRegistrationsPaid,
            hasAnyRegistration,
            entries: registrationEntries,
            canAddDivision: divisionsAvailableToRegister.length > 0,
        });
        if (registrationActionsRef) {
            registrationActionsRef.current = {
                openPayFlow: openPayWizard,
                openRegistration: () => {
                    if (!userEmail) {
                        promptMembersOnly();
                        return;
                    }
                    paymentRetryRef.current = false;
                    setWizardStep(1);
                    setHasRankedinAccount(null);
                    setAgreeRules(false);
                    setAgreeComplete(false);
                    setAgreeSapa(false);
                    loadProfile();
                    loadDivisionRegs();
                    loadDivisions();
                    setShowWizard(true);
                },
            };
        }
    }, [
        hasPendingPayment,
        hasRegistrations,
        allRegistrationsPaid,
        hasAnyRegistration,
        registrationEntries,
        divisionsAvailableToRegister.length,
        onStatusChange,
        registrationActionsRef,
        openPayWizard,
        loadProfile,
        loadDivisionRegs,
        loadDivisions,
        promptMembersOnly,
        userEmail,
    ]);

    const resetWizardState = () => {
        setWizardStep(1);
        setSelected({});
        setHasPartner(false);
        setConfirmedPaidTotal(null);
        setAgreeRules(false);
        setAgreeComplete(false);
        setAgreeSapa(false);
        setBuyLicenseSelf(false);
        setBuyLicensePartner(false);
        setPartnerLicenseOption('none');
        setPayMode('both');
        setExpandedDivisions({});
        setDivisionPartnerSearch({});
        setIsCalendarMenuOpen(false);
        paymentRetryRef.current = false;
    };

    const openWizard = () => {
        if (!userEmail) {
            promptMembersOnly();
            return;
        }
        paymentRetryRef.current = false;
        setConfirmedPaidTotal(null);
        setWizardStep(1);
        setHasRankedinAccount(null);
        setSelfPlaytomicLevel('');
        setAgreeRules(false);
        setAgreeComplete(false);
        setAgreeSapa(false);
        loadProfile();
        loadDivisionRegs();
        loadDivisions();
        setShowWizard(true);
    };

    const closeWizard = () => {
        if (processing) return;
        resetWizardState();
        setShowWizard(false);
    };

    const finishRegistrationWizard = () => {
        resetWizardState();
        setShowWizard(false);
        navigate('/profile?tab=events');
    };

    const toggleDivision = (div) => {
        if (isClosed(div, event)) { toast.error('Entries have closed for this division'); return; }
        if (registeredDivisionIds.has(div.id)) return;
        setSelected((prev) => {
            const next = { ...prev };
            if (next[div.id]) delete next[div.id];
            else next[div.id] = {
                partnerName: '',
                partnerEmail: '',
                partnerId: null,
                partnerProfile: null,
                payForSelf: true,
                payForPartner: true,
                partnerLicenseChoice: null,
                partnerPlaytomicLevel: '',
                linkSoloRegId: null,
            };
            return next;
        });
        setExpandedDivisions((prev) => {
            const next = { ...prev };
            if (next[div.id]) delete next[div.id];
            else next[div.id] = true;
            return next;
        });
    };

    const setDivisionPayFlag = (divId, field, value) => {
        setSelected((prev) => ({
            ...prev,
            [divId]: { ...prev[divId], [field]: value },
        }));
    };

    const isSelfDivisionPaid = (divisionId) =>
        myRegs.some((r) => r.division_id === divisionId && r.email?.toLowerCase() === userEmail?.toLowerCase() && r.payment_status === 'paid');

    const isPartnerDivisionPaid = (divisionId) =>
        myRegs.some((r) => r.division_id === divisionId && r.partner_payment_status === 'paid');

    const isSelfPayingDivision = (divId, sel) => {
        if (isSelfDivisionPaid(divId)) return false;
        return sel?.payForSelf !== false;
    };

    const syncPartnerAll = (patch) => {
        setSelected((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((id) => { next[id] = { ...next[id], ...patch }; });
            return next;
        });
    };

    const primaryPartner = useMemo(() => {
        const firstKey = Object.keys(selected)[0];
        return firstKey ? selected[firstKey] : { partnerName: '', partnerEmail: '', partnerId: null, partnerProfile: null, payForPartner: false };
    }, [selected]);

    const [partnerLicenseInfo, setPartnerLicenseInfo] = useState({ active: false, label: 'No active license' });

    const resolvePartnerLicense = useCallback(async (player) => {
        if (!player) return { active: false, label: 'No active license' };

        const lt = String(player.license_type || 'none').toLowerCase();

        if (lt === 'full') {
            return { active: true, label: 'Annual SAPA License Active' };
        }

        if (lt === 'temporary') {
            const { data: tempLic } = await supabase
                .from('temporary_licenses')
                .select('id')
                .eq('player_id', player.id)
                .eq('event_id', event.id)
                .maybeSingle();
            if (tempLic) {
                return { active: true, label: 'Temporary SAPA License Active' };
            }
            return { active: false, label: 'No active license for this event' };
        }

        if (player.paid_registration === true) {
            return { active: true, label: 'SAPA License Active' };
        }

        return { active: false, label: 'No active license' };
    }, [event.id]);

    const clearPartner = () => {
        partnerSearchSeq.current += 1;
        if (partnerSearchTimeout.current) clearTimeout(partnerSearchTimeout.current);
        syncPartnerAll({ partnerName: '', partnerEmail: '', partnerId: null, partnerProfile: null, linkSoloRegId: null });
        setPartnerSearch({ query: '', results: [] });
    };

    const runPartnerSearch = useCallback(async (searchTerm) => {
        if (!searchTerm || searchTerm.length < 2) {
            setPartnerSearch((p) => ({ ...p, results: [], hasSearched: false }));
            return;
        }

        const seq = ++partnerSearchSeq.current;
        const excludeId = profile?.id || displayProfile?.id;
        let playerQuery = supabase
            .from('players')
            .select('id, name, email, license_type, paid_registration, image_url, level')
            .or(`name.ilike.%${searchTerm.trim()}%,email.ilike.%${searchTerm.trim()}%`)
            .limit(8);
        if (excludeId) playerQuery = playerQuery.neq('id', excludeId);

        const { data } = await playerQuery;
        if (seq !== partnerSearchSeq.current) return;

        const results = (data || []).map((p) => {
            const divs = divisions.filter((d) => selected[d.id]);
            for (const d of divs) {
                const check = getPartnerAvailability(divisionRegs, d.id, p, d.name);
                if (!check.ok) {
                    return { ...p, _unavailable: true, _unavailableMessage: check.message };
                }
            }
            return { ...p, _unavailable: false, _unavailableMessage: null };
        });

        setPartnerSearch((p) => (p.query === searchTerm ? { ...p, results, hasSearched: true } : p));
    }, [profile?.id, displayProfile?.id, divisionRegs, divisions, selected]);

    const handlePartnerSearchInput = (value) => {
        setPartnerSearch((prev) => ({ ...prev, query: value, results: value.length < 2 ? [] : prev.results }));

        if (primaryPartner.partnerId) {
            syncPartnerAll({ partnerName: '', partnerEmail: '', partnerId: null, partnerProfile: null, linkSoloRegId: null });
        }

        if (partnerSearchTimeout.current) clearTimeout(partnerSearchTimeout.current);

        if (!value || value.length < 2) {
            partnerSearchSeq.current += 1;
            setPartnerSearch((prev) => ({ ...prev, results: [] }));
            return;
        }

        partnerSearchTimeout.current = setTimeout(() => {
            runPartnerSearch(value);
        }, 350);
    };

    useEffect(() => () => {
        if (partnerSearchTimeout.current) clearTimeout(partnerSearchTimeout.current);
    }, []);

    const selectPartner = (p) => {
        if (p._unavailable) {
            toast.error(p._unavailableMessage || 'This player is not available for the selected divisions');
            return;
        }

        for (const d of selectedDivisions) {
            const check = getPartnerAvailability(divisionRegs, d.id, p, d.name);
            if (!check.ok) {
                toast.error(check.message);
                return;
            }
        }

        setSelected((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((divId) => {
                const div = divisions.find((d) => d.id === divId);
                const check = getPartnerAvailability(divisionRegs, divId, p, div?.name);
                let inheritedLicenseChoice = null;
                for (const id of Object.keys(prev)) {
                    if (id !== divId && prev[id]?.partnerId === p.id && prev[id]?.partnerLicenseChoice) {
                        inheritedLicenseChoice = prev[id].partnerLicenseChoice;
                        break;
                    }
                }
                next[divId] = {
                    ...next[divId],
                    partnerName: p.name,
                    partnerEmail: p.email || '',
                    partnerId: p.id,
                    partnerProfile: p,
                    partnerLicenseChoice: inheritedLicenseChoice,
                    partnerPlaytomicLevel: p.level?.trim() || '',
                    linkSoloRegId: check.linkSoloRegId || null,
                };
            });
            return next;
        });
        setPartnerSearch({ query: '', results: [] });
        cachePartnerLicense(p);
    };

    const getDivisionMeta = (division) => {
        const parts = [];
        const fee = Number(division.entry_fee || 0);
        if (fee > 0) parts.push(`Entry fee: ${fmtRWhole(fee)} per player`);
        if (division.format) parts.push(`Format: ${division.format}`);
        if (division.license_required) parts.push('SAPA license required');
        return parts.join(' · ');
    };

    const getPartnerLicenseInfo = (partnerId) =>
        (partnerId ? partnerLicenseCache[partnerId] : null) || { active: false, label: 'No active license' };

    const cachePartnerLicense = useCallback(async (player) => {
        if (!player?.id) return { active: false, label: 'No active license' };
        const lic = await resolvePartnerLicense(player);
        setPartnerLicenseCache((prev) => (prev[player.id] ? prev : { ...prev, [player.id]: lic }));
        return lic;
    }, [resolvePartnerLicense]);

    const setDivisionPartner = (divId, player) => {
        if (player._unavailable) {
            toast.error(player._unavailableMessage || 'This player is not available for this division');
            return;
        }

        const div = divisions.find((d) => d.id === divId);
        const check = getPartnerAvailability(divisionRegs, divId, player, div?.name);
        if (!check.ok) {
            toast.error(check.message);
            return;
        }

        setSelected((prev) => {
            let inheritedLicenseChoice = null;
            for (const id of Object.keys(prev)) {
                if (id !== divId && prev[id]?.partnerId === player.id && prev[id]?.partnerLicenseChoice) {
                    inheritedLicenseChoice = prev[id].partnerLicenseChoice;
                    break;
                }
            }
            return {
                ...prev,
                [divId]: {
                    ...prev[divId],
                    partnerName: player.name,
                    partnerEmail: player.email || '',
                    partnerId: player.id,
                    partnerProfile: player,
                    partnerLicenseChoice: inheritedLicenseChoice,
                    partnerPlaytomicLevel: player.level?.trim() || '',
                    linkSoloRegId: check.linkSoloRegId || player._soloRegId || null,
                },
            };
        });
        setDivisionPartnerSearch((prev) => ({ ...prev, [divId]: { query: '', results: [], open: false } }));
        if (player.id) cachePartnerLicense(player);
    };

    const clearDivisionPartner = (divId) => {
        divisionPartnerSearchSeq.current[divId] = (divisionPartnerSearchSeq.current[divId] || 0) + 1;
        if (divisionPartnerSearchTimeout.current[divId]) {
            clearTimeout(divisionPartnerSearchTimeout.current[divId]);
        }
        setSelected((prev) => ({
            ...prev,
            [divId]: {
                ...prev[divId],
                partnerName: '',
                partnerEmail: '',
                partnerId: null,
                partnerProfile: null,
                partnerLicenseChoice: null,
                partnerPlaytomicLevel: '',
                payForPartner: true,
                linkSoloRegId: null,
            },
        }));
        setDivisionPartnerSearch((prev) => ({
            ...prev,
            [divId]: { query: '', results: [], open: false },
        }));
    };

    const setDivisionPayMode = (divId, mode) => {
        setSelected((prev) => ({
            ...prev,
            [divId]: {
                ...prev[divId],
                payForPartner: mode === 'self',
                partnerLicenseChoice: mode === 'self' ? prev[divId]?.partnerLicenseChoice : null,
            },
        }));
    };

    const setDivisionPartnerLicenseChoice = (divId, choice) => {
        setSelected((prev) => {
            const partnerId = prev[divId]?.partnerId;
            if (!partnerId) {
                return { ...prev, [divId]: { ...prev[divId], partnerLicenseChoice: choice } };
            }
            const next = { ...prev };
            for (const id of Object.keys(next)) {
                if (next[id]?.partnerId === partnerId) {
                    next[id] = { ...next[id], partnerLicenseChoice: choice };
                }
            }
            return next;
        });
    };

    const setDivisionPartnerPlaytomicLevel = (divId, value) => {
        setSelected((prev) => ({
            ...prev,
            [divId]: { ...prev[divId], partnerPlaytomicLevel: value },
        }));
    };

    const runDivisionPartnerSearch = useCallback(async (divId, searchTerm) => {
        if (!searchTerm || searchTerm.length < 2) {
            setDivisionPartnerSearch((prev) => ({
                ...prev,
                [divId]: { ...(prev[divId] || {}), query: searchTerm, results: [], open: true, hasSearched: false },
            }));
            return;
        }

        const seq = (divisionPartnerSearchSeq.current[divId] || 0) + 1;
        divisionPartnerSearchSeq.current[divId] = seq;
        const excludeId = profile?.id || displayProfile?.id;
        const term = searchTerm.trim().toLowerCase();
        const div = divisions.find((d) => d.id === divId);

        let playerQuery = supabase
            .from('players')
            .select('id, name, email, license_type, paid_registration, image_url, level')
            .or(`name.ilike.%${searchTerm.trim()}%,email.ilike.%${searchTerm.trim()}%`)
            .limit(8);
        if (excludeId) playerQuery = playerQuery.neq('id', excludeId);

        const { data } = await playerQuery;
        if (seq !== divisionPartnerSearchSeq.current[divId]) return;

        const regMatches = (divisionRegs || [])
            .filter((r) => r.division_id === divId && r.status !== 'withdrawn')
            .filter((r) => normEmail(r.email) !== normEmail(userEmail))
            .filter((r) => `${r.full_name || ''} ${r.email || ''}`.toLowerCase().includes(term))
            .map((r) => ({
                id: null,
                name: r.full_name,
                email: r.email,
                image_url: null,
                level: '',
            }));

        const seen = new Set();
        const merged = [];
        for (const p of [...(data || []), ...regMatches]) {
            const em = normEmail(p.email);
            if (!em || seen.has(em)) continue;
            seen.add(em);
            const check = getPartnerAvailability(divisionRegs, divId, p, div?.name);
            merged.push({
                ...p,
                _soloRegId: check.linkSoloRegId || null,
                _isSoloRegistrant: !!check.isSoloLink,
                _unavailable: !check.ok,
                _unavailableMessage: check.ok ? null : check.message,
            });
        }

        setDivisionPartnerSearch((prev) => ({
            ...prev,
            [divId]: { query: searchTerm, results: merged.slice(0, 8), open: true, hasSearched: true },
        }));
    }, [profile?.id, displayProfile?.id, divisionRegs, divisions, userEmail]);

    const handleDivisionPartnerSearch = (divId, value) => {
        setDivisionPartnerSearch((prev) => ({
            ...prev,
            [divId]: { ...(prev[divId] || {}), query: value, open: true, results: value.length < 2 ? [] : (prev[divId]?.results || []) },
        }));

        if (selected[divId]?.partnerId) {
            setSelected((prev) => ({
                ...prev,
                [divId]: {
                    ...prev[divId],
                    partnerName: '',
                    partnerEmail: '',
                    partnerId: null,
                    partnerProfile: null,
                    partnerLicenseChoice: null,
                    partnerPlaytomicLevel: '',
                    linkSoloRegId: null,
                },
            }));
        }

        if (divisionPartnerSearchTimeout.current[divId]) {
            clearTimeout(divisionPartnerSearchTimeout.current[divId]);
        }

        if (!value || value.length < 2) {
            divisionPartnerSearchSeq.current[divId] = (divisionPartnerSearchSeq.current[divId] || 0) + 1;
            setDivisionPartnerSearch((prev) => ({
                ...prev,
                [divId]: { query: value, results: [], open: true, hasSearched: false },
            }));
            return;
        }

        divisionPartnerSearchTimeout.current[divId] = setTimeout(() => {
            runDivisionPartnerSearch(divId, value);
        }, 350);
    };

    const selectedDivisions = useMemo(
        () => divisions.filter((d) => selected[d.id]),
        [divisions, selected]
    );

    useEffect(() => {
        selectedDivisions.forEach((d) => {
            const sel = selected[d.id];
            if (sel?.partnerProfile?.id && !partnerLicenseCache[sel.partnerProfile.id]) {
                cachePartnerLicense(sel.partnerProfile);
            }
        });
    }, [selectedDivisions, selected, partnerLicenseCache, cachePartnerLicense]);

    const anySelectedRequiresLicense = useMemo(
        () => selectedDivisions.some((d) => d.license_required),
        [selectedDivisions]
    );

    const showPartnerLicenseWarning = useMemo(() => {
        if (!anySelectedRequiresLicense || !primaryPartner.partnerName) return false;
        return !partnerLicenseInfo.active;
    }, [anySelectedRequiresLicense, primaryPartner.partnerName, partnerLicenseInfo.active]);

    const showPartnerLicenseOptions = showPartnerLicenseWarning;

    useEffect(() => {
        if (!primaryPartner.partnerProfile) {
            setPartnerLicenseInfo({ active: false, label: 'No active license' });
            return;
        }
        resolvePartnerLicense(primaryPartner.partnerProfile).then(setPartnerLicenseInfo);
    }, [primaryPartner.partnerProfile, resolvePartnerLicense]);

    useEffect(() => {
        if (anySelectedRequiresLicense && !hasLicense) setBuyLicenseSelf(true);
    }, [anySelectedRequiresLicense, hasLicense]);

    useEffect(() => {
        if (partnerLicenseOption === 'annual') {
            setBuyLicensePartner(true);
            setLicensePartnerChoice('full');
        } else if (partnerLicenseOption === 'temporary') {
            setBuyLicensePartner(true);
            setLicensePartnerChoice('temporary');
        } else {
            setBuyLicensePartner(false);
        }
    }, [partnerLicenseOption]);

    useEffect(() => {
        const payForPartner = payMode === 'both';
        setSelected((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((id) => { next[id] = { ...next[id], payForPartner }; });
            return next;
        });
    }, [payMode]);

    useEffect(() => {
        const anyPartnerPaid = selectedDivisions.some(d => isPartnerDivisionPaid(d.id));
        if (anyPartnerPaid && payMode === 'both') {
            setPayMode('self');
        }
    }, [selectedDivisions, myRegs, payMode]);

    const licenseFee = (choice) => (choice === 'full' ? FEES.FULL_LICENSE : FEES.TEMPORARY_LICENSE);

    const partnerLicensePurchases = useMemo(() => {
        const byPartnerId = new Map();
        for (const d of selectedDivisions) {
            const sel = selected[d.id];
            if (!sel?.payForPartner || !sel?.partnerLicenseChoice || !sel?.partnerId) continue;
            const lic = getPartnerLicenseInfo(sel.partnerId);
            if (lic.active) continue;
            const choice = sel.partnerLicenseChoice === 'full' ? 'full' : 'temporary';
            const existing = byPartnerId.get(sel.partnerId);
            if (!existing) {
                byPartnerId.set(sel.partnerId, {
                    partnerId: sel.partnerId,
                    partnerName: sel.partnerName,
                    partnerEmail: sel.partnerEmail,
                    choice,
                });
            } else if (choice === 'full') {
                existing.choice = 'full';
            }
        }
        return Array.from(byPartnerId.values());
    }, [selectedDivisions, selected, partnerLicenseCache]);

    const getEventPartnerLicenseChoice = (partnerId) => {
        if (!partnerId) return null;
        for (const d of selectedDivisions) {
            const sel = selected[d.id];
            if (sel?.partnerId === partnerId && sel?.partnerLicenseChoice) {
                return sel.partnerLicenseChoice;
            }
        }
        return null;
    };

    const getPrimaryPartnerLicenseDivisionId = (partnerId) => {
        if (!partnerId) return null;
        for (const d of selectedDivisions) {
            const sel = selected[d.id];
            if (sel?.partnerId !== partnerId || sel?.payForPartner === false || !d.license_required) continue;
            const lic = getPartnerLicenseInfo(sel.partnerId);
            if (!lic.active) return d.id;
        }
        return null;
    };

    const subtotal = useMemo(() => {
        let t = 0;
        for (const d of selectedDivisions) {
            const sel = selected[d.id];
            const fee = Number(d.entry_fee || 0);
            if (isSelfPayingDivision(d.id, sel)) t += fee;
            if (sel?.partnerName && sel?.payForPartner) t += fee;
        }
        if (buyLicenseSelf) t += licenseFee(licenseSelfChoice);
        for (const purchase of partnerLicensePurchases) {
            t += licenseFee(purchase.choice);
        }
        return t;
    }, [selectedDivisions, selected, myRegs, buyLicenseSelf, licenseSelfChoice, partnerLicensePurchases, userEmail]);

    const total = subtotal;

    const entrySummary = useMemo(() => {
        const selfName = displayProfile?.name || profile?.name || 'You';
        const selfDivisions = [];

        for (const d of selectedDivisions) {
            const sel = selected[d.id];
            const fee = Number(d.entry_fee || 0);
            if (isSelfPayingDivision(d.id, sel)) selfDivisions.push({ name: d.name, fee });
        }

        const players = [];
        if (selfDivisions.length > 0) {
            players.push({
                name: selfName,
                role: 'You',
                divisions: selfDivisions,
                total: selfDivisions.reduce((sum, div) => sum + div.fee, 0),
            });
        }
        const partnerGroups = {};
        for (const d of selectedDivisions) {
            const sel = selected[d.id];
            const fee = Number(d.entry_fee || 0);
            if (sel?.partnerName && sel?.payForPartner) {
                const key = sel.partnerEmail || sel.partnerName;
                if (!partnerGroups[key]) {
                    partnerGroups[key] = { name: sel.partnerName, divisions: [] };
                }
                partnerGroups[key].divisions.push({ name: d.name, fee });
            }
        }
        for (const group of Object.values(partnerGroups)) {
            players.push({
                name: group.name,
                role: 'Partner',
                divisions: group.divisions,
                total: group.divisions.reduce((sum, div) => sum + div.fee, 0),
            });
        }

        const extras = [];
        if (buyLicenseSelf) {
            extras.push({
                label: licenseSelfChoice === 'full' ? 'Annual SAPA license' : 'Temporary SAPA license',
                amount: licenseFee(licenseSelfChoice),
            });
        }
        for (const purchase of partnerLicensePurchases) {
            extras.push({
                label: purchase.choice === 'full'
                    ? `Partner annual license — ${purchase.partnerName}`
                    : `Partner temporary license — ${purchase.partnerName}`,
                amount: licenseFee(purchase.choice),
            });
        }

        return { players, extras };
    }, [
        selectedDivisions, selected, myRegs, buyLicenseSelf, licenseSelfChoice,
        partnerLicenseCache, partnerLicensePurchases, profile?.name, displayProfile?.name,
    ]);

    const reviewPaySummary = useMemo(() => {
        const selfName = displayProfile?.name || profile?.name || 'You';
        const entries = selectedDivisions.map((d) => {
            const sel = selected[d.id];
            const fee = Number(d.entry_fee || 0);
            const selfPays = isSelfPayingDivision(d.id, sel);
            const userPaysPartner = !!(sel?.partnerName && sel?.payForPartner);
            const payerCount = (selfPays ? 1 : 0) + (userPaysPartner ? 1 : 0);

            const hasPartner = !!(sel?.partnerName && sel?.partnerEmail);
            const payTag = !hasPartner
                ? 'Your Entry'
                : userPaysPartner
                    ? 'You Paying both Entries'
                    : 'Partner Pays Their Entry';

            return {
                id: d.id,
                divisionName: d.name,
                selfName,
                partnerName: sel?.partnerName || null,
                partnerImageUrl: sel?.partnerProfile?.image_url?.trim() || null,
                hasPartner,
                payTag,
                payerCount,
                fee,
                entryTotal: payerCount * fee,
            };
        });

        const entryFeesTotal = entries.reduce((sum, entry) => sum + entry.entryTotal, 0);

        const licenseLines = [];
        if (buyLicenseSelf || (!hasLicense && anySelectedRequiresLicense)) {
            licenseLines.push({
                label: licenseSelfChoice === 'full' ? 'Your SAPA annual license' : 'Your SAPA temporary license',
                amount: licenseFee(licenseSelfChoice),
            });
        }
        for (const purchase of partnerLicensePurchases) {
            licenseLines.push({
                label: purchase.choice === 'full'
                    ? `${purchase.partnerName} annual SAPA license`
                    : `${purchase.partnerName} temporary SAPA license`,
                amount: licenseFee(purchase.choice),
            });
        }

        const licensesSubtotal = licenseLines.reduce((sum, line) => sum + line.amount, 0);

        return {
            entries,
            entryFeesTotal,
            licenseLines,
            licensesSubtotal,
            totalPayable: entryFeesTotal + licensesSubtotal,
        };
    }, [
        selectedDivisions, selected, myRegs, buyLicenseSelf, licenseSelfChoice,
        hasLicense, anySelectedRequiresLicense, partnerLicenseCache, partnerLicensePurchases,
        profile?.name, displayProfile?.name, profileImageUrl,
    ]);

    const lineItems = useMemo(() => {
        const items = [];
        for (const player of entrySummary.players) {
            for (const div of player.divisions) {
                items.push({
                    label: `${player.name} — ${div.name}`,
                    amount: div.fee,
                });
            }
        }
        for (const extra of entrySummary.extras) {
            items.push({ label: extra.label, amount: extra.amount });
        }
        return items;
    }, [entrySummary]);

    const eventUrl = `${window.location.origin}/calendar/${event.slug || event.id}`;

    const handleGoogleCalendar = useCallback(() => {
        const data = getEventCalendarData(event);
        if (!data) return;
        const formatGDate = (date) => date.toISOString().replace(/-|:|\.\d\d\d/g, '');
        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(data.title)}&dates=${formatGDate(data.start)}/${formatGDate(data.end)}&details=${encodeURIComponent(data.description)}&location=${encodeURIComponent(data.location)}`;
        window.open(url, '_blank');
        setIsCalendarMenuOpen(false);
    }, [event]);

    const handleAppleCalendar = useCallback(() => {
        const data = getEventCalendarData(event);
        if (!data) return;
        const formatDate = (date) => `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//SAPA//Event Calendar//EN',
            'BEGIN:VEVENT',
            `UID:${event.id}@4mpadel.co.za`,
            `DTSTAMP:${formatDate(new Date())}`,
            `DTSTART:${formatDate(data.start)}`,
            `DTEND:${formatDate(data.end)}`,
            `SUMMARY:${data.title}`,
            `DESCRIPTION:${data.description}`,
            `LOCATION:${data.location}`,
            'END:VEVENT',
            'END:VCALENDAR',
        ].join('\r\n');
        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${(event.event_name || 'event').replace(/\s+/g, '_')}.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsCalendarMenuOpen(false);
    }, [event]);

    const handleOutlookCalendar = useCallback(() => {
        const data = getEventCalendarData(event);
        if (!data) return;
        const url = `https://outlook.office.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(data.title)}&startdt=${data.start.toISOString()}&enddt=${data.end.toISOString()}&body=${encodeURIComponent(data.description)}&location=${encodeURIComponent(data.location)}`;
        window.open(url, '_blank');
        setIsCalendarMenuOpen(false);
    }, [event]);

    const resolvePaystackReference = (response, fallbackRef) => {
        if (typeof response === 'string' && response.trim()) return response.trim();
        return response?.reference || response?.trxref || fallbackRef;
    };

    const confirmManualPayment = async (paidRef, attempts = 10) => {
        for (let i = 0; i < attempts; i++) {
            const { data, error } = await supabase.functions.invoke('confirm-manual-payment', {
                body: { reference: paidRef },
            });

            let payload = data;
            if (error) {
                try {
                    if (error.context && typeof error.context.json === 'function') {
                        payload = await error.context.json();
                    }
                } catch {
                    // ignore parse errors
                }
                if (!payload) {
                    if (i < attempts - 1) {
                        await new Promise((r) => setTimeout(r, 2500));
                        continue;
                    }
                    throw error;
                }
            }

            if (payload?.processed || payload?.alreadyProcessed) return payload;

            if (payload?.retry || payload?.error === 'Payment not verified') {
                if (i < attempts - 1) {
                    await new Promise((r) => setTimeout(r, 2500));
                    continue;
                }
                throw new Error(payload?.message || 'Payment confirmation timed out. Refresh the page — your payment may still be processing.');
            }

            if (payload?.error) throw new Error(payload.message || payload.error);
            return payload;
        }
        return null;
    };

    const buildRegistrationRows = () => {
        const rows = [];
        const soloLinks = [];
        const covers = [];
        const selfName = profile?.name || (userEmail ? userEmail.split('@')[0] : 'Player');
        for (const d of selectedDivisions) {
            const sel = selected[d.id];
            const partnerPays = !!(sel?.partnerName && sel?.payForPartner);
            const selfPays = isSelfPayingDivision(d.id, sel);
            const fee = Number(d.entry_fee || 0);
            const selfAlreadyPaid = isSelfDivisionPaid(d.id);

            rows.push({
                event_id: event.id,
                division_id: d.id,
                division: d.name,
                full_name: selfName,
                email: userEmail,
                phone: profile?.contact_number || null,
                partner_name: sel?.partnerName || null,
                partner_email: sel?.partnerEmail || null,
                payment_status: selfAlreadyPaid ? 'paid' : fee === 0 ? 'paid' : 'pending',
                partner_payment_status: sel?.partnerName ? 'pending' : null,
                status: 'registered',
                registered_by: userEmail,
            });
            if (selfPays && fee > 0) covers.push({ email: userEmail, division: d.name, type: 'entry' });

            if (sel?.partnerName && sel?.partnerEmail) {
                if (sel.linkSoloRegId) {
                    soloLinks.push({
                        id: sel.linkSoloRegId,
                        email: sel.partnerEmail,
                        division: d.name,
                        partner_name: selfName,
                        partner_email: userEmail,
                        partner_payment_status: null,
                    });
                    if (partnerPays && fee > 0) {
                        const soloReg = divisionRegs.find((r) => r.id === sel.linkSoloRegId);
                        if (soloReg && soloReg.payment_status !== 'paid') {
                            covers.push({ email: soloReg.email, division: d.name, type: 'entry' });
                        }
                    }
                } else {
                    rows.push({
                        event_id: event.id,
                        division_id: d.id,
                        division: d.name,
                        full_name: sel.partnerName,
                        email: sel.partnerEmail,
                        phone: null,
                        partner_name: selfName,
                        partner_email: userEmail,
                        payment_status: 'pending',
                        status: 'registered',
                        registered_by: userEmail,
                    });
                    if (partnerPays && fee > 0) covers.push({ email: sel.partnerEmail, division: d.name, type: 'entry' });
                }
            }
        }
        if (buyLicenseSelf) covers.push({ email: userEmail, type: 'license', license: licenseSelfChoice });
        for (const purchase of partnerLicensePurchases) {
            covers.push({
                email: purchase.partnerEmail,
                type: 'license',
                license: purchase.choice,
            });
        }
        return { rows, covers, soloLinks };
    };

    const persistRegistrations = async (rows, soloLinks = [], covers = []) => {
        const entryCoverSet = new Set(
            covers
                .filter((c) => c.type === 'entry')
                .map((c) => `${String(c.email).toLowerCase()}|${c.division}`),
        );

        for (const link of soloLinks) {
            const updates = {
                partner_name: link.partner_name,
                partner_email: link.partner_email,
                partner_payment_status: link.partner_payment_status ?? null,
            };
            const soloKey = `${String(link.email).toLowerCase()}|${link.division}`;
            if (entryCoverSet.has(soloKey)) {
                updates.payment_status = 'paid';
            }
            const { error: linkError } = await supabase
                .from('event_registrations')
                .update(updates)
                .eq('id', link.id);
            if (linkError) throw linkError;
        }

        if (!rows.length) return [];

        const { data, error } = await supabase
            .from('event_registrations')
            .upsert(rows, { onConflict: 'event_id,email,division' })
            .select('*');
        if (error) throw error;
        return data || [];
    };

    const sendPendingRegistrationEmails = async (payUrl) => {
        const selfName = profile?.name || 'Player';
        const divisionNames = selectedDivisions.map((d) => d.name).join(', ');
        const venue = [event.venue, event.city].filter(Boolean).join(', ');

        await sendEmail(userEmail, 'registration_pending_payment', {
            eventId: event.id,
            playerName: selfName,
            eventName: event.event_name,
            division: divisionNames,
            partnerName: hasPartner ? (primaryPartner.partnerName || '') : '',
            eventDates: event.event_dates || '',
            venue,
            amountDue: fmtR(total),
            payUrl,
            eventUrl,
            recipientRole: 'registrant',
        });

        const partnersNotified = new Set();
        for (const d of selectedDivisions) {
            const sel = selected[d.id];
            if (!sel?.partnerEmail) continue;
            const partnerEmail = sel.partnerEmail.toLowerCase();
            if (partnersNotified.has(partnerEmail)) continue;
            partnersNotified.add(partnerEmail);

            const userPaysForPartner = !!sel.payForPartner;
            let partnerAmountDue = 0;
            if (!userPaysForPartner) {
                for (const div of selectedDivisions) {
                    const divSel = selected[div.id];
                    if (divSel?.partnerEmail?.toLowerCase() === partnerEmail && !divSel?.payForPartner) {
                        partnerAmountDue += Number(div.entry_fee || 0);
                    }
                }
            }

            await sendEmail(sel.partnerEmail, 'registration_pending_payment', {
                eventId: event.id,
                playerName: sel.partnerName,
                inviterName: selfName,
                eventName: event.event_name,
                division: divisionNames,
                eventDates: event.event_dates || '',
                venue,
                amountDue: partnerAmountDue > 0 ? fmtR(partnerAmountDue) : fmtR(0),
                registrantAmountDue: fmtR(total),
                payUrl: eventUrl,
                eventUrl,
                recipientRole: 'partner',
                userPaysForPartner,
            });
        }
    };

    const sendRegistrationEmails = async (savedRows, paid) => {
        const selfName = profile?.name || 'Player';
        const divisionNames = selectedDivisions.map((d) => d.name).join(', ');
        sendEmail(userEmail, 'event_registration', {
            eventId: event.id,
            playerName: selfName,
            eventName: event.event_name,
            division: divisionNames,
            partnerName: hasPartner ? (primaryPartner.partnerName || 'TBD') : 'TBD',
            eventDates: event.event_dates || '',
            venue: [event.venue, event.city].filter(Boolean).join(', '),
            paid,
            amountDue: paid ? 'R 0.00' : fmtR(total),
            eventUrl,
        });
        for (const d of selectedDivisions) {
            const sel = selected[d.id];
            if (!hasPartner || !sel?.partnerName || !sel?.partnerEmail) continue;
            if (sel?.payForPartner) {
                sendEmail(sel.partnerEmail, 'partner_entry_paid', {
                    eventId: event.id,
                    playerName: sel.partnerName,
                    payerName: selfName,
                    eventName: event.event_name,
                    division: d.name,
                    eventUrl,
                    pendingPayment: !paid,
                });
            } else {
                const partnerRow = savedRows.find((r) => r.email === sel.partnerEmail && r.division === d.name);
                const payUrl = partnerRow?.pay_token ? `${eventUrl}?pay_token=${partnerRow.pay_token}` : eventUrl;
                sendEmail(sel.partnerEmail, 'partner_invite', {
                    eventId: event.id,
                    playerName: sel.partnerName,
                    inviterName: selfName,
                    eventName: event.event_name,
                    division: d.name,
                    eventDates: event.event_dates || '',
                    amountDue: fmtRWhole(d.entry_fee || 0),
                    payUrl,
                });
            }
        }
    };

    const handlePaymentSuccess = useCallback(async (paidRef, paidAmount) => {
        try {
            const data = await confirmManualPayment(paidRef);
            if (!data?.processed && !data?.alreadyProcessed) {
                toast.success('Payment received — confirming your registration...');
            }
        } catch (confirmErr) {
            console.error('Payment confirmation error:', confirmErr);
            toast.error(confirmErr.message || 'Payment received but confirmation failed. Try refreshing or contact support.');
        }
        setConfirmedPaidTotal(paidAmount ?? 0);
        setProcessing(false);
        setWizardStep(5);
        await loadMyRegs();
        loadDivisionRegs();
        onParticipantsChange?.();
    }, [loadMyRegs, loadDivisionRegs, onParticipantsChange]);

    const launchPaystackCheckout = useCallback(async (reference, amount) => {
        if (!isPaystackConfigured()) {
            toast.error('Payments not configured');
            return;
        }
        const pop = new PaystackPop();
        await pop.checkout({
            key: PAYSTACK_PUBLIC_KEY,
            reference,
            email: userEmail,
            amount: toPaystackAmount(amount),
            currency: 'ZAR',
            metadata: { event_id: event.id, event_name: event.event_name, reference, source: 'manual_event' },
            onSuccess: async (response) => {
                const paidRef = resolvePaystackReference(response, reference);
                await handlePaymentSuccess(paidRef, amount);
            },
            onCancel: () => toast.info('Payment cancelled. You have not been registered.'),
        });
    }, [userEmail, event.id, event.event_name, handlePaymentSuccess]);

    const resumePaymentByReference = useCallback(async (reference) => {
        if (!userEmail) {
            toast.error('Please log in to complete payment');
            return;
        }
        const { data: payment, error } = await supabase
            .from('payments')
            .select('*')
            .eq('reference', reference)
            .eq('event_id', event.id)
            .maybeSingle();
        if (error || !payment) {
            toast.error('Payment not found');
            return;
        }
        if (payment.status === 'success') {
            toast.info('This payment has already been completed');
            return;
        }
        const meta = typeof payment.metadata === 'string'
            ? JSON.parse(payment.metadata)
            : (payment.metadata || {});
        if (String(meta.registrant_email || '').toLowerCase() !== userEmail.toLowerCase()) {
            toast.error('This payment link belongs to a different account');
            return;
        }
        setProcessing(true);
        try {
            toast.info('Complete your payment to confirm registration');
            await launchPaystackCheckout(reference, Number(payment.amount));
        } finally {
            setProcessing(false);
        }
    }, [userEmail, event.id, launchPaystackCheckout]);

    const pendingPayRefRef = useRef(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const payRef = params.get('pay_ref');
        if (!payRef) return;
        pendingPayRefRef.current = payRef;
        params.delete('pay_ref');
        const newSearch = params.toString();
        window.history.replaceState(
            {},
            '',
            `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash || ''}`,
        );
    }, [event.id]);

    useEffect(() => {
        if (!pendingPayRefRef.current || !userEmail) return;
        const payRef = pendingPayRefRef.current;
        pendingPayRefRef.current = null;
        resumePaymentByReference(payRef);
    }, [userEmail, resumePaymentByReference]);

    const handleRegister = async () => {
        if (!userEmail) { toast.error('Please log in to register'); return; }
        if (selectedDivisions.length === 0) { toast.error('Select at least one division'); return; }
        if (anySelectedRequiresLicense && !hasLicense && !buyLicenseSelf) {
            toast.error('A selected division requires a license'); return;
        }
        if (!agreeRules || !agreeComplete || !agreeSapa) {
            toast.error('Please accept all agreements'); return;
        }

        setProcessing(true);
        try {
            for (const d of selectedDivisions) {
                const sel = selected[d.id];
                if (!sel?.partnerEmail) continue;
                const check = getPartnerAvailability(
                    divisionRegs,
                    d.id,
                    { email: sel.partnerEmail, name: sel.partnerName },
                    d.name,
                );
                if (!check.ok) {
                    toast.error(check.message);
                    setProcessing(false);
                    return;
                }
            }

            const { rows, covers, soloLinks } = buildRegistrationRows();

            if (total > 0) {
                if (!isPaystackConfigured()) { toast.error('Payments not configured'); setProcessing(false); return; }
                const reference = `MANUAL-${event.id}-${Date.now()}`;
                const divisionEntryFees = Object.fromEntries(
                    selectedDivisions.map((d) => [d.name, Number(d.entry_fee || 0)]),
                );
                const paymentMetadata = {
                    source: 'manual_event',
                    is_test: isPaystackTestMode,
                    event_id: event.id,
                    event_name: event.event_name,
                    registrant_email: userEmail,
                    registrant_name: profile?.name || '',
                    covers,
                    line_items: lineItems,
                    event_url: eventUrl,
                    registration_rows: rows,
                    solo_link_updates: soloLinks,
                    division_names: selectedDivisions.map((d) => d.name).join(', '),
                    primary_partner_name: hasPartner ? (primaryPartner.partnerName || 'TBD') : 'TBD',
                    event_dates: event.event_dates || '',
                    event_venue: [event.venue, event.city].filter(Boolean).join(', '),
                    division_entry_fees: divisionEntryFees,
                };
                const payUrl = `${eventUrl}?pay_ref=${encodeURIComponent(reference)}`;

                await supabase.from('payments').insert([{
                    player_id: profile?.id || null,
                    event_id: event.id,
                    amount: total,
                    currency: 'ZAR',
                    status: 'processing',
                    payment_type: 'event_entry_fee',
                    payment_method: 'paystack',
                    reference,
                    is_test: isPaystackTestMode,
                    metadata: paymentMetadata,
                }]);

                await sendPendingRegistrationEmails(payUrl);
                await supabase
                    .from('payments')
                    .update({ metadata: { ...paymentMetadata, pending_emails_sent: true } })
                    .eq('reference', reference);

                paymentRetryRef.current = false;

                await launchPaystackCheckout(reference, total);
            } else {
                const savedRows = await persistRegistrations(rows, soloLinks, covers);
                await sendRegistrationEmails(savedRows, true);
                setConfirmedPaidTotal(0);
                setWizardStep(5);
                loadMyRegs();
                loadDivisionRegs();
                onParticipantsChange?.();
            }
        } catch (err) {
            console.error('Manual registration error:', err);
            toast.error(`Registration failed: ${err.message}`);
        } finally {
            setProcessing(false);
        }
    };

    const confirmWithdraw = async () => {
        const reg = withdrawTarget;
        if (!reg || withdrawing) return;

        setWithdrawing(true);
        try {
            const withdrawnAt = new Date().toISOString();
            const { error } = await supabase
                .from('event_registrations')
                .update({ status: 'withdrawn', withdrawn_at: withdrawnAt })
                .eq('id', reg.id);
            if (error) throw error;

            // Unlink partner on their remaining registration — they stay entered, not withdrawn
            if (reg.partner_email) {
                await supabase
                    .from('event_registrations')
                    .update({ partner_name: null, partner_email: null, partner_payment_status: null })
                    .eq('event_id', reg.event_id)
                    .eq('division', reg.division)
                    .ilike('email', reg.partner_email)
                    .eq('status', 'registered');
            }
            await supabase
                .from('event_registrations')
                .update({ partner_name: null, partner_email: null, partner_payment_status: null })
                .eq('event_id', reg.event_id)
                .eq('division', reg.division)
                .ilike('partner_email', reg.email)
                .eq('status', 'registered');

            const eventUrl = `${window.location.origin}/calendar/${event.slug || event.id}`;
            const div = divisions.find((d) => d.id === reg.division_id || d.name === reg.division);
            const entryFee = Number(div?.entry_fee || 0);
            const baseEmailVars = {
                eventId: event.id,
                eventName: event.event_name,
                division: reg.division,
                eventDates: event.event_dates || '',
                eventUrl,
                withdrawnPlayerName: reg.full_name,
                entryFee,
            };

            sendEmail(reg.email, 'entry_withdrawn', {
                ...baseEmailVars,
                recipientRole: 'player',
                playerName: reg.full_name,
                partnerName: reg.partner_name || '',
            });

            if (reg.partner_email) {
                const { data: partnerReg } = await supabase
                    .from('event_registrations')
                    .select('full_name, payment_status')
                    .eq('event_id', reg.event_id)
                    .eq('division', reg.division)
                    .ilike('email', reg.partner_email)
                    .neq('status', 'withdrawn')
                    .maybeSingle();

                const partnerPaid = partnerReg?.payment_status === 'paid';

                sendEmail(reg.partner_email, 'entry_withdrawn', {
                    ...baseEmailVars,
                    recipientRole: 'partner',
                    recipientEmail: reg.partner_email,
                    playerName: partnerReg?.full_name || reg.partner_name || 'Player',
                    paid: partnerPaid,
                    amount: partnerPaid && entryFee > 0 ? fmtRWhole(entryFee) : undefined,
                    amountDue: !partnerPaid && entryFee > 0 ? fmtRWhole(entryFee) : undefined,
                    payUrl: !partnerPaid && entryFee > 0 ? eventUrl : undefined,
                });
            }

            toast.success(`Withdrawn from ${reg.division}`);
            setWithdrawTarget(null);
            loadMyRegs();
            loadDivisionRegs();
            onParticipantsChange?.();
        } catch (err) {
            toast.error('Failed to withdraw');
        } finally {
            setWithdrawing(false);
        }
    };

    const goNext = () => {
        if (wizardStep === 1) {
            if (!userEmail) { toast.error('Please log in to continue'); return; }
            if (hasRankedinAccount === null) { toast.error('Please confirm whether you have a Rankedin account'); return; }
            setWizardStep(2);
            return;
        }
        if (wizardStep === 2) {
            if (selectedDivisions.length === 0) { toast.error('Select at least one division'); return; }
            for (const d of selectedDivisions) {
                const sel = selected[d.id];
                if (sel?.partnerEmail) {
                    const check = getPartnerAvailability(
                        divisionRegs,
                        d.id,
                        { email: sel.partnerEmail, name: sel.partnerName },
                        d.name,
                    );
                    if (!check.ok) {
                        toast.error(check.message);
                        return;
                    }
                }
                if (!sel?.partnerId || !sel?.partnerEmail) continue;
                if (sel.payForPartner && d.license_required) {
                    const lic = getPartnerLicenseInfo(sel.partnerId);
                    if (!lic.active && !getEventPartnerLicenseChoice(sel.partnerId)) {
                        toast.error(`Select a SAPA license for ${sel.partnerName}`);
                        return;
                    }
                }
            }
            const anyPartner = selectedDivisions.some((d) => {
                const sel = selected[d.id];
                return !!(sel?.partnerId && sel?.partnerEmail);
            });
            setHasPartner(anyPartner);
            setWizardStep(4);
            return;
        }
        if (wizardStep === 3 && hasPartner && (!primaryPartner.partnerId || !primaryPartner.partnerEmail)) {
            toast.error('Search and select your partner from their 4M profile'); return;
        }
        if (wizardStep === 4) {
            const hasPayableSelection = selectedDivisions.some((d) => {
                const sel = selected[d.id];
                const fee = Number(d.entry_fee || 0);
                if (fee === 0) return true;
                if (isSelfPayingDivision(d.id, sel)) return true;
                if (sel?.partnerName && sel?.payForPartner) return true;
                return false;
            });
            if (!hasPayableSelection && total === 0 && !buyLicenseSelf && !buyLicensePartner) {
                toast.error('Select at least one entry to pay for'); return;
            }
        }
        setWizardStep((s) => Math.min(5, s + 1));
    };

    const goBack = () => {
        if (wizardStep === 4) {
            setWizardStep(2);
            return;
        }
        setWizardStep((s) => Math.max(1, s - 1));
    };

    const eventPoster = getEventImage(event);

    const EventSummaryCard = ({ compact = false, variant = 'default' }) => {
        const accentClass = theme?.accentBg || 'bg-[#CCFF00]/10 border-[#CCFF00]/20';
        const venueLabel = [event.venue, event.city].filter(Boolean).join(', ') || 'Venue TBC';
        const organiserLabel = event.organizer_name || '4M Padel';
        const courtsLabel = event.courts ? `${event.courts} Indoor Courts` : null;

        if (variant === 'profile') {
            const eventDetailLines = (
                <>
                    <p className="flex items-center gap-2.5">
                        <CalendarIcon size={15} className="text-slate-600 shrink-0" />
                        {event.event_dates || 'Dates TBC'}
                    </p>
                    <p className="flex items-center gap-2.5">
                        <MapPin size={15} className="text-slate-600 shrink-0" />
                        {venueLabel}
                    </p>
                    {courtsLabel && (
                        <p className="flex items-center gap-2.5">
                            <Layout size={15} className="text-slate-600 shrink-0" />
                            {courtsLabel}
                        </p>
                    )}
                    <p className="flex items-center gap-2.5">
                        <Users size={15} className="text-slate-600 shrink-0" />
                        Organised by {organiserLabel}
                    </p>
                </>
            );
            const eventPosterImage = (className = '') => (
                <div className={`shrink-0 rounded-xl overflow-hidden bg-[#0F172A] aspect-[3/4] ${className}`}>
                    <img src={eventPoster} alt={event.event_name} className="w-full h-full object-cover" />
                </div>
            );

            return (
                <Card className="shadow-sm bg-[#FAF7F2] border-[#F0EBE3]">
                    <div className="md:hidden px-4 py-3">
                        <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm text-slate-900 font-semibold tracking-normal mb-2">Event Summary</h3>
                                <div className="space-y-2 text-xs text-slate-700 font-normal leading-snug">
                                    {eventDetailLines}
                                </div>
                            </div>
                            {eventPosterImage('w-20')}
                        </div>
                    </div>
                    <div className="hidden md:block">
                        <CardHeader title="Event Summary" soft />
                        <CardBody>
                            <div className="flex items-start gap-3">
                                <div className="space-y-2 text-xs text-slate-700 min-w-0 flex-1 font-normal leading-snug">
                                    {eventDetailLines}
                                </div>
                                {eventPosterImage('w-24')}
                            </div>
                        </CardBody>
                    </div>
                </Card>
            );
        }

        if (variant === 'confirm') {
            return (
                <Card className={`shadow-sm ${accentClass}`}>
                    <CardHeader title="Event Summary" soft />
                    <CardBody>
                        <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1.5 text-xs text-slate-600 min-w-0 flex-1 font-normal leading-snug">
                                <p className="flex items-center gap-2.5">
                                    <CalendarIcon size={15} className="text-slate-400 shrink-0" />
                                    {event.event_dates || 'Dates TBC'}
                                </p>
                                <p className="flex items-center gap-2.5">
                                    <MapPin size={15} className="text-slate-400 shrink-0" />
                                    {[event.venue, event.city].filter(Boolean).join(' / ') || 'Venue TBC'}
                                </p>
                                {event.courts && (
                                    <p className="flex items-center gap-2.5">
                                        <Layout size={15} className="text-slate-400 shrink-0" />
                                        {event.courts} courts
                                    </p>
                                )}
                                <p className="flex items-center gap-2.5">
                                    <Trophy size={15} className="text-slate-400 shrink-0" />
                                    {event.event_name || 'Tournament'}
                                </p>
                            </div>
                            {event.sapa_status && event.sapa_status !== 'None' && (
                                <span
                                    className={`text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full shrink-0 ${theme.badgeBg}`}
                                    style={{ color: btnTextColor }}
                                >
                                    {event.sapa_status}
                                </span>
                            )}
                        </div>
                    </CardBody>
                </Card>
            );
        }

        return (
            <Card className={`shadow-sm ${compact ? 'mb-4' : ''} ${accentClass}`}>
                <CardHeader title="Event Summary" soft />
                <CardBody className="space-y-2.5">
                    <div className="relative rounded-xl overflow-hidden bg-[#0F172A] aspect-[16/7]">
                        <img src={eventPoster} alt={event.event_name} className="w-full h-full object-cover" />
                        {event.sapa_status && event.sapa_status !== 'None' && (
                            <span
                                className={`absolute top-2 right-2 text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded-full shadow ${theme.badgeBg}`}
                                style={{ color: btnTextColor }}
                            >
                                {event.sapa_status}
                            </span>
                        )}
                    </div>
                    <div className="space-y-1.5 text-xs text-gray-600">
                        <p className="flex items-center gap-2"><CalendarIcon size={14} className="text-gray-400 shrink-0" /> {event.event_dates || 'Dates TBC'}</p>
                        <p className="flex items-center gap-2"><MapPin size={14} className="text-gray-400 shrink-0" /> {[event.venue, event.city].filter(Boolean).join(' / ') || 'Venue TBC'}</p>
                        {event.courts && (
                            <p className="flex items-center gap-2"><Layout size={14} className="text-gray-400 shrink-0" /> {event.courts} courts</p>
                        )}
                        <p className="flex items-center gap-2"><User size={14} className="text-gray-400 shrink-0" /> Organiser: {event.organizer_name || 'SAPA'}</p>
                    </div>
                </CardBody>
            </Card>
        );
    };

    const PrimaryBtn = ({ children, onClick, disabled, className = '' }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`w-full font-bold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-40 ${theme.glow || ''} ${className}`}
            style={{ backgroundColor: accent, color: btnTextColor }}
        >
            {children}
        </button>
    );

    const renderStep = () => {
        switch (wizardStep) {
            case 1:
                return (
                    <WizardStepWrap>
                        <EventSummaryCard variant="profile" />

                        <Card className="border-2" style={{ borderColor: accent }}>
                            <CardHeader title="My 4M Profile" soft />
                            <CardBody>
                                {!userEmail ? (
                                    <div className="flex items-start gap-2.5 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs font-normal">
                                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                        <p>Please log in to register. Your 4M profile is required to enter this tournament.</p>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <div className="w-14 h-14 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                                            {profileImageUrl ? (
                                                <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-6 h-6 text-gray-400" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-900 text-sm">{displayProfile?.name || userEmail.split('@')[0]}</p>
                                            <p className="text-[11px] text-slate-600 font-normal">SAPA Points</p>
                                        </div>
                                        <div className="shrink-0 min-w-[4.5rem] px-3 py-2 rounded-lg border border-gray-200 bg-white text-center">
                                            <span className="text-sm font-semibold text-slate-900 tabular-nums">
                                                {sapaPoints != null ? Number(sapaPoints).toLocaleString() : '—'}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </CardBody>
                        </Card>

                        {userEmail && (
                            <>
                                <Card>
                                    <CardBody className="flex items-center justify-between gap-3 py-3.5">
                                        <p className="text-xs text-slate-700 font-normal leading-snug">
                                            What is your current Playtomic level?
                                        </p>
                                        <div className="shrink-0 w-16 px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-center">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={selfPlaytomicLevel}
                                                onChange={(e) => setSelfPlaytomicLevel(e.target.value)}
                                                placeholder="—"
                                                className="w-full text-sm font-semibold text-slate-900 tabular-nums text-center bg-transparent outline-none placeholder:text-slate-500 placeholder:font-normal"
                                            />
                                        </div>
                                    </CardBody>
                                </Card>

                                <Card>
                                    <CardHeader title="SAPA license status" soft />
                                    <CardBody>
                                        <div className="flex items-center gap-4">
                                            <div className="w-[5.5rem] h-[5.5rem] rounded-full bg-white border border-gray-100 flex items-center justify-center shrink-0">
                                                <img src={sapaLogo} alt="SAPA" className="w-[4.5rem] h-[4.5rem] object-contain" />
                                            </div>
                                            {hasLicense ? (
                                                <div className="flex items-start gap-2.5 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs font-normal leading-snug flex-1 min-w-0">
                                                    <Check size={16} className="shrink-0 mt-0.5 text-emerald-600" />
                                                    <p>{licenseInfo.label}</p>
                                                </div>
                                            ) : (
                                                <div className="flex-1 min-w-0 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-snug">
                                                    <div className="flex items-start gap-2 text-red-700">
                                                        <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
                                                        <p className="font-semibold text-red-800">
                                                            You do not have an active SAPA license.
                                                        </p>
                                                    </div>
                                                    <p className="mt-2 text-slate-700 font-normal pl-6">
                                                        If a license is required for this tournament, you will be prompted at checkout to purchase either a temporary or annual SAPA license.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </CardBody>
                                </Card>

                                <Card>
                                    <CardHeader title="Rankedin Account" soft />
                                    <CardBody className="space-y-3">
                                        <p className="text-xs text-slate-600 font-normal">Do you have a Rankedin account?</p>
                                        <div className="flex rounded-full border border-gray-200 overflow-hidden p-0.5 bg-white">
                                            {[
                                                [true, 'Yes'],
                                                [false, 'No'],
                                            ].map(([val, label]) => {
                                                const isSelected = hasRankedinAccount === val;
                                                return (
                                                    <button
                                                        key={String(val)}
                                                        type="button"
                                                        onClick={() => setHasRankedinAccount(val)}
                                                        className={`flex-1 px-4 py-2 rounded-full text-xs font-semibold transition-colors ${isSelected ? '' : 'bg-white text-slate-600'}`}
                                                        style={isSelected ? { backgroundColor: accent, color: btnTextColor } : undefined}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {hasRankedinAccount === false && (
                                            <div className="flex items-start gap-2.5 text-blue-800 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs font-normal leading-snug">
                                                <Info size={16} className="shrink-0 mt-0.5 text-blue-600" />
                                                <p>If you do not have a Rankedin account, please create one if you want ranking points.</p>
                                            </div>
                                        )}

                                        {hasRankedinAccount === true && displayProfile?.rankedin_id && (
                                            <div className="flex items-start gap-2.5 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs font-normal leading-snug">
                                                <Check size={16} className="shrink-0 mt-0.5 text-emerald-600" />
                                                <p>
                                                    Rankedin ID linked to your 4M profile:{' '}
                                                    <span className="font-mono font-medium">{displayProfile.rankedin_id}</span>
                                                </p>
                                            </div>
                                        )}
                                    </CardBody>
                                </Card>
                            </>
                        )}
                    </WizardStepWrap>
                );

            case 2:
                return (
                    <WizardStepWrap>
                        <WizardStepTitle
                            title="Choose your division(s)"
                            subtitle="Select one or more divisions. Adding a partner is optional — leave it blank to enter on your own."
                        />

                        <div className="space-y-2">
                            {divisions.map((d) => {
                                const closed = isClosed(d, event);
                                const reged = registeredDivisionIds.has(d.id);
                                const sel = selected[d.id];
                                const isSelected = !!sel;
                                const isExpanded = isSelected && expandedDivisions[d.id] !== false;
                                const myReg = reged ? myRegs.find((r) => r.division_id === d.id) : null;
                                const enteredByName = myReg?._payerName || null;
                                const searchState = divisionPartnerSearch[d.id] || { query: '', results: [], open: false, hasSearched: false };
                                const partnerLic = sel?.partnerId ? getPartnerLicenseInfo(sel.partnerId) : null;
                                const payModeSelf = sel?.payForPartner !== false;
                                const eventPartnerLicenseChoice = getEventPartnerLicenseChoice(sel?.partnerId);
                                const primaryPartnerLicenseDivisionId = sel?.partnerId
                                    ? getPrimaryPartnerLicenseDivisionId(sel.partnerId)
                                    : null;
                                const isPrimaryPartnerLicenseDivision = primaryPartnerLicenseDivisionId === d.id;
                                const showPartnerLicenseWarning = isSelected
                                    && payModeSelf
                                    && d.license_required
                                    && sel?.partnerName
                                    && partnerLic
                                    && !partnerLic.active;
                                const showPartnerLicensePicker = showPartnerLicenseWarning && isPrimaryPartnerLicenseDivision;
                                const showPartnerLicenseAlreadySelected = showPartnerLicenseWarning
                                    && !isPrimaryPartnerLicenseDivision
                                    && !!eventPartnerLicenseChoice;

                                return (
                                    <Card
                                        key={d.id}
                                        className={`${isSelected ? 'border-2' : ''} ${closed ? 'opacity-70' : ''}`}
                                        style={isSelected ? { borderColor: accent } : undefined}
                                        allowOverflow={isExpanded}
                                    >
                                        <div className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    disabled={closed || reged}
                                                    onClick={() => {
                                                        if (closed || reged) return;
                                                        toggleDivision(d);
                                                    }}
                                                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${closed || reged ? 'cursor-not-allowed border-gray-200 bg-gray-50' : isSelected ? 'border-transparent' : 'border-gray-300 bg-white'}`}
                                                    style={isSelected && !closed && !reged ? { backgroundColor: accent, borderColor: accent } : undefined}
                                                    aria-label={`Select ${d.name}`}
                                                >
                                                    {isSelected && !reged && <Check size={12} style={{ color: btnTextColor }} />}
                                                </button>

                                                <button
                                                    type="button"
                                                    disabled={closed || reged}
                                                    onClick={() => {
                                                        if (closed || reged) return;
                                                        if (!isSelected) toggleDivision(d);
                                                        else setExpandedDivisions((prev) => ({ ...prev, [d.id]: prev[d.id] === false }));
                                                    }}
                                                    className="flex-1 min-w-0 text-left"
                                                >
                                                    <p className="font-semibold text-slate-900 text-sm leading-snug">
                                                        {d.name}
                                                    </p>
                                                    <DivisionDetails division={d} className="text-[11px] text-slate-600 font-normal leading-snug mt-1 rich-text max-w-none" />
                                                    {reged && (
                                                        <p className="text-[10px] text-emerald-600 font-normal mt-0.5">
                                                            {enteredByName ? `Entered by ${enteredByName}` : 'Already entered'}
                                                        </p>
                                                    )}
                                                    {closed && !reged && (
                                                        <p className="text-[10px] text-red-400 font-normal mt-0.5">Registration closed</p>
                                                    )}
                                                </button>

                                                {isSelected && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedDivisions((prev) => ({ ...prev, [d.id]: prev[d.id] === false }))}
                                                        className="p-1 text-slate-400 hover:text-slate-600 shrink-0"
                                                        aria-label={isExpanded ? 'Collapse division' : 'Expand division'}
                                                    >
                                                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                    </button>
                                                )}
                                                {!isSelected && !closed && !reged && (
                                                    <ChevronDown size={18} className="text-slate-300 shrink-0" />
                                                )}
                                            </div>

                                            {isExpanded && (
                                                <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                                                    {getDivisionMeta(d) && (
                                                        <p className="text-[11px] text-slate-600 leading-snug font-normal">
                                                            {getDivisionMeta(d)}
                                                        </p>
                                                    )}

                                                    {!sel?.partnerName && (
                                                        <p className="text-[11px] text-slate-600 font-normal leading-snug">
                                                            Entering solo — only your entry will be registered for this division.
                                                        </p>
                                                    )}

                                                    <div className="flex items-end gap-3">
                                                        <div className="relative flex-1 min-w-0">
                                                            <label className="block text-[11px] text-slate-600 font-normal mb-1">Add a partner (optional)</label>
                                                            <div className="relative">
                                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                                                <input
                                                                    value={searchState.open ? searchState.query : (sel?.partnerName || '')}
                                                                    onChange={(e) => handleDivisionPartnerSearch(d.id, e.target.value)}
                                                                    onFocus={() => setDivisionPartnerSearch((prev) => ({
                                                                        ...prev,
                                                                        [d.id]: {
                                                                            query: sel?.partnerName || prev[d.id]?.query || '',
                                                                            results: prev[d.id]?.results || [],
                                                                            open: true,
                                                                        },
                                                                    }))}
                                                                    placeholder="Search partner name or email (optional)"
                                                                    className="w-full border border-gray-200 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-900 bg-white placeholder:text-slate-500 font-normal"
                                                                />
                                                                {sel?.partnerName ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => clearDivisionPartner(d.id)}
                                                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-50"
                                                                        aria-label="Remove partner"
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                ) : (
                                                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                                                )}
                                                            </div>
                                                            {searchState.open && searchState.query.length >= 2 && searchState.hasSearched && (
                                                                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                                                    {searchState.results.length === 0 ? (
                                                                        <PartnerProfileInvite
                                                                            compact
                                                                            event={event}
                                                                            inviterName={inviterDisplayName}
                                                                            inviterEmail={userEmail}
                                                                            searchName={searchState.query}
                                                                            divisionName={d.name}
                                                                        />
                                                                    ) : (
                                                                        searchState.results.map((p) => (
                                                                            <PartnerSearchOption
                                                                                key={p.id || p.email}
                                                                                player={p}
                                                                                onSelect={(player) => setDivisionPartner(d.id, player)}
                                                                                compact
                                                                            />
                                                                        ))
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {sel?.partnerName && (
                                                            <div className="shrink-0 w-20">
                                                                <label className="block text-[11px] text-slate-600 font-normal mb-1 leading-tight">Playtomic level</label>
                                                                <input
                                                                    type="text"
                                                                    inputMode="decimal"
                                                                    value={sel?.partnerPlaytomicLevel ?? ''}
                                                                    onChange={(e) => setDivisionPartnerPlaytomicLevel(d.id, e.target.value)}
                                                                    placeholder="—"
                                                                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-xs text-slate-900 bg-white tabular-nums text-center outline-none placeholder:text-slate-500"
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {sel?.partnerName && (
                                                        <div>
                                                            <div className="flex w-full rounded-full border border-gray-200 overflow-hidden p-0.5 bg-white">
                                                                {[
                                                                    ['self', 'I pay'],
                                                                    ['partner', 'Partner pays'],
                                                                ].map(([mode, label]) => {
                                                                    const active = mode === 'self' ? payModeSelf : !payModeSelf;
                                                                    return (
                                                                        <button
                                                                            key={mode}
                                                                            type="button"
                                                                            onClick={() => setDivisionPayMode(d.id, mode)}
                                                                            className={`flex-1 px-4 py-2 rounded-full text-xs font-semibold transition-colors ${active ? '' : 'bg-white text-slate-600'}`}
                                                                            style={active ? { backgroundColor: accent, color: btnTextColor } : undefined}
                                                                        >
                                                                            {label}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {showPartnerLicensePicker && (
                                                        <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2.5">
                                                            <div className="flex items-start gap-2">
                                                                <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
                                                                <p className="text-xs leading-snug font-normal text-slate-700">
                                                                    <span className="font-semibold text-slate-900">{sel.partnerName} does not have an active SAPA license.</span>
                                                                    {' '}Because you are paying for this partner, add one temporary ({fmtRWhole(FEES.TEMPORARY_LICENSE)}) or annual ({fmtRWhole(FEES.FULL_LICENSE)}) SAPA license for this event — it covers all divisions they enter with you.
                                                                </p>
                                                            </div>
                                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-6">
                                                                {[
                                                                    ['temporary', `Temporary SAPA license (${fmtRWhole(FEES.TEMPORARY_LICENSE)})`],
                                                                    ['full', `Annual SAPA license (${fmtRWhole(FEES.FULL_LICENSE)})`],
                                                                ].map(([val, label]) => (
                                                                    <label key={val} className="flex items-center gap-2 text-xs text-slate-900 cursor-pointer font-normal whitespace-nowrap">
                                                                        <input
                                                                            type="radio"
                                                                            name={`partner-license-${sel.partnerId}`}
                                                                            checked={eventPartnerLicenseChoice === val}
                                                                            onChange={() => setDivisionPartnerLicenseChoice(d.id, val)}
                                                                            className="w-3.5 h-3.5 shrink-0"
                                                                            style={{ accentColor: accent }}
                                                                        />
                                                                        {label}
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {showPartnerLicenseAlreadySelected && (
                                                        <div className="flex items-start gap-2.5 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs font-normal leading-snug">
                                                            <Check size={16} className="shrink-0 mt-0.5 text-emerald-600" />
                                                            <p>
                                                                SAPA license already selected for {sel.partnerName}
                                                                {' '}({eventPartnerLicenseChoice === 'full' ? `annual — ${fmtRWhole(FEES.FULL_LICENSE)}` : `temporary — ${fmtRWhole(FEES.TEMPORARY_LICENSE)}`}).
                                                                {' '}One license covers all divisions for this event.
                                                            </p>
                                                        </div>
                                                    )}

                                                    {!payModeSelf && sel?.partnerName && partnerLic?.active && (
                                                        <div className="flex items-start gap-2.5 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs font-normal leading-snug">
                                                            <Check size={16} className="shrink-0 mt-0.5 text-emerald-600" />
                                                            <p>Partner has an active SAPA license</p>
                                                        </div>
                                                    )}

                                                    {!payModeSelf && sel?.partnerName && (
                                                        <div className="flex items-start gap-2.5 text-blue-800 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs font-normal leading-snug">
                                                            <Check size={16} className="shrink-0 mt-0.5 text-blue-600" />
                                                            <p>A payment request will be sent to your partner</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    </WizardStepWrap>
                );

            case 3:
                return (
                    <WizardStepWrap>
                        <WizardStepTitle title="Partner entry" subtitle="Add your partner and confirm license requirements" />

                        {anySelectedRequiresLicense && hasLicense && (
                            <Card>
                                <CardHeader title="License Check" soft />
                                <CardBody>
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                                            <Check size={16} className="text-emerald-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-900 text-sm leading-tight">Your license is valid.</p>
                                            <p className="text-xs text-slate-600 font-normal leading-snug">You are eligible for this division.</p>
                                        </div>
                                        <span className="inline-flex shrink-0 text-[10px] font-medium px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 whitespace-nowrap">
                                            {licenseInfo.label}
                                        </span>
                                    </div>
                                </CardBody>
                            </Card>
                        )}

                        {anySelectedRequiresLicense && !hasLicense && (
                            <Card>
                                <CardHeader title="License Check" soft />
                                <CardBody className="space-y-2.5">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                                            <AlertCircle size={16} className="text-orange-500" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-semibold text-slate-900 text-sm leading-tight">A SAPA license is required.</p>
                                            <p className="text-xs text-slate-600 font-normal leading-snug">Add a license to enter this division.</p>
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 text-xs cursor-pointer text-slate-900 font-normal">
                                        <input type="checkbox" checked={buyLicenseSelf} disabled={anySelectedRequiresLicense} onChange={(e) => setBuyLicenseSelf(e.target.checked)} className="w-3.5 h-3.5" style={{ accentColor: accent }} />
                                        Add a SAPA license to my entry
                                    </label>
                                    {buyLicenseSelf && (
                                        <div className="flex flex-col sm:flex-row gap-1.5">
                                            {[['temporary', 'Temporary', FEES.TEMPORARY_LICENSE], ['full', 'Annual', FEES.FULL_LICENSE]].map(([val, label, fee]) => (
                                                <button
                                                    key={val}
                                                    type="button"
                                                    onClick={() => setLicenseSelfChoice(val)}
                                                    className={`flex-1 rounded-lg border px-2.5 py-2 text-xs font-medium ${licenseSelfChoice === val ? 'border-transparent' : 'border-gray-200 text-slate-600'}`}
                                                    style={licenseSelfChoice === val ? { backgroundColor: accent, color: btnTextColor } : undefined}
                                                >
                                                    {label} · {fmtRWhole(fee)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </CardBody>
                            </Card>
                        )}

                        <Card allowOverflow>
                            <CardHeader title="Partner Entry" soft />
                            <CardBody className="space-y-2.5">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs text-slate-600 font-normal">Entering with a partner?</p>
                                    <div className="flex gap-1.5 shrink-0">
                                        {[
                                            [false, 'No'],
                                            [true, 'Yes'],
                                        ].map(([val, label]) => (
                                            <button
                                                key={String(val)}
                                                type="button"
                                                onClick={() => {
                                                    setHasPartner(val);
                                                    if (!val) {
                                                        clearPartner();
                                                    }
                                                }}
                                                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${hasPartner === val ? '' : 'bg-gray-100 text-slate-600'}`}
                                                style={hasPartner === val ? { backgroundColor: accent, color: btnTextColor } : undefined}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {hasPartner && (
                                    <>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                            <input
                                                value={partnerSearch.query}
                                                onChange={(e) => handlePartnerSearchInput(e.target.value)}
                                                placeholder="Search by partner name, email or 4M profile"
                                                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 bg-white placeholder:text-slate-500 font-normal"
                                            />
                                            {partnerSearch.hasSearched && partnerSearch.query.length >= 2 && (
                                                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                                    {partnerSearch.results.length === 0 ? (
                                                        <PartnerProfileInvite
                                                            event={event}
                                                            inviterName={inviterDisplayName}
                                                            inviterEmail={userEmail}
                                                            searchName={partnerSearch.query}
                                                        />
                                                    ) : (
                                                        partnerSearch.results.map((p) => (
                                                            <PartnerSearchOption
                                                                key={p.id || p.email}
                                                                player={p}
                                                                onSelect={selectPartner}
                                                            />
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {primaryPartner.partnerName && (
                                            <div className="border border-gray-200 rounded-xl p-3 relative">
                                                <button
                                                    type="button"
                                                    onClick={clearPartner}
                                                    className="absolute top-2 right-2 p-0.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-50"
                                                    aria-label="Remove partner"
                                                >
                                                    <X size={16} />
                                                </button>
                                                <div className="flex items-center gap-2.5 pr-6">
                                                    <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                                                        {primaryPartner.partnerProfile?.image_url ? (
                                                            <img src={primaryPartner.partnerProfile.image_url} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <User className="w-4 h-4 text-gray-400" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-semibold text-slate-900 text-sm leading-tight">{primaryPartner.partnerName}</p>
                                                        {primaryPartner.partnerEmail && (
                                                            <p className="text-[11px] text-slate-600 truncate font-normal">{primaryPartner.partnerEmail}</p>
                                                        )}
                                                    </div>
                                                    {primaryPartner.partnerId && (
                                                        <span
                                                            className={`inline-flex items-center gap-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${partnerLicenseInfo.active
                                                                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                                                                : showPartnerLicenseWarning
                                                                    ? 'bg-orange-50 border border-orange-100 text-orange-800'
                                                                    : 'bg-gray-50 border border-gray-200 text-slate-600'
                                                                }`}
                                                        >
                                                            {partnerLicenseInfo.active ? (
                                                                <Check size={11} className="text-emerald-600 shrink-0" />
                                                            ) : (
                                                                <AlertCircle size={11} className={`shrink-0 ${showPartnerLicenseWarning ? 'text-orange-500' : 'text-gray-400'}`} />
                                                            )}
                                                            {partnerLicenseInfo.label}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </CardBody>
                        </Card>

                        {hasPartner && primaryPartner.partnerName && showPartnerLicenseOptions && (
                            <Card>
                                <CardHeader title="Partner License Options" soft />
                                <CardBody className="space-y-2">
                                    <p className="text-[11px] text-slate-600 leading-snug font-normal">
                                        Your partner does not have an active SAPA license.
                                        You can add a license now or allow your partner to complete it later.
                                    </p>
                                    <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                                        {[
                                            ['annual', `Add annual SAPA license for partner — ${fmtRWhole(FEES.FULL_LICENSE)}`],
                                            ['temporary', `Add temporary SAPA license for partner — ${fmtRWhole(FEES.TEMPORARY_LICENSE)}`],
                                            ['none', 'Do not add now — notify partner to complete later'],
                                        ].map(([val, label]) => (
                                            <label key={val} className="flex items-center gap-2 px-2.5 py-2 cursor-pointer hover:bg-gray-50 min-h-0">
                                                <input
                                                    type="radio"
                                                    name="partnerLicense"
                                                    checked={partnerLicenseOption === val}
                                                    onChange={() => setPartnerLicenseOption(val)}
                                                    className="w-3.5 h-3.5 shrink-0"
                                                    style={{ accentColor: accent }}
                                                />
                                                <span className="text-[11px] text-slate-900 font-normal leading-none whitespace-nowrap">{label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </CardBody>
                            </Card>
                        )}
                    </WizardStepWrap>
                );

            case 4: {
                const sapaHighlightClass = theme?.accentBg || 'bg-[#CCFF00]/10 border-[#CCFF00]/20';

                return (
                    <WizardStepWrap>
                        <WizardStepTitle
                            title="Review & Pay"
                            subtitle="Please review your entries and fees below. Registration is only confirmed once payment is completed successfully."
                        />

                        <div className={`rounded-2xl border px-4 py-3 flex items-center justify-between ${sapaHighlightClass}`}>
                            <span className="text-xs text-slate-700 font-normal">Your current SAPA Points</span>
                            <span className="text-sm font-bold text-slate-900 tabular-nums">
                                {sapaPoints != null ? Number(sapaPoints).toLocaleString() : '—'}
                            </span>
                        </div>

                        <Card className={sapaHighlightClass}>
                            <CardHeader title="Entries" soft />
                            <CardBody className="space-y-0">
                                {reviewPaySummary.entries.map((entry) => (
                                    <div key={entry.id} className="py-3 border-b border-gray-100 last:border-b-0">
                                        <div className="flex items-start gap-3">
                                            <div className="flex shrink-0 -space-x-2 pt-0.5">
                                                <div
                                                    className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center ring-2 ring-white relative z-10"
                                                    style={profileImageUrl ? undefined : { backgroundColor: accent }}
                                                >
                                                    {profileImageUrl ? (
                                                        <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-4 h-4" style={{ color: btnTextColor }} />
                                                    )}
                                                </div>
                                                {entry.partnerName && (
                                                    <div
                                                        className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center ring-2 ring-white bg-gray-100 relative z-0"
                                                        style={!entry.partnerImageUrl ? { backgroundColor: `${accent}40` } : undefined}
                                                    >
                                                        {entry.partnerImageUrl ? (
                                                            <img src={entry.partnerImageUrl} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <User className="w-4 h-4 text-slate-600" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-slate-900 text-sm leading-snug truncate whitespace-nowrap">{entry.divisionName}</p>
                                                <p className="text-[11px] text-slate-600 mt-1 font-normal truncate whitespace-nowrap">
                                                    {entry.selfName}{entry.partnerName ? `, ${entry.partnerName}` : ''}
                                                </p>
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end gap-1 self-center min-w-[5.5rem]">
                                                <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${
                                                    entry.payTag === 'You Paying both Entries'
                                                        ? 'bg-red-50 border-red-200 text-red-700'
                                                        : entry.payTag === 'Partner Pays Their Entry'
                                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                                            : 'bg-slate-50 border-slate-200 text-slate-700'
                                                }`}>
                                                    {entry.payTag}
                                                </span>
                                                <p className="font-semibold text-slate-900 text-sm tabular-nums leading-tight">{fmtR(entry.entryTotal)}</p>
                                                {entry.fee > 0 && entry.payerCount > 0 && (
                                                    <p className="text-[10px] text-slate-600 font-normal tabular-nums">
                                                        ({entry.payerCount} x {fmtRWhole(entry.fee)})
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div className="flex justify-between items-center pt-3 mt-1 border-t border-dashed border-gray-200">
                                    <span className="text-xs font-semibold text-slate-900">Total entry fees</span>
                                    <span className="text-sm font-bold text-slate-900 tabular-nums">{fmtR(reviewPaySummary.entryFeesTotal)}</span>
                                </div>
                            </CardBody>
                        </Card>

                        {reviewPaySummary.licenseLines.length > 0 && (
                            <Card>
                                <CardHeader title="Licenses" soft />
                                <CardBody className="space-y-0">
                                    {!hasLicense && anySelectedRequiresLicense && (
                                        <div className="pb-3 mb-3 border-b border-gray-100">
                                            <p className="text-[11px] text-slate-600 font-normal mb-2">Your SAPA license</p>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                                {[
                                                    ['temporary', `Temporary SAPA license (${fmtRWhole(FEES.TEMPORARY_LICENSE)})`],
                                                    ['full', `Annual SAPA license (${fmtRWhole(FEES.FULL_LICENSE)})`],
                                                ].map(([val, label]) => (
                                                    <label key={val} className="flex items-center gap-2 text-xs text-slate-900 cursor-pointer font-normal whitespace-nowrap">
                                                        <input
                                                            type="radio"
                                                            name="self-license-choice"
                                                            checked={licenseSelfChoice === val}
                                                            onChange={() => {
                                                                setLicenseSelfChoice(val);
                                                                setBuyLicenseSelf(true);
                                                            }}
                                                            className="w-3.5 h-3.5 shrink-0"
                                                            style={{ accentColor: accent }}
                                                        />
                                                        {label}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {reviewPaySummary.licenseLines.map((line, i) => (
                                        <div key={`${line.label}-${i}`} className="flex justify-between items-center py-2 text-xs">
                                            <span className="text-slate-700 font-normal">{line.label}</span>
                                            <span className="font-medium text-slate-900 tabular-nums">{fmtR(line.amount)}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between items-center pt-3 mt-1 border-t border-dashed border-gray-200">
                                        <span className="text-xs font-medium text-slate-600">Subtotal</span>
                                        <span className="text-sm font-semibold text-slate-900 tabular-nums">{fmtR(reviewPaySummary.licensesSubtotal)}</span>
                                    </div>
                                </CardBody>
                            </Card>
                        )}

                        <Card className={`border-2 ${sapaHighlightClass}`} style={{ borderColor: accent }}>
                            <CardBody className="flex justify-between items-center py-4">
                                <span className="text-sm font-semibold text-slate-900">Total payable</span>
                                <span className="text-xl font-bold text-slate-900 tabular-nums">{fmtR(reviewPaySummary.totalPayable)}</span>
                            </CardBody>
                        </Card>

                        <div className="space-y-2.5 pt-1">
                            {[
                                [
                                    agreeRules,
                                    setAgreeRules,
                                    event?.rules_regs ? (
                                        <span>
                                            I agree to the{' '}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setShowRulesModal(true);
                                                }}
                                                className="font-bold underline hover:text-slate-900 focus:outline-none bg-transparent border-0 p-0 cursor-pointer text-slate-800"
                                            >
                                                tournament rules, code of conduct
                                            </button>
                                            , and terms & conditions.
                                        </span>
                                    ) : (
                                        'I agree to the tournament rules, code of conduct, and terms & conditions.'
                                    ),
                                ],
                                [agreeComplete, setAgreeComplete, 'I confirm that my registration is only complete once all required license and payment obligations are met.'],
                                [agreeSapa, setAgreeSapa, 'This is a SAPA sanctioned event and I agree to all SAPA rules and regulations.'],
                            ].map(([checked, setter, label], i) => (
                                <label key={i} className="flex items-start gap-2 cursor-pointer text-xs text-slate-600 font-normal leading-snug">
                                    <input type="checkbox" checked={checked} onChange={(e) => setter(e.target.checked)} className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ accentColor: accent }} />
                                    <span>{label}</span>
                                </label>
                            ))}
                        </div>
                    </WizardStepWrap>
                );
            }

            case 5: {
                const confirmSelfName = displayProfile?.name || profile?.name || 'You';
                const confirmEntries = selectedDivisions.map((d) => {
                    const sel = selected[d.id];
                    const fee = Number(d.entry_fee || 0);
                    const userPaysPartner = !!(sel?.partnerName && sel?.payForPartner);
                    const partnerPaysSelf = !!(sel?.partnerName && !sel?.payForPartner);
                    const partnerUnpaid = partnerPaysSelf && fee > 0 && !isPartnerDivisionPaid(d.id);
                    const namesLine = sel?.partnerName
                        ? `${confirmSelfName} + ${sel.partnerName}`
                        : confirmSelfName;
                    return {
                        id: d.id,
                        divisionName: d.name,
                        namesLine,
                        partnerName: sel?.partnerName || null,
                        partnerImageUrl: sel?.partnerProfile?.image_url?.trim() || null,
                        hasPartner: !!sel?.partnerName,
                        payBadge: !sel?.partnerName || userPaysPartner ? 'You Pay' : 'Partner Pays',
                        payBadgeVariant: partnerPaysSelf ? 'partner' : 'you',
                        showPartnerReminder: partnerUnpaid,
                    };
                });
                const paidAmount = confirmedPaidTotal ?? 0;
                const hasPaid = paidAmount > 0;
                const calendarOptions = [
                    {
                        label: 'Google Calendar',
                        fn: handleGoogleCalendar,
                        icon: (
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                        ),
                    },
                    {
                        label: 'Apple Calendar',
                        fn: handleAppleCalendar,
                        icon: (
                            <svg viewBox="0 0 384 512" className="w-3.5 h-3.5 flex-shrink-0" fill="#64748B">
                                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                            </svg>
                        ),
                    },
                    {
                        label: 'Outlook / Other',
                        fn: handleOutlookCalendar,
                        icon: (
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0 text-[#0078D4]" fill="currentColor">
                                <path d="M1 4.5l8.7-2.6v19.4L1 18.5V4.5z" />
                                <path d="M10.4 2.8h12v18.4h-12V2.8zM14 9c0-.9.7-1.6 1.6-1.6h.8c.9 0 1.6.7 1.6 1.6v6c0 .9-.7 1.6-1.6 1.6h-.8c-.9 0-1.6-.7-1.6-1.6V9z" />
                            </svg>
                        ),
                    },
                ];

                return (
                    <WizardStepWrap>
                        <div className="flex flex-col items-center text-center pt-2 pb-1">
                            <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mb-4">
                                <Check size={32} className="text-white" strokeWidth={2.5} />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 tracking-normal">Registration Confirmed!</h2>
                            <p className="text-xs text-slate-600 mt-1.5 font-normal leading-snug max-w-sm">
                                {hasPaid
                                    ? 'Your registration and payment were successful. We can\'t wait to see you on court!'
                                    : 'Your registration was successful. We can\'t wait to see you on court!'}
                            </p>
                        </div>

                        <Card allowOverflow>
                            <CardHeader title="Your entries" soft />
                            <CardBody className="space-y-0">
                                {confirmEntries.map((entry) => (
                                    <div key={entry.id} className="py-3 border-b border-gray-100 last:border-b-0">
                                        <div className="flex items-start gap-3">
                                            <div className="flex shrink-0 -space-x-2 pt-0.5">
                                                <div
                                                    className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center ring-2 ring-white relative z-10"
                                                    style={profileImageUrl ? undefined : { backgroundColor: accent }}
                                                >
                                                    {profileImageUrl ? (
                                                        <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <User className="w-4 h-4" style={{ color: btnTextColor }} />
                                                    )}
                                                </div>
                                                {entry.hasPartner && (
                                                    <div
                                                        className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center ring-2 ring-white bg-gray-100 relative z-0"
                                                        style={!entry.partnerImageUrl ? { backgroundColor: `${accent}40` } : undefined}
                                                    >
                                                        {entry.partnerImageUrl ? (
                                                            <img src={entry.partnerImageUrl} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <User className="w-4 h-4 text-slate-600" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                                                <div className="min-w-0 text-left">
                                                    <p className="font-semibold text-slate-900 text-sm leading-snug">{entry.divisionName}</p>
                                                    <p className="text-[11px] text-slate-600 mt-0.5 font-normal truncate">{entry.namesLine}</p>
                                                </div>
                                                <span className={`inline-flex shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${
                                                    entry.payBadgeVariant === 'partner'
                                                        ? 'bg-orange-50 border-orange-200 text-orange-700'
                                                        : 'bg-red-50 border-red-200 text-red-700'
                                                }`}>
                                                    {entry.payBadge}
                                                </span>
                                            </div>
                                        </div>
                                        {entry.showPartnerReminder && entry.partnerName && (
                                            <div className="mt-2.5 w-full rounded-xl border border-orange-100 bg-orange-50 px-3 py-2.5 text-left">
                                                <p className="text-[11px] text-orange-900 font-normal leading-snug">
                                                    Reminder: please remind your partner ({entry.partnerName}) to complete their registration by paying their entry fee.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </CardBody>
                        </Card>

                        {hasPaid && (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                                    <Check size={16} className="text-white" />
                                </div>
                                <div className="min-w-0 text-left">
                                    <p className="text-sm font-semibold text-emerald-800">Payment successful</p>
                                    <p className="text-sm font-bold text-slate-900 tabular-nums mt-0.5">Total paid: {fmtR(paidAmount)}</p>
                                </div>
                            </div>
                        )}

                        <Card>
                            <CardHeader title="What's next" soft />
                            <CardBody className="space-y-3">
                                {[
                                    'A confirmation email has been sent to your email address.',
                                    'You\'ll receive event updates on WhatsApp.',
                                    'Draws will be published closer to the event.',
                                    'See you on court!',
                                ].map((line) => (
                                    <div key={line} className="flex items-start gap-2.5">
                                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                                            <Check size={11} className="text-white" strokeWidth={3} />
                                        </div>
                                        <p className="text-xs text-slate-700 font-normal leading-snug text-left">{line}</p>
                                    </div>
                                ))}
                            </CardBody>
                        </Card>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsCalendarMenuOpen((open) => !open)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border border-gray-200 bg-white text-slate-900 hover:bg-gray-50 transition-colors shadow-sm"
                            >
                                <CalendarIcon className="w-4 h-4 shrink-0 text-slate-600" />
                                <span className="text-xs font-semibold tracking-normal">Add to Calendar</span>
                            </button>
                            <AnimatePresence>
                                {isCalendarMenuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                                        className="absolute top-full mt-2 left-0 right-0 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50"
                                    >
                                        {calendarOptions.map(({ label, icon, fn }) => (
                                            <button
                                                key={label}
                                                type="button"
                                                onClick={() => { fn(); setIsCalendarMenuOpen(false); }}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-800 hover:bg-gray-50 transition-colors text-left border-b border-gray-100 last:border-0"
                                            >
                                                {icon}
                                                {label}
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </WizardStepWrap>
                );
            }

            default:
                return null;
        }
    };

    const stepCtaLabel = () => {
        if (wizardStep === 5) return 'Back to My Events';
        if (wizardStep === 4) return processing ? 'Processing...' : total > 0 ? 'Pay & Complete Registration' : 'Complete Registration';
        if (wizardStep === 3) return 'Continue to Payment';
        if (wizardStep === 2) return 'Continue to Review & Pay';
        return 'Continue to Division';
    };

    const handleWizardPrimaryAction = () => {
        if (wizardStep === 5) {
            finishRegistrationWizard();
            return;
        }
        if (wizardStep === 4) {
            handleRegister();
        }
    };

    if (loading) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center justify-center">
                <Loader2 className="animate-spin text-gray-400" />
            </div>
        );
    }

    if (divisions.length === 0) return null;

    return (
        <>
            {/* Overview card on event page */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div
                    onClick={() => setDivisionsBlockOpen((open) => !open)}
                    className="flex items-center justify-between px-6 py-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50/50 select-none transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}20` }}>
                            <Trophy className="w-4 h-4 text-[#0F172A]" />
                        </div>
                        <h2 className="text-sm font-semibold text-slate-900 tracking-normal">
                            {hasRegistrations ? 'You are Registered for this Event' : hasPendingPayment ? 'Complete Your Registration' : 'Divisions'}
                        </h2>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 shrink-0 ${divisionsBlockOpen ? '' : '-rotate-90'}`} />
                </div>

                <AnimatePresence initial={false}>
                    {divisionsBlockOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="px-6 py-4">
                    {hasRegistrations || hasPendingPayment ? (
                        <>
                            <p className="text-xs font-medium text-slate-600 mb-3">
                                {hasRegistrations ? 'Your Entries' : 'Outstanding payment'}
                            </p>
                            <div className="space-y-2 mb-4">
                                {myRegs.map((reg) => {
                                    const div = divisions.find((d) => d.id === reg.division_id);
                                    const needsPay = reg.payment_status !== 'paid' && Number(div?.entry_fee || 0) > 0;
                                    return (
                                        <div key={reg.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Users className="w-4 h-4 text-gray-400 shrink-0" />
                                                <div className="min-w-0">
                                                    <p className="font-semibold text-slate-900 text-sm">{reg.division}</p>
                                                    {div && divisionMetaLine(div) && (
                                                        <p className="text-[11px] text-slate-600 truncate mt-0.5">{divisionMetaLine(div)}</p>
                                                    )}
                                                    {reg.partner_name?.trim() && (
                                                        <p className="text-[11px] text-slate-600 font-normal mt-0.5">
                                                            Partner: <span className="font-medium text-slate-800">{reg.partner_name}</span>
                                                        </p>
                                                    )}
                                                    <span className={`text-[11px] font-medium ${reg.payment_status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                        {getEntryPaymentLabel(reg, userEmail)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0 ml-3">
                                                {needsPay && (
                                                    <button
                                                        type="button"
                                                        onClick={openPayWizard}
                                                        className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-white"
                                                        style={{ backgroundColor: accent, color: btnTextColor }}
                                                    >
                                                        Pay
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setWithdrawTarget(reg)}
                                                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                                                >
                                                    Withdraw
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex flex-col gap-2">
                                {hasPendingPayment && (
                                    <PrimaryBtn onClick={openPayWizard}>
                                        Pay Entry <CreditCard className="w-4 h-4" />
                                    </PrimaryBtn>
                                )}
                                {canAddDivision && (
                                    <button
                                        type="button"
                                        onClick={openWizard}
                                        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-colors ${
                                            hasPendingPayment
                                                ? 'border border-gray-200 bg-white text-slate-700 hover:bg-gray-50'
                                                : 'text-white'
                                        }`}
                                        style={hasPendingPayment ? undefined : { backgroundColor: accent, color: btnTextColor }}
                                    >
                                        Add Division <ArrowRight className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center justify-between gap-4 mb-3">
                                <p className="text-xs font-medium text-slate-600">Available Divisions</p>
                                <p className="text-xs font-medium text-slate-600 shrink-0">Registration closes</p>
                            </div>
                            <div className="space-y-2 mb-4">
                                {divisions.map((d) => {
                                    const closed = isClosed(d, event);
                                    const closeDate = formatDivisionCloseDate(d);
                                    return (
                                        <div
                                            key={d.id}
                                            className={`rounded-xl border px-4 py-3 ${closed ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-100 bg-white'}`}
                                        >
                                            <div className="flex items-start gap-3 min-w-0">
                                                <Users className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <p className="font-bold text-[#0F172A] text-sm leading-snug min-w-0">
                                                            {d.name}
                                                        </p>
                                                        <span
                                                            className={`text-[11px] font-semibold shrink-0 text-right leading-snug ${closed ? 'text-slate-500 uppercase tracking-wide' : (theme?.accentText || 'text-amber-600')}`}
                                                        >
                                                            {closed ? 'Closed' : closeDate || 'Open'}
                                                        </span>
                                                    </div>
                                                    <DivisionDetails division={d} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <PrimaryBtn onClick={openWizard}>
                                Register <ArrowRight className="w-4 h-4" />
                            </PrimaryBtn>
                        </>
                    )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* 5-step registration wizard */}
            <AnimatePresence>
                {showWizard && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-[#F8FAFC] z-[1100] overflow-y-auto"
                    >
                        <div className="min-h-full flex flex-col">
                            {/* Wizard header */}
                            <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-4">
                                <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
                                    <button type="button" onClick={closeWizard} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100">
                                        <X size={22} />
                                    </button>
                                    <p className="font-black text-[#0F172A] text-sm truncate flex-1 text-center">{event.event_name}</p>
                                    <div className="w-10" />
                                </div>
                                <div className="max-w-xl mx-auto mt-3">
                                    <ProgressBar step={wizardStep} theme={theme} />
                                </div>
                            </div>

                            {/* Step content */}
                            <div className="flex-1 px-4 py-4">
                                <div className="max-w-xl mx-auto">
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={wizardStep}
                                            initial={{ opacity: 0, x: 16 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -16 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            {renderStep()}
                                        </motion.div>
                                    </AnimatePresence>
                                </div>
                            </div>

                            {/* Wizard footer */}
                            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-3">
                                <div className="max-w-xl mx-auto flex gap-3">
                                    {wizardStep > 1 && wizardStep < 5 && (
                                        <button
                                            type="button"
                                            onClick={goBack}
                                            disabled={processing}
                                            className="px-5 py-3.5 rounded-xl border border-gray-200 font-bold text-sm text-gray-600 flex items-center gap-1 hover:bg-gray-50"
                                        >
                                            <ChevronLeft size={16} /> Back
                                        </button>
                                    )}
                                    <div className="flex-1">
                                        <PrimaryBtn
                                            onClick={wizardStep === 4 || wizardStep === 5 ? handleWizardPrimaryAction : goNext}
                                            disabled={processing || (wizardStep === 1 && (!userEmail || hasRankedinAccount === null)) || (wizardStep === 4 && (!agreeRules || !agreeComplete || !agreeSapa))}
                                        >
                                            {processing && wizardStep === 4 ? <Loader2 className="animate-spin w-5 h-5" /> : (
                                                <>
                                                    {stepCtaLabel()}
                                                    {wizardStep > 1 && wizardStep < 4 && <ChevronRight size={16} />}
                                                </>
                                            )}
                                        </PrimaryBtn>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Withdraw confirmation */}
            <AnimatePresence>
                {withdrawTarget && (
                    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => !withdrawing && setWithdrawTarget(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 12 }}
                            className="relative w-full max-w-md bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-6 py-5 border-b border-gray-50 flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                                    <AlertCircle className="w-5 h-5 text-red-600" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-base font-semibold text-slate-900">
                                        Withdraw from {withdrawTarget.division}?
                                    </h3>
                                    <p className="text-xs text-slate-600 mt-1 font-normal leading-snug">
                                        {withdrawTarget.partner_name
                                            ? `Your partner ${withdrawTarget.partner_name} will be notified. Their entry will remain active — only your registration will be withdrawn.`
                                            : 'This will remove your entry from the event.'}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => !withdrawing && setWithdrawTarget(null)}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-gray-100 shrink-0"
                                    disabled={withdrawing}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {withdrawTarget.payment_status === 'paid' && (
                                <div className="mx-6 mt-4 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-normal leading-snug">
                                    This entry is already paid. Withdrawing will not automatically issue a refund.
                                </div>
                            )}

                            <div className="px-6 py-5 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setWithdrawTarget(null)}
                                    disabled={withdrawing}
                                    className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-slate-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmWithdraw}
                                    disabled={withdrawing}
                                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {withdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    {withdrawing ? 'Withdrawing…' : 'Withdraw'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Rules and Regulations Modal */}
            <AnimatePresence>
                {showRulesModal && (
                    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                            onClick={() => setShowRulesModal(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 12 }}
                            className="relative w-full max-w-xl bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden flex flex-col max-h-[80vh]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                                        <Trophy className="w-5 h-5 text-slate-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-slate-900">
                                            Rules & Regulations
                                        </h3>
                                        <p className="text-xs text-slate-600 font-normal leading-snug">
                                            {event?.event_name}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowRulesModal(false)}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-gray-100 shrink-0"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="px-6 py-5 overflow-y-auto text-sm text-slate-700 font-normal space-y-4 prose prose-slate max-w-none">
                                {event?.rules_regs ? (
                                    <div dangerouslySetInnerHTML={{ __html: event.rules_regs }} />
                                ) : (
                                    <p className="text-slate-600 italic">No rules and regulations specified for this event.</p>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 bg-slate-50 border-t border-gray-100 flex justify-end shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowRulesModal(false)}
                                    className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

export default ManualEventRegistration;
