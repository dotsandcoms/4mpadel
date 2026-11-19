// Same status-only mutation as the live CoachManager, with fresh authority and
// an atomic original-status predicate so stale decisions cannot overwrite others.
const emailKey = value => String(value || '').trim().toLowerCase();

export async function verifyCoachAccess(client, scopeId, expectedActor) {
  if (scopeId !== 'all') throw new Error('Select All 4M Padel before managing coach applications.');
  const { data: auth, error: authError } = await client.auth.getUser();
  const actor = auth?.user;
  const email = emailKey(actor?.email);
  if (authError || !actor?.id || !email || (expectedActor && (actor.id !== expectedActor.id || emailKey(expectedActor.email) !== email))) {
    throw new Error('Sign in as the same Coaches administrator to continue.');
  }
  const [active, platform] = await Promise.all([
    client.rpc('account_is_active'),
    client.rpc('is_super_admin', { user_email: email }),
  ]);
  if (active.error || active.data !== true || platform.error) throw new Error('An active Coaches administrator is required.');
  if (platform.data !== true) {
    const pattern = '%' + email.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '%') + '%';
    const { data, error } = await client.from('admin_sidebar_permissions').select('email,role,allowed_tabs').ilike('email', pattern);
    const exact = data?.filter(grant => emailKey(grant.email) === email) || [];
    if (error || exact.length !== 1 || !(exact[0].role === 'super_admin' || exact[0].allowed_tabs?.includes('coaches'))) {
      throw new Error('A verified Coaches admin grant is required.');
    }
  }
  const { data: final, error } = await client.auth.getUser();
  if (error || final?.user?.id !== actor.id || emailKey(final.user.email) !== email) {
    throw new Error('The signed-in account changed. Reopen the application.');
  }
  return { id: actor.id, email };
}
export async function saveCoachStatus(client, original, status, scopeId, expectedActor) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Choose approve or reject.');
  if (!original?.id) throw new Error('A saved application is required.');
  await verifyCoachAccess(client, scopeId, expectedActor);
  if (original.status === status) return original;
  let query = client.from('coach_applications').update({ status }).eq('id', original.id);
  query = original.status == null ? query.is('status', null) : query.eq('status', original.status);
  const { data, error } = await query.select('id,status').single();
  if (error || !data) throw new Error('The decision could not be confirmed. Refresh the application before trying again; it may have changed.');
  return data;
}
