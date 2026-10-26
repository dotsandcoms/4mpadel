import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { EventDetail } from '@/lib/events';
import type { RankedPlayer } from '@/lib/event-teams';
import type { EventDrawStatus } from '@/lib/event-draws';
import { drawMatchWhen, type DrawChoice, type DrawMatch, type DrawPerson, type DrawSection, type DrawTeam } from '@/lib/tournament-draw';
import { fetchTournamentDraw, fetchTournamentDrawChoices } from '@/lib/tournament-draw-data';
import { localPlayerCountryFlag } from '@/lib/player-hub';
import { lightBrand as b } from '@/theme/tokens';
import { supabase } from '@/lib/supabase';

const BLUE = '#2449D8';
function Player({ player, winner = false }: { player: DrawPerson; winner?: boolean }) {
  const router = useRouter(), [failed, setFailed] = useState(false);
  const flag = localPlayerCountryFlag(player.country);
  return <Pressable disabled={!player.id} accessibilityRole={player.id ? 'button' : undefined} accessibilityLabel={player.id ? `View ${player.name}` : player.name}
    onPress={() => player.id && router.push({ pathname: '/players/[id]', params: { id: player.id } })} style={s.person}>
    {player.photo && !failed ? <Image source={{ uri: player.photo }} contentFit="cover" contentPosition="top" onError={() => setFailed(true)} style={s.portrait} />
      : <View style={[s.portrait, s.initialsBox]}><Text style={s.initials}>{player.name.split(/\s+/).slice(0, 2).map(word => word[0]).join('')}</Text></View>}
    <Text style={[s.playerName, winner && s.winningName]}>{flag ? `${flag} ` : ''}{player.name}</Text>
  </Pressable>;
}
function Team({ team, scores, winner, winnerLabel, completed, summary }: { team: DrawTeam; scores: number[]; winner: boolean; winnerLabel: string; completed: boolean; summary: boolean }) {
  return <View style={[s.team, winner && s.winner]}>
    {(completed || !!scores.length) && <View style={s.teamHeader}>
      <View style={s.teamLabel}>{winner && <Ionicons name="checkmark-circle" size={14} color={b.padel} />}<Text accessibilityRole={winner ? 'header' : undefined} style={[s.teamLabelText, winner && s.winnerLabel]}>{winner ? winnerLabel : completed ? 'OPPONENTS' : ''}</Text></View>
      {!summary && <View style={s.scores}>{scores.map((_, i) => <Text key={i} style={[s.setLabel, winner && s.winnerSetLabel]}>S{i + 1}</Text>)}</View>}
    </View>}
    <View style={s.teamRow}>
      <View style={s.people}>{team.players.length ? team.players.map((player, i) => <Player key={`${player.id || player.name}:${player.photo}:${i}`} player={player} winner={winner} />) : <Text style={s.pending}>{team.placeholder}</Text>}</View>
      {!!team.seed && <Text accessibilityLabel={`Seed ${team.seed}`} style={[s.seed, winner && s.winnerSetLabel]}>({team.seed})</Text>}
      <View style={s.scores}>{scores.map((score, i) => <Text key={i} style={[s.score, winner && s.winnerScore]}>{score}</Text>)}</View>
    </View>
  </View>;
}
export function TournamentDrawMatch({ match, roundLabel, highlighted = false }: { match: DrawMatch; roundLabel?: string; highlighted?: boolean }) {
  const when = drawMatchWhen(match.start);
  const winner = match.completed ? match.winner : null;
  const order = winner === 2 ? [2, 1] : [1, 2];
  const winnerLabel = match.status === 'Walkover' ? 'ADVANCED BY WALKOVER' : match.status === 'Bye' ? 'ADVANCED' : 'WINNERS';
  return <View style={[s.match, highlighted && s.highlighted]}>
    {!!roundLabel && <Text accessibilityRole="header" style={s.matchRound}>{roundLabel}</Text>}
    <View style={s.matchHeader}><Text style={[s.status, match.completed && s.final, match.status === 'Live' && { color: '#BB342A' }]}>{match.status.toUpperCase()}</Text>{match.summary && <Text style={s.summary}>MATCH TOTAL</Text>}</View>
    {order.map((side, index) => <View key={side}>
      {index > 0 && <View style={s.divider} />}
      <Team team={side === 1 ? match.one : match.two} scores={match.scores.map(score => score[side - 1])} winner={winner === side} winnerLabel={winnerLabel} completed={match.completed && winner !== null} summary={match.summary} />
    </View>)}
    <View style={s.matchFooter}><Ionicons name="time-outline" size={14} color={b.muted} /><Text style={s.when}>{when || 'Time to be confirmed'}</Text></View>
    {!!match.court && <View style={s.courtRow}><Ionicons name="location-outline" size={14} color={b.muted} /><Text style={s.court}>{match.court}</Text></View>}
  </View>;
}
export function TournamentDrawBoard({ sections, results = false, matchId }: { sections: DrawSection[]; results?: boolean; matchId?: string }) {
  const [sectionId, setSectionId] = useState(''), [roundId, setRoundId] = useState(''), [visible, setVisible] = useState(24);
  const [showPending, setShowPending] = useState(false);
  const available = useMemo(() => results ? sections.map(section => ({ ...section, rounds: section.rounds.map(round => ({ ...round, matches: round.matches.filter(m => m.completed) })).filter(round => round.matches.length) })).filter(section => section.rounds.length || section.standings.length) : sections, [sections, results]);
  const section = available.find(x => x.id === sectionId) || available.find(x => x.rounds.some(r => r.matches.some(m => m.id === matchId))) || available[0];
  const round = section?.rounds.find(x => x.id === roundId) || section?.rounds.find(r => r.matches.some(m => m.id === matchId)) || section?.rounds[0];
  useEffect(() => { setSectionId(''); setRoundId(''); }, [matchId]);
  useEffect(() => {
    setSectionId(previous => available.some(item => item.id === previous) ? previous : '');
    setRoundId(previous => section?.rounds.some(item => item.id === previous) ? previous : '');
  }, [sections, results]);
  useEffect(() => { setVisible(24); setShowPending(false); }, [section?.id, round?.id]);
  const pending = round?.matches.filter(m => !m.completed && !m.one.players.length && !m.two.players.length && !m.scores.length && m.status !== 'Live') || [];
  const displayed = round?.matches.filter(m => showPending || !pending.includes(m) || m.id === matchId) || [];
  if (!section) return <View style={s.empty}><Ionicons name="trophy-outline" size={32} color={b.faint} /><Text style={s.emptyTitle}>{results ? 'No results yet' : 'Draw being prepared'}</Text><Text style={s.emptyCopy}>{results ? 'Completed matches will appear here as results are published.' : 'This draw will appear here when the organiser publishes it.'}</Text></View>;
  return <View style={s.board}>
    {available.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{available.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === section.id }} onPress={() => { setSectionId(item.id); setRoundId(''); }} style={[s.chip, item.id === section.id && s.selectedChip]}><Text style={[s.chipText, item.id === section.id && s.selectedChipText]}>{item.name}</Text></Pressable>)}</ScrollView>}
    <View style={s.sectionHeader}><Text accessibilityRole="header" style={s.sectionTitle}>{section.name}</Text><Text style={s.matchCount}>{section.rounds.reduce((sum, r) => sum + r.matches.length, 0)} {section.rounds.reduce((sum, r) => sum + r.matches.length, 0) === 1 ? 'match' : 'matches'}</Text></View>
    {!!section.standings.length && <View style={s.standings}><View style={s.standingHeader}><Text style={[s.columnLabel, { flex: 1 }]}>STANDINGS</Text>{['P', 'W', 'L', 'PTS'].map(label => <Text key={label} style={s.tableNumber}>{label}</Text>)}</View>{section.standings.map(row => <View key={row.id} style={s.standingRow}><Text style={s.position}>{row.position}</Text><View style={s.people}>{row.team.players.map(p => <Text key={p.name} style={s.standingName}>{localPlayerCountryFlag(p.country)} {p.name}</Text>)}</View>{[row.played, row.won, row.lost, row.points].map((value, i) => <Text key={i} style={[s.tableNumber, i === 3 && s.winningScore]}>{value}</Text>)}</View>)}</View>}
    {!!round && <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{section.rounds.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === round.id }} onPress={() => setRoundId(item.id)} style={[s.roundChip, item.id === round.id && s.activeRound]}><Text style={[s.roundText, item.id === round.id && s.activeRoundText]}>{item.name}</Text></Pressable>)}</ScrollView>
      <View style={s.roundHeader}><Text accessibilityRole="header" style={s.roundTitle}>{round.name}</Text><View style={s.arrows}>{[-1, 1].map(direction => {
        const index = section.rounds.indexOf(round), next = index + direction, disabled = next < 0 || next >= section.rounds.length;
        return <Pressable key={direction} disabled={disabled} accessibilityRole="button" accessibilityLabel={direction < 0 ? 'Previous round' : 'Next round'} onPress={() => setRoundId(section.rounds[next].id)} style={[s.arrow, disabled && { opacity: .3 }]}><Ionicons name={direction < 0 ? 'chevron-back' : 'chevron-forward'} size={19} color={b.accent} /></Pressable>;
      })}</View></View>
      {!!pending.length && <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPending }} onPress={() => setShowPending(value => !value)} style={{ padding: 16, backgroundColor: b.panel, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name={showPending ? 'chevron-up' : 'chevron-down'} size={18} color={b.accent} /><Text style={{ flex: 1, color: b.accent, fontSize: 13, fontWeight: '700' }}>{pending.length} {pending.length === 1 ? 'match awaiting players' : 'matches awaiting players'}</Text></Pressable>}
      <View style={{ gap: 12 }}>{displayed.slice(0, Math.max(visible, displayed.findIndex(m => m.id === matchId) + 1)).map(item => <TournamentDrawMatch key={item.id} match={item} roundLabel={round.name} highlighted={item.id === matchId} />)}</View>
      {displayed.length > visible && <Pressable accessibilityRole="button" onPress={() => setVisible(n => n + 24)} style={s.retry}><Text style={s.retryText}>Show more matches</Text></Pressable>}
    </>}
  </View>;
}
export function TournamentDraw({ event, source, directory, results = false, divisionId, matchId, refreshKey }: { event: EventDetail; source: EventDrawStatus['source']; directory: RankedPlayer[]; results?: boolean; divisionId?: string; matchId?: string; refreshKey: number }) {
  const [choices, setChoices] = useState<DrawChoice[]>([]), [selected, setSelected] = useState(''), [sections, setSections] = useState<DrawSection[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0), [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [points, setPoints] = useState<{ division: string; points: number; round: string }[]>([]);
  useEffect(() => {
    let active = true;
    setPoints([]);
    if (source === 'native' && results) void supabase.rpc('get_tournament_notification_points', { p_event: event.id, p_division: divisionId ?? null }).then(({ data, error }) => { if (active && !error) setPoints(data || []); });
    return () => { active = false; };
  }, [event.id, source, results, divisionId, refreshKey]);
  useEffect(() => {
    setChoices([]); setSections([]); setSelected(''); setUpdatedAt(null);
  }, [event.id, source]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void fetchTournamentDrawChoices(event, source, matchId).then(list => { if (active) { setChoices(list); setSelected(previous => list.some(c => c.id === previous) ? previous : list.find(c => c.classId === divisionId)?.id || list[0]?.id || ''); if (!list.length) setLoading(false); } }).catch(() => { if (active) { setError('Draws could not load. Please try again.'); setLoading(false); } });
    return () => { active = false; };
  }, [event.id, source, divisionId, matchId, refreshKey, retry]);
  const choice = choices.find(c => c.id === selected);
  const load = useCallback(() => {
    if (!choice) return () => {};
    let active = true;
    setLoading(true); setError('');
    void fetchTournamentDraw(event, source, choice, directory).then(data => { if (active) { setSections(data.sections); setUpdatedAt(data.updatedAt); setStale(data.stale); } }).catch(() => { if (active) setError('This draw could not load. Please try again.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [event.id, source, choice, directory]);
  useEffect(load, [load]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => { if (state === 'active') setRetry(n => n + 1); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') setRetry(n => n + 1); }, 60000);
    return () => { listener.remove(); clearInterval(timer); };
  }, []);
  return <View style={{ gap: 16 }}>
    {points.map(award => <View key={award.division} style={s.points}><Text style={s.sectionTitle}>Your points · {award.division}</Text><Text style={s.retryText}>{award.points} points · {award.round.replaceAll('_', ' ')}</Text></View>)}
    <View style={s.heading}><Ionicons name={results ? 'trophy-outline' : 'git-branch-outline'} size={22} color={b.accent} /><Text accessibilityRole="header" style={s.headingText}>{results ? 'Tournament results' : 'Tournament draws'}</Text><Pressable disabled={loading} accessibilityRole="button" accessibilityLabel="Refresh tournament draws" onPress={() => setRetry(n => n + 1)} style={s.arrow}>{loading ? <ActivityIndicator color={b.accent} /> : <Ionicons name="refresh-outline" size={20} color={b.accent} />}</Pressable></View>
    {!!choices.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{choices.map(c => <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: c.id === selected }} onPress={() => { setSelected(c.id); setSections([]); }} style={[s.divisionChip, c.id === selected && s.activeDivision]}><Text style={[s.divisionText, c.id === selected && { color: '#FFF' }]}>{c.name}</Text></Pressable>)}</ScrollView>}
    {!!error && <View style={s.error}><Text accessibilityRole="alert" style={s.emptyCopy}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={s.retry}><Text style={s.retryText}>Retry</Text></Pressable></View>}
    {loading && !sections.length ? <ActivityIndicator accessibilityLabel="Loading tournament draw" color={b.accent} style={{ paddingVertical: 40 }} /> : !error && <TournamentDrawBoard key={choice?.id} sections={sections} results={results} matchId={matchId} />}
    {!loading && !!updatedAt && <Text style={s.updated}>{stale ? 'Showing last available draw · ' : 'Updated '}{new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(updatedAt))} SAST</Text>}
  </View>;
}
const s = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, headingText: { flex: 1, fontSize: 20, fontWeight: '800', color: b.premium, letterSpacing: -.4 },
  chips: { gap: 8, paddingVertical: 2 }, divisionChip: { minHeight: 46, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: b.edge, backgroundColor: '#FFF' },
  activeDivision: { backgroundColor: b.accent, borderColor: b.accent }, divisionText: { fontWeight: '700', color: b.muted, fontSize: 14 },
  board: { gap: 14 }, sectionHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8 }, sectionTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: b.premium }, matchCount: { fontSize: 12, color: b.muted },
  chip: { minHeight: 44, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 22, backgroundColor: b.surface }, selectedChip: { backgroundColor: '#E7EDFF' }, chipText: { color: b.muted, fontWeight: '600', fontSize: 12 }, selectedChipText: { color: BLUE },
  roundChip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, activeRound: { borderBottomColor: BLUE }, roundText: { color: b.muted, fontSize: 13, fontWeight: '600' }, activeRoundText: { color: BLUE },
  roundHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 }, roundTitle: { flex: 1, fontSize: 15, color: b.premium, fontWeight: '700' }, arrows: { flexDirection: 'row', gap: 6 }, arrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: b.surface, alignItems: 'center', justifyContent: 'center' },
  match: { borderRadius: 18, borderWidth: 1, borderColor: b.edge, backgroundColor: '#FFF', padding: 15, gap: 10 }, highlighted: { borderColor: BLUE, borderWidth: 2 },
  matchRound: { color: b.premium, fontSize: 14, fontWeight: '700' },
  matchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, status: { fontSize: 10, color: BLUE, fontWeight: '800', letterSpacing: 1 }, final: { color: b.accent }, summary: { color: b.faint, fontSize: 9, fontWeight: '600' },
  team: { padding: 10, gap: 10, borderRadius: 12 }, winner: { backgroundColor: b.premium },
  teamHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 }, teamLabel: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }, teamLabelText: { color: b.faint, fontSize: 9, fontWeight: '700', letterSpacing: .8 }, winnerLabel: { color: b.padel, fontSize: 10, fontWeight: '800' },
  teamRow: { flexDirection: 'row', gap: 6, alignItems: 'center' }, setLabel: { width: 22, textAlign: 'center', color: b.faint, fontSize: 9 }, winnerSetLabel: { color: '#B8C7BD' }, winningName: { color: '#FFFFFF', fontWeight: '800' }, winnerScore: { color: b.padel, fontSize: 23, fontWeight: '900' },
  people: { flex: 1, gap: 7 }, person: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8 }, portrait: { width: 34, height: 34, borderRadius: 10 }, initialsBox: { backgroundColor: b.surface, alignItems: 'center', justifyContent: 'center' }, initials: { color: b.muted, fontWeight: '700', fontSize: 11 }, playerName: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', color: b.premium },
  pending: { color: b.faint, fontSize: 13, paddingVertical: 13 }, seed: { color: b.faint, fontSize: 10 }, scores: { flexDirection: 'row', gap: 6 }, score: { width: 22, textAlign: 'center', fontSize: 18, fontWeight: '700', color: b.muted, fontVariant: ['tabular-nums'] }, winningScore: { color: b.accent, fontWeight: '800' }, divider: { height: 1, backgroundColor: b.edge, marginBottom: 10 },
  matchFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 }, when: { flex: 1, color: b.muted, fontSize: 11, lineHeight: 16 }, courtRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, court: { flex: 1, color: b.muted, fontSize: 11 },
  standings: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: b.edge, padding: 12 }, standingHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12 }, columnLabel: { color: b.muted, fontSize: 10, letterSpacing: 1, fontWeight: '700' }, tableNumber: { color: b.muted, fontSize: 11, width: 24, textAlign: 'center' }, standingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: b.edge }, standingName: { color: b.premium, fontSize: 12 }, position: { color: b.accent, width: 20, fontSize: 13, fontWeight: '700' },
  points: { padding: 16, gap: 8, borderRadius: 16, backgroundColor: b.elevated },
  empty: { padding: 24, paddingVertical: 40, alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: b.edge }, emptyTitle: { fontSize: 17, fontWeight: '700', color: b.premium }, emptyCopy: { fontSize: 14, lineHeight: 21, color: b.muted, textAlign: 'center' }, error: { padding: 20, gap: 10 }, retry: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, retryText: { color: b.accent, fontSize: 14, fontWeight: '700' }, updated: { color: b.faint, fontSize: 11, textAlign: 'right' },
});
