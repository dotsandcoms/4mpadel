import { normalEmail } from './permissionsData.js';

const tableName = 'admin_sidebar_permissions';

async function verifyOperator(client, session, signal) {
  signal?.throwIfAborted();
  const { data: identity, error } = await client.auth.getUser();
  const actor = identity?.user;
  if (error || !actor?.id || actor.id !== session?.user?.id || actor.email !== session.user.email) {
    throw new Error('The signed-in account changed. Reopen the permission editor.');
  }
  const [active, platform] = await Promise.all([
    client.rpc('account_is_active'),
    client.rpc('is_super_admin', { user_email: actor.email }),
  ]);
  signal?.throwIfAborted();
  if (active.error || active.data !== true || platform.error || platform.data !== true) {
    throw new Error('Current platform administrator access is required.');
  }
}

function verifiedTarget(record) {
  const email = normalEmail(record.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Choose an existing user with a valid email.');
  return email;
}

function bindCurrentRecord(query, record) {
  return query.eq('email', record.email)
    .filter('role', record.role == null ? 'is' : 'eq', record.role ?? 'null')
    .filter('allowed_tabs', record.allowed_tabs == null ? 'is' : 'eq',
      record.allowed_tabs == null ? 'null' : `{${record.allowed_tabs.map(value => JSON.stringify(value)).join(',')}}`)
    .filter('module_permissions', record.module_permissions == null ? 'is' : 'eq',
      record.module_permissions == null ? 'null' : JSON.stringify(record.module_permissions));
}

export async function saveAccessGrant(client, session, record, draft, signal) {
  const email = verifiedTarget(record);
  if (email !== normalEmail(draft.email)) throw new Error('The target permission record changed.');
  if (!['custom', 'super_admin'].includes(draft.role) && draft.role !== record.role) throw new Error('Choose a supported account role.');
  await verifyOperator(client, session, signal);
  const values = {
    role: draft.role,
    allowed_tabs: draft.role === 'super_admin' ? [] : draft.allowed_tabs,
    module_permissions: draft.role === 'super_admin' ? {} : draft.module_permissions,
  };
  let query = client.from(tableName);
  if (record.isNew) {
    const { data, error } = await client.from('players').select('id,email').eq('id', record.profile.id).maybeSingle();
    signal?.throwIfAborted();
    if (error || data?.id !== record.profile.id || normalEmail(data.email) !== email) {
      throw new Error('The selected user changed. Reopen the editor.');
    }
    await verifyOperator(client, session, signal);
    query = query.insert({ email, ...values });
  } else {
    query = bindCurrentRecord(query.update(values), record);
  }
  const { data, error } = await query.select('email').maybeSingle();
  if (error || !data || normalEmail(data.email) !== email) throw new Error('Access was not confirmed. Refresh the current permission record before trying again.');
}

export async function removeAccessGrant(client, session, record, signal) {
  if (record.isNew) throw new Error('This user has no saved direct permission record.');
  const email = verifiedTarget(record);
  await verifyOperator(client, session, signal);
  const { data, error } = await bindCurrentRecord(client.from(tableName).delete(), record).select('email').maybeSingle();
  if (error || !data || normalEmail(data.email) !== email) throw new Error('Removal was not confirmed. Refresh the current permission record before trying again.');
}
