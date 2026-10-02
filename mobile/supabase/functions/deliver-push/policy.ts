export function deliveryDecision(
  outbox: { email: string; type: string; created_at: string },
  token: { email: string; token_kind: string } | null,
  prefs: Record<string, unknown>,
  now = Date.now(),
): string | null {
  if (!token || token.token_kind !== 'expo' || token.email.trim().toLowerCase() !== outbox.email.trim().toLowerCase()) return 'Device no longer belongs to recipient';
  if (prefs.push_enabled === false || prefs[outbox.type] === false) return 'Disabled in notification settings';
  if (now - Date.parse(outbox.created_at) > 24 * 60 * 60 * 1000) return 'Notification expired';
  return null;
}
export function retryDelay(attempt: number) { return Math.min(3600000, 30000 * 2 ** Math.max(0, attempt - 1)); }
