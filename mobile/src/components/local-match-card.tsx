import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { localMatchParticipants, type LocalMatchPerson } from '@/lib/local-match-presentation';
import { localPlayerCountryFlag, type HubPlayer } from '@/lib/player-hub';
import type { FollowedLocalMatch } from '@/lib/followed-local-matches';
import { parseMatchDate } from '@/lib/matches';
import { formatHomeWhen } from '@/lib/when';
import { lightBrand as b } from '@/theme/tokens';

const BLUE = '#2449D8';
function MatchPlayer({ person, onPlayer }: { person: LocalMatchPerson; onPlayer: (id: string) => void }) {
  const [failed, setFailed] = useState(false);
  const flag = localPlayerCountryFlag(person.nationality);
  return <Pressable accessibilityRole={person.profileId ? 'button' : undefined} accessibilityLabel={person.profileId ? `View ${person.name}${person.followed ? ', followed player' : ''}` : person.name}
    disabled={!person.profileId} onPress={() => person.profileId && onPlayer(person.profileId)} style={s.person}>
    <View style={[s.portrait, person.followed && s.followedPortrait]}>
      {person.photo && !failed ? <Image source={{ uri: person.photo }} contentFit="cover" contentPosition="top" onError={() => setFailed(true)} style={s.photo} accessibilityLabel={`${person.name} profile photo`} />
        : <Text style={s.initials}>{person.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</Text>}
      {person.followed && <View style={s.heart}><Ionicons name="heart" size={11} color="#FFF" /></View>}
    </View>
    <Text style={s.name}>{flag ? `${flag} ` : ''}{person.name}</Text>
  </Pressable>;
}

export const LocalMatchCard = memo(function LocalMatchCard({ fixture, directory, onPlayer }: { fixture: FollowedLocalMatch; directory: HubPlayer[]; onPlayer: (id: string) => void }) {
  const info = fixture.match.Info || {}, teams = localMatchParticipants(fixture, directory);
  const when = formatHomeWhen(parseMatchDate(info.Date), info.Date) || 'Time to be confirmed';
  const venue = info.Venue || info.Location;
  return <View style={s.card}>
    <View style={s.header}>
      <View style={s.eyebrow}><Text style={s.kicker}>4M · UPCOMING MATCH</Text><Text accessibilityLabel="South Africa" style={{ fontSize: 21 }}>🇿🇦</Text></View>
      <Text accessibilityRole="header" style={s.title}>{info.EventName || 'Local tournament'}</Text>
      <View style={s.when}><Ionicons name="time-outline" size={15} color="#FFF" /><Text style={s.whenText}>{when}</Text></View>
    </View>
    <View style={s.body}>
      {teams.map((team, index) => <View key={index}>
        {index > 0 && <View style={s.versus}><View style={s.rule} /><Text style={s.vs}>VS</Text><View style={s.rule} /></View>}
        <View style={s.team}>{team.length ? team.map((person, i) => <MatchPlayer key={`${person.profileId || person.name}:${i}:${person.photo}`} person={person} onPlayer={onPlayer} />)
          : <View style={s.unknown}><Ionicons name="people-outline" size={28} color={b.faint} /><Text style={s.unknownText}>Players to be confirmed</Text></View>}</View>
      </View>)}
      <View style={s.location}><Ionicons name="location-outline" color={BLUE} size={17} /><View style={{ flex: 1, gap: 3 }}>
        <Text style={s.court}>{info.Court || 'Court to be confirmed'}</Text>{!!venue && <Text numberOfLines={2} accessibilityLabel={venue} style={s.venue}>{venue}</Text>}
      </View></View>
    </View>
    <View style={s.footer}><Ionicons name="heart" size={13} color={BLUE} /><Text style={s.followLabel}>FOLLOWING</Text>
      <View style={s.followed}>{fixture.players.map(player => <Pressable key={player.key} accessibilityRole="button" accessibilityLabel={`View ${player.name}`} onPress={() => onPlayer(player.id)} style={s.followLink}>
        <Text style={s.followName}>{player.name}</Text><Ionicons name="chevron-forward" size={13} color={BLUE} />
      </Pressable>)}</View>
    </View>
  </View>;
});

const s = StyleSheet.create({
  card: { borderRadius: 22, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 1, borderColor: b.edge },
  header: { backgroundColor: BLUE, padding: 18, gap: 10 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#FFF', fontSize: 21, lineHeight: 26, fontWeight: '800', letterSpacing: -.5 },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  whenText: { color: '#FFF', fontSize: 12, lineHeight: 18, fontWeight: '600', flex: 1 },
  body: { padding: 18, gap: 18 },
  team: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  person: { flex: 1, alignItems: 'center', gap: 8, minHeight: 108 },
  portrait: { width: 68, height: 68, borderRadius: 34, backgroundColor: b.surface, borderWidth: 1, borderColor: '#00000019', alignItems: 'center', justifyContent: 'center' },
  followedPortrait: { borderWidth: 2, borderColor: BLUE },
  photo: { width: 64, height: 64, borderRadius: 32 },
  initials: { fontSize: 23, fontWeight: '800', color: b.muted },
  heart: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#FFF', backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  name: { color: b.premium, fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'center' },
  versus: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  rule: { flex: 1, height: 1, backgroundColor: b.edge },
  vs: { color: b.faint, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  unknown: { flex: 1, minHeight: 108, alignItems: 'center', justifyContent: 'center', gap: 8 },
  unknownText: { color: b.muted, fontSize: 12 },
  location: { borderTopWidth: 1, borderColor: b.edge, paddingTop: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  court: { color: b.premium, fontSize: 12, fontWeight: '700' },
  venue: { color: b.muted, fontSize: 11, lineHeight: 16 },
  footer: { backgroundColor: '#EFF3FF', paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  followLabel: { fontSize: 9, color: BLUE, fontWeight: '800', letterSpacing: .7 },
  followed: { flex: 1, alignItems: 'flex-end' },
  followLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, maxWidth: '100%' },
  followName: { fontSize: 12, fontWeight: '700', color: BLUE, flexShrink: 1, textAlign: 'right' },
});
