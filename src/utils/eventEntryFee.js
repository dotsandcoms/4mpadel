/**
 * Resolve per-player entry fees with optional early-bird override.
 * While early_bird_ends_at is in the future and early_bird_fee is set,
 * that fee applies to every division; afterwards division.entry_fee is used.
 */

export function parseEventDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function isEarlyBirdActive(event, now = new Date()) {
    if (!event) return false;
    const ends = parseEventDate(event.early_bird_ends_at);
    if (!ends) return false;
    if (ends.getTime() <= now.getTime()) return false;
    const fee = event.early_bird_fee;
    if (fee === null || fee === undefined || fee === '') return false;
    return Number(fee) >= 0;
}

/**
 * @param {{ entry_fee?: number|string }|null} division
 * @param {object|null} event
 * @param {Date} [now]
 * @returns {number}
 */
export function resolveDivisionEntryFee(division, event, now = new Date()) {
    if (isEarlyBirdActive(event, now)) {
        return Number(event.early_bird_fee || 0);
    }
    return Number(division?.entry_fee ?? event?.entry_fee ?? 0);
}

export function getStandardDivisionEntryFee(division, event) {
    return Number(division?.entry_fee ?? event?.entry_fee ?? 0);
}
