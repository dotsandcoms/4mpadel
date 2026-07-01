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
                        // Not found - default to no permissions
                        setPermissions({ role: 'custom', allowed_tabs: [], module_permissions: {} });
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
