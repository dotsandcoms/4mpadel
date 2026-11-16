export const PROOF_BUCKET = 'playtomic-proofs';
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function profileToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function birthDateError(value, today = profileToday()) {
  if (!value) return 'Enter your date of birth.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Enter a valid date of birth (YYYY-MM-DD).';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '1900-01-01' || value > today) return 'Enter a valid date of birth in the past.';
  return null;
}

export function ageFromBirthDate(value, today = profileToday()) {
  if (birthDateError(value, today)) return null;
  const years = Number(today.slice(0, 4)) - Number(value.slice(0, 4));
  return years - (today.slice(5) < value.slice(5) ? 1 : 0);
}

export function playtomicError(level) {
  const value = String(level ?? '').trim();
  if (!value) return 'Enter your Playtomic level.';
  if (!/^\d(?:\.\d{1,2})?$/.test(value) || Number(value) > 7) return 'Enter a Playtomic level from 0 to 7, with up to two decimal places.';
  return null;
}

export function proofFileError(file) {
  if (!file || !PROOF_TYPES[file.type]) return 'Choose a JPG, PNG or WebP image.';
  if (!file.size || file.size > MAX_PROOF_BYTES) return 'Choose an image up to 5 MB.';
  return null;
}

export async function getProfileDetails(client, playerId) {
  const { data, error } = await client.rpc('get_player_profile_details', { p_player_id: playerId });
  if (error) throw new Error('Your private profile details could not be loaded. Please try again.');
  return data;
}

export async function saveProfileDetails(client, playerId, value) {
  const issue = birthDateError(value.date_of_birth) || playtomicDetailsError(value);
  if (issue) throw new Error(issue);
  const { data, error } = await client.rpc('save_player_profile_details_v3', { p_player_id: playerId, p_details: playtomicDetailsPayload(value) });
  if (error) throw new Error(error.message);
  return data;
}

export async function extractPlaytomicProfile(client, path) {
  const { data, error } = await client.functions.invoke('extract-playtomic-level', { body: { proof_path: path } });
  if (error) {
    let message = 'The screenshot could not be read. Enter your level manually or try again.';
    try {
      const body = await error.context?.json();
      if (typeof body?.error === 'string') message = body.error;
    } catch { /* Network errors may have no response body. */ }
    throw new Error(message);
  }
  return parsePlaytomicExtraction(data);
}

export function parsePlaytomicExtraction(data) {
  if (!['detected', 'not_found'].includes(data?.status)) return null;
  const bounded = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8 ? value : null;
  const result = { level: bounded(data.level, 7), matches: Number.isInteger(data.matches) && data.matches >= 0 && data.matches <= 2147483647 ? data.matches : null,
    reliability_percent: bounded(data.reliability_percent, 100) };
  return Object.values(result).some(value => value !== null) ? result : null;
}

export async function extractPlaytomicLevel(client, path) {
  return (await extractPlaytomicProfile(client, path))?.level ?? null;
}

export function playtomicDetailsError(value) {
  if (value.playtomic_no_profile === true) return null;
  return playtomicError(value.playtomic_level) || (!value.playtomic_proof_path ? 'Upload a screenshot or confirm you do not have a Playtomic profile or level.' : null);
}

export function playtomicDetailsPayload(value) {
  const none = value.playtomic_no_profile === true;
  return { date_of_birth: value.date_of_birth, playtomic_no_profile: none,
    playtomic_level: none ? null : Number(value.playtomic_level),
    playtomic_proof_path: none ? null : value.playtomic_proof_path || null };
}

export function playtomicPrivateFields(details) {
  return { playtomic_no_profile: details?.playtomic_no_profile === true,
    playtomic_extracted_level: details?.playtomic_extracted_level ?? null,
    playtomic_matches: details?.playtomic_matches ?? null,
    playtomic_reliability_percent: details?.playtomic_reliability_percent ?? null,
    playtomic_extracted_at: details?.playtomic_extracted_at ?? null };
}
