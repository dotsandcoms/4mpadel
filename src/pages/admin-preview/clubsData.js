import { hasTenantMembership } from '../../../supabase/functions/_shared/admin-finance-access.mjs';
import { readAll } from './playersData.js';

export function clubDirectoryScope(permissions, scopeId) {
  if (scopeId === 'all') {
    return permissions?.role === 'super_admin' || (!hasTenantMembership(permissions) && permissions?.allowed_tabs?.includes('clubs'))
      ? { clubId: null } : null;
  }
  const match = /^club:([^:]+)$/.exec(scopeId || '');
  if (!match) return null;
  const clubId = match[1];
  const own = permissions?.clubs?.some(club => String(club.id) === clubId && ['owner', 'admin'].includes(club.member_role));
  return permissions?.role === 'super_admin' || own ? { clubId } : null;
}

export const canReadClubDirectory = (session, permissions, scopeId) =>
  Boolean(session?.user?.id && clubDirectoryScope(permissions, scopeId));

export async function loadClubDirectory(client, session, permissions, scopeId, signal, onProgress) {
  if (!canReadClubDirectory(session, permissions, scopeId)) throw new Error('Current Clubs access is required.');
  const { clubId } = clubDirectoryScope(permissions, scopeId);
  return readAll(() => {
    let query = client.from('clubs')
      .select('id,name,short_name,slug,status,verified,sapa_registered,logo_url,city,province,country,club_type,created_at')
      .order('id');
    if (clubId) query = query.eq('id', clubId);
    return query;
  }, signal, onProgress);
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
