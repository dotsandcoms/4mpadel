export type ResultPlayer = { name: string; photo: string | null };
export type ResultHighlight = { division: string; winners: ResultPlayer[]; runnerUp: string | null; divisionCount: number };
type PublicPortrait = { id: number; name: string | null; image_url: string | null };

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const named = (value: unknown) => value && typeof value === 'object' ? text((value as { Name?: unknown }).Name) : '';
const pending = /^(pending|tbd|bye|to be confirmed|unknown)$/i;

/** Read cached published winners; never infer a champion from dates or match scores. */
export function resultHighlight(raw: unknown): ResultHighlight | null {
  let rows = raw;
  if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch { return null; } }
  if (!Array.isArray(rows)) return null;
  const divisions = rows.flatMap(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
    const division = text(row.CategoryName) || text(row.className);
    const name = named(row.Winner) || text(row.winners);
    const names = name.split(/\s*(?:&|\s\/\s)\s*/).map(part => part.trim()).filter(Boolean);
    if (!division || !names.length || names.some(part => pending.test(part))) return [];
    return [{ division, winners: names.map(name => ({ name, photo: null })), runnerUp: named(row.RunnerUp) || text(row.runnerUp) || null }];
  });
  const selected = divisions.find(row => /\bmen(?:[’']?s)?\s+open\b/i.test(row.division)) ?? divisions[0];
  return selected ? { ...selected, divisionCount: new Set(divisions.map(row => row.division.toLowerCase())).size } : null;
}

/** Names are the cache's only identity. Ambiguous public profiles keep initials. */
export function resultPortraits(highlight: ResultHighlight, profiles: PublicPortrait[]): ResultHighlight {
  return { ...highlight, winners: highlight.winners.map(player => {
    const matches = profiles.filter(profile => profile.name?.trim() === player.name);
    const unique = new Map(matches.map(profile => [profile.id, profile]));
    return { ...player, photo: unique.size === 1 ? [...unique.values()][0].image_url : null };
  }) };
}
