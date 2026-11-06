import { supabase } from './supabase';

export const PROOF_BUCKET = 'playtomic-proofs';
export type PlaytomicExtraction = { level: number | null; matches: number | null; reliability_percent: number | null };
export type ProfileDetails = {
  playtomic_no_profile?: boolean;
  playtomic_extracted_level?: number | null;
  playtomic_matches?: number | null;
  playtomic_reliability_percent?: number | null;
  playtomic_extracted_at?: string | null;
  date_of_birth: string;
  playtomic_level: number | null;
  playtomic_proof_path: string | null;
  playtomic_submitted_at: string | null;
};

export function birthDateError(value: string, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())): string | null {
  if (!value) return 'Enter your date of birth.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Enter a valid date of birth (YYYY-MM-DD).';
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '1900-01-01' || value > today) return 'Enter a valid date of birth in the past.';
  return null;
}

export function ageFromBirthDate(value: string, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())): number | null {
  if (birthDateError(value, today)) return null;
  const years = Number(today.slice(0, 4)) - Number(value.slice(0, 4));
  return years - (today.slice(5) < value.slice(5) ? 1 : 0);
}

export function playtomicError(level: string, _proofPath?: string): string | null {
  const value = level.trim();
  if (!value) return 'Enter your Playtomic level.';
  if (!/^\d(?:\.\d{1,2})?$/.test(value) || Number(value) > 7) return 'Enter a Playtomic level from 0 to 7, with up to two decimal places.';
  return null;
}

export async function fetchProfileDetails(playerId: number): Promise<ProfileDetails | null> {
  const { data, error } = await supabase.rpc('get_player_profile_details', { p_player_id: playerId });
  if (error) throw new Error('Your private profile details could not be loaded. Please try again.');
  return data;
}

export async function saveProfileDetails(playerId: number, dateOfBirth: string, level: string, proofPath: string, noProfile = false) {
  const issue = birthDateError(dateOfBirth) || playtomicDetailsError(level, proofPath, noProfile);
  if (issue) throw new Error(issue);
  const { data, error } = await supabase.rpc('save_player_profile_details_v3', { p_player_id: playerId, p_details: {
    date_of_birth: dateOfBirth,
    playtomic_no_profile: noProfile,
    playtomic_level: noProfile ? null : Number(level),
    playtomic_proof_path: noProfile ? null : proofPath || null,
  } });
  if (error) throw new Error(error.message);
  return data as ProfileDetails;
}

export async function extractPlaytomicProfile(path: string): Promise<PlaytomicExtraction | null> {
  const { data, error } = await supabase.functions.invoke('extract-playtomic-level', { body: { proof_path: path } });
  if (error) {
    let message = 'The screenshot could not be read. Enter your level manually or try again.';
    try {
      const body = await error.context?.json();
      if (typeof body?.error === 'string') message = body.error;
    } catch { /* Network errors may have no response body. */ }
    throw new Error(message);
  }
  if (!['detected', 'not_found'].includes(data?.status)) return null;
  const bounded = (value: unknown, max: number): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
    && Math.abs(value * 100 - Math.round(value * 100)) < 1e-8 ? value : null;
  const result = { level: bounded(data.level, 7), matches: Number.isInteger(data.matches) && data.matches >= 0 && data.matches <= 2147483647 ? data.matches as number : null,
    reliability_percent: bounded(data.reliability_percent, 100) };
  return Object.values(result).some(value => value !== null) ? result : null;
}

export async function extractPlaytomicLevel(path: string): Promise<number | null> {
  return (await extractPlaytomicProfile(path))?.level ?? null;
}

export function playtomicDetailsError(level: string, proofPath: string, noProfile = false): string | null {
  if (noProfile) return null;
  return playtomicError(level) || (!proofPath ? 'Upload a screenshot or confirm you do not have a Playtomic profile or level.' : null);
}

export function profileExtraction(details: ProfileDetails | null): PlaytomicExtraction | null {
  if (!details?.playtomic_extracted_at) return null;
  return { level: details.playtomic_extracted_level ?? null, matches: details.playtomic_matches ?? null, reliability_percent: details.playtomic_reliability_percent ?? null };
}
