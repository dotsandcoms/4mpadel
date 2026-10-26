// Same status-only mutation as the live CoachManager, with fresh authority and
// an atomic original-status predicate so stale decisions cannot overwrite others.
export async function verifyCoachAccess(client, scopeId) {
  if (scopeId !== 'all') throw new Error('Select All 4M Padel before managing coach applications.');
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user?.email) throw new Error('Sign in before managing coach applications.');
  const email = auth.user.email.replace(/[\\%_]/g, '\\$&');
  const { data: grant, error: grantError } = await client.from('admin_sidebar_permissions').select('role,allowed_tabs').ilike('email', email).maybeSingle();
  if (grantError || !(grant?.role === 'super_admin' || grant?.allowed_tabs?.includes('coaches'))) throw new Error('A verified Coaches admin grant is required.');
}
export async function saveCoachStatus(client, original, status, scopeId) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('Choose approve or reject.');
  if (!original?.id) throw new Error('A saved application is required.');
  await verifyCoachAccess(client, scopeId);
  if (original.status === status) return original;
  let query = client.from('coach_applications').update({ status }).eq('id', original.id);
  query = original.status == null ? query.is('status', null) : query.eq('status', original.status);
  const { data, error } = await query.select('id,status').single();
  if (error || !data) throw new Error('The decision could not be confirmed. Refresh the application before trying again; it may have changed.');
  return data;
}
