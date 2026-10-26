import { supabase } from './supabase';
import type { PlayerFipLink } from './player-hub';
import type { ProPlayer } from './pro-padel';

export async function fetchMyFipLink(localPlayerId: number): Promise<PlayerFipLink | null> {
  const { data, error } = await supabase.from('player_fip_links')
    .select('local_player_id,fip_player_id,fip_profile_url,fip_player_name,fip_category,fip_rank,fip_points,fip_nationality,fip_photo_url,fip_hand,fip_side,status')
    .eq('local_player_id', localPlayerId).maybeSingle();
  if (error) throw error;
  return data as PlayerFipLink | null;
}

async function confirmFipLink(body: { localPlayerId: number; fipPlayerId?: number; fipProfileUrl?: string }) {
  const { data, error } = await supabase.functions.invoke('confirm-fip-link', { body });
  if (error || data?.error || !data?.verified) {
    let message = data?.error;
    if (!message && error?.context instanceof Response) { try { message = (await error.context.json()).error; } catch {} }
    throw new Error(message || 'FIP link could not be verified. Please try again.');
  }
}

export async function requestOfficialFipLink(localPlayerId: number, profileUrl: string) {
  await confirmFipLink({ localPlayerId, fipProfileUrl: profileUrl });
}

export async function requestFipLink(localPlayerId: number, player: ProPlayer) {
  await confirmFipLink({ localPlayerId, fipPlayerId: player.id });
}

export async function verifyPendingFipLink(localPlayerId: number) {
  await confirmFipLink({ localPlayerId });
}

export async function withdrawFipLink(localPlayerId: number) {
  const { error } = await supabase.from('player_fip_links').delete()
    .eq('local_player_id', localPlayerId);
  if (error) throw error;
}
