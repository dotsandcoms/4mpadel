import { hasTenantMembership } from '../../../supabase/functions/_shared/admin-finance-access.mjs';

export function standaloneFinanceEventGrant(permissions, tab) {
  if (permissions?.role !== 'custom' || !Array.isArray(permissions.allowed_tabs) || !permissions.allowed_tabs.includes('finance')
    || hasTenantMembership(permissions)) return null;
  const finance = permissions.module_permissions?.finance;
  if (!Array.isArray(finance?.allowedTabs) || !finance.allowedTabs.includes(tab)) return null;
  for (const values of [finance.allowedEvents, permissions.module_permissions?.['event-mgmt']?.allowedEvents]) {
    if (values === undefined || (Array.isArray(values) && !values.length)) continue;
    if (!Array.isArray(values) || values.some(id => !/^\d+$/.test(String(id)) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0)) return null;
    return { mode: 'assigned', assigned: [...new Set(values.map(Number))].sort((a, b) => a - b), label: 'Assigned finance events' };
  }
  return { mode: 'managed', label: 'Finance-managed events' };
}
