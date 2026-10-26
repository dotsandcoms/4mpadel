/**
 * True when event-wide or division-specific registration has closed.
 * Blocks withdrawals, partner removal, and new entries once either deadline passes.
 */
export const isRegistrationClosed = (division, event) => {
    const now = Date.now();
    if (event?.registration_closes_at && new Date(event.registration_closes_at).getTime() < now) {
        return true;
    }
    const divClose = division?.entries_close_at;
    if (divClose && new Date(divClose).getTime() < now) {
        return true;
    }
    return false;
};

/** Existing entries can pay after closing unless the organiser switches it off. */
export const isRegistrationPaymentClosed = (division, event, now = Date.now()) => {
    if (event?.allow_payments_after_close !== false) return false;
    const closesAt = division?.entries_close_at || event?.registration_closes_at;
    return !!closesAt && new Date(closesAt).getTime() <= now;
};
