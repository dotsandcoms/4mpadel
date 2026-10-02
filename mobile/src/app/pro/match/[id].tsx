import { fetchHeadToHead, fetchMatchDetails, fetchMatchPrediction, fetchMatchStats, fetchPlayerStats, fetchPointFeed, type HeadToHead, type MatchDetails, type MatchPrediction, type MatchStats, type PlayerStats, type PointFeed, type PointSet } from '@/lib/pro-padel-live';
import { fetchProSnapshot, proDate, proRound, type ProPerson, type ProPlayer } from '@/lib/pro-padel';
import { searchProPlayers } from '@/lib/player-hub';
import { lightBrand as b } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const terminal = new Set(['finished', 'retired', 'walkover', 'bye', 'not_played']);
const photoCache = new Map<number, string>();
const stringify = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : null;
const securePhoto = (value: string | null | undefined) => typeof value === 'string' && value.startsWith('https://') ? value : null;
const statLabels: Record<string, string> = { total_points_won: 'Total points won', break_points_converted: 'Break points converted', longest_streak: 'Longest point streak', aces: 'Aces', double_faults: 'Double faults', won_on_1st_serve: 'First-serve points won', won_on_2nd_serve: 'Second-serve points won', service_games: 'Service games', won_on_1st_return: 'First-return points won', won_on_2nd_return: 'Second-return points won', return_games: 'Return games', total_won_on_serve: 'Total serve points won', total_won_on_return: 'Total return points won' };
const statGroups = [
  { title: 'KEY POINTS', keys: ['total_points_won', 'break_points_converted', 'longest_streak'] },
  { title: 'SERVE', keys: ['won_on_1st_serve', 'won_on_2nd_serve', 'total_won_on_serve', 'service_games', 'aces', 'double_faults'] },
  { title: 'RETURN', keys: ['won_on_1st_return', 'won_on_2nd_return', 'total_won_on_return', 'return_games'] },
];
const scorePair = (value: string | null) => { const found = /^(\d+)\s*[-:]\s*(\d+)/.exec(value || ''); return found ? [Number(found[1]), Number(found[2])] as const : null; };
function gameWinner(set: PointSet, index: number): 0 | 1 | null {
  const game = set.games[index];
  if (!game?.points.length) return null;
  const before = scorePair(game.game_score);
  const after = scorePair(set.games[index + 1]?.game_score || set.set_score);
  if (!before || !after) return null;
  if (after[0] > before[0] && after[1] === before[1]) return 0;
  if (after[1] > before[1] && after[0] === before[0]) return 1;
  return null;
}
const teamKey = (team: ProPerson[]) => team.map(player => player.id).sort((a, b) => a - b).join(':');

function PlayerPortrait({ player, photo }: { player: ProPerson; photo?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo]);
  const initials = player.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <View style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: b.panel }}>
    {photo && !failed ? <Image source={{ uri: photo }} accessibilityLabel={`${player.name} profile photo`} contentFit="cover" contentPosition="top" transition={180} onError={() => setFailed(true)} style={{ width: 36, height: 36 }} />
      : <Text style={{ color: b.accent, fontSize: 12, fontWeight: '800' }}>{initials}</Text>}
  </View>;
}

function StatRows({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return <Text style={{ color: b.muted }}>No statistics have been published for this period.</Text>;
  const data = value as Record<string, unknown>;
  const display = (key: string) => {
    const item = data[key];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const left = stringify(row.team_1), right = stringify(row.team_2);
    if (left == null || right == null) return null;
    const first = Number.parseFloat(left), second = Number.parseFloat(right);
    const ratio = Number.isFinite(first) && Number.isFinite(second) && first + second > 0 ? first / (first + second) : 0.5;
    return <View key={key} style={{ gap: 7, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: b.edge }}>
      <Text style={{ color: b.muted, textAlign: 'center', fontSize: 12 }}>{statLabels[key] || key.replaceAll('_', ' ')}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: b.accent, fontWeight: '800', fontSize: 17 }}>{left}</Text><Text style={{ color: b.premium, fontWeight: '800', fontSize: 17 }}>{right}</Text></View>
      <View style={{ height: 5, flexDirection: 'row', borderRadius: 5, overflow: 'hidden' }}><View style={{ flex: Math.max(0.03, ratio), backgroundColor: b.padel }} /><View style={{ flex: Math.max(0.03, 1 - ratio), backgroundColor: b.edge }} /></View>
    </View>;
  };
  const visible = statGroups.filter(group => group.keys.some(key => display(key) !== null));
  if (!visible.length) return <Text style={{ color: b.muted }}>No statistics have been published for this period.</Text>;
  return <View style={{ gap: 18 }}>{visible.map(group => <View key={group.title} style={{ gap: 4 }}><Text style={{ color: b.accent, fontSize: 11, letterSpacing: 1.1, fontWeight: '800' }}>{group.title}</Text>{group.keys.map(display)}</View>)}</View>;
}

