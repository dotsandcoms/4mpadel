/**
 * Whether the partner on a registration has paid.
 *
 * Prefer the partner's own registration row (`payment_status`) — that is the
 * source of truth. The denormalized `partner_payment_status` on the viewer's
 * row can go stale (e.g. booker paid for themselves only, but the flag was
 * incorrectly left/set to "paid"), which made paid players see unpaid partners
 * as confirmed.
 *
 * @param {{ partner_payment_status?: string|null }} reg — viewer's registration
 * @param {{ payment_status?: string|null }|null|undefined} partnerReg — partner's own row, if any
 * @returns {boolean}
 */
export function resolvePartnerPaid(reg, partnerReg) {
    if (partnerReg) {
        return partnerReg.payment_status === 'paid';
    }
    return reg?.partner_payment_status === 'paid';
}

/**
 * Whether the viewer has paid for their own entry on this registration row.
 * Only the viewer's registrant row (`email`) is authoritative — never the
 * denormalized `partner_payment_status` on someone else's row.
 * @param {{ email?: string, payment_status?: string }} reg
 * @param {string} viewerEmail
 * @returns {boolean}
 */
export function viewerRegistrationIsPaid(reg, viewerEmail) {
    const email = String(viewerEmail || '').trim().toLowerCase();
    if (!email || !reg) return false;
    if (String(reg.email || '').trim().toLowerCase() !== email) return false;
    return String(reg.payment_status || '').toLowerCase() === 'paid';
}
