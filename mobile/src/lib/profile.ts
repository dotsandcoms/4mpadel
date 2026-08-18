import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';

import { fetchPlayerMatches, isMatchWinner, type PlayerMatch } from './matches';
import { collectSignupDevice, resolveSignupSource } from './signup-source';
import { supabase } from './supabase';
import { brand } from '@/theme/tokens';

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

export type RankingDetail = {
  name?: string;
  class?: string;
  points?: number | string;
  date?: string;
  place?: string;
  event_type?: string;
};

export type RankingRow = {
  org?: string;
  age_group?: string;
  division?: string;
  match_type?: string;
  rank?: number | string;
  points?: number | string;
  details?: RankingDetail[];
};

export type PlayerRow = {
  id: number;
  name: string | null;
  email: string | null;
  contact_number: string | null;
  nationality: string | null;
  gender: string | null;
  bio: string | null;
  home_club: string | null;
  club_id: string | number | null;
  category: string | null;
  instagram_link: string | null;
  region: string | null;
  racket_brand: string | null;
  image_url: string | null;
  license_type: string | null;
  paid_registration: boolean | null;
  rank_label: string | null;
  points: number | null;
  rankedin_id: string | number | null;
  match_form: string | null;
  rankings: RankingRow[] | string | null;
  additional_images: string[] | string | null;
  skill_rating: number | null;
  age: number | string | null;
  sponsors: string | null;
  preferred_ranking: string | null;
};

export type ProfileStats = {
  matchCount: number;
  played: number;
  wins: number;
  losses: number;
  lastFive: Array<'W' | 'L'>;
  winRatio: number;
};

export type ProfileTransaction = {
  kind: 'payment' | 'refund';
  id: string | number;
  date: string;
  sortDate: number;
  amount: string;
  status: string;
  payment_type?: string | null;
  event_name?: string | null;
  reason?: string;
  relatedReference?: string | null;
  refundedTotal?: number;
};

export type TempLicense = {
  event_name: string | null;
  event_date: string | null;
};

export type ProfileBundle = {
  player: PlayerRow | null;
  stats: ProfileStats;
  tempLicense: TempLicense | null;
};

export type PlayerDetailsUpdate = {
  contact_number: string;
  region: string;
  category: string;
  home_club: string;
  club_id: string | null;
  bio: string;
  instagram_link: string | null;
  racket_brand: string | null;
};

const EMPTY_STATS: ProfileStats = {
  matchCount: 0,
  played: 0,
  wins: 0,
  losses: 0,
  lastFive: [],
  winRatio: 0,
};

/** Load the signed-in player, RankedIn form, and any still-valid temp license. */
export async function fetchProfileBundle(email?: string | null): Promise<ProfileBundle> {
  const normalised = email?.trim().toLowerCase() ?? '';
  if (!normalised) {
    return { player: null, stats: EMPTY_STATS, tempLicense: null };
  }

  const player = await fetchPlayerRow(normalised);
  if (!player) {
    return { player: null, stats: EMPTY_STATS, tempLicense: null };
  }

  const [stats, tempLicense] = await Promise.all([
    fetchProfileStats(player),
    fetchTempLicense(player.id),
  ]);

  return { player, stats, tempLicense };
}

export async function updatePlayerDetails(id: number, updates: PlayerDetailsUpdate) {
  const { error } = await supabase.from('players').update(updates).eq('id', id);
  if (error) throw error;
}

export type LicenseBadge = {
  label: string;
  color: string;
  border: string;
  bg: string;
  pulse: boolean;
};

