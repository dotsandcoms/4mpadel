export const broadcastBatchSize = 49;
export const broadcastCapability = 1;
const normalize = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const tenantTables = ['organisation_members', 'club_members', 'federation_members'];

export async function emailBroadcastAuthorized(caller, admin) {
  if (!caller) return false;
  const { data, error } = await caller.auth.getUser();
  const email = normalize(data?.user?.email);
  if (error || !data?.user?.id || !email) return false;
  const [active, superAdmin] = await Promise.all([
    caller.rpc('account_is_active'),
    caller.rpc('is_super_admin', { user_email: email }),
  ]);
  if (active.error || active.data !== true || superAdmin.error || typeof superAdmin.data !== 'boolean') return false;
  if (superAdmin.data === true) return true;

  // The LIKE query finds case variants. An exact, unambiguous email match
  // determines authority, including special characters and stored case.
  const literal = email.replace(/[\\%_]/g, '\\$&');
  const pattern = '%' + literal.replace(/\*/g, '%') + '%';
  const grants = await admin.from('admin_sidebar_permissions').select('email,allowed_tabs').ilike('email', pattern);
  if (grants.error || !Array.isArray(grants.data)) return false;
  const exact = grants.data.filter(row => normalize(row.email) === email);
  if (exact.length !== 1 || !Array.isArray(exact[0].allowed_tabs) || !exact[0].allowed_tabs.includes('email-broadcast')) return false;

  // The browser exposes platform publishing to standalone staff. Apply the
  // same boundary to direct Edge calls and check historical creator access.
  const memberships = await Promise.all(tenantTables.map(table => admin.from(table)
    .select('user_email').ilike('user_email', pattern)));
  if (memberships.some(result => result.error || !Array.isArray(result.data)
    || result.data.some(row => normalize(row.user_email) === email))) return false;

  const players = await admin.from('players').select('id,email').ilike('email', pattern);
  if (players.error || !Array.isArray(players.data)) return false;
  const actorProfiles = players.data.filter(row => normalize(row.email) === email);
  if (actorProfiles.length > 1) return false;
  if (!actorProfiles.length) return true;
  const organisations = await admin.from('organisations').select('id')
    .eq('created_by', actorProfiles[0].id).eq('status', 'approved').limit(1);
  return !organisations.error && Array.isArray(organisations.data) && organisations.data.length === 0;
}

export function reviewedBroadcastBatch({ id, to, bcc, subject, message }) {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) || to
    || typeof subject !== 'string' || !subject.trim() || /[\r\n]/.test(subject) || typeof message !== 'string' || !message.trim()
    || !Array.isArray(bcc) || !bcc.length || bcc.length > broadcastBatchSize) return false;
  const emails = bcc.map(normalize);
  return emails.every(email => email.length <= 254 && /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email))
    && new Set(emails).size === emails.length;
}
