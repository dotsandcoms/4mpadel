import { hasTenantMembership } from '../../../supabase/functions/_shared/admin-finance-access.mjs';

export function standaloneFinanceEventGrant(permissions, tab) {
  if (permissions?.role !== 'custom' || !Array.isArray(permissions.allowed_tabs) || !permissions.allowed_tabs.includes('finance')
    || hasTenantMembership(permissions)) return null;
  const modules = permissions.module_permissions;
  if (modules != null && (typeof modules !== 'object' || Array.isArray(modules))) return null;
  const finance = modules?.finance;
  // Current Admin defaults to these reports without granular Finance settings.
  // Gateway access still has its own explicit platform grant.
  const tabs = finance == null ? ['dashboard', 'summary', 'users'] : finance.allowedTabs;
  if (!Array.isArray(tabs) || !tabs.includes(tab)) return null;
  for (const values of [finance?.allowedEvents, modules?.['event-mgmt']?.allowedEvents]) {
    if (values === undefined || (Array.isArray(values) && !values.length)) continue;
    if (!Array.isArray(values) || values.some(id => !/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) return null;
    return { mode: 'assigned', assigned: [...new Set(values.map(Number))].sort((a, b) => a - b), label: 'Assigned finance events' };
  }
  return { mode: 'managed', label: 'Finance-managed events' };
}
