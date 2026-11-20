import { hasExplicitPlatformPaystackGrant, hasTenantMembership } from '../../../supabase/functions/_shared/admin-finance-access.mjs';

import { resolveEventWorkspace, scopeCalendarQuery } from '../../utils/adminCalendarScope.js';
import { standaloneFinanceEventGrant } from './financeGrantScope.js';

export const reviewPages = [
  'home', 'events', 'registrations', 'calendar', 'messaging', 'help', 'federations', 'organisations',
  'clubs', 'players', 'coaches', 'payments', 'licenses', 'payouts', 'reports', 'gallery', 'email', 'push',
  'blog', 'team-access', 'settings', 'security', 'tournaments', 'integrations', 'audit-log',
];

const moduleTabs = { home: 'dashboard', email: 'email-broadcast', push: 'email-broadcast' };
const managed = row => row.member_role === 'owner' || row.member_role === 'admin';
const scopedPages = ['events', 'registrations', 'calendar', 'reports', 'payouts', 'organisations', 'clubs', 'audit-log'];
const routeAliases = { event: 'events', payment: 'registrations', player: 'players', integrations: 'settings' };
const reviewPage = page => routeAliases[page] || page;

export function isReviewTenant(permissions) {
  return hasTenantMembership(permissions);
}

export function standaloneFinanceSummary(permissions) {
  return standaloneFinanceEventGrant(permissions, 'summary');
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
  if (page === 'clubs') return clubAdmin || Boolean(permissions.clubDirectoryClubs?.length) || (!tenant && tabs.includes('clubs'));
  if (page === 'federations') return federationAdmin || (!tenant && tabs.includes('federations'));
  if (page === 'reports') return organisationAdmin
    || ['summary', 'users', 'dashboard'].some(tab => standaloneFinanceEventGrant(permissions, tab))
    || (!tenant && tabs.includes('finance') && permissions.module_permissions?.finance?.allowedEvents?.length > 0);
  if (page === 'payments') return !tenant && hasExplicitPlatformPaystackGrant(permissions);
  if (page === 'events' || page === 'registrations' || page === 'audit-log') return organisationAdmin || clubAdmin || (!tenant && (assignedEvents.length > 0 || tabs.includes('event-mgmt')));
  if (page === 'calendar') return organisationAdmin || clubAdmin || (!tenant && tabs.includes('calendar'));
  if (page === 'messaging' || page === 'help') {
    // The legacy Event Manager exposed both launchers to explicit grants.
    // Messaging and Help RPCs separately verify each event and thread.
    const assigned = Array.isArray(assignedEvents) && assignedEvents.some(id => {
      if (typeof id !== 'number' && (typeof id !== 'string' || !/^\d+$/.test(id))) return false;
      return Number.isSafeInteger(Number(id)) && Number(id) > 0;
    });
    return organisationAdmin || tabs.includes('event-mgmt') || assigned;
  }
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
  if (page === 'clubs') {
    for (const club of permissions.clubDirectoryClubs || []) {
      memberships.push({ id: `club:${club.id}`, recordId: club.id, label: club.name, kind: 'club', type: 'Club' });
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

export function canOpenPreviewEventRecord(permissions, scope, event) {
  if (!scope || !canOpenReviewPage(permissions, 'events') || !/^\d+$/.test(String(event?.id))) return false;
  const workspace = resolveEventWorkspace(permissions, scope.id, 'event-mgmt');
  const id = Number(event.id);
  if (!workspace || !Number.isSafeInteger(id) || id < 1 || (workspace.allowedEvents.length && !workspace.allowedEvents.includes(id))) return false;
  if (workspace.scopeId === 'all') return true;
  const [kind, owner] = workspace.scopeId.split(':');
  return String(event[kind === 'org' ? 'organisation_id' : 'club_id']) === owner;
}

export function restrictPreviewEvents(query, permissions, scope) {
  if (!canReadPreviewEvents(permissions, scope)) throw new Error('Event Manager access is required.');
  const workspace = resolveEventWorkspace(permissions, scope.id, 'event-mgmt');
  if (workspace.allowedEvents.length) query = query.in('id', workspace.allowedEvents);
  return scopeCalendarQuery(query, workspace.scopeId);
}
