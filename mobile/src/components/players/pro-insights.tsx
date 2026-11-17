import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HomeAction } from '@/components/home-action';
import { ErrorBanner } from '@/components/error-banner';
import { ProAvatar, ProPairPortraits } from '@/components/pro-player-identity';
import { useProPlayerPortraits } from '@/hooks/use-pro-player-portraits';
import { fetchProInsight, type InsightResult, type Performance, type Rivals, type Rival } from '@/lib/pro-padel-insights';
import { playerCountryFlag } from '@/lib/player-hub';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

function RivalRows({ rivals, onPlayer }: { rivals: Rival[]; onPlayer?: (id: number, name: string) => void }) {
  const teams = rivals.map(rival => {
    const ids = typeof rival.id === 'number' ? [rival.id] : rival.id.split('-').map(Number);
    const names = rival.name.split(/\s*\/\s*/);
    return ids.map((id, index) => ({ id, name: names[index] || rival.name, nationality: ids.length === 1 ? rival.nationality : null }));
  });
  const photos = useProPlayerPortraits(teams.flat().map(player => player.id));
  return <View>{rivals.map((rival, index) => {
    const team = teams[index];
    const canOpen = typeof rival.id === 'number' && !!onPlayer;
    const record = rival.won !== null && rival.played !== null ? `${rival.won} wins · ${rival.played - rival.won} losses` : 'Record unavailable';
    return <Pressable key={rival.id} disabled={!canOpen} accessibilityRole={canOpen ? 'button' : undefined} accessibilityLabel={`${rival.name}. ${record}.${rival.winPercentage !== null ? ` ${rival.winPercentage}% wins.` : ''}${canOpen ? ' View player profile.' : ''}`} onPress={() => { if (typeof rival.id === 'number') onPlayer?.(rival.id, rival.name); }} style={s.rival}>
      {team.length === 1 ? <ProAvatar player={team[0]} photo={photos[team[0].id]} size={36} /> : <ProPairPortraits team={team} photos={photos} size={28} />}
      <View style={s.identity}><Text numberOfLines={2} style={s.name}>{playerCountryFlag(rival.nationality)}{rival.nationality ? ' ' : ''}{rival.name}</Text><Text style={s.record}>{record}</Text></View>
      <View style={s.rate}><Text style={s.percentage}>{rival.winPercentage !== null ? `${rival.winPercentage.toLocaleString('en-ZA', { maximumFractionDigits: 2 })}%` : '—'}</Text><Text style={s.caption}>wins</Text></View>
      {canOpen && <Ionicons name="chevron-forward" size={14} color={b.muted} />}
    </Pressable>;
  })}</View>;
}

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
    <Text style={{ color: b.premium, fontSize: 18, fontWeight: '600' }}>{isPair ? 'Partnership insights' : 'Player insights'}</Text>
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><HomeAction label="Rivals" compact size="small" kind={mode === 'rivals' ? 'primary' : 'outline'} accentColor={b.messagingAction} accessibilityLabel={`${mode === 'rivals' ? 'Hide' : 'Show'} rivals`} onPress={() => setMode(value => value === 'rivals' ? null : 'rivals')} /><HomeAction label={isPair ? 'Pair synergy' : 'Player form'} compact size="small" kind={mode === 'performance' ? 'primary' : 'outline'} accentColor={b.messagingAction} accessibilityLabel={`${mode === 'performance' ? 'Hide' : 'Show'} ${isPair ? 'pair synergy' : 'player form'}`} onPress={() => setMode(value => value === 'performance' ? null : 'performance')} /></View>
    <ErrorBanner message={error} top={60} />
    {!!error && <Text style={{ color: b.danger, fontSize: 12 }}>{error}</Text>}
    {mode && <View style={{ backgroundColor: b.elevated, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: b.edge }}>
      {loading && <ActivityIndicator color={loadingBlue} />}
      {active?.unavailable && <Text style={{ color: b.muted, lineHeight: 20 }}>{active.unavailable === 'subscription' ? 'This insight is not included in our current data coverage.' : 'This insight is not available for this player or pair yet.'}</Text>}
      {mode === 'rivals' && rivals?.data && <>
        <View style={{ gap: 4 }}><Text style={{ color: b.premium, fontWeight: '600', fontSize: 15 }}>Most played rivals</Text><Text style={{ color: b.muted, fontSize: 11, lineHeight: 16 }}>Up to 10 · finished or retired main-draw matches</Text><Text style={{ color: b.muted, fontSize: 11, lineHeight: 16 }}>Records from this {isPair ? 'pair’s' : 'player’s'} perspective</Text></View>
        <RivalRows rivals={rivals.data.rivals} onPlayer={onPlayer} />
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

const s = StyleSheet.create({
  rival: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: b.edge },
  identity: { flex: 1, minWidth: 0, gap: 4 },
  name: { color: b.premium, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  record: { color: b.muted, fontSize: 11, lineHeight: 16, fontVariant: ['tabular-nums'] },
  rate: { alignItems: 'flex-end', gap: 2 },
  percentage: { color: b.premium, fontSize: 14, lineHeight: 20, fontWeight: '500', fontVariant: ['tabular-nums'] },
  caption: { color: b.muted, fontSize: 11, lineHeight: 16 },
});
