import { FollowedLocalMatches } from '@/components/followed-local-matches';
import { addToDeviceCalendar } from '@/lib/device-calendar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { usePlayerHub } from '@/hooks/use-player-hub';
import { homePlayerSelection, playerCountryFlag, playerRankLabel, proHubPlayer, type HubPlayer } from '@/lib/player-hub';
import type { ProPadelState } from '@/hooks/use-pro-padel';
import { proDate, proRound, proStale, proStatus, selectProMatches, type ProTournament, type ProCategory, type ProFollow, type ProMatch, type ProPerson, type ProPlayer, type ProRankings } from '@/lib/pro-padel';
import { fetchTournamentMatches, withLiveScores, type MatchDetails } from '@/lib/pro-padel-live';
import { lightBrand as brand } from '@/theme/tokens';

type Filter = ProCategory | 'all';
const followRow = (p: ProPlayer): ProFollow => ({ player_id: p.id, player_name: p.name, category: p.category });
const number = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('en-ZA');
const country = (code: string | null) => {
  try { return code ? new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) || code : ''; }
  catch { return code || ''; }
};

function Button({ label, onPress, icon, disabled = false, local = false }: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean; local?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[s.button, local && { backgroundColor: '#EAF0FF' }, disabled && { opacity: 0.45 }]}>
    {icon && <Ionicons name={icon} size={17} color={local ? '#2449D8' : brand.accent} />}<Text style={[s.buttonText, local && { color: '#2449D8' }]}>{label}</Text>
  </Pressable>;
}

function NextTourCard({ event, local = false, onOpen }: { event: ProTournament; local?: boolean; onOpen?: () => void }) {
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
  return <View style={[s.tourHero, local && { backgroundColor: '#EAF0FF', borderColor: '#2449D830' }]}>
    <View style={s.tourEyebrow}>
      {!!event.level && <Text style={[s.tourLevel, local && { color: '#2449D8', borderColor: '#2449D8' }]}>{event.level.toUpperCase()}</Text>}
      <Text style={[s.tourKicker, local && { color: '#2449D8' }]}>{local ? 'NEXT IN 4M' : 'NEXT STOP ON TOUR'}</Text>
    </View>
    <Pressable disabled={!onOpen} accessibilityRole={onOpen ? "button" : undefined} accessibilityLabel={onOpen ? `View ${event.name}` : undefined} onPress={onOpen} style={s.tourMain}>
      <View style={{ flex: 1, gap: 12 }}>
        <Text accessibilityRole="header" numberOfLines={3} ellipsizeMode="tail" style={s.tourTitle}>{playerCountryFlag(event.country)}{event.country ? ' ' : ''}{event.name}</Text>
        <View style={s.tourMeta}><Ionicons name="location-outline" size={15} color="#52625A" /><Text numberOfLines={1} style={s.tourLocation}>{event.location || event.venue || 'Location to be announced'}</Text></View>
      </View>
      <View style={[s.tourDate, local && { borderColor: '#2449D830' }]} accessible accessibilityLabel={proDate(event.startDate)}>
        <Text style={s.tourMonth}>{datePart({ month: 'short' }).toUpperCase()}</Text>
        <Text style={[s.tourDay, local && { color: '#2449D8' }]} maxFontSizeMultiplier={1.3}>{datePart({ day: '2-digit' })}</Text>
        <Text style={s.tourYear}>{datePart({ year: 'numeric' })}</Text>
      </View>
    </Pressable>
    <View style={s.tourMeta}><Ionicons name="calendar-outline" size={16} color="#52625A" /><Text style={s.tourLocation}>{proDate(event.startDate)} – {proDate(event.endDate)}</Text></View>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: adding }} disabled={adding} onPress={() => void add()} style={[s.tourCalendar, local && { backgroundColor: '#2449D8' }, adding && { opacity: 0.65 }]}>
      <Ionicons name="calendar-outline" size={19} color={local ? '#FFFFFF' : '#17200c'} /><Text style={[s.tourCalendarText, local && { color: '#FFFFFF' }]}>{adding ? 'Opening calendar…' : 'Add to my calendar'}</Text>
    </Pressable>
  </View>;
}

function matchDay(value?: string | null) {
  if (!value) return null;
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
    : null;
}

async function fetchTourPreview(id: number) {
  const first = await fetchTournamentMatches(id, 1);
  const pages = await Promise.allSettled(Array.from({ length: Math.min(first.lastPage, 4) - 1 }, (_, index) => fetchTournamentMatches(id, index + 2)));
  const rows = [...first.matches, ...pages.flatMap(result => result.status === 'fulfilled' ? result.value.matches : [])];
  return { rows: await withLiveScores([...new Map(rows.map(row => [row.match.id, row])).values()]),
    complete: first.lastPage <= 4 && pages.every(result => result.status === 'fulfilled') };
}

