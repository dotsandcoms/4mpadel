/**
 * Helpers for weekly series registration (event-level fee, Open division sentinel).
 */

export const WEEKLY_OPEN_DIVISION = 'Open';

/**
 * Max entries/teams for a weekly event (`calendar.max_teams_capacity`).
 * @param {{ max_teams_capacity?: number|string|null }} eventOrWeek
 * @returns {number|null} null = unlimited
 */
export function getWeeklyCapacity(eventOrWeek) {
    const raw = eventOrWeek?.max_teams_capacity;
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.floor(n);
}

/**
 * Count bookable entries (teams) for a weekly night.
 * Partner-mirror rows share `registered_by` with the booker and are not counted.
 * @param {Array<{ email?: string, registered_by?: string, status?: string }>} regs
 */
export function countWeeklyEntries(regs) {
    if (!Array.isArray(regs) || regs.length === 0) return 0;
    let count = 0;
    for (const reg of regs) {
        if (!reg || reg.status === 'withdrawn') continue;
        const email = String(reg.email || '').toLowerCase().trim();
        const registeredBy = String(reg.registered_by || '').toLowerCase().trim();
        // Primary booker row (solo or pair owner). Partner mirrors have a different email.
        if (!registeredBy || !email || email === registeredBy) {
            count += 1;
        }
    }
    return count;
}

/**
 * @param {number} entryCount
 * @param {number|null|undefined} capacity
 */
export function weeklySpotsRemaining(entryCount, capacity) {
    if (capacity == null) return null;
    return Math.max(0, capacity - Number(entryCount || 0));
}

/** Synthetic division used when a weekly event has no tournament_divisions rows. */
export function buildWeeklyOpenDivision(event) {
    return {
        id: '__weekly_open__',
        event_id: event?.id,
        name: WEEKLY_OPEN_DIVISION,
        entry_fee: Number(event?.entry_fee ?? 0),
        format: 'Social',
        gender: 'Mixed',
        license_required: false,
        is_active: true,
        sort_order: 0,
        entries_close_at: event?.registration_closes_at || null,
        details: null,
        _synthetic: true,
    };
}

/**
 * @param {string|null|undefined} startDate
 * @param {string|null|undefined} startTime
 */
export function formatWeeklyDateLabel(startDate, startTime) {
    if (!startDate) return 'Date TBC';
    try {
        const d = new Date(`${startDate}T12:00:00`);
        const datePart = d.toLocaleDateString('en-ZA', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
        const time = startTime ? String(startTime).slice(0, 5) : '';
        return time ? `${datePart} · ${time}` : datePart;
    } catch {
        return startDate;
    }
}

/**
 * Build pending registration rows for one or more weekly occurrences.
 * @param {object} opts
 */
export function buildWeeklyRegistrationRows({
    weeks,
    userEmail,
    selfName,
    phone = null,
    partnerName = null,
    partnerEmail = null,
    payForPartner = false,
    paymentStatus = 'pending',
    tshirtSize = null,
    tshirtSponsorName = null,
    tshirtLogoUrl = null,
}) {
    const rows = [];
    const covers = [];
    const hasPartner = !!(partnerName && partnerEmail);

    for (const week of weeks) {
        const fee = Number(week.fee ?? week.entry_fee ?? 0);
        const selfPaid = paymentStatus === 'paid' || fee === 0;
        rows.push({
            event_id: week.id,
            division_id: null,
            division: WEEKLY_OPEN_DIVISION,
            full_name: selfName,
            email: userEmail,
            phone,
            partner_name: hasPartner ? partnerName : null,
            partner_email: hasPartner ? partnerEmail : null,
            payment_status: selfPaid ? 'paid' : 'pending',
            partner_payment_status: hasPartner
                ? (payForPartner && (paymentStatus === 'paid' || fee === 0) ? 'paid' : 'pending')
                : null,
            status: 'registered',
            registered_by: userEmail,
            tshirt_size: tshirtSize || null,
            tshirt_sponsor_name: tshirtSponsorName || null,
            tshirt_logo_url: tshirtLogoUrl || null,
        });

        if (!selfPaid) {
            covers.push({ email: userEmail, division: WEEKLY_OPEN_DIVISION, type: 'entry', event_id: week.id });
        }

        if (hasPartner) {
            rows.push({
                event_id: week.id,
                division_id: null,
                division: WEEKLY_OPEN_DIVISION,
                full_name: partnerName,
                email: partnerEmail,
                phone: null,
                partner_name: selfName,
                partner_email: userEmail,
                payment_status: payForPartner && (paymentStatus === 'paid' || fee === 0) ? 'paid' : 'pending',
                partner_payment_status: selfPaid ? 'paid' : 'pending',
                status: 'registered',
                registered_by: userEmail,
                tshirt_size: null,
                tshirt_sponsor_name: null,
                tshirt_logo_url: null,
            });
            if (payForPartner && fee > 0 && paymentStatus !== 'paid') {
                covers.push({ email: partnerEmail, division: WEEKLY_OPEN_DIVISION, type: 'entry', event_id: week.id });
            }
        }
    }

    return { rows, covers, soloLinks: [] };
}

/**
 * @param {Array<{ fee?: number, entry_fee?: number }>} weeks
 * @param {{ paySelf?: boolean, payPartner?: boolean }} payers
 */
export function computeWeeklySubtotal(weeks, { paySelf = true, payPartner = false } = {}) {
    let t = 0;
    for (const week of weeks) {
        const fee = Number(week.fee ?? week.entry_fee ?? 0);
        if (paySelf) t += fee;
        if (payPartner) t += fee;
    }
    return t;
}
