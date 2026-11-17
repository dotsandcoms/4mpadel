import { useEffect, useState } from 'react';
import { fetchPlayerTrophies, trophyTiers } from '@/lib/player-results';
import type { PublicPlayer } from '@/lib/players';
import type { TrophyGroup } from '@/lib/rankings';

export type PlayerTrophies = { groups: TrophyGroup[]; loading: boolean; error: boolean; retry: () => void };

/** Share one published trophy history between the profile shelf and Results. */
export function usePlayerTrophies(player: PublicPlayer | null, refreshKey: number): PlayerTrophies {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ playerId: string | null; groups: TrophyGroup[]; loading: boolean; error: boolean }>({ playerId: null, groups: [], loading: false, error: false });
  useEffect(() => {
    let live = true;
    setState({ playerId: player?.id ?? null, groups: [], loading: !!player, error: false });
    if (player) void fetchPlayerTrophies(player).then(groups => {
      if (live) setState({ playerId: player.id, groups: [...groups].sort((a, z) => trophyTiers.indexOf(a.tier) - trophyTiers.indexOf(z.tier)), loading: false, error: false });
    }).catch(() => { if (live) setState({ playerId: player.id, groups: [], loading: false, error: true }); });
    return () => { live = false; };
  }, [player, refreshKey, revision]);
  return { ...(state.playerId === player?.id ? state : { groups: [], loading: !!player, error: false }), retry: () => setRevision(value => value + 1) };
}
