export const broadcastBatchSize = 49;
export const broadcastCapability = 1;
const normalize = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

export async function emailBroadcastAuthorized(caller, admin) {
  if (!caller) return false;
  const { data, error } = await caller.auth.getUser();
  const email = normalize(data?.user?.email);
  if (error || !data?.user?.id || !email) return false;
  const [active, superAdmin] = await Promise.all([
    caller.rpc('account_is_active'),
    caller.rpc('is_super_admin', { user_email: email }),
  ]);
  if (active.error || active.data !== true || superAdmin.error) return false;
  if (superAdmin.data === true) return true;

  // The LIKE query finds case variants. An exact, unambiguous email match
  // determines authority, including special characters and stored case.
  const pattern = '%' + email.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '%') + '%';
  const grants = await admin.from('admin_sidebar_permissions').select('email,allowed_tabs').ilike('email', pattern);
  if (grants.error || !Array.isArray(grants.data)) return false;
  const exact = grants.data.filter(row => normalize(row.email) === email);
  return exact.length === 1 && Array.isArray(exact[0].allowed_tabs) && exact[0].allowed_tabs.includes('email-broadcast');
}

export function reviewedBroadcastBatch({ id, to, bcc, subject, message }) {
  if (typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id) || to
    || typeof subject !== 'string' || !subject.trim() || /[\r\n]/.test(subject) || typeof message !== 'string' || !message.trim()
    || !Array.isArray(bcc) || !bcc.length || bcc.length > broadcastBatchSize) return false;
  const emails = bcc.map(normalize);
  return emails.every(email => email.length <= 254 && /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email))
    && new Set(emails).size === emails.length;
}
