import { Image } from 'expo-image';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { View, Pressable } from 'react-native';
import { EventIcon, EventText as Text, useEventAccent } from './website-ui';
import type { TeamDivision, TeamPlayer } from '@/lib/event-teams';
export function PlayerAvatar({ player, size = 56 }: { player: Pick<TeamPlayer, 'name' | 'image'>; size?: number }) {
  return <View accessibilityLabel={player.name} style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 1px 2px #00000015' }}>{player.image ? <Image source={{ uri: player.image }} style={{ width: size, height: size }} contentFit="cover" /> : <EventIcon name="person" color="#9ca3af" size={size / 2} />}</View>;
}
export function TeamDivisionCard({ group }: { group: TeamDivision }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const accent = useEventAccent();
  return <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden', boxShadow: '0px 1px 3px #00000015' }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ paddingHorizontal: 24, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Text style={{ fontSize: 16, fontWeight: '400', color: '#0f172a', flex: 1 }}>{group.division.name}</Text><Text style={{ backgroundColor: accent, color: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, fontSize: 10 }}>{group.teams.length} TEAMS</Text><EventIcon name={open ? 'chevron.down' : 'chevron.right'} color="#9ca3af" size={12} /></Pressable>
    {open && (group.teams.length ? group.teams.map((team, index) => <View key={team.id} style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ width: 24, color: '#0a0a0a', fontSize: 18, fontWeight: '400', textAlign: 'center' }}>{team.seed || index + 1}</Text>
      <View style={{ flexDirection: 'row', flex: 1, gap: 8 }}>{team.players.map(player => <Pressable key={player.name} accessibilityRole={player.id ? 'button' : undefined} accessibilityLabel={player.id ? `View ${player.name}'s profile` : undefined} disabled={!player.id} onPress={() => player.id && router.push({ pathname: '/players/[id]', params: { id: player.id } })} style={{ flex: 1, maxWidth: 80, minHeight: 84, alignItems: 'center' }}><PlayerAvatar player={player} /><Text numberOfLines={1} style={{ color: player.id ? '#1e293b' : '#64748b', fontSize: 14, fontWeight: '400', marginTop: 6 }}>{player.name.split(' ')[0]}</Text>{player.points > 0 && <Text style={{ color: '#fff', fontSize: 10, fontWeight: '400', backgroundColor: accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 }}>{player.points.toLocaleString('en-GB')}</Text>}</Pressable>)}</View>
      {team.total > 0 && <View style={{ borderLeftWidth: 1, borderColor: '#e5e7eb', paddingLeft: 10, alignItems: 'flex-end', gap: 4 }}>{team.seed && <Text style={{ backgroundColor: accent, color: '#fff', fontSize: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 }}>SEED {team.seed}</Text>}<Text style={{ color: '#94a3b8', fontSize: 9, letterSpacing: 0.6 }}>TEAM POINTS</Text><Text style={{ color: '#1e293b', fontSize: 16, fontWeight: '400' }}>{team.total.toLocaleString('en-GB')}</Text></View>}
    </View>) : <Text style={{ padding: 30, color: '#9ca3af', textAlign: 'center' }}>No teams registered yet</Text>)}
  </View>;
}
export function TopSeedRows({ groups, gender }: { groups: TeamDivision[]; gender: string }) {
  const teams = groups.filter(({ division }) => {
    const label = `${division.gender || ''} ${division.name}`.toLowerCase();
    return gender === 'Women' ? /women|ladies|female/.test(label) : !/women|ladies|female|mixed/.test(label);
  }).flatMap(g => g.teams).filter(t => t.total > 0).sort((a, b) => b.total - a.total).slice(0, 4);
  return teams.length ? teams.map((team, index) => <View key={team.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}><Text style={{ width: 16, color: '#eab308', fontSize: 12, fontWeight: '400' }}>{index + 1}</Text><View style={{ flex: 1 }}><Text style={{ color: '#111827', fontSize: 14 }}>{team.players.map(p => p.name).join(' / ')}</Text><Text style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>{team.total.toLocaleString('en-GB')} pts</Text></View><Text style={{ fontSize: 20 }}>🇿🇦</Text></View>) : <Text style={{ color: '#9ca3af', textAlign: 'center', fontSize: 12, paddingVertical: 16 }}>No seeded teams yet.</Text>;
}
