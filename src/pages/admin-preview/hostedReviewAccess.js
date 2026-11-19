import { REHEARSAL_TESTER_EMAIL } from '../../utils/privateDrawRehearsal.js';
import { canOpenReviewPage, reviewPages } from './access.js';

function matchUser(actual, expected) {
  return Boolean(actual?.id && actual.email && actual.id === expected?.id && actual.email === expected.email);
}

function read(result) {
  if (result.error) throw new Error('Could not verify your Admin permissions. Try signing in again.');
  return result.data;
}

function ownMemberships(rows, key, email, include = () => true) {
  const unique = new Map();
  for (const row of rows || []) {
    const record = row[key];
    if (row.user_email?.toLowerCase() === email.toLowerCase() && record?.id && include(record)) {
      unique.set(record.id, { ...record, member_role: row.role });
    }
  }
  return [...unique.values()].sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

// Row-level security still applies. A public directory record is never a membership.
export async function verifyHostedReviewAccess(client, expectedUser, signal) {
  const check = () => {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  };
  check();
  const { data: first, error: firstError } = await client.auth.getUser();
  check();
  const user = first?.user;
  if (firstError || !matchUser(user, expectedUser)) throw new Error('Your signed-in account changed or expired. Sign in again.');
  const active = read(await client.rpc('account_is_active'));
  check();
  if (active !== true) throw new Error('An active 4M account is required for this review.');
  const superAdmin = read(await client.rpc('is_super_admin', { user_email: user.email })) === true;
  check();

  let permissions;
  if (!superAdmin && user.email.toLowerCase() === REHEARSAL_TESTER_EMAIL) {
    const canRehearse = read(await client.rpc('can_start_private_draw_rehearsal'));
    if (canRehearse === true) permissions = { role: 'private_rehearsal', allowed_tabs: ['event-mgmt'], module_permissions: {} };
  }
  if (!permissions) {
    const literal = user.email.replace(/[\\%_]/g, '\\$&');
    const [permissionRow, orgRows, clubRows, federationRows, ownPlayer] = await Promise.all([
      superAdmin ? Promise.resolve(null) : client.from('admin_sidebar_permissions').select('email, role, allowed_tabs, module_permissions').eq('email', user.email).maybeSingle().then(read),
      client.from('organisation_members').select('role, user_email, organisations(*)').ilike('user_email', literal).then(read),
      client.from('club_members').select('role, user_email, clubs(*)').ilike('user_email', literal).then(read),
      client.from('federation_members').select('role, user_email, federations(*)').ilike('user_email', literal).then(read),
      client.from('players').select('id, email').ilike('email', literal).maybeSingle().then(read),
    ]);
    check();
    const orgs = ownMemberships(orgRows, 'organisations', user.email, record => record.status === 'approved');
    const clubs = ownMemberships(clubRows, 'clubs', user.email, record => ['published', '4m_approved', '4m_premium'].includes(record.status));
    const federations = ownMemberships(federationRows, 'federations', user.email);
    if (ownPlayer?.id && ownPlayer.email?.toLowerCase() === user.email.toLowerCase()) {
      const created = read(await client.from('organisations').select('*').eq('created_by', ownPlayer.id).eq('status', 'approved').order('name'));
      const membershipIds = new Set(orgs.map(org => org.id));
      for (const org of created || []) {
        if (org.id && String(org.created_by) === String(ownPlayer.id) && !membershipIds.has(org.id)) orgs.push({ ...org, member_role: 'owner' });
      }
    }
    const direct = permissionRow?.email === user.email && permissionRow.role === 'custom' ? permissionRow : null;
    permissions = {
      role: superAdmin ? 'super_admin' : direct ? 'custom' : orgs.length ? 'org_owner' : clubs.length ? 'club_admin' : federations.length ? 'federation_admin' : 'custom',
      allowed_tabs: Array.isArray(direct?.allowed_tabs) ? direct.allowed_tabs : [],
      module_permissions: direct?.module_permissions || {},
      orgs, org: orgs[0], orgRole: orgs[0]?.member_role,
      clubs, clubRole: clubs[0]?.member_role, hasDirectClubMembership: Boolean(clubs.length),
      federations, federation: federations[0], federationRole: federations[0]?.member_role,
    };
    if (!reviewPages.some(page => page !== 'security' && canOpenReviewPage(permissions, page))) {
      throw new Error('There are no Admin workspaces assigned to this account.');
    }
  }

  check();
  const { data: final, error: finalError } = await client.auth.getUser();
  check();
  if (finalError || !matchUser(final?.user, user)) throw new Error('Your signed-in account changed during verification. Sign in again.');
  return { user: { id: user.id, email: user.email }, permissions };
}
