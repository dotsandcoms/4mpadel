import { trackEvent } from '@/lib/analytics';
import { fetchHeadToHead, fetchMatchDetails, fetchMatchPrediction, fetchMatchStats, fetchPlayerStats, fetchPointFeed, liveScoreFromPointFeed, type HeadToHead, type MatchDetails, type MatchPrediction, type MatchStats, type PlayerStats, type PointFeed, type PointSet } from '@/lib/pro-padel-live';
import { ProMatchStar } from '@/components/pro-match-star';
import { ProMatchJourney } from '@/components/pro-match-journey';
import { fetchProSnapshot, proDate, proRound, type ProPerson, type ProPlayer } from '@/lib/pro-padel';
import { playerCountryFlag, searchProPlayers } from '@/lib/player-hub';
import { tournamentRoundLabel } from '@/lib/pro-tournament';
import { siteUrl } from '@/lib/site';
import { startForegroundTask } from '@/lib/foreground-task';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { lightBrand as b } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
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

function PlayerPortrait({ player, photo, size = 36 }: { player: ProPerson; photo?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo]);
  const initials = player.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <View style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: b.panel }}>
    {photo && !failed ? <Image source={{ uri: photo }} accessibilityLabel={`${player.name} profile photo`} contentFit="cover" contentPosition="top" transition={180} onError={() => setFailed(true)} style={{ width: size, height: size }} />
      : <Text style={{ color: b.accent, fontSize: 12, fontWeight: '800' }}>{initials}</Text>}
  </View>;
}

