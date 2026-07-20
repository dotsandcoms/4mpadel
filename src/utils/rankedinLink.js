/**
 * Extract a RankedIn tournament / club-league ID from a raw ID or URL paste.
 * @param {string|number|null|undefined} value
 * @returns {string|null}
 */
export const extractRankedinId = (value) => {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return raw;
    const match = raw.match(/\/(?:tournament|clubleague|draws|results)\/(\d+)/i)
        || raw.match(/[?&]id=(\d+)/i)
        || raw.match(/\/(\d+)(?:\/|$)/);
    return match ? match[1] : null;
};

/**
 * Build a canonical RankedIn tournament URL from an ID (and optional slug).
 * @param {string|number} id
 * @param {string} [slug]
 * @returns {string}
 */
export const buildRankedinTournamentUrl = (id, slug = '') => {
    const cleanId = extractRankedinId(id);
    if (!cleanId) return '';
    const cleanSlug = String(slug || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
    return cleanSlug
        ? `https://www.rankedin.com/en/tournament/${cleanId}/${cleanSlug}`
        : `https://www.rankedin.com/en/tournament/${cleanId}`;
};

/**
 * Normalise name for fuzzy class ↔ division matching.
 * @param {string} name
 * @returns {string}
 */
export const normalizeRankedinName = (name) =>
    String(name || '')
        .toLowerCase()
        .replace(/[''`]/g, '')
        .replace(/[^a-z0-9]+/g, '');

const SKIP_REASON_LABELS = {
    missing_rankedin_id: 'Missing RankedIn ID',
    rankedin_id_unresolved: 'RankedIn ID could not be resolved',
    solo_entry: 'Solo entry (no partner)',
    partner_row_missing: 'Partner registration row missing',
    not_both_paid: 'Not both players paid',
    already_on_rankedin: 'Already on RankedIn',
    same_rankedin_id: 'Both players share the same RankedIn ID',
};

/**
 * Human-readable label for a sync skip reason code.
 * @param {string} reason
 * @returns {string}
 */
export const formatRankedinSkipReason = (reason) =>
    SKIP_REASON_LABELS[reason] || String(reason || 'unknown').replace(/_/g, ' ');

const csvEscape = (value) => {
    const s = String(value ?? '');
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
};

/**
 * Flatten sync-to-rankedin skipped teams into one CSV row per player.
 * @param {Array<{ reason?: string, division?: string, names?: string[], emails?: string[], missingEmails?: string[] }>} skipped
 * @returns {string[][]}
 */
export const buildRankedinSkipCsvRows = (skipped = []) => {
    const header = [
        'player_name',
        'email',
        'division',
        'reason',
        'reason_code',
        'partner_name',
        'partner_email',
        'notes',
    ];
    const rows = [header];

    for (const item of skipped) {
        const names = Array.isArray(item?.names) ? item.names : [];
        const emails = Array.isArray(item?.emails) ? item.emails : [];
        const missingSet = new Set(
            (Array.isArray(item?.missingEmails) ? item.missingEmails : [])
                .map((e) => String(e || '').toLowerCase())
                .filter(Boolean),
        );
        const reasonCode = item?.reason || 'other';
        const reason = formatRankedinSkipReason(reasonCode);
        const division = item?.division || '';
        const count = Math.max(names.length, emails.length, 1);

        for (let i = 0; i < count; i++) {
            const email = emails[i] || '';
            const name = names[i] || '';
            const partnerIdx = count > 1 ? (i === 0 ? 1 : 0) : -1;
            const partnerName = partnerIdx >= 0 ? (names[partnerIdx] || '') : '';
            const partnerEmail = partnerIdx >= 0 ? (emails[partnerIdx] || '') : '';
            let notes = '';
            if (reasonCode === 'missing_rankedin_id' || reasonCode === 'rankedin_id_unresolved') {
                if (missingSet.size === 0) {
                    notes = 'Team skipped — RankedIn ID issue';
                } else if (missingSet.has(String(email).toLowerCase())) {
                    notes = 'This player is missing / unresolved RankedIn ID';
                } else {
                    notes = 'Partner is missing / unresolved RankedIn ID';
                }
            }
            rows.push([
                name,
                email,
                division,
                reason,
                reasonCode,
                partnerName,
                partnerEmail,
                notes,
            ]);
        }
    }

    return rows;
};

/**
 * Download a CSV of players/teams that were not pushed to RankedIn.
 * @param {Array} skipped
 * @param {{ eventName?: string, rankedinId?: string|number }} [opts]
 * @returns {number} number of player rows written (excludes header)
 */
export const downloadRankedinSkipReport = (skipped = [], opts = {}) => {
    const rows = buildRankedinSkipCsvRows(skipped);
    if (rows.length <= 1) return 0;

    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    const slug = String(opts.eventName || 'event')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
        || 'event';
    const idBit = opts.rankedinId ? `-ri${opts.rankedinId}` : '';
    const dateBit = new Date().toISOString().slice(0, 10);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rankedin-unsynced-${slug}${idBit}-${dateBit}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return rows.length - 1;
};