function LiveTourCard({ event, matchesToday, liveCount, onOpen }: { event: ProTournament; matchesToday: number | null; liveCount: number; onOpen: () => void }) {
  return <View style={s.liveTourCard}>
    {event.photoUrl && <Image source={{ uri: event.photoUrl }} contentFit="cover" style={s.liveArtwork} />}
    <View style={s.liveTourContent}>
      <View style={s.liveBadges}><Text style={s.liveBadge}>● LIVE</Text>{event.level && <Text style={s.liveLevel}>{event.level.toUpperCase()}</Text>}</View>
      <View style={{ flex: 1 }} />
      <Text accessibilityRole="header" numberOfLines={3} style={s.liveTourTitle}>{playerCountryFlag(event.country)}{event.country ? ' ' : ''}{event.name}</Text>
      <Text numberOfLines={1} style={s.liveTourPlace}>{event.location || event.venue || 'Location to be announced'}</Text>
      <Text style={s.liveTourCount}>{matchesToday != null ? `${matchesToday} match${matchesToday === 1 ? '' : 'es'} today` : liveCount ? `${liveCount} match${liveCount === 1 ? '' : 'es'} live now` : 'Main draw in progress'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${event.name} matches`} onPress={onOpen} style={s.liveTourAction}><Text style={s.liveTourActionText}>VIEW MATCHES</Text><Ionicons name="arrow-forward" size={18} color="#17200C" /></Pressable>
    </View>
  </View>;
}

function TourMatchPreview({ row, onOpen }: { row: MatchDetails; onOpen: () => void }) {
  const match = row.match;
  const live = match.status === 'live' || match.status === 'ongoing';
  const time = match.scheduleLabel || (match.scheduledAt && /(Z|[+-]\d{2}:\d{2})$/i.test(match.scheduledAt) ? proDate(match.scheduledAt, true) : 'Time to be confirmed');
  const scores = match.score.length ? match.score : row.liveScore?.sets || [];
  return <Pressable accessibilityRole="button" accessibilityLabel={`${live ? 'Live' : 'Upcoming'} ${match.tournamentName} match: ${match.teams.map(team => team.map(person => person.name).join(' and ')).join(' versus ')}`} onPress={onOpen} style={s.liveMatchCard}>
    <View style={s.liveMatchHeader}><Text style={live ? s.liveMatchStatus : s.nextMatchStatus}>{live ? '● LIVE' : 'UP NEXT'}</Text><Text numberOfLines={1} style={s.liveMatchCourt}>{match.court || (live ? proRound(match) : time)}</Text><Ionicons name="chevron-forward" size={16} color="#D5E4D8" /></View>
    {match.teams.map((team, index) => <View key={index} style={s.liveMatchTeam}>
      <Text numberOfLines={2} style={s.liveMatchNames}>{team.length ? team.map(person => `${playerCountryFlag(person.nationality)}${person.nationality ? ' ' : ''}${person.name}`).join(' / ') : 'Players to be confirmed'}</Text>
      {live && scores.length > 0 && <Text style={s.liveMatchScore}>{scores.slice(0, 3).map(set => set[index] ?? '—').join('   ')}</Text>}
    </View>)}
    {live && row.liveScore?.points && <Text style={s.liveMatchTime}>Current point {row.liveScore.points}{row.liveScore.serving ? ` · ${row.liveScore.serving === 'team_1' ? 'Top team' : 'Bottom team'} serving` : ''}</Text>}
    {!live && <Text style={s.liveMatchTime}>{time}</Text>}
  </Pressable>;
}

type LocalUpcomingEvent = { id: number; event_name: string | null; start_date: string; end_date: string | null; city: string | null; venue: string | null; event_status: string | null };
function IntegratedUpNext({ tournament, showLocal, message }: { tournament?: ProTournament | null; showLocal: boolean; message?: string }) {
  const router = useRouter();
  const [events, setEvents] = useState<LocalUpcomingEvent[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const liveTour = tournament?.status === 'live' || tournament?.status === 'ongoing' ? tournament : null;
  const [tourPreview, setTourPreview] = useState<{ id: number; rows: MatchDetails[]; complete: boolean } | null>(null);
  const [tourPreviewError, setTourPreviewError] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!liveTour) { setTourPreview(null); setTourPreviewError(false); return; }
    setTourPreviewError(false);
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await fetchTourPreview(liveTour.id);
        if (active) { setTourPreview({ id: liveTour.id, ...next }); setTourPreviewError(false); }
      } catch { if (active) setTourPreviewError(true); }
      finally { inFlight = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [liveTour?.id]));
  useFocusEffect(useCallback(() => {
    if (!showLocal) return;
    let active = true;
    setLoading(true); setError('');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    void (async () => {
      try {
        const { data, error: failure } = await supabase.from('calendar')
          .select('id,event_name,start_date,end_date,city,venue,event_status')
          .neq('is_visible', false).or('sanction_status.eq.approved,sanction_status.is.null')
          .or(`end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`)
          .or('event_status.is.null,event_status.not.in.(cancelled,canceled)')
          .order('start_date', { ascending: true }).order('id', { ascending: true }).limit(6);
        if (failure) throw failure;
        if (active) setEvents((data || []) as LocalUpcomingEvent[]);
      } catch { if (active) setError('Local tournaments could not be loaded.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [showLocal, retry]));
  const cards = [...(showLocal ? events.map(event => ({ key: `4m:${event.id}`, date: event.start_date, local: event })) : []), ...(tournament && !liveTour ? [{ key: `pro:${tournament.id}`, date: tournament.startDate, local: null }] : [])].sort((a, b) => a.date.localeCompare(b.date));
  const activePreview = liveTour && tourPreview?.id === liveTour.id ? tourPreview : null;
  const liveRows = activePreview?.rows ?? [];
  const currentDay = matchDay(new Date().toISOString());
  const todayCount = activePreview?.complete
    ? liveRows.filter(row => matchDay(row.match.scheduledAt || row.match.playedAt) === currentDay).length : 0;
  const matchesToday = todayCount > 0 ? todayCount : null;
  const liveMatches = liveRows.filter(row => row.match.status === 'live' || row.match.status === 'ongoing');
  const nextMatches = liveRows.filter(row => {
    const day = matchDay(row.match.scheduledAt);
    return row.match.status === 'scheduled' && (!day || !currentDay || day >= currentDay);
  })
    .sort((a, b) => (a.match.scheduledAt || '9999').localeCompare(b.match.scheduledAt || '9999'));
  const previewMatches = [...liveMatches.slice(0, 1), ...nextMatches.slice(0, liveMatches.length ? 1 : 2)];
  return <View style={{ gap: 12 }}>
    {liveTour && <>
      <Text style={s.sectionTitle}>Live now</Text>
      <LiveTourCard event={liveTour} matchesToday={matchesToday} liveCount={liveMatches.length} onOpen={() => router.push({ pathname: '/pro/live', params: { tournament: String(liveTour.id) } })} />
      {previewMatches.map(row => <TourMatchPreview key={row.match.id} row={row} onOpen={() => router.push({ pathname: '/pro/match/[id]', params: { id: String(row.match.id), from: 'home' } })} />)}
      {tourPreviewError && !liveRows.length && <Text style={s.tourNote}>Match updates are temporarily unavailable. View matches to retry.</Text>}
    </>}
    {(cards.length > 0 || loading || error) && <Text style={s.sectionTitle}>Up next</Text>}
    {loading && <ActivityIndicator color={brand.accent} />}
    {!!error && <Message body={error} retry={() => setRetry(n => n + 1)} />}
    {!cards.length && !loading && !error && !liveTour && <Text style={s.caption}>No upcoming tournaments are published yet.</Text>}
    {cards.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={298} contentContainerStyle={{ gap: 12, alignItems: 'flex-start' }}>
      {cards.map(card => <View key={card.key} style={{ width: 286, gap: 6 }}>
        <Text style={[s.caption, { color: card.local ? '#2449D8' : brand.accent, fontWeight: '700' }]}>{card.local ? '4M · LOCAL' : 'PREMIER PADEL · INTERNATIONAL'}</Text>
        {card.local ? <NextTourCard local event={{
          id: card.local.id, name: card.local.event_name || 'Tournament',
          startDate: card.local.start_date, endDate: card.local.end_date || card.local.start_date,
          location: card.local.city || card.local.venue || 'Venue to be announced', venue: card.local.venue,
          photoUrl: null, level: '4M',
        }} onOpen={() => router.push({ pathname: '/events/[id]', params: { id: String(card.local!.id) } })} />
          : tournament && <><NextTourCard event={tournament} />{!!message && <Text style={s.tourNote}>{message}</Text>}</>}
      </View>)}
    </ScrollView>}
    {showLocal && <Button label="View local calendar" icon="calendar-outline" onPress={() => router.push('/calendar')} />}
  </View>;
}

function MatchSectionToggle({ title, count, expanded, onPress }: { title: string; count: number; expanded: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${title}, ${count} matches`} onPress={onPress} style={s.matchToggle}>
    <View style={{ flex: 1, gap: 4 }}><Text style={s.matchToggleTitle}>{title}</Text><Text style={s.caption}>{expanded ? 'Tap to hide matches' : 'Tap to show matches'}</Text></View>
    <View style={s.matchCount}><Text style={{ color: brand.accent, fontSize: 12, fontWeight: '700' }}>{count}</Text></View>
    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={brand.muted} />
  </Pressable>;
}

