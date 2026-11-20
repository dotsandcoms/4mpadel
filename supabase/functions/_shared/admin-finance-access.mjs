const isUnassigned = value => value === undefined || (Array.isArray(value) && value.length === 0);

// A platform gateway feed needs a deliberate unscoped Transactions grant.
export function hasExplicitPlatformPaystackGrant(permissions) {
    const finance = permissions?.module_permissions?.finance;
    return Array.isArray(permissions?.allowed_tabs) && permissions.allowed_tabs.includes('finance')
        && Array.isArray(finance?.allowedTabs) && finance.allowedTabs.includes('transactions')
        && isUnassigned(finance.allowedEvents)
        && isUnassigned(permissions.module_permissions?.['event-mgmt']?.allowedEvents);
}

export function hasTenantMembership(permissions) {
    return permissions?.hasDirectClubMembership === true
        || [permissions?.orgs, permissions?.clubs, permissions?.federations].some(rows => Array.isArray(rows) && rows.length > 0);
}
