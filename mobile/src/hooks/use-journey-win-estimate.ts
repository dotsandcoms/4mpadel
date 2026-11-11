import { useEffect, useState } from 'react';
import { useScreenActive } from './use-screen-active';
import { journeyWinEstimate } from '@/lib/pro-journey-prediction';
import { tournamentPairKey } from '@/lib/pro-tournament-entries';
import type { ProPerson } from '@/lib/pro-padel';
import type { MatchDetails } from '@/lib/pro-padel-live';

export function useJourneyWinEstimate(row: MatchDetails, team: ProPerson[], opponent: ProPerson[] | null, date: string, enabled = true, revision = 0) {
  const active = useScreenActive();
  const key = `${tournamentPairKey(team)}:${opponent && tournamentPairKey(opponent)}:${date}:${revision}`;
  const [state, setState] = useState<{ key: string; value: number | null; pending: boolean; error: boolean }>({ key: '', value: null, pending: false, error: false });
  const eligible = enabled && active && opponent != null;
  useEffect(() => {
    if (!eligible || !opponent) return;
    let cancelled = false;
    setState({ key, value: null, pending: true, error: false });
    void journeyWinEstimate(row, team, opponent, date, () => !cancelled).then(value => {
      if (!cancelled) setState({ key, value, pending: false, error: false });
    }).catch(() => { if (!cancelled) setState({ key, value: null, pending: false, error: true }); });
    return () => { cancelled = true; };
  }, [key, eligible]);
  // A refreshed draw must never paint the previous opponent's percentage for even one frame.
  if (!eligible) return { value: null, pending: false, error: false };
  return state.key === key ? state : { value: null, pending: true, error: false };
}
