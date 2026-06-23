import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    X, Check, CreditCard, Loader2, Users, Calendar as CalendarIcon, Trophy,
    AlertCircle, ChevronRight, ArrowRight, Award, MapPin, User,
    Search, ShieldCheck, ChevronLeft, Info, Layout
} from 'lucide-react';
import PaystackPop from '@paystack/inline-js';
import { supabase } from '../supabaseClient';
import { sendEmail } from '../utils/emails';
import { toPaystackAmount, FEES } from '../constants/fees';
import { getEventImage } from '../utils/imageUtils';

import { PAYSTACK_PUBLIC_KEY, isPaystackConfigured, isPaystackTestMode } from '../utils/paystackConfig';

const STEPS = [
    { id: 1, label: 'Profile' },
    { id: 2, label: 'Division' },
    { id: 3, label: 'Partner' },
    { id: 4, label: 'Payment' },
    { id: 5, label: 'Confirm' },
];

const fmtR = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRWhole = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

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

const Card = ({ children, className = '', allowOverflow = false }) => (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${allowOverflow ? 'overflow-visible' : 'overflow-hidden'} ${className}`}>{children}</div>
);

const CardHeader = ({ title, subtitle, soft = false }) => (
    <div className="px-4 py-2.5 border-b border-gray-50">
        <h3 className={`text-sm text-slate-900 ${soft ? 'font-semibold tracking-normal' : 'font-bold'}`}>{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 font-normal leading-snug">{subtitle}</p>}
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
        {subtitle && <p className="text-xs text-slate-500 mt-0.5 font-normal leading-snug">{subtitle}</p>}
    </div>
);

const ProgressBar = ({ step, theme }) => (
    <div className="flex items-center justify-between gap-1 px-1">
        {STEPS.map((s) => {
            const active = step === s.id;
            const done = step > s.id;
            return (
                <div key={s.id} className="flex-1 flex flex-col items-center min-w-0">
                    <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 transition-colors ${done || active ? '' : 'bg-gray-100 text-gray-400'}`}
                        style={done || active ? { backgroundColor: theme.fill, color: theme.primaryText?.includes('text-white') ? '#fff' : '#0F172A' } : undefined}
                    >
                        {done ? <Check size={14} /> : s.id}
                    </div>
                    <span className={`text-[9px] font-bold mt-1 truncate w-full text-center ${active ? theme.accentText : 'text-gray-400'}`}>
                        {s.label}
                    </span>
                </div>
            );
        })}
    </div>
);

