import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TrophyBreakdown } from '@/components/rankings/trophy-breakdown';
import type { PlayerTrophies } from '@/hooks/use-player-trophies';
import { seasonTrophies } from '@/lib/player-results';
import { lightSapaTone } from '@/theme/sapa';
import { lightBrand as b } from '@/theme/tokens';

export function PlayerTrophyShelf({ playerName, season, trophies }: { playerName: string; season: number; trophies: PlayerTrophies }) {
  const groups = useMemo(() => seasonTrophies(trophies.groups, season), [trophies.groups, season]);
  const [selected, setSelected] = useState<string | null>(null);
  if (trophies.error) return <Pressable accessibilityRole="button" onPress={trophies.retry} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.muted, fontSize: 11 }}>Season trophies unavailable. Tap to retry.</Text></Pressable>;
  if (trophies.loading || !groups.length) return null;
  return <View style={{ gap: 2 }}>
    <Text style={{ color: b.muted, fontSize: 10, fontWeight: '500' }}>{season} season</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 }}>
      {groups.map(group => <Pressable key={group.tier} accessibilityRole="button" accessibilityLabel={`${group.count} ${group.tier} tournament ${group.count === 1 ? 'win' : 'wins'} in ${season}`} accessibilityHint="Opens trophy breakdown" onPress={() => setSelected(group.tier)} style={{ minHeight: 44, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 8, gap: 4 }}>
        {group.events.map((event, index) => <Ionicons key={`${event.date}:${event.name}:${index}`} name="trophy-outline" size={18} color={lightSapaTone(group.tier).text} accessible={false} />)}
      </Pressable>)}
    </View>
    <TrophyBreakdown playerName={playerName} groups={groups} selectedTier={selected} onClose={() => setSelected(null)} />
  </View>;
}
