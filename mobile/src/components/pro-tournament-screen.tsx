import { trackEvent } from '@/lib/analytics';
import { playerCountryFlag } from '@/lib/player-hub';
import { ProMatchStar } from '@/components/pro-match-star';
import { proDate, type ProCategory, type ProTournament } from '@/lib/pro-padel';
import { fetchTournamentDetails, fetchTournamentDraw, type MatchDetails } from '@/lib/pro-padel-live';
import { filterTournamentMatches, tournamentMatchBucket, tournamentMatchPending, tournamentMatchDay, tournamentRoundLabel, tournamentRounds, tournamentSummary, type TournamentMatchStatus } from '@/lib/pro-tournament';
import { lightBrand as b } from '@/theme/tokens';
import { siteUrl } from '@/lib/site';
import { startForegroundTask } from '@/lib/foreground-task';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Share, Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string | null }) {
  return <View style={s.infoRow}><Ionicons name={icon} size={18} color={b.accent} /><View style={{ flex: 1, gap: 4 }}><Text style={s.eyebrow}>{label}</Text><Text style={s.infoValue}>{value || 'Not announced'}</Text></View></View>;
}
function TournamentMatchCard({ row, onPress }: { row: MatchDetails; onPress: () => void }) {
  const { match } = row;
  const bucket = tournamentMatchBucket(row);
  const scores = match.score.length ? match.score : row.liveScore?.sets || [];
  return <View style={[s.matchCard, bucket === 'live' && { borderColor: b.accent }]}>
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open ${match.teams.map(team => team.map(player => player.name).join(' and ') || 'Pair to be confirmed').join(' versus ')}, ${tournamentRoundLabel(row)}`} style={{ gap: 12 }}>
    <View style={[s.cardTop, { minHeight: 44, paddingRight: 52 }]}><Text style={[s.matchStatus, bucket === 'live' && { color: b.danger }]}>{bucket === 'live' ? '● LIVE NOW' : bucket === 'upcoming' ? 'UP NEXT' : match.status === 'finished' ? 'FINAL' : match.status.replaceAll('_', ' ').toUpperCase()}</Text><Text numberOfLines={1} style={[s.small, { flex: 1, textAlign: 'right' }]}>{match.court || 'Court TBC'}</Text></View>
    {match.teams.map((team, index) => <View key={index} style={[s.teamRow, index === 1 && { borderTopWidth: 1, borderTopColor: b.edge, paddingTop: 12 }]}>
      <View style={{ flex: 1, gap: 5 }}>{team.length ? team.map(player => <Text key={player.id} style={[s.player, match.winner === `team_${index + 1}` && { color: b.accent }]}>{playerCountryFlag(player.nationality)}{player.nationality ? ' ' : ''}{player.name}</Text>) : <Text style={[s.player, { color: b.muted }]}>Pair to be confirmed</Text>}
        {row.seeds[index] && <Text style={s.seed}>SEED {row.seeds[index]}</Text>}
      </View>
      {scores.map((set, i) => <Text key={i} style={[s.setScore, match.winner === `team_${index + 1}` && { color: b.accent }]}>{set[index] ?? '–'}</Text>)}
      {match.winner === `team_${index + 1}` && <Ionicons name="checkmark-circle" size={17} color={b.accent} />}
    </View>)}
    <View style={s.cardFoot}><Text style={s.small}>{tournamentRoundLabel(row)} · {match.scheduledAt ? proDate(match.scheduledAt, true) : proDate(match.playedAt)}</Text>{row.duration && <Text style={s.small}>{row.duration}</Text>}</View>
    {bucket === 'upcoming' && <Text style={s.scheduleNote}>{match.scheduleLabel ? `${match.scheduleLabel} · venue time` : match.scheduledAt ? 'Estimated start · subject to change' : 'Start time to be confirmed'}</Text>}
    {!!row.liveScore?.points && <Text style={s.seed}>Current game {row.liveScore.points.replace(':', ' – ')}</Text>}
    </Pressable>
    <View style={{ position: 'absolute', top: 16, right: 16 }}><ProMatchStar row={row} /></View>
  </View>;
}

export function ProTournamentScreen({ id }: { id: number }) {
  const router = useRouter();
  const [event, setEvent] = useState<ProTournament | null>(null);
  useEffect(() => { if (event?.id) void trackEvent('content_view', { content_type: 'tournament', content_id: `tournament:${event.id}` }); }, [event?.id]);
  const [rows, setRows] = useState<MatchDetails[]>([]);
  const [complete, setComplete] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'overview' | 'matches'>('overview');
  const [category, setCategory] = useState<ProCategory>('men');
  const [draw, setDraw] = useState('main');
  const [round, setRound] = useState('all');
  const [status, setStatus] = useState<TournamentMatchStatus>('all');
  const [day, setDay] = useState('all');
  const [filterMenu, setFilterMenu] = useState<'status' | 'day' | null>(null);
  const [showPending, setShowPending] = useState(false);
  const sequence = useRef(0);
  const list = useRef<FlatList<MatchDetails>>(null);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    if (!Number.isSafeInteger(id) || id <= 0) { setError('Invalid tournament.'); setLoading(false); return; }
    setLoading(true);
    const results = await Promise.allSettled([fetchTournamentDetails(id), fetchTournamentDraw(id)]);
    if (current !== sequence.current) return;
    const [details, matches] = results;
    if (details.status === 'fulfilled') setEvent(details.value);
    if (matches.status === 'fulfilled') { setRows(matches.value.matches); setComplete(matches.value.complete); }
    setError(details.status === 'rejected' || matches.status === 'rejected' ? 'Some tournament data could not be loaded. Pull to refresh or try again.' : details.value == null ? 'This tournament is unavailable.' : '');
    setLoading(false);
  }, [id]);
  useFocusEffect(useCallback(() => {
    const stop = startForegroundTask(load, 60000);
    return () => { sequence.current++; stop(); };
  }, [load]));
  const summary = useMemo(() => tournamentSummary(rows, category), [rows, category]);
  const categoryRows = useMemo(() => rows.filter(row => row.match.category === category), [rows, category]);
  const rounds = useMemo(() => tournamentRounds(categoryRows).filter(item => item.draw === draw), [categoryRows, draw]);
  const days = useMemo(() => [...new Set(categoryRows.filter(row => (row.draw || 'main') === draw).map(tournamentMatchDay).filter(Boolean))].sort(), [categoryRows, draw]);
  const filtered = useMemo(() => filterTournamentMatches(rows, { category, draw, round, status, day }), [rows, category, draw, round, status, day]);
  const pending = filtered.filter(tournamentMatchPending);
  const displayed = showPending ? filtered : filtered.filter(row => !tournamentMatchPending(row));
  const counts = useMemo(() => { const available = filterTournamentMatches(rows, { category, draw, round, status: 'all', day }); return { all: available.length, live: available.filter(row => tournamentMatchBucket(row) === 'live').length, upcoming: available.filter(row => tournamentMatchBucket(row) === 'upcoming').length, results: available.filter(row => tournamentMatchBucket(row) === 'results').length }; }, [rows, category, draw, round, day]);
  const openMatches = () => { setTab('matches'); list.current?.scrollToOffset({ offset: 0, animated: false }); };
  const prize = event?.prize ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: event.prize.currency, maximumFractionDigits: 0 }).format(event.prize.amount) : 'Not announced';
  const live = ['live', 'ongoing'].includes(event?.status || '');
  const statusLabel = live ? 'Tournament in progress' : event?.status === 'finished' ? 'Tournament complete' : 'Upcoming tournament';
  const header = <View style={s.body}>
    {tab === 'overview' && event?.photoUrl && <View style={[s.artwork, { height: 174 }]}><Image source={{ uri: event.photoUrl }} contentFit="cover" style={StyleSheet.absoluteFill} /><View style={s.artworkShade} /><View style={s.artworkBadges}><Text style={s.liveBadge}>{live ? '● LIVE' : (event.status || 'TOURNAMENT').toUpperCase()}</Text>{event.level && <Text style={s.levelBadge}>{event.level.replaceAll('_', ' ').toUpperCase()}</Text>}</View></View>}
    <View style={{ gap: 6 }}><Text accessibilityRole="header" style={s.title}>{playerCountryFlag(event?.country)}{event?.country ? ' ' : ''}{event?.name || rows[0]?.match.tournamentName || 'Tournament'}</Text><Text style={s.subtitle}>{[event?.location, event?.startDate && event?.endDate ? `${proDate(event.startDate)} – ${proDate(event.endDate)}` : null].filter(Boolean).join(' · ')}</Text></View>
    <View style={s.tabs}>{(['overview', 'matches'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => { setTab(value); list.current?.scrollToOffset({ offset: 0, animated: false }); }} style={[s.tab, tab === value && s.tabSelected]}><Ionicons name={value === 'overview' ? 'information-circle-outline' : 'tennisball-outline'} size={17} color={tab === value ? b.accent : b.muted} /><Text style={[s.tabText, tab === value && { color: b.accent }]}>{value === 'overview' ? 'Overview' : 'Matches'}</Text></Pressable>)}</View>
    <View style={s.gender}>{(['men', 'women'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${value === 'men' ? 'Men' : 'Women'} competition`} accessibilityState={{ selected: category === value }} onPress={() => { setCategory(value); setDraw('main'); setRound('all'); setDay('all'); }} style={[s.genderButton, category === value && s.genderSelected]}><Text style={[s.genderText, category === value && { color: '#FFFFFF' }]}>{value === 'men' ? 'Men' : 'Women'}</Text></Pressable>)}</View>
    {!!error && <View style={s.notice}><Text accessibilityRole="alert" style={{ color: b.danger, flex: 1 }}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={s.seed}>Retry</Text></Pressable></View>}
    {loading && !event && <ActivityIndicator color={b.accent} />}
    {!complete && <Text style={{ color: b.danger, fontSize: 12 }}>Some match pages are missing. Counts reflect the loaded matches. Refresh to try again.</Text>}
    {tab === 'overview' ? <>
      <View style={s.progress}><View style={{ flex: 1, gap: 5 }}><Text style={s.progressTitle}>{statusLabel}</Text><Text style={s.small}>{summary.live ? `${summary.live} ${category === 'men' ? "men’s" : "women’s"} matches live now` : 'Select Matches to explore the draw and results'}</Text></View><Ionicons name={live ? 'radio-outline' : 'calendar-outline'} size={23} color={b.accent} /></View>
      <View style={s.stats}>{[{ value: summary.pairs, label: 'PAIRS' }, { value: summary.matches, label: 'MATCHES' }, { value: summary.countries, label: 'COUNTRIES' }].map(item => <View key={item.label} style={s.stat}><Text style={s.statValue}>{loading && !rows.length ? '—' : rows.length ? item.value : '—'}</Text><Text style={s.statLabel}>{item.label}</Text></View>)}</View>
      <Text style={s.small}>{category === 'men' ? 'Men' : 'Women'} · Main-draw pairs and countries of published players. Match count includes qualifying.</Text>
      <Pressable accessibilityRole="button" onPress={openMatches} style={s.browse}><View style={{ flex: 1, gap: 5 }}><Text style={s.browseTitle}>Explore the {category === 'men' ? "men’s" : "women’s"} draw</Text><Text style={s.browseSubtitle}>{summary.upcoming} upcoming · {summary.results} results</Text></View><Ionicons name="arrow-forward" size={22} color={b.padel} /></Pressable>
      <Text style={s.sectionTitle}>Tournament information</Text>
      <View style={s.infoCard}><InfoRow icon="location-outline" label="VENUE" value={event?.venue} /><InfoRow icon="navigate-outline" label="ADDRESS" value={event?.address} /><InfoRow icon="tennisball-outline" label="COURT" value={event?.courtType ? event.courtType[0].toUpperCase() + event.courtType.slice(1) : null} /><InfoRow icon="trophy-outline" label="TOURNAMENT PRIZE FUND" value={prize} /><InfoRow icon="time-outline" label="VENUE TIMEZONE" value={event?.timezone} /></View>
      <Text style={s.small}>Match times are shown in South African time (SAST). Start times may change.</Text>
    </> : <>
      <View style={s.drawTabs}>{['main', 'qualy', 'group', 'placement'].filter(value => value === 'main' || categoryRows.some(row => row.draw === value)).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: draw === value }} onPress={() => { setDraw(value); setRound('all'); setDay('all'); }} style={[s.drawTab, draw === value && { borderBottomColor: b.accent }]}><Text style={{ color: draw === value ? b.accent : b.muted, fontSize: 12, fontWeight: '800' }}>{value === 'main' ? 'Main draw' : value === 'qualy' ? 'Qualifying' : value === 'group' ? 'Groups' : 'Placement'}</Text></Pressable>)}</View>
      <ScrollView key={`${category}:${draw}`} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {[{ key: 'all', label: 'All rounds', days: [] as string[], count: categoryRows.filter(row => (row.draw || 'main') === draw).length }, ...rounds].map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: round === item.key }} onPress={() => setRound(item.key)} style={[s.roundTab, round === item.key && { backgroundColor: b.accent }]}><Text style={{ color: round === item.key ? '#FFFFFF' : b.premium, fontSize: 12, fontWeight: '800' }}>{item.label}</Text><Text style={{ color: round === item.key ? '#DDEBCF' : b.muted, fontSize: 10 }}>{item.days.length ? `${proDate(item.days[0])}${item.days.length > 1 ? ` – ${proDate(item.days[item.days.length - 1])}` : ''}` : `${item.count} matches`}</Text></Pressable>)}
      </ScrollView>
      <View style={s.filterBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Filter match status" onPress={() => setFilterMenu('status')} style={s.filterButton}><Ionicons name="options-outline" size={17} color={b.accent} /><Text style={s.filterLabel}>{status === 'all' ? 'All matches' : status === 'live' ? 'Live now' : status === 'upcoming' ? 'Up next' : 'Results'}</Text><Ionicons name="chevron-down" size={13} color={b.muted} /></Pressable>
        <View style={{ width: 1, height: 18, backgroundColor: b.edge }} />
        <Pressable accessibilityRole="button" accessibilityLabel="Filter match date" onPress={() => setFilterMenu('day')} style={s.filterButton}><Ionicons name="calendar-outline" size={16} color={b.accent} /><Text style={s.filterLabel}>{day === 'all' ? 'All days' : proDate(day)}</Text><Ionicons name="chevron-down" size={13} color={b.muted} /></Pressable>
      </View>
      <View style={s.cardTop}><Text style={s.sectionTitle}>{displayed.length} {displayed.length === 1 ? 'match' : 'matches'}</Text><Text style={s.small}>Times in SAST</Text></View>
      {!!pending.length && <Pressable accessibilityRole="button" accessibilityState={{ expanded: showPending }} onPress={() => setShowPending(value => !value)} style={s.progress}><Ionicons name={showPending ? 'chevron-up' : 'chevron-down'} size={19} color={b.accent} /><View style={{ flex: 1, gap: 4 }}><Text style={s.progressTitle}>{pending.length} {pending.length === 1 ? 'match awaiting players' : 'matches awaiting players'}</Text><Text style={s.small}>{showPending ? 'Tap to minimise unpublished match details.' : 'Tap to show these matches when you need them.'}</Text></View></Pressable>}
      {!loading && !filtered.length && <View style={s.infoCard}><Text style={s.progressTitle}>{rows.length ? 'No matches for this selection' : 'Matches not available yet'}</Text><Text style={s.subtitle}>{rows.length ? 'Choose another round, day or status.' : 'Fixtures and results will appear once published.'}</Text></View>}
    </>}
    {tab === 'overview' && <Text style={s.attribution}>Tournament data · PadelAPI</Text>}
  </View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: b.page }} edges={['top']}>
    <View style={s.topBar}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={s.iconButton}><Ionicons name="arrow-back" size={22} color={b.premium} /></Pressable><Text style={s.topLabel}>TOURNAMENT CENTRE</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh tournament" onPress={() => void load()} style={s.iconButton}>{loading ? <ActivityIndicator size="small" color={b.accent} /> : <Ionicons name="refresh-outline" size={20} color={b.accent} />}</Pressable><Pressable accessibilityRole="button" accessibilityLabel="Share tournament" onPress={() => void Share.share({ message: `${event?.name || 'Tournament'} on 4M Padel\n${siteUrl(`/pro/results?event=${id}`)}` }).then(result => { if (result.action === Share.sharedAction) void trackEvent('share', { content_type: 'tournament', method: 'native' }); }).catch(() => {})} style={s.iconButton}><Ionicons name="share-outline" size={21} color={b.premium} /></Pressable></View>
    <Modal visible={filterMenu != null} transparent animationType="slide" onRequestClose={() => setFilterMenu(null)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,25,16,0.35)' }}><Pressable accessibilityLabel="Close filters" accessibilityRole="button" onPress={() => setFilterMenu(null)} style={{ flex: 1 }} /><View style={{ maxHeight: '65%', backgroundColor: b.elevated, padding: 24, paddingBottom: 44, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 16 }}>
        <View style={s.cardTop}><Text style={s.sectionTitle}>{filterMenu === 'status' ? 'Match status' : 'Match day'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close filters" onPress={() => setFilterMenu(null)} style={s.iconButton}><Ionicons name="close" size={22} color={b.premium} /></Pressable></View>
        <ScrollView>{(filterMenu === 'status' ? ['all', 'live', 'upcoming', 'results'] : ['all', ...days]).map(value => {
          const selected = (filterMenu === 'status' ? status : day) === value;
          const label = filterMenu === 'status' ? value === 'all' ? 'All matches' : value === 'live' ? 'Live now' : value === 'upcoming' ? 'Up next' : 'Results' : value === 'all' ? 'All days' : proDate(value);
          return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => { if (filterMenu === 'status') setStatus(value as TournamentMatchStatus); else setDay(value); setFilterMenu(null); }} style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: b.edge }}><Text style={{ color: selected ? b.accent : b.premium, flex: 1, fontSize: 16, fontWeight: selected ? '800' : '500' }}>{label}</Text>{filterMenu === 'status' && <Text style={s.small}>{counts[value as TournamentMatchStatus]}</Text>}{selected && <Ionicons name="checkmark" size={20} color={b.accent} />}</Pressable>;
        })}</ScrollView>
      </View></View>
    </Modal>
    <FlatList ref={list} data={tab === 'matches' ? displayed : []} keyExtractor={row => String(row.match.id)} ListHeaderComponent={header} refreshControl={<RefreshControl refreshing={loading && !!event} onRefresh={() => void load()} tintColor={b.accent} />} contentContainerStyle={{ paddingBottom: 50 }} renderItem={({ item }) => <View style={{ marginHorizontal: 20, marginBottom: 12 }}><TournamentMatchCard row={item} onPress={() => router.push({ pathname: '/pro/match/[id]', params: { id: String(item.match.id), from: 'tournament', tournament: String(id) } })} /></View>} />
  </SafeAreaView>;
}

