import { useEffect, useState } from 'react';
import { refreshResultRanking } from '../utils/rankedinResults';
import useVisibleRefresh from './useVisibleRefresh';

export default function useLivePlayerRankings(player, enabled) {
  const key = JSON.stringify({ rankedinId: player?.rankedin_id, rankings: Array.isArray(player?.rankings) ? player.rankings : [] });
  const [refresh] = useVisibleRefresh(enabled);
  const [state, setState] = useState({ key: '', rankings: [], error: false });
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const input = JSON.parse(key);
    Promise.allSettled(input.rankings.map(row => {
      if (!row.ranking_participant_id && !(input.rankedinId && row.age_group_id)) return Promise.resolve(row);
      return refreshResultRanking(row, input.rankedinId);
    })).then(results => {
      if (!cancelled) setState({ key, rankings: results.map((result, index) => result.status === 'fulfilled' ? result.value : input.rankings[index]), error: results.some(result => result.status === 'rejected') });
    });
    return () => { cancelled = true; };
  }, [key, enabled, refresh]);
  return state.key === key ? state : { rankings: Array.isArray(player?.rankings) ? player.rankings : [], error: false };
}
