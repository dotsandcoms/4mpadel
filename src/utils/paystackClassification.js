const metadataObject = value => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try { return metadataObject(JSON.parse(value)); } catch { /* Missing metadata. */ }
    }
    return {};
};

export function paystackMetadata(value) {
    const outer = metadataObject(value);
    return { ...metadataObject(outer.original_trx?.metadata), ...outer };
}

export function hasHostedPaystackReferrer(metadata) {
    try {
        const url = new URL(paystackMetadata(metadata).referrer);
        return ['paystack.shop', 'paystack.com', 'www.paystack.com'].includes(url.hostname)
            && /^\/(pay|buy)(\/|$)/.test(url.pathname);
    } catch { return false; }
}

// A matching amount is only a legacy fallback. Hosted payment links can charge
// the same amounts as licences and must never acquire licence status from it.
export function classifyPaystackTransaction({ reference = '', metadata, matchedLicenseType = null, previousPayment }) {
    const meta = paystackMetadata(metadata);
    const previousMeta = paystackMetadata(previousPayment?.metadata);
    const correction = previousMeta.payment_classification;
    if (correction?.payment_type === 'event_entry_fee') {
        return { paymentType: 'event_entry_fee', licenseType: null };
    }
    const explicitLicense = ['full', 'temporary'].includes(meta.license_type) ? meta.license_type : null;
    const eventPayment = /^(REGEV-|MANUAL-(?!ADMIN-))/.test(reference)
        || meta.source === 'manual_event' || (!!meta.event_id && !explicitLicense);
    if (eventPayment) return { paymentType: 'event_entry_fee', licenseType: null };

    const legacyFallback = (!meta.source || meta.source === 'paystack_sync')
        && !hasHostedPaystackReferrer(meta) ? matchedLicenseType : null;
    const licenseType = explicitLicense
        || (meta.source === 'web_license_modal' ? matchedLicenseType : legacyFallback);
    return {
        licenseType,
        paymentType: licenseType === 'full' ? 'membership' : licenseType === 'temporary' ? 'temp_license' : 'other',
    };
}
