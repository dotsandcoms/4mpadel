import { ProMatchScoreboard } from '@/components/pro-match-scoreboard';
import { ProTournamentEntry } from '@/components/pro-tournament-entry';
import { tournamentEntries, tournamentEntriesForDraw, type TournamentEntry } from '@/lib/pro-tournament-entries';
import { readTournament, rememberTournament } from '@/lib/pro-tournament-cache';
import { addToCalendar } from '@/lib/device-calendar';
import { HomeAction } from '@/components/home-action';
import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { ErrorBanner } from '@/components/error-banner';
import { trackEvent } from '@/lib/analytics';
import { playerCountryFlag } from '@/lib/player-hub';
import { proDate, type ProCategory, type ProTournament } from '@/lib/pro-padel';
import { fetchTournamentDetails, fetchTournamentDraw, type MatchDetails } from '@/lib/pro-padel-live';
import { filterTournamentMatches, tournamentMatchBucket, tournamentMatchPending, tournamentMatchDay, tournamentRoundLabel, tournamentRounds, tournamentSummary, tournamentNowAndNext, type TournamentMatchStatus } from '@/lib/pro-tournament';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';
import { siteUrl } from '@/lib/site';
import { startForegroundTask } from '@/lib/foreground-task';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Share, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function InfoRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value?: string | null }) {
  return <View style={s.infoRow}><Ionicons name={icon} size={18} color={b.accent} /><View style={{ flex: 1, gap: 4 }}><Text style={s.eyebrow}>{label}</Text><Text style={s.infoValue}>{value || 'Not announced'}</Text></View></View>;
}
function TournamentMatchCard({ row, onPress, context, photosEnabled = true }: { row: MatchDetails; onPress: () => void; context?: MatchDetails[]; photosEnabled?: boolean }) {
  return <ProMatchScoreboard row={row} round={tournamentRoundLabel(row, context)} onPress={onPress} photosEnabled={photosEnabled} />;
}

