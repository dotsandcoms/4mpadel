/**
 * Club group helpers — brand umbrellas with linked venue clubs.
 */

import { supabase } from '../supabaseClient';
import {
    PUBLIC_CLUB_STATUSES,
    isPublicClubStatus,
    normalizeClubStatus,
    slugifyClub,
} from './club';

/** Nested group fields selected on club queries. */
export const CLUB_GROUP_NEST_SELECT =
    'id, name, slug, short_name, logo_url, website_url, brand_color, share_logo, share_website, status';

/**
 * @param {string|null|undefined} status
 */
export const isPublicClubGroupStatus = (status) =>
    PUBLIC_CLUB_STATUSES.includes(normalizeClubStatus(status));

/**
 * @param {string} value
 */
export function slugifyClubGroup(value) {
    return slugifyClub(value);
}

/**
 * Resolve nested group from a club row (PostgREST may return object or array).
 * @param {{ club_groups?: object|object[]|null, group?: object|null }|null|undefined} club
 */
export function getClubGroup(club) {
    if (!club) return null;
    if (club.group && typeof club.group === 'object' && !Array.isArray(club.group)) {
        return club.group;
    }
    const nested = club.club_groups;
    if (Array.isArray(nested)) return nested[0] || null;
    if (nested && typeof nested === 'object') return nested;
    return null;
}

/**
 * Logo URL with optional live inherit from group.
 * @param {{ logo_url?: string|null, club_groups?: object|null, group?: object|null }|null|undefined} club
 */
export function resolveClubLogo(club) {
    const group = getClubGroup(club);
    if (group?.share_logo && group.logo_url) return group.logo_url;
    return club?.logo_url || null;
}

/**
 * Website URL with optional live inherit from group.
 * @param {{ website_url?: string|null, club_groups?: object|null, group?: object|null }|null|undefined} club
 */
export function resolveClubWebsite(club) {
    const group = getClubGroup(club);
    if (group?.share_website && group.website_url) return group.website_url;
    return club?.website_url || null;
}

/**
 * Public directory groups.
 */
export async function fetchPublishedClubGroups() {
    const { data, error } = await supabase
        .from('club_groups')
        .select(
            'id, name, short_name, slug, logo_url, city, province, about, brand_color, website_url, status, share_logo, share_website',
        )
        .in('status', PUBLIC_CLUB_STATUSES)
        .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
}

/**
 * @param {string} slug
 */
export async function fetchClubGroupBySlug(slug) {
    const { data, error } = await supabase
        .from('club_groups')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
    if (error) throw error;
    return data;
}

/**
 * Public venues linked to a group.
 * @param {string} groupId
 */
export async function fetchClubGroupVenues(groupId) {
    if (!groupId) return [];
    const { data, error } = await supabase
        .from('clubs')
        .select(
            'id, name, short_name, slug, logo_url, city, address, province, about, brand_color, verified, status, website_url, group_id',
        )
        .eq('group_id', groupId)
        .in('status', PUBLIC_CLUB_STATUSES)
        .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
}

/**
 * Venue counts for a list of group ids (all statuses; caller can filter).
 * @param {string[]} groupIds
 * @param {{ publicOnly?: boolean }} [opts]
 */
export async function fetchClubGroupVenueCounts(groupIds, opts = {}) {
    const ids = (groupIds || []).filter(Boolean);
    if (ids.length === 0) return {};
    let query = supabase.from('clubs').select('id, group_id, status').in('group_id', ids);
    if (opts.publicOnly !== false) {
        query = query.in('status', PUBLIC_CLUB_STATUSES);
    }
    const { data, error } = await query;
    if (error) throw error;
    const counts = {};
    for (const row of data || []) {
        if (!row.group_id) continue;
        if (opts.publicOnly !== false && !isPublicClubStatus(row.status)) continue;
        counts[row.group_id] = (counts[row.group_id] || 0) + 1;
    }
    return counts;
}

/**
 * Replace venue membership for a group.
 * Clubs not in clubIds that currently point at this group are unlinked.
 * @param {string} groupId
 * @param {string[]} clubIds
 */
export async function setClubGroupVenues(groupId, clubIds) {
    if (!groupId) throw new Error('groupId is required');
    const nextIds = [...new Set((clubIds || []).filter(Boolean))];

    const { data: current, error: curErr } = await supabase
        .from('clubs')
        .select('id')
        .eq('group_id', groupId);
    if (curErr) throw curErr;

    const currentIds = (current || []).map((r) => r.id);
    const toUnlink = currentIds.filter((id) => !nextIds.includes(id));
    const toLink = nextIds.filter((id) => !currentIds.includes(id));

    if (toUnlink.length > 0) {
        const { error } = await supabase
            .from('clubs')
            .update({ group_id: null })
            .in('id', toUnlink);
        if (error) throw error;
    }

    if (toLink.length > 0) {
        const { error } = await supabase
            .from('clubs')
            .update({ group_id: groupId })
            .in('id', toLink);
        if (error) throw error;
    }

    return { linked: toLink.length, unlinked: toUnlink.length };
}

/**
 * Cascade group logo/website onto linked clubs when share flags are enabled.
 * @param {{ id: string, logo_url?: string|null, website_url?: string|null, share_logo?: boolean, share_website?: boolean }} group
 */
export async function cascadeGroupBrandingToVenues(group) {
    if (!group?.id) return;
    const patch = {};
    if (group.share_logo && group.logo_url) patch.logo_url = group.logo_url;
    if (group.share_website && group.website_url) patch.website_url = group.website_url;
    if (Object.keys(patch).length === 0) return;

    const { error } = await supabase
        .from('clubs')
        .update(patch)
        .eq('group_id', group.id);
    if (error) throw error;
}

/**
 * All groups for admin pickers (any status except archived if desired).
 */
export async function fetchAllClubGroups() {
    const { data, error } = await supabase
        .from('club_groups')
        .select('id, name, slug, short_name, logo_url, status, share_logo, share_website, website_url')
        .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
}
