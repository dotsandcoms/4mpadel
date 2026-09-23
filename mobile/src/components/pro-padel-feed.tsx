import { addToDeviceCalendar } from '@/lib/device-calendar';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { ProPadelState } from '@/hooks/use-pro-padel';
import { proDate, proRound, proStale, proStatus, selectProMatches, type ProTournament, type ProCategory, type ProFollow, type ProMatch, type ProPerson, type ProPlayer } from '@/lib/pro-padel';
import { brand } from '@/theme/tokens';

type Filter = ProCategory | 'all';
const followRow = (p: ProPlayer): ProFollow => ({ player_id: p.id, player_name: p.name, category: p.category });
const number = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('en-ZA');
const country = (code: string | null) => {
  try { return code ? new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) || code : ''; }
  catch { return code || ''; }
};

function Button({ label, onPress, icon, disabled = false }: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[s.button, disabled && { opacity: 0.45 }]}>
    {icon && <Ionicons name={icon} size={17} color={brand.padel} />}<Text style={s.buttonText}>{label}</Text>
  </Pressable>;
}

function NextTourCard({ event, message }: { event: ProTournament; message?: string }) {
  const [adding, setAdding] = useState(false);
  const date = new Date(event.startDate);
  const validDate = Number.isFinite(date.getTime());
  const datePart = (options: Intl.DateTimeFormatOptions) => validDate ? new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(date) : '—';
  const add = async () => {
    if (adding) return;
    setAdding(true);
    try { await addToDeviceCalendar({ title: event.name, startDate: event.startDate, endDate: event.endDate,
      location: [event.venue, event.location, event.country].filter(Boolean).join(' · ') }); }
    catch (error) { Alert.alert('Calendar unavailable', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setAdding(false); }
  };
  return <View style={s.tourHero}>
    <View style={s.tourEyebrow}>
      {!!event.level && <Text style={s.tourLevel}>{event.level.toUpperCase()}</Text>}
      <Text style={s.tourKicker}>NEXT STOP ON TOUR</Text>
    </View>
    <View style={s.tourMain}>
      <View style={{ flex: 1, gap: 12 }}>
        <Text accessibilityRole="header" style={s.tourTitle}>{event.name}</Text>
        {!!event.location && <View style={s.tourMeta}><Ionicons name="location-outline" size={15} color="#b7c4b0" /><Text style={s.tourLocation}>{event.location}</Text></View>}
      </View>
      <View style={s.tourDate} accessible accessibilityLabel={proDate(event.startDate)}>
        <Text style={s.tourMonth}>{datePart({ month: 'short' }).toUpperCase()}</Text>
        <Text style={s.tourDay} maxFontSizeMultiplier={1.3}>{datePart({ day: '2-digit' })}</Text>
        <Text style={s.tourYear}>{datePart({ year: 'numeric' })}</Text>
      </View>
    </View>
    <View style={s.tourMeta}><Ionicons name="calendar-outline" size={16} color="#b7c4b0" /><Text style={s.tourLocation}>{proDate(event.startDate)} – {proDate(event.endDate)}</Text></View>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: adding }} disabled={adding} onPress={() => void add()} style={[s.tourCalendar, adding && { opacity: 0.65 }]}>
      <Ionicons name="calendar-outline" size={19} color="#17200c" /><Text style={s.tourCalendarText}>{adding ? 'Opening calendar…' : 'Add to my calendar'}</Text>
    </Pressable>
    {!!message && <Text style={s.tourNote}>{message}</Text>}
  </View>;
}

