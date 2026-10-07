import { MatchCard } from '@/components/pro-padel-feed';
import { playerCountryFlag, searchProPlayers } from '@/lib/player-hub';
import { fetchLiveMatches, fetchMatchDetails, fetchTournamentDetails, fetchTournamentMatches, withLiveScores, type MatchDetails } from '@/lib/pro-padel-live';
import { fetchProSnapshot, proDate, proRound, type ProPlayer, type ProTournament } from '@/lib/pro-padel';
import { lightBrand as b } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const profileCache = new Map<number, ProPlayer | null>();
type MatchFilter = 'all' | 'live' | 'upcoming' | 'results';
const isLive = (status: string) => status === 'live' || status === 'ongoing';
const isUpcoming = (status: string) => status === 'scheduled';
const matchDate = (row: MatchDetails) => (row.match.scheduledAt || row.match.playedAt || '').slice(0, 10);
const matchBucket = (row: MatchDetails): MatchFilter => isLive(row.match.status) ? 'live' : isUpcoming(row.match.status) ? 'upcoming' : 'results';
const labelDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) ? proDate(date) : date;
const shortTime = (value: string | null) => value && /(Z|[+-]\d{2}:\d{2})$/i.test(value) ? proDate(value, true) : null;

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: selected ? b.accent : b.edge, backgroundColor: selected ? '#EAF5DB' : b.elevated }}>
    <Text style={{ color: selected ? b.accent : b.muted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
  </Pressable>;
}

function TourMatchCard({ row, onOpen }: { row: MatchDetails; onOpen: () => void }) {
  const match = row.match;
  const live = isLive(match.status);
  const status = live ? '● LIVE' : isUpcoming(match.status) ? 'UPCOMING' : match.status.replaceAll('_', ' ').toUpperCase();
  const date = matchDate(row);
  const time = shortTime(match.scheduledAt || match.playedAt);
  const sets = (match.score.length ? match.score : row.liveScore?.sets || []).slice(0, 5);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${status} ${match.teams.map(team => team.map(player => player.name).join(' and ')).join(' versus ')}, ${proRound(match)}`}
    onPress={onOpen} style={{ backgroundColor: b.elevated, borderColor: live ? b.accent : b.edge, borderWidth: live ? 1.5 : 1, borderRadius: 17, padding: 15, gap: 11 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ color: live ? '#E92F48' : b.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>{status}</Text>
      <Text numberOfLines={1} style={{ color: b.muted, fontSize: 11, flex: 1, textAlign: 'right' }}>{[match.court, date ? labelDate(date) : null, time].filter(Boolean).join(' · ')}</Text>
      <Ionicons name="chevron-forward" size={15} color={b.muted} />
    </View>
    <Text style={{ color: b.muted, fontSize: 11 }}>{[row.draw && row.draw !== 'main' ? row.draw.replaceAll('_', ' ') : null, proRound(match), match.scheduleLabel].filter(Boolean).join(' · ')}</Text>
    {match.teams.map((team, index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 }}>
      <Text numberOfLines={2} style={{ color: match.winner === `team_${index + 1}` ? b.accent : b.premium, fontSize: 13, fontWeight: match.winner === `team_${index + 1}` ? '800' : '600', flex: 1 }}>
        {row.seeds[index] ? `[${row.seeds[index]}] ` : ''}{team.length ? team.map(player => `${playerCountryFlag(player.nationality)}${player.nationality ? ' ' : ''}${player.name}`).join(' / ') : 'To be confirmed'}
      </Text>
      {sets.map((set, setIndex) => <Text key={setIndex} style={{ color: b.premium, fontSize: 13, fontWeight: '800', minWidth: 15, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{set[index] ?? '–'}</Text>)}
    </View>)}
    {(row.duration || row.scoreText && !sets.length || row.liveScore?.points) && <Text style={{ color: b.muted, fontSize: 11 }}>{[row.scoreText && !sets.length ? row.scoreText : null, row.duration && `Duration ${row.duration}`, row.liveScore?.points && `Current point ${row.liveScore.points}`, row.liveScore?.serving && `${row.liveScore.serving === 'team_1' ? 'Top team' : 'Bottom team'} serving`].filter(Boolean).join(' · ')}</Text>}
  </Pressable>;
}

export default function LiveProTourScreen() {
  const router = useRouter();
  const { tournament } = useLocalSearchParams<{ tournament?: string }>();
  const tournamentId = Number(tournament);
  const eventMode = Number.isSafeInteger(tournamentId) && tournamentId > 0;
  const [rows, setRows] = useState<MatchDetails[]>([]);
  const [event, setEvent] = useState<ProTournament | null>(null);
  const [count, setCount] = useState(0);
  const [complete, setComplete] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lookup, setLookup] = useState<Map<number, ProPlayer>>(new Map());
  const [category, setCategory] = useState<'all' | 'men' | 'women'>('all');
  const [status, setStatus] = useState<MatchFilter>('all');
  const [day, setDay] = useState('all');
  const [round, setRound] = useState('all');
  const request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    try {
      let matches: MatchDetails[];
      let total: number;
      let fullyLoaded = true;
      if (eventMode) {
        const [first, details] = await Promise.all([fetchTournamentMatches(tournamentId, 1), fetchTournamentDetails(tournamentId)]);
        const all = [...first.matches];
        setEvent(details);
        const lastPage = Math.min(first.lastPage, 20);
        for (let start = 2; start <= lastPage; start += 3) {
          const pages = await Promise.allSettled(Array.from({ length: Math.min(3, lastPage - start + 1) }, (_, index) => fetchTournamentMatches(tournamentId, start + index)));
          for (const result of pages) {
            if (result.status === 'fulfilled') all.push(...result.value.matches);
            else fullyLoaded = false;
          }
          if (current !== request.current) return;
        }
        if (first.lastPage > 20) fullyLoaded = false;
        matches = await withLiveScores([...new Map(all.map(row => [row.match.id, row])).values()].sort((a, b) => {
          const priority = (row: MatchDetails) => ({ live: 0, upcoming: 1, results: 2, all: 3 })[matchBucket(row)];
          return priority(a) - priority(b) || matchDate(a).localeCompare(matchDate(b)) || a.match.id - b.match.id;
        }));
        total = first.total;
      } else {
        const live = await fetchLiveMatches();
        const details = await Promise.allSettled(live.slice(0, 8).map(row => fetchMatchDetails(row.id)));
        matches = details.filter((v): v is PromiseFulfilledResult<MatchDetails | null> => v.status === 'fulfilled').map(v => v.value).filter((v): v is MatchDetails => !!v);
        total = live.length;
      }
      if (current !== request.current) return;
      setRows(matches);
      setCount(total);
      setComplete(fullyLoaded);
      setError('');
    } catch (e) { if (current === request.current) setError(e instanceof Error ? e.message : 'Could not load matches.'); }
    finally { if (current === request.current) setLoading(false); }
  }, [eventMode, tournamentId]);
  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 60000);
    return () => { request.current++; clearInterval(timer); };
  }, [eventMode, load]));
  useEffect(() => {
    if (eventMode) return;
    const players = [...new Map(rows.flatMap(row => row.match.teams.flat()).map(player => [player.id, player])).values()];
    if (!players.length) return;
    let active = true;
    const found = new Map<number, ProPlayer>();
    for (const player of players) {
      const cached = profileCache.get(player.id);
      if (cached) found.set(player.id, cached);
    }
    setLookup(new Map(found));
    void (async () => {
      try {
        const rankings = await fetchProSnapshot('rankings');
        if (!active) return;
        for (const player of players) {
          const ranked = rankings.categories.men.players.find(row => row.id === player.id)
            || rankings.categories.women.players.find(row => row.id === player.id);
          if (ranked?.photoUrl?.startsWith('https://')) {
            profileCache.set(player.id, ranked);
            found.set(player.id, ranked);
          }
        }
        setLookup(new Map(found));
      } catch { /* The player directory can still supply portraits. */ }
      for (const player of players) {
        if (!active) return;
        if (profileCache.has(player.id)) continue;
        await new Promise(resolve => setTimeout(resolve, 800));
        if (!active) return;
        try {
          const result = await searchProPlayers('', 'all', 1, player.id);
          const profile = result.players.find(row => row.id === player.id) || null;
          profileCache.set(player.id, profile);
          if (profile) { found.set(player.id, profile); setLookup(new Map(found)); }
        } catch { /* Keep initials for unavailable profiles. */ }
      }
    })();
    return () => { active = false; };
  }, [eventMode, rows]);

  const days = useMemo(() => [...new Set(rows.map(matchDate).filter(Boolean))].sort(), [rows]);
  const rounds = useMemo(() => [...new Set(rows.map(row => proRound(row.match)).filter(Boolean))], [rows]);
  const filtered = useMemo(() => rows.filter(row => (category === 'all' || row.match.category === category)
    && (status === 'all' || matchBucket(row) === status)
    && (day === 'all' || matchDate(row) === day)
    && (round === 'all' || proRound(row.match) === round)), [rows, category, status, day, round]);
  const counts = useMemo(() => ({ live: rows.filter(row => matchBucket(row) === 'live').length,
    upcoming: rows.filter(row => matchBucket(row) === 'upcoming').length, results: rows.filter(row => matchBucket(row) === 'results').length }), [rows]);
  const header = <View style={{ padding: 20, gap: 15 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: b.elevated, borderRadius: 23 }}><Ionicons name="arrow-back" size={22} color={b.premium} /></Pressable>
    <Text style={{ color: b.accent, fontWeight: '800', letterSpacing: 1.3, fontSize: 11 }}>INTERNATIONAL · {eventMode ? 'TOURNAMENT MATCHES' : 'LIVE'}</Text>
    {eventMode && event?.photoUrl && <Image source={{ uri: event.photoUrl }} contentFit="cover" style={{ height: 190, width: '100%', borderRadius: 18 }} />}
    <Text accessibilityRole="header" style={{ color: b.premium, fontWeight: '800', fontSize: 30 }}>{eventMode ? `${playerCountryFlag(event?.country)}${event?.country ? ' ' : ''}${event?.name || rows[0]?.match.tournamentName || 'Tournament matches'}` : 'On court now'}</Text>
    {eventMode && event && <Text style={{ color: b.muted, lineHeight: 21 }}>{[event.venue, event.location, event.country, event.startDate && event.endDate ? `${labelDate(event.startDate)} – ${labelDate(event.endDate)}` : null].filter(Boolean).join(' · ')}</Text>}
    <Text style={{ color: b.muted, lineHeight: 21 }}>{eventMode ? `${count} matches · ${counts.live} live · ${counts.upcoming} upcoming · ${counts.results} results. Open a match for set statistics and point coverage.` : 'Follow the scores as they happen. Open a match for set statistics and point-by-point coverage.'}</Text>
    <Pressable accessibilityRole="button" onPress={() => void load()} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 }}><Ionicons name="refresh" size={17} color={b.accent} /><Text style={{ color: b.accent, fontWeight: '700' }}>Refresh scores</Text></Pressable>
    {loading && <ActivityIndicator color={b.accent} />}
    {!!error && <Text accessibilityRole="alert" style={{ color: b.danger }}>{error}</Text>}
    {eventMode && !complete && <Text style={{ color: b.danger, fontSize: 12 }}>Some match pages could not be loaded. Refresh to try again.</Text>}
    {eventMode && rows.length > 0 && <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        {(['all', 'live', 'upcoming', 'results'] as const).map(value => <Chip key={value} label={value === 'all' ? `All ${rows.length}` : `${value[0].toUpperCase()}${value.slice(1)} ${counts[value]}`} selected={status === value} onPress={() => setStatus(value)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        {(['all', 'men', 'women'] as const).map(value => <Chip key={value} label={value === 'all' ? 'All categories' : value === 'men' ? 'Men' : 'Women'} selected={category === value} onPress={() => setCategory(value)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        <Chip label="All days" selected={day === 'all'} onPress={() => setDay('all')} />
        {days.map(value => <Chip key={value} label={labelDate(value)} selected={day === value} onPress={() => setDay(value)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
        <Chip label="All rounds" selected={round === 'all'} onPress={() => setRound('all')} />
        {rounds.map(value => <Chip key={value} label={value} selected={round === value} onPress={() => setRound(value)} />)}
      </ScrollView>
      <Text style={{ color: b.premium, fontWeight: '800', fontSize: 18 }}>{filtered.length} {filtered.length === 1 ? 'match' : 'matches'}</Text>
    </>}
    {!loading && !error && (eventMode ? !filtered.length : !count) && <View style={{ backgroundColor: b.elevated, borderColor: b.edge, borderWidth: 1, borderRadius: 20, padding: 22, gap: 7 }}><Text style={{ color: b.premium, fontSize: 18, fontWeight: '700' }}>{eventMode ? 'No matches for these filters' : 'No matches live right now'}</Text><Text style={{ color: b.muted, lineHeight: 20 }}>{eventMode ? 'Try another day, category or round.' : 'Check back when play starts. The tour calendar has upcoming fixtures.'}</Text></View>}
    {!eventMode && count > rows.length && <Text style={{ color: b.muted, fontSize: 12 }}>{count} live matches · showing details for {rows.length} available matches</Text>}
  </View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: b.page }} edges={['top']}>
    <FlatList data={eventMode ? filtered : rows} keyExtractor={row => String(row.match.id)} ListHeaderComponent={header}
      contentContainerStyle={{ paddingBottom: 50 }} renderItem={({ item }) => <View style={{ marginHorizontal: 20, marginBottom: 12 }}>
        {eventMode ? <TourMatchCard row={item} onOpen={() => router.push({ pathname: '/pro/match/[id]', params: { id: String(item.match.id), from: 'tournament' } })} />
          : <MatchCard match={item.match} lookup={lookup} onPlayer={id => {
            const player = lookup.get(id);
            if (player) router.push({ pathname: '/rankings', params: { view: 'Discover', source: 'pro', gender: player.category, query: player.name } });
          }} />}
      </View>} />
  </SafeAreaView>;
}
