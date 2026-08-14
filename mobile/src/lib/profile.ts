import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';

import { collectSignupDevice, resolveSignupSource } from './signup-source';
import { supabase } from './supabase';

const DRAFT_KEY = 'player_profile_draft_v1';

export type PlayerDraft = {
  firstName: string;
  lastName: string;
  email: string;
  contactNumber: string;
  gender: string;
  nationality: string;
  idNumber: string;
  region: string;
  category: string;
  clubId: string;
  customClub: string;
  bio: string;
  instagramLink: string;
  sponsors: string;
  racketBrand: string;
  customRacketBrand: string;
};

export type ClubRow = { id: string; name: string };

/** True when this account already has a usable player row on 4M Padel. */
export async function hasPlayerProfile(email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const { data, error } = await supabase
    .from('players')
    .select('id, name, contact_number, gender, region')
    .ilike('email', email.trim())
    .maybeSingle();
  if (error || !data) return false;
  return Boolean(data.name && data.contact_number && data.gender && data.region);
}

export async function fetchClubs(): Promise<ClubRow[]> {
  const { data, error } = await supabase
    .from('clubs')
    .select('id, name')
    .not('status', 'in', '(pending,rejected,in_review)')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export function nameFromUser(user: User | null): { firstName: string; lastName: string } {
  const meta = user?.user_metadata ?? {};
  const full =
    [meta.full_name, meta.name, meta.given_name && meta.family_name
      ? `${meta.given_name} ${meta.family_name}`
      : '']
      .find((v) => typeof v === 'string' && v.trim()) ?? '';
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  if (meta.given_name || meta.family_name) {
    return {
      firstName: String(meta.given_name ?? parts[0] ?? ''),
      lastName: String(meta.family_name ?? parts.slice(1).join(' ')),
    };
  }
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

export async function createPlayerProfile(draft: PlayerDraft, clubs: ClubRow[]) {
  const homeClub =
    draft.clubId === 'Other'
      ? draft.customClub.trim()
      : clubs.find((c) => c.id === draft.clubId)?.name ?? '';
  const racket =
    draft.racketBrand === 'Other' ? draft.customRacketBrand.trim() : draft.racketBrand;

  const payload = {
    p_email: draft.email.trim().toLowerCase(),
    p_name: `${draft.firstName} ${draft.lastName}`.replace(/\s+/g, ' ').trim(),
    p_contact: draft.contactNumber.trim(),
    p_category: draft.category || 'Unranked',
    p_gender: draft.gender,
    p_nationality: draft.nationality.trim(),
    p_id_number: draft.idNumber.trim(),
    p_bio: draft.bio.trim(),
    p_home_club: homeClub,
    p_sponsors: draft.sponsors.trim() || null,
    p_region: draft.region,
    p_instagram_link: draft.instagramLink.trim() || null,
    p_paid_registration: false,
    p_license_type: 'none',
    p_image_url: null,
    p_racket_brand: racket || null,
    p_club_id: draft.clubId && draft.clubId !== 'Other' ? draft.clubId : null,
  };

  const first = await supabase.rpc('create_player_profile', payload);
  if (first.error) {
    const { p_club_id: _clubId, ...withoutClubId } = payload;
    const retry = await supabase.rpc('create_player_profile', withoutClubId);
    if (retry.error) throw first.error;
  }

  const { data: sessionData } = await supabase.auth.getUser();
  const source = resolveSignupSource(sessionData.user?.user_metadata?.signup_source);
  const device = collectSignupDevice();
  const stamp = await supabase.rpc('set_player_signup_source', {
    p_source: source,
    p_device: device,
  });
  if (stamp.error) {
    console.warn('[profile] signup_source not saved:', stamp.error.message);
  }
}

function draftKey(email?: string) {
  return `${DRAFT_KEY}:${(email ?? '').trim().toLowerCase()}`;
}

export async function saveProfileDraft(draft: Partial<PlayerDraft> & { accepted?: boolean }) {
  await AsyncStorage.setItem(draftKey(draft.email), JSON.stringify(draft));
}

export async function loadProfileDraft(
  email?: string
): Promise<(Partial<PlayerDraft> & { accepted?: boolean }) | null> {
  const raw = await AsyncStorage.getItem(draftKey(email));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Partial<PlayerDraft> & { accepted?: boolean };
  } catch {
    return null;
  }
}

export async function clearProfileDraft(email?: string) {
  await AsyncStorage.removeItem(draftKey(email));
}

/** True when a draft has more than an email — enough to restore on return. */
export function draftHasProgress(draft: Partial<PlayerDraft> | null | undefined): boolean {
  if (!draft) return false;
  return [
    draft.firstName,
    draft.lastName,
    draft.contactNumber,
    draft.gender,
    draft.nationality,
    draft.idNumber,
    draft.region,
    draft.category,
    draft.clubId,
    draft.customClub,
    draft.bio,
    draft.racketBrand,
  ].some((value) => typeof value === 'string' && value.trim().length > 0);
}

export async function destinationAfterAuth(
  session: Session | null
): Promise<'/(auth)/sign-in' | '/(auth)/complete-profile' | '/(tabs)'> {
  if (!session) return '/(auth)/sign-in';
  const ready = await hasPlayerProfile(session.user.email);
  return ready ? '/(tabs)' : '/(auth)/complete-profile';
}
