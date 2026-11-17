export type CompletionProfile = {
  name?: string | null; region?: string | null; contact_number?: string | null;
  gender?: string | null; nationality?: string | null; category?: string | null;
  home_club?: string | null; racket_brand?: string | null; bio?: string | null;
  court_side?: string | null; playing_hand?: string | null;
};
export type PrivateProfileCompletion = { birthDate: boolean; playtomic: boolean };

/** Reminders only: these do not gate login, signup, browsing or profile saves. */
export function missingProfileFields(profile: CompletionProfile | null | undefined, details?: PrivateProfileCompletion): string[] {
  if (!profile) return [];
  const missing: string[] = [];
  for (const [key, label] of [
    ['name', 'Name'], ['region', 'Region'], ['category', 'Category'],
    ['home_club', 'Home club'], ['racket_brand', 'Racket brand'],
  ] as const) if (!profile[key]?.trim()) missing.push(label);
  if (details && !details.birthDate) missing.splice(Math.min(2, missing.length), 0, 'Date of birth');
  if (details && !details.playtomic) missing.push('Playtomic details');
  return missing;
}
