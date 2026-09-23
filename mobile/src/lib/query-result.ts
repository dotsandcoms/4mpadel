/** Supabase joins may arrive as an object or array depending on the relationship. */
export function joinedOne<T>(value: unknown): T | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === 'object' ? row as T : null;
}
