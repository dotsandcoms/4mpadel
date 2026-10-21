import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { fetchLocalFollowerCount } from '@/lib/player-hub';
import { lightBrand as b } from '@/theme/tokens';

export function PlayerFollowerCount({ playerId, refreshKey = 0 }: { playerId: string; refreshKey?: number }) {
  const [state, setState] = useState<{ id: string; count: number | null; error: boolean }>({ id: playerId, count: null, error: false });
  useFocusEffect(useCallback(() => {
    let active = true;
    setState({ id: playerId, count: null, error: false });
    void fetchLocalFollowerCount(playerId).then(count => {
      if (active) setState({ id: playerId, count, error: false });
    }).catch(() => {
      if (active) setState({ id: playerId, count: null, error: true });
    });
    return () => { active = false; };
  }, [playerId, refreshKey]));

  const count = state.id === playerId ? state.count : null;
  const unavailable = state.id === playerId && state.error;
  const label = count === 1 ? 'follower' : 'followers';
  return <Text accessibilityLiveRegion="polite" accessibilityLabel={count !== null ? `${count} ${label}` : unavailable ? 'Follower count unavailable' : 'Loading follower count'} style={{ color: b.muted, fontSize: 13, lineHeight: 20 }}>
    {unavailable ? 'Followers unavailable' : <><Text style={{ color: b.premium, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{count === null ? '…' : count.toLocaleString('en-ZA')}</Text> {label}</>}
  </Text>;
}
