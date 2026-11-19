import { hasExplicitPlatformPaystackGrant, hasTenantMembership } from '../../../supabase/functions/_shared/admin-finance-access.mjs';

import { resolveEventWorkspace, scopeCalendarQuery } from '../../utils/adminCalendarScope.js';

export const reviewPages = [
  'home', 'events', 'registrations', 'calendar', 'messaging', 'help', 'federations', 'organisations',
  'clubs', 'players', 'coaches', 'payments', 'licenses', 'payouts', 'reports', 'gallery', 'email', 'push',
  'blog', 'team-access', 'settings', 'security', 'tournaments',
];

const moduleTabs = { home: 'dashboard', email: 'email-broadcast', push: 'email-broadcast' };
const managed = row => row.member_role === 'owner' || row.member_role === 'admin';
const scopedPages = ['events', 'registrations', 'calendar', 'reports', 'payouts', 'organisations', 'clubs'];
const routeAliases = { event: 'events', payment: 'registrations', player: 'players' };
const reviewPage = page => routeAliases[page] || page;

export function isReviewTenant(permissions) {
  return hasTenantMembership(permissions);
}

export function canOpenReviewPage(permissions, page) {
  page = reviewPage(page);
  if (!permissions || !reviewPages.includes(page)) return false;
  if (permissions.role === 'super_admin') return true;
  if (permissions.role === 'private_rehearsal') return page === 'events';
  if (page === 'security') return true;
  if (page === 'tournaments') return Boolean(permissions.tournamentAssignments?.length);
  const tabs = permissions.allowed_tabs || [];
  const assignedEvents = permissions.module_permissions?.['event-mgmt']?.allowedEvents || [];
  const organisationAdmin = Boolean(permissions.orgs?.some(managed));
  const clubAdmin = Boolean(permissions.clubs?.some(managed));
  const federationAdmin = Boolean(permissions.federations?.some(managed));
  const tenant = isReviewTenant(permissions);

  if (page === 'team-access') return false;
  if (page === 'payouts') return organisationAdmin;
  if (page === 'organisations') return Boolean(permissions.orgs?.length) || (!tenant && tabs.includes('organisations'));
  if (page === 'clubs') return clubAdmin || (!tenant && tabs.includes('clubs'));
  if (page === 'federations') return federationAdmin || (!tenant && tabs.includes('federations'));
  if (page === 'reports') return organisationAdmin || (!tenant && tabs.includes('finance') && permissions.module_permissions?.finance?.allowedEvents?.length > 0);
  if (page === 'payments') return !tenant && hasExplicitPlatformPaystackGrant(permissions);
  if (page === 'events' || page === 'registrations') return organisationAdmin || clubAdmin || (!tenant && (assignedEvents.length > 0 || tabs.includes('event-mgmt')));
  if (page === 'calendar') return organisationAdmin || clubAdmin || (!tenant && tabs.includes('calendar'));
  if (page === 'messaging' || page === 'help') return organisationAdmin || (!tenant && assignedEvents.length > 0);
  if (page === 'gallery') return !tenant && (tabs.includes('gallery') || permissions.module_permissions?.gallery?.allowedAlbums?.length > 0);
  return !tenant && tabs.includes(moduleTabs[page] || page);
}

export function previewScopes(permissions, page) {
  page = reviewPage(page);
  const platform = permissions?.role === 'super_admin';
  const account = { id: 'all', label: platform ? 'All 4M Padel' : 'My authorised access', type: 'Account scope' };
  if (!permissions || !scopedPages.includes(page)) return [account];
  const memberships = [];
  for (const org of permissions.orgs || []) {
    if (page !== 'clubs' && (platform || page === 'organisations' || managed(org))) memberships.push({ id: `org:${org.id}`, recordId: org.id, label: org.name, kind: 'org', type: 'Organisation' });
  }
  if (!['organisations', 'payouts', 'reports'].includes(page) || (platform && page === 'reports')) {
    for (const club of permissions.clubs || []) {
      if (platform || managed(club)) memberships.push({ id: `club:${club.id}`, recordId: club.id, label: club.name, kind: 'club', type: 'Club' });
    }
  }
  return platform || !isReviewTenant(permissions) ? [account, ...memberships] : memberships;
}

// Session verification and selection happen before data loaders mount. Bind
// event queries to the same scope so a deep link cannot open a different tenant.
export function canReadPreviewEvents(permissions, scope) {
  if (!scope || !canOpenReviewPage(permissions, 'events')) return false;
  return Boolean(resolveEventWorkspace(permissions, scope.id, 'event-mgmt'));
}

export function restrictPreviewEvents(query, permissions, scope) {
  if (!canReadPreviewEvents(permissions, scope)) throw new Error('Event Manager access is required.');
  const workspace = resolveEventWorkspace(permissions, scope.id, 'event-mgmt');
  if (workspace.allowedEvents.length) query = query.in('id', workspace.allowedEvents);
  return scopeCalendarQuery(query, workspace.scopeId);
}
