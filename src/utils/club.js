/**
 * Club helpers — public lookups and accent util for Club Card.
 */

import { supabase } from '../supabaseClient';

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
 * Published clubs for the public directory.
 */
export async function fetchPublishedClubs() {
    const { data, error } = await supabase
        .from('clubs')
        .select('id, name, short_name, slug, logo_url, city, address, about, brand_color, verified, sapa_registered')
        .eq('status', 'published')
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
        .filter((c) => c && c.status === 'published');
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
