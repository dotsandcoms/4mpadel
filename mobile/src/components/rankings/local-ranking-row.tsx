import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FeedPortrait } from '@/components/home-feed';
import type { RankingPlayer } from '@/lib/rankings';
import { lightBrand as b } from '@/theme/tokens';

export function LocalRankingRow({ player, rankingLabel, onPress, follow }: {
  player: RankingPlayer; rankingLabel: string; onPress: () => void; follow?: ReactNode;
}) {
  const movement = player.changeKnown !== false && Number.isInteger(player.change) && player.change !== 0;
  const change = movement ? `${player.change > 0 ? 'Up' : 'Down'} ${Math.abs(player.change)} ${Math.abs(player.change) === 1 ? 'place' : 'places'}` : '';
  return <View style={{ marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: b.edge, backgroundColor: b.elevated, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Rank ${player.rank}, ${player.name}. ${rankingLabel}, ${player.points.toLocaleString('en-ZA')} points.${change ? ` ${change}.` : ''} View ranking details`} onPress={onPress} style={{ flex: 1, minWidth: 0, minHeight: 48 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ minWidth: 24, alignItems: 'center', gap: 4 }}>
          <Text style={{ color: b.premium, fontSize: 15, fontVariant: ['tabular-nums'] }}>{player.rank}</Text>
          {movement && <Text style={{ color: player.change > 0 ? '#24713C' : b.danger, fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{player.change > 0 ? '↑' : '↓'} {Math.abs(player.change)}</Text>}
        </View>
        <FeedPortrait name={player.name} uri={player.profile?.image_url} size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Text numberOfLines={2} style={{ color: b.premium, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{player.name}</Text>
          <Text style={{ color: b.muted, fontSize: 12, lineHeight: 17 }}>{rankingLabel} · {player.points.toLocaleString('en-ZA')} pts</Text>
        </View>
      </View>
    </Pressable>
    {follow}
  </View>;
}
