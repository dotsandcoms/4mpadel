/**
 * Federation helpers — Rankedin IDs and profile lookups.
 */

import { supabase } from '../supabaseClient';

/** Fallback Rankedin org IDs historically hardcoded for SAPA. */
export const SAPA_FALLBACK_RANKEDIN = {
    eventsOrgId: '11331',
    rankingsOrgId: '15809',
};

/**
 * Fetch a published federation by slug (public).
 * @param {string} slug
 */
export async function fetchFederationBySlug(slug) {
    const { data, error } = await supabase
        .from('federations')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
    if (error) throw error;
    return data;
}

/**
 * List published federations for the public directory.
 */
export async function fetchPublishedFederations() {
    const { data, error } = await supabase
        .from('federations')
        .select('id, name, short_name, slug, logo_url, about, brand_color, verified, is_national_governing_body')
        .eq('status', 'published')
        .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
}

/**
 * Resolve Rankedin rankings org id for a federation (DB first, SAPA fallback).
 * @param {{ rankedin_rankings_org_id?: string|null, slug?: string }|null} federation
 */
export function getFederationRankingsOrgId(federation) {
    if (federation?.rankedin_rankings_org_id) return String(federation.rankedin_rankings_org_id);
    if (!federation || federation.slug === 'sapa') return SAPA_FALLBACK_RANKEDIN.rankingsOrgId;
    return null;
}

/**
 * Resolve Rankedin events org id for a federation (DB first, SAPA fallback).
 * @param {{ rankedin_events_org_id?: string|null, slug?: string }|null} federation
 */
export function getFederationEventsOrgId(federation) {
    if (federation?.rankedin_events_org_id) return String(federation.rankedin_events_org_id);
    if (!federation || federation.slug === 'sapa') return SAPA_FALLBACK_RANKEDIN.eventsOrgId;
    return null;
}

/**
 * Load SAPA (or default) federation Rankedin config for hooks that previously hardcoded IDs.
 */
export async function fetchDefaultFederationRankedinConfig() {
    const { data } = await supabase
        .from('federations')
        .select('slug, rankedin_events_org_id, rankedin_rankings_org_id')
        .eq('slug', 'sapa')
        .maybeSingle();
    return {
        eventsOrgId: getFederationEventsOrgId(data),
        rankingsOrgId: getFederationRankingsOrgId(data),
        federation: data,
    };
}
