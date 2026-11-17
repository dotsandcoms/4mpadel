import { supabase } from './supabase';

export const PROFILE_EMAIL_REDIRECT = 'fourmpadel://email-change';
export function validProfileEmail(value: string) {
  return value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
export async function requestProfileEmailChange(email: string, expectedUserId: string) {
  const address = email.trim().toLowerCase();
  if (!validProfileEmail(address)) throw new Error('Enter a valid email address.');
  const { data: account, error: accountError } = await supabase.auth.getUser();
  if (accountError || account.user?.id !== expectedUserId) throw new Error('Your account changed. Reopen Edit profile and try again.');
  const check = await supabase.rpc('check_own_email_change', { p_email: address });
  if (check.error) throw new Error(check.error.message);
  const { data: latest } = await supabase.auth.getSession();
  if (latest.session?.user.id !== expectedUserId) throw new Error('Your account changed. Reopen Edit profile and try again.');
  // The Auth service sends verification; no player email/permission row changes
  // until it confirms the new address and the atomic database trigger completes.
  const result = await supabase.auth.updateUser({ email: address }, { emailRedirectTo: PROFILE_EMAIL_REDIRECT });
  if (result.error) throw new Error(result.error.message);
  return address;
}
