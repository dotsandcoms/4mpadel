import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
    X, Users, CheckCircle, Clock, DollarSign, Loader2, Check, Search, UserX, Trash2, RotateCcw, UserPlus, ArrowRightLeft, User, ChevronDown, Calendar, Trophy, Link2, Info, MessageCircle, XCircle, Pencil, FileText, ArrowRight, ArrowDownLeft, ArrowUpRight, Phone, RefreshCcw, ExternalLink, Plus, FileSpreadsheet
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { buildPlayersByEmailMap, fetchPlayersByEmails } from '../../utils/playerLookup';
import { downloadRankedinSkipReport, extractRankedinId } from '../../utils/rankedinLink';
import {
    formatRegistrationLicenseLabel,
    resolveRegistrationLicenseCategory,
} from '../../utils/registrationLicense';
import {
    findAdminMarkedPayment,
    findParentEntryPayment,
    findPaymentForRegistration,
    findStrictPaystackEntryPayment,
    getRegistrationEntryFeePaid,
    hasBlockingProcessedRefund,
    isEntryFeeRefund,
    isLicenseRefund,
    isExplicitAdminMarkedPayment,
    isCompedEntryPayment,
    isLicensePaymentRow,
    isPaystackPaymentMethod,
    normalizePaymentMetadata,
    registrationCountsAsPaid,
    registrationHasPaystackEntryPayment,
    registrationIsCompedEntry,
    resolveRegistrationPaymentMethod,
    resolveRegistrationPayer,
} from '../../utils/paymentRegistrationMatch';
import { sendEmail } from '../../utils/emails';
import AdminPlayerProfileModal from './AdminPlayerProfileModal';
import EventActivityLog from './EventActivityLog';
import { logEventActivity } from '../../utils/eventActivityLog';
import { parseEventDate } from '../../utils/eventEntryFee';
import { downloadEventFinanceWorkbook } from '../../utils/eventFinanceExport';
import { useAdminPermissions } from '../../hooks/useAdminPermissions';
import NativeDrawManager from './NativeDrawManager';

const fmtR = (n) => `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 0 })}`;

const successPaymentsOnly = (payments) => (payments || []).filter((p) => p.status === 'success');

/** True if this registration has a successful Paystack entry payment on record (even if later refunded). */
const hasPaystackEntryPaymentRecord = (reg, payments) =>
    registrationHasPaystackEntryPayment(reg, successPaymentsOnly(payments));

const isPaystackEntryPayment = (reg, payments, refundByRegMap = null) => {
    if (!registrationCountsAsPaid(reg, refundByRegMap, payments)) return false;
    return hasPaystackEntryPaymentRecord(reg, payments);
};

const isWithdrawnRegistration = (reg) => String(reg?.status || '').toLowerCase() === 'withdrawn';

/**
 * Prefer one registration per email+division (paid / more complete partner info wins).
 * Prevents abandoned-checkout duplicates from appearing twice in admin lists.
 */
const dedupeRegistrationsByEmailDivision = (regs) => {
    const preferred = new Map();
    const noEmail = [];
    const scoreReg = (reg) => {
        let score = 0;
        if (String(reg.payment_status || '').toLowerCase() === 'paid') score += 100;
        if (reg.partner_email || reg.partner_name) score += 10;
        if (reg.phone || reg.contact_number) score += 1;
        score += new Date(reg.created_at || 0).getTime() / 1e15;
        return score;
    };
    (regs || []).forEach((reg) => {
        const email = (reg.email || '').toLowerCase().trim();
        if (!email) {
            noEmail.push(reg);
            return;
        }
        const key = `${email}::${reg.division || ''}`;
        const existing = preferred.get(key);
        if (!existing || scoreReg(reg) > scoreReg(existing)) {
            preferred.set(key, reg);
        }
    });
    return [...preferred.values(), ...noEmail];
};

/** Income-statement label for a registration payment row — never invents 'paid'. */
const resolveIncomeStatementPaymentStatus = (reg, refundByRegMap = null, payments = null) => {
    if (!reg) return 'pending';
    if (isWithdrawnRegistration(reg)) return 'withdrawn';
    const paymentStatus = String(reg.payment_status || 'pending').toLowerCase();
    if (paymentStatus === 'refunded' || hasBlockingProcessedRefund(reg, refundByRegMap, payments)) return 'refunded';
    if (registrationCountsAsPaid(reg, refundByRegMap, payments)) return 'paid';
    if (paymentStatus === 'unpaid') return 'pending';
    return paymentStatus || 'pending';
};

const PLATFORM_COMMISSION_RATE = 0.05;
const PAYOUT_REQUEST_MAX_RATE = 0.5;
const PAYOUT_ADMIN_EMAIL = 'markstillerman@gmail.com';

const ABANDONED_CHECKOUT_AFTER_MS = 24 * 60 * 60 * 1000;
const ACTIVE_CHECKOUT_WINDOW_MS = 60 * 60 * 1000;

const PAYMENT_METHOD_LABELS = {
    paystack: 'Paystack',
    manual: 'Manual',
    eft: 'EFT',
    external: 'External payment',
    cash: 'Cash',
    system: 'System',
};
const OFF_PLATFORM_PAYMENT_METHODS = new Set(['manual', 'eft', 'external', 'cash']);

const labelPaymentMethod = (method) => {
    if (!method) return '';
    const key = String(method).toLowerCase();
    return PAYMENT_METHOD_LABELS[key] || method;
};

const buildPlayersByEmail = buildPlayersByEmailMap;

const PaymentNoteButton = ({ note, regId, openId, onOpen }) => {
    if (!note?.trim()) return null;
    const isOpen = openId === regId;

    return (
        <span className="relative inline-flex shrink-0 align-middle">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    onOpen(isOpen ? null : regId);
                }}
                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-gray-500/50 text-gray-400 hover:text-amber-300 hover:border-amber-400/60 transition-colors"
                aria-label="View payment note"
                title="View payment note"
            >
                <Info size={9} strokeWidth={2.5} />
            </button>
            {isOpen && (
                <>
                    <button
                        type="button"
                        className="fixed inset-0 z-[100] cursor-default"
                        aria-label="Close payment note"
                        onClick={() => onOpen(null)}
                    />
                    <div className="absolute left-0 bottom-full mb-1.5 z-[101] min-w-[180px] max-w-[260px] rounded-lg border border-white/10 bg-[#0a0a0a] px-2.5 py-2 text-[10px] text-gray-200 shadow-2xl">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500 mb-1">Payment note</p>
                        <p className="leading-snug whitespace-pre-wrap">{note}</p>
                    </div>
                </>
            )}
        </span>
    );
};

/** Stacks per-player cells with a divider between teammates in a table row. */
const TeamPlayerRows = ({ players, children }) => (
    <div className="flex flex-col justify-center">
        {players.map((player, index) => (
            <div key={player.id}>
                {index > 0 && <div className="border-t border-white/10" />}
                <div className="flex items-center py-2.5 min-h-[36px]">
                    {children(player, index)}
                </div>
            </div>
        ))}
    </div>
);

