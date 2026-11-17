import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeSegmentedControl } from './native-segmented-control';
import { ProPairPortraits } from './pro-player-identity';
import { liveFeedGames, gameScorePair, recordedPointWinner, recordedGameEndScore } from '@/lib/pro-live-feed';
import { proPairName } from '@/lib/pro-player-display';
import type { ProPerson } from '@/lib/pro-padel';
import type { PointFeed } from '@/lib/pro-padel-live';
import { lightBrand as b } from '@/theme/tokens';

const colors = [b.accent, '#1C628E'];
export function ProLiveFeed({ feed, names, teams, photos = {} }: { feed: PointFeed | null; names: string[]; teams: ProPerson[][]; photos?: Record<number, string | null | undefined> }) {
  const [selectedSet, setSelectedSet] = useState('0');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const games = liveFeedGames(feed, Number(selectedSet));
  const periods = [...new Set(games.map(row => row.set.set_number))];
  const stamp = feed?.freshness?.updatedAt, validStamp = stamp && Number.isFinite(Date.parse(stamp));
  const time = validStamp ? new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Johannesburg' }).format(new Date(stamp)) : '';
  const labels = teams.map(proPairName);
  return <View style={{ gap: 10 }}>
    <View style={s.meta}><Text style={s.caption}>{feed?.freshness?.stale ? 'Refresh paused' : feed?.coverage === 'partial' ? 'Partial game history' : feed?.coverage === 'tracking' ? 'Live tracking' : feed?.coverage === 'full' ? 'Recorded games' : 'No point coverage'}</Text>{!!time && <Text style={s.caption}>{time} SAST</Text>}</View>
    {!!feed?.sets.length && <NativeSegmentedControl label="Set in live feed" value={selectedSet} onChange={setSelectedSet} options={[{ value: '0', label: 'All sets' }, ...feed.sets.map(row => ({ value: String(row.set_number), label: `Set ${row.set_number}` }))]} />}
    <View style={{ gap: 6 }}>{teams.map((team, index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ width: 4, height: 16, borderRadius: 2, backgroundColor: colors[index] }} /><ProPairPortraits team={team} photos={photos} /><Text numberOfLines={1} style={{ flex: 1, color: b.muted, fontSize: 11 }}>{labels[index]}</Text></View>)}</View>
    {periods.map(number => {
      const rows = games.filter(row => row.set.set_number === number), period = rows[0].set;
      return <View key={number} style={s.section}>
        <View style={s.setHeader}><Text style={s.setTitle}>Set {number}</Text><Text style={s.caption}>{period.set_score ? period.set_score.replace('-', '–') : 'In progress'}</Text></View>
        {rows.map(({ set, game, current, key, winner }) => {
          const open = expanded[key] ?? current, before = gameScorePair(game.game_score), tiebreak = before?.[0] === 6 && before[1] === 6;
          const broken = !tiebreak && winner !== null && game.serving === (winner === 0 ? 'team_2' : 'team_1');
          const server = game.serving === 'team_1' ? 0 : game.serving === 'team_2' ? 1 : null;
          const focus = winner ?? (current ? server : null);
          const after = recordedGameEndScore(set, set.games.indexOf(game));
          const score = current ? game.points.at(-1)?.replace(':', '–') || '—' : after?.replace('-', '–') || '—';
          return <View key={key} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: b.edge }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Set ${number}, game ${game.game_number}. ${current ? 'In progress' : winner !== null ? `${names[winner]} won${broken ? ', break of serve' : ''}` : 'Result not recorded'}. ${open ? 'Hide' : 'Show'} points`} onPress={() => setExpanded(old => ({ ...old, [key]: !open }))} style={[s.gameHeader, current && { backgroundColor: '#EDF3E9' }]}>
              <View style={s.gameNumber}><Text style={s.caption}>Game</Text><Text style={s.gameDigit}>{game.game_number}</Text></View>
              <View style={{ flex: 1, gap: 4 }}><View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>{focus !== null && <ProPairPortraits team={teams[focus] || []} photos={photos} size={18} />}<Text numberOfLines={1} style={s.teamLabel}>{focus !== null ? labels[focus] : 'Recorded game'}</Text></View><Text style={s.caption}>{current ? 'In play' : broken ? 'Break of serve' : winner !== null ? 'Game won' : 'Result not recorded'}</Text></View>
              <View style={{ alignItems: 'flex-end', minWidth: 52, gap: 2 }}><Text style={s.caption}>{current ? 'Points' : 'Games'}</Text><Text style={s.score}>{score}</Text></View><Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={b.muted} />
            </Pressable>
            {open && <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
              <Text style={s.context}>{server !== null ? `Serving · ${labels[server]}` : 'Serving team not recorded'} · At {game.game_score || '—'}</Text>
              {game.points.length ? [...game.points].map((point, index) => ({ point, index })).reverse().map(({ point, index }) => {
                const won = recordedPointWinner(game.points[index - 1], point, tiebreak), latest = current && index === game.points.length - 1;
                return <View key={index} accessible accessibilityLabel={`${point.replace(':', ' to ')}. ${won !== null ? `${names[won]} won this recorded point` : point === '0:0' ? 'Game started' : 'Recorded score update'}${latest ? '. Latest' : ''}`} style={[s.point, latest && { backgroundColor: '#F0F5EB' }]}>
                  <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: won !== null ? colors[won] : b.edge }} />
                  {won !== null ? <ProPairPortraits team={teams[won] || []} photos={photos} size={18} /> : <View style={{ width: 31 }} />}
                  <Text numberOfLines={1} style={[s.pointName, won !== null && { color: colors[won] }]}>{won !== null ? labels[won] : point === '0:0' ? 'Game started' : 'Score update'}</Text>
                  {latest && <View style={s.latestDot} />}<Text style={[s.pointScore, latest && { fontWeight: '700' }]}>{point.replace(':', '–')}</Text>
                </View>;
              }) : <Text style={s.context}>No recorded points</Text>}
            </View>}
          </View>;
        })}
      </View>;
    })}
    {!games.length && <Text style={s.context}>Point-by-point data has not been published for this match.</Text>}
    {!!games.length && <Text style={s.footnote}>Latest game first. Recorded transitions only; some points can be missing or corrected.</Text>}
  </View>;
}
const s = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, caption: { color: b.muted, fontSize: 10, lineHeight: 14 },
  section: { backgroundColor: b.elevated, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: b.edge }, setHeader: { paddingHorizontal: 12, minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, setTitle: { color: b.premium, fontSize: 12, fontWeight: '600' },
  gameHeader: { minHeight: 58, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }, gameNumber: { width: 28, gap: 1 }, gameDigit: { color: b.premium, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] }, teamLabel: { color: b.premium, fontWeight: '600', fontSize: 12, flexShrink: 1 }, score: { color: b.premium, fontSize: 19, fontWeight: '600', fontVariant: ['tabular-nums'] },
  context: { color: b.muted, fontSize: 10, lineHeight: 15, paddingVertical: 8 }, point: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: b.edge }, pointName: { flex: 1, color: b.muted, fontSize: 12 }, pointScore: { minWidth: 50, textAlign: 'right', color: b.premium, fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] }, latestDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: b.accent }, footnote: { color: b.muted, fontSize: 10, lineHeight: 15 },
});
