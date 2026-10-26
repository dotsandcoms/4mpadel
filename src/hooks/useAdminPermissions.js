import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { isManageableClubStatus } from '../utils/club';
import { SUPER_ADMIN_EMAILS } from '../utils/adminIdentity.js';
import { readTournamentAssignments } from '../utils/tournamentAccess.js';

export { SUPER_ADMIN_EMAILS } from '../utils/adminIdentity.js';

export async function canAccessHiddenEvents(email) {
    const normalized = (email || '').toLowerCase().trim();
    if (!normalized) return false;
    if (SUPER_ADMIN_EMAILS.includes(normalized)) return true;

    const { data } = await supabase
        .from('admin_sidebar_permissions')
        .select('role, allowed_tabs')
        .ilike('email', normalized)
        .maybeSingle();

    if (!data) return false;
    if (data.role === 'super_admin') return true;
    return Array.isArray(data.allowed_tabs) && data.allowed_tabs.includes('calendar');
}

/**
 * Resolve organisation membership for a user email.
 * Returns { org, orgs, orgRole } or null if not an org member.
 * Primary source: organisation_members. Legacy fallback: organisations.created_by.
 */
async function resolveOrgMembership(userEmail) {
    // 1. New model: organisation_members
    const { data: memberships, error: membershipError } = await supabase
        .from('organisation_members')
        .select('role, organisation_id, organisations(*)')
        .ilike('user_email', userEmail);

    if (membershipError) {
        console.warn('Could not resolve organisation membership:', membershipError.message);
    }

    const activeOrgs = (memberships || [])
        .filter(m => m.organisations && m.organisations.status === 'approved')
        .map(m => ({ ...m.organisations, member_role: m.role }));

    if (activeOrgs.length > 0) {
        return { org: activeOrgs[0], orgs: activeOrgs, orgRole: activeOrgs[0].member_role };
    }

    // 2. Legacy fallback: org created by this user's player record
    const { data: playerData } = await supabase
        .from('players')
        .select('id')
        .ilike('email', userEmail)
        .maybeSingle();

    if (playerData) {
        const { data: orgData } = await supabase
            .from('organisations')
            .select('*')
            .eq('created_by', playerData.id)
            .eq('status', 'approved')
            .maybeSingle();

        if (orgData) {
            return { org: orgData, orgs: [orgData], orgRole: 'owner' };
        }
    }

    return null;
}

/**
 * Resolve federation membership for a user email.
 * @returns {{ federation: object, federations: object[], federationRole: string }|null}
 */
async function resolveFederationMembership(userEmail) {
    const { data: memberships } = await supabase
        .from('federation_members')
        .select('role, federation_id, federations(*)')
        .ilike('user_email', userEmail);

    const active = (memberships || [])
        .filter((m) => m.federations)
        .map((m) => ({ ...m.federations, member_role: m.role }));

    if (active.length === 0) return null;
    return {
        federation: active[0],
        federations: active,
        federationRole: active[0].member_role,
    };
}

/**
 * Resolve club membership + clubs linked via organisations the user admins.
 * @returns {{ clubs: object[], clubRole: string|null, hasDirectClubMembership: boolean }|null}
 */
async function resolveClubAccess(userEmail, orgMembership) {
    const clubMap = new Map();

    const { data: memberships } = await supabase
        .from('club_members')
        .select('role, club_id, clubs(*)')
        .ilike('user_email', userEmail);

    const directClubMemberships = (memberships || []).filter((membership) =>
        membership.clubs && isManageableClubStatus(membership.clubs.status));

    directClubMemberships.forEach((m) => {
        if (m.clubs && isManageableClubStatus(m.clubs.status)) {
            clubMap.set(m.clubs.id, { ...m.clubs, member_role: m.role });
        }
    });

    // Linked org admins can edit clubs tied to their organisations
    if (orgMembership?.orgs?.length) {
        const orgIds = orgMembership.orgs
            .filter((o) => ['owner', 'admin'].includes(o.member_role || orgMembership.orgRole))
            .map((o) => o.id);
        if (orgIds.length > 0) {
            const { data: links } = await supabase
                .from('club_organisations')
                .select('club_id, clubs(*)')
                .in('organisation_id', orgIds);
            (links || []).forEach((row) => {
                if (row.clubs && !clubMap.has(row.clubs.id)) {
                    clubMap.set(row.clubs.id, { ...row.clubs, member_role: 'admin' });
                }
            });
        }
    }

    const clubs = [...clubMap.values()];
    if (clubs.length === 0) return null;
    return {
        clubs,
        clubRole: clubs[0].member_role || 'admin',
        hasDirectClubMembership: directClubMemberships.length > 0,
    };
}

