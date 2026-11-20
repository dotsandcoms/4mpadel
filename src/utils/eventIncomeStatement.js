import { findFinancePayment } from './eventFinanceReconciliation.js';
import { buildEventReceiptReport } from './eventReceiptReport.js';
import { collectionBucket } from './eventSettlement.js';
import {
    findExpectedEntryPayment, findParentEntryPayment, getRegistrationEntryFeePaid, isCompedEntryPayment, isDivisionSwitchPayment,
    isExplicitAdminMarkedPayment, isLicensePaymentRow, isLicenseRefund, isPaystackPaymentMethod, normalizePaymentMetadata,
    paymentMatchesRegistration, registrationCountsAsPaid, registrationHasPaystackEntryPayment, registrationIsCompedEntry,
    resolveRegistrationPayer, resolveRegistrationPaymentMethod,
} from './paymentRegistrationMatch.js';
import { ENTRY_COMMISSION_RATE, registrationFinanceAmounts } from './registrationFinance.js';

const successPaymentsOnly = payments => payments.filter(payment => payment.status === 'success');

const PAYMENT_METHOD_LABELS = {
    paystack: 'Paystack',
    manual: 'Manual',
    eft: 'EFT',
    external: 'External payment',
    cash: 'Cash',
    system: 'System',
};

export const labelPaymentMethod = (method) => {
    if (!method) return '';
    const key = String(method).toLowerCase();
    return PAYMENT_METHOD_LABELS[key] || method;
};

export function resolveEventIncomePayer(registrations, reg, payment) {
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
}

export function formatEventIncomePaymentStatus(registration, payment, registrations) {
    if (registration.payment_status !== 'paid') return registration.payment_status || 'pending';

    const { isPartnerPaid, payerName } = resolveEventIncomePayer(registrations, registration, payment);
    if (isPartnerPaid) return `Paid by Partner ${payerName || registration.registered_by}`;
    return 'Paid';
}

export function getEventIncomePaymentDetails(reg, { registrations, payments, refunds, refundByReg }) {
    if (!registrationCountsAsPaid(reg, refundByReg, payments)) return null;

    let payment = findFinancePayment(payments, reg, refunds) || findExpectedEntryPayment(payments, reg);
    // Never surface LIC-* split ledger rows as the entry payment (wrong Manual note).
    if (payment && isLicensePaymentRow(payment)) {
        payment = findParentEntryPayment(payments, payment) || payment;
    }
    const { isPartnerPaid, payerName } = resolveEventIncomePayer(registrations, reg, payment);
    const method = resolveRegistrationPaymentMethod(reg, payment) || (isPartnerPaid ? 'partner' : 'paystack');
    const isExpectedPayment = payment?.status === 'pending' && normalizePaymentMetadata(payment.metadata).payment_expected === true;
    const rawNote = (isExpectedPayment && normalizePaymentMetadata(payment.metadata).payment_expected_note)
        || payment?.metadata?.note || payment?.metadata?.payment_note || null;
    const note = (rawNote && /license portion split/i.test(String(rawNote)))
        ? null
        : rawNote;
    const isExplicitAdminMark = isExplicitAdminMarkedPayment(payment);
    const isCompedChannel = isCompedEntryPayment(payment) || registrationIsCompedEntry(reg, payments);
    const isPaystackChannel = !isCompedChannel && !isExplicitAdminMark && (
        registrationHasPaystackEntryPayment(reg, successPaymentsOnly(payments))
        || (payment && isPaystackPaymentMethod(payment.payment_method) && !isLicensePaymentRow(payment))
    );
    const isManualChannel = !isPartnerPaid && !isPaystackChannel && !isCompedChannel;

    return {
        isPartnerPaid,
        isExpectedPayment,
        payerName,
        method,
        note,
        isExplicitAdminMark,
        isCompedChannel,
        isManualChannel,
        payment,
    };
}

