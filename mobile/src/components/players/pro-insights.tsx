import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { HomeAction } from '@/components/home-action';
import { ErrorBanner } from '@/components/error-banner';
import { fetchProInsight, type InsightResult, type Performance, type Rivals } from '@/lib/pro-padel-insights';
import { playerCountryFlag } from '@/lib/player-hub';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

export function ProInsights({ subject, onPlayer }: { subject: { player: number } | { pair: string }; onPlayer?: (id: number, name: string) => void }) {
  const [mode, setMode] = useState<'rivals' | 'performance' | null>(null);
  const [rivals, setRivals] = useState<InsightResult<Rivals> | null>(null);
  const [performance, setPerformance] = useState<InsightResult<Performance> | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const key = 'player' in subject ? `player:${subject.player}` : `pair:${subject.pair}`;
  const isPair = 'pair' in subject;
  useEffect(() => { setMode(null); setRivals(null); setPerformance(null); setError(''); }, [key]);
  useEffect(() => {
    if (!mode || (mode === 'rivals' ? rivals : performance)) return;
    let active = true;
    setLoading(true); setError('');
    const request = mode === 'rivals' ? fetchProInsight('rivals', subject).then(value => { if (active) setRivals(value); }) : fetchProInsight('performance', subject).then(value => { if (active) setPerformance(value); });
    void request.catch(e => { if (active) setError(e instanceof Error ? e.message : 'Insights could not be loaded.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, key]);
  const active = mode === 'rivals' ? rivals : performance;
  const data = performance?.data;
  return <View style={{ gap: 12 }}>
    <Text style={{ color: b.premium, fontSize: 18, fontWeight: '700' }}>{isPair ? 'Partnership insights' : 'Player insights'}</Text>
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><HomeAction label={mode === 'rivals' ? 'Close rivals' : 'Rivals'} onPress={() => setMode(value => value === 'rivals' ? null : 'rivals')} /><HomeAction label={mode === 'performance' ? 'Close performance' : isPair ? 'Pair synergy' : 'Player form'} onPress={() => setMode(value => value === 'performance' ? null : 'performance')} /></View>
    <ErrorBanner message={error} top={60} />
    {!!error && <Text style={{ color: b.danger, fontSize: 12 }}>{error}</Text>}
    {mode && <View style={{ backgroundColor: b.elevated, borderRadius: 18, padding: 16, gap: 14, borderWidth: 1, borderColor: b.edge }}>
      {loading && <ActivityIndicator color={loadingBlue} />}
      {active?.unavailable && <Text style={{ color: b.muted, lineHeight: 20 }}>{active.unavailable === 'subscription' ? 'This insight is not included in our current data coverage.' : 'This insight is not available for this player or pair yet.'}</Text>}
      {mode === 'rivals' && rivals?.data && <>
        <Text style={{ color: b.premium, fontWeight: '700' }}>Most played rivals</Text><Text style={{ color: b.muted, fontSize: 12, lineHeight: 18 }}>Up to 10 rivals · finished or retired main-draw matches. Records are from this {isPair ? 'pair’s' : 'player’s'} perspective.</Text>
        {rivals.data.rivals.map(rival => <View key={rival.id} style={{ gap: 7, borderTopWidth: 1, borderTopColor: b.edge, paddingTop: 12 }}>
          {typeof rival.id === 'number' && onPlayer ? <HomeAction label={`${playerCountryFlag(rival.nationality)} ${rival.name}`.trim()} onPress={() => onPlayer(rival.id as number, rival.name)} /> : <Text style={{ color: b.premium, fontWeight: '600' }}>{rival.name}</Text>}
          <Text style={{ color: b.accent, fontVariant: ['tabular-nums'], fontWeight: '600' }}>{rival.won !== null && rival.played !== null ? `${rival.won} wins · ${rival.played - rival.won} losses` : 'Record unavailable'}{rival.winPercentage !== null ? ` · ${rival.winPercentage}% wins` : ''}</Text>
        </View>)}
        {!rivals.data.rivals.length && <Text style={{ color: b.muted }}>No recorded main-draw rivalries yet.</Text>}
      </>}
      {mode === 'performance' && data && <>
        <Text style={{ color: b.premium, fontWeight: '700', fontSize: 17 }}>{isPair ? 'Pair synergy' : 'Player form'}{data.trend ? ` · ${data.trend}` : ''}</Text>
        <Text style={{ color: b.muted, fontSize: 12 }}>{data.from?.slice(0, 10) || 'First recorded match'} – {data.to?.slice(0, 10) || 'Latest recorded match'} · {data.played ?? '—'} matches</Text>
        <Text style={{ color: b.accent, fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{data.delta === null ? 'Insufficient data' : `${data.delta > 0 ? '+' : ''}${data.delta.toFixed(1)} pp`}</Text>
        <View style={{ flexDirection: 'row', gap: 24 }}><View style={{ gap: 5 }}><Text style={{ color: b.muted, fontSize: 12 }}>Actual win rate</Text><Text style={{ color: b.premium, fontSize: 20, fontWeight: '600' }}>{data.actual === null ? '—' : `${data.actual.toFixed(1)}%`}</Text></View><View style={{ gap: 5 }}><Text style={{ color: b.muted, fontSize: 12 }}>Elo expected</Text><Text style={{ color: b.premium, fontSize: 20, fontWeight: '600' }}>{data.expected === null ? '—' : `${data.expected.toFixed(1)}%`}</Text></View></View>
        <Text style={{ color: b.muted, fontSize: 12, lineHeight: 18 }}>Actual versus Elo-expected wins at the time of each match. Includes qualifying. The difference is in percentage points (pp), not ranking movement.</Text>
        {!!data.streak && <Text style={{ color: b.premium }}>Current streak · {data.streak.matches} {data.streak.result === 'won' ? 'wins' : 'losses'}</Text>}
        {data.windows.map(window => <View key={window.label} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: b.edge, paddingTop: 10 }}><Text style={{ color: b.muted }}>{window.label}</Text><Text style={{ color: b.premium }}>{window.value.delta === null ? '—' : `${window.value.delta > 0 ? '+' : ''}${window.value.delta.toFixed(1)} pp`} · {window.value.played ?? '—'} matches</Text></View>)}
      </>}
    </View>}
  </View>;
}