export function licenseBadge(type?: string | null): LicenseBadge | null {
  const key = (type || '').toLowerCase();
  if (key === 'full') {
    return {
      label: 'Full License Player',
      color: brand.padel,
      border: 'rgba(204,255,0,0.3)',
      bg: 'rgba(204,255,0,0.1)',
      pulse: true,
    };
  }
  if (key === 'temporary') {
    return {
      label: 'Temporary License Player',
      color: '#60A5FA',
      border: 'rgba(96,165,250,0.3)',
      bg: 'rgba(96,165,250,0.1)',
      pulse: false,
    };
  }
  if (key === 'none') {
    return {
      label: 'No License',
      color: brand.faint,
      border: 'rgba(255,255,255,0.1)',
      bg: 'rgba(255,255,255,0.05)',
      pulse: false,
    };
  }
  return null;
}

export function formatRank(rank?: string | null) {
  if (!rank || rank === 'Unranked') return 'Unranked';
  return rank.startsWith('#') ? rank : `#${rank}`;
}

export function formatPoints(points?: number | null) {
  if (points === undefined || points === null) return '—';
  return Number(points).toLocaleString('en-ZA');
}

export function clubIdOf(player: PlayerRow | null, clubs: ClubRow[]) {
  if (!player) return '';
  if (player.club_id != null && String(player.club_id)) return String(player.club_id);
  const named = player.home_club?.trim();
  if (!named) return '';
  const match = clubs.find((club) => club.name.toLowerCase() === named.toLowerCase());
  return match ? match.id : 'Other';
}

async function fetchPlayerRow(email: string): Promise<PlayerRow | null> {
  try {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .ilike('email', email)
      .maybeSingle();
    if (error || !data) return null;
    return data as PlayerRow;
  } catch {
    return null;
  }
}

async function fetchProfileStats(player: PlayerRow): Promise<ProfileStats> {
  const rankedinId = player.rankedin_id ? String(player.rankedin_id) : null;
  const matches = rankedinId
    ? await fetchPlayerMatches(rankedinId)
    : { upcoming: [], past: [] };
  const past = matches.past ?? [];
  const upcoming = matches.upcoming ?? [];
  const wins = past.filter((match) => isMatchWinner(match)).length;
  const played = past.length;

  return {
    matchCount: upcoming.length + past.length,
    played,
    wins,
    losses: Math.max(0, played - wins),
    lastFive: lastFiveOf(player.match_form, past),
    winRatio: played > 0 ? Math.round((wins / played) * 1000) / 10 : 0,
  };
}

async function fetchTempLicense(playerId: number): Promise<TempLicense | null> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from('temporary_licenses')
      .select('event_name, event_date')
      .eq('player_id', playerId)
      .order('event_date', { ascending: false })
      .limit(8);
    if (error || !data?.length) return null;
    const valid = data.find((row) => {
      if (!row.event_date) return false;
      const eventDate = new Date(row.event_date);
      return !Number.isNaN(eventDate.getTime()) && eventDate >= today;
    });
    return valid ?? null;
  } catch {
    return null;
  }
}

function lastFiveOf(matchForm: string | null, past: PlayerMatch[]) {
  if (matchForm) {
    return matchForm
      .split(/[\s/]+/)
      .filter((mark): mark is 'W' | 'L' => mark === 'W' || mark === 'L')
      .slice(0, 5);
  }
  return past.slice(0, 5).reverse().map((match) => (isMatchWinner(match) ? 'W' : 'L'));
}

export function rankingsOf(player: PlayerRow | null): RankingRow[] {
  if (!player?.rankings) return [];
  if (Array.isArray(player.rankings)) return player.rankings;
  try {
    const parsed = JSON.parse(player.rankings) as unknown;
    return Array.isArray(parsed) ? (parsed as RankingRow[]) : [];
  } catch {
    return [];
  }
}

export function galleryOf(player: PlayerRow | null): string[] {
  if (!player?.additional_images) return [];
  if (Array.isArray(player.additional_images)) {
    return player.additional_images.filter((url) => typeof url === 'string');
  }
  try {
    const parsed = JSON.parse(player.additional_images) as unknown;
    return Array.isArray(parsed) ? parsed.filter((url) => typeof url === 'string') : [];
  } catch {
    return [];
  }
}

