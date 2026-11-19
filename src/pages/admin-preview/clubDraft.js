import { safeClubWebsite } from './clubDetailsData.js';
export const clubDraftFields = [
  ['name', 'Club name', 200], ['short_name', 'Short name', 100], ['tagline', 'Tagline', 240], ['about', 'About the club', 10000],
  ['city', 'City', 150], ['province', 'Province', 150], ['country', 'Country', 150], ['address', 'Address', 1000],
  ['website_url', 'Website', 2000], ['contact_email', 'Contact email', 254], ['contact_phone', 'Contact phone', 80], ['whatsapp_number', 'WhatsApp number', 80],
];
export const createClubDraft = record => Object.fromEntries(clubDraftFields.map(([key]) => [key, typeof record[key] === 'string' ? record[key] : '']));
export function reviewClubDraft(original, draft) {
  const errors = {}, changes = [];
  for (const [key, label, limit] of clubDraftFields) {
    const value = typeof draft[key] === 'string' ? draft[key].trim() : '';
    const before = typeof original[key] === 'string' ? original[key].trim() : '';
    if (key === 'name' && !value) errors[key] = 'Enter a club name.';
    if (value.length > limit) errors[key] = `Use ${limit} characters or fewer.`;
    if (key === 'website_url' && value && !safeClubWebsite(value)) errors[key] = 'Enter a complete http:// or https:// website address.';
    if (key === 'contact_email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[key] = 'Enter a valid email address.';
    if (value !== before) changes.push({ key, label, before, after: value });
  }
  return { errors, changes };
}

// Builds only the candidate RPC arguments; deliberately performs no request.
// Preserve exact originals (including whitespace/null) for conflict detection.
export function clubProfileSaveArguments(original, draft) {
  const { errors, changes } = reviewClubDraft(original, draft);
  if (!original.id || Object.keys(errors).length || !changes.length) throw new Error('A valid changed club profile is required.');
  return {
    p_club_id: original.id,
    p_changes: Object.fromEntries(changes.map(change => [change.key, change.after || null])),
    p_expected: Object.fromEntries(changes.map(change => [change.key, original[change.key] ?? null])),
  };
}
