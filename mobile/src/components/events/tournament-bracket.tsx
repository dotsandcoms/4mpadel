import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { DrawMatch, DrawRound, DrawSection, DrawTeam } from '@/lib/tournament-draw';
import { lightBrand as b } from '@/theme/tokens';

const names = (team: DrawTeam) => team.players.map(player => player.name).join(' / ') || team.placeholder || 'To be confirmed';
function BracketPhotos({ team }: { team: DrawTeam }) {
  const [failed, setFailed] = useState<string[]>([]);
  if (!team.players.length) return null;
  return <View style={s.photos} importantForAccessibility="no-hide-descendants">{team.players.slice(0, 2).map((player, index) => <View key={`${player.id || player.name}:${player.photo}`} style={[s.avatar, index > 0 && { marginLeft: -6 }]}>
    {player.photo && !failed.includes(player.photo) ? <Image source={{ uri: player.photo }} contentFit="cover" contentPosition="top" recyclingKey={`${player.id || player.name}:${player.photo}`} onError={() => setFailed(values => [...values, player.photo!])} style={s.photo} />
      : <Text style={s.initials}>{player.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</Text>}
  </View>)}</View>;
}
export function TournamentBracket({ section, onMatch, highlighted }: { section: DrawSection; onMatch: (match: DrawMatch, round: DrawRound) => void; highlighted?: string }) {
  const { fontScale } = useWindowDimensions();
  const cardHeight = Math.ceil(188 * Math.max(1, fontScale)), gap = 22, width = 260, gutter = 30;
  const count = Math.max(1, ...section.rounds.map(round => round.matches.length));
  const height = count * (cardHeight + gap) - gap;
  const top = (index: number, total: number) => (index + .5) * (height + gap) / total - (cardHeight + gap) / 2;
  return <View style={{ gap: 8 }}>
    <Text style={s.hint}>Swipe across to follow the rounds. Tap a match for full details.</Text>
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: 12 }} accessibilityLabel={`${section.name} bracket. Scroll horizontally to view later rounds.`}>
      <View style={{ flexDirection: 'row' }}>{section.rounds.map((round, column) => <View key={round.id} style={{ width: width + (column < section.rounds.length - 1 ? gutter : 0) }}>
        <Text accessibilityRole="header" style={s.round}>{round.name}</Text>
        <View style={{ height, position: 'relative' }}>{round.matches.map((match, index) => {
          const next = section.rounds[column + 1];
          const linked = next && next.matches.length * 2 === round.matches.length && next.matches[0]?.round > match.round;
          const y = top(index, round.matches.length), middle = y + cardHeight / 2;
          const targetMiddle = linked ? top(Math.floor(index / 2), next.matches.length) + cardHeight / 2 : middle;
          return <View key={match.id}>
            {linked && <View pointerEvents="none" importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', left: width, top: 0, width: gutter, height }}>
              <View style={{ position: 'absolute', left: 0, top: middle, width: gutter / 2, borderTopWidth: 1, borderColor: '#9BACB7' }} />
              <View style={{ position: 'absolute', left: gutter / 2, top: Math.min(middle, targetMiddle), height: Math.abs(targetMiddle - middle), borderLeftWidth: 1, borderColor: '#9BACB7' }} />
              <View style={{ position: 'absolute', left: gutter / 2, top: targetMiddle, width: gutter / 2, borderTopWidth: 1, borderColor: '#9BACB7' }} />
            </View>}
            <Pressable accessibilityRole="button" accessibilityLabel={`${round.name}. ${names(match.one)} versus ${names(match.two)}. ${match.status}. View full match details.`} onPress={() => onMatch(match, round)}
              style={[s.match, { position: 'absolute', top: y, width, height: cardHeight }, match.id === highlighted && s.highlight]}>
              <View style={s.meta}><Text numberOfLines={1} style={s.status}>{match.status}</Text><Ionicons name="expand-outline" size={15} color="#27517B" /></View>
              {[match.one, match.two].map((team, side) => <View key={side} style={[s.team, match.winner === side + 1 && s.winner]}>
                <BracketPhotos team={team} />
                <Text numberOfLines={1} ellipsizeMode="tail" style={[s.names, match.winner === side + 1 && s.winnerName]}>{names(team)}{team.seed ? ` (${team.seed})` : ''}</Text>
                <Text style={[s.score, match.winner === side + 1 && s.winnerName]}>{match.scores.map(set => set[side]).join('  ') || '–'}</Text>
              </View>)}
              <Text numberOfLines={1} style={s.court}>{match.court || 'Court to be confirmed'}</Text>
            </Pressable>
          </View>;
        })}</View>
      </View>)}</View>
    </ScrollView>
  </View>;
}
const s = StyleSheet.create({
  hint: { color: b.muted, fontSize: 12, lineHeight: 18 }, round: { minHeight: 34, color: b.premium, fontWeight: '700', fontSize: 14, paddingBottom: 12 },
  match: { borderWidth: 1, borderColor: b.edge, borderRadius: 14, backgroundColor: '#FFF', padding: 10, gap: 7, justifyContent: 'space-between' }, highlight: { borderWidth: 2, borderColor: '#2449D8' },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }, status: { flex: 1, color: '#27517B', fontSize: 11, fontWeight: '600' },
  team: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 7, minHeight: 48 }, winner: { backgroundColor: '#E7F2E4' },
  names: { flex: 1, color: b.premium, fontSize: 12, lineHeight: 17, fontWeight: '500' }, winnerName: { color: '#234923', fontWeight: '700' }, score: { color: b.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  photos: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 }, avatar: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#FFF', overflow: 'hidden', backgroundColor: '#E5EBE5', alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: '100%' }, initials: { color: '#35533D', fontSize: 8, fontWeight: '700' },
  court: { color: b.muted, fontSize: 10 },
});
