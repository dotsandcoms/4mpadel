const MAX_EVENT_LABEL_LENGTH = 36;

export function eventPaymentReference(event, timestamp = Date.now()) {
    const base = `REGEV-${event.id}-${timestamp}`;
    const label = String(event.event_name || event.title || '')
        .normalize('NFKD')
        .replace(/\p{Mark}/gu, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+/, '')
        .slice(0, MAX_EVENT_LABEL_LENGTH)
        .replace(/-+$/, '');
    return label ? `${base}-${label}` : base;
}