function Portrait({ player, size = 48 }: { player: ProPerson & { photoUrl?: string | null }; size?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [player.photoUrl]);
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

function RankingsUpdated({ rankings }: { rankings: ProRankings }) {
  const edition = (category: ProCategory) => rankings.categories[category].editionDate || rankings.categories[category].players[0]?.rankingDate;
  return <View style={{ gap: 5 }}>
    <Text style={s.caption}>Official weekly rankings · Men {proDate(edition('men'))} · Women {proDate(edition('women'))}</Text>
    {rankings.categories.women.previousEdition || rankings.categories.men.previousEdition
      ? <Text style={s.warning}>PadelAPI has not published the latest {rankings.categories.women.previousEdition ? 'women’s' : 'men’s'} edition yet. Showing its previous official ranking.</Text> : null}
    {proStale(rankings.updatedAt) && <Text style={s.warning}>Ranking sync is overdue. Scores may have changed.</Text>}
  </View>;
}

export function MatchCard({ match, lookup, onPlayer, onOpenMatch }: { match: ProMatch; lookup: Map<number, ProPlayer>; onPlayer: (id: number) => void; onOpenMatch?: (id: number, from: string) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const from = pathname === '/pro/live' ? 'live' : pathname === '/calendar' ? 'calendar' : pathname === '/rankings' ? 'rankings' : 'home';
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
            const flag = playerCountryFlag(person.nationality || player?.nationality);
            return <Pressable key={person.id} disabled={!player} onPress={() => onPlayer(person.id)} accessibilityRole={player ? 'button' : undefined}
              accessibilityLabel={player ? `View ${person.name}` : person.name} style={s.matchPerson}>
              <Portrait key={person.id} player={player || person} size={36} /><Text style={s.matchName}>{flag ? `${flag} ` : ''}{person.name}</Text>
            </Pressable>;
          }) : <Text style={s.body}>Opponents TBC</Text>}
        </View>
        {!upcoming && <View style={s.scores} accessible accessibilityLabel={`${team.map(p => p.name).join(' and ')}${winner ? ', winning pair' : ''}, set scores ${match.score.map(set => set[index] ?? 'unavailable').join(', ')}`}>
          {match.score.map((set, i) => {
            const value = String(set[index] ?? '—');
            const parts = /^(\d+)(\(\d+\))$/.exec(value);
            return <View key={i} style={s.scoreColumn}><Text style={[s.score, winner && { color: brand.accent }]}>{parts ? parts[1] : value}{parts && <Text style={s.tieBreak}>{parts[2]}</Text>}</Text></View>;
          })}
        </View>}
      </View>;
    })}
    <View style={s.matchFooter}><View style={s.resultStatus}><Ionicons name={upcoming ? 'time-outline' : match.status === 'finished' ? 'checkmark-circle' : 'information-circle-outline'} size={13} color={!upcoming && match.status === 'finished' ? brand.accent : brand.muted} /><Text style={s.caption}>{upcoming ? match.court || 'Court TBC' : proStatus(match)}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${match.tournamentName} match details`} onPress={() => onOpenMatch ? onOpenMatch(match.id, from) : router.push({ pathname: '/pro/match/[id]', params: { id: String(match.id), from } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, padding: 7 }}><Text style={[s.caption, { color: brand.accent, fontWeight: '700' }]}>Match details</Text><Ionicons name="arrow-forward" size={14} color={brand.accent} /></Pressable></View>
  </View>;
}

export function ProPadelFeed({ state, localState }: { state: ProPadelState; localState?: ReturnType<typeof usePlayerHub> }) {
  const router = useRouter();
  const [view, setView] = useState<'for-you' | 'tour'>('for-you');
  const [filter, setFilter] = useState<Filter | '4m' | 'pro'>('all');
  const proFilter = filter === '4m' || filter === 'pro' ? 'all' : filter;
  const [count, setCount] = useState(6);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [fixturesOpen, setFixturesOpen] = useState(false);
  const [directory, setDirectory] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [matchOpen, setMatchOpen] = useState(false);
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
  const ready = filter !== '4m' && (!personal || (!!state.userId && !state.followsLoading && !state.followsError && ids.length > 0));
  const results = selectProMatches(state.tour.data?.matches || [], personal ? ids : null, proFilter);
  const upcoming = selectProMatches(state.fixtures.data?.matches || [], personal ? ids : null, proFilter, true);
  const rail = players.filter(p => (filter === 'all' || filter === 'pro' || p.category === filter) && (!personal || ids.includes(p.id)));
  const suggestions = players.filter(p => filter === 'all' || filter === 'pro' || p.category === filter);
  const localPlayers = (localState?.locals || []).filter(p => (filter === 'all' || filter === '4m' || filter === 'pro' && !!(p.fipPlayerId || p.fipProfileUrl) || p.gender === filter) && (!personal || localState!.isFollowing(p)));
  const hasFollows = ids.length > 0 || !!localState?.ids.length;
  const verifiedFipIds = new Set((localState?.fipLinks || []).filter(link => link.status === 'verified').map(link => link.fip_player_id).filter((id): id is number => id != null));
  const proCards = filter === '4m' ? [] : (personal && hasFollows ? rail : rail.length ? rail : suggestions).filter(p => !verifiedFipIds.has(p.id)).map(proHubPlayer);
  if (personal && filter !== '4m') for (const p of state.follows) {
    if (!lookup.has(p.player_id) && !verifiedFipIds.has(p.player_id) && (filter === 'all' || filter === 'pro' || filter === p.category)) proCards.push({ key: `pro:${p.player_id}`, source: 'pro', id: String(p.player_id), name: p.player_name, photo: null, gender: p.category, rank: null, points: null, subtitle: 'FIP player' });
  }
  const topTen = (rows: HubPlayer[]) => rows.filter(p => p.rank != null && p.rank > 0)
    .sort((a, b) => a.rank! - b.rank! || a.name.localeCompare(b.name)).slice(0, 10);
  const localSuggestions = (localState?.locals || []).filter(p =>
    (filter === 'all' || filter === '4m' || filter === 'pro' && !!(p.fipPlayerId || p.fipProfileUrl) || p.gender === filter) &&
    (p.rank != null || p.fipRank != null))
    .sort((a, b) => (a.rank ?? a.fipRank ?? Infinity) - (b.rank ?? b.fipRank ?? Infinity))
    .slice(0, 10);
  const proSuggestions = filter === '4m' ? [] : topTen(suggestions.filter(p => !verifiedFipIds.has(p.id)).map(proHubPlayer));
  const { players: visiblePlayers, showingFollowed } = homePlayerSelection(personal, hasFollows ? [...localPlayers, ...proCards] : [], [...localSuggestions, ...proSuggestions]);
  const moves = rail.filter(p => Number.isFinite(p.rankChange) && p.rankChange !== 0 || Number.isFinite(p.pointsChange) && p.pointsChange !== 0).slice(0, 4);
  const directoryPlayers = players.filter(p => (directoryFilter === 'all' || p.category === directoryFilter) &&
    (!onlyFollowing || ids.includes(p.id)) && `${p.name} ${country(p.nationality)}`.toLowerCase().includes(query.trim().toLowerCase()));
  const outsideEdition = state.follows.filter(p => !lookup.has(p.player_id));

  useFocusEffect(useCallback(() => { setMatchOpen(false); }, []));
  const openMatchFromPlayer = (id: number, from: string) => {
    setMatchOpen(true);
    router.push({ pathname: '/pro/match/[id]', params: { id: String(id), from } });
  };

  function openDirectory() { setSelectedId(null); setDirectory(false); router.push({ pathname: '/rankings', params: { view: 'Discover', source: 'all', gender: 'all' } }); }
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
    <View style={s.heading}><View style={{ flex: 1 }}><Text style={s.eyebrow}>YOUR PADEL COMMUNITY</Text><Text accessibilityRole="header" style={s.title}>Players & padel</Text></View>
      <Button label="Players" icon="people-outline" onPress={openDirectory} />
    </View>
    <Text style={s.body}>Local favourites. Global stars. All in one place.</Text>
    <Pressable accessibilityRole="button" onPress={() => router.push('/pro/live')} style={{ backgroundColor: '#172E20', borderColor: '#3F6E45', borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: brand.padel }} />
      <View style={{ flex: 1 }}><Text style={{ color: '#F8FAFC', fontWeight: '800', fontSize: 16 }}>International matches · Live</Text><Text style={{ color: '#D5E4D8', fontSize: 12, marginTop: 3 }}>Scores, point history and match stats</Text></View>
      <Ionicons name="arrow-forward" size={20} color={brand.padel} />
    </Pressable>
    <View style={s.tabs}>{(['for-you', 'tour'] as const).map(v => <Pressable key={v} accessibilityRole="tab" accessibilityState={{ selected: view === v }}
      onPress={() => { setView(v); setCount(6); }} style={[s.tab, view === v && s.activeTab]}><Text style={[s.tabLabel, view === v && { color: '#16251F' }]}>{v === 'for-you' ? 'For you' : 'Tour'}</Text></Pressable>)}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={s.filters}>{(localState ? ['all', '4m', 'pro', 'men', 'women'] as const : ['all', 'men', 'women'] as const).map(v => <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: filter === v }}
      onPress={() => { setFilter(v); setCount(6); }} style={[s.filter, filter === v && s.activeFilter, v === '4m' && filter === v && { backgroundColor: '#EAF0FF', borderColor: '#2449D8' }]}><Text style={[s.caption, filter === v && { color: v === '4m' ? '#2449D8' : brand.premium }]}>{v === 'all' ? 'All' : v === '4m' ? '4M' : v === 'pro' ? 'FIP' : v === 'men' ? 'Men' : 'Women'}</Text></Pressable>)}</ScrollView>

    {state.loading && !state.rankings.data && !state.tour.data && <View style={s.loading}><ActivityIndicator color={brand.accent} /><Text style={s.body}>Loading the tour…</Text></View>}
    {state.writeError && <Text accessibilityRole="alert" style={s.warning}>{state.writeError}</Text>}
    {state.rankings.error && <Message body={state.rankings.error} retry={retry} />}
    {localState?.error && filter !== 'pro' && <Message body={localState.error} retry={() => { void localState.refresh(); }} />}
    {localState?.followError && <Message body={localState.followError} retry={() => { void localState.refresh(); }} />}
    {personal && (state.followsLoading || localState?.followLoading || localState?.loading) ? <View style={s.loading}><ActivityIndicator color={brand.accent} /><Text style={s.body}>Loading your players…</Text></View>
      : personal && state.followsError ? <Message body={state.followsError} retry={() => { void state.refreshFollows(); }} />
      : personal && !state.userId ? <View style={s.message}><Text style={s.cardTitle}>Make padel your own</Text><Text style={s.body}>Sign in to follow players and see their results here.</Text><Button label="Sign in" onPress={() => router.push('/(auth)/sign-in')} /></View>
      : personal && !hasFollows ? <View style={s.message}><Text style={s.cardTitle}>Who’s your first pick?</Text><Text style={s.body}>Follow your favourite players for their results, ranking updates and published fixtures.</Text><Button label="Find players" icon="add" onPress={openDirectory} /></View> : null}

    {visiblePlayers.length > 0 && <>
      <View style={s.sectionHeading}><Text style={s.sectionTitle}>{showingFollowed ? 'Your players' : 'Players to follow'}</Text><Text style={s.caption}>{filter === '4m' ? '4M players' : filter === 'pro' ? 'FIP players' : '4M & FIP'}</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.playerRail}>
        {visiblePlayers.map(player => <View key={player.key} style={s.playerCard}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${player.name}`} onPress={() => {
            if (player.source === '4m') router.push({ pathname: '/players/[id]', params: { id: player.id } });
            else if (lookup.has(Number(player.id))) setSelectedId(Number(player.id));
            else router.push({ pathname: '/rankings', params: { view: 'Discover', source: 'pro', gender: 'all', query: player.name } });
          }}>
            <View style={{ width: 128, height: 128, borderRadius: 18, backgroundColor: player.source === '4m' ? '#2449D8' : brand.glass, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              {player.photo ? <Image source={{ uri: player.photo }} style={{ width: 128, height: 128 }} contentFit="cover" /> : <Text style={{ color: player.source === '4m' ? '#FFF' : brand.accent, fontWeight: '700', fontSize: 32 }}>{player.name.split(' ').slice(0, 2).map(n => n[0]).join('')}</Text>}
            </View>
            <Text numberOfLines={2} style={s.playerName}>{player.name}</Text>
            <Text style={[s.caption, player.source === '4m' && { color: '#2449D8' }]}>{playerRankLabel(player)} · {player.gender === 'men' ? 'Men' : player.gender === 'women' ? 'Women' : 'Player'}</Text>
            {player.fipUnverified && <Text style={[s.caption, { color: '#2449D8', fontWeight: '700' }]}>Unverified link</Text>}
          </Pressable>
          {player.source === '4m' && localState ? <Button local label={localState.pending === player.key ? 'Saving…' : localState.isFollowing(player) ? 'Following' : 'Follow'} icon={localState.isFollowing(player) ? 'heart' : 'heart-outline'} disabled={localState.followLoading || !!localState.followError || !!localState.pending} onPress={() => { if (!state.userId) router.push('/(auth)/sign-in'); else void localState.toggle(player); }} /> : followControl({ player_id: Number(player.id), player_name: player.name, category: player.gender === 'women' ? 'women' : 'men' })}
        </View>)}
      </ScrollView>
    </>}
    {personal && hasFollows && !visiblePlayers.length && !localState?.loading && !localState?.error && <View style={s.message}><Text style={s.body}>No players are available for this filter yet.</Text><Button label="Find players" onPress={openDirectory} /></View>}
    <IntegratedUpNext showLocal={filter === 'all' || filter === '4m'} tournament={filter !== '4m' ? state.fixtures.data?.tournament : null} message={state.fixtures.data && !state.fixtures.data.drawPublished ? 'Draw coming soon · Player appearances will show once confirmed.' : undefined} />
    {filter !== 'pro' && localState && !localState.loading && !localState.followLoading && !localState.followError && <FollowedLocalMatches players={localState.locals.filter(p => localState.ids.includes(p.id) && (filter === 'all' || filter === '4m' || p.gender === filter))} />}
    {ready && <>
      {state.fixtures.error && <Message body={state.fixtures.error} retry={retry} />}
      {state.fixtures.data && <>
        {upcoming.length ? <>
          <MatchSectionToggle title="Upcoming matches" count={upcoming.length} expanded={fixturesOpen} onPress={() => setFixturesOpen(value => !value)} />
          {fixturesOpen && upcoming.map(m => <MatchCard key={m.id} match={m} lookup={lookup} onPlayer={setSelectedId} />)}
          </>
          : !state.fixtures.data.tournament ? <Message title="The next stop is on its way" body="No upcoming event is listed yet. Check back after the next tour update." />
            : state.fixtures.data.drawPublished ? <Text style={s.caption}>{personal ? 'No published fixtures for your players in this selection.' : 'No published fixtures in this selection.'}</Text> : null}
      </>}
      {moves.length > 0 && <><Text style={s.sectionTitle}>Ranking updates</Text>
        {state.rankings.data && <RankingsUpdated rankings={state.rankings.data} />}
        <View style={s.movementList}>{moves.map(p => <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`View ${p.name}`} onPress={() => setSelectedId(p.id)} style={s.movement}>
          <Portrait key={p.id} player={p} size={40} /><View style={{ flex: 1, gap: 4 }}><Text style={s.personName}>{p.name}</Text><Text style={s.caption}>World #{p.rank} · {proDate(p.rankingDate)}</Text></View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>{p.rankChange != null && <Text style={[s.movementValue, { color: p.rankChange > 0 ? '#226047' : brand.muted }]}>{p.rankChange > 0 ? '↑' : p.rankChange < 0 ? '↓' : '—'} {p.rankChange ? Math.abs(p.rankChange) : ''}</Text>}
            {p.pointsChange != null && <Text style={s.caption}>{p.pointsChange > 0 ? '+' : ''}{number(p.pointsChange)} pts</Text>}</View>
        </Pressable>)}</View></>}
      <MatchSectionToggle title="Latest international results" count={results.length} expanded={resultsOpen} onPress={() => { setResultsOpen(value => !value); setCount(6); }} />
      {state.tour.error && <Message body={state.tour.error} retry={retry} />}
      {state.tour.data && <><Updated date={state.tour.data.updatedAt} coverage={state.tour.data.coverage} />
        {resultsOpen && (results.length ? results.slice(0, count).map(m => <MatchCard key={m.id} match={m} lookup={lookup} onPlayer={setSelectedId} />)
          : <Message title="No results in this selection" body={personal ? 'Your players are saved. Their results will appear when included in a tour update.' : 'Check another category or come back after the next update.'} />)}
        {resultsOpen && results.length > count && <Button label={`Show more results (${results.length - count})`} onPress={() => setCount(n => n + 6)} />}
      </>}
    </>}
    {filter !== '4m' && <Button label="View tour calendar" icon="calendar-outline" onPress={() => router.push({ pathname: '/calendar', params: { circuit: 'pro' } })} />}

    <Modal visible={(directory || selectedId !== null) && !matchOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (selectedId !== null && directory) setSelectedId(null); else { setSelectedId(null); setDirectory(false); } }}>
      {/* Native modals need their own safe-area measurements, outside the tab screen. */}
      <SafeAreaProvider style={s.modal}>
      <SafeAreaView style={s.modal} edges={['top', 'bottom', 'left', 'right']}>
        <View style={s.modalHeader}>
          <Button label={selectedId !== null && directory ? 'Players' : 'Close'} icon="chevron-back" onPress={() => { if (selectedId !== null && directory) setSelectedId(null); else { setSelectedId(null); setDirectory(false); } }} />
          <Text style={s.eyebrow}>4M / FIP</Text>
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
          {selectedFixtures.length ? selectedFixtures.map(m => <MatchCard key={m.id} match={m} lookup={lookup} onPlayer={setSelectedId} onOpenMatch={openMatchFromPlayer} />) : state.fixtures.data ? <Text style={s.body}>{state.fixtures.data.drawPublished ? 'No upcoming match is listed for this player.' : 'The next draw has not been published yet.'}</Text> : null}
          <Text style={s.sectionTitle}>Recent results</Text>
          {state.tour.error && <Message body={state.tour.error} retry={retry} />}
          {state.tour.data && <Updated date={state.tour.data.updatedAt} coverage={state.tour.data.coverage} />}
          {selectedMatches.map(m => <MatchCard key={m.id} match={m} lookup={lookup} onPlayer={setSelectedId} onOpenMatch={openMatchFromPlayer} />)}
          {!selectedMatches.length && state.tour.data && <Text style={s.body}>No results for this player in the covered rounds.</Text>}
        </ScrollView> : selectedId !== null ? <Message title="Player unavailable" body="This player is no longer in the current ranking edition." /> : <>
          <View style={s.directoryHeader}><Text accessibilityRole="header" style={s.title}>Find your players</Text><Text style={s.body}>Featured official rankings. Open Players to search the full FIP directory.</Text>
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
  caption: { fontSize: 12, lineHeight: 18, color: brand.muted },
  warning: { color: brand.danger, fontSize: 13, lineHeight: 20 },
  button: { minHeight: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: brand.glass },
  buttonText: { color: brand.accent, fontSize: 12, fontWeight: '700' },
  tabs: { backgroundColor: brand.elevated, borderRadius: 12, padding: 4, flexDirection: 'row', gap: 4 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  activeTab: { backgroundColor: brand.padel },
  tabLabel: { color: brand.muted, fontSize: 14, fontWeight: '700' },
  filterScroll: { flexGrow: 0, flexShrink: 0, minHeight: 52 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  filter: { minHeight: 44, flexShrink: 0, paddingVertical: 12, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: brand.edge },
  activeFilter: { backgroundColor: brand.panel, borderColor: brand.muted },
  loading: { flexDirection: 'row', gap: 12, paddingVertical: 20, alignItems: 'center' },
  message: { padding: 18, borderRadius: 14, backgroundColor: brand.elevated, gap: 10 },
  cardTitle: { color: brand.premium, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionTitle: { color: brand.premium, fontWeight: '700', fontSize: 18, marginTop: 10 },
  playerRail: { gap: 12, paddingBottom: 4 },
  playerCard: { width: 160, padding: 16, borderWidth: 1, borderColor: brand.edge, backgroundColor: brand.elevated, borderRadius: 16, gap: 10 },
  portrait: { backgroundColor: '#E9EEE6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { color: brand.muted, fontWeight: '700' },
  playerName: { color: brand.premium, fontSize: 14, lineHeight: 19, fontWeight: '700', minHeight: 38, marginTop: 10, marginBottom: 4 },
  tourHero: { backgroundColor: '#EDF2E7', borderWidth: 1, borderColor: '#D3DFC6', borderRadius: 22, padding: 20, gap: 18 },
  tourEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  tourLevel: { color: brand.accent, borderWidth: 1, borderColor: brand.padel, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, fontSize: 11, fontWeight: '800' },
  tourKicker: { color: brand.accent, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  tourMain: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  tourTitle: { color: '#16251F', fontSize: 26, lineHeight: 31, minHeight: 93, fontWeight: '800', letterSpacing: -0.7 },
  tourDate: { width: 84, paddingVertical: 12, alignItems: 'center', borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D3DFC6' },
  tourMonth: { color: '#52625A', fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  tourDay: { color: '#386018', fontSize: 48, lineHeight: 55, fontWeight: '800', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  tourYear: { color: '#52625A', fontSize: 10, letterSpacing: 1 },
  tourMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tourLocation: { color: '#52625A', fontSize: 13, lineHeight: 19, flexShrink: 1 },
  tourCalendar: { minHeight: 48, backgroundColor: brand.padel, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  tourCalendarText: { color: '#17200c', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  tourNote: { color: '#52625A', fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
  liveTourCard: { minHeight: 320, borderRadius: 20, overflow: 'hidden', backgroundColor: '#172E20' },
  liveArtwork: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  liveTourContent: { flex: 1, minHeight: 320, padding: 18, gap: 10 },
  liveBadges: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  liveBadge: { color: '#FFFFFF', backgroundColor: '#ED4354', paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  liveLevel: { color: '#FFFFFF', backgroundColor: '#7229C5', paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  liveTourTitle: { color: '#FFFFFF', fontSize: 28, lineHeight: 33, fontWeight: '800', textShadowColor: '#07140C', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  liveTourPlace: { color: '#FFFFFF', fontSize: 14, textShadowColor: '#07140C', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  liveTourCount: { color: brand.padel, fontSize: 14, fontWeight: '800', marginTop: 4, textShadowColor: '#07140C', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6 },
  liveTourAction: { minHeight: 48, marginTop: 4, backgroundColor: brand.padel, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  liveTourActionText: { color: '#17200C', fontSize: 14, fontWeight: '800', letterSpacing: 0.6 },
  liveMatchCard: { backgroundColor: '#17201C', borderRadius: 16, padding: 14, gap: 10 },
  liveMatchHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveMatchStatus: { color: '#FFFFFF', backgroundColor: '#ED4354', paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '800' },
  nextMatchStatus: { color: '#17200C', backgroundColor: brand.padel, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '800' },
  liveMatchCourt: { color: '#D5E4D8', fontSize: 11, flex: 1, textAlign: 'right' },
  liveMatchTeam: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  liveMatchNames: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', flex: 1 },
  liveMatchScore: { color: brand.padel, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  liveMatchTime: { color: '#D5E4D8', fontSize: 11 },
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
  stat: { color: brand.accent, fontSize: 28, fontWeight: '800', marginBottom: 4, fontVariant: ['tabular-nums'] },
});
