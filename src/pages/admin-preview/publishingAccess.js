import { SUPER_ADMIN_EMAILS } from '../../utils/adminIdentity.js';
import { readAll } from './playersData.js';

const cancelled = signal => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
const normalEmail = value => String(value || '').trim().toLowerCase();

// Source: useAdminPermissions.hasPermission. Recheck the authenticated account
// and current grant at each data boundary; caller-supplied permissions only drive UI.
export async function verifyPublishingAccess(client, scopeId, expectedUserId, moduleId, signal) {
  cancelled(signal);
  if (!['gallery', 'email-broadcast'].includes(moduleId)) throw new Error('Unknown publishing module.');
  if (scopeId !== 'all') throw new Error('Open this publishing module in your account workspace.');
  if (!expectedUserId) throw new Error('Sign in to open this publishing module.');
  const { data, error } = await client.auth.getUser();
  cancelled(signal);
  const user = data?.user, email = normalEmail(user?.email);
  if (error || !user || user.id !== expectedUserId || !email) throw new Error('The signed-in account changed. Reopen the publishing module.');
  if (SUPER_ADMIN_EMAILS.includes(email)) return { email, role: 'super_admin', allowed_tabs: [], module_permissions: {} };
  // LIKE is only a candidate filter; compare normalized addresses exactly below.
  // This handles PostgREST's * alias, stored case and whitespace without letting
  // another email's grant authorize this caller.
  const pattern = '%' + email.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '%') + '%';
  const rows = await readAll(() => client.from('admin_sidebar_permissions')
    .select('email,role,allowed_tabs,module_permissions').ilike('email', pattern).order('email'), signal);
  cancelled(signal);
  const matches = rows.filter(row => normalEmail(row.email) === email);
  if (matches.length !== 1) throw new Error('A current publishing permission is required.');
  const grant = matches[0];
  const albumGrant = moduleId === 'gallery' && Array.isArray(grant.module_permissions?.gallery?.allowedAlbums) && grant.module_permissions.gallery.allowedAlbums.length > 0;
  const directGrant = Array.isArray(grant.allowed_tabs) && grant.allowed_tabs.includes(moduleId);
  if (grant.role !== 'super_admin' && !directGrant && !albumGrant) throw new Error(`Your account does not have ${moduleId === 'gallery' ? 'Gallery' : 'Email broadcast'} access.`);
  return { ...grant, email };
}