const ManualEventRegistration = ({ event, userEmail, theme, initialPlayer = null, onStatusChange, onParticipantsChange, registrationActionsRef }) => {
    const [divisions, setDivisions] = useState([]);
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

    const [agreeRules, setAgreeRules] = useState(false);
    const [agreeComplete, setAgreeComplete] = useState(false);
    const [agreeSapa, setAgreeSapa] = useState(false);
    const [showRulesModal, setShowRulesModal] = useState(false);

    const [partnerSearch, setPartnerSearch] = useState({ query: '', results: [] });
    const partnerSearchSeq = useRef(0);
    const partnerSearchTimeout = useRef(null);
    const paymentRetryRef = useRef(false);

    const accent = theme?.fill || '#CCFF00';
    const btnTextColor = theme?.primaryText?.includes('text-white') ? '#ffffff' : '#0F172A';

    const hasLicense = licenseInfo.active;

    const displayProfile = profile || initialPlayer;
    const profileImageUrl = displayProfile?.image_url?.trim() || null;

    const sapaPoints = displayProfile?.points ?? null;

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
        const { data } = await supabase
            .from('tournament_divisions')
            .select('*')
            .eq('event_id', event.id)
            .eq('is_active', true)
            .order('sort_order', { ascending: true });
        setDivisions(data || []);
        setLoading(false);
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
            .select('id, name, contact_number, email, license_type, paid_registration, image_url, points, approved, rankedin_id, temporary_licenses(event_id, event_date)')
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
        loadProfile();
        loadMyRegs();
    }, [loadDivisions, loadProfile, loadMyRegs]);

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

    const registeredDivisionIds = useMemo(() => new Set(myRegs.map((r) => r.division_id)), [myRegs]);

    const pendingPaymentRegs = useMemo(
        () => myRegs.filter((reg) => {
            if (reg.payment_status === 'paid') return false;
            const div = divisions.find((d) => d.id === reg.division_id);
            return div && Number(div.entry_fee || 0) > 0;
        }),
        [myRegs, divisions]
    );

    const hasPendingPayment = pendingPaymentRegs.length > 0;
    const hasRegistrations = myRegs.length > 0;
    const allRegistrationsPaid = hasRegistrations && myRegs.every((reg) => {
        if (reg.payment_status === 'paid') return true;
        const div = divisions.find((d) => d.id === reg.division_id);
        return !div || Number(div.entry_fee || 0) === 0;
    });

    const divisionsAvailableToRegister = useMemo(
        () => divisions.filter((d) => !registeredDivisionIds.has(d.id) && !isClosed(d, event)),
        [divisions, registeredDivisionIds, event]
    );
    const canAddDivision = divisionsAvailableToRegister.length > 0;

    const divisionMetaLine = (d) =>
        [d.format, fmtRWhole(d.entry_fee), d.license_required ? 'License req.' : null].filter(Boolean).join(' · ');

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
        if (!userEmail) { toast.error('Please log in to continue'); return; }
        const restored = await restoreSelectedFromPending();
        if (!restored) { toast.error('No outstanding payment found'); return; }
        paymentRetryRef.current = true;
        setAgreeRules(false);
        setAgreeComplete(false);
        setAgreeSapa(false);
        await loadProfile();
        setWizardStep(4);
        setShowWizard(true);
    }, [userEmail, restoreSelectedFromPending, loadProfile]);

    useEffect(() => {
        onStatusChange?.({
            hasPendingPayment,
            hasRegistrations,
            allRegistrationsPaid,
        });
        if (registrationActionsRef) {
            registrationActionsRef.current = {
                openPayFlow: openPayWizard,
                openRegistration: () => {
                    paymentRetryRef.current = false;
                    setWizardStep(1);
                    setHasRankedinAccount(null);
                    setAgreeRules(false);
                    setAgreeComplete(false);
                    setAgreeSapa(false);
                    loadProfile();
                    setShowWizard(true);
                },
            };
        }
    }, [
        hasPendingPayment,
        hasRegistrations,
        allRegistrationsPaid,
        onStatusChange,
        registrationActionsRef,
        openPayWizard,
        loadProfile,
    ]);

    const openWizard = () => {
        paymentRetryRef.current = false;
        setWizardStep(1);
        setHasRankedinAccount(null);
        setAgreeRules(false);
        setAgreeComplete(false);
        setAgreeSapa(false);
        loadProfile();
        setShowWizard(true);
    };

    const closeWizard = () => {
        if (processing) return;
        setShowWizard(false);
    };

    const toggleDivision = (div) => {
        if (isClosed(div, event)) { toast.error('Entries have closed for this division'); return; }
        if (registeredDivisionIds.has(div.id)) return;
        setSelected((prev) => {
            const next = { ...prev };
            if (next[div.id]) delete next[div.id];
            else next[div.id] = { partnerName: '', partnerEmail: '', partnerId: null, partnerProfile: null, payForSelf: true, payForPartner: payMode === 'both' };
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
        syncPartnerAll({ partnerName: '', partnerEmail: '', partnerId: null, partnerProfile: null });
        setPartnerSearch({ query: '', results: [] });
    };

    const runPartnerSearch = useCallback(async (searchTerm) => {
        if (!searchTerm || searchTerm.length < 2) {
            setPartnerSearch((p) => ({ ...p, results: [] }));
            return;
        }

        const seq = ++partnerSearchSeq.current;
        const excludeId = profile?.id || displayProfile?.id;
        let playerQuery = supabase
            .from('players')
            .select('id, name, email, license_type, paid_registration, image_url')
            .or(`name.ilike.%${searchTerm.trim()}%,email.ilike.%${searchTerm.trim()}%`)
            .limit(6);
        if (excludeId) playerQuery = playerQuery.neq('id', excludeId);

        const { data } = await playerQuery;
        if (seq !== partnerSearchSeq.current) return;

        setPartnerSearch((p) => (p.query === searchTerm ? { ...p, results: data || [] } : p));
    }, [profile?.id, displayProfile?.id]);

    const handlePartnerSearchInput = (value) => {
        setPartnerSearch((prev) => ({ ...prev, query: value, results: value.length < 2 ? [] : prev.results }));

        if (primaryPartner.partnerId) {
            syncPartnerAll({ partnerName: '', partnerEmail: '', partnerId: null, partnerProfile: null });
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
        syncPartnerAll({ partnerName: p.name, partnerEmail: p.email || '', partnerId: p.id, partnerProfile: p });
        setPartnerSearch({ query: '', results: [] });
    };

    const selectedDivisions = useMemo(
        () => divisions.filter((d) => selected[d.id]),
        [divisions, selected]
    );

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

    const subtotal = useMemo(() => {
        let t = 0;
        for (const d of selectedDivisions) {
            const sel = selected[d.id];
            const fee = Number(d.entry_fee || 0);
            if (isSelfPayingDivision(d.id, sel)) t += fee;
            if (sel?.partnerName && sel?.payForPartner) t += fee;
        }
        if (buyLicenseSelf) t += licenseFee(licenseSelfChoice);
        const anyPartnerPaid = selectedDivisions.some((d) => selected[d.id]?.partnerName && selected[d.id]?.payForPartner);
        if (anyPartnerPaid && buyLicensePartner) t += licenseFee(licensePartnerChoice);
        return t;
    }, [selectedDivisions, selected, myRegs, buyLicenseSelf, licenseSelfChoice, buyLicensePartner, licensePartnerChoice, userEmail]);

    const total = subtotal;

    const entrySummary = useMemo(() => {
        const selfName = displayProfile?.name || profile?.name || 'You';
        const selfDivisions = [];
        const partnerDivisions = [];

        for (const d of selectedDivisions) {
            const sel = selected[d.id];
            const fee = Number(d.entry_fee || 0);
            if (isSelfPayingDivision(d.id, sel)) selfDivisions.push({ name: d.name, fee });
            if (sel?.partnerName && sel?.payForPartner) partnerDivisions.push({ name: d.name, fee });
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
        if (primaryPartner.partnerName && partnerDivisions.length > 0) {
            players.push({
                name: primaryPartner.partnerName,
                role: 'Partner',
                divisions: partnerDivisions,
                total: partnerDivisions.reduce((sum, div) => sum + div.fee, 0),
            });
        }

        const extras = [];
        if (buyLicenseSelf) {
            extras.push({
                label: licenseSelfChoice === 'full' ? 'Annual SAPA license' : 'Temporary SAPA license',
                amount: licenseFee(licenseSelfChoice),
            });
        }
        const anyPartnerPaid = partnerDivisions.length > 0;
        if (anyPartnerPaid && buyLicensePartner) {
            extras.push({
                label: licensePartnerChoice === 'full'
                    ? `Partner annual license — ${primaryPartner.partnerName}`
                    : `Partner temporary license — ${primaryPartner.partnerName}`,
                amount: licenseFee(licensePartnerChoice),
            });
        }

        return { players, extras };
    }, [
        selectedDivisions, selected, myRegs, buyLicenseSelf, licenseSelfChoice,
        buyLicensePartner, licensePartnerChoice, profile?.name, displayProfile?.name,
        primaryPartner.partnerName,
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
                partner_name: hasPartner ? (sel?.partnerName || null) : null,
                partner_email: hasPartner ? (sel?.partnerEmail || null) : null,
                payment_status: selfAlreadyPaid ? 'paid' : fee === 0 ? 'paid' : 'pending',
                partner_payment_status: hasPartner && sel?.partnerName ? 'pending' : null,
                status: 'registered',
                registered_by: userEmail,
            });
            if (selfPays && fee > 0) covers.push({ email: userEmail, division: d.name, type: 'entry' });

            if (hasPartner && sel?.partnerName && sel?.partnerEmail) {
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
        if (buyLicenseSelf) covers.push({ email: userEmail, type: 'license', license: licenseSelfChoice });
        if (buyLicensePartner) {
            const partnerEmail = primaryPartner.partnerEmail;
            if (partnerEmail) covers.push({ email: partnerEmail, type: 'license', license: licensePartnerChoice });
        }
        return { rows, covers };
    };

    const persistRegistrations = async (rows) => {
        const { data, error } = await supabase
            .from('event_registrations')
            .upsert(rows, { onConflict: 'event_id,email,division' })
            .select('*');
        if (error) throw error;
        return data || [];
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

    const handleRegister = async () => {
        if (!userEmail) { toast.error('Please log in to register'); return; }
        if (selectedDivisions.length === 0) { toast.error('Select at least one division'); return; }
        if (anySelectedRequiresLicense && !hasLicense && !buyLicenseSelf) {
            toast.error('A selected division requires a license'); return;
        }
        if (!agreeRules || !agreeComplete || !agreeSapa) {
            toast.error('Please accept all agreements'); return;
        }
        if (hasPartner && !paymentRetryRef.current && (!primaryPartner.partnerId || !primaryPartner.partnerEmail)) {
            toast.error('Search and select your partner from their 4M profile'); return;
        }

        setProcessing(true);
        try {
            const { rows, covers } = buildRegistrationRows();

            if (total > 0) {
                if (!isPaystackConfigured()) { toast.error('Payments not configured'); setProcessing(false); return; }
                const reference = `MANUAL-${event.id}-${Date.now()}`;
                const savedRows = await persistRegistrations(rows);

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
                    metadata: {
                        source: 'manual_event',
                        is_test: isPaystackTestMode,
                        event_id: event.id,
                        event_name: event.event_name,
                        registrant_email: userEmail,
                        registrant_name: profile?.name || '',
                        covers,
                        line_items: lineItems,
                        event_url: eventUrl,
                    },
                }]);

                const isRetry = paymentRetryRef.current;
                paymentRetryRef.current = false;
                if (!isRetry) {
                    await sendRegistrationEmails(savedRows, false);
                }

                const pop = new PaystackPop();
                await pop.checkout({
                    key: PAYSTACK_PUBLIC_KEY,
                    reference,
                    email: userEmail,
                    amount: toPaystackAmount(total),
                    currency: 'ZAR',
                    metadata: { event_id: event.id, event_name: event.event_name, reference, source: 'manual_event' },
                    onSuccess: async (response) => {
                        const paidRef = resolvePaystackReference(response, reference);
                        try {
                            const data = await confirmManualPayment(paidRef);
                            if (data?.processed || data?.alreadyProcessed) {
                                toast.success('Payment confirmed — you\'re all set!');
                            } else {
                                toast.success('Payment received — confirming your entry...');
                            }
                        } catch (confirmErr) {
                            console.error('Payment confirmation error:', confirmErr);
                            toast.error(confirmErr.message || 'Payment received but confirmation failed. Try refreshing or contact support.');
                        }
                        closeWizard();
                        setSelected({});
                        await loadMyRegs();
                        onParticipantsChange?.();
                    },
                    onCancel: () => toast.info('Payment cancelled. Your registration is saved as pending.'),
                });
            } else {
                const savedRows = await persistRegistrations(rows);
                await sendRegistrationEmails(savedRows, true);
                toast.success('Registered successfully!');
                closeWizard();
                setSelected({});
                loadMyRegs();
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

            if (reg.partner_email) {
                await supabase
                    .from('event_registrations')
                    .update({ status: 'withdrawn', withdrawn_at: withdrawnAt })
                    .eq('event_id', reg.event_id)
                    .eq('division', reg.division)
                    .ilike('email', reg.partner_email)
                    .eq('status', 'registered');
            }
            await supabase
                .from('event_registrations')
                .update({ status: 'withdrawn', withdrawn_at: withdrawnAt })
                .eq('event_id', reg.event_id)
                .eq('division', reg.division)
                .ilike('partner_email', reg.email)
                .eq('status', 'registered');

            const eventUrl = `${window.location.origin}/calendar/${event.slug || event.id}`;
            const emailVars = {
                eventId: event.id,
                eventName: event.event_name,
                division: reg.division,
                eventDates: event.event_dates || '',
                eventUrl,
                partnerName: reg.partner_name || '',
                withdrawnPlayerName: reg.full_name,
            };

            sendEmail(reg.email, 'entry_withdrawn', {
                ...emailVars,
                recipientRole: 'player',
                playerName: reg.full_name,
            });

            if (reg.partner_email) {
                const { data: partnerReg } = await supabase
                    .from('event_registrations')
                    .select('full_name')
                    .eq('event_id', reg.event_id)
                    .eq('division', reg.division)
                    .ilike('email', reg.partner_email)
                    .maybeSingle();

                sendEmail(reg.partner_email, 'entry_withdrawn', {
                    ...emailVars,
                    recipientRole: 'partner',
                    playerName: partnerReg?.full_name || reg.partner_name || 'Player',
                });
            }

            toast.success(`Withdrawn from ${reg.division}`);
            setWithdrawTarget(null);
            loadMyRegs();
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
            setWizardStep(3);
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
        setWizardStep((s) => Math.max(1, s - 1));
    };

    const eventPoster = getEventImage(event);

    const EventSummaryCard = ({ compact = false, variant = 'default' }) => {
        const accentClass = theme?.accentBg || 'bg-[#CCFF00]/10 border-[#CCFF00]/20';

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
            className={`w-full font-black uppercase tracking-wider text-sm py-3.5 rounded-xl flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-40 ${theme.glow || ''} ${className}`}
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
                        <WizardStepTitle
                            title={`Register for ${event.event_name || 'this tournament'}`}
                            subtitle="Complete your entry directly on 4M Padel"
                        />

                        <EventSummaryCard />

                        <Card>
                            <CardHeader title="4M Profile" subtitle="Your registered player profile" soft />
                            <CardBody>
                                {!userEmail ? (
                                    <div className="flex items-start gap-2.5 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs font-normal">
                                        <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                        <p>Please log in to register. Your 4M profile is required to enter this tournament.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex gap-3">
                                            <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center ring-2 ring-gray-100">
                                                {profileImageUrl ? (
                                                    <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="w-7 h-7 text-gray-400" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-slate-900 text-sm">{displayProfile?.name || userEmail.split('@')[0]}</p>
                                                <p className="text-[11px] text-slate-500 truncate font-normal">{userEmail}</p>
                                                {displayProfile && displayProfile.approved !== false && (
                                                    <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <ShieldCheck size={11} /> 4M Profile Verified
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-3 pt-3 border-t border-gray-50 flex items-end justify-between gap-3">
                                            <div>
                                                <p className="text-[11px] text-slate-500 font-normal">Current SAPA Points</p>
                                                <p className="text-xl font-semibold text-slate-900 tabular-nums leading-tight">
                                                    {sapaPoints != null ? Number(sapaPoints).toLocaleString() : '—'}
                                                </p>
                                            </div>
                                            <div
                                                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${hasLicense ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}
                                            >
                                                {hasLicense ? <Check size={14} className="text-emerald-600 shrink-0" /> : <AlertCircle size={14} className="text-slate-400 shrink-0" />}
                                                {licenseInfo.label}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </CardBody>
                        </Card>

                        {userEmail && (
                            <Card>
                                <CardHeader title="Rankedin Account" soft />
                                <CardBody className="space-y-3">
                                    <p className="text-xs text-slate-600 font-normal">Do you have a Rankedin account?</p>
                                    <div className="flex gap-2">
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
                                                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold border transition-colors ${isSelected ? 'border-transparent' : 'border-gray-200 bg-white text-slate-600'}`}
                                                    style={isSelected ? { backgroundColor: accent, color: btnTextColor, borderColor: accent } : undefined}
                                                >
                                                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-current' : 'border-gray-300'}`}>
                                                        {isSelected && <span className="w-2 h-2 rounded-full bg-current" />}
                                                    </span>
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {hasRankedinAccount === false && (
                                        <div className="flex items-start gap-2.5 text-blue-800 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs font-normal leading-snug">
                                            <Info size={16} className="shrink-0 mt-0.5 text-blue-600" />
                                            <p>If you do not have a Rankedin account, please create one if you want to earn ranking points.</p>
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
                        )}
                    </WizardStepWrap>
                );

            case 2:
                return (
                    <WizardStepWrap>
                        <WizardStepTitle
                            title="Choose your division"
                            subtitle={`Select the division(s) you want to enter for ${event.event_name || 'this tournament'}`}
                        />

                        <EventSummaryCard compact />

                        <Card>
                            <CardHeader title="Select Division" soft />
                            <CardBody className="space-y-2.5">
                                <div>
                                    <p className="text-[11px] text-slate-500 font-normal">Event</p>
                                    <p className="text-sm font-semibold text-slate-900 leading-snug">{event.event_name || 'Tournament'}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {divisions.map((d) => {
                                        const closed = isClosed(d, event);
                                        const sel = !!selected[d.id];
                                        const reged = registeredDivisionIds.has(d.id);
                                        // Find the registration to get payer info
                                        const myReg = reged ? myRegs.find((r) => r.division_id === d.id) : null;
                                        const enteredByName = myReg?._payerName || null;
                                        return (
                                            <button
                                                key={d.id}
                                                type="button"
                                                disabled={closed || reged}
                                                title={
                                                    closed
                                                        ? 'Registration is closed for this division'
                                                        : reged
                                                        ? enteredByName
                                                            ? `Entered by ${enteredByName}`
                                                            : 'You are already entered in this division'
                                                        : undefined
                                                }
                                                onClick={() => {
                                                    if (closed || reged) return;
                                                    toggleDivision(d);
                                                }}
                                                className={`relative px-3 py-2.5 rounded-lg text-xs font-medium border text-left transition-colors ${
                                                    closed
                                                        ? 'cursor-not-allowed border-red-100 bg-red-50/60 text-slate-400'
                                                        : reged
                                                        ? 'cursor-not-allowed border-emerald-200 bg-emerald-50 text-emerald-800'
                                                        : sel
                                                        ? 'border-transparent shadow-sm'
                                                        : 'border-gray-200 bg-white text-slate-700 hover:border-gray-300'
                                                }`}
                                                style={sel && !closed && !reged ? { backgroundColor: accent, color: btnTextColor, borderColor: accent } : undefined}
                                            >
                                                {/* Top-right badge */}
                                                {sel && !closed && !reged && <Check size={14} className="absolute top-2 right-2" />}
                                                {reged && <Check size={12} className="absolute top-2 right-2 text-emerald-600" />}
                                                {closed && (
                                                    <span className="absolute top-1.5 right-2 text-[9px] font-bold uppercase tracking-wide text-red-400">
                                                        Closed
                                                    </span>
                                                )}

                                                {/* Division name — no text ✓, icon handles it */}
                                                <span className="block pr-8">{d.name}</span>

                                                {/* Sub-label */}
                                                {reged && (
                                                    <span className="block text-[10px] font-normal mt-0.5 text-emerald-600">
                                                        {enteredByName ? `Entered by ${enteredByName}` : 'Already entered'}
                                                    </span>
                                                )}
                                                {closed && (
                                                    <span className="block text-[10px] text-red-400 font-normal mt-0.5">
                                                        Registration closed
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                {divisions.some((d) => d.license_required) && (
                                    <p className="text-[11px] text-slate-500 flex items-center gap-1 font-normal">
                                        <AlertCircle size={12} className="shrink-0" />
                                        Some divisions require a valid SAPA license.
                                    </p>
                                )}
                            </CardBody>
                        </Card>
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
                                            <p className="text-xs text-slate-500 font-normal leading-snug">You are eligible for this division.</p>
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
                                            <p className="text-xs text-slate-500 font-normal leading-snug">Add a license to enter this division.</p>
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
                                                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${hasPartner === val ? '' : 'bg-gray-100 text-slate-500'}`}
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
                                                className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-900 bg-white placeholder:text-slate-400 font-normal"
                                            />
                                            {partnerSearch.results.length > 0 && (
                                                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                                    {partnerSearch.results.map((p) => (
                                                        <button key={p.id} type="button" onClick={() => selectPartner(p)} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                                                                {p.image_url ? (
                                                                    <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <User className="w-4 h-4 text-gray-400" />
                                                                )}
                                                            </div>
                                                            <div className="flex-1 min-w-0 flex justify-between gap-2">
                                                                <span className="font-medium text-slate-900 truncate">{p.name}</span>
                                                                <span className="text-slate-400 text-xs truncate">{p.email}</span>
                                                            </div>
                                                        </button>
                                                    ))}
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
                                                            <p className="text-[11px] text-slate-500 truncate font-normal">{primaryPartner.partnerEmail}</p>
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

            case 4:
                return (
                    <WizardStepWrap>
                        <WizardStepTitle title="Payment" subtitle="Choose what to pay for and review your entry total" />

                        <EventSummaryCard compact />

                        {hasPartner && primaryPartner.partnerName && (
                            <Card>
                                <CardHeader title="Payment Preference" soft />
                                <CardBody className="space-y-2">
                                    {[
                                        ['both', 'Pay for both players', 'You will complete payment for both entries.'],
                                        ['self', 'Pay only my entry', 'Your partner will receive a notification to complete payment and registration.'],
                                    ].map(([val, label, description]) => {
                                        const anyPartnerPaid = selectedDivisions.some(d => isPartnerDivisionPaid(d.id));
                                        const isDisabled = val === 'both' && anyPartnerPaid;
                                        return (
                                            <label
                                                key={val}
                                                className={`flex items-start gap-2.5 p-3 rounded-lg border transition-colors ${isDisabled ? 'opacity-50 cursor-not-allowed bg-gray-50 border-gray-200' : payMode === val ? 'border-2 cursor-pointer' : 'border-gray-200 hover:bg-gray-50 cursor-pointer'}`}
                                                style={!isDisabled && payMode === val ? { borderColor: accent, backgroundColor: `${accent}10` } : undefined}
                                            >
                                                <input
                                                    type="radio"
                                                    name="payMode"
                                                    disabled={isDisabled}
                                                    checked={payMode === val}
                                                    onChange={() => !isDisabled && setPayMode(val)}
                                                    className="w-3.5 h-3.5 mt-0.5 shrink-0"
                                                    style={{ accentColor: accent }}
                                                />
                                                <div className="min-w-0">
                                                    <span className="text-xs font-semibold text-slate-900">
                                                        {label}
                                                        {isDisabled && <span className="ml-2 text-[10px] font-medium text-emerald-600">(Partner already paid)</span>}
                                                    </span>
                                                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug font-normal">{description}</p>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </CardBody>
                            </Card>
                        )}

                        <Card>
                            <CardHeader title="Select entries to pay" subtitle="Choose which divisions to include in this payment" soft />
                            <CardBody className="space-y-2">
                                {selectedDivisions.map((d) => {
                                    const sel = selected[d.id];
                                    const fee = Number(d.entry_fee || 0);
                                    const selfPaid = isSelfDivisionPaid(d.id);
                                    const partnerPaid = isPartnerDivisionPaid(d.id);
                                    const showPartnerOption = hasPartner && primaryPartner.partnerName && payMode === 'both';
                                    const payerSelfName = displayProfile?.name || profile?.name || 'You';
                                    return (
                                        <div key={d.id} className="rounded-lg border border-gray-200 p-3">
                                            <div className="flex justify-between items-start gap-2 mb-2">
                                                <p className="font-semibold text-slate-900 text-xs">{d.name}</p>
                                                <span className="text-xs font-medium text-slate-900 shrink-0 tabular-nums">{fmtR(fee)}</span>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className={`flex items-center gap-2 text-xs font-normal ${selfPaid ? 'opacity-60' : 'cursor-pointer'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selfPaid || sel?.payForSelf !== false}
                                                        disabled={selfPaid || fee === 0}
                                                        onChange={(e) => setDivisionPayFlag(d.id, 'payForSelf', e.target.checked)}
                                                        className="w-3.5 h-3.5 shrink-0"
                                                        style={{ accentColor: accent }}
                                                    />
                                                    <span className="text-slate-900">
                                                        Pay for {payerSelfName} (You)
                                                        {selfPaid && <span className="ml-2 text-xs font-medium text-emerald-600">Already paid</span>}
                                                        {!selfPaid && fee === 0 && <span className="ml-2 text-xs text-slate-500">Free entry</span>}
                                                    </span>
                                                </label>
                                                {showPartnerOption && (
                                                    <label className={`flex items-center gap-2 text-xs font-normal ${partnerPaid ? 'opacity-60' : 'cursor-pointer'}`}>
                                                        <input
                                                            type="checkbox"
                                                            checked={partnerPaid || !!sel?.payForPartner}
                                                            disabled={partnerPaid || fee === 0}
                                                            onChange={(e) => setDivisionPayFlag(d.id, 'payForPartner', e.target.checked)}
                                                            className="w-3.5 h-3.5 shrink-0"
                                                            style={{ accentColor: accent }}
                                                        />
                                                        <span className="text-slate-900">
                                                            Pay for {primaryPartner.partnerName}
                                                            {partnerPaid && <span className="ml-2 text-xs font-medium text-emerald-600">Already paid</span>}
                                                            {!partnerPaid && fee === 0 && <span className="ml-2 text-xs text-slate-500">Free entry</span>}
                                                        </span>
                                                    </label>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </CardBody>
                        </Card>

                        <Card className={`shadow-sm ${theme?.accentBg || 'bg-[#CCFF00]/10 border-[#CCFF00]/20'}`}>
                            <CardHeader title="Entry Summary" soft />
                            <CardBody>
                                <div className="space-y-0 divide-y divide-black/5">
                                    {entrySummary.players.length === 0 && entrySummary.extras.length === 0 ? (
                                        <p className="py-2 text-xs text-slate-500 font-normal">No entries selected for payment.</p>
                                    ) : (
                                        <>
                                            {entrySummary.players.map((player, i) => (
                                                <div key={`player-${i}`} className="flex justify-between gap-3 py-2 text-xs">
                                                    <div className="min-w-0">
                                                        <p className="font-semibold text-slate-900 leading-snug">
                                                            {player.name}
                                                            <span className="font-normal text-slate-500"> ({player.role})</span>
                                                        </p>
                                                        <p className="text-[11px] text-slate-500 mt-0.5 font-normal">
                                                            {player.divisions.map((div) => div.name).join(', ')}
                                                        </p>
                                                    </div>
                                                    <span className="font-medium text-slate-900 shrink-0 tabular-nums">{fmtR(player.total)}</span>
                                                </div>
                                            ))}
                                            {entrySummary.extras.map((extra, i) => (
                                                <div key={`extra-${i}`} className="flex justify-between py-2 text-xs font-normal">
                                                    <span className="text-slate-600">{extra.label}</span>
                                                    <span className="font-medium text-slate-900 tabular-nums">{fmtR(extra.amount)}</span>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                                <div
                                    className="flex justify-between items-center py-2.5 px-4 -mx-4 -mb-3 mt-2 border-t border-dashed border-slate-300/70"
                                    style={{ backgroundColor: `${accent}30` }}
                                >
                                    <span className="font-semibold text-slate-900 text-sm">Total</span>
                                    <span className="font-bold text-slate-900 text-base tabular-nums">{fmtR(total)}</span>
                                </div>
                            </CardBody>
                        </Card>
                    </WizardStepWrap>
                );

            case 5: {
                const selfLicenseLabel = hasLicense
                    ? licenseInfo.label
                    : buyLicenseSelf
                        ? (licenseSelfChoice === 'full' ? 'Annual license added' : 'Temporary license added')
                        : 'No active license';
                const selfLicenseOk = hasLicense || buyLicenseSelf;
                const partnerLicenseStatusLabel = buyLicensePartner
                    ? (licensePartnerChoice === 'full' ? 'Annual license added' : 'Temporary license added')
                    : partnerLicenseInfo.active
                        ? partnerLicenseInfo.label
                        : null;
                const partnerLicenseOptionLabel = {
                    annual: 'Annual SAPA license',
                    temporary: 'Temporary SAPA license',
                    none: 'Per-entry authorisation',
                }[partnerLicenseOption] || 'Per-entry authorisation';
                const anyPartnerPaidEntries = selectedDivisions.some((d) => selected[d.id]?.partnerName && selected[d.id]?.payForPartner);
                const selfPayingEntries = selectedDivisions.some((d) => isSelfPayingDivision(d.id, selected[d.id]));
                const paymentIncludes = [];
                if (selfPayingEntries && anyPartnerPaidEntries) {
                    paymentIncludes.push("both players' entry fees");
                } else if (selfPayingEntries) {
                    paymentIncludes.push('your entry fee');
                } else if (anyPartnerPaidEntries) {
                    paymentIncludes.push("your partner's entry fee");
                }
                if (buyLicenseSelf) {
                    paymentIncludes.push(licenseSelfChoice === 'full' ? 'your annual SAPA license' : 'your temporary SAPA license');
                }
                if (anyPartnerPaidEntries && buyLicensePartner) {
                    paymentIncludes.push(
                        licensePartnerChoice === 'full'
                            ? "your partner's annual SAPA license"
                            : "your partner's temporary SAPA license"
                    );
                }
                const paymentMethodTitle = hasPartner && primaryPartner.partnerName
                    ? (payMode === 'both' ? 'Paying for both players' : 'Paying for my entry only')
                    : 'Paying for my entry';
                const paymentMethodSubtitle = (() => {
                    if (hasPartner && primaryPartner.partnerName && payMode === 'self' && paymentIncludes.length === 0) {
                        return 'Your partner will receive a notification to complete payment and registration.';
                    }
                    if (paymentIncludes.length === 0) {
                        return 'You will complete payment for your registration.';
                    }
                    if (paymentIncludes.length === 1) {
                        return `You will complete payment for ${paymentIncludes[0]}.`;
                    }
                    const last = paymentIncludes[paymentIncludes.length - 1];
                    return `You will complete payment for ${paymentIncludes.slice(0, -1).join(', ')} and ${last}.`;
                })();
                const partnerImageUrl = primaryPartner.partnerProfile?.image_url?.trim() || null;

                return (
                    <WizardStepWrap>
                        <WizardStepTitle title="Review & Confirm" subtitle="Check your details before submitting" />

                        <Card>
                            <CardHeader title="Your Details" soft />
                            <CardBody>
                                <div className="flex items-center gap-2.5 mb-2.5">
                                    <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                                        {profileImageUrl ? (
                                            <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <User className="w-4 h-4 text-gray-400" />
                                        )}
                                    </div>
                                    <p className="font-semibold text-slate-900 text-sm">{displayProfile?.name || '—'}</p>
                                </div>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between items-center gap-3">
                                        <span className="text-slate-500">Current SAPA Points</span>
                                        <span className="font-medium text-slate-900 tabular-nums">
                                            {sapaPoints != null ? Number(sapaPoints).toLocaleString() : '—'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center gap-3">
                                        <span className="text-slate-500 shrink-0">License</span>
                                        <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border text-right whitespace-nowrap ${selfLicenseOk
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                            : 'bg-orange-50 border-orange-200 text-orange-800'
                                            }`}>
                                            {selfLicenseLabel}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <span className="text-slate-500 shrink-0">Division</span>
                                        <span className="font-medium text-slate-900 text-right">{selectedDivisions.map((d) => d.name).join(', ') || '—'}</span>
                                    </div>
                                </div>
                            </CardBody>
                        </Card>

                        {hasPartner && primaryPartner.partnerName && (
                            <Card>
                                <CardHeader title="Partner Details" soft />
                                <CardBody>
                                    <div className="flex items-center gap-2.5 mb-2.5">
                                        <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                                            {partnerImageUrl ? (
                                                <img src={partnerImageUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <User className="w-4 h-4 text-gray-400" />
                                            )}
                                        </div>
                                        <p className="font-semibold text-slate-900 text-sm truncate">{primaryPartner.partnerName}</p>
                                    </div>
                                    <div className="space-y-2 text-xs">
                                        {partnerLicenseStatusLabel && (
                                            <div className="flex justify-between items-center gap-3">
                                                <span className="text-slate-500 shrink-0">License Status</span>
                                                <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${buyLicensePartner || !partnerLicenseInfo.active
                                                    ? 'bg-orange-50 border-orange-200 text-orange-800'
                                                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                                    }`}>
                                                    {partnerLicenseStatusLabel}
                                                </span>
                                            </div>
                                        )}
                                        {(showPartnerLicenseOptions || buyLicensePartner) && (
                                            <div className="flex justify-between gap-3">
                                                <span className="text-slate-500 shrink-0">License Option</span>
                                                <span className="font-medium text-slate-900 text-right">{partnerLicenseOptionLabel}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between gap-3">
                                            <span className="text-slate-500 shrink-0">Payment</span>
                                            <span className="font-medium text-slate-900 text-right">
                                                {payMode === 'both' ? 'Included in your payment' : 'Partner pays separately'}
                                            </span>
                                        </div>
                                    </div>
                                </CardBody>
                            </Card>
                        )}

                        <Card>
                            <CardHeader title="Payment Method" soft />
                            <CardBody>
                                <div className="flex items-start gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                                        <CreditCard size={16} className="text-slate-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-slate-900 text-xs">{paymentMethodTitle}</p>
                                        <p className="text-[11px] text-slate-500 mt-0.5 leading-snug font-normal">{paymentMethodSubtitle}</p>
                                        {total > 0 && (
                                            <p className="text-sm font-semibold text-slate-900 mt-1.5 tabular-nums">{fmtR(total)}</p>
                                        )}
                                    </div>
                                </div>
                            </CardBody>
                        </Card>

                        <EventSummaryCard variant="confirm" />

                        <div className="space-y-2">
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

            default:
                return null;
        }
    };

    const stepCtaLabel = () => {
        if (wizardStep === 5) return processing ? 'Processing...' : total > 0 ? 'Submit Registration' : 'Confirm Registration';
        if (wizardStep === 4) return 'Review & Confirm';
        if (wizardStep === 3) return 'Continue to Payment';
        if (wizardStep === 2) return 'Continue to Partner';
        return 'Continue to Division';
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
                <div className="px-6 py-5 border-b border-gray-50 flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-slate-700" />
                    <h2 className="text-base font-semibold text-slate-900">
                        {hasRegistrations ? 'You are Registered for this Event' : 'Register for this Event'}
                    </h2>
                </div>

                <div className="px-6 py-4">
                    {hasRegistrations ? (
                        <>
                            <p className="text-xs font-medium text-slate-500 mb-3">Your Entries</p>
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
                                                    {div && (
                                                        <p className="text-[11px] text-gray-500 truncate">{divisionMetaLine(div)}</p>
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
                            <p className="text-xs font-medium text-slate-500 mb-3">Available Divisions</p>
                            <div className="space-y-2 mb-4">
                                {divisions.map((d) => {
                                    const closed = isClosed(d, event);
                                    return (
                                        <div
                                            key={d.id}
                                            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${closed ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-100'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Users className="w-4 h-4 text-gray-400" />
                                                <div>
                                                    <p className="font-bold text-[#0F172A] text-sm">{d.name}</p>
                                                    <p className="text-[11px] text-gray-500">{divisionMetaLine(d)}</p>
                                                </div>
                                            </div>
                                            {closed ? (
                                                <span className="text-[11px] font-bold text-gray-400 uppercase">Closed</span>
                                            ) : (
                                                <span className={`text-[11px] font-semibold ${theme?.accentText || 'text-gray-400'}`}>
                                                    {d.entries_close_at ? `Closes ${new Date(d.entries_close_at).toLocaleDateString()}` : 'Open'}
                                                </span>
                                            )}
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
                                    {wizardStep > 1 && (
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
                                            onClick={wizardStep === 5 ? handleRegister : goNext}
                                            disabled={processing || (wizardStep === 1 && (!userEmail || hasRankedinAccount === null)) || (wizardStep === 5 && (!agreeRules || !agreeComplete || !agreeSapa))}
                                        >
                                            {processing ? <Loader2 className="animate-spin w-5 h-5" /> : (
                                                <>
                                                    {stepCtaLabel()}
                                                    {wizardStep < 5 && <ChevronRight size={16} />}
                                                    {wizardStep === 5 && !processing && <Check size={16} />}
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
                                    <p className="text-xs text-slate-500 mt-1 font-normal leading-snug">
                                        {withdrawTarget.partner_name
                                            ? `Your partner ${withdrawTarget.partner_name} will also be withdrawn from this division.`
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
                                        <p className="text-xs text-slate-500 font-normal leading-snug">
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
                                    <p className="text-slate-500 italic">No rules and regulations specified for this event.</p>
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
