import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export const SUPER_ADMIN_EMAILS = ['bradein@dotsandcoms.co.za', 'brad@dotsandcoms.co.za', 'admin@4mpadel.co.za', 'markstillerman@gmail.com'];

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
 * Primary source: organization_members. Legacy fallback: organizations.created_by.
 */
async function resolveOrgMembership(userEmail) {
    // 1. New model: organization_members
    const { data: memberships } = await supabase
        .from('organization_members')
        .select('role, organization_id, organizations(*)')
        .ilike('user_email', userEmail);

    const activeOrgs = (memberships || [])
        .filter(m => m.organizations && m.organizations.status === 'approved')
        .map(m => ({ ...m.organizations, member_role: m.role }));

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
            .from('organizations')
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

export const useAdminPermissions = (userEmail) => {
    const [permissions, setPermissions] = useState(null);
    const [loading, setLoading] = useState(true);

    const SUPER_ADMINS = SUPER_ADMIN_EMAILS;

    useEffect(() => {
        const fetchPermissions = async () => {
            if (!userEmail) {
                setLoading(false);
                return;
            }

            try {
                // Hardcoded fallback for Super Admins to ensure they don't get locked out
                if (SUPER_ADMINS.includes(userEmail)) {
                    setPermissions({ role: 'super_admin', allowed_tabs: [], module_permissions: {} });
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
                        // Not a 4M admin — check organisation membership
                        const orgMembership = await resolveOrgMembership(userEmail);
                        if (orgMembership) {
                            setPermissions({
                                role: 'org_owner',
                                org: orgMembership.org,
                                orgs: orgMembership.orgs,
                                orgRole: orgMembership.orgRole,
                                allowed_tabs: ['organizations'],
                                module_permissions: {}
                            });
                        } else {
                            // Not found - default to no permissions
                            setPermissions({ role: 'custom', allowed_tabs: [], module_permissions: {} });
                        }
                    } else {
                        console.error('Error fetching admin permissions:', error);
                        // Fallback to minimal permissions on error
                        setPermissions({ role: 'custom', allowed_tabs: [], module_permissions: {} });
                    }
                } else {
                    setPermissions({
                        ...data,
                        module_permissions: data.module_permissions || {}
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
    }, [userEmail]);

    const hasPermission = (tabId) => {
        if (!permissions) return false;
        if (permissions.role === 'super_admin') return true;
        
        if (tabId === 'event-mgmt' && permissions.module_permissions?.['event-mgmt']?.allowedEvents?.length > 0) return true;
        if (tabId === 'gallery' && permissions.module_permissions?.gallery?.allowedAlbums?.length > 0) return true;

        return permissions.allowed_tabs && permissions.allowed_tabs.includes(tabId);
    };

    return { permissions, loading, hasPermission };
};
