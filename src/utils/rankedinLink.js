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