type TournamentListItem = MatchDetails | { entry: TournamentEntry };
export function ProTournamentScreen({ id, initialTab = 'overview', initialCategory = 'men' }: { id: number; initialTab?: 'overview' | 'entries' | 'matches'; initialCategory?: ProCategory }) {
  const router = useRouter();
  const [event, setEvent] = useState<ProTournament | null>(() => readTournament(id)?.event || null);
  useEffect(() => { if (event?.id) void trackEvent('content_view', { content_type: 'tournament', content_id: `tournament:${event.id}` }); }, [event?.id]);
  const [rows, setRows] = useState<MatchDetails[]>(() => readTournament(id)?.matches || []);
  const [complete, setComplete] = useState(() => readTournament(id)?.complete ?? true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'overview' | 'entries' | 'matches'>(initialTab);
  const [category, setCategory] = useState<ProCategory>(initialCategory);
  const [entryDraw, setEntryDraw] = useState('main');
  const [entryQuery, setEntryQuery] = useState('');
  const [draw, setDraw] = useState('all');
  const [round, setRound] = useState('all');
  const [status, setStatus] = useState<TournamentMatchStatus>('all');
  const [day, setDay] = useState('all');
  const [filterMenu, setFilterMenu] = useState<'status' | 'day' | null>(null);
  const [showPending, setShowPending] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [visibleMatches, setVisibleMatches] = useState<Set<number>>(new Set());
  const [visibleEntries, setVisibleEntries] = useState<Set<string>>(new Set());
  const onVisibleMatches = useRef(({ viewableItems }: { viewableItems: { item: TournamentListItem; isViewable: boolean }[] }) => {
    setVisibleMatches(new Set(viewableItems.filter(row => row.isViewable && 'match' in row.item).map(row => (row.item as MatchDetails).match.id)));
    setVisibleEntries(new Set(viewableItems.filter(row => row.isViewable && 'entry' in row.item).map(row => (row.item as { entry: TournamentEntry }).entry.key)));
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;
  const sequence = useRef(0);
  const list = useRef<FlatList<TournamentListItem>>(null);
  const load = useCallback(async (force = false) => {
    const current = ++sequence.current;
    if (!Number.isSafeInteger(id) || id <= 0) { setError('Invalid tournament.'); setLoading(false); return; }
    const cached = readTournament(id);
    if (!force && cached && Date.now() - cached.loadedAt < 60000) { setEvent(cached.event); setRows(cached.matches); setComplete(cached.complete); setLoading(false); return; }
    setLoading(true);
    const results = await Promise.allSettled([fetchTournamentDetails(id), fetchTournamentDraw(id)]);
    if (current !== sequence.current) return;
    const [details, matches] = results;
    if (details.status === 'fulfilled') setEvent(details.value);
    if (matches.status === 'fulfilled') { setRows(matches.value.matches); setComplete(matches.value.complete); }
    if (matches.status === 'fulfilled') rememberTournament(id, { event: details.status === 'fulfilled' ? details.value : cached?.event || null, matches: matches.value.matches, complete: matches.value.complete });
    setError(details.status === 'rejected' || matches.status === 'rejected' ? 'Some tournament data could not be loaded. Pull to refresh or try again.' : details.value == null ? 'This tournament is unavailable.' : '');
    setLoading(false);
  }, [id]);
  useFocusEffect(useCallback(() => {
    const stop = startForegroundTask(() => load(), 60000);
    return () => { sequence.current++; stop(); };
  }, [load]));
  const nowAndNext = useMemo(() => tournamentNowAndNext(rows, category), [rows, category]);
  const openMatch = (row: MatchDetails) => router.push({ pathname: '/pro/match/[id]', params: { id: String(row.match.id), from: 'tournament', tournament: String(id) } });
  const showMatches = (value: TournamentMatchStatus) => { setDraw('all'); setRound('all'); setDay('all'); setStatus(value); setTab('matches'); list.current?.scrollToOffset({ offset: 0, animated: false }); };
  const summary = useMemo(() => tournamentSummary(rows, category), [rows, category]);
  const categoryRows = useMemo(() => rows.filter(row => row.match.category === category), [rows, category]);
  const entries = useMemo(() => tournamentEntries(rows, id, category), [rows, id, category]);
  const selectedEntries = useMemo(() => tournamentEntriesForDraw(entries, entryDraw).filter(entry => !entryQuery.trim() || entry.team.some(player => player.name.toLocaleLowerCase().includes(entryQuery.trim().toLocaleLowerCase()))), [entries, entryDraw, entryQuery]);
  const topSeedsCount = selectedEntries.filter(entry => entry.seed != null && entry.seed <= 4).length;
  const openPair = (entry: TournamentEntry) => router.push({ pathname: '/pro/tournament/[id]/pair/[pair]', params: { id: String(id), pair: entry.key, category } });
  const rounds = useMemo(() => tournamentRounds(categoryRows).filter(item => draw === 'all' || item.draw === draw), [categoryRows, draw]);
  const days = useMemo(() => [...new Set(categoryRows.filter(row => draw === 'all' || (row.draw || 'main') === draw).map(tournamentMatchDay).filter(Boolean))].sort(), [categoryRows, draw]);
  const filtered = useMemo(() => filterTournamentMatches(rows, { category, draw, round, status, day }), [rows, category, draw, round, status, day]);
  const pending = filtered.filter(tournamentMatchPending);
  const displayed = showPending ? filtered : filtered.filter(row => !tournamentMatchPending(row));
  const counts = useMemo(() => { const available = filterTournamentMatches(rows, { category, draw, round, status: 'all', day }); return { all: available.length, live: available.filter(row => tournamentMatchBucket(row) === 'live').length, upcoming: available.filter(row => tournamentMatchBucket(row) === 'upcoming').length, results: available.filter(row => tournamentMatchBucket(row) === 'results').length }; }, [rows, category, draw, round, day]);
  const openMatches = () => { setTab('matches'); list.current?.scrollToOffset({ offset: 0, animated: false }); };
  const prize = event?.prize ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: event.prize.currency, maximumFractionDigits: 0 }).format(event.prize.amount) : 'Not announced';
  const header = <View style={s.body}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {event?.photoUrl && <Image source={{ uri: event.photoUrl }} contentFit="cover" style={{ width: 60, height: 68, borderRadius: 10, backgroundColor: b.panel }} />}
      <View style={{ flex: 1, gap: 5 }}><Text accessibilityRole="header" style={s.title}>{playerCountryFlag(event?.country)}{event?.country ? ' ' : ''}{event?.name || rows[0]?.match.tournamentName || 'Tournament'}</Text><Text style={s.subtitle}>{[event?.location, event?.startDate && event?.endDate ? `${proDate(event.startDate)} – ${proDate(event.endDate)}` : null].filter(Boolean).join(' · ')}</Text></View>
    </View>
    <NativeSegmentedControl label="Tournament view" value={tab} onChange={value => { setTab(value as typeof tab); list.current?.scrollToOffset({ offset: 0, animated: false }); }} options={[{ value: 'overview', label: 'Overview' }, { value: 'entries', label: 'Entries' }, { value: 'matches', label: 'Matches' }]} />
    <NativeSegmentedControl label="Competition" value={category} onChange={value => { setCategory(value as ProCategory); setDraw('all'); setRound('all'); setDay('all'); }} options={[{ value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }]} />
    {!!error && <View style={s.notice}><Text accessibilityRole="alert" style={{ color: b.danger, flex: 1 }}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load(true)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={s.seed}>Retry</Text></Pressable></View>}
    {loading && !event && <ActivityIndicator color={loadingBlue} />}
    {!complete && <Text style={{ color: b.danger, fontSize: 12 }}>Some match pages are missing. Counts reflect the loaded matches. Refresh to try again.</Text>}
    {tab === 'overview' ? <>
      {nowAndNext.live.length > 0 && <View style={{ gap: 12 }}><View style={s.cardTop}><Text style={s.sectionTitle}>Live now <Text style={{ color: b.danger }}>· {nowAndNext.live.length}</Text></Text><HomeAction label="View all" onPress={() => showMatches('live')} /></View>{nowAndNext.live.slice(0, 3).map(row => <TournamentMatchCard key={row.match.id} row={row} context={rows} onPress={() => openMatch(row)} />)}</View>}
      {nowAndNext.next.length > 0 && <View style={{ gap: 12 }}><View style={s.cardTop}><Text style={s.sectionTitle}>Up next</Text><HomeAction label="View all" onPress={() => showMatches('upcoming')} /></View>{nowAndNext.next.slice(0, 3).map(row => <TournamentMatchCard key={row.match.id} row={row} context={rows} onPress={() => openMatch(row)} />)}<Text style={s.small}>Main draw and qualifying · estimated times in SAST. Court order can change.</Text></View>}
      {!!rows.length && <View style={{ borderTopWidth: 1, borderTopColor: b.edge, paddingVertical: 10, gap: 4 }}><View style={s.cardTop}><Text style={{ color: b.premium, fontSize: 13, fontWeight: '600' }}>{category === 'men' ? 'Men' : 'Women'} · {summary.matches} matches</Text><HomeAction label="Full draw" onPress={openMatches} /></View><Text style={s.small}>{summary.pairs} main-draw pairs · {summary.countries} countries</Text></View>}
      <HomeAction label={showInfo ? 'Hide event details' : 'Event details'} onPress={() => setShowInfo(value => !value)} />
      {showInfo && <>
        {event?.startDate && event?.endDate && <HomeAction label="Add to calendar" icon="calendar" onPress={() => { void addToCalendar({ title: event.name, startDate: event.startDate, endDate: event.endDate, location: [event.venue, event.location, event.country].filter(Boolean).join(' · ') }).catch(e => setError(e instanceof Error ? e.message : 'This event could not be added to your calendar.')); }} />}
        <View style={s.infoCard}>{event?.venue && <InfoRow icon="location-outline" label="Venue" value={event.venue} />}{event?.address && <InfoRow icon="navigate-outline" label="Address" value={event.address} />}{event?.courtType && <InfoRow icon="tennisball-outline" label="Court" value={event.courtType} />}{event?.prize && <InfoRow icon="trophy-outline" label="Prize fund" value={prize} />}{event?.timezone && <InfoRow icon="time-outline" label="Venue timezone" value={event.timezone} />}</View>
      </>}
      <Text style={s.small}>Match times are shown in South African time (SAST). Start times may change.</Text>
    </> : tab === 'entries' ? <>
      <View style={{ gap: 5 }}><Text accessibilityRole="header" style={s.sectionTitle}>Pick a pair</Text><Text style={s.small}>Follow their results and route through the draw.</Text></View>
      <NativeSegmentedControl label="Entry draw" value={entryDraw} onChange={setEntryDraw} options={[{ value: 'main', label: `Main draw (${entries.filter(entry => entry.draws.includes('main')).length})` }, { value: 'qualy', label: `Qualifying (${entries.filter(entry => entry.draws.includes('qualy')).length})` }]} />
      <View style={s.entrySearch}><Ionicons name="search" size={18} color={b.muted} /><TextInput accessibilityLabel="Search tournament pairs" placeholder="Search either player" placeholderTextColor={b.muted} value={entryQuery} onChangeText={setEntryQuery} autoCorrect={false} autoCapitalize="none" returnKeyType="search" style={{ flex: 1, minHeight: 44, fontSize: 14, color: b.premium }} />{!!entryQuery && <Pressable accessibilityRole="button" accessibilityLabel="Clear pair search" onPress={() => setEntryQuery('')} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="close-circle" size={19} color={b.muted} /></Pressable>}</View>
      <Text style={s.small}>{selectedEntries.length} {selectedEntries.length === 1 ? 'pair' : 'pairs'} · Published draw{!complete ? ' · Incomplete' : ''}</Text>
      {!loading && !selectedEntries.length && <View style={s.infoCard}><Text style={s.progressTitle}>{entryQuery ? 'No matching pairs' : 'Pairs not published yet'}</Text><Text style={s.small}>{entryQuery ? 'Try either player’s name.' : 'Entries appear here when the tournament draw is available.'}</Text></View>}
    </> : <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.drawTabs}>{['all', 'main', 'qualy', 'group', 'placement'].filter(value => value === 'all' || value === 'main' || categoryRows.some(row => row.draw === value)).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: draw === value }} onPress={() => { setDraw(value); setRound('all'); setDay('all'); }} style={[s.drawTab, draw === value && { borderBottomColor: b.accent }]}><Text style={{ color: draw === value ? b.accent : b.muted, fontSize: 12, fontWeight: '800' }}>{value === 'all' ? 'All draws' : value === 'main' ? 'Main draw' : value === 'qualy' ? 'Qualifying' : value === 'group' ? 'Groups' : 'Placement'}</Text></Pressable>)}</ScrollView>
      <NativeSegmentedControl label="Match status" value={status} onChange={value => setStatus(value as TournamentMatchStatus)} options={[{value: 'all', label: 'All'}, {value: 'live', label: `Live (${counts.live})`}, {value: 'upcoming', label: 'Up next'}, {value: 'results', label: 'Results'}]} />
      <ScrollView key={`${category}:${draw}`} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {[{ key: 'all', label: 'All rounds', days: [] as string[], count: categoryRows.filter(row => draw === 'all' || (row.draw || 'main') === draw).length }, ...rounds].map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: round === item.key }} onPress={() => setRound(item.key)} style={[s.roundTab, round === item.key && { backgroundColor: b.accent }]}><Text style={{ color: round === item.key ? '#FFFFFF' : b.premium, fontSize: 12, fontWeight: '800' }}>{item.label}</Text><Text style={{ color: round === item.key ? '#DDEBCF' : b.muted, fontSize: 10 }}>{item.days.length ? `${proDate(item.days[0])}${item.days.length > 1 ? ` – ${proDate(item.days[item.days.length - 1])}` : ''}` : `${item.count} matches`}</Text></Pressable>)}
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
    <View style={s.topBar}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={s.iconButton}><Ionicons name="arrow-back" size={22} color={b.premium} /></Pressable><Text style={s.topLabel}>Tournament centre</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh tournament" onPress={() => void load(true)} style={s.iconButton}>{loading ? <ActivityIndicator size="small" color={loadingBlue} /> : <Ionicons name="refresh-outline" size={20} color={b.accent} />}</Pressable><Pressable accessibilityRole="button" accessibilityLabel="Share tournament" onPress={() => void Share.share({ message: `${event?.name || 'Tournament'} on 4M Padel\n${siteUrl(`/pro/results?event=${id}`)}` }).then(result => { if (result.action === Share.sharedAction) void trackEvent('share', { content_type: 'tournament', method: 'native' }); }).catch(() => {})} style={s.iconButton}><Ionicons name="share-outline" size={21} color={b.premium} /></Pressable></View>
    <ErrorBanner message={error} top={60} />
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
    <FlatList<TournamentListItem> ref={list} onViewableItemsChanged={onVisibleMatches} viewabilityConfig={viewabilityConfig} extraData={[visibleMatches, visibleEntries]} data={tab === 'matches' ? displayed : tab === 'entries' ? selectedEntries.map(entry => ({ entry })) : []} keyExtractor={row => 'entry' in row ? `pair:${row.entry.key}` : `match:${row.match.id}`} ListHeaderComponent={header} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshControl={<RefreshControl colors={[loadingBlue]} refreshing={loading && !!event} onRefresh={() => void load(true)} tintColor={loadingBlue} />} contentContainerStyle={{ paddingBottom: 50 }} renderItem={({ item, index }) => 'entry' in item ? <View style={{ marginHorizontal: 20 }}>{(index === 0 || index === topSeedsCount) && <Text style={s.entryGroup}>{index === 0 && topSeedsCount > 0 ? 'Top seeds' : 'All pairs'}</Text>}<ProTournamentEntry entry={item.entry} photosEnabled={visibleEntries.has(item.entry.key)} onPress={() => openPair(item.entry)} /></View> : <View style={{ marginHorizontal: 20, marginBottom: 12 }}><TournamentMatchCard row={item} context={rows} photosEnabled={visibleMatches.has(item.match.id)} onPress={() => openMatch(item)} /></View>} />
  </SafeAreaView>;
}

