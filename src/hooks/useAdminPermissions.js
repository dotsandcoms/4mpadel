import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export const useAdminPermissions = (userEmail) => {
    const [permissions, setPermissions] = useState(null);
    const [loading, setLoading] = useState(true);

    const SUPER_ADMINS = ['bradein@dotsandcoms.co.za', 'brad@dotsandcoms.co.za', 'admin@4mpadel.co.za'];

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
        
        return permissions.allowed_tabs && permissions.allowed_tabs.includes(tabId);
    };

    return { permissions, loading, hasPermission };
};