function MatchSectionToggle({ title, count, expanded, onPress }: { title: string; count: number; expanded: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${title}, ${count} matches`} onPress={onPress} style={s.matchToggle}>
    <View style={{ flex: 1, gap: 4 }}><Text style={s.matchToggleTitle}>{title}</Text><Text style={s.caption}>{expanded ? 'Tap to hide matches' : 'Tap to show matches'}</Text></View>
    <View style={s.matchCount}><Text style={{ color: brand.padel, fontSize: 12, fontWeight: '700' }}>{count}</Text></View>
    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={brand.muted} />
  </Pressable>;
}

function Portrait({ player, size = 48 }: { player: ProPerson & { photoUrl?: string | null }; size?: number }) {
  const [failed, setFailed] = useState(false);
  return <View style={[s.portrait, { width: size, height: size, borderRadius: size > 80 ? 18 : 10 }]}>
    {player.photoUrl && !failed ? <Image source={{ uri: player.photoUrl }} recyclingKey={String(player.id)} onError={() => setFailed(true)} contentFit="cover" contentPosition="top" style={{ width: size, height: size }} />
      : <Text style={[s.initials, { fontSize: size > 80 ? 32 : 16 }]}>{player.name.split(' ').slice(0, 2).map(n => n[0]).join('')}</Text>}
  </View>;
}

function Message({ title, body, retry }: { title?: string; body: string; retry?: () => void }) {
  return <View style={s.message}>{title && <Text style={s.cardTitle}>{title}</Text>}<Text style={s.body}>{body}</Text>{retry && <Button label="Retry" icon="refresh" onPress={retry} />}</View>;
}

function Updated({ date, coverage }: { date: string; coverage?: string }) {
  return <View style={{ gap: 5 }}><Text style={s.caption}>{coverage ? `${coverage}. ` : ''}Updated {proDate(date)} · Daily updates</Text>
    {proStale(date) && <Text style={s.warning}>This update is over two days old. Details may have changed.</Text>}</View>;
}

export function MatchCard({ match, lookup, onPlayer }: { match: ProMatch; lookup: Map<number, ProPlayer>; onPlayer: (id: number) => void }) {
  const upcoming = match.status === 'scheduled';
  return <View style={s.match}>
    <View style={s.matchHeader}>
      <Text style={[s.matchKicker, { flex: 1 }]}>{match.category === 'women' ? 'WOMEN' : 'MEN'} · {proRound(match).toUpperCase()}</Text>
      {!upcoming && <Text style={s.caption}>{proDate(match.playedAt)}</Text>}
    </View>
    <Text style={s.matchTitle}>{match.tournamentName}</Text>
    {upcoming && <Text style={[s.body, { marginTop: 8, marginBottom: 6 }]}>{proDate(match.scheduledAt, true)}</Text>}
    {upcoming && <Text style={[s.caption, { marginBottom: 12 }]}>{/estimated/i.test(match.scheduleLabel || '') ? 'Estimated start · subject to change' : /not before/i.test(match.scheduleLabel || '') ? 'Not before · play may start later' : 'Start time subject to confirmation'}</Text>}
    {!upcoming && <View style={s.scoreHead} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={[s.tableLabel, { flex: 1, textAlign: 'left', paddingLeft: 10 }]}>PAIRS</Text>
      <View style={s.scores}>{match.score.map((_, i) => <Text key={i} style={[s.tableLabel, s.scoreColumn]}>S{i + 1}</Text>)}</View>
    </View>}
    {match.teams.map((team, index) => {
      const winner = !upcoming && match.winner === `team_${index + 1}`;
      return <View key={index} style={[s.team, index === 1 && s.teamBorder]}>
        <View style={[s.pair, winner && s.winningPair]}>
          {team.length ? team.map(person => {
            const player = lookup.get(person.id);
            return <Pressable key={person.id} disabled={!player} onPress={() => onPlayer(person.id)} accessibilityRole={player ? 'button' : undefined}
              accessibilityLabel={player ? `View ${person.name}` : person.name} style={s.matchPerson}>
              <Portrait key={person.id} player={player || person} size={30} /><Text style={s.matchName}>{person.name}</Text>
            </Pressable>;
          }) : <Text style={s.body}>Opponents TBC</Text>}
        </View>
        {!upcoming && <View style={s.scores} accessible accessibilityLabel={`${team.map(p => p.name).join(' and ')}${winner ? ', winning pair' : ''}, set scores ${match.score.map(set => set[index] ?? 'unavailable').join(', ')}`}>
          {match.score.map((set, i) => {
            const value = String(set[index] ?? '—');
            const parts = /^(\d+)(\(\d+\))$/.exec(value);
            return <View key={i} style={s.scoreColumn}><Text style={[s.score, winner && { color: brand.padel }]}>{parts ? parts[1] : value}{parts && <Text style={s.tieBreak}>{parts[2]}</Text>}</Text></View>;
          })}
        </View>}
      </View>;
    })}
    <View style={s.matchFooter}><View style={s.resultStatus}><Ionicons name={upcoming ? 'time-outline' : match.status === 'finished' ? 'checkmark-circle' : 'information-circle-outline'} size={13} color={!upcoming && match.status === 'finished' ? brand.padel : brand.muted} /><Text style={s.caption}>{upcoming ? match.court || 'Court TBC' : proStatus(match)}</Text></View>
      <Text style={s.caption}>{upcoming ? 'Saved schedule' : 'Premier Padel'}</Text></View>
  </View>;
}

export function ProPadelFeed({ state }: { state: ProPadelState }) {
  const router = useRouter();
  const [view, setView] = useState<'for-you' | 'tour'>('for-you');
  const [filter, setFilter] = useState<Filter>('all');
  const [count, setCount] = useState(6);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [fixturesOpen, setFixturesOpen] = useState(false);
  const [directory, setDirectory] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [directoryFilter, setDirectoryFilter] = useState<Filter>('all');
  const [onlyFollowing, setOnlyFollowing] = useState(false);
  const players = useMemo(() => {
    const categories = state.rankings.data?.categories;
    return categories ? [...categories.men.players, ...categories.women.players].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)) : [];
  }, [state.rankings.data]);
  const lookup = useMemo(() => new Map(players.map(p => [p.id, p])), [players]);
  const ids = state.follows.map(p => p.player_id);
  const selected = selectedId == null ? null : lookup.get(selectedId);
  const personal = view === 'for-you';
  const ready = !personal || (!!state.userId && !state.followsLoading && !state.followsError && ids.length > 0);
  const results = selectProMatches(state.tour.data?.matches || [], personal ? ids : null, filter);
  const upcoming = selectProMatches(state.fixtures.data?.matches || [], personal ? ids : null, filter, true);
  const rail = players.filter(p => (filter === 'all' || p.category === filter) && (!personal || ids.includes(p.id)));
  const suggestions = players.filter(p => filter === 'all' || p.category === filter).slice(0, 8);
  const visiblePlayers = rail.length ? rail.slice(0, 12) : suggestions;
  const moves = rail.filter(p => Number.isFinite(p.rankChange) && p.rankChange !== 0 || Number.isFinite(p.pointsChange) && p.pointsChange !== 0).slice(0, 4);
  const directoryPlayers = players.filter(p => (directoryFilter === 'all' || p.category === directoryFilter) &&
    (!onlyFollowing || ids.includes(p.id)) && `${p.name} ${country(p.nationality)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const outsideEdition = state.follows.filter(p => !lookup.has(p.player_id));

  function openDirectory() { setSelectedId(null); setDirectory(true); }
  function followControl(player: ProPlayer | ProFollow) {
    const row = 'player_id' in player ? player : followRow(player);
    const followed = ids.includes(row.player_id);
    return <Button label={state.pendingId === row.player_id ? 'Saving…' : followed ? 'Following' : 'Follow'} icon={followed ? 'heart' : 'heart-outline'}
      disabled={state.followsLoading || !!state.followsError || state.pendingId !== null}
      onPress={() => { if (!state.userId) { setDirectory(false); setSelectedId(null); router.push('/(auth)/sign-in'); } else void state.toggleFollow(row); }} />;
  }
  const retry = () => { void state.refresh(); };
  const selectedMatches = selected ? selectProMatches(state.tour.data?.matches || [], [selected.id]) : [];
  const selectedFixtures = selected ? selectProMatches(state.fixtures.data?.matches || [], [selected.id], 'all', true) : [];

  return <View style={s.feed}>
    <View style={s.heading}><View style={{ flex: 1 }}><Text style={s.eyebrow}>THE PROFESSIONAL GAME</Text><Text accessibilityRole="header" style={s.title}>Pro Padel</Text></View>
      <Button label="Players" icon="people-outline" onPress={openDirectory} />
    </View>
    <Text style={s.body}>Your front row to the tour.</Text>
    <View style={s.tabs}>{(['for-you', 'tour'] as const).map(v => <Pressable key={v} accessibilityRole="tab" accessibilityState={{ selected: view === v }}
      onPress={() => { setView(v); setCount(6); }} style={[s.tab, view === v && s.activeTab]}><Text style={[s.tabLabel, view === v && { color: brand.page }]}>{v === 'for-you' ? 'For you' : 'Tour'}</Text></Pressable>)}</View>
    <View style={s.filters}>{(['all', 'men', 'women'] as const).map(v => <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: filter === v }}
      onPress={() => { setFilter(v); setCount(6); }} style={[s.filter, filter === v && s.activeFilter]}><Text style={[s.caption, filter === v && { color: brand.premium }]}>{v === 'all' ? 'All' : v === 'men' ? 'Men' : 'Women'}</Text></Pressable>)}</View>

    {state.loading && !state.rankings.data && !state.tour.data && <View style={s.loading}><ActivityIndicator color={brand.padel} /><Text style={s.body}>Loading the tour…</Text></View>}
    {state.writeError && <Text accessibilityRole="alert" style={s.warning}>{state.writeError}</Text>}
    {state.rankings.error && <Message body={state.rankings.error} retry={retry} />}
    {personal && state.followsLoading ? <View style={s.loading}><ActivityIndicator color={brand.padel} /><Text style={s.body}>Loading your players…</Text></View>
      : personal && state.followsError ? <Message body={state.followsError} retry={() => { void state.refreshFollows(); }} />
      : personal && !state.userId ? <View style={s.message}><Text style={s.cardTitle}>Make the tour your own</Text><Text style={s.body}>Sign in to follow players and see their results here.</Text><Button label="Sign in" onPress={() => router.push('/(auth)/sign-in')} /></View>
      : personal && !ids.length ? <View style={s.message}><Text style={s.cardTitle}>Who’s your first pick?</Text><Text style={s.body}>Follow your favourite players for their results, ranking updates and published fixtures.</Text><Button label="Find players" icon="add" onPress={openDirectory} /></View> : null}

    {visiblePlayers.length > 0 && <>
      <View style={s.sectionHeading}><Text style={s.sectionTitle}>{personal && rail.length ? 'Your players' : 'Players to follow'}</Text><Text style={s.caption}>Men & women</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.playerRail}>
        {visiblePlayers.map(player => <View key={player.id} style={s.playerCard}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${player.name}, world number ${player.rank}`} onPress={() => setSelectedId(player.id)}>
            <Portrait key={player.id} player={player} size={128} /><Text numberOfLines={2} style={s.playerName}>{player.name}</Text><Text style={s.caption}>World #{player.rank} · {player.category === 'men' ? 'Men' : 'Women'}</Text>
          </Pressable>{followControl(player)}
        </View>)}
      </ScrollView>
    </>}
    {ready && <>
      <Text style={s.sectionTitle}>Up next</Text>
      {state.fixtures.error && <Message body={state.fixtures.error} retry={retry} />}
      {state.fixtures.data && <>
        <Updated date={state.fixtures.data.updatedAt} />
        {state.fixtures.data.tournament && <NextTourCard event={state.fixtures.data.tournament}
          message={!state.fixtures.data.drawPublished ? 'Draw coming soon · Player appearances will show once confirmed.' : undefined} />}
        {upcoming.length ? <>
          <MatchSectionToggle title="Upcoming matches" count={upcoming.length} expanded={fixturesOpen} onPress={() => setFixturesOpen(value => !value)} />
          {fixturesOpen && upcoming.map(m => <MatchCard key={m.id} match={m} lookup={lookup} onPlayer={setSelectedId} />)}
          </>
          : !state.fixtures.data.tournament ? <Message title="The next stop is on its way" body="No upcoming event is listed yet. Check back after the next tour update." />
            : state.fixtures.data.drawPublished ? <Text style={s.caption}>{personal ? 'No published fixtures for your players in this selection.' : 'No published fixtures in this selection.'}</Text> : null}
      </>}
      {moves.length > 0 && <><Text style={s.sectionTitle}>Ranking updates</Text>
        {state.rankings.data && <Updated date={state.rankings.data.updatedAt} coverage="Changes since each player’s previous official ranking entry" />}
        <View style={s.movementList}>{moves.map(p => <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`View ${p.name}`} onPress={() => setSelectedId(p.id)} style={s.movement}>
          <Portrait key={p.id} player={p} size={40} /><View style={{ flex: 1, gap: 4 }}><Text style={s.personName}>{p.name}</Text><Text style={s.caption}>World #{p.rank} · {proDate(p.rankingDate)}</Text></View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>{p.rankChange != null && <Text style={[s.movementValue, { color: p.rankChange > 0 ? brand.padel : brand.muted }]}>{p.rankChange > 0 ? '↑' : p.rankChange < 0 ? '↓' : '—'} {p.rankChange ? Math.abs(p.rankChange) : ''}</Text>}
            {p.pointsChange != null && <Text style={s.caption}>{p.pointsChange > 0 ? '+' : ''}{number(p.pointsChange)} pts</Text>}</View>
        </Pressable>)}</View></>}
      <MatchSectionToggle title="Latest Pro Tour results" count={results.length} expanded={resultsOpen} onPress={() => { setResultsOpen(value => !value); setCount(6); }} />
      {state.tour.error && <Message body={state.tour.error} retry={retry} />}
      {state.tour.data && <><Updated date={state.tour.data.updatedAt} coverage={state.tour.data.coverage} />
        {resultsOpen && (results.length ? results.slice(0, count).map(m => <MatchCard key={m.id} match={m} lookup={lookup} onPlayer={setSelectedId} />)
          : <Message title="No results in this selection" body={personal ? 'Your players are saved. Their results will appear when included in a tour update.' : 'Check another category or come back after the next update.'} />)}
        {resultsOpen && results.length > count && <Button label={`Show more results (${results.length - count})`} onPress={() => setCount(n => n + 6)} />}
      </>}
    </>}
    <Button label="View tour calendar" icon="calendar-outline" onPress={() => router.push({ pathname: '/calendar', params: { circuit: 'pro' } })} />
    <Text style={s.caption}>Padel API · Published results and schedules. Live scores and match alerts are not available yet.</Text>

    <Modal visible={directory || selectedId !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (selectedId !== null && directory) setSelectedId(null); else { setSelectedId(null); setDirectory(false); } }}>
      {/* Native modals need their own safe-area measurements, outside the tab screen. */}
      <SafeAreaProvider style={s.modal}>
      <SafeAreaView style={s.modal} edges={['top', 'bottom', 'left', 'right']}>
        <View style={s.modalHeader}>
          <Button label={selectedId !== null && directory ? 'Players' : 'Close'} icon="chevron-back" onPress={() => { if (selectedId !== null && directory) setSelectedId(null); else { setSelectedId(null); setDirectory(false); } }} />
          <Text style={s.eyebrow}>4M / PRO PADEL</Text>
        </View>
        {state.writeError && <Text accessibilityRole="alert" style={[s.warning, { paddingHorizontal: 20 }]}>{state.writeError}</Text>}
        {state.followsError && <View style={{ paddingHorizontal: 20 }}><Message body={state.followsError} retry={() => { void state.refreshFollows(); }} /></View>}
        {selected ? <ScrollView key={selected.id} contentContainerStyle={s.detail}>
          <View style={s.profileTop}><Portrait key={selected.id} player={selected} size={112} /><View style={{ flex: 1, gap: 8 }}>
            <Text style={s.eyebrow}>{selected.category === 'men' ? 'MEN’S TOUR' : 'WOMEN’S TOUR'}</Text><Text accessibilityRole="header" style={s.profileName}>{selected.name}</Text><Text style={s.body}>{country(selected.nationality)}</Text>{followControl(selected)}
          </View></View>
          <View style={s.stats}><View style={{ flex: 1 }}><Text style={s.stat}>#{selected.rank}</Text><Text style={s.caption}>World ranking</Text></View><View style={{ flex: 1 }}><Text style={s.stat}>{number(selected.points)}</Text><Text style={s.caption}>Ranking points</Text></View></View>
          <Text style={s.body}>{[selected.side && `${selected.side === 'drive' ? 'Right' : 'Left'} side`, selected.hand && `${selected.hand}-handed`, selected.height && `${selected.height} cm`].filter(Boolean).join(' · ') || 'More player details are not available yet.'}</Text>
          <Text style={s.caption}>Ranking edition: {proDate(selected.rankingDate)}</Text>
          <Text style={s.sectionTitle}>Published fixtures</Text>
          {state.fixtures.error && <Message body={state.fixtures.error} retry={retry} />}
          {state.fixtures.data && <Updated date={state.fixtures.data.updatedAt} />}
          {selectedFixtures.length ? selectedFixtures.map(m => <MatchCard key={m.id} match={m} lookup={lookup} onPlayer={setSelectedId} />) : state.fixtures.data ? <Text style={s.body}>{state.fixtures.data.drawPublished ? 'No upcoming match is listed for this player.' : 'The next draw has not been published yet.'}</Text> : null}
          <Text style={s.sectionTitle}>Recent results</Text>
          {state.tour.error && <Message body={state.tour.error} retry={retry} />}
          {state.tour.data && <Updated date={state.tour.data.updatedAt} coverage={state.tour.data.coverage} />}
          {selectedMatches.map(m => <MatchCard key={m.id} match={m} lookup={lookup} onPlayer={setSelectedId} />)}
          {!selectedMatches.length && state.tour.data && <Text style={s.body}>No results for this player in the covered rounds.</Text>}
        </ScrollView> : selectedId !== null ? <Message title="Player unavailable" body="This player is no longer in the current ranking edition." /> : <>
          <View style={s.directoryHeader}><Text accessibilityRole="header" style={s.title}>Find your players</Text><Text style={s.body}>Current top {state.rankings.data?.limit || 50} men and women. Follows sync with your 4M account.</Text>
            <TextInput accessibilityLabel="Search professional players" placeholder="Search name or country" placeholderTextColor={brand.placeholder} value={query} onChangeText={setQuery} autoCorrect={false} style={s.search} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(['all', 'men', 'women'] as const).map(c => <Button key={c} label={c === 'all' ? 'All' : c === 'men' ? 'Men' : 'Women'} icon={directoryFilter === c ? 'checkmark' : undefined} onPress={() => setDirectoryFilter(c)} />)}
              <Button label="Following" icon={onlyFollowing ? 'heart' : 'heart-outline'} onPress={() => setOnlyFollowing(v => !v)} />
            </ScrollView>
            {state.rankings.error && <Message body={state.rankings.error} retry={retry} />}
          </View>
          <FlatList data={directoryPlayers} keyExtractor={p => String(p.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            ListEmptyComponent={<Message body={state.loading ? 'Loading players…' : onlyFollowing ? 'No followed players match this selection.' : 'No players match this search.'} />}
            renderItem={({ item }) => <View style={s.directoryRow}><Pressable accessibilityRole="button" accessibilityLabel={`View ${item.name}`} style={s.directoryPerson} onPress={() => setSelectedId(item.id)}>
              <Portrait key={item.id} player={item} /><View style={{ flex: 1, gap: 5 }}><Text style={s.personName}>{item.name}</Text><Text style={s.caption}>#{item.rank} · {country(item.nationality)} · {item.category === 'men' ? 'Men' : 'Women'}</Text></View>
            </Pressable>{followControl(item)}</View>}
            ListFooterComponent={onlyFollowing && !query.trim() && outsideEdition.length ? <View style={{ gap: 12, marginTop: 16 }}><Text style={s.caption}>Outside the current ranking edition</Text>{outsideEdition.filter(p => directoryFilter === 'all' || p.category === directoryFilter).map(p => <View key={p.player_id} style={s.directoryRow}><Text style={[s.personName, { flex: 1 }]}>{p.player_name}</Text>{followControl(p)}</View>)}</View> : null}
          />
        </>}
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  feed: { marginTop: 28, marginBottom: 20, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: brand.muted },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: brand.premium, marginTop: 4, letterSpacing: -0.8 },
  body: { fontSize: 14, lineHeight: 21, color: brand.muted },
  caption: { fontSize: 11, lineHeight: 17, color: brand.muted },
  warning: { color: brand.danger, fontSize: 13, lineHeight: 20 },
  button: { minHeight: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: brand.glass },
  buttonText: { color: brand.padel, fontSize: 12, fontWeight: '700' },
  tabs: { backgroundColor: brand.elevated, borderRadius: 12, padding: 4, flexDirection: 'row', gap: 4 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  activeTab: { backgroundColor: brand.padel },
  tabLabel: { color: brand.muted, fontSize: 14, fontWeight: '700' },
  filters: { flexDirection: 'row', gap: 8 },
  filter: { minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: brand.edge },
  activeFilter: { backgroundColor: brand.panel, borderColor: brand.muted },
  loading: { flexDirection: 'row', gap: 12, paddingVertical: 20, alignItems: 'center' },
  message: { padding: 18, borderRadius: 14, backgroundColor: brand.elevated, gap: 10 },
  cardTitle: { color: brand.premium, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionTitle: { color: brand.premium, fontWeight: '700', fontSize: 18, marginTop: 10 },
  playerRail: { gap: 12, paddingBottom: 4 },
  playerCard: { width: 148, padding: 10, backgroundColor: brand.elevated, borderRadius: 16, gap: 10 },
  portrait: { backgroundColor: '#24282b', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { color: brand.muted, fontWeight: '700' },
  playerName: { color: brand.premium, fontSize: 14, lineHeight: 19, fontWeight: '700', minHeight: 38, marginTop: 10, marginBottom: 4 },
  tourHero: { backgroundColor: '#1e2b1c', borderWidth: 1, borderColor: '#536b30', borderRadius: 22, padding: 20, gap: 18 },
  tourEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tourLevel: { color: brand.padel, borderWidth: 1, borderColor: brand.padel, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, fontWeight: '800' },
  tourKicker: { color: brand.padel, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  tourMain: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  tourTitle: { color: '#f4f7ef', fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -0.7 },
  tourDate: { width: 84, paddingVertical: 12, alignItems: 'center', borderRadius: 12, backgroundColor: '#2b3e21', borderWidth: 1, borderColor: '#415830' },
  tourMonth: { color: '#cfdeb8', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  tourDay: { color: '#dff5c7', fontSize: 48, lineHeight: 55, fontWeight: '800', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  tourYear: { color: '#a9bc99', fontSize: 10, letterSpacing: 1 },
  tourMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tourLocation: { color: '#c0ccb8', fontSize: 13, lineHeight: 19, flexShrink: 1 },
  tourCalendar: { minHeight: 48, backgroundColor: brand.padel, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  tourCalendarText: { color: '#17200c', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  tourNote: { color: '#b1c0a7', fontSize: 12, lineHeight: 18, borderTopWidth: 1, borderTopColor: '#3b4e30', paddingTop: 14 },
  matchToggle: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: brand.edge, marginTop: 8 },
  matchToggleTitle: { color: brand.premium, fontSize: 18, fontWeight: '600' },
  matchCount: { backgroundColor: '#ccff0014', borderRadius: 12, minWidth: 28, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center' },
  match: { padding: 16, backgroundColor: brand.elevated, borderRadius: 18, borderWidth: 1, borderColor: brand.edge },
  matchHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  matchKicker: { fontSize: 10, lineHeight: 15, fontWeight: '700', letterSpacing: 1, color: brand.muted },
  matchTitle: { fontSize: 17, lineHeight: 23, color: brand.premium, fontWeight: '700', letterSpacing: -0.3 },
  scoreHead: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: brand.edge },
  tableLabel: { color: brand.faint, fontSize: 9, lineHeight: 14, letterSpacing: 1, fontWeight: '600', textAlign: 'center' },
  team: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  teamBorder: { borderTopWidth: 1, borderTopColor: brand.edge },
  pair: { flex: 1, gap: 0, borderLeftWidth: 2, borderLeftColor: 'transparent', paddingLeft: 8 },
  winningPair: { borderLeftColor: brand.padel },
  matchPerson: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  matchName: { flex: 1, color: brand.premium, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  personName: { color: brand.premium, fontSize: 13, lineHeight: 19, fontWeight: '600', flexShrink: 1 },
  scores: { flexDirection: 'row', gap: 2, flexShrink: 0, alignItems: 'center' },
  scoreColumn: { width: 32, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  score: { color: brand.muted, fontSize: 19, lineHeight: 26, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  tieBreak: { fontSize: 10, fontWeight: '500' },
  resultStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  matchFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: brand.edge },
  movementList: { paddingHorizontal: 14, borderRadius: 14, backgroundColor: brand.elevated },
  movement: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12, minHeight: 64 },
  movementValue: { fontSize: 16, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: brand.page },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  directoryHeader: { padding: 20, paddingTop: 8, gap: 14 },
  search: { minHeight: 48, color: brand.premium, borderWidth: 1, borderColor: brand.edge, backgroundColor: brand.elevated, paddingHorizontal: 14, borderRadius: 12, fontSize: 15 },
  directoryRow: { flexDirection: 'row', gap: 8, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: brand.edge, paddingVertical: 12 },
  directoryPerson: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  detail: { padding: 20, gap: 16, paddingBottom: 40 },
  profileTop: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  profileName: { color: brand.premium, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  stats: { flexDirection: 'row', padding: 20, backgroundColor: brand.elevated, borderRadius: 16, gap: 12 },
  stat: { color: brand.padel, fontSize: 28, fontWeight: '800', marginBottom: 4, fontVariant: ['tabular-nums'] },
});
