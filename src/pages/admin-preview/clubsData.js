import { hasTenantMembership } from '../../../supabase/functions/_shared/admin-finance-access.mjs';
import { readAll } from './playersData.js';

const additionalStatuses = ['unclaimed', 'draft', 'archived', 'published', '4m_approved', '4m_premium'];
export const isClubDirectoryStatus = status => additionalStatuses.includes(status);
export const canManageClubRole = role => role === 'owner' || role === 'admin';

export function canManageDirectClub(permissions, clubId) {
  return Boolean(permissions?.clubs?.some(club => String(club.id) === clubId && canManageClubRole(club.member_role))
    || permissions?.clubDirectoryClubs?.some(club => String(club.id) === clubId && club.directory_authority === 'direct' && canManageClubRole(club.member_role)));
}

export function clubDirectoryScope(permissions, scopeId) {
  if (scopeId === 'all') {
    return permissions?.role === 'super_admin' || (!hasTenantMembership(permissions) && permissions?.allowed_tabs?.includes('clubs'))
      ? { clubId: null } : null;
  }
  const match = /^club:([^:]+)$/.exec(scopeId || '');
  if (!match) return null;
  const clubId = match[1];
  const additional = permissions?.clubDirectoryClubs?.some(club => String(club.id) === clubId);
  if (permissions?.role === 'super_admin') return { clubId };
  if (additional) return { clubId, verifyManagement: true };
  return canManageDirectClub(permissions, clubId) ? { clubId } : null;
}

export const canReadClubDirectory = (session, permissions, scopeId) =>
  Boolean(session?.user?.id && clubDirectoryScope(permissions, scopeId));

export async function verifyClubDirectoryManagement(client, session, scope, signal) {
  if (!scope.verifyManagement) return;
  const actor = session.user;
  const checkAccount = async () => {
    signal?.throwIfAborted();
    const { data, error } = await client.auth.getUser();
    signal?.throwIfAborted();
    if (error || data?.user?.id !== actor.id || !actor.email || data.user.email !== actor.email) {
      throw new Error('Your signed-in account changed. Reopen Clubs.');
    }
  };
  await checkAccount();
  const [active, allowed] = await Promise.all([
    client.rpc('account_is_active'),
    client.rpc('can_manage_club', { p_club_id: scope.clubId }),
  ]);
  if (active.error || active.data !== true || allowed.error || allowed.data !== true) {
    throw new Error('Current permission to manage this club is required.');
  }
  await checkAccount();
}

export async function loadClubDirectory(client, session, permissions, scopeId, signal, onProgress) {
  if (!canReadClubDirectory(session, permissions, scopeId)) throw new Error('Current Clubs access is required.');
  const scope = clubDirectoryScope(permissions, scopeId);
  await verifyClubDirectoryManagement(client, session, scope, signal);
  const rows = await readAll(() => {
    let query = client.from('clubs')
      .select('id,name,short_name,slug,status,verified,sapa_registered,logo_url,city,province,country,club_type,created_at')
      .order('id');
    if (scope.clubId) query = query.eq('id', scope.clubId);
    return query;
  }, signal, onProgress);
  return scope.verifyManagement ? rows.filter(club => club.id === scope.clubId && isClubDirectoryStatus(club.status)) : rows;
}

export const clubStatusLabel = status => ({
  draft: 'Draft', unclaimed: 'Unclaimed', in_review: 'In review', pending: 'Pending',
  published: 'Published', '4m_approved': '4M approved', '4m_premium': '4M premium',
  rejected: 'Rejected', archived: 'Archived',
}[status] || (status ? `Unknown status: ${String(status)}` : 'Status unavailable'));

export function filterClubDirectory(rows, { query = '', status = '', province = '', verification = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return rows.filter(row => (!status || row.status === status) && (!province || row.province === province)
    && (!verification || (verification === 'verified' ? row.verified === true : row.verified === false))
    && (!needle || [row.name, row.short_name, row.city, row.province, row.country, row.id].some(value => String(value ?? '').toLowerCase().includes(needle))))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || String(a.id).localeCompare(String(b.id)));
}

export function clubDirectorySummary(rows) {
  return { total: rows.length, verified: rows.filter(row => row.verified === true).length,
    inReview: rows.filter(row => row.status === 'in_review' || row.status === 'pending').length,
    sapaRegistered: rows.filter(row => row.sapa_registered === true).length };
}
