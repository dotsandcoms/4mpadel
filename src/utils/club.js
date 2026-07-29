/**
 * Club helpers — public lookups and accent util for Club Card.
 */

import { supabase } from '../supabaseClient';

/** Canonical club status values stored on `clubs.status`. */
export const CLUB_STATUSES = [
    { value: 'unclaimed', label: 'Unclaimed' },
    { value: 'in_review', label: 'In review' },
    { value: 'published', label: 'Published' },
    { value: '4m_approved', label: '4M approved' },
    { value: '4m_premium', label: '4M premium' },
];

/** Statuses visible on the public clubs directory / club pages. */
export const PUBLIC_CLUB_STATUSES = ['published', '4m_approved', '4m_premium'];

/** Statuses that can appear in claim / registration search. */
export const CLAIMABLE_CLUB_STATUSES = ['unclaimed', 'published', '4m_approved', '4m_premium', 'draft', 'archived'];

/**
 * Normalize legacy statuses onto the current vocabulary where possible.
 * @param {string|null|undefined} status
 */
export const normalizeClubStatus = (status) => {
    const raw = String(status || '').trim().toLowerCase();
    if (raw === 'pending') return 'in_review';
    if (raw === 'draft' || raw === 'archived') return 'unclaimed';
    return raw || 'unclaimed';
};

/**
 * @param {string|null|undefined} status
 */
export const clubStatusLabel = (status) => {
    const normalized = normalizeClubStatus(status);
    const match = CLUB_STATUSES.find((s) => s.value === normalized);
    if (match) return match.label;
    if (normalized === 'rejected') return 'Rejected';
    return status || 'Unclaimed';
};

/**
 * @param {string|null|undefined} status
 */
export const isPublicClubStatus = (status) => PUBLIC_CLUB_STATUSES.includes(normalizeClubStatus(status));

/**
 * @param {string|null|undefined} status
 */
export const isInReviewClubStatus = (status) => {
    const normalized = normalizeClubStatus(status);
    return normalized === 'in_review' || String(status || '').toLowerCase() === 'pending';
};

/**
 * Statuses that unlock Club Dashboard for members (excludes in-review / rejected).
 * @param {string|null|undefined} status
 */
export const isManageableClubStatus = (status) => {
    const normalized = normalizeClubStatus(status);
    return normalized !== 'in_review' && normalized !== 'rejected';
};

/**
 * Badge classes for club status pills.
 * @param {string|null|undefined} status
 */
export const clubStatusBadgeClass = (status) => {
    const normalized = normalizeClubStatus(status);
    switch (normalized) {
        case 'published':
            return 'bg-padel-green/10 text-padel-green border-padel-green/20';
        case '4m_approved':
            return 'bg-sky-500/10 text-sky-300 border-sky-500/20';
        case '4m_premium':
            return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
        case 'in_review':
            return 'bg-violet-500/10 text-violet-300 border-violet-500/20';
        case 'unclaimed':
            return 'bg-white/5 text-gray-300 border-white/10';
        case 'rejected':
            return 'bg-red-500/10 text-red-400 border-red-500/20';
        default:
            return 'bg-white/5 text-gray-400 border-white/10';
    }
};

/**
 * Lift dark brand colours so text stays readable on near-black UI.
 * @param {string|null|undefined} hex
 * @param {string} [fallback='#C8F500']
 * @returns {string}
 */