export const useAdminPermissions = (userEmail) => {
    const [resolved, setResolved] = useState({ identity: null, permissions: null, loading: true });
    const [tournaments, setTournaments] = useState({ identity: null, assignments: [], loading: true });
    const basePermissions = resolved.identity === userEmail ? resolved.permissions : null;
    const permissions = useMemo(() => {
        const assignments = tournaments.identity === userEmail ? tournaments.assignments : [];
        return basePermissions || assignments.length
            ? { ...(basePermissions || { role: 'custom', allowed_tabs: [], module_permissions: {} }), tournamentAssignments: assignments }
            : null;
    }, [basePermissions, tournaments, userEmail]);
    const loading = Boolean(userEmail) && (resolved.identity !== userEmail || resolved.loading || tournaments.identity !== userEmail || tournaments.loading);

    useEffect(() => {
        let cancelled = false;
        setTournaments({ identity: userEmail, assignments: [], loading: Boolean(userEmail) });
        if (userEmail) readTournamentAssignments(supabase, userEmail).then(assignments => {
            if (!cancelled) setTournaments({ identity: userEmail, assignments, loading: false });
        }).catch(error => {
            console.warn('Tournament access could not be resolved:', error.message);
            if (!cancelled) setTournaments({ identity: userEmail, assignments: [], loading: false });
        });
        return () => { cancelled = true; };
    }, [userEmail]);

    useEffect(() => {
        let cancelled = false;
        const setPermissions = value => {
            if (!cancelled) setResolved(current => ({ ...current, identity: userEmail, permissions: value }));
        };
        const setLoading = value => {
            if (!cancelled) setResolved(current => ({ ...current, identity: userEmail, loading: value }));
        };
        setResolved({ identity: userEmail, permissions: null, loading: Boolean(userEmail) });
        const fetchPermissions = async () => {
            if (!userEmail) {
                setLoading(false);
                return;
            }

            try {
                // Super admins get full platform access — also attach any linked org
                // so they can manage events for organisations they belong to.
                if (SUPER_ADMIN_EMAILS.includes(userEmail.toLowerCase())) {
                    const orgMembership = await resolveOrgMembership(userEmail);
                    const fedMembership = await resolveFederationMembership(userEmail);
                    const clubAccess = await resolveClubAccess(userEmail, orgMembership);
                    setPermissions({
                        role: 'super_admin',
                        allowed_tabs: [],
                        module_permissions: {},
                        ...(orgMembership ? {
                            org: orgMembership.org,
                            orgs: orgMembership.orgs,
                            orgRole: orgMembership.orgRole,
                        } : {}),
                        ...(fedMembership ? {
                            federation: fedMembership.federation,
                            federations: fedMembership.federations,
                            federationRole: fedMembership.federationRole,
                        } : {}),
                        ...(clubAccess ? {
                            clubs: clubAccess.clubs,
                            clubRole: clubAccess.clubRole,
                            hasDirectClubMembership: clubAccess.hasDirectClubMembership,
                        } : {}),
                    });
                    setLoading(false);
                    return;
                }

                const { data, error } = await supabase
                    .from('admin_sidebar_permissions')
                    .select('*')
                    .ilike('email', userEmail)
                    .single();

                if (error) {
                    if (error.code === 'PGRST116') {
                        // Not a 4M admin — check federation, club, then organisation membership
                        const fedMembership = await resolveFederationMembership(userEmail);
                        const orgMembership = await resolveOrgMembership(userEmail);
                        const clubAccess = await resolveClubAccess(userEmail, orgMembership);

                        if (fedMembership) {
                            const tabs = ['federations'];
                            if (['owner', 'admin'].includes(fedMembership.federationRole)) {
                                tabs.push('organisations');
                            }
                            if (clubAccess?.hasDirectClubMembership) tabs.push('clubs');
                            setPermissions({
                                role: 'federation_admin',
                                federation: fedMembership.federation,
                                federations: fedMembership.federations,
                                federationRole: fedMembership.federationRole,
                                allowed_tabs: tabs,
                                module_permissions: {},
                                ...(clubAccess ? {
                                    clubs: clubAccess.clubs,
                                    clubRole: clubAccess.clubRole,
                                    hasDirectClubMembership: clubAccess.hasDirectClubMembership,
                                } : {}),
                            });
                        } else if (orgMembership) {
                            const tabs = ['organisations'];
                            if (clubAccess?.hasDirectClubMembership) tabs.push('clubs');
                            setPermissions({
                                role: 'org_owner',
                                org: orgMembership.org,
                                orgs: orgMembership.orgs,
                                orgRole: orgMembership.orgRole,
                                allowed_tabs: tabs,
                                module_permissions: {},
                                ...(clubAccess ? {
                                    clubs: clubAccess.clubs,
                                    clubRole: clubAccess.clubRole,
                                    hasDirectClubMembership: clubAccess.hasDirectClubMembership,
                                } : {}),
                            });
                        } else if (clubAccess) {
                            setPermissions({
                                role: 'club_admin',
                                clubs: clubAccess.clubs,
                                clubRole: clubAccess.clubRole,
                                hasDirectClubMembership: clubAccess.hasDirectClubMembership,
                                allowed_tabs: ['clubs'],
                                module_permissions: {},
                            });
                        } else {
                            setPermissions({ role: 'custom', allowed_tabs: [], module_permissions: {} });
                        }
                    } else {
                        console.error('Error fetching admin permissions:', error);
                        setPermissions({ role: 'custom', allowed_tabs: [], module_permissions: {} });
                    }
                } else {
                    const orgMembership = await resolveOrgMembership(userEmail);
                    const fedMembership = await resolveFederationMembership(userEmail);
                    const clubAccess = await resolveClubAccess(userEmail, orgMembership);
                    const allowed = Array.isArray(data.allowed_tabs) ? [...data.allowed_tabs] : [];
                    if (fedMembership && !allowed.includes('federations')) {
                        allowed.push('federations');
                    }
                    if (orgMembership && !allowed.includes('organisations')) {
                        allowed.push('organisations');
                    }
                    if (clubAccess?.hasDirectClubMembership && !allowed.includes('clubs')) {
                        allowed.push('clubs');
                    }
                    setPermissions({
                        ...data,
                        allowed_tabs: allowed,
                        module_permissions: data.module_permissions || {},
                        ...(orgMembership ? {
                            org: orgMembership.org,
                            orgs: orgMembership.orgs,
                            orgRole: orgMembership.orgRole,
                        } : {}),
                        ...(fedMembership ? {
                            federation: fedMembership.federation,
                            federations: fedMembership.federations,
                            federationRole: fedMembership.federationRole,
                        } : {}),
                        ...(clubAccess ? {
                            clubs: clubAccess.clubs,
                            clubRole: clubAccess.clubRole,
                            hasDirectClubMembership: clubAccess.hasDirectClubMembership,
                        } : {}),
                    });
                }
            } catch (err) {
                console.error('Unexpected error in useAdminPermissions:', err);
                setPermissions({ role: 'custom', allowed_tabs: [], module_permissions: {} });
            } finally {
                setLoading(false);
            }
        };

        fetchPermissions();
        return () => { cancelled = true; };
    }, [userEmail]);

    const hasPermission = (tabId) => {
        if (!permissions) return false;
        if (permissions.role === 'super_admin') return true;
        if (tabId === 'tournament-mgmt') return permissions.tournamentAssignments?.length > 0;
        
        if (tabId === 'event-mgmt' && permissions.module_permissions?.['event-mgmt']?.allowedEvents?.length > 0) return true;
        if (tabId === 'gallery' && permissions.module_permissions?.gallery?.allowedAlbums?.length > 0) return true;
        if (tabId === 'clubs' && permissions.hasDirectClubMembership) return true;
        if (tabId === 'organisations' && permissions.orgs?.length > 0) return true;

        return permissions.allowed_tabs && permissions.allowed_tabs.includes(tabId);
    };

    return { permissions, loading, hasPermission };
};
