import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { PlayerRanking } from '@/lib/pro-padel-live';
import { lightBrand as b } from '@/theme/tokens';

const number = (value: number) => value.toLocaleString('en-ZA', { maximumFractionDigits: 20 });
const title = (value: string) => ({ elo: 'Elo', official: 'Official', race: 'Race' })[value.toLowerCase() as 'elo' | 'official' | 'race'] || value;
const date = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date(value))
  : 'Date not published';

export function ProRankingList({ rankings }: { rankings: PlayerRanking[] }) {
  return <View style={s.list}>
    {rankings.map((entry, index) => {
      const change = Number.isSafeInteger(entry.rankChange) ? entry.rankChange : null;
      const changed = change !== null && change !== 0;
      const color = changed ? change > 0 ? b.accent : b.danger : b.muted;
      const movement = change === null ? 'Movement unavailable' : change === 0 ? 'No change' : `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)} ${Math.abs(change) === 1 ? 'place' : 'places'}`;
      const isElo = entry.type.toLowerCase() === 'elo';
      const pointsChange = entry.pointsChange === null ? 'Change unavailable' : entry.pointsChange === 0 ? isElo ? 'Rating unchanged' : 'Points unchanged' : `${entry.pointsChange > 0 ? '+' : '−'}${number(Math.abs(entry.pointsChange))} ${isElo ? 'rating' : 'pts'}`;
      return <View key={`${entry.type}-${entry.date}-${index}`} style={[s.row, index > 0 && s.divider]}>
        <Text accessibilityLabel={`${title(entry.type)} rank ${entry.rank ?? 'unavailable'}`} style={s.rank}>{entry.rank !== null ? `#${number(entry.rank)}` : '—'}</Text>
        <View style={s.details}>
          <Text style={s.title}>{title(entry.type)}</Text>
          <Text style={s.points}>{entry.points !== null ? `${number(entry.points)} ${entry.type.toLowerCase() === 'elo' ? 'rating' : 'points'}` : 'Points unavailable'}</Text>
          <Text style={s.date}>{date(entry.date)}</Text>
        </View>
        <View style={s.changes}>
          <View accessible accessibilityLabel={`${movement} since the previous published entry`} style={s.movement}>
            <Ionicons name={changed ? change > 0 ? 'arrow-up' : 'arrow-down' : 'remove'} size={14} color={color} />
            <Text style={[s.change, { color }]}>{changed ? Math.abs(change) : change === 0 ? 'No change' : '—'}</Text>
          </View>
          <Text style={[s.delta, { color: entry.pointsChange != null && entry.pointsChange !== 0 ? entry.pointsChange > 0 ? b.accent : b.danger : b.muted }]}>{pointsChange}</Text>
        </View>
      </View>;
    })}
  </View>;
}

const s = StyleSheet.create({
  list: { backgroundColor: b.elevated, borderRadius: 16, borderWidth: 1, borderColor: b.edge, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: b.edge },
  rank: { color: b.premium, fontSize: 21, lineHeight: 28, fontWeight: '600', fontVariant: ['tabular-nums'], minWidth: 56 },
  details: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: b.premium, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  points: { color: b.premium, fontSize: 11, lineHeight: 16, fontVariant: ['tabular-nums'] },
  date: { color: b.muted, fontSize: 11, lineHeight: 16 },
  changes: { maxWidth: 112, alignItems: 'flex-end', gap: 8 },
  movement: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  change: { fontSize: 11, lineHeight: 16, fontWeight: '500', fontVariant: ['tabular-nums'] },
  delta: { fontSize: 11, lineHeight: 16, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
