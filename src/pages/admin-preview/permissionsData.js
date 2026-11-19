import { readAll } from './playersData.js';

export const ACCESS_MODULES = [
  ['federations', 'Federations', 'Network'], ['organisations', 'Organisations', 'Network'],
  ['clubs', 'Clubs', 'Network'], ['players', 'Players', 'Network'], ['coaches', 'Coaches', 'Network'],
  ['calendar', 'Calendar', 'Operations'], ['event-mgmt', 'Event Manager', 'Operations'],
  ['tournament-mgmt', 'Tournament Manager (event assignments required)', 'Operations'],
  ['licenses', 'Licences', 'Money'], ['finance', 'Finance', 'Money'], ['gallery', 'Gallery', 'Publishing'],
  ['email-broadcast', 'Email broadcast', 'Publishing'], ['blog', 'Blog', 'Publishing'],
  ['settings', 'Settings', 'System'], ['admin-mgmt', 'Access & permissions', 'System'],
];
export const FINANCE_SECTIONS = ['dashboard', 'summary', 'users', 'transactions', 'settings'];
export const canManageAccess = permissions => permissions?.role === 'super_admin' || permissions?.allowed_tabs?.includes('admin-mgmt');
export const normalEmail = value => String(value || '').trim().toLowerCase();
const escapeLike = value => value.replace(/[\\%_]/g, '\\$&');

// All requests in this boundary are SELECT-only. Drafts never leave the browser.
export async function loadAccessDirectory(client, signal) {
  const grants = await readAll(() => client.from('admin_sidebar_permissions').select('email,role,allowed_tabs,module_permissions,created_at').order('email'), signal);
  const profiles = [];
  for (let i = 0; i < grants.length; i += 50) {
    const emails = grants.slice(i, i + 50).map(row => normalEmail(row.email)).filter(Boolean);
    if (emails.length) profiles.push(...await readAll(() => client.from('players').select('id,name,email,image_url').in('email', emails).order('id'), signal));
  }
  return grants.map(grant => {
    const matches = profiles.filter(profile => normalEmail(profile.email) === normalEmail(grant.email));
    return { ...grant, profile: matches.length === 1 ? matches[0] : null };
  });
}

export async function searchAccessUsers(client, search, signal) {
  const term = search.trim();
  if (term.length < 3) return [];
  const { data, error } = await client.from('players').select('id,name,email,image_url')
    .ilike(term.includes('@') ? 'email' : 'name', `%${escapeLike(term)}%`).order('name').limit(20).abortSignal(signal);
  if (error) throw error;
  return (data || []).filter(row => row.email);
}

export async function loadAccessContext(client, email, signal) {
  const memberships = [['organisation_members', 'organisations', 'organisation_id'], ['club_members', 'clubs', 'club_id'], ['federation_members', 'federations', 'federation_id']];
  const results = await Promise.all(memberships.map(async ([table, relation, membershipKey]) => {
    const rows = await readAll(() => client.from(table).select(`role,${relation}(id,name)`).ilike('user_email', escapeLike(email)).order(membershipKey), signal);
    return rows.filter(row => row[relation]).map(row => ({ type: relation, ...row[relation], role: row.role }));
  }));
  const events = await readAll(() => client.from('calendar').select('id,event_name,start_date').order('id'), signal);
  return { memberships: results.flat(), events };
}

export function accessDraft(record) {
  return { email: normalEmail(record.email), role: record.role || 'custom', allowed_tabs: [...(record.allowed_tabs || [])], module_permissions: structuredClone(record.module_permissions || {}) };
}

export async function loadAccessAlbums(client, signal) {
  return readAll(() => client.from('albums').select('id,title').order('id'), signal);
}

export function accessChanges(original, draft, { events = [] } = {}) {
  const changes = [];
  const difference = (left, right) => [...new Set(left.map(String))].filter(value => !right.some(item => String(item) === value));
  const eventLabel = id => {
    const event = events.find(item => String(item.id) === id);
    return event?.event_name ? `${event.event_name} (Event #${id})` : `Event #${id}`;
  };
  if (original.role !== draft.role) changes.push(`Role: ${original.role} → ${draft.role}`);
  for (const [id, label] of ACCESS_MODULES) {
    const before = original.allowed_tabs.includes(id), after = draft.allowed_tabs.includes(id);
    if (before !== after) changes.push(`${after ? 'Grant' : 'Remove'} direct access: ${label}`);
  }
  for (const [id, label] of [['event-mgmt', 'Event Manager'], ['finance', 'Finance']]) {
    const before = original.module_permissions[id] || {}, after = draft.module_permissions[id] || {};
    const oldEvents = before.allowedEvents || [], newEvents = after.allowedEvents || [];
    for (const eventId of difference(newEvents, oldEvents)) changes.push(`${label}: add ${eventLabel(eventId)}`);
    for (const eventId of difference(oldEvents, newEvents)) changes.push(`${label}: remove ${eventLabel(eventId)}`);
    if (oldEvents.length && !newEvents.length) changes.push(`${label}: no specific event restriction remains; default rules apply, not a denial of access`);
    const defaults = id === 'finance' ? FINANCE_SECTIONS : [];
    const oldTabs = original.module_permissions[id] ? (before.allowedTabs || (id === 'finance' ? ['transactions'] : [])) : defaults;
    const newTabs = draft.module_permissions[id] ? (after.allowedTabs || (id === 'finance' ? ['transactions'] : [])) : defaults;
    for (const tab of difference(newTabs, oldTabs)) changes.push(`${label}: add section ${tab}`);
    for (const tab of difference(oldTabs, newTabs)) changes.push(`${label}: remove section ${tab}`);
  }
  const beforeAlbums = original.module_permissions.gallery?.allowedAlbums || [];
  const afterAlbums = draft.module_permissions.gallery?.allowedAlbums || [];
  for (const id of difference(afterAlbums, beforeAlbums)) changes.push(`Gallery: add Album #${id}`);
  for (const id of difference(beforeAlbums, afterAlbums)) changes.push(`Gallery: remove Album #${id}`);
  if (beforeAlbums.length && !afterAlbums.length) changes.push('Gallery: remove specific album restriction (not a denial of access)');
  return changes;
}