const ManualEventRegistrations = ({ isOpen, onClose, onBack, onEditEvent, event, variant = 'modal', backLabel = '← Back to Events List' }) => {
    const isInline = variant === 'inline';
    const isActive = isInline || isOpen;
    const [registrations, setRegistrations] = useState([]);
    const [payments, setPayments] = useState([]);
    const [divisions, setDivisions] = useState([]);
    const [refunds, setRefunds] = useState([]);
    const [playersByEmail, setPlayersByEmail] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [playerSearch, setPlayerSearch] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('all'); // all | paid | manual | pending | refunded | withdrawn
    const [licenseFilter, setLicenseFilter] = useState('all'); // all | full | temp | none
    const [markingId, setMarkingId] = useState(null);
    const [markPaidTarget, setMarkPaidTarget] = useState(null);
    const [markPaidNote, setMarkPaidNote] = useState('');
    const [markPaidMethod, setMarkPaidMethod] = useState('manual');
    const [markPaidBusy, setMarkPaidBusy] = useState(false);
    const [unmarkTarget, setUnmarkTarget] = useState(null);
    const [unmarkBusy, setUnmarkBusy] = useState(false);
    const [addPlayerOpen, setAddPlayerOpen] = useState(false);
    const [addPlayerSearch, setAddPlayerSearch] = useState('');
    const [addPlayerResults, setAddPlayerResults] = useState([]);
    const [addPlayerSearching, setAddPlayerSearching] = useState(false);
    const [addPlayerSelected, setAddPlayerSelected] = useState(null);
    const [addPlayerDivision, setAddPlayerDivision] = useState('');
    const [addPlayerNote, setAddPlayerNote] = useState('');
    const [addPlayerBusy, setAddPlayerBusy] = useState(false);
    const [removeTarget, setRemoveTarget] = useState(null);
    const [removePair, setRemovePair] = useState(false);
    const [removeBusy, setRemoveBusy] = useState(false);
    const [retryRefundId, setRetryRefundId] = useState(null);
    const [linkTarget, setLinkTarget] = useState(null); // solo entry we're adding a partner to
    const [linkSearch, setLinkSearch] = useState('');
    const [linkBusy, setLinkBusy] = useState(false);
    const [moveTarget, setMoveTarget] = useState(null);
    const [moveTeamPlayers, setMoveTeamPlayers] = useState([]);
    const [moveTeamTogether, setMoveTeamTogether] = useState(false);
    const [moveDivId, setMoveDivId] = useState('');
    const [moveBusy, setMoveBusy] = useState(false);
    const [divisionFilter, setDivisionFilter] = useState('all');
    const [sortBy, setSortBy] = useState('division'); // 'division' | 'name' | 'recent'
    const [profileResults, setProfileResults] = useState([]); // profiles not yet entered (for invite)
    const [matchingProfileReg, setMatchingProfileReg] = useState(null);
    const [profileViewTarget, setProfileViewTarget] = useState(null);
    const [profileLinkSearch, setProfileLinkSearch] = useState('');
    const [profileLinkResults, setProfileLinkResults] = useState([]);
    const [profileLinkBusy, setProfileLinkBusy] = useState(false);
    const [searchingProfiles, setSearchingProfiles] = useState(false);
    const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'players', 'list', 'activity', 'statement'
    const [expandedDivisions, setExpandedDivisions] = useState({});
    const [openPaymentNoteId, setOpenPaymentNoteId] = useState(null);
    const [updatingWhatsApp, setUpdatingWhatsApp] = useState(null);
    const [requestingPayout, setRequestingPayout] = useState(false);
    const [payoutModalOpen, setPayoutModalOpen] = useState(false);
    const [payoutRequestAmount, setPayoutRequestAmount] = useState('');
    const [statementSearch, setStatementSearch] = useState('');
    const [exportingFinance, setExportingFinance] = useState(false);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [adminEmail, setAdminEmail] = useState(null);
    const [syncingRankedin, setSyncingRankedin] = useState(false);
    const [interimPayments, setInterimPayments] = useState([]);
    const [interimAmount, setInterimAmount] = useState('');
    const [interimDate, setInterimDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [interimNote, setInterimNote] = useState('');
    const [savingInterim, setSavingInterim] = useState(false);
    const [linkedRankedinId, setLinkedRankedinId] = useState(
        () => extractRankedinId(event?.rankedin_id) || extractRankedinId(event?.rankedin_url) || '',
    );
    const [linkedRankedinUrl, setLinkedRankedinUrl] = useState(() => event?.rankedin_url || '');
    const [earlyBirdMeta, setEarlyBirdMeta] = useState(() => ({
        early_bird_fee: event?.early_bird_fee ?? null,
        early_bird_ends_at: event?.early_bird_ends_at ?? null,
    }));
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
        setLinkedRankedinId(extractRankedinId(event?.rankedin_id) || extractRankedinId(event?.rankedin_url) || '');
        setLinkedRankedinUrl(event?.rankedin_url || '');
    }, [event?.id, event?.rankedin_id, event?.rankedin_url]);

    useEffect(() => {
        setEarlyBirdMeta({
            early_bird_fee: event?.early_bird_fee ?? null,
            early_bird_ends_at: event?.early_bird_ends_at ?? null,
        });
        if (!event?.id) return undefined;
        // Parent list queries often omit early-bird columns — load them here so the card always works.
        if (event?.early_bird_ends_at != null && event?.early_bird_fee != null) return undefined;
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('calendar')
                .select('early_bird_fee, early_bird_ends_at')
                .eq('id', event.id)
                .maybeSingle();
            if (cancelled || error || !data) return;
            setEarlyBirdMeta({
                early_bird_fee: data.early_bird_fee ?? null,
                early_bird_ends_at: data.early_bird_ends_at ?? null,
            });
        })();
        return () => { cancelled = true; };
    }, [event?.id, event?.early_bird_fee, event?.early_bird_ends_at]);

    useEffect(() => {
        const rows = Array.isArray(event?.organiser_interim_payments)
            ? event.organiser_interim_payments
            : [];
        setInterimPayments(rows);
    }, [event?.id, event?.organiser_interim_payments]);

    const persistInterimPayments = useCallback(async (nextRows) => {
        if (!event?.id) throw new Error('Missing event');
        const { error } = await supabase
            .from('calendar')
            .update({ organiser_interim_payments: nextRows })
            .eq('id', event.id);
        if (error) throw error;
        setInterimPayments(nextRows);
    }, [event?.id]);

    const handleAddInterimPayment = async () => {
        const amount = Number(String(interimAmount).replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(amount) || amount <= 0) {
            toast.error('Enter a valid interim payment amount');
            return;
        }
        if (!interimDate) {
            toast.error('Select the payment date');
            return;
        }
        setSavingInterim(true);
        try {
            const row = {
                id: (typeof crypto !== 'undefined' && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : `interim-${Date.now()}`,
                amount,
                paid_at: interimDate,
                note: interimNote.trim() || null,
                created_at: new Date().toISOString(),
            };
            const next = [...interimPayments, row].sort((a, b) => String(a.paid_at || '').localeCompare(String(b.paid_at || '')));
            await persistInterimPayments(next);
            setInterimAmount('');
            setInterimNote('');
            setInterimDate(new Date().toISOString().slice(0, 10));
            toast.success(`Interim payment of ${fmtR(amount)} recorded`);
            try {
                await logEventActivity({
                    eventId: event.id,
                    action: 'interim_payment_added',
                    category: 'FINANCE',
                    summary: `Interim payment to organiser: ${fmtR(amount)} on ${interimDate}`,
                    details: row,
                });
            } catch (_) { /* non-blocking */ }
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to save interim payment');
        } finally {
            setSavingInterim(false);
        }
    };

    const handleRemoveInterimPayment = async (paymentId) => {
        const target = interimPayments.find((p) => p.id === paymentId);
        if (!target) return;
        if (!window.confirm(`Remove interim payment of ${fmtR(target.amount)}?`)) return;
        setSavingInterim(true);
        try {
            const next = interimPayments.filter((p) => p.id !== paymentId);
            await persistInterimPayments(next);
            toast.success('Interim payment removed');
            try {
                await logEventActivity({
                    eventId: event.id,
                    action: 'interim_payment_removed',
                    category: 'FINANCE',
                    summary: `Removed interim payment: ${fmtR(target.amount)}`,
                    details: target,
                });
            } catch (_) { /* non-blocking */ }
        } catch (err) {
            console.error(err);
            toast.error(err.message || 'Failed to remove interim payment');
        } finally {
            setSavingInterim(false);
        }
    };

    const load = useCallback(async () => {
        if (!event?.id) return;
        setLoading(true);

        const abandonCutoff = new Date(Date.now() - ABANDONED_CHECKOUT_AFTER_MS).toISOString();
        await supabase
            .from('payments')
            .update({ status: 'abandoned' })
            .eq('event_id', event.id)
            .eq('status', 'processing')
            .lt('created_at', abandonCutoff);

        const [regRes, payRes, divRes, eventRes] = await Promise.all([
            supabase.from('event_registrations').select('*').eq('event_id', event.id).order('created_at', { ascending: false }),
            supabase.from('payments').select('*').eq('event_id', event.id),
            supabase.from('tournament_divisions').select('*').eq('event_id', event.id),
            supabase.from('calendar').select('organiser_interim_payments').eq('id', event.id).maybeSingle(),
        ]);
        if (eventRes?.data && Array.isArray(eventRes.data.organiser_interim_payments)) {
            setInterimPayments(eventRes.data.organiser_interim_payments);
        }
        let regs = regRes.data || [];
        const payRows = payRes.data || [];
        const successPayments = payRows.filter((p) => p.status === 'success');

        const paymentMethodPatches = [];
        for (const reg of regs) {
            if (isWithdrawnRegistration(reg)) continue;
            if (reg.payment_status !== 'paid') continue;
            if (String(reg.payment_method || '').toLowerCase() === 'paystack') continue;
            if (!findStrictPaystackEntryPayment(successPayments, reg)) continue;
            paymentMethodPatches.push(reg.id);
        }
        if (paymentMethodPatches.length > 0) {
            await Promise.all(
                paymentMethodPatches.map((id) => supabase
                    .from('event_registrations')
                    .update({ payment_method: 'paystack' })
                    .eq('id', id)),
            );
            const patched = new Set(paymentMethodPatches);
            regs = regs.map((r) => (patched.has(r.id) ? { ...r, payment_method: 'paystack' } : r));
        }

        setRegistrations(regs);
        setPayments(payRows);
        setDivisions(divRes.data || []);

        // A refund can be linked to a registration, a payment, or both. In
        // particular, withdrawn registrations may no longer be available as a
        // registration-id match, so include refunds found through this event's
        // payments as well. Otherwise the original receipt remains in the
        // payment ledger while its refund silently drops out of the settlement.
        const regIds = regs.map((r) => r.id);
        const paymentIds = payRows.map((p) => p.id);
        const refundQueries = [];
        if (regIds.length > 0) {
            refundQueries.push(supabase
                .from('payment_refunds')
                .select('*')
                .in('event_registration_id', regIds));
        }
        if (paymentIds.length > 0) {
            refundQueries.push(supabase
                .from('payment_refunds')
                .select('*')
                .in('payment_id', paymentIds));
        }
        const refundResults = await Promise.all(refundQueries);
        const refundById = new Map();
        refundResults.forEach(({ data }) => {
            (data || []).forEach((refund) => refundById.set(refund.id, refund));
        });
        setRefunds([...refundById.values()]);

        const emails = [...new Set(regs.flatMap((r) => [r.email, r.partner_email]).filter(Boolean))];
        if (emails.length > 0) {
            const players = await fetchPlayersByEmails(
                supabase,
                emails,
                'id, name, email, license_type, paid_registration, image_url, points, temporary_licenses(event_id, event_date)',
            );
            setPlayersByEmail(buildPlayersByEmail(players));
        } else {
            setPlayersByEmail(new Map());
        }

        setLoading(false);
    }, [event?.id]);

    const handleSyncToRankedin = useCallback(async () => {
        if (!event?.id) return;
        const rankedinId = linkedRankedinId || extractRankedinId(event.rankedin_id) || extractRankedinId(event.rankedin_url);
        if (!rankedinId) {
            toast.error('Link a RankedIn tournament ID in Event Builder first');
            return;
        }
        setSyncingRankedin(true);
        const toastId = toast.loading('Syncing with RankedIn…');
        try {
            const { data, error } = await supabase.functions.invoke('sync-to-rankedin', {
                body: { eventId: event.id, rankedinId },
            });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.error || 'Sync failed');

            setLinkedRankedinId(String(data.rankedinId || rankedinId));
            setLinkedRankedinUrl(data.rankedinUrl || linkedRankedinUrl);
            await load();

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
                    `Mapped ${mappedCount}. Create on RankedIn: ${missing.map((d) => d.divisionName).join(', ')}`,
                    { id: toastId, duration: 8000 },
                );
            } else {
                const detailsBit = detailsUpdated.length > 0
                    ? ` — details: ${detailsUpdated.join(', ')}`
                    : (data.detailsPush?.status === 'noop' ? ' — details up to date' : '');
                const pushBit = data.writePush?.credentialsConfigured
                    ? (pushed > 0
                        ? ` — pushed ${pushed} paid team(s)${pushSkipped.length ? ` (${skipSummary})` : ''}`
                        : (pushSkipped.length ? ` — no new teams (${skipSummary})` : ' — no paid doubles to push yet'))
                    : ' — set RankedIn secrets to push entries';
                toast.success(`RankedIn #${data.rankedinId} — ${mappedCount} division(s) mapped${detailsBit}${pushBit}`, {
                    id: toastId,
                    duration: 9000,
                });
            }
            if (data.writePush || data.detailsPush) {
                console.info('[sync-to-rankedin]', { writePush: data.writePush, detailsPush: data.detailsPush });
            }
            if (pushSkipped.length > 0) {
                const rowCount = downloadRankedinSkipReport(pushSkipped, {
                    eventName: event.event_name || event.slug || `event-${event.id}`,
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
    }, [event?.id, event?.rankedin_id, event?.rankedin_url, event?.event_name, event?.slug, linkedRankedinId, linkedRankedinUrl, load]);

    useEffect(() => {
        if (isActive) {
            load();
            setSearch('');
            setPlayerSearch('');
            setPaymentFilter('all');
            setLicenseFilter('all');
            setDivisionFilter('all');
            setSortBy('division');
        }
    }, [isActive, load]);

    const divFee = useCallback(
        (name) => Number(divisions.find((d) => d.name === name)?.entry_fee || 0),
        [divisions]
    );

    const refundByReg = useMemo(() => {
        const m = new Map();
        for (const rf of refunds) {
            const id = rf.event_registration_id;
            if (!id) continue;
            const cur = m.get(id) || { amount: 0, statuses: [], rows: [] };
            cur.amount += Number(rf.amount || 0);
            cur.statuses.push(rf.status);
            cur.rows.push(rf);
            m.set(id, cur);
        }
        return m;
    }, [refunds]);

    const parseRefundMeta = (raw) => {
        if (!raw) return {};
        if (typeof raw === 'object') return raw;
        try {
            return JSON.parse(raw);
        } catch {
            return {};
        }
    };

    const stats = useMemo(() => {
        const active = dedupeRegistrationsByEmailDivision(
            registrations.filter((r) => !isWithdrawnRegistration(r)),
        );
        const paid = active.filter((r) => registrationCountsAsPaid(r, refundByReg, payments)).length;
        const pending = active.length - paid;
        const revenue = payments.filter((p) => p.status === 'success').reduce((s, p) => s + Number(p.amount || 0), 0);
        const now = Date.now();
        const activeCheckouts = payments.filter((p) => {
            if (p.status !== 'processing') return false;
            return now - new Date(p.created_at).getTime() <= ACTIVE_CHECKOUT_WINDOW_MS;
        });
        const activeCheckoutTotal = activeCheckouts.reduce((s, p) => s + Number(p.amount || 0), 0);
        const abandonedCheckouts = payments.filter((p) => p.status === 'abandoned');
        const abandonedCheckoutTotal = abandonedCheckouts.reduce((s, p) => s + Number(p.amount || 0), 0);
        return {
            total: active.length,
            paid,
            pending,
            revenue,
            activeCheckoutTotal,
            activeCheckoutCount: activeCheckouts.length,
            abandonedCheckoutTotal,
            abandonedCheckoutCount: abandonedCheckouts.length,
            withdrawn: registrations.filter((r) => isWithdrawnRegistration(r)).length,
        };
    }, [registrations, payments, refundByReg]);

    const refundSummaryFor = (regId) => {
        const e = refundByReg.get(regId);
        if (!e) return null;
        const rows = e.rows || [];
        const processedRows = rows.filter((row) => String(row.status || '').toLowerCase() === 'processed');
        const failedRows = rows.filter((row) => {
            const s = String(row.status || '').toLowerCase();
            return s === 'failed' || s === 'needs_attention';
        });
        const pendingRows = rows.filter((row) => {
            const s = String(row.status || '').toLowerCase();
            return s !== 'processed' && s !== 'failed' && s !== 'needs_attention';
        });

        const processedAmount = processedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const failedRow = failedRows[0] || null;
        const failedMeta = failedRow ? parseRefundMeta(failedRow.metadata) : {};

        const reg = registrations.find((r) => r.id === regId) || null;
        const paymentId = processedRows[0]?.payment_id || failedRow?.payment_id || pendingRows[0]?.payment_id;
        const payment = (paymentId && payments.find((p) => p.id === paymentId))
            || (reg ? findPaymentForReg(reg) : null)
            || null;
        const { isPartnerPaid, payerName } = reg
            ? resolvePaymentPayer(reg, payment)
            : { isPartnerPaid: false, payerName: null };

        const payerNote = isPartnerPaid && payerName
            ? `Refunded to ${payerName} (paid for entry/license)`
            : (isPartnerPaid ? 'Refunded to partner who paid' : null);

        let status = 'pending';
        let text = `Refund pending ${fmtR(e.amount)}`;
        let note = null;

        if (processedRows.length > 0 && failedRows.length === 0 && pendingRows.length === 0) {
            status = 'processed';
            text = `Refunded ${fmtR(processedAmount)}`;
            note = payerNote;
        } else if (processedRows.length > 0 && failedRows.length > 0) {
            // Entry (or part) already refunded — don't bury that under REFUND FAILED.
            status = 'partial';
            text = `Refunded ${fmtR(processedAmount)}`;
            const failedCover = failedMeta.cover_type === 'license' ? 'temp license' : 'remaining';
            note = payerNote
                ? `${payerNote}. ${failedCover} refund still needs retry.`
                : `Entry refunded. ${failedCover} refund still needs retry.`;
        } else if (processedRows.length > 0 && pendingRows.length > 0) {
            status = 'pending';
            text = `Refunded ${fmtR(processedAmount)}`;
            note = payerNote
                ? `${payerNote}. Further refund processing…`
                : 'Further refund processing…';
        } else if (failedRows.length > 0) {
            status = 'failed';
            text = 'Refund failed';
            note = failedMeta.paystack_error || failedMeta.error || null;
        }

        return {
            amount: e.amount,
            processedAmount,
            status,
            failedRefundId: failedRow?.id || null,
            failedError: status === 'failed' ? (failedMeta.paystack_error || failedMeta.error || null) : null,
            note,
            isPartnerPaid,
            payerName,
        };
    };

    const openMarkPaidModal = (reg) => {
        const reference = `MANUAL-ADMIN-${reg.id}`;
        const existingPayment = payments.find((p) => p.reference === reference)
            || payments.find((p) => p.status === 'success' && p.metadata?.registration_id === reg.id);
        setMarkPaidTarget(reg);
        setMarkPaidNote(
            existingPayment?.metadata?.note
            || existingPayment?.metadata?.payment_note
            || '',
        );
        setMarkPaidMethod(reg.payment_method || existingPayment?.payment_method || 'manual');
    };

    const closeMarkPaidModal = () => {
        setMarkPaidTarget(null);
        setMarkPaidNote('');
        setMarkPaidMethod('manual');
        setMarkPaidBusy(false);
    };

    const openAddPlayerModal = () => {
        setAddPlayerOpen(true);
        setAddPlayerSearch('');
        setAddPlayerResults([]);
        setAddPlayerSelected(null);
        setAddPlayerDivision(divisions[0]?.name || '');
        setAddPlayerNote('');
        setAddPlayerBusy(false);
    };

    const closeAddPlayerModal = () => {
        if (addPlayerBusy) return;
        setAddPlayerOpen(false);
        setAddPlayerSearch('');
        setAddPlayerResults([]);
        setAddPlayerSelected(null);
        setAddPlayerDivision('');
        setAddPlayerNote('');
        setAddPlayerBusy(false);
    };

    // Search 4M players for provisional admin add
    useEffect(() => {
        if (!addPlayerOpen || addPlayerSearch.trim().length < 2) {
            setAddPlayerResults([]);
            return undefined;
        }
        let cancelled = false;
        const handle = setTimeout(async () => {
            setAddPlayerSearching(true);
            const q = addPlayerSearch.trim().replace(/[,()%]/g, ' ');
            const { data, error } = await supabase
                .from('players')
                .select('id, name, email, image_url')
                .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
                .limit(12);
            if (cancelled) return;
            if (error) {
                console.error('Add player search failed:', error);
                setAddPlayerResults([]);
            } else {
                setAddPlayerResults((data || []).filter((p) => p.email));
            }
            setAddPlayerSearching(false);
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [addPlayerOpen, addPlayerSearch]);

    const confirmAddPlayer = async () => {
        if (!addPlayerSelected?.email) {
            toast.error('Select a 4M player');
            return;
        }
        if (!addPlayerDivision) {
            toast.error('Select a division');
            return;
        }

        const note = addPlayerNote.trim();
        const email = addPlayerSelected.email.trim();
        const alreadyEntered = registrations.some((r) =>
            r.status !== 'withdrawn'
            && r.division === addPlayerDivision
            && (r.email || '').toLowerCase() === email.toLowerCase());
        if (alreadyEntered) {
            toast.error(`${addPlayerSelected.name} is already entered in ${addPlayerDivision}`);
            return;
        }

        setAddPlayerBusy(true);
        try {
            const div = divisions.find((d) => d.name === addPlayerDivision);
            const { data: { user } } = await supabase.auth.getUser();
            const adminEmail = user?.email || null;
            const fee = Number(div?.entry_fee || 0);

            const { data: inserted, error: insErr } = await supabase
                .from('event_registrations')
                .insert({
                    event_id: event.id,
                    email,
                    full_name: addPlayerSelected.name,
                    division: addPlayerDivision,
                    division_id: div?.id || null,
                    payment_status: 'pending',
                    payment_method: null,
                    status: 'registered',
                    registered_by: adminEmail || email,
                })
                .select('id')
                .maybeSingle();
            if (insErr) throw insErr;
            if (!inserted?.id) throw new Error('Registration was not created');

            const eventUrl = `https://4mpadel.co.za/calendar/${event.slug || event.id}`;
            const eventDates = event.event_dates
                || (event.start_date
                    ? new Date(event.start_date).toLocaleDateString(undefined, {
                        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                    })
                    : '');
            try {
                await sendEmail(email, 'event_registration', {
                    eventId: event.id,
                    playerName: addPlayerSelected.name,
                    eventName: event.event_name,
                    division: addPlayerDivision,
                    partnerName: 'TBD',
                    eventDates,
                    venue: [event.venue, event.city].filter(Boolean).join(', '),
                    paid: false,
                    amountDue: fmtR(fee),
                    eventUrl,
                });
            } catch (mailErr) {
                console.error('Entry confirmation email failed:', mailErr);
                toast.message('Player added, but confirmation email could not be sent');
            }

            await logEventActivity({
                eventId: event.id,
                action: 'admin.added_player',
                category: 'ADMIN',
                summary: `Added ${addPlayerSelected.name} provisionally (${addPlayerDivision}) — payment pending`,
                details: {
                    registration_id: inserted.id,
                    player_name: addPlayerSelected.name,
                    player_email: email,
                    division: addPlayerDivision,
                    note: note || null,
                    payment_status: 'pending',
                    added_by: adminEmail,
                },
            });

            toast.success(`Added ${addPlayerSelected.name} — payment pending`);
            setAddPlayerOpen(false);
            setAddPlayerSearch('');
            setAddPlayerResults([]);
            setAddPlayerSelected(null);
            setAddPlayerDivision('');
            setAddPlayerNote('');
            load();
        } catch (err) {
            toast.error(err.message || 'Failed to add player');
        } finally {
            setAddPlayerBusy(false);
        }
    };

    const handleToggleWhatsApp = async (reg) => {
        setUpdatingWhatsApp(reg.id);
        const newState = !reg.whatsapp_added;
        try {
            const { error } = await supabase
                .from('event_registrations')
                .update({ whatsapp_added: newState })
                .eq('id', reg.id);
            if (error) throw error;
            setRegistrations((prev) => prev.map((r) => (
                r.id === reg.id ? { ...r, whatsapp_added: newState } : r
            )));
            toast.success(`${reg.full_name} ${newState ? 'marked as added to WhatsApp' : 'unmarked from WhatsApp'}`);
        } catch (err) {
            console.error('WhatsApp toggle error:', err);
            toast.error('Failed to update WhatsApp status');
        } finally {
            setUpdatingWhatsApp(null);
        }
    };

    const confirmUnmarkManualPaid = async () => {
        if (!unmarkTarget) return;
        const reg = unmarkTarget;
        setUnmarkBusy(true);
        setMarkingId(reg.id);
        try {
            const { error } = await supabase
                .from('event_registrations')
                .update({
                    payment_status: 'pending',
                    payment_method: null,
                })
                .eq('id', reg.id);
            if (error) throw error;

            const reference = `MANUAL-ADMIN-${reg.id}`;
            const compReference = `MANUAL-ADMIN-COMP-${reg.id}`;
            const payment = findAdminMarkedPayment(payments, reg)
                || payments.find((p) => p.reference === reference)
                || payments.find((p) => p.reference === compReference);
            if (payment) {
                const { error: payErr } = await supabase
                    .from('payments')
                    .update({
                        status: 'cancelled',
                        metadata: {
                            ...(payment.metadata || {}),
                            unmarked_by_admin: true,
                            unmarked_at: new Date().toISOString(),
                        },
                    })
                    .eq('id', payment.id);
                if (payErr) throw payErr;
            }

            await logEventActivity({
                eventId: event.id,
                action: 'admin.unmarked_paid',
                category: 'ADMIN',
                summary: `Unmarked ${reg.full_name} as paid`,
                details: {
                    registration_id: reg.id,
                    player_name: reg.full_name,
                    player_email: reg.email,
                    division: reg.division,
                },
            });

            toast.success(`Unmarked ${reg.full_name} as paid — back to pending`);
            setUnmarkTarget(null);
            load();
        } catch (err) {
            toast.error(`Failed: ${err.message}`);
        } finally {
            setUnmarkBusy(false);
            setMarkingId(null);
        }
    };

    const confirmMarkPaid = async () => {
        if (!markPaidTarget) return;
        const reg = markPaidTarget;
        const note = markPaidNote.trim();
        const isComp = markPaidMethod === 'comp';
        if (!note) {
            toast.error(isComp ? 'A note is required for complimentary entries' : 'A payment note is required for manual payments');
            return;
        }
        if (isComp && String(reg.status || '').toLowerCase() === 'withdrawn') {
            toast.error('Cannot comp a withdrawn player');
            return;
        }
        setMarkPaidBusy(true);
        setMarkingId(reg.id);
        try {
            // Comp is stored as a plain manual payment of R0 — 'comp' is a UI-only
            // selection that flags the payment row as complimentary via metadata.
            const storedMethod = isComp ? 'manual' : markPaidMethod;
            const { error } = await supabase
                .from('event_registrations')
                .update({
                    payment_status: 'paid',
                    payment_method: storedMethod,
                })
                .eq('id', reg.id);
            if (error) throw error;

            const reference = isComp ? `MANUAL-ADMIN-COMP-${reg.id}` : `MANUAL-ADMIN-${reg.id}`;
            const amount = isComp ? 0 : divFee(reg.division);
            const paymentMetadata = {
                source: isComp ? 'admin_add_player' : 'manual_event_admin',
                division: reg.division,
                email: reg.email,
                registration_id: reg.id,
                marked_by_admin: true,
                note,
                payment_note: note,
                ...(isComp ? { free_entry: true, comp_entry: true } : {}),
            };
            const { data: existing } = await supabase.from('payments').select('id, metadata').eq('reference', reference).maybeSingle();
            if (existing) {
                const { error: payErr } = await supabase
                    .from('payments')
                    .update({
                        status: 'success',
                        payment_method: storedMethod,
                        amount,
                        metadata: { ...(existing.metadata || {}), ...paymentMetadata },
                    })
                    .eq('id', existing.id);
                if (payErr) throw payErr;
            } else {
                const { error: payErr } = await supabase.from('payments').insert([{
                    event_id: event.id,
                    amount,
                    currency: 'ZAR',
                    status: 'success',
                    payment_type: 'event_entry_fee',
                    payment_method: storedMethod,
                    reference,
                    metadata: paymentMetadata,
                }]);
                if (payErr) throw payErr;
            }

            await logEventActivity({
                eventId: event.id,
                action: isComp ? 'admin.comped_entry' : 'admin.marked_paid',
                category: 'ADMIN',
                summary: isComp
                    ? `Comped entry for ${reg.full_name} (${reg.division})`
                    : `Marked ${reg.full_name} as paid (${labelPaymentMethod(markPaidMethod) || 'manual'})`,
                details: {
                    registration_id: reg.id,
                    player_name: reg.full_name,
                    player_email: reg.email,
                    division: reg.division,
                    note,
                    ...(isComp ? { free_entry: true } : { method: markPaidMethod }),
                },
            });

            toast.success(isComp ? `Comped ${reg.full_name} — free entry` : `Marked ${reg.full_name} as paid — ${note}`);
            closeMarkPaidModal();
            load();
        } catch (err) {
            toast.error(`Failed: ${err.message}`);
            setMarkPaidBusy(false);
        } finally {
            setMarkingId(null);
        }
    };

    // Other paid, partnerless (solo) entries in the SAME division that the
    // linkTarget can be paired with. Both sides are already paid, so this is a
    // pure link — no charges, no division moves.
    const eligiblePartners = useMemo(() => {
        if (!linkTarget) return [];
        const targetEmail = (linkTarget.email || '').toLowerCase();
        const q = linkSearch.trim().toLowerCase();
        return registrations.filter((r) => {
            if (r.id === linkTarget.id) return false;
            if (r.division !== linkTarget.division) return false;        // same division only
            if (r.status === 'withdrawn') return false;
            if ((r.email || '').toLowerCase() === targetEmail) return false;
            if (r.partner_name?.trim() || r.partner_email?.trim()) return false; // must be solo
            // exclude anyone already listed as another active entry's partner in this division
            const alreadyTaken = registrations.some((x) =>
                x.id !== r.id
                && x.division === r.division
                && x.status !== 'withdrawn'
                && (x.partner_email || '').toLowerCase() === (r.email || '').toLowerCase());
            if (alreadyTaken) return false;
            if (q) {
                const hay = [r.full_name, r.email].filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [linkTarget, registrations, linkSearch]);

    // Search 4M player profiles who are NOT yet entered in this division — these can
    // be added as a partner and will be invited (by email) to pay their entry.
    useEffect(() => {
        if (!linkTarget || linkSearch.trim().length < 2) { setProfileResults([]); return; }
        let cancelled = false;
        const handle = setTimeout(async () => {
            setSearchingProfiles(true);
            const q = linkSearch.trim().replace(/[,()%]/g, ' ');
            const { data } = await supabase
                .from('players')
                .select('id, name, email, image_url')
                .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
                .limit(8);
            if (cancelled) return;
            // Exclude the solo player and anyone already entered (active) in this division.
            const taken = new Set(
                registrations
                    .filter((r) => r.division === linkTarget.division && r.status !== 'withdrawn')
                    .map((r) => (r.email || '').toLowerCase()),
            );
            taken.add((linkTarget.email || '').toLowerCase());
            setProfileResults((data || []).filter((p) => p.email && !taken.has(p.email.toLowerCase())));
            setSearchingProfiles(false);
        }, 300);
        return () => { cancelled = true; clearTimeout(handle); };
    }, [linkTarget, linkSearch, registrations]);

    // Add a profile-holder who isn't entered yet as a partner: create their PENDING
    // entry, link it to the solo entry, and email them an invite to pay. Guards
    // against duplicates (never adds someone already entered in this division).
    const addUnregisteredPartner = async (soloReg, profile) => {
        setLinkBusy(true);
        try {
            const alreadyEntered = registrations.some((r) =>
                r.division === soloReg.division
                && r.status !== 'withdrawn'
                && (r.email || '').toLowerCase() === (profile.email || '').toLowerCase());
            if (alreadyEntered) {
                toast.error(`${profile.name} is already entered in ${soloReg.division}`);
                setLinkBusy(false);
                return;
            }

            const div = divisions.find((d) => d.name === soloReg.division);
            const fee = divFee(soloReg.division);

            const { data: inserted, error: insErr } = await supabase
                .from('event_registrations')
                .insert({
                    event_id: event.id,
                    email: profile.email,
                    full_name: profile.name,
                    division: soloReg.division,
                    division_id: div?.id || null,
                    payment_status: 'pending',
                    status: 'registered',
                    registered_by: soloReg.email, // the solo player is the inviter
                    partner_name: soloReg.full_name,
                    partner_email: soloReg.email,
                    partner_payment_status: 'paid', // their partner (the solo player) is paid
                })
                .select('id, pay_token')
                .maybeSingle();
            if (insErr) throw insErr;

            const { error: updErr } = await supabase
                .from('event_registrations')
                .update({
                    partner_name: profile.name,
                    partner_email: profile.email,
                    partner_payment_status: 'pending', // new partner hasn't paid yet
                })
                .eq('id', soloReg.id);
            if (updErr) throw updErr;

            // Invite-to-pay email (best-effort).
            const eventUrl = `https://4mpadel.co.za/calendar/${event.slug || event.id}`;
            const payUrl = inserted?.pay_token ? `${eventUrl}?pay_token=${inserted.pay_token}` : eventUrl;
            try {
                await sendEmail(profile.email, 'partner_invite', {
                    eventId: event.id,
                    playerName: profile.name,
                    inviterName: soloReg.full_name,
                    eventName: event.event_name,
                    division: soloReg.division,
                    eventDates: event.event_dates || '',
                    amountDue: fmtR(fee),
                    payUrl,
                });
            } catch (mailErr) {
                console.error('Partner invite email failed:', mailErr);
            }

            toast.success(`Invited ${profile.name} — they'll get an email to pay their entry`);
            setLinkTarget(null);
            setLinkSearch('');
            setProfileResults([]);
            load();
        } catch (err) {
            toast.error(err.message || 'Failed to add partner');
        } finally {
            setLinkBusy(false);
        }
    };

    // Pair two paid solo entries into a team by mutually linking their rows.
    const linkPartner = async (soloReg, partnerReg) => {
        setLinkBusy(true);
        try {
            // Pairing is a pure link, not a payment event — each side's
            // partner_payment_status just mirrors what the other has actually paid.
            const [a, b] = await Promise.all([
                supabase.from('event_registrations').update({
                    partner_name: partnerReg.full_name,
                    partner_email: partnerReg.email,
                    partner_payment_status: partnerReg.payment_status === 'paid' ? 'paid' : 'pending',
                }).eq('id', soloReg.id),
                supabase.from('event_registrations').update({
                    partner_name: soloReg.full_name,
                    partner_email: soloReg.email,
                    partner_payment_status: soloReg.payment_status === 'paid' ? 'paid' : 'pending',
                }).eq('id', partnerReg.id),
            ]);
            if (a.error) throw a.error;
            if (b.error) throw b.error;

            // Notify both players that they're now a team (best-effort).
            try {
                await Promise.all([
                    sendEmail(soloReg.email, 'partner_assigned', {
                        eventId: event.id,
                        playerName: soloReg.full_name,
                        partnerName: partnerReg.full_name,
                        eventName: event.event_name,
                        division: soloReg.division,
                    }),
                    sendEmail(partnerReg.email, 'partner_assigned', {
                        eventId: event.id,
                        playerName: partnerReg.full_name,
                        partnerName: soloReg.full_name,
                        eventName: event.event_name,
                        division: soloReg.division,
                    }),
                ]);
            } catch (mailErr) {
                console.error('Partner-assigned email failed:', mailErr);
            }

            toast.success(`Paired ${soloReg.full_name} with ${partnerReg.full_name}`);
            setLinkTarget(null);
            setLinkSearch('');
            load();
        } catch (err) {
            toast.error(err.message || 'Failed to pair players');
        } finally {
            setLinkBusy(false);
        }
    };

    const openMovePlayer = (reg) => {
        setMoveTarget(reg);
        setMoveTeamPlayers([reg]);
        setMoveTeamTogether(false);
        setMoveDivId('');
    };

    const openMoveTeam = (team) => {
        setMoveTarget(team.players[0]);
        setMoveTeamPlayers(team.players);
        setMoveTeamTogether(team.players.length > 1);
        setMoveDivId('');
    };

    const closeMoveModal = () => {
        setMoveTarget(null);
        setMoveTeamPlayers([]);
        setMoveTeamTogether(false);
        setMoveDivId('');
    };

    const playersToMove = useMemo(() => (
        moveTeamTogether && moveTeamPlayers.length > 1 ? moveTeamPlayers : (moveTarget ? [moveTarget] : [])
    ), [moveTeamTogether, moveTeamPlayers, moveTarget]);

    const registrationInDivision = useCallback((regRow, div) => {
        if (!regRow || !div) return false;
        if (regRow.division_id && div.id && regRow.division_id === div.id) return true;
        if (regRow.division === div.name) return true;
        const linked = divisions.find((d) => d.id === regRow.division_id);
        return linked?.name === div.name;
    }, [divisions]);

    // Divisions entries can be moved into: active, not the current one, and not
    // one any moving player is already actively entered in (withdrawn rows are
    // archived automatically on move).
    const eligibleMoveDivisions = useMemo(() => {
        if (!moveTarget || playersToMove.length === 0) return [];
        return divisions.filter((d) => {
            if (registrationInDivision(moveTarget, d)) return false;
            if (d.is_active === false) return false;
            return playersToMove.every((reg) => {
                const email = (reg.email || '').toLowerCase();
                const activeConflict = registrations.some((r) =>
                    r.id !== reg.id
                    && (r.email || '').toLowerCase() === email
                    && registrationInDivision(r, d)
                    && String(r.status || '').toLowerCase() !== 'withdrawn');
                return !activeConflict;
            });
        });
    }, [moveTarget, playersToMove, divisions, registrations, registrationInDivision]);

    const archiveConflictSlot = async (rowId) => {
        // RLS allows UPDATE but not DELETE — reassign division to free the unique slot.
        const { error } = await supabase
            .from('event_registrations')
            .update({
                division: `__archived__/${rowId}`,
                division_id: null,
                status: 'withdrawn',
                withdrawn_at: new Date().toISOString(),
            })
            .eq('id', rowId);
        if (error) throw error;
    };

    const releaseDivisionSlotConflicts = async (reg, targetDiv) => {
        const email = (reg.email || '').toLowerCase();
        const { data: rows, error: fetchErr } = await supabase
            .from('event_registrations')
            .select('id, status, full_name, division, division_id')
            .eq('event_id', event.id)
            .ilike('email', email)
            .neq('id', reg.id);

        if (fetchErr) throw fetchErr;

        const conflicts = (rows || []).filter((r) => registrationInDivision(r, targetDiv));
        for (const row of conflicts) {
            if (String(row.status || '').toLowerCase() === 'withdrawn') {
                await archiveConflictSlot(row.id);
            } else {
                throw new Error(`${reg.full_name || email} already has an active entry in ${targetDiv.name}. Remove it before moving.`);
            }
        }
    };

    const unlinkExternalPartnersInDivision = async (divisionName, movingIds) => {
        const movingSet = new Set(movingIds);
        const toUnlink = registrations.filter((r) =>
            r.division === divisionName
            && r.status !== 'withdrawn'
            && !movingSet.has(r.id)
            && r.partner_email
            && playersToMove.some((m) => (m.email || '').toLowerCase() === (r.partner_email || '').toLowerCase()),
        );

        for (const row of toUnlink) {
            const { error } = await supabase
                .from('event_registrations')
                .update({ partner_name: null, partner_email: null, partner_payment_status: null })
                .eq('id', row.id);
            if (error) throw error;
        }
    };

    // Move one or more entries to another division. Team moves keep the pairing intact.
    const moveEntries = async () => {
        if (!moveTarget || !moveDivId) return;
        const targetDiv = divisions.find((d) => d.id === moveDivId);
        if (!targetDiv) return;
        const toMove = playersToMove;
        const movingIds = toMove.map((r) => r.id);
        setMoveBusy(true);
        try {
            const oldFee = divFee(moveTarget.division);
            const newFee = Number(targetDiv.entry_fee || 0);
            const sourceDivision = moveTarget.division;

            if (!moveTeamTogether && moveTarget.partner_email) {
                await supabase.from('event_registrations')
                    .update({ partner_name: null, partner_email: null, partner_payment_status: null })
                    .eq('event_id', event.id)
                    .ilike('email', moveTarget.partner_email)
                    .eq('division', sourceDivision)
                    .neq('status', 'withdrawn');
            }

            if (moveTeamTogether && toMove.length > 1) {
                await unlinkExternalPartnersInDivision(sourceDivision, movingIds);
            }

            // Park team rows in unique temporary divisions so simultaneous moves
            // cannot collide on the (event_id, email, division) constraint.
            if (toMove.length > 1) {
                for (const reg of toMove) {
                    const { error: parkErr } = await supabase
                        .from('event_registrations')
                        .update({ division: `__moving__/${reg.id}`, division_id: null })
                        .eq('id', reg.id);
                    if (parkErr) throw parkErr;
                }
            }

            // Withdrawn ghost rows still occupy the unique slot; archive them
            // (DELETE is blocked by RLS — only UPDATE is allowed).
            for (const reg of toMove) {
                await releaseDivisionSlotConflicts(reg, targetDiv);
            }

            for (const reg of toMove) {
                const owesMore = newFee > oldFee && reg.payment_status === 'paid';
                const newStatus = owesMore ? 'pending' : reg.payment_status;

                const updates = {
                    division_id: targetDiv.id,
                    division: targetDiv.name,
                    registered_by: reg.email,
                    payment_status: newStatus,
                };

                if (moveTeamTogether && toMove.length > 1) {
                    const partner = toMove.find((p) => p.id !== reg.id);
                    if (partner) {
                        updates.partner_name = partner.full_name;
                        updates.partner_email = partner.email;
                        updates.partner_payment_status = partner.payment_status;
                    }
                } else {
                    updates.partner_name = null;
                    updates.partner_email = null;
                    updates.partner_payment_status = null;
                }

                // .select() surfaces silent RLS no-ops (0 rows, no error) that left
                // players stuck in the old division on the public Players tab.
                const { data: movedRows, error } = await supabase
                    .from('event_registrations')
                    .update(updates)
                    .eq('id', reg.id)
                    .select('id, division');
                if (error) throw error;
                if (!movedRows?.length) {
                    throw new Error(
                        `Could not move ${reg.full_name || reg.email}. You may not have permission to update this event's registrations — ask a 4M admin to apply the org-admin RLS migration.`,
                    );
                }

                const { error: partErr } = await supabase.rpc('reassign_tournament_participant_division', {
                    p_event_id: event.id,
                    p_email: reg.email || '',
                    p_full_name: reg.full_name || '',
                    p_from_class: sourceDivision,
                    p_to_class: targetDiv.name,
                    p_is_paid: newStatus === 'paid',
                });
                if (partErr) {
                    console.warn('Participant division sync failed:', partErr.message);
                }

                // Keep Paystack covers on the new division so status stays Via Paystack.
                const regEmail = (reg.email || '').toLowerCase();
                const relatedPays = (payments || []).filter((p) => {
                    if (p.status !== 'success') return false;
                    const blob = JSON.stringify(p.metadata || {}).toLowerCase();
                    return regEmail && blob.includes(regEmail);
                });
                await Promise.all(relatedPays.map(async (p) => {
                    let meta = p.metadata || {};
                    if (typeof meta === 'string') {
                        try { meta = JSON.parse(meta); } catch { meta = {}; }
                    }
                    const covers = Array.isArray(meta.covers) ? meta.covers : [];
                    let changed = false;
                    const nextCovers = covers.map((c) => {
                        if (
                            c?.type === 'entry'
                            && (c.email || '').toLowerCase() === regEmail
                            && (c.division || '') === sourceDivision
                        ) {
                            changed = true;
                            return { ...c, division: targetDiv.name };
                        }
                        return c;
                    });
                    if (!changed) return;
                    const fees = { ...(meta.division_entry_fees || {}) };
                    fees[targetDiv.name] = newFee;
                    const { error: payErr } = await supabase
                        .from('payments')
                        .update({
                            metadata: {
                                ...meta,
                                covers: nextCovers,
                                division_entry_fees: fees,
                            },
                        })
                        .eq('id', p.id);
                    if (payErr) console.warn('Payment cover rewrite on move failed:', payErr.message);
                }));

                let feeNote = 'There was no change to your entry fee.';
                if (owesMore) feeNote = `Your new division has a higher entry fee of ${fmtR(newFee)}. Your entry is now marked pending — please complete payment to confirm your spot.`;
                else if (newFee < oldFee) feeNote = 'Your new division has a lower entry fee; any difference will be handled by the organiser.';

                try {
                    await sendEmail(reg.email, 'division_changed', {
                        eventId: event.id,
                        playerName: reg.full_name,
                        eventName: event.event_name,
                        fromDivision: sourceDivision,
                        toDivision: targetDiv.name,
                        division: targetDiv.name,
                        partnerName: moveTeamTogether && toMove.length > 1
                            ? toMove.find((p) => p.id !== reg.id)?.full_name || 'TBD'
                            : 'TBD',
                        paid: newStatus === 'paid',
                        amount: fmtR(newFee),
                        amountDue: newStatus === 'paid' ? 'R 0.00' : fmtR(newFee),
                        feeNote,
                    });
                } catch (mailErr) {
                    console.error('Move email failed:', mailErr);
                }
            }

            const teamLabel = moveTeamTogether && toMove.length > 1
                ? `team (${toMove.map((p) => p.full_name).join(' & ')})`
                : moveTarget.full_name;
            const anyOwesMore = toMove.some((reg) => newFee > oldFee && reg.payment_status === 'paid');

            await logEventActivity({
                eventId: event.id,
                action: 'admin.moved_entries',
                category: 'ADMIN',
                summary: `Moved ${teamLabel} from ${sourceDivision} to ${targetDiv.name}`,
                details: {
                    from_division: sourceDivision,
                    to_division: targetDiv.name,
                    players: toMove.map((p) => p.full_name),
                    registration_ids: movingIds,
                    fee_changed: anyOwesMore,
                },
            });

            toast.success(anyOwesMore
                ? `Moved ${teamLabel} to ${targetDiv.name} — marked pending payment where owed`
                : `Moved ${teamLabel} to ${targetDiv.name}`);
            closeMoveModal();
            load();
        } catch (err) {
            toast.error(err.message || 'Failed to move');
        } finally {
            setMoveBusy(false);
        }
    };

    const invokeAdminRefund = async (body) => {
        const { data, error } = await supabase.functions.invoke('paystack-refund', { body });
        if (error) {
            let payload = null;
            try {
                if (error.context && typeof error.context.json === 'function') {
                    payload = await error.context.json();
                }
            } catch {
                // ignore
            }
            throw new Error(payload?.error || payload?.message || error.message || 'Request failed');
        }
        if (data?.error) throw new Error(data.message || data.error);
        return data;
    };

    const retryFailedRefund = async (paymentRefundId) => {
        if (!paymentRefundId || retryRefundId) return;
        setRetryRefundId(paymentRefundId);
        try {
            const res = await invokeAdminRefund({
                action: 'retry_failed',
                payment_refund_id: paymentRefundId,
            });
            if (res?.status === 'processed' || res?.retried) {
                toast.success(res.settled_without_paystack_call
                    ? 'Refund marked processed (already settled on Paystack)'
                    : `Refund re-initiated${res.amount_rands ? ` — R ${Number(res.amount_rands).toFixed(2)}` : ''}`);
            } else {
                toast.success('Refund retry submitted');
            }
            load();
        } catch (err) {
            toast.error(err.message || 'Failed to retry refund');
        } finally {
            setRetryRefundId(null);
        }
    };

    const partnerRegOf = (reg) => {
        if (!reg?.partner_email) return null;
        const pe = reg.partner_email.toLowerCase();
        return registrations.find(
            (x) => x.id !== reg.id
                && (x.email || '').toLowerCase() === pe
                && x.division === reg.division
                && x.status !== 'withdrawn',
        ) || null;
    };

    // mode: 'refund' (Paystack/auto) | 'cash_refund' (mark refunded, no Paystack) | 'no_refund'
    const removeRegistration = async (reg, mode) => {
        setRemoveBusy(true);
        try {
            const flags = {};
            if (mode === 'cash_refund') flags.skip_paystack = true;
            if (mode === 'no_refund') flags.no_refund = true;

            const toRemove = [reg];
            if (removePair) {
                const pr = partnerRegOf(reg);
                if (pr) toRemove.push(pr);
            }

            let totalRefunded = 0;
            for (const t of toRemove) {
                const res = await invokeAdminRefund({ action: 'admin_remove', registration_id: t.id, ...flags });
                totalRefunded += Number(res?.total_refunded_rands || 0);
            }

            await logEventActivity({
                eventId: event.id,
                action: 'admin.removed',
                category: 'ADMIN',
                summary: `Removed ${toRemove.map((t) => t.full_name).join(' & ')}${totalRefunded > 0 ? ` · refunded ${fmtR(totalRefunded)}` : mode === 'no_refund' ? ' · no refund' : ''}`,
                details: {
                    players: toRemove.map((t) => t.full_name),
                    registration_ids: toRemove.map((t) => t.id),
                    mode,
                    refunded: totalRefunded,
                    division: reg.division,
                },
            });

            toast.success(totalRefunded > 0 ? `Removed — ${fmtR(totalRefunded)} refunded` : 'Removed');
            setRemoveTarget(null);
            setRemovePair(false);
            load();
        } catch (err) {
            toast.error(err.message || 'Failed to remove');
        } finally {
            setRemoveBusy(false);
        }
    };

    const findPaymentForReg = useCallback(
        (reg) => findPaymentForRegistration(payments.filter((p) => p.status === 'success'), reg),
        [payments],
    );

    const resolvePaymentPayer = useCallback((reg, payment) => {
        // Partner-paid ONLY when the payment names a different payer AND that
        // payment explicitly covers this registration. Who created the booking
        // (registered_by) is NOT a payment signal — teams register together but
        // pay separately all the time.
        const { isPartnerPaid, payerEmail } = resolveRegistrationPayer(payment, reg);
        if (!isPartnerPaid) return { isPartnerPaid: false, payerName: null };

        const payerName = registrations.find((x) => (x.email || '').toLowerCase() === payerEmail)?.full_name
            || ((reg.partner_email || '').toLowerCase() === payerEmail ? reg.partner_name : null)
            || payment?.metadata?.paid_by_name
            || payerEmail;
        return { isPartnerPaid: true, payerName };
    }, [registrations]);

    const formatPaymentStatusForExport = useCallback((r) => {
        if (r.payment_status !== 'paid') return r.payment_status || 'pending';

        const payment = findPaymentForReg(r);
        const { isPartnerPaid, payerName } = resolvePaymentPayer(r, payment);
        if (isPartnerPaid) return `Paid by Partner ${payerName || r.registered_by}`;
        return 'Paid';
    }, [findPaymentForReg, resolvePaymentPayer]);

    const formatPaymentMethodForExport = useCallback((r) => {
        if (!registrationCountsAsPaid(r, refundByReg, payments)) return '';

        if (registrationIsCompedEntry(r, payments)) return 'Comped';

        const payment = findPaymentForReg(r);
        if (isExplicitAdminMarkedPayment(payment)) {
            const method = resolveRegistrationPaymentMethod(r, payment);
            if (method && method !== 'paystack') return labelPaymentMethod(method);
            return 'Manual';
        }

        if (isPaystackEntryPayment(r, payments, refundByReg)) return 'Paystack';

        const method = resolveRegistrationPaymentMethod(r, payment);
        if (method && method !== 'paystack') return labelPaymentMethod(method);

        return 'Manual';
    }, [findPaymentForReg, payments, refundByReg]);

    const getPaymentDetails = useCallback((reg) => {
        if (!registrationCountsAsPaid(reg, refundByReg, payments)) return null;

        let payment = findPaymentForReg(reg);
        // Never surface LIC-* split ledger rows as the entry payment (wrong Manual note).
        if (payment && isLicensePaymentRow(payment)) {
            payment = findParentEntryPayment(payments, payment) || payment;
        }
        const { isPartnerPaid, payerName } = resolvePaymentPayer(reg, payment);
        const method = resolveRegistrationPaymentMethod(reg, payment) || (isPartnerPaid ? 'partner' : 'paystack');
        const rawNote = payment?.metadata?.note || payment?.metadata?.payment_note || null;
        const note = (rawNote && /license portion split/i.test(String(rawNote)))
            ? null
            : rawNote;
        const isExplicitAdminMark = isExplicitAdminMarkedPayment(payment);
        const isCompedChannel = isCompedEntryPayment(payment) || registrationIsCompedEntry(reg, payments);
        const isPaystackChannel = !isCompedChannel && !isExplicitAdminMark && (
            isPaystackEntryPayment(reg, payments, refundByReg)
            || (payment && isPaystackPaymentMethod(payment.payment_method) && !isLicensePaymentRow(payment))
        );
        const isManualChannel = !isPartnerPaid && !isPaystackChannel && !isCompedChannel;

        return {
            isPartnerPaid,
            payerName,
            method,
            note,
            isExplicitAdminMark,
            isCompedChannel,
            isManualChannel,
            payment,
        };
    }, [findPaymentForReg, resolvePaymentPayer, refundByReg, payments]);

    const isManualChannelRegistration = useCallback((reg) => {
        const details = getPaymentDetails(reg);
        return !!details?.isManualChannel;
    }, [getPaymentDetails]);

    const renderPaymentDetails = useCallback((reg) => {
        const details = getPaymentDetails(reg);
        if (!details) return null;

        const channelLabel = details.isPartnerPaid ? (
            <span className="text-[9px] font-bold text-sky-300">
                Paid by {details.payerName || 'partner'}
            </span>
        ) : details.isCompedChannel ? (
            <span className="text-[9px] font-bold text-violet-300">
                Comped
            </span>
        ) : details.isManualChannel ? (
            details.method && details.method !== 'paystack' ? (
                <span className="text-[9px] font-bold text-amber-300">
                    {labelPaymentMethod(details.method)}
                </span>
            ) : null
        ) : (
            <span className="text-[9px] font-bold text-gray-400">
                Via {labelPaymentMethod(details.method) || 'Paystack'}
            </span>
        );

        return (
            <div className="mt-1 flex items-center gap-1 flex-wrap">
                {channelLabel}
                <PaymentNoteButton
                    note={details.note}
                    regId={reg.id}
                    openId={openPaymentNoteId}
                    onOpen={setOpenPaymentNoteId}
                />
            </div>
        );
    }, [getPaymentDetails, openPaymentNoteId]);

    const formatLicenseForExport = useCallback((r) => {
        const email = (r.email || '').toLowerCase();
        const player = playersByEmail.get(email);
        return formatRegistrationLicenseLabel(email, event?.id, player, payments);
    }, [playersByEmail, payments, event?.id]);

    const getLicenseCategory = useCallback((reg) => {
        const email = (reg.email || '').toLowerCase();
        const player = playersByEmail.get(email);
        return resolveRegistrationLicenseCategory(email, event?.id, player, payments);
    }, [playersByEmail, payments, event?.id]);

    const regMatchesPaymentFilter = useCallback((reg) => {
        if (paymentFilter === 'all') return true;
        if (paymentFilter === 'paid') return registrationCountsAsPaid(reg, refundByReg, payments);
        if (paymentFilter === 'refunded') {
            const ps = String(reg.payment_status || '').toLowerCase();
            return ps === 'refunded' || hasBlockingProcessedRefund(reg, refundByReg, payments);
        }
        if (paymentFilter === 'pending') {
            if (isWithdrawnRegistration(reg)) return false;
            const ps = String(reg.payment_status || 'pending').toLowerCase();
            return !registrationCountsAsPaid(reg, refundByReg, payments) && ps !== 'refunded';
        }
        if (paymentFilter === 'manual') return isManualChannelRegistration(reg);
        return true;
    }, [paymentFilter, refundByReg, payments, isManualChannelRegistration]);

    const regMatchesLicenseFilter = useCallback((reg) => {
        if (licenseFilter === 'all') return true;
        return getLicenseCategory(reg) === licenseFilter;
    }, [licenseFilter, getLicenseCategory]);

    const filtered = useMemo(() => {
        let rows = registrations;
        if (paymentFilter === 'withdrawn') {
            rows = rows.filter((r) => isWithdrawnRegistration(r));
        } else {
            rows = dedupeRegistrationsByEmailDivision(
                rows.filter((r) => !isWithdrawnRegistration(r)),
            );
            if (paymentFilter !== 'all') {
                rows = rows.filter((r) => regMatchesPaymentFilter(r));
            }
        }
        if (licenseFilter !== 'all') {
            rows = rows.filter((r) => regMatchesLicenseFilter(r));
        }
        if (divisionFilter !== 'all') {
            rows = rows.filter((r) => r.division === divisionFilter);
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            rows = rows.filter((r) =>
                [r.full_name, r.email, r.division, r.partner_name, r.partner_email].filter(Boolean).some((v) => v.toLowerCase().includes(q))
            );
        }
        const sorted = [...rows];
        if (sortBy === 'division') {
            sorted.sort((a, b) =>
                (a.division || '').localeCompare(b.division || '')
                || (a.full_name || '').localeCompare(b.full_name || ''));
        } else if (sortBy === 'name') {
            sorted.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        }
        return sorted;
    }, [registrations, paymentFilter, licenseFilter, search, divisionFilter, sortBy, regMatchesPaymentFilter, regMatchesLicenseFilter]);

    const activeRegistrations = useMemo(
        () => dedupeRegistrationsByEmailDivision(
            registrations.filter((r) => !isWithdrawnRegistration(r)),
        ),
        [registrations],
    );

    const orderTeamPlayers = useCallback((players) => {
        if (players.length <= 1) return [...players];
        const pts = (reg) => Number(playersByEmail.get((reg.email || '').toLowerCase())?.points || 0);
        return [...players].sort((a, b) => {
            const ptsDiff = pts(b) - pts(a);
            if (ptsDiff !== 0) return ptsDiff;
            const aBooker = (a.registered_by || '').toLowerCase() === (a.email || '').toLowerCase();
            const bBooker = (b.registered_by || '').toLowerCase() === (b.email || '').toLowerCase();
            if (aBooker && !bBooker) return -1;
            if (!aBooker && bBooker) return 1;
            const aTime = new Date(a.created_at || 0).getTime();
            const bTime = new Date(b.created_at || 0).getTime();
            if (aTime !== bTime) return aTime - bTime;
            return (a.full_name || '').localeCompare(b.full_name || '');
        });
    }, [playersByEmail]);

    const teamsByDivision = useMemo(() => {
        const result = {};
        divisions.forEach(d => {
            result[d.name] = [];
            const divRegs = activeRegistrations.filter(r => r.division === d.name);
            const processed = new Set();

            divRegs.forEach(reg => {
                if (processed.has(reg.id)) return;
                processed.add(reg.id);

                const partner = divRegs.find(r => r.id !== reg.id && (r.email || '').toLowerCase() === (reg.partner_email || '').toLowerCase());
                if (partner) {
                    processed.add(partner.id);
                    const players = orderTeamPlayers([reg, partner]);
                    result[d.name].push({ id: `team_${players[0].id}`, players });
                } else {
                    result[d.name].push({ id: `team_${reg.id}`, players: [reg] });
                }
            });
        });
        return result;
    }, [activeRegistrations, divisions, orderTeamPlayers]);

    const getPlayerProfile = useCallback((reg) => {
        if (!reg?.email) return null;
        return playersByEmail.get((reg.email || '').toLowerCase()) || null;
    }, [playersByEmail]);

    const getPlayerImage = useCallback((reg) => {
        return getPlayerProfile(reg)?.image_url || null;
    }, [getPlayerProfile]);

    const getPlayerPoints = useCallback((reg) => {
        return Number(getPlayerProfile(reg)?.points || 0);
    }, [getPlayerProfile]);

    const getPlayerPhone = useCallback((reg) => {
        return (
            reg?.phone
            || reg?.contact_number
            || getPlayerProfile(reg)?.contact_number
            || null
        );
    }, [getPlayerProfile]);

    const openProfileLinkModal = useCallback((reg) => {
        const profile = getPlayerProfile(reg);
        setMatchingProfileReg(reg);
        setProfileLinkSearch(profile?.name || reg.full_name || reg.email || '');
    }, [getPlayerProfile]);

    const renderProfileLink = useCallback((reg) => {
        const profile = getPlayerProfile(reg);
        if (profile) {
            return (
                <div className="flex items-center gap-2 text-padel-green font-bold text-sm min-w-0">
                    <CheckCircle size={14} className="shrink-0" />
                    <button
                        type="button"
                        onClick={() => setProfileViewTarget(reg)}
                        className="truncate text-left hover:underline hover:text-padel-green/90 transition-colors"
                        title="View profile"
                    >
                        {profile.name || reg.full_name}
                    </button>
                    <button
                        type="button"
                        onClick={() => openProfileLinkModal(reg)}
                        className="text-gray-500 hover:text-white transition-colors shrink-0"
                        title="Change linked profile"
                    >
                        <Link2 size={12} />
                    </button>
                </div>
            );
        }
        return (
            <div className="flex items-center gap-2 min-w-0">
                <button
                    type="button"
                    onClick={() => setProfileViewTarget(reg)}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors italic text-sm truncate"
                    title="View registration details"
                >
                    <UserPlus size={14} className="shrink-0" />
                    <span className="truncate">{reg.full_name || 'Link Profile'}</span>
                </button>
                <button
                    type="button"
                    onClick={() => openProfileLinkModal(reg)}
                    className="text-gray-500 hover:text-sky-400 transition-colors shrink-0 text-[10px] font-bold uppercase"
                    title="Link 4M profile"
                >
                    Link
                </button>
            </div>
        );
    }, [getPlayerProfile, openProfileLinkModal]);

    const renderPlayerNameButton = useCallback((reg, className = '') => {
        const phone = getPlayerPhone(reg);
        return (
            <div className="flex flex-col gap-0.5 min-w-0">
                <button
                    type="button"
                    onClick={() => setProfileViewTarget(reg)}
                    className={`text-left hover:text-padel-green hover:underline transition-colors ${className}`}
                    title="View profile"
                >
                    {reg.full_name}
                </button>
                {phone ? (
                    <a
                        href={`tel:${phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-padel-green transition-colors"
                        title={`Call ${reg.full_name || ''}`}
                    >
                        <Phone size={10} className="shrink-0" />
                        <span className="truncate">{phone}</span>
                    </a>
                ) : (
                    <span className="text-[11px] text-gray-600 italic">No number</span>
                )}
            </div>
        );
    }, [getPlayerPhone]);

    const searchProfilesForLink = useCallback(async (query) => {
        const q = (query || '').trim();
        if (q.length < 2) {
            setProfileLinkResults([]);
            return;
        }
        setSearchingProfiles(true);
        try {
            const { data, error } = await supabase
                .from('players')
                .select('id, name, email, contact_number')
                .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
                .order('name')
                .limit(20);
            if (error) throw error;
            setProfileLinkResults(data || []);
        } catch (err) {
            console.error('Profile search failed:', err.message);
            setProfileLinkResults([]);
        } finally {
            setSearchingProfiles(false);
        }
    }, []);

    useEffect(() => {
        if (!matchingProfileReg) {
            setProfileLinkResults([]);
            return;
        }
        const seed = (matchingProfileReg.full_name || matchingProfileReg.email || '').trim();
        if (seed.length >= 2) searchProfilesForLink(seed);
    }, [matchingProfileReg, searchProfilesForLink]);

    const linkRegistrationToProfile = async (reg, player) => {
        setProfileLinkBusy(true);
        try {
            const fromEmail = String(reg.email || '').trim();
            const toEmail = String(player.email || '').trim();
            const { error } = await supabase
                .from('event_registrations')
                .update({ email: player.email, full_name: player.name })
                .eq('id', reg.id);
            if (error) throw error;

            // Keep partner pointers + payment covers in sync when linking rewrites
            // the registration email (otherwise Paystack team payments look "manual").
            if (fromEmail && toEmail && fromEmail.toLowerCase() !== toEmail.toLowerCase()) {
                await supabase
                    .from('event_registrations')
                    .update({ partner_email: toEmail })
                    .eq('event_id', event.id)
                    .ilike('partner_email', fromEmail);

                const rewriteEmailDeep = (value) => {
                    if (Array.isArray(value)) return value.map(rewriteEmailDeep);
                    if (!value || typeof value !== 'object') return value;
                    const next = { ...value };
                    for (const key of Object.keys(next)) {
                        if (typeof next[key] === 'string' && next[key].toLowerCase() === fromEmail.toLowerCase()) {
                            next[key] = toEmail;
                        } else if (next[key] && typeof next[key] === 'object') {
                            next[key] = rewriteEmailDeep(next[key]);
                        }
                    }
                    return next;
                };

                const relatedPayments = (payments || []).filter((p) => {
                    const blob = JSON.stringify(p.metadata || {}).toLowerCase();
                    return blob.includes(fromEmail.toLowerCase());
                });
                await Promise.all(relatedPayments.map(async (p) => {
                    let base = p.metadata || {};
                    if (typeof base === 'string') {
                        try { base = JSON.parse(base); } catch { base = {}; }
                    }
                    const metadata = rewriteEmailDeep(base);
                    const { error: payErr } = await supabase
                        .from('payments')
                        .update({ metadata })
                        .eq('id', p.id);
                    if (payErr) console.warn('Payment cover rewrite failed:', payErr.message);
                }));
            }

            await logEventActivity({
                eventId: event.id,
                action: 'admin.linked_profile',
                category: 'ADMIN',
                summary: `Linked registration to profile ${player.name}`,
                details: {
                    registration_id: reg.id,
                    from_name: reg.full_name,
                    from_email: fromEmail,
                    to_name: player.name,
                    to_email: player.email,
                },
            });

            toast.success(`Linked ${reg.full_name} to ${player.name}`);
            setMatchingProfileReg(null);
            setProfileLinkSearch('');
            load();
        } catch (err) {
            toast.error(err.message || 'Failed to link profile');
        } finally {
            setProfileLinkBusy(false);
        }
    };

    const licenseBadge = useCallback((reg) => {
        const license = formatLicenseForExport(reg);
        if (license.includes('Full')) {
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><Check size={10} /> Full license</span>;
        }
        if (license.includes('Temporary')) {
            return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-sky-500/10 text-sky-400 border border-sky-500/20"><Check size={10} /> Temp license</span>;
        }
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20">No license</span>;
    }, [formatLicenseForExport]);

    const paymentBadge = useCallback((reg) => {
        const details = getPaymentDetails(reg);
        if (details) {
            if (details.isCompedChannel) {
                return (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-violet-500/10 text-violet-300 border border-violet-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400" /> Comped
                    </span>
                );
            }
            if (details.isManualChannel) {
                return (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Manual
                    </span>
                );
            }
            return (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Paid
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-500/10 text-amber-400">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Pending
            </span>
        );
    }, [getPaymentDetails]);

    const canMarkRegistrationPaid = useCallback((reg) => (
        String(reg?.status || '').toLowerCase() !== 'withdrawn'
        && !registrationCountsAsPaid(reg, refundByReg, payments)
    ), [refundByReg, payments]);

    const canUnmarkAdminPaid = useCallback((reg) => {
        if (String(reg?.status || '').toLowerCase() === 'withdrawn') return false;
        if (!registrationCountsAsPaid(reg, refundByReg, payments)) return false;
        const details = getPaymentDetails(reg);
        return !!details?.isExplicitAdminMark && !details.isPartnerPaid;
    }, [refundByReg, payments, getPaymentDetails]);

    const renderPaymentCell = useCallback((reg) => {
        const details = getPaymentDetails(reg);
        const channelLabel = details ? (
            details.isPartnerPaid ? (
                <span className="text-[9px] font-bold text-sky-300">
                    Paid by {details.payerName || 'partner'}
                </span>
            ) : details.isCompedChannel ? (
                <span className="text-[9px] font-bold text-violet-300">
                    Comped
                </span>
            ) : details.isManualChannel ? (
                details.method && details.method !== 'paystack' ? (
                    <span className="text-[9px] font-bold text-amber-300">
                        {labelPaymentMethod(details.method)}
                    </span>
                ) : null
            ) : (
                <span className="text-[9px] font-bold text-gray-400">
                    Via {labelPaymentMethod(details.method) || 'Paystack'}
                </span>
            )
        ) : null;

        return (
            <div className="flex flex-wrap items-center gap-1.5">
                {paymentBadge(reg)}
                {canMarkRegistrationPaid(reg) ? (
                    <button
                        type="button"
                        onClick={() => openMarkPaidModal(reg)}
                        disabled={markingId === reg.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold border bg-sky-500/10 text-sky-400 border-sky-500/25 hover:bg-sky-500/20 hover:text-sky-300 disabled:opacity-50 transition-colors"
                    >
                        {markingId === reg.id ? <Loader2 size={10} className="animate-spin" /> : <Pencil size={10} />}
                        Mark paid
                    </button>
                ) : (
                    <>
                        {channelLabel}
                        {details && (
                            <PaymentNoteButton
                                note={details.note}
                                regId={reg.id}
                                openId={openPaymentNoteId}
                                onOpen={setOpenPaymentNoteId}
                            />
                        )}
                        {canUnmarkAdminPaid(reg) && (
                            <button
                                type="button"
                                onClick={() => setUnmarkTarget(reg)}
                                disabled={markingId === reg.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold border bg-red-500/10 text-red-400 border-red-500/25 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50 transition-colors"
                            >
                                {markingId === reg.id ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                                {details?.isCompedChannel ? 'Remove comp' : 'Unmark paid'}
                            </button>
                        )}
                    </>
                )}
            </div>
        );
    }, [paymentBadge, canMarkRegistrationPaid, canUnmarkAdminPaid, markingId, getPaymentDetails, openPaymentNoteId]);

    const renderWhatsAppToggle = useCallback((reg) => (
        <button
            type="button"
            onClick={() => handleToggleWhatsApp(reg)}
            disabled={updatingWhatsApp === reg.id}
            className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
                reg.whatsapp_added
                    ? 'bg-green-500/10 border-green-500/20 text-green-500'
                    : 'bg-white/5 border-white/10 text-gray-500 hover:text-white hover:border-white/20'
            }`}
            title={reg.whatsapp_added ? 'Mark as not added' : 'Mark as added to WhatsApp'}
        >
            {updatingWhatsApp === reg.id ? (
                <Loader2 size={12} className="animate-spin" />
            ) : reg.whatsapp_added ? (
                <Check size={12} className="group-hover:hidden" />
            ) : (
                <MessageCircle size={12} />
            )}
            {reg.whatsapp_added && <XCircle size={12} className="hidden group-hover:block text-red-500" />}
            <span className="text-[9px] font-black uppercase tracking-tight">
                {reg.whatsapp_added ? 'On Group' : 'Add'}
            </span>
        </button>
    ), [updatingWhatsApp]);

    const teamsWithSeedsByDivision = useMemo(() => {
        const result = {};
        divisions.forEach((cls) => {
            const teams = teamsByDivision[cls.name] || [];
            const enriched = teams.map((team) => {
                const totalPoints = team.players.reduce((sum, reg) => sum + getPlayerPoints(reg), 0);
                return { ...team, totalPoints };
            });
            const ranked = [...enriched].filter((t) => t.totalPoints > 0).sort((a, b) => b.totalPoints - a.totalPoints);
            const seedMap = {};
            ranked.forEach((t, idx) => { seedMap[t.id] = idx + 1; });
            const seeded = enriched.map((t) => ({ ...t, seed: seedMap[t.id] || null }));
            seeded.sort((a, b) => {
                if (a.seed && b.seed) return a.seed - b.seed;
                if (a.seed) return -1;
                if (b.seed) return 1;
                return b.totalPoints - a.totalPoints;
            });
            result[cls.name] = seeded;
        });
        return result;
    }, [teamsByDivision, divisions, getPlayerPoints]);

    const isMensDivision = useCallback((div) => {
        const gender = String(div?.gender || '').toLowerCase();
        if (gender === 'male' || gender === 'men') return true;
        if (gender === 'female' || gender === 'women') return false;
        const name = (div?.name || '').toLowerCase();
        if (name.includes('women') || name.includes('ladies') || name.includes('girls')) return false;
        if (name.includes("men") || name.includes('boys')) return true;
        return true;
    }, []);

    const sortedDivisions = useMemo(() => (
        [...divisions].sort((a, b) => {
            const aMen = isMensDivision(a) ? 0 : 1;
            const bMen = isMensDivision(b) ? 0 : 1;
            if (aMen !== bMen) return aMen - bMen;
            return (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.name || '').localeCompare(b.name || '');
        })
    ), [divisions, isMensDivision]);

    const teamMatchesPlayerSearch = useCallback((team, query) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        const parts = team.players.flatMap((p) => [
            p.full_name, p.email, p.partner_name, p.partner_email, p.division,
        ]).filter(Boolean);
        return parts.some((v) => String(v).toLowerCase().includes(q));
    }, []);

    const dashboardStats = useMemo(() => {
        let expected = 0;
        let collected = 0;
        const uniqueEmails = new Set();
        const licenseCounts = { full: 0, temp: 0, none: 0 };
        const licenseCounted = new Set();

        activeRegistrations.forEach((r) => {
            const isComped = registrationIsCompedEntry(r, payments);
            const paid = registrationCountsAsPaid(r, refundByReg, payments);
            if (isComped) {
                // Comped entries are excluded from expected/collected
            } else if (paid) {
                const actualPaid = getRegistrationEntryFeePaid(
                    findPaymentForRegistration(successPaymentsOnly(payments), r),
                    r,
                    divFee(r.division),
                );
                expected += actualPaid;
                collected += actualPaid;
            } else {
                expected += divFee(r.division);
            }

            const email = (r.email || '').toLowerCase().trim();
            if (email) uniqueEmails.add(email);

            if (email && !licenseCounted.has(email)) {
                licenseCounted.add(email);
                const player = playersByEmail.get(email);
                const category = resolveRegistrationLicenseCategory(email, event?.id, player, payments);
                if (category === 'full') licenseCounts.full++;
                else if (category === 'temp') licenseCounts.temp++;
                else licenseCounts.none++;
            }
        });

        const paymentById = new Map((payments || []).map((p) => [p.id, p]));
        const totalRefunded = refunds
            .filter((r) => isEntryFeeRefund(r, paymentById.get(r.payment_id)))
            .reduce((sum, r) => sum + Number(r.amount || 0), 0);

        return {
            expected,
            collected,
            outstanding: Math.max(0, expected - collected),
            totalRefunded,
            uniquePlayers: uniqueEmails.size,
            licenses: licenseCounts,
            paidCount: stats.paid,
            totalEntries: stats.total,
        };
    }, [activeRegistrations, divFee, playersByEmail, payments, event?.id, refundByReg, refunds, stats.paid, stats.total]);

    const overviewStats = useMemo(() => {
        let paid4M = 0;
        let paidClub = 0;
        let collectedManual = 0;
        let pendingCount = 0;
        let pendingAmount = 0;
        let compedEntries = 0;
        let grossCollected4M = 0;
        let licenseRevenue4M = 0;
        const unique = new Set(activeRegistrations.map((r) => r.email)).size;
        let fullLicenses = 0;
        let tempLicenses = 0;
        let noLicenses = 0;

        activeRegistrations.forEach((r) => {
            if (!registrationCountsAsPaid(r, refundByReg, payments)) return;

            const license = formatLicenseForExport(r);
            if (license.includes('Full')) fullLicenses++;
            else if (license.includes('Temporary')) tempLicenses++;
            else noLicenses++;

            if (registrationIsCompedEntry(r, payments)) {
                compedEntries++;
                return;
            }

            const method = formatPaymentMethodForExport(r);
            if (method === 'Paystack') {
                paid4M++;
            } else {
                paidClub++;
            }
        });

        // Settlement must be driven from successful entry-payment records, not
        // only registrations still marked paid. A refunded registration is no
        // longer "paid", but its original collection remains part of gross
        // event income and must be offset by its refund below.
        let grossEntryFees = 0;
        payments.forEach((p) => {
            if (
                p.status !== 'success'
                || String(p.payment_type || '').toLowerCase() !== 'event_entry_fee'
                || isLicensePaymentRow(p)
                || isCompedEntryPayment(p)
            ) return;
            const amount = Math.max(0, Number(p.amount || 0));
            if (amount <= 0) return;
            grossEntryFees += amount;
            if (OFF_PLATFORM_PAYMENT_METHODS.has(String(p.payment_method || '').toLowerCase())) {
                collectedManual += amount;
            } else {
                grossCollected4M += amount;
            }
        });

        payments.forEach((p) => {
            if (p.status !== 'success') return;
            if (OFF_PLATFORM_PAYMENT_METHODS.has(String(p.payment_method || '').toLowerCase())) return;
            if (isLicensePaymentRow(p)) {
                licenseRevenue4M += Number(p.amount || 0);
            }
        });

        activeRegistrations.forEach((r) => {
            if (registrationIsCompedEntry(r, payments)) return;
            if (registrationCountsAsPaid(r, refundByReg, payments)) return;
            const ps = String(r.payment_status || '').toLowerCase();
            if (ps === 'refunded' || hasBlockingProcessedRefund(r, refundByReg, payments)) return;
            pendingCount += 1;
            pendingAmount += divFee(r.division);
        });

        const withdrawnCount = registrations.filter((r) => isWithdrawnRegistration(r)).length;

        // Entry-fee refunds only — temp/full license refunds stay with 4M and must not reduce organiser due.
        const paymentById = new Map((payments || []).map((p) => [p.id, p]));
        const entryFeesRefunded = refunds
            .filter((r) => isEntryFeeRefund(r, paymentById.get(r.payment_id)))
            .reduce((sum, r) => sum + Number(r.amount || 0), 0);
        const licenseRefunds = refunds
            .filter((r) => isLicenseRefund(r, paymentById.get(r.payment_id)) && r.status !== 'failed')
            .reduce((sum, r) => sum + Number(r.amount || 0), 0);

        const entryFeeBalance = Math.max(0, grossEntryFees - entryFeesRefunded);
        const totalAmountBilled = grossEntryFees + pendingAmount;

        // Build the billed amount from the registration-level fee snapshots so
        // the organiser can see exactly which entry-price tiers make up the
        // total. Withdrawn entries count only when a successful payment exists;
        // an unpaid withdrawal was never billed.
        const billedTiers = new Map();
        const successPays = successPaymentsOnly(payments);
        registrations.forEach((r) => {
            if (registrationIsCompedEntry(r, payments)) return;
            const payment = findStrictPaystackEntryPayment(successPays, r)
                || findPaymentForRegistration(successPays, r);
            if (!payment && isWithdrawnRegistration(r)) return;
            const amount = payment
                ? getRegistrationEntryFeePaid(payment, r, divFee(r.division))
                : divFee(r.division);
            if (amount <= 0) return;
            const rate = Math.round(Number(amount) * 100) / 100;
            const current = billedTiers.get(rate) || { rate, count: 0, total: 0 };
            current.count += 1;
            current.total += rate;
            billedTiers.set(rate, current);
        });
        const billedTierBreakdown = [...billedTiers.values()].sort((a, b) => a.rate - b.rate);
        // The organiser settlement is based on total event income: Paystack and
        // manual/EFT entry collections, before refunds. Refunds are deducted as
        // their own line so gross cash movement remains auditable.
        const commission = grossEntryFees * PLATFORM_COMMISSION_RATE;
        const interimPaid = (interimPayments || []).reduce((sum, p) => sum + Math.max(0, Number(p.amount || 0)), 0);
        // Manual / EFT collections are paid to 4M alongside Paystack receipts,
        // so they remain part of the organiser settlement rather than a direct
        // payment to deduct from the balance due.
        const dueBeforeInterim = Math.max(0, entryFeeBalance - commission);
        const dueToOrg = Math.max(0, dueBeforeInterim - interimPaid);

        // Early bird vs normal sign-ups — prefer paid amount (survives after early bird ends),
        // then registration time vs deadline. Infer early-bird fee from payment tiers if unset.
        const earlyBirdEnds = parseEventDate(earlyBirdMeta?.early_bird_ends_at);
        const configuredEbFee = (earlyBirdMeta?.early_bird_fee != null && earlyBirdMeta?.early_bird_fee !== '')
            ? Number(earlyBirdMeta.early_bird_fee)
            : null;
        const paidFeeAmounts = [];
        activeRegistrations.forEach((r) => {
            const payment = findStrictPaystackEntryPayment(successPays, r);
            if (!payment) return;
            const fee = getRegistrationEntryFeePaid(payment, r, 0);
            if (fee > 0) paidFeeAmounts.push(Math.round(Number(fee) * 100) / 100);
        });
        const uniquePaidFees = [...new Set(paidFeeAmounts)].sort((a, b) => a - b);
        const inferredEbFee = uniquePaidFees.length >= 2 ? uniquePaidFees[0] : null;
        const earlyBirdFee = Number.isFinite(configuredEbFee) ? configuredEbFee : inferredEbFee;
        const hasEarlyBirdPricing = earlyBirdFee != null
            && Number.isFinite(Number(earlyBirdFee))
            && (Boolean(earlyBirdEnds) || uniquePaidFees.length >= 2 || configuredEbFee != null);

        let earlyBirdSignups = 0;
        let normalSignups = 0;
        activeRegistrations.forEach((r) => {
            const payment = findStrictPaystackEntryPayment(successPays, r);
            const paid = payment ? getRegistrationEntryFeePaid(payment, r, 0) : null;

            let isEarly = false;
            if (hasEarlyBirdPricing && paid != null && paid > 0 && earlyBirdFee != null) {
                isEarly = Math.abs(Number(paid) - Number(earlyBirdFee)) < 0.51;
            } else if (hasEarlyBirdPricing && earlyBirdEnds) {
                const created = parseEventDate(r.created_at) || parseEventDate(r.registered_at);
                isEarly = Boolean(created && created.getTime() <= earlyBirdEnds.getTime());
            }

            if (isEarly) earlyBirdSignups += 1;
            else normalSignups += 1;
        });

        return {
            unique,
            paid4M,
            paidClub,
            collectedManual,
            pendingCount,
            pendingAmount,
            withdrawnCount,
            compedEntries,
            collected4M: grossCollected4M,
            totalAmountBilled,
            billedTierBreakdown,
            entryFeesRefunded,
            licenseRefunds,
            grossEntryFees,
            entryFeeBalance,
            licenseRevenue4M,
            commission,
            interimPaid,
            dueBeforeInterim,
            dueToOrg,
            fullLicenses,
            tempLicenses,
            noLicenses,
            hasEarlyBirdPricing,
            earlyBirdSignups,
            normalSignups,
        };
    }, [activeRegistrations, payments, divFee, formatPaymentMethodForExport, formatLicenseForExport, refundByReg, refunds, interimPayments, earlyBirdMeta, registrations]);

    const incomeStatementRows = useMemo(() => {
        const rows = [];
        const usedPaymentIds = new Set();
        const teamLabel = (r) => [r.full_name, r.partner_name].filter(Boolean).join(' / ') || r.email || '—';
        const successPays = successPaymentsOnly(payments);

        activeRegistrations.forEach((r) => {
            const player = teamLabel(r);
            const email = r.email || '';
            const division = r.division || 'Entry';
            const status = resolveIncomeStatementPaymentStatus(r, refundByReg, payments);

            if (registrationIsCompedEntry(r, payments)) {
                const payment = findPaymentForReg(r);
                if (payment?.id) usedPaymentIds.add(payment.id);
                rows.push({
                    id: `comp-${r.id}`,
                    date: payment?.created_at || r.paid_at || r.created_at,
                    description: `${division} — Comped Entry`,
                    category: 'Comped entry',
                    bucket: 'Informational',
                    type: 'comped',
                    player,
                    email,
                    division,
                    amount: 0,
                    status: 'comped',
                    method: 'Comped',
                    reference: payment?.reference || '',
                    note: payment?.metadata?.note || payment?.metadata?.payment_note || '',
                });
                return;
            }

            const paystackPay = findStrictPaystackEntryPayment(successPays, r);
            if (paystackPay) {
                usedPaymentIds.add(paystackPay.id);
                const fee = getRegistrationEntryFeePaid(paystackPay, r, 0);
                if (fee > 0) {
                    rows.push({
                        id: `pay-${r.id}`,
                        date: paystackPay.created_at || r.paid_at || r.created_at,
                        description: `${division} — Entry Fee`,
                        category: 'Entry payment',
                        bucket: '4M Paystack',
                        type: 'payment',
                        player,
                        email,
                        division,
                        amount: fee,
                        status,
                        method: 'Paystack',
                        reference: paystackPay.reference || '',
                        note: '',
                    });
                }
            } else if (registrationCountsAsPaid(r, refundByReg, payments)) {
                const payment = findPaymentForReg(r);
                if (payment?.id) usedPaymentIds.add(payment.id);
                const fee = getRegistrationEntryFeePaid(payment, r, divFee(r.division));
                rows.push({
                    id: `manual-${r.id}`,
                    date: payment?.created_at || r.paid_at || r.created_at,
                    description: `${division} — Entry Fee (Manual)`,
                    category: 'Entry payment',
                    bucket: 'Manual / club',
                    type: 'payment',
                    player,
                    email,
                    division,
                    amount: fee,
                    status,
                    method: formatPaymentMethodForExport(r) || 'Manual',
                    reference: payment?.reference || '',
                    note: payment?.metadata?.note || payment?.metadata?.payment_note || '',
                });
            } else if (status !== 'refunded' && status !== 'withdrawn') {
                rows.push({
                    id: `pending-${r.id}`,
                    date: r.created_at,
                    description: `${division} — Outstanding entry fee`,
                    category: 'Pending / unpaid',
                    bucket: 'Outstanding',
                    type: 'pending',
                    player,
                    email,
                    division,
                    amount: divFee(r.division),
                    status: 'pending',
                    method: '—',
                    reference: '',
                    note: '',
                });
            }
        });

        const paymentById = new Map((payments || []).map((p) => [p.id, p]));
        refunds.forEach((rf) => {
            const linkedPayment = paymentById.get(rf.payment_id);
            const isLicense = isLicenseRefund(rf, linkedPayment);
            if (!isLicense && !isEntryFeeRefund(rf, linkedPayment)) return;
            const reg = registrations.find((r) => r.id === rf.event_registration_id);
            rows.push({
                id: `refund-${rf.id}`,
                date: rf.processed_at || rf.created_at,
                description: isLicense
                    ? 'License Refund'
                    : (reg?.division ? `${reg.division} — Entry Fee Refund` : 'Entry Fee Refund'),
                category: isLicense ? 'License refund' : 'Entry refund',
                bucket: isLicense ? '4M retained' : '4M Paystack',
                type: 'refund',
                player: reg
                    ? ([reg.full_name, reg.partner_name].filter(Boolean).join(' / ') || reg.email || '—')
                    : '—',
                email: reg?.email || '',
                division: reg?.division || '',
                amount: -Math.abs(Number(rf.amount || 0)),
                status: rf.status === 'processed' ? 'processed' : (rf.status || 'pending'),
                method: isLicense ? 'License reversal' : 'Card reversal',
                reference: rf.paystack_refund_id || rf.provider_refund_id || '',
                note: rf.failure_reason || '',
            });
        });

        (payments || []).forEach((p) => {
            if (!isLicensePaymentRow(p)) return;
            usedPaymentIds.add(p.id);
            const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
            rows.push({
                id: `lic-${p.id}`,
                date: p.created_at,
                description: `${p.payment_type || 'License'} — ${p.status === 'success' ? 'License fee' : `License (${p.status})`}`,
                category: 'License payment',
                bucket: '4M retained',
                type: 'license',
                player: meta.paid_by_name || meta.email || p.player_email || '—',
                email: meta.email || p.player_email || '',
                division: '',
                amount: Number(p.amount || 0),
                status: p.status || '',
                method: labelPaymentMethod(p.payment_method) || p.payment_method || 'Paystack',
                reference: p.reference || '',
                note: meta.note || meta.payment_note || '',
            });
        });

        (payments || []).forEach((p) => {
            if (usedPaymentIds.has(p.id)) return;
            if (isLicensePaymentRow(p)) return;
            const status = String(p.status || '').toLowerCase();
            if (status === 'abandoned') return;
            const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
            const isPendingCheckout = status === 'processing' || status === 'pending';
            rows.push({
                id: `other-${p.id}`,
                date: p.created_at,
                description: isPendingCheckout
                    ? `${p.payment_type || 'Payment'} — Checkout not completed`
                    : `${p.payment_type || 'Payment'} — ${p.status}`,
                category: isPendingCheckout ? 'Pending checkout' : 'Other payment',
                bucket: isPendingCheckout ? 'Outstanding' : 'Informational',
                type: isPendingCheckout ? 'pending' : 'other',
                player: meta.paid_by_name || meta.email || '—',
                email: meta.email || '',
                division: meta.division || '',
                amount: Number(p.amount || 0),
                status: p.status || '',
                method: labelPaymentMethod(p.payment_method) || p.payment_method || '',
                reference: p.reference || '',
                note: meta.note || meta.payment_note || '',
            });
        });

        if (overviewStats.commission > 0) {
            rows.push({
                id: 'platform-fee',
                date: null,
                description: `Platform Fee (${Math.round(PLATFORM_COMMISSION_RATE * 100)}% of gross entry income)`,
                category: 'Platform / commission fee',
                bucket: '4M retained',
                type: 'fee',
                player: '—',
                email: '',
                division: '',
                amount: -overviewStats.commission,
                status: 'processed',
                method: '—',
                reference: '',
                note: '5% of all gross entry fees collected, before refunds',
            });
        }

        (interimPayments || []).forEach((p) => {
            const amount = Math.max(0, Number(p.amount || 0));
            if (amount <= 0) return;
            rows.push({
                id: `interim-${p.id}`,
                date: p.paid_at || p.created_at || null,
                description: p.note
                    ? `Interim payment to organiser — ${p.note}`
                    : 'Interim payment to organiser',
                category: 'Interim payout',
                bucket: 'Organiser payout',
                type: 'interim',
                player: event?.organiser_name || 'Organiser',
                email: event?.organiser_email || '',
                division: '',
                amount: -amount,
                status: 'processed',
                method: 'Manual',
                reference: '',
                note: p.note || '',
            });
        });

        rows.sort((a, b) => {
            if (!a.date && !b.date) return 0;
            if (!a.date) return 1;
            if (!b.date) return -1;
            return new Date(b.date) - new Date(a.date);
        });

        return rows;
    }, [activeRegistrations, payments, findPaymentForReg, refundByReg, refunds, registrations, overviewStats.commission, interimPayments, event?.organiser_name, event?.organiser_email, divFee, formatPaymentMethodForExport]);

    const filteredIncomeStatementRows = useMemo(() => {
        const q = statementSearch.trim().toLowerCase();
        if (!q) return incomeStatementRows;
        return incomeStatementRows.filter((row) => {
            const haystack = [
                row.description,
                row.type,
                row.category,
                row.bucket,
                row.player,
                row.email,
                row.status,
                row.method,
                row.reference,
                row.note,
                row.amount != null ? String(row.amount) : '',
                row.date
                    ? new Date(row.date).toLocaleString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                    })
                    : '',
            ].join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }, [incomeStatementRows, statementSearch]);

    const payoutRequestRules = useMemo(() => {
        const remainingDue = Math.max(0, Number(overviewStats.dueToOrg || 0));
        const totalDue = Math.max(0, Number(overviewStats.dueBeforeInterim || 0));
        const interimPaid = Math.max(0, Number(overviewStats.interimPaid || 0));
        const firstRequestCap = Math.floor(totalDue * PAYOUT_REQUEST_MAX_RATE);
        const endRaw = event?.end_date || event?.start_date || null;
        let eventEnded = false;
        if (endRaw) {
            const end = new Date(endRaw);
            if (!Number.isNaN(end.getTime())) {
                // Treat the event as finished after the end calendar day.
                end.setHours(23, 59, 59, 999);
                eventEnded = Date.now() > end.getTime();
            }
        }

        const hasFirstPartial = interimPaid > 0;
        let maxRequestable = 0;
        let phase = 'first';
        let helperText = '';
        let blockedReason = '';

        if (remainingDue <= 0) {
            blockedReason = 'Nothing due to organiser yet';
        } else if (!eventEnded) {
            phase = 'first';
            if (hasFirstPartial) {
                blockedReason = 'First partial payment already recorded. The remaining balance can be requested after the event ends.';
            } else {
                maxRequestable = Math.min(remainingDue, firstRequestCap);
                helperText = `First payout request is limited to 50% of the amount due (${fmtR(maxRequestable)}). The remaining balance can be requested after the event.`;
            }
        } else {
            phase = 'final';
            maxRequestable = remainingDue;
            helperText = hasFirstPartial
                ? `Event has ended. You can request the remaining balance of ${fmtR(remainingDue)}.`
                : `Event has ended. You can request the full amount due of ${fmtR(remainingDue)}.`;
        }

        return {
            remainingDue,
            totalDue,
            interimPaid,
            firstRequestCap,
            eventEnded,
            hasFirstPartial,
            maxRequestable,
            phase,
            helperText,
            blockedReason,
            canRequest: maxRequestable > 0 && !blockedReason,
        };
    }, [
        overviewStats.dueToOrg,
        overviewStats.dueBeforeInterim,
        overviewStats.interimPaid,
        event?.end_date,
        event?.start_date,
    ]);

    const maxPayoutRequest = payoutRequestRules.maxRequestable;

    const openPayoutRequestModal = () => {
        if (requestingPayout) return;
        if (overviewStats.dueToOrg <= 0) {
            toast.error('Nothing due to organiser yet');
            return;
        }
        if (!payoutRequestRules.canRequest) {
            toast.error(payoutRequestRules.blockedReason || 'Payout cannot be requested yet');
            return;
        }
        setPayoutRequestAmount(String(maxPayoutRequest));
        setPayoutModalOpen(true);
    };

    const closePayoutRequestModal = () => {
        if (requestingPayout) return;
        setPayoutModalOpen(false);
        setPayoutRequestAmount('');
    };

    const handleRequestPayout = async () => {
        if (requestingPayout) return;
        if (overviewStats.dueToOrg <= 0) {
            toast.error('Nothing due to organiser yet');
            return;
        }
        if (!payoutRequestRules.canRequest) {
            toast.error(payoutRequestRules.blockedReason || 'Payout cannot be requested yet');
            return;
        }
        const amount = Number(String(payoutRequestAmount).replace(/[^0-9.]/g, ''));
        if (!Number.isFinite(amount) || amount <= 0) {
            toast.error('Enter how much you want to request');
            return;
        }
        if (amount > maxPayoutRequest) {
            toast.error(
                payoutRequestRules.phase === 'first'
                    ? `First payout request is limited to 50% (${fmtR(maxPayoutRequest)})`
                    : `You can request up to the remaining balance (${fmtR(maxPayoutRequest)})`,
            );
            return;
        }
        if (amount > overviewStats.dueToOrg) {
            toast.error(`Cannot request more than the amount due (${fmtR(overviewStats.dueToOrg)})`);
            return;
        }
        setRequestingPayout(true);
        try {
            const result = await sendEmail(PAYOUT_ADMIN_EMAIL, 'organiser_payout_request', {
                eventName: event?.event_name || 'Tournament',
                eventId: event?.id,
                organiserName: event?.organiser_name || 'Organiser',
                organiserEmail: event?.organiser_email || '',
                totalBilled: fmtR(overviewStats.totalAmountBilled),
                outstanding: fmtR(overviewStats.pendingAmount),
                grossEntryFees: fmtR(overviewStats.grossEntryFees),
                paystackCollected: fmtR(overviewStats.collected4M),
                manualCollected: fmtR(overviewStats.collectedManual),
                refunded: fmtR(overviewStats.entryFeesRefunded),
                finalEntrySales: fmtR(overviewStats.entryFeeBalance),
                commission: fmtR(overviewStats.commission),
                interimPaid: fmtR(overviewStats.interimPaid),
                interimPaidAmount: overviewStats.interimPaid,
                dueToOrganiser: fmtR(overviewStats.dueToOrg),
                amountRequested: fmtR(amount),
                amountRequestedValue: amount,
                maxRequestable: fmtR(maxPayoutRequest),
                requestPhase: payoutRequestRules.phase === 'first' ? 'First request (max 50%)' : 'Final balance (after event)',
                licenseRevenue: fmtR(overviewStats.licenseRevenue4M),
                paidEntries: overviewStats.paid4M,
                requestedAt: new Date().toLocaleString('en-ZA', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                }),
            });
            if (!result.success) throw new Error(result.error || 'Email failed');
            toast.success(`Payout request of ${fmtR(amount)} sent to 4M admin`);
            setPayoutModalOpen(false);
            setPayoutRequestAmount('');
            try {
                await logEventActivity({
                    eventId: event.id,
                    action: 'payout_requested',
                    category: 'FINANCE',
                    summary: `Payout requested: ${fmtR(amount)} (${payoutRequestRules.phase === 'first' ? 'first request ≤50%' : 'final balance'}; ${fmtR(overviewStats.dueToOrg)} currently due)`,
                    details: {
                        amountRequested: amount,
                        maxRequestable: maxPayoutRequest,
                        requestPhase: payoutRequestRules.phase,
                        dueToOrganiser: overviewStats.dueToOrg,
                        collected: overviewStats.collected4M,
                        refunded: overviewStats.entryFeesRefunded,
                        commission: overviewStats.commission,
                        interimPaid: overviewStats.interimPaid,
                    },
                });
            } catch (_) { /* non-blocking */ }
        } catch (err) {
            console.error('Payout request failed:', err);
            toast.error(err.message || 'Failed to send payout request');
        } finally {
            setRequestingPayout(false);
        }
    };

    const exportFinanceExcel = async (reportType = 'full') => {
        const normalizedReportType = reportType === 'organiser' ? 'organiser' : 'full';
        if (normalizedReportType === 'full' && !isSuperAdmin) {
            toast.error('Only Super Admins can export the full event report.');
            return;
        }
        setExportMenuOpen(false);
        setExportingFinance(true);
        try {
            const eventDate = event?.start_date
                ? new Date(event.start_date).toLocaleDateString('en-ZA', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })
                : '';
            const billedCompositionRows = overviewStats.billedTierBreakdown.map((tier, index) => {
                const label = index === 0 && overviewStats.billedTierBreakdown.length > 1
                    ? 'Early bird'
                    : 'Regular';
                return {
                    section: 'Billed composition',
                    label: `${label} (${tier.count} × ${fmtR(tier.rate)})`,
                    value: tier.total,
                    money: true,
                };
            });

            const summary = [
                { section: 'Entries', label: 'Total entries', value: dashboardStats.totalEntries },
                { section: 'Entries', label: 'Unique players', value: dashboardStats.uniquePlayers },
                { section: 'Entries', label: 'Paid', value: dashboardStats.paidCount },
                { section: 'Entries', label: 'Pending / unpaid', value: overviewStats.pendingCount, note: fmtR(overviewStats.pendingAmount) },
                { section: 'Entries', label: 'Comped (free)', value: overviewStats.compedEntries },
                { section: 'Entries', label: 'Withdrawn', value: overviewStats.withdrawnCount },
                { section: 'Entries', label: 'Early bird sign-ups', value: overviewStats.earlyBirdSignups },
                { section: 'Entries', label: 'Normal sign-ups', value: overviewStats.normalSignups },

                { section: 'Billed vs collected (all channels)', label: 'Total amount billed', value: overviewStats.totalAmountBilled, money: true, note: 'Gross entry collections plus outstanding entry fees' },
                { section: 'Billed vs collected (all channels)', label: 'Gross entry fees collected', value: overviewStats.grossEntryFees, money: true, note: 'All successful Paystack and manual/EFT entry payments, including later refunds' },
                { section: 'Billed vs collected (all channels)', label: '  of which Paystack', value: overviewStats.collected4M, money: true },
                { section: 'Billed vs collected (all channels)', label: '  of which Manual / EFT', value: overviewStats.collectedManual, money: true },
                { section: 'Billed vs collected (all channels)', label: 'Final entry sales', value: overviewStats.entryFeeBalance, money: true, note: 'Gross entry collections less entry refunds' },
                { section: 'Billed vs collected (all channels)', label: 'Outstanding', value: dashboardStats.outstanding, money: true },

                ...billedCompositionRows,

                { section: 'Refunds', label: 'Entry fee refunds', value: overviewStats.entryFeesRefunded, money: true },
                { section: 'Refunds', label: 'License refunds (stay with 4M)', value: overviewStats.licenseRefunds, money: true },

                { section: 'Organiser settlement (all entry channels)', label: 'Total amount billed', value: overviewStats.totalAmountBilled, money: true },
                { section: 'Organiser settlement (all entry channels)', label: 'Minus entry refunds', value: -overviewStats.entryFeesRefunded, money: true },
                { section: 'Organiser settlement (all entry channels)', label: 'Minus outstanding entry fees', value: -overviewStats.pendingAmount, money: true },
                { section: 'Organiser settlement (all entry channels)', label: 'Final entry sales', value: overviewStats.entryFeeBalance, money: true, note: 'Billed less refunds and outstanding entry fees' },
                { section: 'Organiser settlement (all entry channels)', label: `Minus platform fee (${Math.round(PLATFORM_COMMISSION_RATE * 100)}% of gross collected)`, value: -overviewStats.commission, money: true, note: 'Charged on gross entry collections before refunds' },
                { section: 'Organiser settlement (all entry channels)', label: 'Minus interim paid', value: -overviewStats.interimPaid, money: true },
                { section: 'Organiser settlement (all entry channels)', label: 'Net due to organiser', value: overviewStats.dueToOrg, money: true },

                { section: 'Retained by 4M', label: 'License revenue', value: overviewStats.licenseRevenue4M, money: true },
                { section: 'Retained by 4M', label: 'Platform / commission fees', value: overviewStats.commission, money: true },
            ];

            const organiserSummary = [
                { section: 'Entries', label: 'Total entries', value: dashboardStats.totalEntries },
                { section: 'Entries', label: 'Unique players', value: dashboardStats.uniquePlayers },
                { section: 'Entries', label: 'Paid', value: dashboardStats.paidCount },
                { section: 'Entries', label: 'Pending / unpaid', value: overviewStats.pendingCount, note: fmtR(overviewStats.pendingAmount) },
                { section: 'Entries', label: 'Comped (free)', value: overviewStats.compedEntries },
                { section: 'Entries', label: 'Withdrawn', value: overviewStats.withdrawnCount },

                ...billedCompositionRows,

                { section: 'Organiser settlement', label: 'Total amount billed', value: overviewStats.totalAmountBilled, money: true, note: 'Gross entry collections plus outstanding entry fees' },
                { section: 'Organiser settlement', label: 'Minus entry refunds', value: -overviewStats.entryFeesRefunded, money: true },
                { section: 'Organiser settlement', label: 'Minus outstanding entry fees', value: -overviewStats.pendingAmount, money: true },
                { section: 'Organiser settlement', label: 'Final entry sales', value: overviewStats.entryFeeBalance, money: true },
                { section: 'Organiser settlement', label: `Minus platform fee (${Math.round(PLATFORM_COMMISSION_RATE * 100)}% of gross collected)`, value: -overviewStats.commission, money: true },
                { section: 'Organiser settlement', label: 'Minus interim paid', value: -overviewStats.interimPaid, money: true },
                { section: 'Organiser settlement', label: 'Net due to organiser', value: overviewStats.dueToOrg, money: true },
            ];

            const registrationRows = registrations.map((r) => {
                const details = getPaymentDetails(r);
                let channel = '';
                if (details) {
                    if (details.isPartnerPaid) channel = `Partner (${details.payerName || 'partner'})`;
                    else if (details.isCompedChannel) channel = 'Comped';
                    else if (details.isManualChannel) channel = `Manual (${labelPaymentMethod(details.method) || 'Admin'})`;
                    else channel = labelPaymentMethod(details.method) || 'Paystack';
                }
                const paystackPay = findStrictPaystackEntryPayment(successPaymentsOnly(payments), r);
                const payment = paystackPay || findPaymentForReg(r);
                const isComped = registrationIsCompedEntry(r, payments);
                const paid = registrationCountsAsPaid(r, refundByReg, payments);
                let entryAmount = 0;
                if (isComped) entryAmount = 0;
                else if (paystackPay) entryAmount = getRegistrationEntryFeePaid(paystackPay, r, 0);
                else if (paid) entryAmount = getRegistrationEntryFeePaid(payment, r, divFee(r.division));
                else entryAmount = divFee(r.division);

                return {
                    name: r.full_name,
                    email: r.email,
                    phone: r.phone || '',
                    division: r.division,
                    partner: r.partner_name || '',
                    partnerEmail: r.partner_email || '',
                    tshirtSize: r.tshirt_size || '',
                    tshirtSponsorName: r.tshirt_sponsor_name || '',
                    tshirtLogoUrl: r.tshirt_logo_url || '',
                    license: formatLicenseForExport(r),
                    paymentStatus: formatPaymentStatusForExport(r),
                    channel,
                    entryAmount,
                    comped: isComped,
                    registrationStatus: r.status || '',
                    registeredAt: r.created_at,
                    note: details?.note || '',
                };
            });

            await downloadEventFinanceWorkbook({
                eventName: event?.event_name || 'Event',
                eventDate,
                summary: normalizedReportType === 'organiser' ? organiserSummary : summary,
                lineItems: incomeStatementRows,
                registrations: registrationRows,
                payments: normalizedReportType === 'full'
                    ? (payments || []).map((p) => ({
                        ...p,
                        metadata: normalizePaymentMetadata(p.metadata),
                    }))
                    : [],
                refunds: normalizedReportType === 'full'
                    ? refunds.map((rf) => {
                        const linked = (payments || []).find((p) => p.id === rf.payment_id);
                        return {
                            ...rf,
                            cover: isLicenseRefund(rf, linked) ? 'license' : 'entry',
                        };
                    })
                    : [],
                reportType: normalizedReportType,
            });
            toast.success(normalizedReportType === 'organiser'
                ? 'Organiser consolidated report downloaded'
                : 'Full event report downloaded');
        } catch (err) {
            console.error('Finance Excel export failed:', err);
            toast.error(err.message || 'Failed to generate Excel export');
        } finally {
            setExportingFinance(false);
        }
    };

    const ExportReportMenu = ({ compact = false }) => {
        const buttonClass = compact
            ? 'bg-white/5 text-white border border-white/10 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-white/10 shrink-0 disabled:opacity-40'
            : 'inline-flex items-center justify-center gap-2 bg-white/5 text-white border border-white/10 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-white/10 disabled:opacity-40';
        return (
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setExportMenuOpen((open) => !open)}
                    disabled={exportingFinance}
                    className={buttonClass}
                    aria-haspopup="menu"
                    aria-expanded={exportMenuOpen}
                >
                    {exportingFinance ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                    Export Excel
                    <ChevronDown size={15} className={exportMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                </button>
                {exportMenuOpen && (
                    <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#151515] p-1.5 shadow-2xl">
                        {isSuperAdmin && (
                            <button
                                type="button"
                                role="menuitem"
                                onClick={() => exportFinanceExcel('full')}
                                className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-white/10 transition-colors"
                            >
                                <span className="block text-sm font-bold text-white">Full Event Report</span>
                                <span className="block text-[10px] text-gray-400 mt-0.5">All finance sheets, payment ledger and refunds</span>
                            </button>
                        )}
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => exportFinanceExcel('organiser')}
                            className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-white/10 transition-colors"
                        >
                            <span className="block text-sm font-bold text-white">Organisers Consolidated Event Report</span>
                            <span className="block text-[10px] text-gray-400 mt-0.5">Summary and registrations only</span>
                        </button>
                    </div>
                )}
            </div>
        );
    };

    if (!isActive) return null;

    const handleClose = onBack || onClose;

    const panelContent = (
        <>
                    {/* Header */}
                    <div className={`${isInline ? 'bg-[#1a1a1a]/50 backdrop-blur-md rounded-3xl border border-white/10' : ''} px-6 pt-4 ${isInline ? 'pb-0' : 'border-b border-white/10'}`}>
                        {isInline && onBack && (
                            <button
                                onClick={onBack}
                                className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white flex items-center gap-2 transition-colors mb-4"
                            >
                                {backLabel}
                            </button>
                        )}
                        {isInline ? (
                            <div className="flex flex-col gap-2 mb-4">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 min-w-0">
                                        <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-white uppercase tracking-tighter italic leading-none truncate">
                                            {event.event_name}
                                        </h2>
                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-padel-green text-black text-[9px] sm:text-[10px] font-black uppercase rounded-lg shadow-lg shadow-padel-green/20 w-fit shrink-0">
                                            <Trophy size={12} /> Selected Tournament
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {onEditEvent && (
                                            <button
                                                type="button"
                                                onClick={() => onEditEvent(event)}
                                                className="bg-white/5 text-white border border-white/10 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:border-padel-green/40 hover:text-padel-green shrink-0 transition-colors"
                                            >
                                                <Pencil size={16} /> Edit event details
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={openAddPlayerModal}
                                            className="bg-padel-green text-black px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:brightness-110 shrink-0"
                                        >
                                            <UserPlus size={16} /> Add Player
                                        </button>
                                        {linkedRankedinId && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={handleSyncToRankedin}
                                                    disabled={syncingRankedin}
                                                    className="bg-white/5 text-white border border-white/10 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-white/10 disabled:opacity-40 shrink-0"
                                                >
                                                    {syncingRankedin ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                                    Sync to RankedIn
                                                </button>
                                                {linkedRankedinUrl && (
                                                    <a
                                                        href={linkedRankedinUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="p-2 bg-white/5 border border-white/10 rounded-lg text-white hover:text-padel-green hover:border-padel-green/40 transition-colors"
                                                        title="Open on RankedIn"
                                                    >
                                                        <ExternalLink size={16} />
                                                    </a>
                                                )}
                                            </>
                                        )}
                                        <ExportReportMenu compact />
                                    </div>
                                </div>
                                {event.start_date && (
                                    <p className="text-gray-500 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-2">
                                        <Calendar size={12} className="shrink-0" />
                                        {new Date(event.start_date).toLocaleDateString(undefined, {
                                            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                                        })}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-start justify-between mb-4">
                                <div>
                                    <h2 className="text-xl font-bold text-white">Event Manager</h2>
                                    <p className="text-xs text-gray-400 truncate max-w-[60vw]">{event.event_name}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {onEditEvent && (
                                        <button
                                            type="button"
                                            onClick={() => onEditEvent(event)}
                                            className="bg-white/5 text-white border border-white/10 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:border-padel-green/40 hover:text-padel-green transition-colors"
                                        >
                                            <Pencil size={16} /> Edit details
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={openAddPlayerModal}
                                        className="bg-padel-green text-black px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:brightness-110"
                                    >
                                        <UserPlus size={16} /> Add
                                    </button>
                                    {linkedRankedinId && (
                                        <button
                                            type="button"
                                            onClick={handleSyncToRankedin}
                                            disabled={syncingRankedin}
                                            className="bg-padel-green text-black px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:brightness-110 disabled:opacity-40"
                                        >
                                            {syncingRankedin ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                            Sync
                                        </button>
                                    )}
                                    <ExportReportMenu compact />
                                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="flex gap-6 overflow-x-auto no-scrollbar border-b border-white/10">
                            {[
                                { id: 'overview', label: 'Overview' },
                                { id: 'players', label: 'Players' },
                                { id: 'list', label: 'Registrations List' },
                                ...(event?.is_manual ? [{ id: 'draws', label: 'Draws' }] : []),
                                { id: 'statement', label: 'Income Statement' },
                                { id: 'activity', label: 'Activity Log' },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`py-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-padel-green text-padel-green' : 'border-transparent text-gray-400 hover:text-white'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {['eft', 'external'].includes(event?.payment_method) && (
                        <div className={`${isInline ? 'mt-4 rounded-2xl' : ''} mx-6 flex items-start gap-3 border border-amber-500/30 bg-amber-500/10 px-4 py-3`} role="status">
                            <Info size={18} className="mt-0.5 shrink-0 text-amber-300" />
                            <div>
                                <p className="text-sm font-bold text-amber-100">Manual payment confirmation required</p>
                                <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                                    This event uses {event.payment_method === 'eft' ? 'EFT' : 'an external payment link'}. New registrations remain pending until an event admin verifies payment and marks each player as paid in Event Manager.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className={`flex-1 overflow-y-auto custom-scrollbar ${isInline ? 'mt-6' : ''}`}>
                        {activeTab === 'overview' && (
                            <div className="p-6 space-y-6">
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4 }}
                                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
                                >
                                    <motion.div
                                        whileHover={{ y: -5, scale: 1.02 }}
                                        className="bg-gradient-to-br from-[#1a1a1a]/80 to-[#0a0a0a]/80 backdrop-blur-xl p-6 rounded-3xl border border-white/10 flex flex-col gap-2 relative overflow-hidden group shadow-2xl"
                                    >
                                        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 group-hover:rotate-12 transition-all duration-500">
                                            <Users size={120} />
                                        </div>
                                        <p className="text-xs font-black uppercase text-gray-400 tracking-widest relative z-10">Total Entries</p>
                                        <div className="flex items-baseline gap-2 mt-2 relative z-10">
                                            <h3 className="text-4xl md:text-5xl font-black text-white drop-shadow-md">{dashboardStats.totalEntries}</h3>
                                            <span className="text-xs text-padel-green font-bold uppercase">{dashboardStats.uniquePlayers} Unique</span>
                                        </div>
                                    </motion.div>

                                    <motion.div
                                        whileHover={{ y: -5, scale: 1.02 }}
                                        className="bg-gradient-to-br from-padel-green/20 via-[#1a1a1a]/80 to-[#0a0a0a]/80 backdrop-blur-xl p-6 rounded-3xl border border-padel-green/30 flex flex-col gap-2 relative overflow-hidden group shadow-[0_0_30px_rgba(190,255,0,0.1)]"
                                    >
                                        <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500 text-padel-green">
                                            <DollarSign size={120} />
                                        </div>
                                        <div className="flex justify-between items-start relative z-10">
                                            <p className="text-[10px] font-black uppercase text-padel-green/80 tracking-widest whitespace-nowrap">Total amount Billed</p>
                                            <p className="text-[10px] font-black text-white bg-black/40 px-2 py-0.5 rounded border border-white/5">
                                                {fmtR(overviewStats.totalAmountBilled)}
                                            </p>
                                        </div>
                                        <div className="flex flex-col mt-auto relative z-10">
                                            <div className="flex items-baseline gap-2">
                                                <h3 className="text-3xl md:text-4xl font-black text-padel-green drop-shadow-[0_0_15px_rgba(190,255,0,0.3)] whitespace-nowrap">
                                                    {fmtR(overviewStats.entryFeeBalance)}
                                                </h3>
                                                <span className="text-[9px] text-padel-green font-black uppercase tracking-widest opacity-70">Net entry income</span>
                                            </div>
                                            {overviewStats.pendingAmount > 0 && (
                                                <p className="text-[10px] text-red-400 font-bold uppercase mt-1">Outstanding {fmtR(overviewStats.pendingAmount)}</p>
                                            )}
                                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                                                Billed {fmtR(overviewStats.totalAmountBilled)} · Gross collected {fmtR(overviewStats.grossEntryFees)}
                                            </p>
                                            {overviewStats.entryFeesRefunded > 0 && (
                                                <p className="text-[10px] text-sky-400 font-bold uppercase mt-1">
                                                    Less entry refunds {fmtR(overviewStats.entryFeesRefunded)}
                                                </p>
                                            )}
                                        </div>
                                    </motion.div>

                                    <motion.div
                                        whileHover={{ y: -5, scale: 1.02 }}
                                        className="bg-gradient-to-br from-[#1a1a1a]/80 to-[#0a0a0a]/80 backdrop-blur-xl p-6 rounded-3xl border border-white/10 flex flex-col gap-2 relative overflow-hidden group shadow-2xl"
                                    >
                                        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 group-hover:-rotate-12 transition-all duration-500">
                                            <Trophy size={120} />
                                        </div>
                                        <p className="text-xs font-black uppercase text-gray-400 tracking-widest relative z-10">Total Players ({dashboardStats.uniquePlayers})</p>
                                        <div className="flex items-center justify-between gap-3 mt-4 w-full relative z-10">
                                            <div className="flex flex-col items-center flex-1">
                                                <span className="text-2xl font-black text-padel-green">{dashboardStats.licenses.full}</span>
                                                <span className="text-[10px] text-gray-400 uppercase font-bold mt-1">Full</span>
                                                <div className="w-full h-1 bg-padel-green/20 rounded-full mt-1 overflow-hidden">
                                                    <div className="h-full bg-padel-green" style={{ width: `${dashboardStats.uniquePlayers ? (dashboardStats.licenses.full / dashboardStats.uniquePlayers) * 100 : 0}%` }} />
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-center flex-1">
                                                <span className="text-2xl font-black text-sky-400">{dashboardStats.licenses.temp}</span>
                                                <span className="text-[10px] text-gray-400 uppercase font-bold mt-1">Temp</span>
                                                <div className="w-full h-1 bg-sky-400/20 rounded-full mt-1 overflow-hidden">
                                                    <div className="h-full bg-sky-400" style={{ width: `${dashboardStats.uniquePlayers ? (dashboardStats.licenses.temp / dashboardStats.uniquePlayers) * 100 : 0}%` }} />
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-center flex-1">
                                                <span className="text-2xl font-black text-red-400">{dashboardStats.licenses.none}</span>
                                                <span className="text-[10px] text-gray-400 uppercase font-bold mt-1">None</span>
                                                <div className="w-full h-1 bg-red-400/20 rounded-full mt-1 overflow-hidden">
                                                    <div className="h-full bg-red-400" style={{ width: `${dashboardStats.uniquePlayers ? (dashboardStats.licenses.none / dashboardStats.uniquePlayers) * 100 : 0}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>

                                    <motion.div
                                        whileHover={{ y: -5, scale: 1.02 }}
                                        className="bg-gradient-to-br from-[#1a1a1a]/80 to-[#0a0a0a]/80 backdrop-blur-xl p-6 rounded-3xl border border-white/10 flex flex-col gap-2 relative overflow-hidden group shadow-2xl"
                                    >
                                        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
                                            <CheckCircle size={120} />
                                        </div>
                                        <p className="text-xs font-black uppercase text-gray-400 tracking-widest relative z-10">Paid Status</p>
                                        <div className="flex items-baseline gap-2 mt-2 relative z-10">
                                            <h3 className="text-4xl md:text-5xl font-black text-padel-green drop-shadow-md">{dashboardStats.paidCount}</h3>
                                            <span className="text-xs text-gray-400 font-bold uppercase">/ {dashboardStats.totalEntries} Paid</span>
                                        </div>
                                        <div className="w-full h-2 bg-black/40 rounded-full mt-auto relative z-10 overflow-hidden border border-white/5">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${dashboardStats.totalEntries ? (dashboardStats.paidCount / dashboardStats.totalEntries) * 100 : 0}%` }}
                                                transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                                                className="h-full bg-gradient-to-r from-padel-green/50 to-padel-green rounded-full shadow-[0_0_10px_rgba(190,255,0,0.5)]"
                                            />
                                        </div>
                                    </motion.div>
                                </motion.div>

                                {/* Financial Summary — settlement model */}
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4, delay: 0.15 }}
                                    className="space-y-3"
                                >
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                            <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                                            Financial Summary
                                        </h3>
                                        <button
                                            type="button"
                                            onClick={() => setActiveTab('statement')}
                                            className="text-[11px] font-bold text-padel-green hover:text-white transition-colors flex items-center gap-1"
                                        >
                                            <FileText size={12} /> View income statement
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="bg-[#1a1a1a]/50 border border-white/10 rounded-xl p-4">
                                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mb-2">Entries Paid to 4m</p>
                                            <span className="text-xl font-black text-white">{overviewStats.paid4M}</span>
                                        </div>
                                        <div className="bg-[#1a1a1a]/50 border border-white/10 rounded-xl p-4">
                                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mb-2">Entry Payments (Manual)</p>
                                            <span className="text-xl font-black text-white">{overviewStats.paidClub}</span>
                                            <p className="text-[9px] text-gray-500 mt-1">{fmtR(overviewStats.collectedManual)} collected</p>
                                        </div>
                                        <div className="bg-[#1a1a1a]/50 border border-white/10 rounded-xl p-4">
                                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mb-2">Pending / unpaid</p>
                                            <span className="text-xl font-black text-amber-300">{overviewStats.pendingCount}</span>
                                            <p className="text-[9px] text-gray-500 mt-1">{fmtR(overviewStats.pendingAmount)} outstanding</p>
                                        </div>
                                        <div className="bg-[#1a1a1a]/50 border border-white/10 rounded-xl p-4">
                                            <p className="text-[10px] font-bold tracking-widest text-gray-400 mb-2">Comped Entries</p>
                                            <span className="text-xl font-black text-white">{overviewStats.compedEntries}</span>
                                            <p className="text-[9px] text-gray-500 mt-1">Free / complimentary · R 0</p>
                                        </div>
                                        <div className="bg-[#1a1a1a]/50 border border-white/10 rounded-xl p-4">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Total amount billed</p>
                                            <span className="text-xl font-black text-padel-green">{fmtR(overviewStats.totalAmountBilled)}</span>
                                            <p className="text-[9px] text-gray-500 mt-1">{fmtR(overviewStats.grossEntryFees)} collected · {fmtR(overviewStats.pendingAmount)} outstanding</p>
                                        </div>
                                        {overviewStats.hasEarlyBirdPricing && (
                                            <div className="bg-[#1a1a1a]/50 border border-white/10 rounded-xl p-4 col-span-2 md:col-span-1">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Early Bird · Normal</p>
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-xl font-black text-padel-green">{overviewStats.earlyBirdSignups}</span>
                                                    <span className="text-sm font-bold text-gray-500">·</span>
                                                    <span className="text-xl font-black text-white">{overviewStats.normalSignups}</span>
                                                </div>
                                                <p className="text-[9px] text-gray-500 mt-1">Entries signed up</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-[#1a1a1a]/50 border border-white/10 rounded-2xl p-5 space-y-3">
                                        <div className="flex items-center justify-between gap-4 text-sm">
                                            <span className="text-gray-300 font-semibold">Total amount billed</span>
                                            <span className="font-black text-white">{fmtR(overviewStats.totalAmountBilled)}</span>
                                        </div>
                                        {overviewStats.billedTierBreakdown.length > 0 && (
                                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 space-y-1.5">
                                                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Billed composition</p>
                                                {overviewStats.billedTierBreakdown.map((tier, index) => (
                                                    <div key={tier.rate} className="flex items-center justify-between gap-4 text-xs">
                                                        <span className="text-gray-400">
                                                            {index === 0 && overviewStats.billedTierBreakdown.length > 1 ? 'Early bird' : 'Regular'} · {tier.count} × {fmtR(tier.rate)}
                                                        </span>
                                                        <span className="font-semibold text-white">{fmtR(tier.total)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between gap-4 text-sm">
                                            <span className="text-gray-400">Gross entry fees collected</span>
                                            <span className="font-bold text-white">{fmtR(overviewStats.grossEntryFees)}</span>
                                        </div>
                                        {overviewStats.compedEntries > 0 && (
                                            <div className="flex items-center justify-between gap-4 text-sm">
                                                <span className="text-gray-400">
                                                    Comped entries
                                                    <span className="text-gray-600 font-normal"> · {overviewStats.compedEntries} free</span>
                                                </span>
                                                <span className="font-bold text-gray-500">{fmtR(0)}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between gap-4 text-sm">
                                            <span className="text-gray-400">Funds refunded for entry fees</span>
                                            <span className="font-bold text-red-400">−{fmtR(overviewStats.entryFeesRefunded)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 text-sm">
                                            <span className="text-gray-400">Outstanding entry fees</span>
                                            <span className="font-bold text-red-400">−{fmtR(overviewStats.pendingAmount)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 text-sm border-t border-white/10 pt-3">
                                            <span className="text-gray-300 font-semibold">Final entry sales</span>
                                            <span className="font-black text-white">{fmtR(overviewStats.entryFeeBalance)}</span>
                                        </div>
                                        {overviewStats.collectedManual > 0 && (
                                            <div className="flex items-center justify-between gap-4 text-sm">
                                                <span className="text-gray-400">Of which manual / EFT collected by 4M</span>
                                                <span className="font-bold text-white">{fmtR(overviewStats.collectedManual)}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between gap-4 text-sm">
                                            <span className="text-red-400">Platform fees @ {Math.round(PLATFORM_COMMISSION_RATE * 100)}% of gross income</span>
                                            <span className="font-bold text-red-400">−{fmtR(overviewStats.commission)}</span>
                                        </div>
                                        {interimPayments.length > 0 && (
                                            <div className="space-y-2 border-t border-white/10 pt-3">
                                                {interimPayments.map((p) => {
                                                    const paidLabel = p.paid_at
                                                        ? new Date(`${p.paid_at}T12:00:00`).toLocaleDateString('en-GB', {
                                                            day: 'numeric', month: 'short', year: 'numeric',
                                                        })
                                                        : '—';
                                                    return (
                                                        <div key={p.id} className="flex items-start justify-between gap-3 text-sm">
                                                            <div className="min-w-0">
                                                                <p className="text-red-400">
                                                                    Interim payment to organiser
                                                                    <span className="text-gray-500 font-normal"> · {paidLabel}</span>
                                                                </p>
                                                                {p.note && (
                                                                    <p className="text-[10px] text-gray-500 mt-0.5 truncate">{p.note}</p>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span className="font-bold text-red-400">−{fmtR(p.amount)}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveInterimPayment(p.id)}
                                                                    disabled={savingInterim}
                                                                    className="p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                                                                    title="Remove interim payment"
                                                                >
                                                                    <Trash2 size={13} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                                Record interim payment to organiser
                                            </p>
                                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.4fr_auto] gap-2">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={interimAmount}
                                                    onChange={(e) => setInterimAmount(e.target.value)}
                                                    placeholder="Amount (R)"
                                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-padel-green"
                                                />
                                                <input
                                                    type="date"
                                                    value={interimDate}
                                                    onChange={(e) => setInterimDate(e.target.value)}
                                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-padel-green"
                                                />
                                                <input
                                                    type="text"
                                                    value={interimNote}
                                                    onChange={(e) => setInterimNote(e.target.value)}
                                                    placeholder="Note (optional)"
                                                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-padel-green"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleAddInterimPayment}
                                                    disabled={savingInterim}
                                                    className="inline-flex items-center justify-center gap-1.5 bg-white/10 hover:bg-padel-green hover:text-black text-white px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-40"
                                                >
                                                    {savingInterim ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                                    Add
                                                </button>
                                            </div>
                                        </div>
                                        {overviewStats.licenseRevenue4M > 0 && (
                                            <p className="text-[10px] text-gray-500">
                                                SAPA license revenue via 4M (not paid to organiser): {fmtR(overviewStats.licenseRevenue4M)}
                                            </p>
                                        )}
                                        <div className="rounded-xl border border-padel-green/30 bg-padel-green/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-2">
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Balance due from 4M</p>
                                                <span className="text-3xl font-black text-padel-green">{fmtR(overviewStats.dueToOrg)}</span>
                                                <p className="text-[9px] text-gray-500 mt-1">
                                                    (Paystack collected − entry refunds) − {Math.round(PLATFORM_COMMISSION_RATE * 100)}% of Paystack gross
                                                    {overviewStats.interimPaid > 0 ? ` − interim paid (${fmtR(overviewStats.interimPaid)})` : ''}
                                                    {' · '}manual collections and licenses stay with the club / 4M
                                                </p>
                                                {!payoutRequestRules.canRequest && payoutRequestRules.blockedReason && overviewStats.dueToOrg > 0 && (
                                                    <p className="text-[10px] text-amber-400 mt-2">{payoutRequestRules.blockedReason}</p>
                                                )}
                                                {payoutRequestRules.canRequest && payoutRequestRules.phase === 'first' && (
                                                    <p className="text-[10px] text-gray-500 mt-2">First request capped at 50% · remaining balance after the event</p>
                                                )}
                                                {payoutRequestRules.canRequest && payoutRequestRules.phase === 'final' && (
                                                    <p className="text-[10px] text-gray-500 mt-2">Event ended · full remaining balance can be requested</p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={openPayoutRequestModal}
                                                disabled={requestingPayout || !payoutRequestRules.canRequest}
                                                className="inline-flex items-center justify-center gap-2 bg-padel-green text-black px-5 py-3 rounded-xl text-sm font-black hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                                            >
                                                {requestingPayout ? <Loader2 size={16} className="animate-spin" /> : null}
                                                Request Payout
                                                <ArrowRight size={16} />
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-gray-500">
                                            First payout request is limited to 50% of the amount due. The remaining balance can be requested after the event ends. Record interim payments when partial settlements are made.
                                        </p>
                                    </div>
                                </motion.div>
                            </div>
                        )}

                        {activeTab === 'players' && (
                            <div className="p-6 space-y-6">
                                <div className="relative max-w-md">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        value={playerSearch}
                                        onChange={(e) => setPlayerSearch(e.target.value)}
                                        placeholder="Search players, partners, emails..."
                                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:border-padel-green focus:outline-none"
                                    />
                                </div>
                                {sortedDivisions.map(cls => {
                                    const allTeams = teamsWithSeedsByDivision[cls.name] || [];
                                    const clsTeams = allTeams.filter((team) => teamMatchesPlayerSearch(team, playerSearch));
                                    const isExpanded = playerSearch.trim()
                                        ? clsTeams.length > 0
                                        : (expandedDivisions[cls.id] ?? false);
                                    const fee = Number(cls.entry_fee || 0);
                                    const soloCount = clsTeams.filter((team) => team.players.length === 1).length;
                                    const pairedCount = clsTeams.filter((team) => team.players.length > 1).length;
                                    const teamsCount = soloCount > 0 ? pairedCount : clsTeams.length;
                                    if (playerSearch.trim() && clsTeams.length === 0) return null;
                                    return (
                                        <div key={cls.id} className="bg-[#1a1a1a]/30 rounded-2xl border border-white/10 overflow-hidden">
                                            <div
                                                onClick={() => setExpandedDivisions(prev => ({...prev, [cls.id]: !isExpanded}))}
                                                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 cursor-pointer hover:bg-white/5 transition-colors border-b border-white/5"
                                            >
                                                <div className="flex flex-wrap items-center gap-4">
                                                    <h3 className="font-bold text-white">{cls.name}</h3>
                                                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                                        <span className="uppercase tracking-widest font-bold">Entry fee</span>
                                                        <span className="text-white font-bold">{fmtR(fee)}</span>
                                                    </div>
                                                    {cls.license_required && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-padel-green">
                                                            <Check size={12} /> License required
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {soloCount > 0 && (
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-black bg-amber-400 shadow-lg shadow-amber-400/20 px-2.5 py-1 rounded-md">
                                                            {soloCount} solo
                                                        </span>
                                                    )}
                                                    {(teamsCount > 0 || soloCount === 0) && (
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-padel-green bg-padel-green/10 px-2.5 py-1 rounded-md">
                                                            {teamsCount} teams
                                                        </span>
                                                    )}
                                                    <ChevronDown size={16} className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                </div>
                                            </div>
                                            {isExpanded && (
                                                clsTeams.length > 0 ? (
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-sm min-w-[800px]">
                                                            <thead>
                                                                <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-white/10">
                                                                    <th className="py-3 px-4 w-14">#</th>
                                                                    <th className="py-3 px-4">Team (Players)</th>
                                                                    <th className="py-3 px-4">Players</th>
                                                                    <th className="py-3 px-4">Payment</th>
                                                                    <th className="py-3 px-4">Amount Paid</th>
                                                                    <th className="py-3 px-4">License Status</th>
                                                                    <th className="py-3 px-4">WhatsApp</th>
                                                                    <th className="py-3 px-4 text-right min-w-[160px]">Manage</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-white/5">
                                                                {clsTeams.map((team, idx) => {
                                                                    const isSoloEntry = team.players.length === 1;
                                                                    return (
                                                                    <tr key={team.id} className={`transition-colors align-middle ${isSoloEntry ? 'bg-amber-400/5 hover:bg-amber-400/10' : 'hover:bg-white/5'}`}>
                                                                        <td className="py-4 px-4 align-middle">
                                                                            <div className="flex flex-col items-center justify-center gap-1.5">
                                                                                {team.seed ? (
                                                                                    <div className="w-8 h-8 rounded-lg bg-amber-400 text-black flex items-center justify-center font-black text-xs shadow-lg shadow-amber-400/20">
                                                                                        {team.seed}
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-bold text-gray-400 text-xs">
                                                                                        {idx + 1}
                                                                                    </div>
                                                                                )}
                                                                                <span className="text-[10px] font-bold text-gray-400 tabular-nums">
                                                                                    {team.totalPoints > 0 ? team.totalPoints.toLocaleString() : '—'}
                                                                                </span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 align-middle">
                                                                            <div className="flex items-center justify-center gap-3">
                                                                                {team.players.map((p, pi) => {
                                                                                    const img = getPlayerImage(p);
                                                                                    const pts = getPlayerPoints(p);
                                                                                    const firstName = (p.full_name || '').split(' ')[0];
                                                                                    return (
                                                                                        <React.Fragment key={p.id}>
                                                                                            {pi > 0 && <span className="text-gray-500 font-bold">+</span>}
                                                                                            <div className="flex flex-col items-center gap-1 min-w-[72px]">
                                                                                                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/10 bg-black/40 shrink-0">
                                                                                                    {img ? (
                                                                                                        <img src={img} alt={p.full_name} className="w-full h-full object-cover" />
                                                                                                    ) : (
                                                                                                        <div className="w-full h-full flex items-center justify-center"><User className="w-6 h-6 text-gray-500" /></div>
                                                                                                    )}
                                                                                                </div>
                                                                                                <span className="text-xs font-bold text-white text-center truncate max-w-[80px]">{firstName}</span>
                                                                                                {pts > 0 && (
                                                                                                    <span className="text-[9px] font-bold text-padel-green bg-padel-green/10 px-1.5 py-0.5 rounded">{pts.toLocaleString()}</span>
                                                                                                )}
                                                                                            </div>
                                                                                        </React.Fragment>
                                                                                    );
                                                                                })}
                                                                                {team.players.length === 1 && team.players[0].partner_name && (
                                                                                    <>
                                                                                        <span className="text-gray-500 font-bold">+</span>
                                                                                        <div className="flex flex-col items-center gap-1 min-w-[72px] opacity-50">
                                                                                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-dashed border-white/20 bg-black/20 flex items-center justify-center">
                                                                                                <User className="w-6 h-6 text-gray-600" />
                                                                                            </div>
                                                                                            <span className="text-xs font-bold text-gray-500 italic truncate max-w-[80px]">{(team.players[0].partner_name || '').split(' ')[0]}</span>
                                                                                            <span className="text-[9px] font-bold text-gray-500 uppercase">Not entered</span>
                                                                                        </div>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                        <td className="py-4 px-4 align-middle">
                                                                            <TeamPlayerRows players={team.players}>
                                                                                {(p) => renderPlayerNameButton(p, 'text-sm text-gray-300 font-medium')}
                                                                            </TeamPlayerRows>
                                                                        </td>
                                                                        <td className="py-4 px-4 align-middle">
                                                                            <TeamPlayerRows players={team.players}>
                                                                                {(p) => renderPaymentCell(p)}
                                                                            </TeamPlayerRows>
                                                                        </td>
                                                                        <td className="py-4 px-4 align-middle">
                                                                            <TeamPlayerRows players={team.players}>
                                                                                {(p) => (
                                                                                    <div className="text-sm font-bold text-white">
                                                                                        {registrationCountsAsPaid(p, refundByReg, payments)
                                                                                            ? fmtR(getRegistrationEntryFeePaid(findPaymentForReg(p), p, fee))
                                                                                            : '—'}
                                                                                    </div>
                                                                                )}
                                                                            </TeamPlayerRows>
                                                                        </td>
                                                                        <td className="py-4 px-4 align-middle">
                                                                            <TeamPlayerRows players={team.players}>
                                                                                {(p) => licenseBadge(p)}
                                                                            </TeamPlayerRows>
                                                                        </td>
                                                                        <td className="py-4 px-4 align-middle">
                                                                            <TeamPlayerRows players={team.players}>
                                                                                {(p) => renderWhatsAppToggle(p)}
                                                                            </TeamPlayerRows>
                                                                        </td>
                                                                        <td className="py-4 px-4 align-middle">
                                                                            <div className="flex flex-col justify-center gap-2 min-w-[160px] ml-auto">
                                                                                {team.players.length > 1 ? (
                                                                                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-2.5">
                                                                                        <p className="text-[9px] font-black uppercase tracking-widest text-violet-300/80 mb-2">Whole team</p>
                                                                                        <div className="grid grid-cols-2 gap-1.5">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => openMoveTeam(team)}
                                                                                                className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border bg-violet-500/15 text-violet-200 border-violet-500/30 hover:bg-violet-500 hover:text-white transition-colors"
                                                                                            >
                                                                                                <ArrowRightLeft size={11} /> Move
                                                                                            </button>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => { setRemovePair(true); setRemoveTarget(team.players[0]); }}
                                                                                                className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500 hover:text-white transition-colors"
                                                                                            >
                                                                                                <Trash2 size={11} /> Remove
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-2.5 space-y-2">
                                                                                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-300">Solo entry</p>
                                                                                        <div className="flex items-center gap-1.5 justify-end flex-nowrap">
                                                                                            {team.players[0].status !== 'withdrawn' && !team.players[0].partner_name?.trim() && !team.players[0].partner_email?.trim() && (
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => { setLinkSearch(''); setProfileResults([]); setLinkTarget(team.players[0]); }}
                                                                                                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border bg-sky-600 text-white border-sky-700 hover:bg-sky-500 transition-colors shrink-0"
                                                                                                >
                                                                                                    <UserPlus size={11} /> Partner
                                                                                                </button>
                                                                                            )}
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => openMovePlayer(team.players[0])}
                                                                                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border bg-violet-600 text-white border-violet-700 hover:bg-violet-500 transition-colors shrink-0"
                                                                                            >
                                                                                                <ArrowRightLeft size={11} /> Move
                                                                                            </button>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => { setRemovePair(false); setRemoveTarget(team.players[0]); }}
                                                                                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border bg-red-600 text-white border-red-700 hover:bg-red-500 transition-colors shrink-0"
                                                                                            >
                                                                                                <Trash2 size={11} /> Remove
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                ) : (
                                                    <div className="p-6 text-center text-xs font-bold text-gray-500 uppercase tracking-widest">
                                                        No teams in this division
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {activeTab === 'list' && (
                            <div className="flex flex-col h-full">
                                {/* Controls */}
                                <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-white/5">
                                    <div className="relative flex-1 min-w-[200px]">
                                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                        <input
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Search name, email, division..."
                                            className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:border-padel-green focus:outline-none"
                                        />
                                    </div>
                                    <select
                                        value={paymentFilter}
                                        onChange={(e) => setPaymentFilter(e.target.value)}
                                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-bold focus:border-padel-green focus:outline-none"
                                    >
                                        <option value="all">Payment status: All</option>
                                        <option value="paid">Paid</option>
                                        <option value="manual">Manual</option>
                                        <option value="pending">Pending</option>
                                        <option value="refunded">Refunded</option>
                                        <option value="withdrawn">Withdrawn</option>
                                    </select>
                                    <select
                                        value={licenseFilter}
                                        onChange={(e) => setLicenseFilter(e.target.value)}
                                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-bold focus:border-padel-green focus:outline-none"
                                    >
                                        <option value="all">License type: All</option>
                                        <option value="full">Full SAPA</option>
                                        <option value="temp">Temporary</option>
                                        <option value="none">None / not on file</option>
                                    </select>
                                    <select
                                        value={divisionFilter}
                                        onChange={(e) => setDivisionFilter(e.target.value)}
                                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-bold focus:border-padel-green focus:outline-none"
                                        title="Filter by division"
                                    >
                                        <option value="all">All divisions ({stats.total})</option>
                                        {divisions.map((d) => {
                                            const count = registrations.filter(r => r.status !== 'withdrawn' && r.division === d.name).length;
                                            return (
                                                <option key={d.id} value={d.name}>{d.name} ({count})</option>
                                            );
                                        })}
                                    </select>
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-bold focus:border-padel-green focus:outline-none"
                                        title="Sort by"
                                    >
                                        <option value="division">Sort: Division</option>
                                        <option value="name">Sort: Player name</option>
                                        <option value="recent">Sort: Most recent</option>
                                    </select>
                                </div>

                                {/* Table */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    {loading ? (
                                        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div>
                                    ) : filtered.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                                            <UserX size={36} className="mb-3 opacity-40" />
                                            <p className="text-sm">No registrations found</p>
                                        </div>
                                    ) : (
                                        <table className="w-full text-sm">
                                            <thead className="sticky top-0 bg-[#0a0a0a] z-10">
                                                <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-500 border-b border-white/10">
                                                    <th className="py-3 px-6">Player</th>
                                                    <th className="py-3 px-4">4M Profile</th>
                                                    <th className="py-3 px-4">Division</th>
                                                    <th className="py-3 px-4">Partner</th>
                                                    <th className="py-3 px-4">License type</th>
                                                    <th className="py-3 px-4">Status</th>
                                                    <th className="py-3 px-4 text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filtered.map((r) => (
                                                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                                                        <td className="py-3 px-6">
                                                            {renderPlayerNameButton(r, 'font-bold text-white')}
                                                            <div className="text-[11px] text-gray-500">{r.email}</div>
                                                        </td>
                                                        <td className="py-3 px-4">{renderProfileLink(r)}</td>
                                                        <td className="py-3 px-4 text-gray-300">{r.division}</td>
                                                        <td className="py-3 px-4 text-gray-400">
                                                            {r.partner_name || '—'}
                                                            {r.partner_email && <div className="text-[10px] text-gray-600">{r.partner_email}</div>}
                                                        </td>
                                                        <td className="py-3 px-4">{licenseBadge(r)}</td>
                                                        <td className="py-3 px-4">
                                                            <div className="flex flex-col gap-1.5">
                                                                {r.status === 'withdrawn' ? (
                                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-500/10 text-gray-400">Withdrawn</span>
                                                                ) : (
                                                                    renderPaymentCell(r)
                                                                )}
                                                            {(() => {
                                                                const rf = refundSummaryFor(r.id);
                                                                if (!rf) return null;
                                                                const cfg = rf.status === 'processed'
                                                                    ? { cls: 'bg-emerald-500/10 text-emerald-400', text: rf.text || `Refunded ${fmtR(rf.amount)}` }
                                                                    : rf.status === 'partial'
                                                                        ? { cls: 'bg-emerald-500/10 text-emerald-400', text: rf.text || `Refunded ${fmtR(rf.processedAmount || rf.amount)}` }
                                                                        : rf.status === 'failed'
                                                                            ? { cls: 'bg-red-500/10 text-red-400', text: 'Refund failed' }
                                                                            : { cls: 'bg-sky-500/10 text-sky-400', text: rf.text || `Refund pending ${fmtR(rf.amount)}` };
                                                                return (
                                                                    <div className="mt-1 space-y-1">
                                                                        <div className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${cfg.cls}`}>
                                                                            {cfg.text}
                                                                        </div>
                                                                        {rf.note && (
                                                                            <p className={`text-[10px] leading-snug max-w-[220px] ${
                                                                                rf.status === 'failed' ? 'text-red-400/80' : 'text-gray-400'
                                                                            }`}>
                                                                                {rf.note}
                                                                            </p>
                                                                        )}
                                                                        {rf.status === 'failed' && rf.failedError && !rf.note && (
                                                                            <p className="text-[10px] text-red-400/80 leading-snug max-w-[200px]">{rf.failedError}</p>
                                                                        )}
                                                                        {rf.failedRefundId && (rf.status === 'failed' || rf.status === 'partial') && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => retryFailedRefund(rf.failedRefundId)}
                                                                                disabled={retryRefundId === rf.failedRefundId}
                                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/15 text-red-300 border border-red-500/25 hover:bg-red-500 hover:text-white disabled:opacity-50"
                                                                            >
                                                                                {retryRefundId === rf.failedRefundId
                                                                                    ? <Loader2 size={10} className="animate-spin" />
                                                                                    : <RotateCcw size={10} />}
                                                                                Retry refund
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4 text-right">
                                                            <div className="inline-flex items-center gap-2 justify-end">
                                                                {r.status !== 'withdrawn' && !r.partner_name?.trim() && !r.partner_email?.trim() && (
                                                                    <button
                                                                        onClick={() => { setLinkSearch(''); setProfileResults([]); setLinkTarget(r); }}
                                                                        className="bg-sky-500/10 text-sky-400 border border-sky-500/20 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-sky-500 hover:text-white inline-flex items-center gap-1.5"
                                                                    >
                                                                        <UserPlus size={12} />
                                                                        Add Partner
                                                                    </button>
                                                                )}
                                                                {r.status !== 'withdrawn' && (
                                                                    <button
                                                                        onClick={() => openMovePlayer(r)}
                                                                        className="bg-violet-500/10 text-violet-300 border border-violet-500/20 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-violet-500 hover:text-white inline-flex items-center gap-1.5"
                                                                    >
                                                                        <ArrowRightLeft size={12} />
                                                                        Move
                                                                    </button>
                                                                )}
                                                                {r.status !== 'withdrawn' && (
                                                                    <button
                                                                        onClick={() => { setRemovePair(false); setRemoveTarget(r); }}
                                                                        className="bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500 hover:text-white inline-flex items-center gap-1.5"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                        Remove
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {removeTarget && (() => {
                        const paid = removeTarget.payment_status === 'paid';
                        const method = formatPaymentMethodForExport(removeTarget);
                        const isCash = method === 'Cash' || method === 'Manual';
                        const partner = partnerRegOf(removeTarget);
                        return (
                            <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60" onClick={() => !removeBusy && setRemoveTarget(null)}>
                                <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                                            <Trash2 size={16} className="text-red-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-white font-bold">Remove {removeTarget.full_name}?</h3>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                {removeTarget.division}
                                                {paid ? ` · Paid${method ? ` (${method})` : ''}` : ' · Not paid'}
                                            </p>
                                        </div>
                                    </div>

                                    {partner && (
                                        <label className="flex items-center gap-2 mb-4 text-xs text-gray-300 cursor-pointer">
                                            <input type="checkbox" checked={removePair} onChange={(e) => setRemovePair(e.target.checked)} disabled={removeBusy} className="accent-red-500" />
                                            Also remove partner <span className="font-bold text-white">{partner.full_name}</span> (pair)
                                        </label>
                                    )}

                                    <div className="flex flex-col gap-2">
                                        {paid && !isCash && (
                                            <button onClick={() => removeRegistration(removeTarget, 'refund')} disabled={removeBusy}
                                                className="w-full py-2.5 rounded-lg text-sm font-bold bg-padel-green text-black hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                                                {removeBusy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Remove &amp; Refund
                                            </button>
                                        )}
                                        {paid && isCash && (
                                            <button onClick={() => removeRegistration(removeTarget, 'cash_refund')} disabled={removeBusy}
                                                className="w-full py-2.5 rounded-lg text-sm font-bold bg-padel-green text-black hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                                                {removeBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Mark Refunded &amp; Remove
                                            </button>
                                        )}
                                        <button onClick={() => removeRegistration(removeTarget, 'no_refund')} disabled={removeBusy}
                                            className="w-full py-2.5 rounded-lg text-sm font-bold bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 disabled:opacity-50">
                                            {paid ? 'Remove without refund' : 'Remove'}
                                        </button>
                                        <button onClick={() => setRemoveTarget(null)} disabled={removeBusy}
                                            className="w-full py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {linkTarget && (
                        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60" onClick={() => !linkBusy && setLinkTarget(null)}>
                            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
                                        <UserPlus size={16} className="text-sky-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-white font-bold truncate">Add partner for {linkTarget.full_name}</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">{linkTarget.division} · pair with another solo entry, or invite a 4M member to pay.</p>
                                    </div>
                                </div>

                                <div className="relative mb-3">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                    <input
                                        autoFocus
                                        value={linkSearch}
                                        onChange={(e) => setLinkSearch(e.target.value)}
                                        placeholder="Search solo players…"
                                        className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-sky-500/50"
                                    />
                                </div>

                                <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-3">
                                    {/* Other solo entries in this division — pure link, no charge either way. */}
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-1">Solo entries · pair as a team</p>
                                        {eligiblePartners.length === 0 ? (
                                            <p className="text-xs text-gray-600 px-1 py-2">No other solo entries available in {linkTarget.division}.</p>
                                        ) : eligiblePartners.map((p) => (
                                            <button
                                                key={p.id}
                                                disabled={linkBusy}
                                                onClick={() => linkPartner(linkTarget, p)}
                                                className="w-full flex items-center justify-between gap-3 text-left bg-white/5 hover:bg-sky-500/10 border border-white/5 hover:border-sky-500/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                                            >
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-white truncate">{p.full_name}</div>
                                                    <div className="text-[11px] text-gray-500 truncate">{p.email}</div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                                        p.payment_status === 'paid'
                                                            ? 'bg-emerald-500/10 text-emerald-400'
                                                            : 'bg-amber-500/10 text-amber-400'
                                                    }`}>
                                                        {p.payment_status === 'paid' ? 'Paid' : 'Pending'}
                                                    </span>
                                                    {linkBusy ? <Loader2 size={14} className="animate-spin text-sky-400 shrink-0" /> : <UserPlus size={14} className="text-sky-400 shrink-0" />}
                                                </div>
                                            </button>
                                        ))}
                                    </div>

                                    {/* 4M members not yet entered — adding them sends an invite to pay. */}
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 px-1">Invite a 4M member · they'll be emailed to pay</p>
                                        {linkSearch.trim().length < 2 ? (
                                            <p className="text-xs text-gray-600 px-1 py-2">Type a name or email above to search members not yet entered.</p>
                                        ) : searchingProfiles ? (
                                            <p className="text-xs text-gray-500 px-1 py-2 inline-flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Searching members…</p>
                                        ) : profileResults.length === 0 ? (
                                            <p className="text-xs text-gray-600 px-1 py-2">No unentered members match “{linkSearch.trim()}”.</p>
                                        ) : profileResults.map((p) => (
                                            <button
                                                key={p.id}
                                                disabled={linkBusy}
                                                onClick={() => addUnregisteredPartner(linkTarget, p)}
                                                className="w-full flex items-center justify-between gap-3 text-left bg-white/5 hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/30 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
                                            >
                                                <div className="min-w-0">
                                                    <div className="text-sm font-semibold text-white truncate">{p.name}</div>
                                                    <div className="text-[11px] text-gray-500 truncate">{p.email}</div>
                                                </div>
                                                <span className="text-[10px] font-bold text-amber-300 shrink-0 inline-flex items-center gap-1">
                                                    {linkBusy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Invite
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <button onClick={() => { setLinkTarget(null); setProfileResults([]); }} disabled={linkBusy}
                                    className="mt-4 w-full py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {profileViewTarget && (
                        <AdminPlayerProfileModal
                            registration={profileViewTarget}
                            initialProfile={getPlayerProfile(profileViewTarget)}
                            eventId={event?.id}
                            eventRegistrations={registrations}
                            payments={payments}
                            onClose={() => setProfileViewTarget(null)}
                            onLinkProfile={(reg) => {
                                setProfileViewTarget(null);
                                openProfileLinkModal(reg);
                            }}
                        />
                    )}

                    {unmarkTarget && (
                        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60" onClick={() => !unmarkBusy && setUnmarkTarget(null)}>
                            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                                        <RotateCcw size={16} className="text-red-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-white font-bold truncate">Unmark {unmarkTarget.full_name} as paid?</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {unmarkTarget.division} · {fmtR(divFee(unmarkTarget.division))}
                                        </p>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-400 mb-4">
                                    This reverts the entry to <span className="text-amber-400 font-semibold">pending payment</span> and cancels the admin manual payment record. Real Paystack payments cannot be unmarked here.
                                </p>
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={confirmUnmarkManualPaid}
                                        disabled={unmarkBusy}
                                        className="w-full py-2.5 rounded-lg text-sm font-bold bg-red-500 text-white hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-2"
                                    >
                                        {unmarkBusy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                                        Unmark as paid
                                    </button>
                                    <button
                                        onClick={() => setUnmarkTarget(null)}
                                        disabled={unmarkBusy}
                                        className="w-full py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {payoutModalOpen && (
                        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60" onClick={closePayoutRequestModal}>
                            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-padel-green/10 flex items-center justify-center shrink-0">
                                        <DollarSign size={16} className="text-padel-green" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-white font-bold">
                                            {payoutRequestRules.phase === 'first' ? 'Request first payout (50%)' : 'Request final payout'}
                                        </h3>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            Amount due: {fmtR(overviewStats.dueToOrg)}
                                        </p>
                                    </div>
                                </div>

                                <p className="text-sm text-gray-400 mb-4">
                                    {payoutRequestRules.helperText}
                                </p>

                                <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                                    Amount requesting
                                </label>
                                <div className="relative mb-2">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold">R</span>
                                    <input
                                        type="number"
                                        min={1}
                                        max={maxPayoutRequest}
                                        step={1}
                                        value={payoutRequestAmount}
                                        onChange={(e) => setPayoutRequestAmount(e.target.value)}
                                        className="w-full bg-black/30 border border-white/10 rounded-lg pl-8 pr-3 py-2.5 text-sm text-white outline-none focus:border-padel-green/50"
                                        placeholder={String(maxPayoutRequest)}
                                        autoFocus
                                    />
                                </div>
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-[11px] text-gray-500">
                                        {payoutRequestRules.phase === 'first' ? 'Max 50% now' : 'Remaining balance'} · {fmtR(maxPayoutRequest)}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setPayoutRequestAmount(String(maxPayoutRequest))}
                                        className="text-[11px] font-bold uppercase tracking-wider text-padel-green hover:text-white"
                                    >
                                        Use max
                                    </button>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <button
                                        type="button"
                                        onClick={handleRequestPayout}
                                        disabled={requestingPayout}
                                        className="w-full py-2.5 rounded-lg text-sm font-bold bg-padel-green text-black hover:bg-white disabled:opacity-40 inline-flex items-center justify-center gap-2"
                                    >
                                        {requestingPayout ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                                        Send payout request
                                    </button>
                                    <button
                                        type="button"
                                        onClick={closePayoutRequestModal}
                                        disabled={requestingPayout}
                                        className="w-full py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {markPaidTarget && (
                        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60" onClick={() => !markPaidBusy && closeMarkPaidModal()}>
                            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                                        <Check size={16} className="text-emerald-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-white font-bold truncate">
                                            {markPaidMethod === 'comp' ? 'Comp ' : 'Mark '}{markPaidTarget.full_name}{markPaidMethod === 'comp' ? '?' : ' as paid'}
                                        </h3>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {markPaidTarget.division} · {markPaidMethod === 'comp' ? 'Free / complimentary entry (R 0)' : fmtR(divFee(markPaidTarget.division))}
                                        </p>
                                    </div>
                                </div>

                                <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Payment received via</label>
                                <select
                                    value={markPaidMethod}
                                    onChange={(e) => setMarkPaidMethod(e.target.value)}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50 mb-3"
                                >
                                    <option value="eft">EFT</option>
                                    <option value="external">External payment provider</option>
                                    <option value="manual">Other manual payment</option>
                                    <option value="cash">Cash</option>
                                    <option value="paystack">Paystack (offline fix)</option>
                                    <option value="comp">Comp (free entry)</option>
                                </select>

                                <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                                    {markPaidMethod === 'comp' ? 'Comp note' : 'Payment note'} <span className="text-red-400">*</span>
                                </label>
                                <textarea
                                    value={markPaidNote}
                                    onChange={(e) => setMarkPaidNote(e.target.value)}
                                    placeholder={markPaidMethod === 'comp' ? 'e.g. "Comp entry — sponsor guest", "Organiser guest place"' : 'e.g. "EFT paid 6 Jul", "Cash at desk"'}
                                    rows={3}
                                    required
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50 mb-1 resize-none"
                                />
                                <p className={`text-[11px] mb-4 min-h-[1rem] ${markPaidNote.trim() ? 'invisible' : 'text-amber-400/90'}`}>
                                    {markPaidMethod === 'comp' ? 'Required — explain why this entry is complimentary.' : 'Required — explain how payment was received.'}
                                </p>

                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={confirmMarkPaid}
                                        disabled={markPaidBusy || !markPaidNote.trim()}
                                        className="w-full py-2.5 rounded-lg text-sm font-bold bg-emerald-500 text-black hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-2"
                                    >
                                        {markPaidBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                        {markPaidMethod === 'comp' ? 'Confirm comp' : 'Confirm payment'}
                                    </button>
                                    <button
                                        onClick={closeMarkPaidModal}
                                        disabled={markPaidBusy}
                                        className="w-full py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {addPlayerOpen && (
                        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60" onClick={closeAddPlayerModal}>
                            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="w-9 h-9 rounded-xl bg-padel-green/15 flex items-center justify-center shrink-0">
                                        <UserPlus size={16} className="text-padel-green" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-white font-bold">Add Player</h3>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            Add them provisionally with payment pending. Mark paid (or comp) afterwards if needed.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={closeAddPlayerModal}
                                        disabled={addPlayerBusy}
                                        className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/5 disabled:opacity-40"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {addPlayerSelected ? (
                                    <div className="mb-4 flex items-center gap-3 rounded-xl border border-padel-green/30 bg-padel-green/5 px-3 py-2.5">
                                        <div className="w-10 h-10 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0 flex items-center justify-center">
                                            {addPlayerSelected.image_url ? (
                                                <img src={addPlayerSelected.image_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <User size={16} className="text-gray-500" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-white truncate">{addPlayerSelected.name}</p>
                                            <p className="text-[11px] text-gray-400 truncate">{addPlayerSelected.email}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setAddPlayerSelected(null)}
                                            disabled={addPlayerBusy}
                                            className="text-[11px] font-bold uppercase tracking-wider text-gray-400 hover:text-white disabled:opacity-40"
                                        >
                                            Change
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mb-4">
                                        <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                                            Search 4M players
                                        </label>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                                            <input
                                                type="text"
                                                value={addPlayerSearch}
                                                onChange={(e) => setAddPlayerSearch(e.target.value)}
                                                placeholder="Name or email…"
                                                autoFocus
                                                className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white outline-none focus:border-padel-green/50"
                                            />
                                        </div>
                                        <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
                                            {addPlayerSearch.trim().length < 2 ? (
                                                <p className="px-3 py-4 text-xs text-gray-500 text-center">Type at least 2 characters to search</p>
                                            ) : addPlayerSearching ? (
                                                <div className="px-3 py-4 flex items-center justify-center gap-2 text-xs text-gray-400">
                                                    <Loader2 size={14} className="animate-spin" /> Searching…
                                                </div>
                                            ) : addPlayerResults.length === 0 ? (
                                                <p className="px-3 py-4 text-xs text-gray-500 text-center">No players found</p>
                                            ) : (
                                                addPlayerResults.map((p) => {
                                                    const alreadyInSelectedDiv = addPlayerDivision && registrations.some((r) =>
                                                        r.status !== 'withdrawn'
                                                        && r.division === addPlayerDivision
                                                        && (r.email || '').toLowerCase() === (p.email || '').toLowerCase());
                                                    return (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            disabled={alreadyInSelectedDiv || addPlayerBusy}
                                                            onClick={() => setAddPlayerSelected(p)}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.04] disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            <div className="w-8 h-8 rounded-full overflow-hidden bg-white/5 border border-white/10 shrink-0 flex items-center justify-center">
                                                                {p.image_url ? (
                                                                    <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <User size={14} className="text-gray-500" />
                                                                )}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-sm font-bold text-white truncate">{p.name}</p>
                                                                <p className="text-[11px] text-gray-500 truncate">{p.email}</p>
                                                            </div>
                                                            {alreadyInSelectedDiv ? (
                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 shrink-0">Entered</span>
                                                            ) : (
                                                                <UserPlus size={14} className="text-padel-green shrink-0" />
                                                            )}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}

                                <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Division</label>
                                {divisions.length === 0 ? (
                                    <p className="text-xs text-amber-400 mb-3">No divisions found for this event.</p>
                                ) : (
                                    <select
                                        value={addPlayerDivision}
                                        onChange={(e) => setAddPlayerDivision(e.target.value)}
                                        disabled={addPlayerBusy}
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-padel-green/50 mb-3"
                                    >
                                        {divisions.map((d) => (
                                            <option key={d.id || d.name} value={d.name}>
                                                {d.name}{d.entry_fee != null ? ` · ${fmtR(d.entry_fee)}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                )}

                                <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">Entry status</p>
                                    <p className="text-sm text-white font-semibold mt-0.5">
                                        Pending payment · {fmtR(divFee(addPlayerDivision))} due
                                    </p>
                                    <p className="text-[11px] text-gray-400 mt-1">
                                        After adding, use Mark paid on their row (comp is an option there) if needed.
                                    </p>
                                </div>

                                <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                                    Note <span className="text-gray-600 normal-case tracking-normal">(optional)</span>
                                </label>
                                <textarea
                                    value={addPlayerNote}
                                    onChange={(e) => setAddPlayerNote(e.target.value)}
                                    placeholder='e.g. "Added for club — will pay later"'
                                    rows={2}
                                    disabled={addPlayerBusy}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-padel-green/50 mb-4 resize-none"
                                />

                                <div className="flex flex-col gap-2">
                                    <button
                                        type="button"
                                        onClick={confirmAddPlayer}
                                        disabled={
                                            addPlayerBusy
                                            || !addPlayerSelected
                                            || !addPlayerDivision
                                            || divisions.length === 0
                                        }
                                        className="w-full py-2.5 rounded-lg text-sm font-bold bg-padel-green text-black hover:brightness-110 disabled:opacity-40 inline-flex items-center justify-center gap-2"
                                    >
                                        {addPlayerBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                        Add player (pending)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={closeAddPlayerModal}
                                        disabled={addPlayerBusy}
                                        className="w-full py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {matchingProfileReg && (
                        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60" onClick={() => !profileLinkBusy && setMatchingProfileReg(null)}>
                            <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                <h3 className="text-xl font-black text-white mb-1">Link 4M Padel Profile</h3>
                                <p className="text-gray-400 text-sm mb-5">
                                    Linking: <span className="text-padel-green font-bold">{matchingProfileReg.full_name}</span>
                                    {matchingProfileReg.email && (
                                        <span className="text-gray-500"> · {matchingProfileReg.email}</span>
                                    )}
                                </p>

                                <div className="relative mb-4">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={14} />
                                    <input
                                        type="text"
                                        placeholder="Search players by name or email…"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-padel-green/50"
                                        value={profileLinkSearch}
                                        onChange={(e) => {
                                            setProfileLinkSearch(e.target.value);
                                            searchProfilesForLink(e.target.value);
                                        }}
                                    />
                                </div>

                                <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar">
                                    {searchingProfiles ? (
                                        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-500" size={20} /></div>
                                    ) : profileLinkResults.length === 0 ? (
                                        <p className="text-xs text-gray-500 text-center py-6">No profiles found — try a different search.</p>
                                    ) : (
                                        profileLinkResults.map((player) => (
                                            <button
                                                key={player.id}
                                                type="button"
                                                disabled={profileLinkBusy}
                                                onClick={() => linkRegistrationToProfile(matchingProfileReg, player)}
                                                className="w-full bg-white/5 hover:bg-padel-green hover:text-black p-4 rounded-xl border border-white/5 text-left transition-all group disabled:opacity-50"
                                            >
                                                <div className="flex justify-between items-center gap-3">
                                                    <div className="min-w-0">
                                                        <p className="font-bold truncate">{player.name}</p>
                                                        <p className="text-xs opacity-60 truncate">{player.email}</p>
                                                    </div>
                                                    <CheckCircle size={18} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                                </div>
                                            </button>
                                        ))
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setMatchingProfileReg(null)}
                                    disabled={profileLinkBusy}
                                    className="w-full mt-5 py-2.5 text-gray-500 hover:text-white transition-colors font-bold text-sm disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {moveTarget && (() => {
                        const targetDiv = divisions.find((d) => d.id === moveDivId);
                        const oldFee = divFee(moveTarget.division);
                        const newFee = targetDiv ? Number(targetDiv.entry_fee || 0) : null;
                        const owesMore = !!targetDiv && playersToMove.some((reg) => newFee > oldFee && reg.payment_status === 'paid');
                        const cheaper = !!targetDiv && newFee < oldFee;
                        const isTeamMove = moveTeamTogether && playersToMove.length > 1;
                        return (
                            <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/60" onClick={() => !moveBusy && closeMoveModal()}>
                                <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                                            <ArrowRightLeft size={16} className="text-violet-300" />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-white font-bold truncate">
                                                {isTeamMove ? 'Move team' : `Move ${moveTarget.full_name}`}
                                            </h3>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                Currently in {moveTarget.division}
                                                {isTeamMove
                                                    ? ` · ${playersToMove.map((p) => p.full_name).join(' & ')}`
                                                    : moveTarget.partner_name ? ` · paired with ${moveTarget.partner_name}` : ''}
                                            </p>
                                        </div>
                                    </div>

                                    {!isTeamMove && moveTarget.partner_name && (
                                        <div className="mb-3 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                                            This is a solo move — the pairing with <span className="font-bold">{moveTarget.partner_name}</span> will be removed.
                                        </div>
                                    )}

                                    {isTeamMove && (
                                        <div className="mb-3 text-[11px] text-violet-200 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2">
                                            Both players will move together and stay paired in the new division.
                                        </div>
                                    )}

                                    <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">Move to division</label>
                                    {eligibleMoveDivisions.length === 0 ? (
                                        <p className="text-xs text-gray-500 py-3">
                                            {isTeamMove ? 'No divisions available for this team.' : 'No other divisions available for this player.'}
                                        </p>
                                    ) : (
                                        <select
                                            value={moveDivId}
                                            onChange={(e) => setMoveDivId(e.target.value)}
                                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500/50 mb-3"
                                        >
                                            <option value="">Select a division…</option>
                                            {eligibleMoveDivisions.map((d) => (
                                                <option key={d.id} value={d.id}>{d.name} — {fmtR(Number(d.entry_fee || 0))}</option>
                                            ))}
                                        </select>
                                    )}

                                    {targetDiv && (
                                        <div className={`mb-4 text-[11px] rounded-lg px-3 py-2 border ${owesMore ? 'text-amber-300 bg-amber-500/10 border-amber-500/20' : 'text-gray-400 bg-white/5 border-white/10'}`}>
                                            {owesMore
                                                ? `Higher fee (${fmtR(newFee)}). Entries with outstanding balance will be marked PENDING.`
                                                : cheaper
                                                    ? `Lower fee (${fmtR(newFee)}). Paid entries stay paid — reconcile any difference manually if needed.`
                                                    : `Same entry fee (${fmtR(newFee)}). Payment status is unchanged.`}
                                        </div>
                                    )}

                                    <div className="flex flex-col gap-2">
                                        <button onClick={moveEntries} disabled={!moveDivId || moveBusy}
                                            className="w-full py-2.5 rounded-lg text-sm font-bold bg-violet-500 text-white hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-2">
                                            {moveBusy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
                                            {isTeamMove ? 'Move team' : 'Move player'}
                                        </button>
                                        <button onClick={closeMoveModal} disabled={moveBusy}
                                            className="w-full py-2 rounded-lg text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {activeTab === 'statement' && (
                        <div className="p-6 space-y-6">
                            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                                <div>
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        <div className="w-1 h-4 bg-emerald-500 rounded-full" />
                                        Income Statement
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Every payment, refund, comp, pending entry, license fee, and commission for {event?.event_name || 'this event'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <ExportReportMenu />
                                    <button
                                        type="button"
                                        onClick={openPayoutRequestModal}
                                        disabled={requestingPayout || !payoutRequestRules.canRequest}
                                        className="inline-flex items-center justify-center gap-2 bg-padel-green text-black px-5 py-2.5 rounded-xl text-sm font-black hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {requestingPayout ? <Loader2 size={16} className="animate-spin" /> : null}
                                        Request Payout
                                        <ArrowRight size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-3">
                                {[
                                    { label: 'Total billed', value: fmtR(overviewStats.totalAmountBilled), color: 'text-padel-green' },
                                    { label: 'Entry Fees Refunded', value: `−${fmtR(overviewStats.entryFeesRefunded)}`, color: 'text-red-400' },
                                    { label: 'Outstanding', value: `−${fmtR(overviewStats.pendingAmount)}`, color: 'text-red-400' },
                                    { label: 'Final entry sales', value: fmtR(overviewStats.entryFeeBalance), color: 'text-white' },
                                    { label: 'Manual / EFT collected by 4M', value: fmtR(overviewStats.collectedManual), color: 'text-white' },
                                    { label: 'Platform Fees', value: `−${fmtR(overviewStats.commission)}`, color: 'text-red-400' },
                                    { label: 'Interim Paid', value: `−${fmtR(overviewStats.interimPaid)}`, color: 'text-red-400' },
                                    { label: 'Balance due from 4M', value: fmtR(overviewStats.dueToOrg), color: 'text-padel-green' },
                                ].map((card) => (
                                    <div key={card.label} className="bg-[#1a1a1a]/50 border border-white/10 rounded-xl p-4">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{card.label}</p>
                                        <span className={`text-lg font-black ${card.color}`}>{card.value}</span>
                                    </div>
                                ))}
                                <div className="bg-[#1a1a1a]/50 border border-white/10 rounded-xl p-4">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Early Bird · Normal</p>
                                    <div className="flex items-baseline gap-1.5 flex-wrap">
                                        <span className="text-lg font-black text-padel-green">{overviewStats.earlyBirdSignups}</span>
                                        <span className="text-sm font-bold text-gray-500">·</span>
                                        <span className="text-lg font-black text-white">{overviewStats.normalSignups}</span>
                                    </div>
                                    <p className="text-[9px] text-gray-500 mt-1">
                                        {overviewStats.hasEarlyBirdPricing ? 'Entries signed up' : 'No early-bird split detected'}
                                    </p>
                                </div>
                            </div>

                            <div className="relative max-w-md">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                                <input
                                    value={statementSearch}
                                    onChange={(e) => setStatementSearch(e.target.value)}
                                    placeholder="Search player, division, type, status..."
                                    className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:border-padel-green focus:outline-none"
                                />
                            </div>
                            {statementSearch.trim() && (
                                <p className="text-xs text-gray-500 -mt-3">
                                    Showing {filteredIncomeStatementRows.length} of {incomeStatementRows.length} transactions
                                </p>
                            )}

                            <div className="bg-[#1a1a1a]/50 border border-white/10 rounded-2xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm min-w-[720px]">
                                        <thead>
                                            <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                                                <th className="px-4 py-3">Date</th>
                                                <th className="px-4 py-3">Description</th>
                                                <th className="px-4 py-3">Type</th>
                                                <th className="px-4 py-3">Bucket</th>
                                                <th className="px-4 py-3">Player / Team</th>
                                                <th className="px-4 py-3 text-right">Amount</th>
                                                <th className="px-4 py-3">Status</th>
                                                <th className="px-4 py-3">Method</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {incomeStatementRows.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-sm">
                                                        No finance line items yet.
                                                    </td>
                                                </tr>
                                            ) : filteredIncomeStatementRows.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="px-4 py-10 text-center text-gray-500 text-sm">
                                                        No transactions match “{statementSearch.trim()}”.
                                                    </td>
                                                </tr>
                                            ) : filteredIncomeStatementRows.map((row) => {
                                                const isPendingLike = row.type === 'pending' || row.type === 'comped';
                                                const amountClass = isPendingLike
                                                    ? 'text-amber-300'
                                                    : Number(row.amount) < 0
                                                        ? 'text-red-400'
                                                        : 'text-padel-green';
                                                const typeIcon = row.type === 'payment'
                                                    ? <ArrowDownLeft size={12} className="text-padel-green" />
                                                    : row.type === 'comped'
                                                        ? <Check size={12} className="text-violet-300" />
                                                        : row.type === 'pending'
                                                            ? <Clock size={12} className="text-amber-400" />
                                                            : row.type === 'license'
                                                                ? <DollarSign size={12} className="text-sky-400" />
                                                                : <ArrowUpRight size={12} className="text-red-400" />;
                                                const statusClass = {
                                                    paid: 'bg-emerald-500/15 text-emerald-400',
                                                    success: 'bg-emerald-500/15 text-emerald-400',
                                                    pending: 'bg-amber-500/15 text-amber-400',
                                                    unpaid: 'bg-amber-500/15 text-amber-400',
                                                    processing: 'bg-amber-500/15 text-amber-400',
                                                    failed: 'bg-red-500/15 text-red-400',
                                                    cancelled: 'bg-gray-500/15 text-gray-400',
                                                    abandoned: 'bg-gray-500/15 text-gray-400',
                                                    refunded: 'bg-sky-500/15 text-sky-400',
                                                    processed: 'bg-sky-500/15 text-sky-400',
                                                    withdrawn: 'bg-gray-500/15 text-gray-400',
                                                    comped: 'bg-violet-500/15 text-violet-300',
                                                }[row.status] || 'bg-gray-500/15 text-gray-400';
                                                return (
                                                    <tr key={row.id} className="hover:bg-white/[0.02]">
                                                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                                                            {row.date
                                                                ? new Date(row.date).toLocaleString('en-GB', {
                                                                    day: 'numeric', month: 'short', year: 'numeric',
                                                                    hour: '2-digit', minute: '2-digit',
                                                                })
                                                                : '—'}
                                                        </td>
                                                        <td className="px-4 py-3 text-white font-medium">{row.description}</td>
                                                        <td className="px-4 py-3">
                                                            <span className="inline-flex items-center gap-1.5 text-xs text-gray-300 capitalize">
                                                                {typeIcon}
                                                                {row.type}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-500 text-[10px] uppercase tracking-wide whitespace-nowrap">{row.bucket || '—'}</td>
                                                        <td className="px-4 py-3 text-gray-300 text-xs max-w-[180px] truncate" title={row.player}>{row.player}</td>
                                                        <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${amountClass}`}>
                                                            {Number(row.amount) < 0 ? `−${fmtR(Math.abs(row.amount))}` : fmtR(row.amount)}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md ${statusClass}`}>
                                                                {row.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-400 text-xs">{row.method}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'activity' && (
                        <EventActivityLog eventId={event?.id} eventName={event?.event_name || ''} />
                    )}

                    {activeTab === 'draws' && (
                        <NativeDrawManager
                            event={event}
                            divisions={divisions}
                            registrations={registrations}
                            playersByEmail={playersByEmail}
                            onSaved={load}
                        />
                    )}

                    {(stats.activeCheckoutCount > 0 || stats.abandonedCheckoutCount > 0) && activeTab !== 'activity' && (
                        <div className="px-6 py-2 border-t border-white/5 text-[11px] space-y-1">
                            {stats.activeCheckoutCount > 0 && (
                                <p className="text-amber-400">
                                    {fmtR(stats.activeCheckoutTotal)} in {stats.activeCheckoutCount} active checkout{stats.activeCheckoutCount === 1 ? '' : 's'} (last hour, not yet paid).
                                </p>
                            )}
                            {stats.abandonedCheckoutCount > 0 && (
                                <p className="text-gray-500">
                                    {stats.abandonedCheckoutCount} abandoned checkout{stats.abandonedCheckoutCount === 1 ? '' : 's'} ({fmtR(stats.abandonedCheckoutTotal)} — not charged).
                                </p>
                            )}
                        </div>
                    )}
        </>
    );

    if (isInline) {
        return (
            <div className="relative flex flex-col">
                {panelContent}
            </div>
        );
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1100] flex items-center justify-center p-4"
                onClick={handleClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.97, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 20 }}
                    className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden relative"
                    onClick={(e) => e.stopPropagation()}
                >
                    {panelContent}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default ManualEventRegistrations;
