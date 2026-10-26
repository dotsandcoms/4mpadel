// Recheck identity and current role before the existing admin creation workflow.
// This is a UI guard, not a replacement for database/storage RLS.
export async function verifyClubCreationAccess(client, scopeId, expectedUserId) {
  if (scopeId !== 'all') throw new Error('Platform Clubs access is required to create a club.');
  const { data, error } = await client.auth.getUser();
  const email = data?.user?.email;
  if (error || !data?.user?.id || typeof email !== 'string' || !email.trim()) throw new Error('Sign in before creating a club.');
  if (expectedUserId != null && data.user.id !== expectedUserId) throw new Error('The signed-in account changed. Reopen club creation before continuing.');
  const { data: active, error: activeError } = await client.rpc('account_is_active');
  if (activeError || active !== true) throw new Error('An active account is required to create a club.');
  const { data: allowed, error: roleError } = await client.rpc('is_super_admin', { user_email: email });
  if (roleError || allowed !== true) throw new Error('A verified super-admin account is required to create a club.');
  const { data: final, error: finalError } = await client.auth.getUser();
  if (finalError || final?.user?.id !== data.user.id || final.user.email !== email) throw new Error('The signed-in account changed. Reopen club creation before continuing.');
  return true;
}
