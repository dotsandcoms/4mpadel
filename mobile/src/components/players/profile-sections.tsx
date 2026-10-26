import { SkillRing } from './skill-ring';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PublicPlayer } from '@/lib/players';
import { playerForm } from '@/lib/players';
import { courtSideLabel, playingHandLabel } from '@/lib/player-preferences';
import type { PlayerMatch, MatchSide } from '@/lib/matches';
import { lightBrand as b } from '@/theme/tokens';

export const profileCard = { padding: 16, gap: 12, backgroundColor: b.elevated, borderRadius: 16, borderWidth: 1, borderColor: b.edge } as const;
const labelStyle = { color: b.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 } as const;
export function PlayerOverview({ player }: { player: PublicPlayer }) {
  const details: { label: string; value?: string | null; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { label: 'HOME CLUB', value: player.home_club, icon: 'home-outline' },
    { label: 'REGION', value: player.region, icon: 'location-outline' },
    { label: 'NATIONALITY', value: player.nationality, icon: 'flag-outline' },
    { label: 'COURT SIDE', value: courtSideLabel(player.court_side), icon: 'swap-horizontal-outline' },
    { label: 'PLAYING HAND', value: playingHandLabel(player.playing_hand), icon: 'hand-right-outline' },
    { label: 'RACKET', value: player.racket_brand, icon: 'tennisball-outline' },
  ];
  return <>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {details.filter(d => d.value).map(d => <View key={d.label} style={{ ...profileCard, flexBasis: '46%', flexGrow: 1, gap: 10 }}>
        <Ionicons name={d.icon} size={19} color={b.accent} /><Text style={labelStyle}>{d.label}</Text>
        <Text style={{ color: b.premium, fontSize: 14, fontWeight: '600', lineHeight: 21 }}>{d.value}</Text>
      </View>)}
    </View>
    <View style={profileCard}><Text style={labelStyle}>ABOUT {player.name.split(' ')[0].toUpperCase()}</Text>
      <Text style={{ color: b.premium, fontSize: 14, lineHeight: 22 }}>{player.bio?.trim() || 'This player hasn’t added a bio yet.'}</Text>
    </View>
    {!!player.sponsors.length && <View style={profileCard}><Text style={labelStyle}>SUPPORTED BY</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{player.sponsors.map((name, i) => <View key={i} style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: b.surface, borderRadius: 12 }}><Text style={{ color: b.premium, fontWeight: '600' }}>{name}</Text></View>)}</View></View>}
  </>;
}
export function PlayerForm({ player }: { player: PublicPlayer }) {
  const form = playerForm(player.match_form);
  return <>
    <View style={{ ...profileCard, backgroundColor: b.glass, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <SkillRing rating={player.skill_rating} />
      <View style={{ flex: 1, gap: 6 }}><Text style={{ color: b.premium, fontSize: 12, fontWeight: '800', letterSpacing: 0.3 }}>RANKEDIN SKILL RATING</Text>
        <Text style={{ color: b.muted, fontSize: 12, lineHeight: 18 }}>Based on match intensity and performance.</Text>
      </View>
    </View>
    <View style={{ ...profileCard, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ ...labelStyle, fontSize: 10, letterSpacing: 0.5 }}>RECENT FORM</Text>
      {form.length ? <View style={{ flexDirection: 'row', gap: 6 }}>{form.map((result, i) => <View key={i} accessible accessibilityLabel={result === 'W' ? 'Win' : 'Loss'} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: result === 'W' ? b.padel : b.danger, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: result === 'W' ? b.premium : '#FFF', fontSize: 13, fontWeight: '800' }}>{result}</Text></View>)}</View> : <Text style={{ color: b.muted, fontSize: 12 }}>No recent form published yet.</Text>}
    </View>
  </>;
}
export function PlayerMatchCard({ match, upcoming = false }: { match: PlayerMatch; upcoming?: boolean }) {
  const info = match.Info || {};
  const scores = match.Score?.Score || [];
  const winnerKnown = info.Challenger?.IsWinner === true || info.Challenged?.IsWinner === true;
  const team = (first?: MatchSide, second?: MatchSide, right = false) => <View style={{ flex: 1, gap: 5, alignItems: right ? 'flex-end' : 'flex-start' }}>
    {[first?.Name, second?.Name].filter(Boolean).map((name, i) => <Text key={i} style={{ color: winnerKnown && !first?.IsWinner ? b.muted : b.premium, fontSize: 14, fontWeight: first?.IsWinner ? '700' : '500', lineHeight: 22, textAlign: right ? 'right' : 'left' }}>{name}</Text>)}
    {!first?.Name && !second?.Name && <Text style={{ color: b.muted }}>To be confirmed</Text>}
    {first?.IsWinner === true && <Text style={{ color: b.accent, fontSize: 11, fontWeight: '700' }}>WINNER</Text>}
  </View>;
  return <View style={profileCard}>
    <View style={{ gap: 6 }}><Text style={labelStyle}>{info.Date || 'DATE TO BE CONFIRMED'}</Text><Text style={{ color: b.accent, fontSize: 14, fontWeight: '800', lineHeight: 20 }}>{info.EventName || 'Match'}</Text></View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>{team(info.Challenger, info.Challenger1)}<View style={{ backgroundColor: b.surface, padding: 8, borderRadius: 8 }}><Text style={{ color: b.premium, fontSize: 11, fontWeight: '800' }}>VS</Text></View>{team(info.Challenged, info.Challenged1, true)}</View>
    <View style={{ borderTopWidth: 1, borderColor: b.edge, paddingTop: 14, flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
      {scores.length ? scores.map((set, i) => <View key={i} accessibilityLabel={`${match.Score?.IsSummary ? 'Result' : `Set ${i + 1}`}: ${set.Score1} to ${set.Score2}`} style={{ backgroundColor: b.surface, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9 }}><Text style={{ color: b.premium, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{set.Score1}–{set.Score2}</Text></View>) : <Text style={{ color: b.muted, fontSize: 12 }}>{upcoming ? 'Upcoming match' : 'Score not published'}</Text>}
    </View>
  </View>;
}