const s = StyleSheet.create({
  entrySearch: { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, backgroundColor: b.panel, borderRadius: 10, gap: 8 },
  entryGroup: { color: b.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 10, marginBottom: 8 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: b.edge },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: b.elevated },
  topLabel: { flex: 1, color: b.premium, fontSize: 14, fontWeight: '600' },
  body: { padding: 16, gap: 12 }, artwork: { borderRadius: 20, overflow: 'hidden', backgroundColor: b.premium },
  artworkShade: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(10,25,16,0.12)' }, artworkBadges: { padding: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveBadge: { backgroundColor: '#FF354A', color: '#FFFFFF', fontSize: 10, letterSpacing: 1, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 },
  levelBadge: { backgroundColor: b.premium, color: b.padel, fontSize: 10, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 },
  title: { color: b.premium, fontSize: 21, lineHeight: 26, fontWeight: '600' }, subtitle: { color: b.muted, fontSize: 13, lineHeight: 20 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: b.edge, gap: 20 }, tab: { flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', alignItems: 'center', minHeight: 48, borderBottomWidth: 2, borderBottomColor: 'transparent' }, tabSelected: { borderBottomColor: b.accent }, tabText: { color: b.muted, fontSize: 14, fontWeight: '800' },
  gender: { flexDirection: 'row', backgroundColor: b.panel, borderRadius: 14, padding: 4 }, genderButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 11 }, genderSelected: { backgroundColor: b.accent }, genderText: { color: b.muted, fontWeight: '800', fontSize: 14 },
  drawTabs: { flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderBottomColor: b.edge }, drawTab: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  roundTab: { minWidth: 100, paddingHorizontal: 14, paddingVertical: 13, justifyContent: 'center', gap: 6, borderRadius: 8, backgroundColor: b.panel },
  filterBar: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: b.edge, paddingBottom: 3 }, filterButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, filterLabel: { color: b.muted, fontSize: 12, fontWeight: '600' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 12 }, progress: { padding: 17, backgroundColor: '#EAF0E5', borderRadius: 16, borderLeftWidth: 3, borderLeftColor: b.accent, flexDirection: 'row', gap: 10, alignItems: 'center' }, progressTitle: { color: b.premium, fontSize: 16, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: 8 }, stat: { flex: 1, paddingVertical: 17, alignItems: 'center', gap: 6, backgroundColor: b.elevated, borderRadius: 16, borderWidth: 1, borderColor: b.edge }, statValue: { color: b.accent, fontSize: 29, fontWeight: '800', fontVariant: ['tabular-nums'] }, statLabel: { color: b.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  browse: { backgroundColor: b.premium, padding: 19, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10 }, browseTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' }, browseSubtitle: { color: '#CDDACE', fontSize: 12 },
  sectionTitle: { color: b.premium, fontSize: 18, fontWeight: '600' }, infoCard: { backgroundColor: b.elevated, borderRadius: 18, borderWidth: 1, borderColor: b.edge, padding: 17, gap: 10 }, infoRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: b.edge }, eyebrow: { color: b.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, infoValue: { color: b.premium, fontSize: 14, lineHeight: 21, fontWeight: '600' }, small: { color: b.muted, fontSize: 11, lineHeight: 17 }, attribution: { color: b.muted, fontSize: 10 },
  matchCard: { backgroundColor: b.elevated, borderRadius: 18, borderWidth: 1, borderColor: b.edge, padding: 16, gap: 12 }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' }, matchStatus: { color: b.accent, fontWeight: '800', fontSize: 10, letterSpacing: 0.8 }, teamRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, player: { color: b.premium, fontSize: 14, fontWeight: '700', lineHeight: 20 }, seed: { color: b.accent, fontSize: 10, fontWeight: '800' }, setScore: { color: b.premium, fontWeight: '800', fontSize: 18, width: 22, textAlign: 'center', fontVariant: ['tabular-nums'] }, cardFoot: { borderTopWidth: 1, borderTopColor: b.edge, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' }, scheduleNote: { color: b.muted, fontSize: 10, lineHeight: 15 },
});
