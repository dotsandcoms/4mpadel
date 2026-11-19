// A narrower gate for the separately hosted review, not a replacement for RLS.
// Never trust a cached session's email to choose the privileged RPC argument.
export async function verifyHostedReviewAccess(client, expectedUser, signal) {
  const check = () => {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  };
  check();
  const { data: first, error: firstError } = await client.auth.getUser();
  check();
  const user = first?.user;
  if (firstError || !user?.id || !user.email || user.id !== expectedUser?.id || user.email !== expectedUser.email) {
    throw new Error('Your signed-in account changed or expired. Sign in again.');
  }
  const { data: active, error: activeError } = await client.rpc('account_is_active');
  check();
  if (activeError || active !== true) throw new Error('An active 4M account is required for this review.');
  // This named overload uses exact equality, unlike the legacy no-argument RPC.
  const { data: allowed, error: allowedError } = await client.rpc('is_super_admin', { user_email: user.email });
  check();
  if (allowedError || allowed !== true) throw new Error('This review is currently limited to existing platform administrators. Use the current admin for delegated access.');
  const { data: final, error: finalError } = await client.auth.getUser();
  check();
  if (finalError || final?.user?.id !== user.id || final.user.email !== user.email) {
    throw new Error('Your signed-in account changed during verification. Sign in again.');
  }
  return { id: user.id, email: user.email };
}
