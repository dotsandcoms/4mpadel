const norm = (value) => String(value || '').toLowerCase().trim();

export function isLicensePaymentRow(payment) {
    if (!payment) return false;
    const type = String(payment.payment_type || '').toLowerCase();
    if (type.includes('license') || type === 'membership') return true;
    if (String(payment.reference || '').startsWith('LIC-')) return true;
    const covers = payment.metadata?.covers;
    return Array.isArray(covers) && covers.length > 0 && covers.every((c) => c.type === 'license');
}

export function getPaymentMetadataLayers(metadata = {}) {
    const inner = metadata.original_trx?.metadata || {};
    return { top: metadata, inner };
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

export function paymentMatchesRegistration(payment, reg) {
    if (!payment || payment.status !== 'success') return false;

    const meta = payment.metadata || {};
    const email = norm(reg.email);
    const division = reg.division || reg.class_name;

    if (!email) return false;

    if (meta.registration_id === reg.id) return true;

    if (
        meta.source === 'manual_event_admin'
        && norm(meta.email) === email
        && (!meta.division || !division || meta.division === division)
    ) {
        return true;
    }

    const covered = paymentEntryCoversFor(meta).some(
        (cover) => cover.type === 'entry'
            && norm(cover.email) === email
            && (!cover.division || !division || cover.division === division),
    );
    if (covered) return true;

    if (!paymentEmailsFor(meta).has(email)) return false;

    const covers = paymentEntryCoversFor(meta).filter((cover) => norm(cover.email) === email);
    if (covers.length === 0) return true;

    return covers.some((cover) => !cover.division || !division || cover.division === division);
}

/** Entry fee payment that explicitly covers this registration row (email + division). */
export function paymentStrictlyCoversRegistration(payment, reg) {
    if (!payment || payment.status !== 'success') return false;

    const meta = payment.metadata || {};
    const email = norm(reg.email);
    const division = reg.division || reg.class_name;

    if (!email || !division) return false;
    if (meta.registration_id === reg.id) return true;

    return paymentEntryCoversFor(meta).some(
        (cover) => cover.type === 'entry'
            && norm(cover.email) === email
            && cover.division === division,
    );
}

export function findStrictPaystackEntryPayment(payments, reg) {
    const email = norm(reg?.email);
    const matches = (payments || []).filter(
        (payment) => payment.status === 'success'
            && isPaystackPaymentMethod(payment.payment_method)
            && !isLicensePaymentRow(payment)
            && paymentStrictlyCoversRegistration(payment, reg),
    );
    if (matches.length === 0) return null;

    const scorePayment = (payment) => {
        const meta = payment.metadata || {};
        let score = 0;
        if (meta.registration_id === reg.id) score += 100;
        if (meta.source === 'paystack_sync') score += 10;
        if (paymentEmailsFor(meta).has(email)) score += 1;
        score += new Date(payment.created_at || 0).getTime() / 1e15;
        return score;
    };

    return [...matches].sort((a, b) => scorePayment(b) - scorePayment(a))[0];
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

export function findPaymentForRegistration(payments, reg) {
    const strict = findStrictPaystackEntryPayment(payments, reg);
    if (strict) return strict;

    const admin = findAdminMarkedPayment(payments, reg);
    if (admin) return admin;

    const email = norm(reg?.email);
    const matches = (payments || []).filter((payment) => paymentMatchesRegistration(payment, reg));
    if (matches.length === 0) return null;

    const scorePayment = (payment) => {
        const meta = payment.metadata || {};
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
    const meta = payment.metadata || {};
    return !!(
        meta.marked_by_admin
        || meta.source === 'manual_event_admin'
        || String(payment.reference || '').startsWith('MANUAL-ADMIN-')
    );
}

/**
 * The email of the person who actually MADE a payment, checked across every
 * metadata layer Paystack/sync flows use. Returns null when unknown.
 */
export function paymentPayerEmailFor(payment) {
    const meta = payment?.metadata || {};
    const { top, inner } = getPaymentMetadataLayers(meta);
    return norm(
        top.registrant_email || inner.registrant_email
        || top.paid_by_email || inner.paid_by_email
        || meta.original_trx?.user
        || top.email || inner.email
    ) || null;
}

/** True when a payment's covers[] / registration_rows explicitly include this email. */
export function paymentExplicitlyCoversEmail(payment, email) {
    const meta = payment?.metadata || {};
    const { top, inner } = getPaymentMetadataLayers(meta);
    const target = norm(email);
    if (!target) return false;
    if (paymentEntryCoversFor(meta).some((c) => norm(c?.email) === target)) return true;
    return [...(top.registration_rows || []), ...(inner.registration_rows || [])]
        .some((row) => norm(row?.email) === target);
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

    const meta = payment.metadata || {};
    const explicitlyCovers = meta.registration_id === reg.id
        || paymentExplicitlyCoversEmail(payment, selfEmail);
    if (!explicitlyCovers) {
        // A differently-owned payment that doesn't explicitly cover this player
        // is a matching artefact -- never report it as partner-paid.
        return { isPartnerPaid: false, payerEmail: null };
    }

    return { isPartnerPaid: true, payerEmail };
}
