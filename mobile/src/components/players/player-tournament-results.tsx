import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TrophyBreakdown } from '@/components/rankings/trophy-breakdown';

import { fetchPlayerTrophies, fetchPlayerTournamentResults, savedRankingResults } from '@/lib/player-results';
import { playerPoints, sapaMainRanking, type PublicPlayer, type PublicRanking } from '@/lib/players';
import type { PointResult, TrophyGroup } from '@/lib/rankings';
import { lightSapaTone } from '@/theme/sapa';
import { lightBrand as b } from '@/theme/tokens';
import { profileCard } from './profile-sections';
import { useForegroundClock } from '@/hooks/use-foreground-clock';

const tiers = ['Major', 'Super Gold', 'Gold', 'Silver', 'Bronze', 'Other'];
const heading = { color: b.premium, fontSize: 18, fontWeight: '700' } as const;
const body = { color: b.muted, fontSize: 13, lineHeight: 20 } as const;

function TrophyCabinet({ player, refreshKey }: { player: PublicPlayer; refreshKey: number }) {
  const [groups, setGroups] = useState<TrophyGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true); setError(false);
    fetchPlayerTrophies(player).then(rows => {
      if (live) setGroups(rows.sort((a, z) => tiers.indexOf(a.tier) - tiers.indexOf(z.tier)));
    }).catch(() => { if (live) setError(true); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [player, retry, refreshKey]);
  return <View style={{ gap: 12 }}>
    <Text accessibilityRole="header" style={heading}>Trophy cabinet</Text>
    {loading ? <ActivityIndicator accessibilityLabel="Loading trophy cabinet" color={b.accent} />
      : error ? <Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ ...body, color: b.danger }}>Could not load trophies. Tap to retry.</Text></Pressable>
        : groups.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {groups.map(item => {
            const tone = lightSapaTone(item.tier);
            return <Pressable key={item.tier} accessibilityRole="button"
              accessibilityLabel={`${item.count} ${item.tier} tournament ${item.count === 1 ? 'win' : 'wins'}`}
              accessibilityHint="Opens trophy breakdown"
              onPress={() => setSelected(item.tier)}
              style={{ flexBasis: '47%', flexGrow: 1, minHeight: 74, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: `${tone.fill}55`, backgroundColor: b.elevated, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${tone.fill}14` }}><Ionicons name="trophy-outline" size={23} color={tone.text} /></View>
              <View style={{ flex: 1, gap: 3 }}><Text style={{ color: tone.text, fontSize: 22, fontWeight: '700' }}>{item.count}</Text><Text style={body}>{item.tier}</Text></View>
              <Ionicons name="chevron-forward" size={14} color={tone.text} />
            </Pressable>;
          })}
        </View> : <View style={profileCard}><Text style={body}>No tournament wins published yet.</Text></View>}
    <TrophyBreakdown playerName={player.name} groups={groups} selectedTier={selected} onClose={() => setSelected(null)} />
  </View>;
}

function TournamentResults({ ranking, rankedinId, refreshKey }: { ranking: PublicRanking; rankedinId?: string; refreshKey: number }) {
  const [results, setResults] = useState<{ counted: PointResult[]; all: PointResult[] } | null>(null);
  const [best, setBest] = useState(true);
  const [limit, setLimit] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    fetchPlayerTournamentResults(ranking, rankedinId).then(value => { if (live) setResults(value); })
      .catch(() => { if (live) { setResults(null); setError('Could not refresh results. Showing saved Best 8 results; these may be out of date.'); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [ranking, rankedinId, retry, refreshKey]);
  const rows = best ? results?.counted ?? savedRankingResults(ranking) : results?.all ?? [];
  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: b.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>POINTS BREAKDOWN</Text>
      <View style={{ flexDirection: 'row', padding: 3, borderRadius: 10, backgroundColor: b.panel }}>
        {['Best 8', 'All'].map((label, index) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: best === (index === 0) }}
          onPress={() => { setBest(index === 0); setLimit(12); }}
          style={{ minHeight: 44, minWidth: 48, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: best === (index === 0) ? '#2449D8' : 'transparent' }}>
          <Text style={{ color: best === (index === 0) ? '#FFF' : b.muted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
        </Pressable>)}
      </View>
    </View>
    {loading && <ActivityIndicator accessibilityLabel="Loading tournament results" color={b.accent} />}
    {!!error && <View style={{ gap: 4 }}><Text accessibilityRole="alert" style={{ ...body, color: b.danger }}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(value => value + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '600' }}>Retry results</Text></Pressable></View>}
    {!loading && !rows.length && <View style={profileCard}><Text style={body}>{error && !best ? 'All results are currently unavailable.' : 'No tournament results published for this ranking yet.'}</Text></View>}
    {rows.slice(0, limit).map((result, index) => <View key={`${result.date}-${result.name}-${index}`} style={{ ...profileCard, gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <Text style={{ flex: 1, color: b.premium, fontSize: 14, fontWeight: '600', lineHeight: 21 }}>{result.name || 'Tournament'}</Text>
        <Text style={{ color: b.accent, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{playerPoints(result.points)}</Text>
      </View>
      <Text style={{ ...body, fontSize: 12 }}>{[result.date, result.event_type].filter(Boolean).join(' · ') || 'Date unavailable'}</Text>
      {!!result.class && <Text style={{ ...body, fontSize: 12 }}>{result.class}</Text>}
      <Text style={{ color: b.muted, fontSize: 12 }}>Standing: {result.place || '—'}</Text>
    </View>)}
    {rows.length > limit && <Pressable accessibilityRole="button" onPress={() => setLimit(value => value + 12)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '600' }}>Show more results ({Math.min(limit, rows.length)} of {rows.length})</Text></Pressable>}
  </View>;
}

export function PlayerTournamentResults({ player }: { player: PublicPlayer }) {
  const ranking = sapaMainRanking(player);
  const refreshKey = useForegroundClock(5 * 60 * 1000);
  return <>
    <TrophyCabinet key={player.id} player={player} refreshKey={refreshKey} />
    {ranking ? <TournamentResults key={player.id} ranking={ranking} rankedinId={player.rankedin_id} refreshKey={refreshKey} />
      : <View style={profileCard}><Text style={body}>No published SAPA tournament results for this player yet.</Text></View>}
  </>;
}
