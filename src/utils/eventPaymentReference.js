const MAX_EVENT_LABEL_LENGTH = 36;

export function eventPaymentReference(event, timestamp = Date.now()) {
    const label = String(event.event_name || event.title || '')
        .normalize('NFKD')
        .replace(/\p{Mark}/gu, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+/, '')
        .slice(0, MAX_EVENT_LABEL_LENGTH)
        .replace(/-+$/, '');
    return `EVREG-${label || `EVENT-${event.id}`}-${timestamp}`;
}

export function isEventCheckoutReference(reference) {
    return /^(EVREG-|REGEV-|MANUAL-(?!ADMIN-))/.test(reference || '');
}

export function legacyEventIdFromPaymentReference(reference) {
    const match = /^(?:REGEV|MANUAL)-(\d+)(?:-|$)/.exec(reference || '');
    const id = match ? Number(match[1]) : null;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}
