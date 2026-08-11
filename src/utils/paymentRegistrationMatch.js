const norm = (value) => String(value || '').toLowerCase().trim();

/** Parse payment.metadata when it arrives as a JSON string (exports / edge cases). */
export function normalizePaymentMetadata(metadata) {
    if (!metadata) return {};
    if (typeof metadata === 'string') {
        try {
            const parsed = JSON.parse(metadata);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    if (typeof metadata === 'object') return metadata;
    return {};
}

export function isLicensePaymentRow(payment) {
    if (!payment) return false;
    const type = String(payment.payment_type || '').toLowerCase();
    if (type.includes('license') || type === 'membership') return true;
    if (String(payment.reference || '').startsWith('LIC-')) return true;
    const meta = normalizePaymentMetadata(payment.metadata);
    const covers = meta.covers;
    return Array.isArray(covers) && covers.length > 0 && covers.every((c) => c.type === 'license');
}

/**
 * True when a refund is for a SAPA license (temp/full) or membership — not an entry fee.
 * Licenses stay with 4M; organiser settlement must exclude these amounts.
 */
export function isLicenseRefund(refund, payment = null) {
    if (!refund) return false;
    const cover = String(refund.metadata?.cover_type || '').toLowerCase();
    if (cover === 'license') return true;
    if (cover === 'entry') return false;
    if (payment && isLicensePaymentRow(payment)) return true;
    const type = String(payment?.payment_type || '').toLowerCase();
    return type.includes('license') || type === 'membership';
}

/** Non-failed refund that reduces the organiser entry-fee pot. */
export function isEntryFeeRefund(refund, payment = null) {
    if (!refund || refund.status === 'failed') return false;
    return !isLicenseRefund(refund, payment);
}

export function getPaymentMetadataLayers(metadata = {}) {
    const top = normalizePaymentMetadata(metadata);
    const inner = normalizePaymentMetadata(top.original_trx?.metadata);
    return { top, inner };
}

export function paymentEntryCoversFor(metadata = {}) {
    const { top, inner } = getPaymentMetadataLayers(metadata);
    return [...(top.covers || []), ...(inner.covers || [])];
}

export function paymentEmailsFor(metadata = {}) {
    const { top, inner } = getPaymentMetadataLayers(metadata);
    const emails = new Set();

    const add = (value) => {
        const email = norm(value);
        if (email) emails.add(email);
    };

    add(top.email);
    add(top.registrant_email);
    add(inner.registrant_email);
    add(metadata.original_trx?.user);

    paymentEntryCoversFor(metadata).forEach((cover) => add(cover.email));

    [...(top.registration_rows || []), ...(inner.registration_rows || [])].forEach((row) => {
        add(row.email);
    });

    return emails;
}

const namesMatch = (a, b) => {
    const left = String(a || '').trim().toLowerCase();
    const right = String(b || '').trim().toLowerCase();
    if (!left || !right) return false;
    return left === right || left.startsWith(right) || right.startsWith(left);
};

const paymentRegistrationRows = (meta = {}) => {
    const { top, inner } = getPaymentMetadataLayers(meta);
    return [...(top.registration_rows || []), ...(inner.registration_rows || [])];
};

/**
 * True when an entry cover is for this registration even if the live email
 * changed after checkout (typo correction / 4M profile link). Uses the
 * payment's registration_rows snapshot (name + division) as an alias for the
 * cover email — never treats an uncovered partner booking as paid.
 */
export function entryCoverMatchesRegistration(cover, reg, meta = {}) {
    if (!cover || cover.type !== 'entry' || !reg) return false;
    const email = norm(reg.email);
    const division = reg.division || reg.class_name;
    if (!email) return false;
    if (cover.division && division && cover.division !== division) return false;

    if (norm(cover.email) === email) return true;

    // Cover email is stale (e.g. ridhaa@.clm) but snapshot names this player.
    const snap = paymentRegistrationRows(meta).find(
        (row) => norm(row?.email) === norm(cover.email)
            && (!cover.division || !row.division || row.division === cover.division),
    );
    if (!snap) return false;
    if (division && snap.division && snap.division !== division) return false;
    return namesMatch(snap.full_name, reg.full_name);
}

export function paymentMatchesRegistration(payment, reg) {
    if (!payment || payment.status !== 'success') return false;
    // License ledger splits (LIC-* from bundled checkout) must never stand in
    // for an entry-fee payment — they only cover SAPA license and carry the
    // "License portion split from REGEV-…" note that was leaking into Manual.
    if (isLicensePaymentRow(payment)) return false;

    const meta = normalizePaymentMetadata(payment.metadata);
    const email = norm(reg.email);
    const division = reg.division || reg.class_name;

    if (!email) return false;

    if (meta.registration_id === reg.id) return true;

    if (
        (meta.source === 'manual_event_admin' || meta.source === 'admin_add_player')
        && norm(meta.email) === email
        && (!meta.division || !division || meta.division === division)
    ) {
        return true;
    }

    const allCovers = paymentEntryCoversFor(meta);
    const entryCovers = allCovers.filter((cover) => cover.type === 'entry');
    const covered = entryCovers.some((cover) => entryCoverMatchesRegistration(cover, reg, meta));
    if (covered) return true;

    // When covers[] list who was paid for, do not treat registration_rows partners
    // (booked but not covered by this payment) as matches.
    if (entryCovers.length > 0) return false;

    if (!paymentEmailsFor(meta).has(email)) return false;

    const coversForEmail = allCovers.filter((cover) => norm(cover.email) === email);
    if (coversForEmail.length === 0) return true;

    return coversForEmail.some((cover) => !cover.division || !division || cover.division === division);
}

/**
 * True when payment has an entry cover for this player.
 * @param {{ requireDivision?: boolean }} [opts] - when false, still match after an
 *   admin division move (cover keeps the original division name).
 */
export function paymentHasEntryCoverForRegistration(payment, reg, opts = {}) {
    const { requireDivision = true } = opts;
    if (!payment || payment.status !== 'success' || isLicensePaymentRow(payment)) return false;

    const meta = normalizePaymentMetadata(payment.metadata);
    const email = norm(reg.email);
    const division = reg.division || reg.class_name;
    if (!email) return false;
    if (meta.registration_id === reg.id) return true;

    return paymentEntryCoversFor(meta).some((cover) => {
        if (cover.type !== 'entry') return false;
        if (requireDivision) {
            if (!division) return false;
            return entryCoverMatchesRegistration(cover, reg, meta) && cover.division === division;
        }
        if (norm(cover.email) === email) return true;
        const snap = paymentRegistrationRows(meta).find(
            (row) => norm(row?.email) === norm(cover.email),
        );
        return !!(snap && namesMatch(snap.full_name, reg.full_name));
    });
}

/** Entry fee payment that explicitly covers this registration row (email + division). */
export function paymentStrictlyCoversRegistration(payment, reg) {
    return paymentHasEntryCoverForRegistration(payment, reg, { requireDivision: true });
}

const isLicenseLineItem = (item) => {
    const label = String(item?.label || item?.type || '').toLowerCase();
    return label.includes('license') || label.includes('sapa') || label === 'temp_license' || label === 'full_license';
};

/**
 * Entry-fee amount actually paid for this registration (early-bird snapshot, line
 * items, or payment share) — not the live division fee after price changes.
 *
 * Priority: named line item → division_entry_fees snapshot → payment.amount share.
 * Live `fallbackFee` is only used when the payment has no usable recorded amount.
 */
export function getRegistrationEntryFeePaid(payment, reg, fallbackFee = 0) {
    const fallback = Number(fallbackFee) || 0;
    if (!reg) return fallback;
    if (!payment || String(payment.status || '').toLowerCase() !== 'success') return fallback;

    const meta = normalizePaymentMetadata(payment.metadata);
    const paymentWithMeta = { ...payment, metadata: meta };

    if (isCompedEntryPayment(paymentWithMeta)) return 0;
    if (isLicensePaymentRow(paymentWithMeta)) return fallback;

    const email = norm(reg.email);
    const division = reg.division || reg.class_name || '';
    const fullName = String(reg.full_name || '').trim().toLowerCase();
    const entryCovers = paymentEntryCoversFor(meta).filter((cover) => cover.type === 'entry');
    const paymentAmount = Number(payment.amount || 0);

    if (Array.isArray(meta.line_items) && meta.line_items.length > 0) {
        const entryItems = meta.line_items.filter((item) => !isLicenseLineItem(item));
        const nameMatch = entryItems.find((item) => {
            const label = String(item.label || '');
            const namePart = label.split('—')[0].split(' - ')[0].trim().toLowerCase();
            if (!fullName || !namePart) return false;
            if (!(fullName === namePart || fullName.startsWith(namePart) || namePart.startsWith(fullName))) {
                return false;
            }
            return !division || label.includes(division);
        });
        if (nameMatch?.amount != null) return Number(nameMatch.amount) || 0;

        if (entryItems.length === 1 && entryItems[0].amount != null) {
            const coversSelf = meta.registration_id === reg.id
                || entryCovers.some((c) => norm(c.email) === email);
            if (coversSelf || entryCovers.length <= 1) {
                return Number(entryItems[0].amount) || 0;
            }
        }

        // Team checkout: match this player's share from entry line items by cover count
        if (entryItems.length > 1 && email) {
            const coverIndex = entryCovers.findIndex((c) => norm(c.email) === email
                && (!division || !c.division || c.division === division));
            if (coverIndex >= 0 && entryItems[coverIndex]?.amount != null) {
                return Number(entryItems[coverIndex].amount) || 0;
            }
        }
    }

    if (division && meta.division_entry_fees) {
        const snapped = meta.division_entry_fees[division];
        if (snapped != null && snapped !== '') return Number(snapped) || 0;
    }

    // Recorded gateway amount beats the live division fee (early bird vs current price).
    if (paymentAmount > 0) {
        if (entryCovers.length > 1) return paymentAmount / entryCovers.length;
        return paymentAmount;
    }

    return fallback;
}

/**
 * Bundled checkout: LIC-* row for this email → parent REGEV-* entry payment
 * (e.g. Ali Carrim / REGEV-463-… where the UI previously bound the license split).
 */
export function findPaystackEntryViaLicenseSplit(payments, reg) {
    const email = norm(reg?.email);
    if (!email) return null;

    const licenseRows = (payments || []).filter((payment) => {
        if (payment.status !== 'success' || !isLicensePaymentRow(payment)) return false;
        const meta = normalizePaymentMetadata(payment.metadata);
        return paymentEntryCoversFor(meta).some(
            (cover) => cover.type === 'license' && norm(cover.email) === email,
        );
    });

    for (const lic of licenseRows) {
        const parent = findParentEntryPayment(payments, lic);
        if (!parent || !isPaystackPaymentMethod(parent.payment_method)) continue;
        // Parent REGEV is the real entry payment even if division was later changed.
        if (
            paymentHasEntryCoverForRegistration(parent, reg, { requireDivision: false })
            || paymentMatchesRegistration(parent, reg)
        ) {
            return parent;
        }
        // License was for this player on this checkout — trust parent REGEV when
        // it still lists them on registration_rows / registrant.
        const meta = normalizePaymentMetadata(parent.metadata);
        const named = paymentRegistrationRows(meta).some(
            (row) => norm(row?.email) === email || namesMatch(row?.full_name, reg.full_name),
        );
        if (named || norm(meta.registrant_email) === email) return parent;
    }
    return null;
}

export function findStrictPaystackEntryPayment(payments, reg) {
    const email = norm(reg?.email);
    const scorePayment = (payment) => {
        const meta = normalizePaymentMetadata(payment.metadata);
        let score = 0;
        if (meta.registration_id === reg.id) score += 100;
        if (paymentHasEntryCoverForRegistration(payment, reg, { requireDivision: true })) score += 50;
        if (meta.source === 'paystack_sync') score += 10;
        if (paymentEmailsFor(meta).has(email)) score += 1;
        score += new Date(payment.created_at || 0).getTime() / 1e15;
        return score;
    };

    const paystackEntries = (payments || []).filter(
        (payment) => payment.status === 'success'
            && isPaystackPaymentMethod(payment.payment_method)
            && !isLicensePaymentRow(payment),
    );

    const exact = paystackEntries.filter((payment) => paymentStrictlyCoversRegistration(payment, reg));
    if (exact.length > 0) {
        return [...exact].sort((a, b) => scorePayment(b) - scorePayment(a))[0];
    }

    // Same player, entry cover email match after an admin division move.
    const moved = paystackEntries.filter((payment) => (
        paymentHasEntryCoverForRegistration(payment, reg, { requireDivision: false })
    ));
    if (moved.length > 0) {
        return [...moved].sort((a, b) => scorePayment(b) - scorePayment(a))[0];
    }

    return findPaystackEntryViaLicenseSplit(payments, reg);
}

export function findAdminMarkedPayment(payments, reg) {
    return (payments || []).find(
        (payment) => payment.status === 'success'
            && isExplicitAdminMarkedPayment(payment)
            && paymentMatchesRegistration(payment, reg),
    ) || null;
}

export function registrationHasPaystackEntryPayment(reg, payments) {
    return !!findStrictPaystackEntryPayment(payments, reg);
}

/**
 * When a bundled checkout was split, prefer the parent REGEV entry row over any
 * LIC-* sibling so status/notes reflect the entry fee payment.
 */
export function findParentEntryPayment(payments, licensePayment) {
    if (!licensePayment || !isLicensePaymentRow(licensePayment)) return null;
    const meta = normalizePaymentMetadata(licensePayment.metadata);
    const parentRef = String(meta.parent_reference || '').trim();
    if (!parentRef) return null;
    return (payments || []).find(
        (p) => p.status === 'success'
            && !isLicensePaymentRow(p)
            && String(p.reference || '') === parentRef,
    ) || null;
}

export function findPaymentForRegistration(payments, reg) {
    const strict = findStrictPaystackEntryPayment(payments, reg);
    if (strict) return strict;

    const admin = findAdminMarkedPayment(payments, reg);
    if (admin) return admin;

    const email = norm(reg?.email);
    const matches = (payments || []).filter(
        (payment) => !isLicensePaymentRow(payment) && paymentMatchesRegistration(payment, reg),
    );
    if (matches.length === 0) return null;

    const scorePayment = (payment) => {
        const meta = normalizePaymentMetadata(payment.metadata);
        let score = 0;
        if (meta.registration_id === reg.id) score += 100;
        if (paymentEntryCoversFor(meta).some(
            (cover) => cover.type === 'entry'
                && norm(cover.email) === email
                && cover.division === reg.division,
        )) {
            score += 50;
        }
        if (isPaystackPaymentMethod(payment.payment_method)) score += 10;
        if (meta.source === 'paystack_sync') score += 5;
        if (paymentEmailsFor(meta).has(email)) score += 1;
        score += new Date(payment.created_at || 0).getTime() / 1e15;
        return score;
    };

    return [...matches].sort((a, b) => scorePayment(b) - scorePayment(a))[0];
}

export function resolveRegistrationPaymentMethod(reg, payment) {
    if (payment && isPaystackPaymentMethod(payment.payment_method)) return payment.payment_method;
    if (payment && isExplicitAdminMarkedPayment(payment)) {
        return payment.payment_method || reg?.payment_method || 'manual';
    }
    return reg?.payment_method || payment?.payment_method || null;
}

export function isPaystackPaymentMethod(method) {
    return norm(method) === 'paystack';
}

export function isManualPaymentMethod(method) {
    const key = norm(method);
    return key === 'manual' || key === 'cash';
}

export function isExplicitAdminMarkedPayment(payment) {
    if (!payment) return false;
    const meta = normalizePaymentMetadata(payment.metadata);
    return !!(
        meta.marked_by_admin
        || meta.source === 'manual_event_admin'
        || meta.source === 'admin_add_player'
        || String(payment.reference || '').startsWith('MANUAL-ADMIN-')
    );
}

/** Complimentary / free admin entry — R0 and excluded from settlement balances. */
export function isCompedEntryPayment(payment) {
    if (!payment) return false;
    const meta = normalizePaymentMetadata(payment.metadata);
    if (meta.free_entry || meta.comp_entry || meta.source === 'admin_add_player') return true;
    return String(payment.reference || '').startsWith('MANUAL-ADMIN-COMP-');
}

export function registrationIsCompedEntry(reg, payments) {
    if (!reg) return false;
    const payment = findPaymentForRegistration(
        (payments || []).filter((p) => p.status === 'success'),
        reg,
    );
    return isCompedEntryPayment(payment);
}

/**
 * The email of the person who actually MADE a payment, checked across every
 * metadata layer Paystack/sync flows use. Returns null when unknown.
 */
export function paymentPayerEmailFor(payment) {
    const meta = normalizePaymentMetadata(payment?.metadata);
    const { top, inner } = getPaymentMetadataLayers(meta);
    return norm(
        top.registrant_email || inner.registrant_email
        || top.paid_by_email || inner.paid_by_email
        || meta.original_trx?.user
        || top.email || inner.email
    ) || null;
}

/**
 * True when a payment's covers[] explicitly include this email.
 * NOTE: registration_rows is deliberately NOT consulted — it is a snapshot of
 * the team booking (both players), not of what this payment actually paid for.
 */
export function paymentExplicitlyCoversEmail(payment, email) {
    const meta = normalizePaymentMetadata(payment?.metadata);
    const target = norm(email);
    if (!target) return false;
    return paymentEntryCoversFor(meta).some((c) => norm(c?.email) === target);
}

/**
 * Who actually paid for this registration.
 *
 * Partner-paid is ONLY concluded when the matched payment names a payer other
 * than the registrant AND that payment explicitly covers the registrant
 * (covers[] / registration_rows / registration_id).
 *
 * IMPORTANT: `registered_by` is who CREATED the team booking, not who paid --
 * one player books the pair and each pays separately all the time, so it must
 * never be used as a payment signal. Unknown payer defaults to self-paid.
 */
export function resolveRegistrationPayer(payment, reg) {
    if (!payment || !reg) return { isPartnerPaid: false, payerEmail: null };
    // Admin marked-as-paid rows record the covered player, not a payer
    if (isExplicitAdminMarkedPayment(payment)) return { isPartnerPaid: false, payerEmail: null };

    const selfEmail = norm(reg.email);
    const payerEmail = paymentPayerEmailFor(payment);
    if (!selfEmail || !payerEmail || payerEmail === selfEmail) {
        return { isPartnerPaid: false, payerEmail: payerEmail || null };
    }

    const meta = normalizePaymentMetadata(payment.metadata);
    const explicitlyCovers = meta.registration_id === reg.id
        || paymentStrictlyCoversRegistration(payment, reg)
        || paymentExplicitlyCoversEmail(payment, selfEmail);
    if (!explicitlyCovers) {
        // A differently-owned payment that doesn't explicitly cover this player
        // is a matching artefact -- never report it as partner-paid.
        return { isPartnerPaid: false, payerEmail: null };
    }

    return { isPartnerPaid: true, payerEmail };
}

const parseRefundMeta = (raw) => {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
};

/** Latest processed entry-fee refund timestamp for a registration, if any. */
export function getLatestProcessedEntryRefundAt(regId, refundByRegMap) {
    if (!regId || !refundByRegMap) return null;
    const entry = refundByRegMap.get(regId);
    if (!entry?.rows?.length) return null;

    let latest = null;
    for (const row of entry.rows) {
        if (String(row.status || '').toLowerCase() !== 'processed') continue;
        const meta = parseRefundMeta(row.metadata);
        if (meta.cover_type && meta.cover_type !== 'entry') continue;
        const ts = row.processed_at || row.created_at;
        if (!ts) continue;
        if (!latest || new Date(ts).getTime() > new Date(latest).getTime()) {
            latest = ts;
        }
    }
    return latest;
}

/**
 * True when a registration has a processed entry refund that is NOT superseded
 * by a later successful entry payment (e.g. withdraw → re-pay on same row).
 */
export function hasBlockingProcessedRefund(reg, refundByRegMap, payments = null) {
    if (!reg?.id || !refundByRegMap) return false;
    const latestRefundAt = getLatestProcessedEntryRefundAt(reg.id, refundByRegMap);
    if (!latestRefundAt) return false;

    const refundMs = new Date(latestRefundAt).getTime();
    const successPayments = (payments || []).filter((p) => String(p.status || '').toLowerCase() === 'success');

    const laterEntryPayment = successPayments.find((payment) => {
        if (isLicensePaymentRow(payment)) return false;
        if (!paymentMatchesRegistration(payment, reg)) return false;
        const paidAt = new Date(payment.created_at || 0).getTime();
        return paidAt > refundMs;
    });

    return !laterEntryPayment;
}

/**
 * Active entry counts as paid when payment_status is paid and any prior
 * withdrawal refund has been superseded by a later successful payment.
 */
export function registrationCountsAsPaid(reg, refundByRegMap = null, payments = null) {
    if (!reg) return false;
    if (String(reg.status || '').toLowerCase() === 'withdrawn') return false;
    const paymentStatus = String(reg.payment_status || 'pending').toLowerCase();
    if (paymentStatus !== 'paid') return false;
    if (hasBlockingProcessedRefund(reg, refundByRegMap, payments)) return false;
    return true;
}