export default function ProMatchScreen() {
  const params = useLocalSearchParams<{ id: string; from?: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const goBack = () => router.dismissTo(params.from === 'live' ? '/pro/live' : params.from === 'calendar' ? '/calendar?circuit=pro' : params.from === 'rankings' ? '/rankings' : '/');
  const [detail, setDetail] = useState<MatchDetails | null>(null);
  const [stats, setStats] = useState<MatchStats | null>(null);
  const [points, setPoints] = useState<PointFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'summary' | 'points' | 'players' | 'h2h'>('summary');
  const [statsPeriod, setStatsPeriod] = useState<'match' | 'set_1' | 'set_2' | 'set_3'>('match');
  const [pointSet, setPointSet] = useState(0);
  const [photos, setPhotos] = useState<Record<number, string>>({});
  const [profiles, setProfiles] = useState<Record<number, ProPlayer>>({});
  const [playerStats, setPlayerStats] = useState<Record<number, PlayerStats>>({});
  const [playerStatsLoading, setPlayerStatsLoading] = useState(false);
  const [playerStatsLoaded, setPlayerStatsLoaded] = useState(false);
  const [headToHead, setHeadToHead] = useState<HeadToHead | null>(null);
  const [h2hLoading, setH2hLoading] = useState(false);
  const [h2hLoaded, setH2hLoaded] = useState(false);
  const [prediction, setPrediction] = useState<MatchPrediction | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!Number.isSafeInteger(id) || id <= 0) { setError('Invalid match.'); setLoading(false); return; }
    const current = ++sequence.current;
    setLoading(true);
    try {
      const match = await fetchMatchDetails(id);
      if (current !== sequence.current) return;
      if (!match) { setError('This match is unavailable.'); return; }
      setDetail(match); setError('');
      void fetchMatchPrediction(match).then(value => { if (current === sequence.current) setPrediction(value); }).catch(() => {});
      const [pointResult, statResult] = await Promise.allSettled([fetchPointFeed(id), fetchMatchStats(id)]);
      if (current !== sequence.current) return;
      setPoints(pointResult.status === 'fulfilled' ? pointResult.value : null);
      setStats(statResult.status === 'fulfilled' ? statResult.value : null);
    } catch (e) { if (current === sequence.current) setError(e instanceof Error ? e.message : 'Match details could not be loaded.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { if (detail?.match.status === 'live') void load(); }, 30000);
    return () => { sequence.current++; clearInterval(timer); };
  }, [load, detail?.match.status]));
  useEffect(() => { setHeadToHead(null); setH2hLoaded(false); setPrediction(null); setPlayerStats({}); setPlayerStatsLoaded(false); setProfiles({}); setTab('summary'); setPointSet(0); setStatsPeriod('match'); }, [id]);
  const match = detail?.match;
  const rosterKey = match?.teams.flat().map(player => player.id).join(',') ?? '';
  useEffect(() => {
    if (!match || match.id !== id) return;
    let active = true;
    const players = match.teams.flat();
    const cached = Object.fromEntries(players.map(player => [player.id, photoCache.get(player.id)]).filter((entry): entry is [number, string] => typeof entry[1] === 'string'));
    setPhotos(cached);
    void (async () => {
      try {
        const rankings = await fetchProSnapshot('rankings');
        for (const player of players) {
          const ranked = rankings.categories[match.category].players.find(row => row.id === player.id);
          const photo = securePhoto(ranked?.photoUrl);
          if (photo) { photoCache.set(player.id, photo); cached[player.id] = photo; }
          if (ranked && active) setProfiles(previous => ({ ...previous, [player.id]: ranked }));
        }
        if (active) setPhotos({ ...cached });
      } catch { /* Keep cached portraits and look up missing players below. */ }
      for (const player of players) {
        if (!active) break;
        if (photoCache.has(player.id)) continue;
        // The existing player-search function spaces requests per signed-in user.
        await new Promise(resolve => setTimeout(resolve, 800));
        if (!active) break;
        try {
          const result = await searchProPlayers('', 'all', 1, player.id);
          const profile = result.players[0];
          const photo = securePhoto(profile?.photoUrl);
          if (profile && active) setProfiles(previous => ({ ...previous, [player.id]: profile }));
          if (photo) {
            photoCache.set(player.id, photo);
            if (active) setPhotos(previous => ({ ...previous, [player.id]: photo }));
          }
        } catch { /* A missing portrait must not hide the match. */ }
      }
    })();
    return () => { active = false; };
  }, [id, match?.id, rosterKey]);
  useEffect(() => {
    if (tab !== 'h2h' || !match || h2hLoaded || h2hLoading) return;
    let active = true;
    setH2hLoading(true);
    void fetchHeadToHead(match.id).then(value => { if (active) setHeadToHead(value); })
      .catch(() => { if (active) setHeadToHead(null); })
      .finally(() => { if (active) { setH2hLoading(false); setH2hLoaded(true); } });
    return () => { active = false; setH2hLoading(false); };
  }, [tab, match?.id, h2hLoaded]);
  useEffect(() => {
    if (tab !== 'players' || !match || playerStatsLoading || playerStatsLoaded) return;
    let active = true;
    setPlayerStatsLoading(true);
    void (async () => {
      for (const player of match.teams.flat()) {
        if (!active) break;
        if (playerStats[player.id]) continue;
        try { const value = await fetchPlayerStats(player.id); if (active && value) setPlayerStats(previous => ({ ...previous, [player.id]: value })); }
        catch { /* A missing career record must not hide the match. */ }
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    })().finally(() => { if (active) { setPlayerStatsLoading(false); setPlayerStatsLoaded(true); } });
    return () => { active = false; setPlayerStatsLoading(false); };
  }, [tab, match?.id, playerStatsLoaded]);
  const names = match?.teams.map(team => team.map(player => player.name).join(' / ') || 'Pair TBC') || [];
  const h2hWins = [0, 0];
  if (match && headToHead) for (const previous of headToHead.matches) {
    const winningTeam = previous.match.winner === 'team_1' ? previous.match.teams[0] : previous.match.winner === 'team_2' ? previous.match.teams[1] : null;
    if (winningTeam && teamKey(winningTeam) === teamKey(match.teams[0])) h2hWins[0]++;
    if (winningTeam && teamKey(winningTeam) === teamKey(match.teams[1])) h2hWins[1]++;
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: b.page }} edges={['top']}><ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 18 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={goBack} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: b.elevated, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="arrow-back" size={22} color={b.premium} /></Pressable><Text style={{ color: b.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>MATCH CENTRE</Text></View>
    {!!error && <Text accessibilityRole="alert" style={{ color: b.danger }}>{error}</Text>}
    {loading && <ActivityIndicator color={b.accent} />}
    {match && <>
      <Text style={{ color: b.muted, fontWeight: '700', letterSpacing: 1 }}>{match.category.toUpperCase()} · {proRound(match).toUpperCase()} · {(detail?.draw || 'main').toUpperCase()} DRAW</Text>
      <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 27, fontWeight: '800' }}>{match.tournamentName}</Text>
      <Text style={{ color: b.muted }}>{match.status === 'live' ? '● LIVE' : match.status === 'scheduled' ? proDate(match.scheduledAt, true) : terminal.has(match.status) ? 'FINAL' : match.status.toUpperCase()}{match.court ? ` · ${match.court}` : ''}{detail?.duration ? ` · ${detail.duration}` : ''}</Text>
      {detail?.watchability != null && <View style={{ alignSelf: 'flex-start', backgroundColor: b.panel, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }}><Text style={{ color: b.accent, fontWeight: '800', fontSize: 12 }}>WATCHABILITY {detail.watchability}/100</Text></View>}
      <View style={{ padding: 18, backgroundColor: b.elevated, borderRadius: 20, borderWidth: 1, borderColor: b.edge, gap: 15 }}>
        {!!match.score.length && <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}><View style={{ flex: 1 }} />{match.score.map((_, index) => <Text key={index} style={{ width: 34, textAlign: 'center', color: b.muted, fontSize: 11, fontWeight: '800' }}>S{index + 1}</Text>)}</View>}
        {match.teams.map((team, index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: match.winner === `team_${index + 1}` ? b.padel : 'transparent', paddingTop: index ? 15 : 0, borderTopWidth: index ? 1 : 0, borderTopColor: b.edge }}>
          <View style={{ flex: 1, gap: 7 }}>{detail?.seeds[index] && <Text style={{ color: b.accent, fontSize: 10, fontWeight: '800' }}>SEED {detail.seeds[index]}</Text>}{team.length ? team.map(player => <View key={player.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 36 }}>
            <PlayerPortrait player={player} photo={photos[player.id]} />
            <Text style={{ flex: 1, color: b.premium, fontSize: 15, fontWeight: '700', lineHeight: 19 }}>{player.name}</Text>
          </View>) : <Text style={{ color: b.muted }}>Pair TBC</Text>}</View>
          <View style={{ flexDirection: 'row', gap: 8 }}>{match.score.length ? match.score.map((set, setIndex) => <Text key={setIndex} adjustsFontSizeToFit numberOfLines={1} style={{ width: 34, color: match.winner === `team_${index + 1}` ? b.accent : b.premium, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>{set[index] ?? '–'}</Text>) : <Text style={{ color: b.muted }}>–</Text>}</View>
        </View>)}
        {!!detail?.scoreText && !match.score.length && <Text style={{ color: b.muted }}>{detail.scoreText}</Text>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{(['summary', 'points', 'players', 'h2h'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={{ minWidth: value === 'points' ? 116 : 80, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 12, backgroundColor: tab === value ? b.padel : b.elevated, alignItems: 'center' }}><Text style={{ color: b.premium, fontWeight: '800', fontSize: 13 }}>{value === 'summary' ? 'Overview' : value === 'points' ? 'Point by point' : value === 'h2h' ? 'H2H' : 'Players'}</Text></Pressable>)}</ScrollView>
      {tab === 'summary' && <View style={{ gap: 16 }}>
        {prediction && <View style={{ backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, borderRadius: 18, padding: 16, gap: 10 }}>
          <Text style={{ color: b.premium, fontSize: 17, fontWeight: '800' }}>Pre-match outlook</Text>
          <Text style={{ color: b.muted, fontSize: 12 }}>PadelAPI Elo model · Probability before play, not a live forecast</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text numberOfLines={1} style={{ flex: 1, color: b.accent, fontWeight: '800' }}>{names[0]} · {prediction.team1.toFixed(0)}%</Text><Text numberOfLines={1} style={{ flex: 1, color: b.premium, fontWeight: '800', textAlign: 'right' }}>{prediction.team2.toFixed(0)}% · {names[1]}</Text></View>
          <View style={{ height: 9, borderRadius: 9, overflow: 'hidden', flexDirection: 'row' }}><View style={{ flex: Math.max(0.01, prediction.team1), backgroundColor: b.padel }} /><View style={{ flex: Math.max(0.01, prediction.team2), backgroundColor: b.edge }} /></View>
        </View>}
        {!!points?.sets.some(set => set.games.some(game => game.points.length)) && <View style={{ backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, borderRadius: 18, padding: 16, gap: 12 }}>
          <Text style={{ color: b.premium, fontSize: 17, fontWeight: '800' }}>Match flow</Text>
          <Text style={{ color: b.muted, fontSize: 12 }}>Each tile is a recorded game. A dot marks a break of serve.</Text>
          {points.sets.map((set, setIndex) => <View key={setIndex} style={{ gap: 7 }}><Text style={{ color: b.muted, fontSize: 12, fontWeight: '700' }}>SET {set.set_number || setIndex + 1} · {set.set_score || 'In progress'}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{set.games.map((game, gameIndex) => {
            const winner = gameWinner(set, gameIndex);
            if (winner === null) return null;
            const broken = game.serving === (winner === 0 ? 'team_2' : 'team_1');
            return <View key={gameIndex} accessible accessibilityLabel={`Game ${game.game_number || gameIndex + 1}, ${names[winner]} won${broken ? ', break of serve' : ''}`} style={{ minWidth: 27, height: 29, borderRadius: 7, backgroundColor: winner === 0 ? b.padel : b.panel, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: b.premium, fontSize: 11, fontWeight: '800' }}>{broken ? '•' : winner + 1}</Text></View>;
          })}</View></View>)}
        </View>}
        {!!match.score.length && <View style={{ flexDirection: 'row', gap: 8 }}>{match.score.map((set, index) => <View key={index} style={{ flex: 1, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 }}><Text style={{ color: b.muted, fontSize: 10, fontWeight: '800' }}>SET {index + 1}</Text><Text style={{ color: b.premium, fontSize: 19, fontWeight: '800' }}>{set[0]}–{set[1]}</Text></View>)}</View>}
        <View style={{ backgroundColor: b.elevated, borderRadius: 18, padding: 17, gap: 12 }}><Text style={{ color: b.premium, fontSize: 17, fontWeight: '800' }}>Match statistics</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{(['match', 'set_1', 'set_2', 'set_3'] as const).filter(period => period === 'match' || stats?.[period]).map(period => <Pressable key={period} accessibilityRole="button" accessibilityState={{ selected: statsPeriod === period }} onPress={() => setStatsPeriod(period)} style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9, backgroundColor: statsPeriod === period ? b.padel : b.panel }}><Text style={{ color: b.premium, fontWeight: '700', fontSize: 12 }}>{period === 'match' ? 'Match' : `Set ${period.slice(-1)}`}</Text></Pressable>)}</ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text numberOfLines={1} style={{ flex: 1, color: b.accent, fontWeight: '700' }}>{names[0]}</Text><Text numberOfLines={1} style={{ flex: 1, color: b.premium, fontWeight: '700', textAlign: 'right' }}>{names[1]}</Text></View>
          <StatRows value={stats?.[statsPeriod]} />
        </View>
      </View>}
      {tab === 'points' && <View style={{ gap: 14 }}>
        <Text style={{ color: b.muted, fontSize: 12 }}>{points?.coverage === 'full' ? 'Full recorded point history' : points?.coverage === 'partial' ? 'Partial coverage · some games may be missing' : points?.coverage === 'tracking' ? 'Live tracking · subject to correction' : 'Point coverage not available'}</Text>
        {!!points?.sets.length && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{[0, ...points.sets.map(set => set.set_number)].map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: pointSet === value }} onPress={() => setPointSet(value)} style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 10, backgroundColor: pointSet === value ? b.padel : b.elevated }}><Text style={{ color: b.premium, fontWeight: '700' }}>{value ? `Set ${value}` : 'All sets'}</Text></Pressable>)}</ScrollView>}
        {points?.sets.filter(set => !pointSet || set.set_number === pointSet).map((set, i) => <View key={set.set_number || i} style={{ backgroundColor: b.elevated, borderRadius: 18, padding: 17, gap: 12 }}><Text style={{ color: b.premium, fontSize: 17, fontWeight: '800' }}>Set {set.set_number || i + 1}{set.set_score ? ` · ${set.set_score}` : ''}</Text>
          {set.games.map((game, j) => { const winner = gameWinner(set, j); const broken = winner !== null && game.serving === (winner === 0 ? 'team_2' : 'team_1'); return <View key={j} style={{ borderTopWidth: 1, borderTopColor: b.edge, paddingTop: 12, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: b.premium, fontWeight: '800' }}>Game {game.game_number || j + 1} · {game.game_score || 'Score pending'}</Text>{winner !== null && <Text style={{ color: b.accent, fontWeight: '700', fontSize: 11 }}>{broken ? 'BREAK · ' : ''}{names[winner]} won</Text>}</View>
            <Text style={{ color: b.muted, fontSize: 12 }}>Serving: {game.serving === 'team_1' ? names[0] : game.serving === 'team_2' ? names[1] : 'TBC'}</Text>
            {game.points.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{game.points.map((point, pointIndex) => <View key={pointIndex} style={{ backgroundColor: b.panel, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6 }}><Text style={{ color: b.premium, fontSize: 12, fontWeight: '700' }}>{point.replace(':', ' – ')}</Text></View>)}</View> : <Text style={{ color: b.muted, fontSize: 12 }}>Points not recorded</Text>}
          </View>; })}
        </View>)}
        {!points?.sets.length && <Text style={{ color: b.muted }}>Point-by-point data has not been published for this match.</Text>}
        <Text style={{ color: b.muted, fontSize: 11 }}>Recorded point scores are shown in order. A game-winning point may appear only in the following game score.</Text>
      </View>}
      {tab === 'players' && <View style={{ gap: 14 }}>{playerStatsLoading && <ActivityIndicator color={b.accent} />}{match.teams.map((team, teamIndex) => <View key={teamIndex} style={{ gap: 10 }}><Text style={{ color: b.muted, fontWeight: '800', fontSize: 11 }}>TEAM {teamIndex + 1}</Text>{team.map(player => { const profile = profiles[player.id]; const career = playerStats[player.id]; return <Pressable key={player.id} accessibilityRole="button" accessibilityLabel={`Find ${player.name} in Players`} onPress={() => router.push({ pathname: '/rankings', params: { view: 'Discover', source: 'pro', gender: match.category, query: player.name } })} style={{ backgroundColor: b.elevated, borderRadius: 16, borderWidth: 1, borderColor: b.edge, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <PlayerPortrait player={player} photo={photos[player.id]} /><View style={{ flex: 1, gap: 4 }}><Text style={{ color: b.premium, fontSize: 15, fontWeight: '800' }}>{player.name}</Text><Text style={{ color: b.muted, fontSize: 12 }}>{[profile?.rank ? `World #${profile.rank}` : null, profile?.nationality, profile?.side].filter(Boolean).join(' · ') || 'FIP player'}</Text><Text style={{ color: b.accent, fontSize: 12 }}>{career ? `${career.winPercentage ?? '—'}% wins · ${career.matchesPlayed ?? '—'} matches · ${career.titles ?? '—'} titles` : 'Career stats unavailable'}</Text>{career?.coverage === 'partial' && career.since && <Text style={{ color: b.muted, fontSize: 10 }}>Recorded since {proDate(career.since)}</Text>}</View><Ionicons name="chevron-forward" size={16} color={b.muted} />
        </Pressable>; })}</View>)}<Text style={{ color: b.muted, fontSize: 11 }}>Career totals reflect PadelAPI’s available match coverage.</Text></View>}
      {tab === 'h2h' && <View style={{ gap: 14 }}>
        {h2hLoading && <ActivityIndicator color={b.accent} />}
        {headToHead && <><View style={{ backgroundColor: b.elevated, borderRadius: 18, borderWidth: 1, borderColor: b.edge, padding: 18, gap: 8 }}><Text style={{ color: b.premium, fontSize: 17, fontWeight: '800' }}>Previous meetings</Text><Text style={{ color: b.muted }}>{headToHead.total} recorded matches before this one</Text>{headToHead.complete && <Text style={{ color: b.accent, fontSize: 20, fontWeight: '800' }}>{h2hWins[0]} – {h2hWins[1]}</Text>}{headToHead.complete && <Text style={{ color: b.muted, fontSize: 11 }}>{names[0]} · {names[1]}</Text>}</View>
          {headToHead.matches.slice(0, 8).map(previous => <View key={previous.match.id} style={{ backgroundColor: b.elevated, borderRadius: 14, padding: 14, gap: 5 }}><Text style={{ color: b.muted, fontSize: 12 }}>{proDate(previous.match.playedAt)} · {proRound(previous.match)}</Text><Text style={{ color: b.premium, fontWeight: '700' }}>{previous.match.score.map(set => `${set[0] ?? '–'}–${set[1] ?? '–'}`).join('  ·  ') || 'Result unavailable'}</Text><Text style={{ color: b.muted, fontSize: 12 }}>{previous.match.winner ? `${previous.match.teams[previous.match.winner === 'team_1' ? 0 : 1].map(player => player.name).join(' / ')} won` : 'Winner not recorded'}</Text></View>)}
        </>}
        {h2hLoaded && !headToHead && <Text style={{ color: b.muted }}>Head-to-head history is unavailable for this match.</Text>}
        {headToHead && !headToHead.matches.length && <Text style={{ color: b.muted }}>These pairs have no recorded previous meetings.</Text>}
      </View>}
      {!!detail?.updatedAt && <Text style={{ color: b.muted, fontSize: 11 }}>Provider update: {proDate(detail.updatedAt, true)}</Text>}
    </>}
  </ScrollView></SafeAreaView>;
}
