import { supabase } from './supabase';

export type PlayerFollower = { id: string; name: string; imageUrl: string | null; homeClub: string | null };
export type PlayerFollowerPage = { followers: PlayerFollower[]; total: number; hasMore: boolean };
export const FOLLOWER_PAGE_SIZE = 50;

/** The server verifies the signed-in account owns playerId before returning names. */
export async function fetchPlayerFollowers(playerId: string, offset = 0): Promise<PlayerFollowerPage> {
  if (!/^[1-9]\d*$/.test(playerId)) throw new Error('Invalid player ID.');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid follower page.');
  const { data, error } = await supabase.rpc('get_my_player_followers', {
    p_player_id: playerId, p_limit: FOLLOWER_PAGE_SIZE, p_offset: offset,
  });
  if (error) throw error;
  if (!data || !Array.isArray(data.followers) || !Number.isSafeInteger(data.total)
    || data.total < 0 || typeof data.has_more !== 'boolean') {
    throw new Error('Followers are unavailable.');
  }
  const followers: PlayerFollower[] = data.followers.map((row: Record<string, unknown>) => {
    if (!row || !/^[1-9]\d*$/.test(String(row.id ?? '')) || typeof row.name !== 'string' || !row.name.trim()) {
      throw new Error('Followers are unavailable.');
    }
    return {
      id: String(row.id), name: row.name.trim(),
      imageUrl: typeof row.image_url === 'string' && /^https:\/\//i.test(row.image_url) ? row.image_url : null,
      homeClub: typeof row.home_club === 'string' ? row.home_club : null,
    };
  });
  return { followers, total: data.total, hasMore: data.has_more };
}
