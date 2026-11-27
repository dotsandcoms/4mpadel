import { supabase } from './supabase';

const directoryColumns = 'id,full_name,city,coaching_location,profile_pic_url';
const profileColumns = `${directoryColumns},bio,email,contact_number,website_link,instagram_link,youtube_link`;
const coachIdPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

export type CoachDirectoryEntry = {
  id: string;
  full_name: string;
  city: string | null;
  coaching_location: string | null;
  profile_pic_url: string | null;
};

export type CoachProfile = CoachDirectoryEntry & {
  bio: string | null;
  email: string | null;
  contact_number: string | null;
  website_link: string | null;
  instagram_link: string | null;
  youtube_link: string | null;
};

export type CoachMessageTarget = { playerId: string; conversationId?: string } | { unavailable: true };

export async function fetchApprovedCoaches(signal: AbortSignal): Promise<CoachDirectoryEntry[]> {
  const { data, error } = await supabase.from('coach_applications').select(directoryColumns)
    .eq('status', 'approved').order('full_name').order('id').abortSignal(signal);
  if (error) throw error;
  return data ?? [];
}

export async function fetchCoachProfile(id: string, signal: AbortSignal): Promise<CoachProfile | null> {
  if (!coachIdPattern.test(id)) return null;
  const { data, error } = await supabase.from('coach_applications').select(profileColumns)
    .eq('status', 'approved').eq('id', id).abortSignal(signal).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchCoachMessageTarget(id: string, signal: AbortSignal): Promise<CoachMessageTarget | null> {
  if (!coachIdPattern.test(id)) return null;
  const { data, error } = await supabase.rpc('coach_message_target', { p_coach_id: id }).abortSignal(signal);
  // The layout also works with an earlier server during rollout.
  if (error?.code === 'PGRST202' || error?.code === '42883') return null;
  if (error) throw error;
  if (data?.unavailable === true) return { unavailable: true };
  if (typeof data?.playerId !== 'string' || !/^[1-9]\d*$/.test(data.playerId)) return null;
  return typeof data.conversationId === 'string' && coachIdPattern.test(data.conversationId)
    ? { playerId: data.playerId, conversationId: data.conversationId }
    : { playerId: data.playerId };
}

export function coachVenues(value?: string | null): string[] {
  // A spaced slash can separate venues. A slash within a name, such as 10/20, belongs to the venue.
  const names = (value ?? '').split(/[·|,]|\s+\/|\/\s+/).map(name => name.trim()).filter(Boolean);
  return [...new Set(names)];
}

export function coachPublicUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url.href;
  } catch { /* Ignore malformed links in older profiles. */ }
}

export function coachEmailUrl(value: string | null): string | undefined {
  const email = value?.trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `mailto:${encodeURIComponent(email).replace('%40', '@')}`;
}

export function coachPhoneUrl(value: string | null): string | undefined {
  const phone = value?.trim().replace(/[\s().-]+/g, '');
  if (phone && /^\+?\d{7,15}$/.test(phone)) return `tel:${phone}`;
}