const s = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: b.edge },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: b.elevated },
  topLabel: { flex: 1, color: b.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  body: { padding: 20, gap: 15 }, artwork: { borderRadius: 20, overflow: 'hidden', backgroundColor: b.premium },
  artworkShade: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(10,25,16,0.12)' }, artworkBadges: { padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveBadge: { backgroundColor: '#FF354A', color: '#FFFFFF', fontSize: 10, letterSpacing: 1, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 },
  levelBadge: { backgroundColor: b.premium, color: b.padel, fontSize: 10, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 },
  title: { color: b.premium, fontSize: 25, lineHeight: 31, fontWeight: '800', letterSpacing: -0.6 }, subtitle: { color: b.muted, fontSize: 13, lineHeight: 20 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: b.edge, gap: 20 }, tab: { flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', alignItems: 'center', minHeight: 48, borderBottomWidth: 2, borderBottomColor: 'transparent' }, tabSelected: { borderBottomColor: b.accent }, tabText: { color: b.muted, fontSize: 14, fontWeight: '800' },
  gender: { flexDirection: 'row', backgroundColor: b.panel, borderRadius: 14, padding: 4 }, genderButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 11 }, genderSelected: { backgroundColor: b.accent }, genderText: { color: b.muted, fontWeight: '800', fontSize: 14 },
  drawTabs: { flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderBottomColor: b.edge }, drawTab: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  roundTab: { minWidth: 100, paddingHorizontal: 14, paddingVertical: 13, justifyContent: 'center', gap: 6, borderRadius: 8, backgroundColor: b.panel },
  filterBar: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: b.edge, paddingBottom: 3 }, filterButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, filterLabel: { color: b.muted, fontSize: 12, fontWeight: '600' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 12 }, progress: { padding: 17, backgroundColor: '#EAF0E5', borderRadius: 16, borderLeftWidth: 3, borderLeftColor: b.accent, flexDirection: 'row', gap: 10, alignItems: 'center' }, progressTitle: { color: b.premium, fontSize: 16, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: 8 }, stat: { flex: 1, paddingVertical: 17, alignItems: 'center', gap: 6, backgroundColor: b.elevated, borderRadius: 16, borderWidth: 1, borderColor: b.edge }, statValue: { color: b.accent, fontSize: 29, fontWeight: '800', fontVariant: ['tabular-nums'] }, statLabel: { color: b.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  browse: { backgroundColor: b.premium, padding: 19, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10 }, browseTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' }, browseSubtitle: { color: '#CDDACE', fontSize: 12 },
  sectionTitle: { color: b.premium, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }, infoCard: { backgroundColor: b.elevated, borderRadius: 18, borderWidth: 1, borderColor: b.edge, padding: 17, gap: 10 }, infoRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: b.edge }, eyebrow: { color: b.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, infoValue: { color: b.premium, fontSize: 14, lineHeight: 21, fontWeight: '600' }, small: { color: b.muted, fontSize: 11, lineHeight: 17 }, attribution: { color: b.muted, fontSize: 10 },
  matchCard: { backgroundColor: b.elevated, borderRadius: 18, borderWidth: 1, borderColor: b.edge, padding: 16, gap: 12 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' }, matchStatus: { color: b.accent, fontWeight: '800', fontSize: 10, letterSpacing: 0.8 }, teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, player: { color: b.premium, fontSize: 14, fontWeight: '700', lineHeight: 20 }, seed: { color: b.accent, fontSize: 10, fontWeight: '800' }, setScore: { color: b.premium, fontWeight: '800', fontSize: 18, width: 22, textAlign: 'center', fontVariant: ['tabular-nums'] }, cardFoot: { borderTopWidth: 1, borderTopColor: b.edge, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' }, scheduleNote: { color: b.muted, fontSize: 10, lineHeight: 15 },
});