export function buildEventIncomeLines({ event, registrations, payments, refunds, reportStats }) {
    const rows = [];
    const usedPaymentIds = new Set();
    const teamLabel = (r) => [r.full_name, r.partner_name].filter(Boolean).join(' / ') || r.email || '—';
    reportStats.receiptRows.forEach(payment => {
        payment.paymentIds.forEach(id => usedPaymentIds.add(id));
        const matched = registrations.filter(r => payment.claims.some(p => (!isDivisionSwitchPayment(p) && p.metadata?.registration_id === r.id)
            || paymentMatchesRegistration(p, r)));
        rows.push({ id: `entry-${payment.reference}`, date: payment.created_at,
            description: `${matched.map(r => r.division).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'Unallocated entry'} — Entry Fee`,
            category: 'Entry payment', bucket: collectionBucket(payment), type: 'payment',
            player: matched.map(teamLabel).join('; ') || payment.metadata?.paid_by_name || payment.metadata?.email || 'Unallocated entry',
            email: matched.map(r => r.email).join('; '), division: matched.map(r => r.division).join('; '),
            amount: payment.amount, status: 'success', method: labelPaymentMethod(payment.payment_method),
            paymentId: payment.id, registrationId: matched.length === 1 ? matched[0].id : null,
            reference: payment.reference || '', note: payment.metadata?.note || payment.metadata?.payment_note || '' });
    });
    reportStats.allocations.forEach(allocation => {
        const r = allocation.registration;
        if (!allocation.comped && allocation.outstanding <= 0) return;
        rows.push({ id: `uncollected-${r.id}`, date: r.created_at, registrationId: r.id,
            description: `${r.division} — ${allocation.comped ? 'Comped Entry' : 'Outstanding entry fee'}`,
            category: allocation.comped ? 'Comped entry' : 'Pending / unpaid', bucket: allocation.comped ? 'Informational' : 'Outstanding',
            type: allocation.comped ? 'comped' : 'pending', player: teamLabel(r), email: r.email,
            division: r.division, amount: allocation.outstanding || 0, status: allocation.comped ? 'comped' : 'pending',
            method: allocation.comped ? 'Comped' : '—', reference: '', note: '' });
    });
    [...reportStats.processedRefundRows, ...reportStats.reservedRefundRows].forEach(rf => {
        const reg = registrations.find(r => r.id === rf.event_registration_id);
        const processed = rf.status === 'processed';
        rows.push({ id: `refund-${rf.id}`, date: rf.processed_at || rf.created_at,
            description: processed ? 'Entry Fee Refund' : 'Entry refund reserved',
            category: processed ? 'Entry refund' : 'Refund reserve',
            bucket: processed ? collectionBucket(rf.receipt) : 'Refund reserve', type: 'refund',
            player: reg ? teamLabel(reg) : '—', email: reg?.email || '', division: reg?.division || '', registrationId: reg?.id,
            amount: -Math.abs(rf.amount), status: rf.status, method: labelPaymentMethod(rf.receipt.payment_method),
            reference: rf.paystack_refund_id || rf.provider_refund_id || '', note: '' });
    });
    refunds.filter(rf => isLicenseRefund(rf, payments.find(p => p.id === rf.payment_id))).forEach(rf => {
        rows.push({ id: `refund-${rf.id}`, date: rf.processed_at || rf.created_at, description: 'License Refund',
            category: 'License refund', bucket: '4M retained', type: 'refund', player: '—', email: '', division: '',
            amount: -Math.abs(Number(rf.amount || 0)), status: rf.status, method: 'License reversal',
            reference: rf.paystack_refund_id || '', note: rf.failure_reason || '' });
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

    const currentEntryAdjustment = Math.round((reportStats.grossEntryFees - reportStats.cashHistory.grossEntryFees
        + reportStats.cashHistory.entryFeesRefunded + reportStats.cashHistory.refundReserve) * 100) / 100;
    for (const [id, category, amount, note] of [
        ['current-entry-adjustment', 'Current entry allocation adjustment', currentEntryAdjustment, 'Exclude cash not allocated to current registrations.'],
        ['unconfirmed-recipient', 'Recipient unconfirmed held', -reportStats.unconfirmedCollected, 'Excluded from the transfer until the recipient is confirmed.'],
        ['refund-funding', 'Refund funding adjustment', reportStats.refundFundingAdjustment, 'Refund paid by a different funds holder.'],
    ]) {
        if (!amount) continue;
        rows.push({ id, date: null, description: category, category, bucket: 'Settlement adjustment',
            type: 'adjustment', player: '—', email: '', division: '', amount, status: 'processed',
            method: '—', reference: '', note });
    }

    if (reportStats.commission > 0) {
        rows.push({
            id: 'platform-fee',
            date: null,
            description: `Platform Fee (${Math.round(ENTRY_COMMISSION_RATE * 100)}% of entry fees received by 4M)`,
            category: 'Platform / commission fee',
            bucket: '4M retained',
            type: 'fee',
            player: '—',
            email: '',
            division: '',
            amount: -reportStats.commission,
            status: 'processed',
            method: '—',
            reference: '',
            note: '5% of current-entry funds allocated to 4M. Direct club / organiser payments earn no commission.',
        });
    }

    if (reportStats.organiserRetained !== 0) rows.push({
        id: 'organiser-receipts-retained', date: null,
        description: 'Entry fees already retained by organiser', category: 'Direct organiser receipts retained',
        bucket: 'Organiser retained', type: 'organiser_receipts', player: event?.organiser_name || 'Organiser',
        email: '', division: '', amount: -reportStats.organiserRetained, status: 'processed',
        method: 'Direct collection', reference: '',
        note: 'Current-entry funds already held by the organiser; excluded from the transfer due from 4M.',
    });
    reportStats.payoutRows.forEach((p) => {
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
}

export function buildEventIncomeWorkbookPayload({
    event, registrations, divisions, payments, refunds, reportStats, normalizedReportType, uniquePlayers,
    formatLicenseForExport, formatPaymentStatusForExport, getPaymentDetails, divFee, refundByReg,
}) {
    const fmtR = value => `R ${Number(value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const findPaymentForReg = reg => findFinancePayment(payments, reg, refunds);
    const eventDate = event?.start_date
        ? new Date(event.start_date).toLocaleDateString('en-ZA', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        })
        : '';
    const billedCompositionRows = reportStats.billedTierBreakdown.map((tier, index) => {
        const label = index === 0 && reportStats.billedTierBreakdown.length > 1
            ? 'Early bird'
            : 'Regular';
        return {
            section: 'Current entry fees',
            label: `${label} (${tier.count} × ${fmtR(tier.rate)})`,
            value: tier.total,
            money: true,
        };
    });

    const history = reportStats.cashHistory;
    const summary = [
        { section: 'Reconciliation', label: 'Status', value: reportStats.issues.length ? 'Needs review' : 'Reconciled', note: reportStats.issues.join('; ') },
        { section: 'Entries', label: 'Unique players', value: uniquePlayers },
        { section: 'Entries', label: 'Paid', value: reportStats.paid4M + reportStats.paidClub },
        { section: 'Entries', label: 'Pending / unpaid', value: reportStats.pendingCount },
        { section: 'Entries', label: 'Comped (free)', value: reportStats.compedEntries },
        { section: 'Entries', label: 'Withdrawn', value: reportStats.withdrawnCount },
        ...billedCompositionRows,
        { section: 'Cash history', label: 'Entry receipts (all registrations)', value: history.grossEntryFees, money: true },
        { section: 'Cash history', label: 'Entry fees received by 4M', value: history.collected4M, money: true },
        { section: 'Cash history', label: 'Entry fees received directly by organiser', value: history.collectedOrganiser, money: true },
        { section: 'Cash history', label: 'Collection recipient unconfirmed', value: history.unconfirmedCollected, money: true },
        { section: 'Cash history', label: 'Completed entry refunds', value: history.entryFeesRefunded, money: true },
        { section: 'Cash history', label: 'Pending entry refunds', value: history.refundReserve, money: true, note: 'Already excluded from current-entry paid amounts.' },
        { section: 'Cash history', label: '4M cash not allocated to current entries', value: reportStats.unallocatedCash4M, money: true, note: 'Excluded from the current-entry fee and payout.' },
        { section: 'Cash history', label: 'Of which identified unused credits', value: reportStats.unallocatedCredit4M, money: true },
        { section: 'Cash history', label: 'Historical receipts needing review', value: history.issues.length, note: history.issues.join('; ') },
        ...(normalizedReportType === 'full' ? [
            { section: 'Retained by 4M', label: 'License revenue', value: reportStats.licenseRevenue4M, money: true },
            { section: 'Retained by 4M', label: 'License refunds', value: reportStats.licenseRefunds, money: true },
        ] : []),
    ];

    const allocationById = new Map(reportStats.allocations.map(a => [a.registration.id, a]));
    const registrationRows = registrations.map((r) => {
        const allocation = allocationById.get(r.id);
        const details = getPaymentDetails(r);
        let channel = '';
        if (details) {
            if (details.isExpectedPayment) channel = 'Payment due to 4M';
            else if (details.isPartnerPaid) channel = `Partner (${details.payerName || 'partner'})`;
            else if (details.isCompedChannel) channel = 'Comped';
            else if (details.isManualChannel) channel = `Manual (${labelPaymentMethod(details.method) || 'Admin'})`;
            else channel = labelPaymentMethod(details.method) || 'Paystack';
        }
        const paystackPay = findFinancePayment(successPaymentsOnly(payments), r, refunds);
        const payment = paystackPay || findPaymentForReg(r);
        const isComped = registrationIsCompedEntry(r, payments);
        const paid = registrationCountsAsPaid(r, refundByReg, payments);
        let entryAmount = 0;
        if (isComped) entryAmount = 0;
        else if (paystackPay) entryAmount = getRegistrationEntryFeePaid(paystackPay, r, 0);
        else if (paid) entryAmount = getRegistrationEntryFeePaid(payment, r, divFee(r));
        else entryAmount = r.status === 'withdrawn' ? 0 : divFee(r);

        return {
            registrationId: r.id,
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
            ...(allocation ? registrationFinanceAmounts(allocation) : { entryAmount }),
            collectionRecipient: allocation?.holder === 'club' ? normalizePaymentMetadata(allocation.payment?.metadata).collection_recipient_name || 'Club / organiser'
                : allocation?.holder === '4m' ? '4M' : details?.isExpectedPayment ? '4M (payment due)' : allocation?.holder === 'unconfirmed' ? 'Recipient unconfirmed' : '',
            comped: isComped,
            registrationStatus: r.status || '',
            registeredAt: r.created_at,
            note: details?.note || '',
        };
    });

    return {
        eventName: event?.event_name || 'Event',
        eventDate,
        summary,
        interimPaid: reportStats.interimPaid,
        refundFundingAdjustment: reportStats.refundFundingAdjustment,
        lineItems: buildEventIncomeLines({ event, registrations, payments, refunds, reportStats }),
        registrations: registrationRows,
        activeRegistrationIds: reportStats.allocations.map(a => a.registration.id),
        receiptReport: buildEventReceiptReport({ registrations, divisions, refunds, settlement: reportStats }),
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
    };
}
