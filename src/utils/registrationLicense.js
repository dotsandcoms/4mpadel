/**
 * Resolve a registrant's SAPA license category for an event.
 * Returns 'full' | 'temp' | 'none' (unique-player stats bucket).
 */
export function resolveRegistrationLicenseCategory(email, eventId, player, eventPayments = []) {
    const norm = (email || '').toLowerCase().trim();
    if (!norm) return 'none';

    for (const pay of eventPayments) {
        if (pay?.status && pay.status !== 'success') continue;
        const covers = pay?.metadata?.covers || [];
        const cover = covers.find(
            (c) => c.type === 'license' && (c.email || '').toLowerCase().trim() === norm,
        );
        if (cover) return cover.license === 'full' ? 'full' : 'temp';
    }

    if (!player) return 'none';
    if (String(player.license_type || '').toLowerCase() === 'full') return 'full';
    if ((player.temporary_licenses || []).some(
        (lic) => Number(lic.event_id) === Number(eventId),
    )) {
        return 'temp';
    }
    return 'none';
}

/** Human-readable license label for tables and export. */
export function formatRegistrationLicenseLabel(email, eventId, player, eventPayments = []) {
    const norm = (email || '').toLowerCase().trim();
    if (!norm) return 'Not on file';

    for (const pay of eventPayments) {
        if (pay?.status && pay.status !== 'success') continue;
        const cover = (pay?.metadata?.covers || []).find(
            (c) => c.type === 'license' && (c.email || '').toLowerCase().trim() === norm,
        );
        if (cover) {
            return cover.license === 'full'
                ? 'Full (purchased for event)'
                : 'Temporary (purchased for event)';
        }
    }

    if (!player) return 'Not on file';
    if (String(player.license_type || '').toLowerCase() === 'full') return 'Full';
    if ((player.temporary_licenses || []).some(
        (lic) => Number(lic.event_id) === Number(eventId),
    )) {
        return 'Temporary';
    }
    if (player.paid_registration) return 'Active';
    return 'None';
}

export function licenseCategoryFromLabel(label) {
    if (label.includes('Full')) return 'full';
    if (label.includes('Temporary') || label.includes('Temp')) return 'temp';
    return 'none';
}
