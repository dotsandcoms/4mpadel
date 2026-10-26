/** Commas separate sponsors; spaces stay inside names such as Under Armour. */
export function parseSponsors(value: string): string[] {
  let names: string[];
  try {
    const parsed: unknown = JSON.parse(value);
    names = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : value.split(',');
  } catch {
    names = value.split(',');
  }
  const seen = new Set<string>();
  return names.map((name) => name.trim()).filter((name) => {
    const key = name.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function serializeSponsors(names: string[]): string {
  const clean = parseSponsors(JSON.stringify(names));
  return clean.length ? JSON.stringify(clean) : '';
}
