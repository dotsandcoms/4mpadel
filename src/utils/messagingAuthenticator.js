export const emptyMessagingAuthenticator = () => ({ factor: '', secret: '', qrCode: '', factors: [] });

// Keep enrollment QR codes local: never use a third-party QR image service.
export function authenticatorQrSource(value) {
    if (!value) return null;
    if (/^data:image\/(?:svg\+xml|png)(?:;[^,]*)?,/i.test(value)) return value;
    if (/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(value)) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
    return null;
}

// Supabase's `totp` list contains verified factors; `all` also includes pending
// enrollments. Preserve a QR only while its matching enrollment still exists.
export function resolveMessagingAuthenticator(data, previous = {}) {
    const factors = (data?.totp || []).filter(item => item.status === 'verified');
    const selected = factors.find(item => item.id === previous.factor) || factors[0];
    if (selected) return { factor: selected.id, factors, secret: '', qrCode: '' };
    const pending = data?.all?.find(item => item.id === previous.factor && item.factor_type === 'totp' && item.status === 'unverified');
    if (pending && previous.secret) return { factor: pending.id, factors, secret: previous.secret, qrCode: previous.qrCode || '' };
    return emptyMessagingAuthenticator();
}
