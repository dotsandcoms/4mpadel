import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProMatchStar } from './pro-match-star';
import { ProTeamIdentity } from './pro-player-identity';
import { useProPlayerPortraits } from '@/hooks/use-pro-player-portraits';
import { proPairName } from '@/lib/pro-player-display';
import { proDate } from '@/lib/pro-padel';
import type { MatchDetails } from '@/lib/pro-padel-live';
import { lightBrand as b } from '@/theme/tokens';

type Props = { row: MatchDetails; round: string; onPress?: () => void; onPlayers?: () => void; hero?: boolean; photosEnabled?: boolean; photos?: Record<number, string | null | undefined> };
export const ProMatchScoreboard = memo(function ProMatchScoreboard({ row, round, onPress, onPlayers, hero = false, photosEnabled = true, photos = {} }: Props) {
  const { match } = row;
  const live = ['live', 'ongoing'].includes(match.status), upcoming = match.status === 'scheduled';
  const dark = live || hero;
  const fetched = useProPlayerPortraits(match.teams.flat().map(player => player.id), photosEnabled);
  const portraits = { ...fetched, ...Object.fromEntries(Object.entries(photos).filter(([, photo]) => !!photo)) };
  const sets = (live && row.liveScore?.sets.length ? row.liveScore.sets : match.score.length ? match.score : row.liveScore?.sets || []).slice(0, 5);
  const points = live && row.liveScore?.points ? row.liveScore.points.split(/\s*[:–-]\s*/) : null;
  const server = live && row.liveScore?.serving === 'team_1' ? 0 : live && row.liveScore?.serving === 'team_2' ? 1 : null;
  const ink = dark ? '#F4F7F4' : b.premium, muted = dark ? '#B3C5BA' : b.muted, rule = dark ? '#FFFFFF18' : b.edge;
  const stage = round.replace(/^Qualifying (\d+)$/, 'Q$1');
  const status = live ? 'Live' : upcoming ? 'Up next' : match.status === 'finished' ? 'Final' : match.status === 'ended' ? 'Awaiting confirmation' : match.status.replaceAll('_', ' ');
  const label = `${match.teams.map(team => team.map(player => player.name).join(' and ') || 'Players to be confirmed').join(' versus ')}. ${round}. ${status}. ${sets.map((set, index) => `Set ${index + 1}: ${set[0] ?? 'unavailable'} to ${set[1] ?? 'unavailable'}`).join('. ')}${points ? `. Game points ${points.join(' to ')}` : ''}${server !== null ? `. ${match.teams[server].map(player => player.name).join(' and ')} serving` : ''}`;
  const scoreWidth = sets.length * 24 + (points ? 36 : 0);
  const header = <View style={s.header}><View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', flex: 1 }}>
    {live && <View style={s.liveDot} />}<Text style={{ color: live ? '#FF8C94' : muted, fontSize: 11, fontWeight: '600' }}>{status}</Text><Text numberOfLines={1} style={{ color: muted, fontSize: 11, flexShrink: 1 }}>{stage} · {match.court || 'Court TBC'}</Text>
  </View></View>;
  const content = <>
    {header}
    {!!sets.length && <View style={[s.columnLabels, { paddingRight: 6 }]}><View style={{ flex: 1 }} />{sets.map((_, i) => <Text key={i} style={[s.columnLabel, { color: muted }]}>S{i + 1}</Text>)}{points && <Text style={[s.columnLabel, { width: 36, color: muted }]}>Pts</Text>}</View>}
    {match.teams.map((team, index) => {
      const winning = match.winner === `team_${index + 1}`, serving = server === index;
      const identity = <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: serving ? '#D3ED9B' : 'transparent' }} />
        <ProTeamIdentity team={team} photos={portraits} dark={dark} />{row.seeds[index] && <Text style={{ color: muted, fontSize: 9 }}>[{row.seeds[index]}]</Text>}{winning && <Ionicons name="checkmark" size={14} color={dark ? '#D3ED9B' : b.accent} />}
      </View>;
      return <View key={index} style={[s.team, { backgroundColor: serving ? dark ? '#FFFFFF09' : b.panel : 'transparent', borderTopColor: rule, borderTopWidth: index ? StyleSheet.hairlineWidth : 0 }]}>
        {onPlayers ? <Pressable onPress={onPlayers} accessibilityRole="button" accessibilityLabel={`View ${team.map(p => p.name).join(' and ')} player details`} style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}>{identity}</Pressable> : identity}
        <View style={{ width: scoreWidth || undefined, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
          {sets.map((set, i) => <Text key={i} style={[s.score, { color: live && i === sets.length - 1 ? '#D3ED9B' : winning ? dark ? '#F4F7F4' : b.accent : ink, opacity: live && i < sets.length - 1 ? .7 : 1 }]}>{set[index] ?? '–'}</Text>)}
          {points && <Text style={[s.pointScore, { color: dark ? '#F4F7F4' : b.premium, backgroundColor: dark ? '#FFFFFF12' : b.panel }]}>{points[index] || '–'}</Text>}
        </View>
      </View>;
    })}
    <View style={[s.footer, { borderTopColor: rule }]}>
      <Text numberOfLines={1} style={{ color: muted, fontSize: 10, flex: 1 }}>{live ? server !== null ? `Serving · ${proPairName(match.teams[server])}` : 'Point-by-point coverage' : upcoming ? `${match.scheduledAt ? proDate(match.scheduledAt, true) : 'Start time TBC'}${row.courtOrder ? ` · Order ${row.courtOrder}` : ''}` : row.duration ? `Duration ${row.duration}` : proDate(match.playedAt)}</Text>
      {onPress && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Text style={{ color: dark ? '#D3ED9B' : b.accent, fontSize: 10, fontWeight: '600' }}>{live ? 'Live feed' : 'Match'}</Text><Ionicons name="chevron-forward" size={12} color={dark ? '#D3ED9B' : b.accent} /></View>}
    </View>
  </>;
  return <View style={[s.board, { backgroundColor: dark ? '#152820' : b.elevated, borderColor: dark ? '#152820' : b.edge }]}>
    {onPress ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${label}`} style={{ paddingHorizontal: 10, paddingBottom: 4 }}>{content}</Pressable> : <View style={{ paddingHorizontal: 10, paddingBottom: 4 }}>{content}</View>}
    {!hero && <View style={s.bookmark}><ProMatchStar row={row} dark={dark} /></View>}
  </View>;
});
const s = StyleSheet.create({
  board: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' }, header: { minHeight: 34, flexDirection: 'row', alignItems: 'center', paddingRight: 40 }, liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#FF707F' },
  columnLabels: { flexDirection: 'row', alignItems: 'center', minHeight: 12 }, columnLabel: { width: 24, textAlign: 'center', fontSize: 8, fontWeight: '500' },
  team: { minHeight: 58, paddingHorizontal: 6, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 6 }, score: { width: 24, textAlign: 'center', fontSize: 19, fontWeight: '600', fontVariant: ['tabular-nums'] }, pointScore: { width: 36, textAlign: 'center', fontSize: 19, fontWeight: '700', fontVariant: ['tabular-nums'], paddingVertical: 5, borderRadius: 5, overflow: 'hidden' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }, bookmark: { position: 'absolute', top: -4, right: 0 },
});