export const accentOnDark = (hex, fallback = '#C8F500') => {
    if (!hex || typeof hex !== 'string') return fallback;
    const raw = hex.trim().replace('#', '');
    const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luminance >= 0.48) return `#${full.toUpperCase()}`;
    const t = 0.62;
    const nr = Math.round(((1 - t) * r + t * 0.78) * 255);
    const ng = Math.round(((1 - t) * g + t * 0.96) * 255);
    const nb = Math.round(((1 - t) * b + t * 0.02) * 255);
    return `#${[nr, ng, nb].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

/**
 * @param {string} slug
 */
export async function fetchClubBySlug(slug) {
    const { data, error } = await supabase
        .from('clubs')
        .select('*, federations(id, name, short_name, slug, logo_url)')
        .eq('slug', slug)
        .maybeSingle();
    if (error) throw error;
    return data;
}

/**
 * Public directory clubs (published / 4M approved / 4M premium).
 */
export async function fetchPublishedClubs() {
    const { data, error } = await supabase
        .from('clubs')
        .select('id, name, short_name, slug, logo_url, city, address, about, brand_color, verified, sapa_registered, status')
        .in('status', PUBLIC_CLUB_STATUSES)
        .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
}

/**
 * Organisations linked to a club.
 * @param {string} clubId
 */
export async function fetchClubOrganisations(clubId) {
    const { data, error } = await supabase
        .from('club_organisations')
        .select('organisation_id, organisations(id, name, slug, logo_url, org_type, verified, status)')
        .eq('club_id', clubId);
    if (error) throw error;
    return (data || [])
        .map((row) => row.organisations)
        .filter((o) => o && o.status === 'approved');
}

/**
 * Clubs linked to an organisation.
 * @param {string} organisationId
 */
export async function fetchOrganisationClubs(organisationId) {
    const { data, error } = await supabase
        .from('club_organisations')
        .select('club_id, clubs(id, name, slug, logo_url, city, verified, status)')
        .eq('organisation_id', organisationId);
    if (error) throw error;
    return (data || [])
        .map((row) => row.clubs)
        .filter((c) => c && isPublicClubStatus(c.status));
}

/**
 * @param {string} value
 */
export function slugifyClub(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
}

export const SA_REGIONS = [
    'Eastern Cape',
    'Free State',
    'Gauteng',
    'KwaZulu-Natal',
    'Limpopo',
    'Mpumalanga',
    'Northern Cape',
    'North West',
    'Western Cape',
];

/** Common SA locality → province map for clubs without an explicit region field. */
const CITY_TO_REGION = {
    johannesburg: 'Gauteng',
    sandton: 'Gauteng',
    pretoria: 'Gauteng',
    centurion: 'Gauteng',
    midrand: 'Gauteng',
    randburg: 'Gauteng',
    roodepoort: 'Gauteng',
    fourways: 'Gauteng',
    midstream: 'Gauteng',
    benoni: 'Gauteng',
    kempton: 'Gauteng',
    melrose: 'Gauteng',
    'cape town': 'Western Cape',
    claremont: 'Western Cape',
    'camps bay': 'Western Cape',
    stellenbosch: 'Western Cape',
    somerset: 'Western Cape',
    paarl: 'Western Cape',
    durban: 'KwaZulu-Natal',
    umhlanga: 'KwaZulu-Natal',
    pietermaritzburg: 'KwaZulu-Natal',
    bloemfontein: 'Free State',
    polokwane: 'Limpopo',
    nelspuit: 'Mpumalanga',
    mbombela: 'Mpumalanga',
    'port elizabeth': 'Eastern Cape',
    gqeberha: 'Eastern Cape',
    'east london': 'Eastern Cape',
    gaborone: 'Botswana',
};

/**
 * @param {string|null|undefined} value
 */
const normalizePlace = (value) => String(value || '').trim().toLowerCase();

/**
 * Best-effort city label from club city field or address.
 * @param {{ city?: string|null, address?: string|null }} club
 */
export const clubCityLabel = (club) => {
    const city = String(club?.city || '').trim();
    if (city) return city;
    const parts = String(club?.address || '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    const locality = parts.find((p) => !/^\d{4,}$/.test(p) && !/^south africa$/i.test(p) && !/\d/.test(p));
    return locality || '';
};

/**
 * Infer region/country from city, address, or club name.
 * @param {{ name?: string|null, city?: string|null, address?: string|null }} club
 */
export const clubRegionLabel = (club) => {
    const city = normalizePlace(clubCityLabel(club));
    if (city && CITY_TO_REGION[city]) return CITY_TO_REGION[city];

    const hay = normalizePlace([club?.city, club?.address, club?.name].filter(Boolean).join(' '));
    if (!hay) return '';

    if (hay.includes('botswana')) return 'Botswana';
    if (hay.includes('namibia')) return 'Namibia';
    if (hay.includes('south africa')) {
        for (const region of SA_REGIONS) {
            if (hay.includes(normalizePlace(region))) return region;
        }
    }

    for (const region of SA_REGIONS) {
        if (hay.includes(normalizePlace(region))) return region;
    }
    for (const [place, region] of Object.entries(CITY_TO_REGION)) {
        if (hay.includes(place)) return region;
    }
    return '';
};