function StartTime({ value, scheduleLabel }: { value?: string | null; scheduleLabel?: string | null }) {
  const now = useForegroundClock();
  const start = value && /(Z|[+-]\d{2}:\d{2})$/i.test(value) ? Date.parse(value) : NaN;
  const seconds = Number.isFinite(start) ? Math.max(0, Math.floor((start - now) / 1000)) : null;
  const parts = seconds == null ? [] : [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return <View style={{ backgroundColor: '#EAF0E5', borderRadius: 18, padding: 18, alignItems: 'center', gap: 10 }}>
    <Text style={{ color: b.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }}>{seconds === 0 ? 'AWAITING PLAY' : 'ESTIMATED START'}</Text>
    <Text style={{ color: b.premium, fontSize: 15, fontWeight: '700' }}>{Number.isFinite(start) ? proDate(value, true) : 'Start time to be confirmed'}</Text>
    {seconds != null && seconds > 0 && <View style={{ flexDirection: 'row', gap: 22 }}>{parts.map((part, index) => <View key={index} style={{ alignItems: 'center', gap: 3 }}><Text style={{ color: b.accent, fontSize: 31, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{String(part).padStart(2, '0')}</Text><Text style={{ color: b.muted, fontSize: 9, letterSpacing: 1 }}>{['HOURS', 'MIN', 'SEC'][index]}</Text></View>)}</View>}
    <Text style={{ color: b.muted, fontSize: 11, textAlign: 'center', lineHeight: 17 }}>{seconds === 0 ? 'The estimated start has passed. Play may be delayed.' : 'Time is estimated · actual start may vary'}</Text>
    {!!scheduleLabel && <Text style={{ color: b.muted, fontSize: 11, textAlign: 'center' }}>{scheduleLabel} · venue time</Text>}
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
  const params = useLocalSearchParams<{ id: string; from?: string; tournament?: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const goBack = () => {
    if (router.canGoBack()) { router.back(); return; }
    if (Number(params.tournament) > 0) { router.replace({ pathname: '/pro/tournament/[id]', params: { id: params.tournament! } }); return; }
    router.replace(params.from === 'live' ? '/pro/live' : params.from === 'calendar' ? '/calendar?circuit=pro' : params.from === 'rankings' ? '/rankings' : '/');
  };
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
    // Load once for every status; only live scores need recurring requests.
    let initial = true;
    const stop = startForegroundTask(() => {
      if (initial || detail?.match.status === 'live' || detail?.match.status === 'ongoing') {
        initial = false;
        return load();
      }
    }, 30000);
    return () => { sequence.current++; stop(); };
  }, [load, detail?.match.status]));
  useEffect(() => { setHeadToHead(null); setH2hLoaded(false); setPrediction(null); setPlayerStats({}); setPlayerStatsLoaded(false); setProfiles({}); setTab('summary'); setPointSet(0); setStatsPeriod('match'); }, [id]);
  const match = detail?.match;
  useEffect(() => { if (match?.id) void trackEvent('content_view', { content_type: 'pro_match', content_id: `pro_match:${match.id}` }); }, [match?.id]);
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
  const openTournament = () => {
    if (!match?.tournamentId) return;
    if (params.from === 'tournament' && router.canGoBack()) router.back();
    else router.push({ pathname: '/pro/tournament/[id]', params: { id: String(match.tournamentId) } });
  };
  const currentScore = liveScoreFromPointFeed(points);
  const sets = match?.score.length ? match.score : currentScore?.sets || detail?.liveScore?.sets || [];
  const live = match && ['live', 'ongoing'].includes(match.status);
  return <SafeAreaView style={{ flex: 1, backgroundColor: b.page }} edges={['top']}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: b.edge }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={goBack} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: b.elevated, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="arrow-back" size={22} color={b.premium} /></Pressable>
      <Text style={{ flex: 1, color: b.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>MATCH CENTRE</Text>
      {detail && <ProMatchStar row={detail} />}
      <Pressable accessibilityRole="button" accessibilityLabel="Share match" disabled={!match} onPress={() => void Share.share({ message: `${names.join(' vs ')}\n${match?.tournamentName} · ${match ? proRound(match) : ''}\n${siteUrl(`/pro/results?event=${match?.tournamentId}`)}` }).then(result => { if (result.action === Share.sharedAction) void trackEvent('share', { content_type: 'pro_match', method: 'native' }); }).catch(() => {})} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: b.elevated, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="share-outline" size={22} color={b.premium} /></Pressable>
    </View>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 18 }}>
    {detail?.freshness?.stale && <Text accessibilityLiveRegion="polite" style={{ color: b.muted, fontSize: 13 }}>Showing saved match data · Updated {new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }).format(new Date(detail.freshness.updatedAt))} SAST. Live refresh is paused.</Text>}
    {!!error && <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={{ color: b.danger }}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '800' }}>Retry</Text></Pressable></View>}
    {loading && !match && <ActivityIndicator color={b.accent} />}
    {match && <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${match.tournamentName} tournament`} onPress={openTournament} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 5 }}><Text style={{ color: b.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>TOURNAMENT</Text><Text style={{ color: b.premium, fontSize: 20, fontWeight: '800' }}>{playerCountryFlag(detail?.tournament?.country)}{detail?.tournament?.country ? ' ' : ''}{match.tournamentName}</Text></View><Ionicons name="chevron-forward" size={20} color={b.accent} />
      </Pressable>
      <View style={{ padding: 20, backgroundColor: '#16251F', borderRadius: 23, gap: 17 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><Text style={{ color: live ? '#FF6678' : b.padel, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{live ? '● LIVE NOW' : match.status === 'scheduled' ? 'UP NEXT' : terminal.has(match.status) ? match.status === 'finished' ? 'FINAL SCORE' : match.status.replaceAll('_', ' ').toUpperCase() : match.status.toUpperCase()}</Text><Text style={{ color: '#CAD8CE', fontSize: 11 }}>{match.category === 'men' ? 'Men' : 'Women'} · {detail ? tournamentRoundLabel(detail) : proRound(match)}</Text></View>
        <Text style={{ color: '#CAD8CE', fontSize: 12 }}>{match.court || 'Court to be announced'}{detail?.draw === 'qualy' ? ' · Qualifying draw' : ''}</Text>
        {!!sets.length && <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6 }}>{sets.map((_, index) => <Text key={index} style={{ width: 27, textAlign: 'center', color: '#CAD8CE', fontSize: 9, fontWeight: '800' }}>SET {index + 1}</Text>)}</View>}
        {match.teams.map((team, index) => <View key={index} style={{ gap: 15 }}>
          {index === 1 && <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={{ flex: 1, height: 1, backgroundColor: '#3A4D40' }} /><Text style={{ color: '#CAD8CE', fontSize: 10, fontWeight: '800', letterSpacing: 2 }}>VS</Text><View style={{ flex: 1, height: 1, backgroundColor: '#3A4D40' }} /></View>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, gap: 10 }}>{detail?.seeds[index] && <Text style={{ color: b.padel, fontSize: 10, fontWeight: '800' }}>SEED {detail.seeds[index]}</Text>}{team.length ? team.map(player => <Pressable key={player.id} accessibilityRole="button" accessibilityLabel={`View ${player.name} player details`} onPress={() => setTab('players')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 }}>
              <PlayerPortrait player={player} photo={photos[player.id]} size={54} />
              <View style={{ flex: 1, gap: 5 }}><Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700', lineHeight: 20 }}>{playerCountryFlag(player.nationality)}{player.nationality ? ' ' : ''}{player.name}</Text>{profiles[player.id]?.rank > 0 && <Text style={{ color: b.padel, fontSize: 10, fontWeight: '800' }}>WORLD #{profiles[player.id].rank}</Text>}</View>
            </Pressable>) : <Text style={{ color: '#CAD8CE' }}>Pair to be confirmed</Text>}</View>
            <View style={{ flexDirection: 'row', gap: 6 }}>{sets.map((set, setIndex) => <Text key={setIndex} adjustsFontSizeToFit numberOfLines={1} style={{ width: 27, color: match.winner === `team_${index + 1}` ? b.padel : '#FFFFFF', fontSize: 24, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] }}>{set[index] ?? '–'}</Text>)}</View>
          </View>
          {match.winner === `team_${index + 1}` && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="checkmark-circle" size={16} color={b.padel} /><Text style={{ color: b.padel, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>WINNERS</Text></View>}
        </View>)}
        {!!detail?.scoreText && !sets.length && <Text style={{ color: '#CAD8CE' }}>{detail.scoreText}</Text>}
        {!!detail?.duration && <Text style={{ color: '#CAD8CE', fontSize: 11 }}>Match duration · {detail.duration}</Text>}
        {live && currentScore?.points && <Text style={{ color: b.padel, fontSize: 13, fontWeight: '800' }}>Current game · {currentScore.points.replace(':', ' – ')}</Text>}
      </View>
      {match.status === 'scheduled' && <StartTime value={match.scheduledAt} scheduleLabel={match.scheduleLabel} />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{(['summary', 'points', 'players', 'h2h'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => { void trackEvent('feature_interaction', { feature: 'match_detail', action: 'tab', selection: value }); setTab(value); }} style={{ minWidth: value === 'points' ? 116 : 80, paddingHorizontal: 13, paddingVertical: 12, borderRadius: 12, backgroundColor: tab === value ? b.padel : b.elevated, alignItems: 'center' }}><Text style={{ color: b.premium, fontWeight: '800', fontSize: 13 }}>{value === 'summary' ? 'Overview' : value === 'points' ? 'Point by point' : value === 'h2h' ? 'H2H' : 'Players'}</Text></Pressable>)}</ScrollView>
      {tab === 'summary' && <View style={{ gap: 16 }}>
        <ProMatchJourney feed={points} names={names} />
        {prediction && <View style={{ backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, borderRadius: 18, padding: 16, gap: 10 }}>
          <Text style={{ color: b.premium, fontSize: 17, fontWeight: '800' }}>Pre-match outlook</Text>
          <Text style={{ color: b.muted, fontSize: 12 }}>PadelAPI Elo model · Probability before play, not a live forecast</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}><Text numberOfLines={1} style={{ flex: 1, color: b.accent, fontWeight: '800' }}>{names[0]} · {prediction.team1.toFixed(0)}%</Text><Text numberOfLines={1} style={{ flex: 1, color: b.premium, fontWeight: '800', textAlign: 'right' }}>{prediction.team2.toFixed(0)}% · {names[1]}</Text></View>
          <View style={{ height: 9, borderRadius: 9, overflow: 'hidden', flexDirection: 'row' }}><View style={{ flex: Math.max(0.01, prediction.team1), backgroundColor: b.padel }} /><View style={{ flex: Math.max(0.01, prediction.team2), backgroundColor: b.edge }} /></View>
        </View>}
        {!!match.score.length && <View style={{ flexDirection: 'row', gap: 8 }}>{match.score.map((set, index) => <View key={index} style={{ flex: 1, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 }}><Text style={{ color: b.muted, fontSize: 10, fontWeight: '800' }}>SET {index + 1}</Text><Text style={{ color: b.premium, fontSize: 19, fontWeight: '800' }}>{set[0]}–{set[1]}</Text></View>)}</View>}
        <View style={{ backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, borderRadius: 18, padding: 17, gap: 12 }}>
          <Text style={{ color: b.premium, fontSize: 17, fontWeight: '800' }}>Match information</Text>
          {[['Round', detail ? tournamentRoundLabel(detail) : proRound(match)], ['Draw', detail?.draw === 'qualy' ? 'Qualifying' : 'Main draw'], ['Court', match.court || 'To be announced'], ['Venue', detail?.tournament?.venue], ['Venue timezone', detail?.tournament?.timezone], ['Started', detail?.startedAt ? proDate(detail.startedAt, true) : null], ['Duration', detail?.duration]].filter(([, value]) => value).map(([label, value]) => <View key={label} style={{ flexDirection: 'row', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: b.edge }}><Text style={{ color: b.muted, fontSize: 12, flex: 1 }}>{label}</Text><Text style={{ color: b.premium, fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' }}>{value}</Text></View>)}
        </View>
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
