import { ErrorBanner } from '@/components/error-banner';
import { HomeAction } from '@/components/home-action';
import { ProPairPortraits } from '@/components/pro-player-identity';
import { useProPlayerPortraits } from '@/hooks/use-pro-player-portraits';
import { useJourneyWinEstimate } from '@/hooks/use-journey-win-estimate';
import { playerCountryFlag } from '@/lib/player-hub';
import { type ProCategory, type ProPerson } from '@/lib/pro-padel';
import { fetchTournamentDetails, fetchTournamentDraw } from '@/lib/pro-padel-live';
import { readTournament, rememberTournament, type TournamentSnapshot } from '@/lib/pro-tournament-cache';
import { tournamentEntries, tournamentPairJourney, tournamentPairKey, validTournamentPairKey, type TournamentEntry, type JourneyStage } from '@/lib/pro-tournament-entries';
import { projectedOpponent, winEstimateLabel } from '@/lib/pro-journey-prediction';
import { proPairName } from '@/lib/pro-player-display';
import { startForegroundTask } from '@/lib/foreground-task';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const stageLabels = { won: 'Won', lost: 'Lost', bye: 'Bye', live: 'Live', upcoming: 'Next', possible: 'If they advance', unresolved: 'Result awaiting confirmation' };
function Estimate({ value, pending, alternative = false }: { value: number | null; pending: boolean; alternative?: boolean }) {
  return <View style={{ alignItems: 'flex-end', gap: 3, minWidth: 53 }}>{pending ? <ActivityIndicator size="small" color={loadingBlue} /> : value != null ? <><Text style={[s.probability, alternative && { fontSize: 16 }]}>{winEstimateLabel(value)}</Text><Text style={s.probabilityLabel}>win chance</Text></> : <Text style={s.probabilityLabel}>Unavailable</Text>}</View>;
}
function Opponent({ team, selection, enabled = true, onPress, onEstimateError }: { team: ProPerson[]; selection: { row: JourneyStage['row']; team: ProPerson[]; date: string; revision: number }; enabled?: boolean; onPress: () => void; onEstimateError: () => void }) {
  const photos = useProPlayerPortraits(team.map(player => player.id), enabled);
  const estimate = useJourneyWinEstimate(selection.row, selection.team, team, selection.date, enabled, selection.revision);
  useEffect(() => { if (estimate.error) onEstimateError(); }, [estimate.error]);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${team.map(player => player.name).join(' and ')}. ${estimate.value != null ? `${proPairName(selection.team)} win chance ${winEstimateLabel(estimate.value)} from Padel API Elo. ` : ''}View opponent journey`} onPress={onPress} style={s.opponent}>
    <ProPairPortraits team={team} photos={photos} size={26} /><View style={{ flex: 1, gap: 3 }}>{team.map(player => <Text key={player.id} numberOfLines={1} style={s.opponentName}>{playerCountryFlag(player.nationality)} {player.name}</Text>)}</View><Estimate value={estimate.value} pending={estimate.pending} alternative /><Ionicons name="chevron-forward" size={15} color={b.muted} />
  </Pressable>;
}
function Stage({ stage, last, team, entries, date, revision, onMatch, onPair, onEstimateError }: { stage: JourneyStage; last: boolean; team: ProPerson[]; entries: TournamentEntry[]; date: string; revision: number; onMatch: () => void; onPair: (key: string) => void; onEstimateError: () => void }) {
  const [expanded, setExpanded] = useState(false), [alternativeLimit, setAlternativeLimit] = useState(3);
  const success = ['won', 'bye'].includes(stage.outcome), live = stage.outcome === 'live', lost = stage.outcome === 'lost';
  const color = live || lost ? b.danger : success ? b.accent : b.muted;
  const opponent = projectedOpponent(stage, entries), key = opponent && tournamentPairKey(opponent);
  const projected = stage.conditional || stage.opponents.length > 1 || stage.unknownOpponent;
  const seededProjection = entries.some(entry => entry.key === key && entry.seedsByDraw[stage.draw] != null);
  const photos = useProPlayerPortraits(opponent?.map(player => player.id) || []);
  const prediction = useJourneyWinEstimate(stage.row, team, opponent, date, !success && !lost && stage.outcome !== 'unresolved', revision);
  const estimate = prediction.value;
  useEffect(() => { if (prediction.error) onEstimateError(); }, [prediction.error]);
  const score = stage.side != null ? stage.row.match.score.map(set => set[stage.side!] != null && set[1 - stage.side!] != null ? `${set[stage.side!]}–${set[1 - stage.side!]}` : '').filter(Boolean).join('  ') : '';
  const round = stage.draw === 'main' ? ({ 1: 'Final', 2: 'SF', 4: 'QF' }[stage.row.match.round] || `R${stage.row.match.round * 2}`) : stage.label.replace('Qualifying ', 'Q');
  const alternatives = stage.opponents.filter(pair => tournamentPairKey(pair) !== key);
  return <View style={s.stageRow}>
    <View style={s.rail}>{!last && <View style={s.railLine} />}<View style={[s.dot, { borderColor: color, backgroundColor: success ? b.accent : b.elevated }]}>{success ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : last && stage.draw === 'main' ? <Ionicons name="trophy-outline" size={12} color={b.muted} /> : live ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: b.danger }} /> : lost ? <Ionicons name="close" size={11} color={b.danger} /> : null}</View></View>
    <View style={{ flex: 1, paddingBottom: 10 }}>
      <Pressable accessibilityRole={stage.outcome === 'bye' ? 'text' : 'button'} accessibilityLabel={`${round}. ${stageLabels[stage.outcome]}. ${opponent ? `Versus ${proPairName(opponent)}. ${projected ? seededProjection ? 'Seed-based projected opponent.' : 'Possible opponent; unseeded alternatives are not ranked.' : 'Confirmed opponent.'}` : stage.outcome === 'bye' ? 'Advances without playing.' : 'Opponent awaiting publication.'}${estimate != null ? ` Estimated chance to win this matchup ${winEstimateLabel(estimate)}.` : ''}`} onPress={stage.outcome === 'bye' ? undefined : stage.side != null && !projected ? onMatch : () => setExpanded(value => !value)} style={[s.compactStage, success && { backgroundColor: '#ECF1E9' }, last && stage.draw === 'main' && stage.row.match.round === 1 && { backgroundColor: '#F7F1E4' }]}>
        {opponent && stage.outcome !== 'bye' && <ProPairPortraits team={opponent} photos={photos} size={29} />}
        <View style={{ flex: 1, gap: 5 }}><Text style={s.round}>{round} <Text style={{ color, fontWeight: '500', fontSize: 10 }}> · {projected ? seededProjection ? 'Projected' : 'Possible' : stageLabels[stage.outcome]}</Text></Text><Text numberOfLines={2} style={s.compactName}>{stage.outcome === 'bye' ? 'Advances without playing' : opponent ? proPairName(opponent) : 'Opponent to be confirmed'}</Text></View>
        {stage.outcome === 'bye' ? <Text style={s.byeTag}>BYE</Text> : score ? <Text style={s.compactScore}>{score}</Text> : success || lost ? <Text style={s.probabilityLabel}>{stageLabels[stage.outcome]}</Text> : <Estimate value={estimate} pending={prediction.pending} />}
        {stage.outcome !== 'bye' && <Ionicons name={expanded ? 'chevron-up' : 'chevron-forward'} size={14} color={b.muted} />}
      </Pressable>
      {(alternatives.length > 0 || stage.unknownOpponent) && <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={s.compactExpand}><Text style={s.small}>{alternatives.length ? `+${alternatives.length} possible ${alternatives.length === 1 ? 'opponent' : 'opponents'}` : 'More players to be confirmed'}{stage.unknownOpponent && alternatives.length ? ' · qualifier TBC' : ''}</Text><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={b.muted} /></Pressable>}
      {expanded && <View style={s.alternatives}>{alternatives.slice(0, alternativeLimit).map(pair => <Opponent key={tournamentPairKey(pair)} team={pair} selection={{ row: stage.row, team, date, revision }} onPress={() => onPair(tournamentPairKey(pair)!)} onEstimateError={onEstimateError} />)}{alternatives.length > alternativeLimit && <HomeAction label={`Show ${Math.min(3, alternatives.length - alternativeLimit)} more opponents`} onPress={() => setAlternativeLimit(value => value + 3)} />}{stage.unknownOpponent && <Text style={s.small}>Some places are awaiting publication.</Text>}{stage.side != null && stage.outcome !== 'bye' && <HomeAction label={live ? 'Watch live' : 'View match'} onPress={onMatch} />}</View>}
    </View>
  </View>;
}

export function ProPairJourneyScreen({ id, pair, category }: { id: number; pair: string; category: ProCategory }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<TournamentSnapshot | undefined>(() => readTournament(id));
  const [loading, setLoading] = useState(!snapshot), [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false), [estimateRevision, setEstimateRevision] = useState(0);
  const sequence = useRef(0);
  const valid = Number.isSafeInteger(id) && id > 0 && validTournamentPairKey(pair);
  const load = useCallback(async (force = false) => {
    if (!valid) { setLoading(false); setError('This tournament pair link is invalid.'); return; }
    if (force) { setEstimateRevision(value => value + 1); setRefreshing(true); setError(''); }
    const cached = readTournament(id);
    if (!force && cached && Date.now() - cached.loadedAt < 60000) { setSnapshot(cached); setLoading(false); return; }
    const current = ++sequence.current;
    setLoading(!cached);
    try {
      const [draw, event] = await Promise.all([fetchTournamentDraw(id), cached?.event ? Promise.resolve(cached.event) : fetchTournamentDetails(id)]);
      if (sequence.current !== current) return;
      rememberTournament(id, { matches: draw.matches, complete: draw.complete, event });
      setSnapshot(readTournament(id)); setError('');
    } catch { if (sequence.current === current) setError('The tournament journey could not be refreshed. Try again.'); }
    finally { if (sequence.current === current) { setLoading(false); setRefreshing(false); } }
  }, [id, valid]);
  useFocusEffect(useCallback(() => { const stop = startForegroundTask(() => load(), 60000); return () => { sequence.current++; stop(); }; }, [load]));
  const journey = useMemo(() => tournamentPairJourney(snapshot?.matches || [], id, category, pair, snapshot?.complete ?? false), [snapshot, id, category, pair]);
  const allEntries = useMemo(() => tournamentEntries(snapshot?.matches || [], id, category), [snapshot, id, category]);
  const team = journey.entry?.team || [];
  const photos = useProPlayerPortraits(team.map(player => player.id));
  const mainStages = journey.stages.filter(stage => stage.draw === 'main');
  const passed = mainStages.filter(stage => ['won', 'bye'].includes(stage.outcome)).length;
  const openPair = (key: string) => router.push({ pathname: '/pro/tournament/[id]/pair/[pair]', params: { id: String(id), pair: key, category } });
  return <SafeAreaView style={{ flex: 1, backgroundColor: b.page }} edges={['top']}>
    <View style={s.topbar}><HomeAction label="Entries" icon="previous" onPress={() => router.canGoBack() ? router.back() : router.replace({ pathname: '/pro/tournament/[id]', params: { id: String(id), tab: 'entries', category } })} /><View style={{ flex: 1 }} /><Text style={s.topTitle}>Pair journey</Text><View style={{ flex: 1 }} /><Pressable accessibilityRole="button" accessibilityLabel="Refresh pair journey" onPress={() => void load(true)} style={s.refresh}>{loading ? <ActivityIndicator size="small" color={loadingBlue} /> : <Ionicons name="refresh" size={20} color={b.accent} />}</Pressable></View>
    <ErrorBanner message={error} top={60} />
    <ScrollView contentContainerStyle={s.body} refreshControl={<RefreshControl colors={[loadingBlue]} refreshing={refreshing} onRefresh={() => void load(true)} tintColor={loadingBlue} />}>
      <Text numberOfLines={2} style={s.eventName}>{snapshot?.event?.name || 'Tournament'} · {category === 'men' ? 'Men' : 'Women'}</Text>
      {loading && !snapshot && <ActivityIndicator color={loadingBlue} />}
      {journey.entry && <>
        <View style={s.hero}>
          <View style={s.between}><Text style={s.heroMeta}>{journey.entry.draws.includes('main') ? 'MAIN DRAW' : 'QUALIFYING'}</Text>{journey.entry.seed != null && <Text style={s.heroSeed}>Seed {journey.entry.seed}</Text>}</View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><ProPairPortraits team={team} photos={photos} size={44} /><View style={{ flex: 1, gap: 4 }}>{team.map(player => <Pressable key={player.id} accessibilityRole="button" accessibilityLabel={`View ${player.name}'s profile`} onPress={() => router.push({ pathname: '/pro/player/[id]', params: { id: String(player.id), name: player.name, category } })} style={{ minHeight: 28, justifyContent: 'center' }} hitSlop={{ left: 0, right: 10, top: 6, bottom: 6 }}><Text style={s.heroName}>{playerCountryFlag(player.nationality)} {player.name}</Text></Pressable>)}</View></View>
          <View style={s.heroFooter}><Ionicons name={journey.champion ? 'trophy' : 'git-branch-outline'} size={17} color="#DAE9BD" /><Text style={s.heroStatus}>{journey.champion ? 'Tournament champions' : journey.eliminated ? journey.entry.status : journey.winsRemaining != null ? `${journey.winsRemaining} ${journey.winsRemaining === 1 ? 'win' : 'wins'} from the title` : journey.entry.status}</Text><Pressable accessibilityRole="button" accessibilityLabel="About the win estimates" onPress={() => Alert.alert('Win estimates', 'Every percentage is the selected pair’s chance of beating the displayed opponent, using Padel API’s pre-match Elo simulation. Projections favour the best published seed in a branch. Unseeded alternatives are not ranked. Other opponents may advance. Other services use different models, so their percentages can differ. These are not live odds or title probabilities. Unknown qualifiers can change the path.')} hitSlop={12} style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="information-circle-outline" size={20} color="#BCD0C2" /></Pressable></View>
          {mainStages.length > 0 && <View accessibilityLabel={`${passed} of ${mainStages.length} published rounds passed`} style={{ flexDirection: 'row', gap: 4 }}>{mainStages.map((stage, index) => <View key={stage.key} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: index < passed ? '#A2BE73' : '#3A4B41' }} />)}</View>}
        </View>
        <View style={{ gap: 5, marginTop: 7 }}><Text accessibilityRole="header" style={s.heading}>{journey.eliminated ? 'Their tournament' : 'Route to the trophy'}</Text><Text style={s.small}>Win chance for {proPairName(team)} against each opponent.</Text><View style={s.sourceLine}><Text style={s.modelLabel}>Padel API · Elo model</Text><Text style={s.small}>{snapshot?.event?.startDate ? `Reference: ${snapshot.event.startDate.slice(0, 10)}` : 'Pre-match estimates'}</Text></View><Text style={s.small}>Future opponents are provisional.</Text></View>
        <View>{journey.stages.map((stage, index) => <Stage key={stage.key} stage={stage} last={index === journey.stages.length - 1} team={team} entries={allEntries} date={snapshot?.event?.startDate?.slice(0, 10) || ''} revision={estimateRevision} onMatch={() => router.push({ pathname: '/pro/match/[id]', params: { id: String(stage.row.match.id), from: 'tournament', tournament: String(id) } })} onPair={openPair} onEstimateError={() => setError('Some win estimates could not be verified or loaded. Pull to refresh and try again.')} />)}</View>
        {!!journey.notice && <Text style={s.notice}>{journey.notice}</Text>}
      </>}
      {!loading && !journey.entry && <View style={{ gap: 12, paddingVertical: 20 }}><Text style={s.heading}>Pair not in the published draw</Text><Text style={s.small}>The entry or draw may have changed. Return to Entries to choose a pair.</Text><HomeAction label="Try again" onPress={() => void load(true)} /></View>}
      <Text style={s.small}>Draw and results · PadelAPI{snapshot?.matches.some(row => row.freshness?.stale) ? ' · Cached data; pull to refresh' : ''}</Text>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  sourceLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, modelLabel: { color: b.muted, fontSize: 10, fontWeight: '600', backgroundColor: b.panel, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 6 },
  compactStage: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: b.elevated, borderRadius: 9 },
  compactName: { color: b.premium, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  compactScore: { color: b.premium, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  probability: { color: b.accent, fontSize: 19, lineHeight: 23, fontWeight: '600', fontVariant: ['tabular-nums'] },
  probabilityLabel: { fontSize: 9, lineHeight: 12, color: b.muted }, byeTag: { color: b.accent, fontSize: 12, fontWeight: '700' },
  compactExpand: { minHeight: 32, flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 10 },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: b.edge },
  topTitle: { color: b.premium, fontSize: 14, fontWeight: '600' }, refresh: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20, gap: 14, paddingBottom: 50 }, eventName: { color: b.muted, fontSize: 12, lineHeight: 18 },
  hero: { backgroundColor: '#152820', borderRadius: 16, padding: 16, gap: 10 }, between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroMeta: { color: '#BCD0C2', fontSize: 10, letterSpacing: 1, fontWeight: '600' }, heroSeed: { color: '#DAE9BD', fontSize: 11, fontWeight: '600' },
  heroName: { flex: 1, color: '#F4F7F4', fontSize: 17, lineHeight: 23, fontWeight: '600' },
  heroFooter: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingTop: 12, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#FFFFFF30' }, heroStatus: { color: '#DAE9BD', fontSize: 12, fontWeight: '600', flex: 1 },
  heading: { fontSize: 20, fontWeight: '700', color: b.premium }, small: { color: b.muted, fontSize: 11, lineHeight: 17 },
  stageRow: { flexDirection: 'row' }, rail: { width: 26, alignItems: 'center' }, railLine: { position: 'absolute', top: 19, bottom: -19, width: 1, backgroundColor: b.edge },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 17 },
round: { fontSize: 12, color: b.premium, fontWeight: '700' },
  opponent: { flexDirection: 'row', gap: 9, alignItems: 'center', minHeight: 48 }, opponentName: { fontSize: 12, lineHeight: 17, color: b.premium, fontWeight: '600' },
alternatives: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: b.edge, gap: 8, paddingTop: 8 },
  notice: { fontSize: 12, lineHeight: 18, color: b.muted, backgroundColor: b.panel, borderRadius: 10, padding: 12 },
});
