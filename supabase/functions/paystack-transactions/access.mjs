import { hasExplicitPlatformPaystackGrant } from '../_shared/admin-finance-access.mjs';

const tenantTables = ['organisation_members', 'club_members', 'federation_members'];
const literalPattern = value => value.replace(/[\\%_]/g, '\\$&');

// user comes from the request JWT's verified Auth user, never from request input.
export async function canReadPaystackTransactions(caller, service, user) {
    if (!user?.id || !user.email) return false;
    const { data: active, error: activeError } = await caller.rpc('account_is_active');
    if (activeError || active !== true) return false;

    const { data: platform, error: platformError } = await caller.rpc('is_super_admin', { user_email: user.email });
    if (platformError || typeof platform !== 'boolean') return false;
    if (platform) return true;

    const email = user.email.trim().toLowerCase();
    const emailPattern = literalPattern(email);
    const { data: permission, error } = await service.from('admin_sidebar_permissions')
        .select('email, allowed_tabs, module_permissions').ilike('email', emailPattern).maybeSingle();
    if (error || permission?.email?.trim().toLowerCase() !== email || !hasExplicitPlatformPaystackGrant(permission)) return false;

    const memberships = await Promise.all(tenantTables.map(table => service.from(table)
        .select('user_email').ilike('user_email', emailPattern).limit(1)));
    if (!memberships.every(result => !result.error && Array.isArray(result.data) && result.data.length === 0)) return false;

    // Historical hosts can still be recognised through the organisation creator.
    const profiles = await service.from('players').select('id').ilike('email', emailPattern).limit(2);
    if (profiles.error || !Array.isArray(profiles.data) || profiles.data.length > 1) return false;
    const profile = profiles.data[0];
    if (!profile) return true;
    const organisations = await service.from('organisations').select('id').eq('created_by', profile.id).eq('status', 'approved').limit(1);
    return !organisations.error && Array.isArray(organisations.data) && organisations.data.length === 0;
}
