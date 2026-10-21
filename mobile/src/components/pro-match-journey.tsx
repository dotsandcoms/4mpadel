import { matchJourney } from '@/lib/pro-match-journey';
import type { PointFeed } from '@/lib/pro-padel-live';
import { lightBrand as b } from '@/theme/tokens';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

const colors = [b.padel, '#94C2D6'];
export function ProMatchJourney({ feed, names }: { feed: PointFeed | null; names: string[] }) {
  const sets = matchJourney(feed);
  const [selected, setSelected] = useState<{ set: number; game: number } | null>(null);
  const selection = selected && sets.find(set => set.number === selected.set)?.games.find(game => game.number === selected.game);
  const maxPoints = Math.max(1, ...sets.flatMap(set => set.games.flatMap(game => game.points)));
  const height = (points: number) => points ? Math.max(3, points / maxPoints * 62) : 3;
  const recorded = sets.some(set => set.games.some(game => game.points.some(points => points > 0)));
  return <View style={{ backgroundColor: '#16251F', borderRadius: 20, padding: 18, gap: 16 }}>
    <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>Match journey</Text>{feed?.coverage && <Text style={{ color: '#C6D7C9', fontSize: 9, fontWeight: '700' }}>{feed.coverage === 'full' ? 'RECORDED FEED' : feed.coverage.toUpperCase()}</Text>}</View>
    {recorded ? <>
      <View style={{ gap: 7 }}>{names.map((name, index) => <View key={index} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors[index] }} /><Text style={{ color: '#D8E4DA', fontSize: 11, flex: 1 }}>{name}</Text></View>)}</View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>{sets.filter(set => set.games.length).map(set => <View key={set.number} style={{ gap: 12 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}><Text style={{ color: '#D8E4DA', fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>SET {set.number}</Text><Text style={{ color: b.padel, fontSize: 13, fontWeight: '800' }}>{set.score || 'In progress'}</Text></View><View style={{ flexDirection: 'row', gap: 4 }}>{set.games.map(game => <Pressable key={game.number} accessibilityRole="button" onPress={() => setSelected({ set: set.number, game: game.number })} accessibilityState={{ selected: selected?.set === set.number && selected.game === game.number }} accessibilityLabel={`Set ${set.number}, game ${game.number}, recorded points ${game.points[0]} to ${game.points[1]}${game.winner != null ? `, ${names[game.winner]} won` : ', in progress or winner not recorded'}${game.break ? ', break of serve' : ''}`} style={{ width: 32, backgroundColor: selected?.set === set.number && selected.game === game.number ? '#314B3B' : 'transparent', borderRadius: 4 }}>
        <View style={{ height: 83, alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>{game.break && game.winner === 0 && <Text style={{ color: '#F1BA62', fontSize: 8, fontWeight: '800' }}>BRK</Text>}<View style={{ width: 24, height: height(game.points[0]), backgroundColor: colors[0], opacity: game.points[0] ? 1 : 0.2, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} /></View>
        <View style={{ height: 1, backgroundColor: '#516657' }} />
        <View style={{ height: 83, alignItems: 'center', gap: 3 }}><View style={{ width: 24, height: height(game.points[1]), backgroundColor: colors[1], opacity: game.points[1] ? 1 : 0.2, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }} />{game.break && game.winner === 1 && <Text style={{ color: '#F1BA62', fontSize: 8, fontWeight: '800' }}>BRK</Text>}</View>
        <Text style={{ color: '#C6D7C9', fontSize: 8, textAlign: 'center' }}>{game.number}</Text>
      </Pressable>)}</View></View>)}</ScrollView>
      {selection && <Text style={{ color: '#FFFFFF', fontSize: 11, lineHeight: 18 }}>Set {selected?.set} · Game {selection.number} · Recorded points {selection.points.join('–')}{selection.break ? ' · Break of serve' : ''}</Text>}
      <Text style={{ color: '#C6D7C9', fontSize: 10, lineHeight: 16 }}>Recorded points per game · BRK marks a break of serve. Swipe for later games and sets. Game-winning points may be absent from the feed.{feed?.coverage !== 'full' ? ' Some games or points may be missing.' : ''}</Text>
    </> : <Text style={{ color: '#C6D7C9', fontSize: 12, lineHeight: 19 }}>The journey will appear when game-by-game data is published for this match.</Text>}
  </View>;
}
