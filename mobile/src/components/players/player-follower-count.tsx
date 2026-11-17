import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { fetchLocalFollowerCount } from '@/lib/player-hub';
import { lightBrand as b } from '@/theme/tokens';

export function PlayerFollowerCount({ playerId, playerName, refreshKey = 0, onPress, compact = false }: { playerId: string; playerName?: string; refreshKey?: number; onPress?: () => void; compact?: boolean }) {
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
  const accessibilityLabel = count !== null ? `${count} ${label}` : unavailable ? 'Follower count unavailable' : 'Loading follower count';
  const content = <Text accessibilityLiveRegion="polite" accessibilityLabel={onPress ? undefined : accessibilityLabel} style={{ color: b.muted, fontSize: compact ? 12 : 13, lineHeight: 20 }}>
    {unavailable ? 'Followers unavailable' : <><Text style={{ color: b.premium, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{count === null ? '…' : count.toLocaleString('en-ZA')}</Text> {label}</>}
  </Text>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={playerName ? `View people following ${playerName}` : 'View people following you'} onPress={onPress} style={{ minHeight: 44, minWidth: 44, paddingHorizontal: compact ? 0 : 12, borderRadius: 12, borderWidth: compact ? 0 : 1, borderColor: b.edge, backgroundColor: compact ? 'transparent' : b.elevated, alignSelf: compact ? 'flex-start' : 'center', justifyContent: 'center' }}>
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', ...(compact ? { backgroundColor: b.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 } : {}) }}>
      {compact && <Ionicons name={count !== null && count > 0 ? 'heart' : 'heart-outline'} size={14} color={b.muted} />}{content}<Ionicons name="chevron-forward" size={compact ? 12 : 15} color={b.muted} />
    </View>
  </Pressable> : content;
}
