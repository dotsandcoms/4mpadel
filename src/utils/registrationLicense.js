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
    const display = resolveRegistrationLicenseDisplay(email, eventId, player, eventPayments);
    return display.text;
}

/**
 * Rich license info for admin profile views.
 * Full licenses omit event wording; temp licenses include purchase date when known.
 */
export function resolveRegistrationLicenseDisplay(email, eventId, player, eventPayments = []) {
    const norm = (email || '').toLowerCase().trim();
    if (!norm) {
        return { kind: 'none', label: 'Not on file', text: 'Not on file' };
    }

    for (const pay of eventPayments) {
        if (pay?.status && pay.status !== 'success') continue;
        const cover = (pay?.metadata?.covers || []).find(
            (c) => c.type === 'license' && (c.email || '').toLowerCase().trim() === norm,
        );
        if (cover) {
            if (cover.license === 'full') {
                return { kind: 'full', label: 'Full', text: 'Full' };
            }
            const purchasedAt = pay.created_at || null;
            return {
                kind: 'temp',
                label: 'Temporary',
                purchasedAt,
                text: formatTempLicenseText(purchasedAt),
            };
        }
    }

    if (!player) {
        return { kind: 'none', label: 'Not on file', text: 'Not on file' };
    }

    if (String(player.license_type || '').toLowerCase() === 'full') {
        return { kind: 'full', label: 'Full', text: 'Full' };
    }

    const tempLic = (player.temporary_licenses || []).find(
        (lic) => Number(lic.event_id) === Number(eventId),
    );
    if (tempLic) {
        const purchasedAt = tempLic.created_at || tempLic.event_date || null;
        return {
            kind: 'temp',
            label: 'Temporary',
            purchasedAt,
            text: formatTempLicenseText(purchasedAt),
        };
    }

    if (player.paid_registration) {
        return { kind: 'active', label: 'Active', text: 'Active' };
    }
    return { kind: 'none', label: 'None', text: 'None' };
}

function formatTempLicenseText(purchasedAt) {
    if (!purchasedAt) return 'Temporary · this event';
    const date = new Date(purchasedAt);
    if (Number.isNaN(date.getTime())) return 'Temporary · this event';
    const formatted = date.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
    return `Temporary · purchased ${formatted}`;
}

export function licenseCategoryFromLabel(label) {
    if (label.includes('Full')) return 'full';
    if (label.includes('Temporary') || label.includes('Temp')) return 'temp';
    return 'none';
}
