// Creation uses EventBuilder's existing validation and persistence. This guard
// only authorises the operation; it does not insert or reinterpret event data.
export async function verifyEventCreationAccess(client, context = {}) {
  if (context.scopeId && context.scopeId !== 'all') throw new Error('Event creation requires all-workspaces scope.');
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user?.email) throw new Error('Sign in before creating an event.');
  if (context.expectedUserId && data.user.id !== context.expectedUserId) throw new Error('The signed-in account changed. Close and reopen the editor.');
  const { data: permission, error: permissionError } = await client.from('admin_sidebar_permissions')
    .select('role').eq('email', data.user.email).maybeSingle();
  if (permissionError || permission?.role !== 'super_admin') throw new Error('A verified super-admin account is required.');
  if (context.event?.id || context.sourceEvent?.id || context.form?.series_id
    || context.payload?.series_id || (context.removedDivisionIds || []).length
    || (context.divisions || []).some(division => division.id)) {
    throw new Error('Creation cannot update an existing event, series or division. Close and open the existing event to edit it.');
  }
  return { user: data.user };
}