export function sponsorsOf(player: PlayerRow | null): string[] {
  if (!player?.sponsors) return [];
  try {
    const parsed = JSON.parse(player.sponsors) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === 'string');
  } catch {
    /* plain string */
  }
  return player.sponsors.trim() ? [player.sponsors] : [];
}

export async function setPreferredRanking(playerId: number, ranking: RankingRow) {
  const rankingId = `${ranking.org || ''}|${ranking.age_group || ''}|${ranking.match_type || ''}`;
  const rankingLabel = `${ranking.org || 'SAPA'} - ${ranking.age_group || 'Open'}`;
  const { error } = await supabase
    .from('players')
    .update({
      preferred_ranking: rankingId,
      rank_label: String(ranking.rank ?? ''),
      active_ranking_label: rankingLabel,
      points: parseInt(String(ranking.points ?? 0), 10) || 0,
    })
    .eq('id', playerId);
  if (error) throw error;
}

export async function updateGallery(playerId: number, urls: string[]) {
  const { error } = await supabase
    .from('players')
    .update({ additional_images: JSON.stringify(urls) })
    .eq('id', playerId);
  if (error) throw error;
}

function formatTransactionAmount(amount: number) {
  return `R ${Number(amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

function isCountableRefund(rf: { status?: string | null; paystack_refund_id?: string | null }) {
  const status = String(rf?.status || '').toLowerCase();
  if (status === 'processed') return true;
  if ((status === 'pending' || status === 'processing') && rf?.paystack_refund_id) return true;
  return false;
}

const REFUND_REASON_LABELS: Record<string, string> = {
  owner_withdraw: 'Withdrawal',
  partner_withdraw: 'Partner withdrew',
  owner_removed_partner: 'Partner removed',
  admin_removal: 'Admin removal',
  admin_cash_refund: 'Cash refund',
  division_switch: 'Division switch',
};

function formatRefundReason(reason?: string | null, coverType?: string | null) {
  const base = REFUND_REASON_LABELS[reason || ''] || reason?.replace(/_/g, ' ') || 'Refund';
  if (String(coverType || '').toLowerCase() === 'license') return `${base} · temp license`;
  return base;
}

function formatRefundStatus(status?: string | null) {
  const labels: Record<string, string> = {
    processed: 'Refunded',
    pending: 'Refund pending',
    processing: 'Refunding',
    failed: 'Refund failed',
    needs_attention: 'Refund issue',
  };
  return labels[status || ''] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Refund');
}

/** Same ledger as the website profile Payments tab. */
export async function fetchProfileTransactions(email: string): Promise<ProfileTransaction[]> {
  const normalised = email.trim().toLowerCase();
  const { data: pData } = await supabase.from('players').select('id').ilike('email', normalised).maybeSingle();
  if (!pData) return [];

  const { data: paymentsData, error } = await supabase
    .from('payments')
    .select('*, calendar(event_name)')
    .or(`player_id.eq.${pData.id},metadata->>email.ilike.${normalised}`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;

  const paymentIds = (paymentsData || []).map((p: { id: number }) => p.id);
  const paymentRefs = (paymentsData || [])
    .map((p: { reference?: string | null }) => p.reference)
    .filter(Boolean) as string[];

  const refundQueries = [];
  if (paymentIds.length > 0) {
    refundQueries.push(
      supabase.from('payment_refunds').select('*, payments(*, calendar(event_name))').in('payment_id', paymentIds)
    );
  }
  if (paymentRefs.length > 0) {
    refundQueries.push(
      supabase
        .from('payment_refunds')
        .select('*, payments(*, calendar(event_name))')
        .in('paystack_reference', paymentRefs)
    );
  }
  refundQueries.push(
    supabase.from('payment_refunds').select('*, payments(*, calendar(event_name))').ilike('initiated_by', normalised)
  );

  const { data: userRegs } = await supabase.from('event_registrations').select('id').ilike('email', normalised);
  const regIds = (userRegs || []).map((r: { id: number }) => r.id);
  if (regIds.length > 0) {
    refundQueries.push(
      supabase
        .from('payment_refunds')
        .select('*, payments(*, calendar(event_name))')
        .in('event_registration_id', regIds)
    );
  }

  const refundResults = await Promise.all(refundQueries);
  const refundsById = new Map<number, Record<string, unknown>>();
  for (const result of refundResults) {
    for (const rf of (result.data || []) as Record<string, unknown>[]) {
      refundsById.set(rf.id as number, rf);
    }
  }
  const allRefunds = Array.from(refundsById.values());
  const refundsByPaymentId = new Map<number, Record<string, unknown>[]>();
  for (const rf of allRefunds) {
    const paymentId = rf.payment_id as number | null;
    if (!paymentId) continue;
    const list = refundsByPaymentId.get(paymentId) || [];
    list.push(rf);
    refundsByPaymentId.set(paymentId, list);
  }

  type PaymentRow = {
    id: number;
    reference?: string | null;
    amount?: number | null;
    status?: string | null;
    payment_type?: string | null;
    created_at: string;
    metadata?: { original_trx?: { date?: string }; event_name?: string; parent_reference?: string };
    calendar?: { event_name?: string | null } | null;
  };

  const paymentsById = new Map((paymentsData || []).map((p: PaymentRow) => [p.id, p]));

  const paymentTxns: ProfileTransaction[] = (paymentsData || []).map((t: PaymentRow) => {
    const refunds = refundsByPaymentId.get(t.id) || [];
    const refundedTotal = refunds
      .filter((rf) => isCountableRefund(rf as { status?: string; paystack_refund_id?: string }))
      .reduce((sum, rf) => sum + Number(rf.amount || 0), 0);
    const isFullyRefunded = refundedTotal > 0 && refundedTotal >= Number(t.amount || 0);
    const rawStatus = String(t.status || 'unknown');
    return {
      kind: 'payment' as const,
      id: t.reference || t.id,
      date: t.metadata?.original_trx?.date || new Date(t.created_at).toLocaleDateString(),
      sortDate: new Date(t.created_at).getTime(),
      amount: formatTransactionAmount(t.amount || 0),
      status: isFullyRefunded ? 'Refunded' : rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1),
      payment_type: t.payment_type,
      event_name: t.calendar?.event_name || t.metadata?.event_name,
      refundedTotal,
    };
  });

  const refundTxns: ProfileTransaction[] = allRefunds.map((rf) => {
    const linkedPayment = (paymentsById.get(rf.payment_id as number) || rf.payments) as PaymentRow | undefined;
    const coverType = (rf.metadata as { cover_type?: string } | undefined)?.cover_type;
    const displayStatus =
      isCountableRefund(rf as { status?: string; paystack_refund_id?: string }) && rf.status !== 'failed'
        ? rf.status === 'processed'
          ? 'processed'
          : 'processing'
        : String(rf.status || '');
    return {
      kind: 'refund' as const,
      id: (rf.paystack_reference as string) || (rf.paystack_refund_id as string) || (rf.id as number),
      date: rf.processed_at
        ? new Date(rf.processed_at as string).toLocaleDateString()
        : new Date(rf.created_at as string).toLocaleDateString(),
      sortDate: new Date((rf.processed_at || rf.created_at) as string).getTime(),
      amount: `-${formatTransactionAmount(Number(rf.amount || 0))}`,
      status: formatRefundStatus(displayStatus),
      payment_type: 'refund',
      event_name:
        linkedPayment?.calendar?.event_name ||
        linkedPayment?.metadata?.event_name ||
        undefined,
      reason: formatRefundReason(rf.reason as string | undefined, coverType),
      relatedReference: (linkedPayment?.reference as string) || (rf.paystack_reference as string) || null,
    };
  });

  return [...paymentTxns, ...refundTxns]
    .sort((a, b) => b.sortDate - a.sortDate)
    .slice(0, 50);
}
