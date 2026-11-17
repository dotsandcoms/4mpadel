export type ResultPlayer = { name: string; photo: string | null; profileId?: number | null; country?: string | null; ranking?: { label: string; rank: number } | null };
export type WinnerFinal = { matchId: string; classId: string; choiceId: string; source: 'native' | 'rankedin'; scores: number[][]; summary: boolean; court: string | null; status: string };
export type ResultHighlight = { division: string; winners: ResultPlayer[]; runnerUp: string | null; divisionCount: number; runnersUp?: ResultPlayer[]; final?: WinnerFinal | null };
type PublicPortrait = { id: number; name: string | null; image_url: string | null };

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const named = (value: unknown) => value && typeof value === 'object' ? text((value as { Name?: unknown }).Name) : '';
const pending = /^(pending|tbd|bye|to be confirmed|unknown)$/i;

export const resultHighlightKey = (result: Pick<ResultHighlight, 'division' | 'winners'>) => JSON.stringify([
  result.division.trim().toLowerCase(), result.winners.map(player => player.name.trim().toLowerCase()).sort(),
]);

/** Keep every published winning pair in source order, without preferring a division. */
export function resultHighlights(raw: unknown): ResultHighlight[] {
  let rows = raw;
  if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch { return []; } }
  if (!Array.isArray(rows)) return [];
  const divisions = rows.flatMap(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
    const division = text(row.CategoryName) || text(row.className);
    const name = named(row.Winner) || text(row.winners);
    const names = name.split(/\s*(?:&|\s\/\s)\s*/).map(part => part.trim()).filter(Boolean);
    if (!division || !names.length || names.some(part => pending.test(part))) return [];
    return [{ division, winners: names.map(name => ({ name, photo: null })), runnerUp: named(row.RunnerUp) || text(row.runnerUp) || null }];
  });
  const unique = [...new Map(divisions.map(row => [resultHighlightKey(row), row])).values()];
  const divisionCount = new Set(unique.map(row => row.division.toLowerCase())).size;
  return unique.map(row => ({ ...row, divisionCount }));
}

/** Compatibility for callers that need one preview; follow the published order. */
export function resultHighlight(raw: unknown): ResultHighlight | null {
  return resultHighlights(raw)[0] ?? null;
}

/** Names are the cache's only identity. Ambiguous public profiles keep initials. */
export function resultPortraits(highlight: ResultHighlight, profiles: PublicPortrait[]): ResultHighlight {
  return { ...highlight, winners: highlight.winners.map(player => {
    const matches = profiles.filter(profile => profile.name?.trim() === player.name);
    const unique = new Map(matches.map(profile => [profile.id, profile]));
    return { ...player, photo: unique.size === 1 ? [...unique.values()][0].image_url : null };
  }) };
}
