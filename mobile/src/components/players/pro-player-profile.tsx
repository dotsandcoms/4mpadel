import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchPairMatches, fetchPairStats, fetchPlayerCoach, fetchPlayerMatches, fetchPlayerPairs, fetchPlayerProfile, fetchPlayerRankings, fetchPlayerStats, recentMatchForm, type MatchDetails, type PlayerCoach, type PlayerPair, type PlayerProfile, type PlayerRanking, type PlayerStats } from '@/lib/pro-padel-live';
import { playerCountryFlag, playerCountryLabel, type HubPlayer } from '@/lib/player-hub';
import { proDate, proRound } from '@/lib/pro-padel';
import { lightBrand as b } from '@/theme/tokens';

type Tab = 'Overview' | 'Matches' | 'Partners' | 'Stats' | 'Rankings';
const tabs: Tab[] = ['Overview', 'Matches', 'Partners', 'Stats', 'Rankings'];
const card = { backgroundColor: b.elevated, borderColor: b.edge, borderWidth: 1, borderRadius: 18, padding: 16 } as const;
const fullDate = (value: string | null) => value ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date(value)) : null;

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return <View style={{ gap: 4, minWidth: '45%', flexGrow: 1 }}><Text style={{ color: b.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text><Text style={{ color: b.premium, fontSize: 15, fontWeight: '700' }}>{value}</Text></View>;
}

function PeriodSelector({ year, currentYear, onChange }: { year: number | null; currentYear: number; onChange: (value: number | null) => void }) {
  return <View style={{ flexDirection: 'row', gap: 6 }}>
    {[currentYear, currentYear - 1, null].map(value => <Pressable key={value ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: year === value }} onPress={() => onChange(value)} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, backgroundColor: year === value ? b.accent : b.elevated }}><Text style={{ color: year === value ? '#FFFFFF' : b.muted, fontWeight: '700', fontSize: 12 }}>{value ?? 'All'}</Text></Pressable>)}
  </View>;
}

function RecentForm({ matches, playerId, year, loading }: { matches: MatchDetails[]; playerId: number; year: number | null; loading: boolean }) {
  const form = recentMatchForm(matches, playerId);
  const wins = form.filter(Boolean).length;
  return <View style={{ ...card, gap: 12 }}>
    <Text style={{ color: b.premium, fontSize: 18, fontWeight: '800' }}>Recent form</Text>
    {loading ? <ActivityIndicator color={b.accent} /> : form.length ? <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, minHeight: 48 }}>
        {form.map((won, index) => <View key={index} accessible accessibilityLabel={`${index + 1} of ${form.length}: ${won ? 'win' : 'loss'}`} style={{ flex: 1, maxWidth: 32, height: won ? 44 : 32, borderRadius: 5, backgroundColor: won ? b.accent : b.danger, opacity: index === form.length - 1 ? 1 : 0.82 }} />)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: b.muted, fontSize: 11, fontWeight: '700' }}>OLDEST</Text><Text style={{ color: b.muted, fontSize: 11, fontWeight: '700' }}>LATEST</Text></View>
      <Text style={{ color: b.accent, fontSize: 21, fontWeight: '800' }}>{wins}–{form.length - wins} <Text style={{ color: b.muted, fontSize: 13, fontWeight: '500' }}>across {form.length} published {form.length === 1 ? 'match' : 'matches'}</Text></Text>
      <Text style={{ color: b.muted, fontSize: 11 }}>Up to the latest 10 {year ?? 'all-time'} results published by Padel API.</Text>
    </> : <Text style={{ color: b.muted }}>No finished matches in the selected period.</Text>}
  </View>;
}

function Result({ detail, playerId, onMatch }: { detail: MatchDetails; playerId: number; onMatch: (id: number) => void }) {
  const { match } = detail;
  const myTeam = match.teams.findIndex(team => team.some(person => person.id === playerId));
  if (myTeam < 0) return null;
  const myPlayers = match.teams[myTeam];
  const opponents = match.teams[1 - myTeam];
  const won = match.winner ? match.winner === `team_${myTeam + 1}` : null;
  const sets = match.score.filter(([first, second]) => first != null && second != null);
  const teamLabel = (team: typeof myPlayers) => team.map(person => `${playerCountryFlag(person.nationality) ? `${playerCountryFlag(person.nationality)} ` : ''}${person.name}`).join(' / ');
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${match.tournamentName} match and set scores`} onPress={() => onMatch(match.id)} style={{ ...card, gap: 11 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <Text numberOfLines={2} style={{ color: b.accent, fontSize: 11, fontWeight: '800', flex: 1 }}>{match.tournamentName}</Text>
      <Text style={{ color: b.muted, fontSize: 11 }}>{proDate(match.playedAt || match.scheduledAt)}</Text>
    </View>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Text style={{ color: b.muted, fontSize: 12, flex: 1 }}>{proRound(match)}{detail.draw ? ` · ${detail.draw}` : ''}</Text>
      {won !== null && <Text style={{ color: won ? b.accent : b.danger, fontWeight: '800', fontSize: 12 }}>{won ? 'WIN' : 'LOSS'}</Text>}
    </View>
    <View style={{ borderTopWidth: 1, borderColor: b.edge, paddingTop: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text numberOfLines={2} style={{ color: b.premium, fontWeight: '800', fontSize: 13, flex: 1 }}>{teamLabel(myPlayers)}</Text>
        {sets.map((set, index) => <Text key={index} style={{ color: b.premium, width: 26, textAlign: 'center', fontWeight: '800', fontSize: 15 }}>{set[myTeam]}</Text>)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text numberOfLines={2} style={{ color: b.muted, fontWeight: '700', fontSize: 13, flex: 1 }}>{teamLabel(opponents) || 'Opponents TBC'}</Text>
        {sets.map((set, index) => <Text key={index} style={{ color: b.muted, width: 26, textAlign: 'center', fontWeight: '700', fontSize: 15 }}>{set[1 - myTeam]}</Text>)}
      </View>
      {!sets.length && <Text style={{ color: b.muted, fontSize: 12 }}>{detail.scoreText || 'Score not published'}</Text>}
    </View>
  </Pressable>;
}

function Partnership({ pair, playerId, year, compact, onOpen, onMatch, onPlayer }: {
  pair: PlayerPair; playerId: number; year: number | null; compact: boolean; onOpen?: () => void;
  onMatch: (id: number) => void; onPlayer: (id: number, name: string) => void;
}) {
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [matches, setMatches] = useState<MatchDetails[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(!compact);
  const [matchesError, setMatchesError] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setStatsLoading(true); setStatsError('');
    void fetchPairStats(pair.id).then(value => { if (active) setStats(value); })
      .catch(error => { if (active) setStatsError(error instanceof Error ? error.message : 'Pair stats are unavailable.'); })
      .finally(() => { if (active) setStatsLoading(false); });
    return () => { active = false; };
  }, [pair.id]);

  useEffect(() => {
    if (compact) return;
    let active = true;
    setMatches([]); setPage(1); setHasMore(false); setMatchesError(''); setMatchesLoading(true);
    void fetchPairMatches(pair.id, 1, year ?? undefined).then(value => {
      if (active) { setMatches(value.matches); setHasMore(value.hasMore); }
    }).catch(error => { if (active) setMatchesError(error instanceof Error ? error.message : 'Pair matches are unavailable.'); })
      .finally(() => { if (active) setMatchesLoading(false); });
    return () => { active = false; };
  }, [pair.id, year, compact]);

  const loadMore = async () => {
    if (!hasMore || moreLoading) return;
    setMoreLoading(true); setMatchesError('');
    try {
      const value = await fetchPairMatches(pair.id, page + 1, year ?? undefined);
      setMatches(previous => [...new Map([...previous, ...value.matches].map(row => [row.match.id, row])).values()]);
      setPage(page + 1); setHasMore(value.hasMore);
    } catch (error) { setMatchesError(error instanceof Error ? error.message : 'More pair matches could not be loaded.'); }
    finally { setMoreLoading(false); }
  };

  const record = stats?.matchesPlayed != null && stats.matchesWon != null ? `${stats.matchesWon}–${Math.max(0, stats.matchesPlayed - stats.matchesWon)}` : null;
  return <View style={{ ...card, gap: 15 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {pair.partnerPhotoUrl ? <Image source={{ uri: pair.partnerPhotoUrl }} style={{ width: 54, height: 54, borderRadius: 27 }} contentFit="cover" /> : <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: b.glass, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '800', fontSize: 24 }}>{pair.partner.name[0]}</Text></View>}
      <View style={{ flex: 1, gap: 3 }}><Text style={{ color: b.premium, fontWeight: '800', fontSize: 17 }}>{pair.partner.name}</Text><Text style={{ color: b.muted, fontSize: 12 }}>{playerCountryLabel(pair.partnerNationality)}{pair.partnerRank != null ? ` · World #${pair.partnerRank}` : ''}{pair.partnerPoints != null ? ` · ${pair.partnerPoints} pts` : ''}</Text><Text style={{ color: b.muted, fontSize: 11 }}>{pair.name}</Text></View>
      {pair.status === 'current' && <Text style={{ color: b.accent, fontWeight: '800', fontSize: 11 }}>CURRENT</Text>}
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      <Field label="First match" value={fullDate(pair.firstMatchAt)} />
      <Field label="Last match" value={fullDate(pair.lastMatchAt)} />
      <Field label="Combined FIP points" value={pair.combinedPoints} />
      <Field label="Court side" value={pair.partnerSide} />
      <Field label="Plays" value={pair.partnerHand ? `${pair.partnerHand}-handed` : null} />
    </View>
    {statsLoading ? <ActivityIndicator color={b.accent} /> : stats ? <View style={{ flexDirection: 'row', gap: 8 }}>
      {[{ label: 'FIP matches', value: stats.matchesPlayed }, { label: 'Record', value: record }, { label: 'Win rate', value: stats.winPercentage != null ? `${stats.winPercentage}%` : null }].map(item => <View key={item.label} style={{ flex: 1, backgroundColor: b.glass, borderRadius: 12, padding: 10, alignItems: 'center', gap: 4 }}><Text style={{ color: b.premium, fontSize: 17, fontWeight: '800' }}>{item.value ?? '—'}</Text><Text style={{ color: b.muted, fontSize: 10, textAlign: 'center' }}>{item.label}</Text></View>)}
    </View> : <Text style={{ color: b.muted }}>{statsError || 'Pair stats have not been published.'}</Text>}
    {stats && <Text style={{ color: b.muted, fontSize: 11, lineHeight: 16 }}>Pair stats cover {stats.matchesPlayed ?? 'published'} tracked FIP main-draw matches{stats.since ? ` since ${stats.since}` : ''}.</Text>}
    {!compact && stats && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}><Field label="Sets won–lost" value={stats.setsWon != null && stats.setsLost != null ? `${stats.setsWon}–${stats.setsLost}` : null} /><Field label="Games won–lost" value={stats.gamesWon != null && stats.gamesLost != null ? `${stats.gamesWon}–${stats.gamesLost}` : null} /><Field label="Titles" value={stats.titles} /><Field label="Finals" value={stats.finals} /><Field label="Semifinals" value={stats.semifinals} /></View>}
    {compact ? <Pressable accessibilityRole="button" onPress={onOpen} style={{ paddingVertical: 4 }}><Text style={{ color: b.accent, fontWeight: '800' }}>Partnership details →</Text></Pressable> : <>
      <Pressable accessibilityRole="button" onPress={() => onPlayer(pair.partner.id, pair.partner.name)} style={{ paddingVertical: 4 }}><Text style={{ color: b.accent, fontWeight: '800' }}>Open {pair.partner.name}'s player profile →</Text></Pressable>
      <Text style={{ color: b.premium, fontSize: 17, fontWeight: '800' }}>Matches together</Text>
      {matchesLoading ? <ActivityIndicator color={b.accent} /> : matches.length ? matches.map(row => <Result key={row.match.id} detail={row} playerId={playerId} onMatch={onMatch} />) : <Text style={{ color: b.muted }}>{matchesError || 'No pair matches published for this period.'}</Text>}
      {!!matchesError && !!matches.length && <Text style={{ color: b.danger }}>{matchesError}</Text>}
      {hasMore && <Pressable accessibilityRole="button" disabled={moreLoading} onPress={() => void loadMore()} style={{ paddingVertical: 10, alignItems: 'center' }}><Text style={{ color: b.accent, fontWeight: '800' }}>{moreLoading ? 'Loading…' : 'Load more pair matches'}</Text></Pressable>}
    </>}
  </View>;
}

export function ProPlayerProfile({ player, followButton, onClose, onMatch, onPlayer }: {
  player: HubPlayer; followButton: ReactNode; onClose: () => void; onMatch: (id: number) => void; onPlayer: (id: number, name: string) => void;
}) {
  const safe = useSafeAreaInsets();
  const id = Number(player.id);
  const currentYear = new Date().getFullYear();
  const [tab, setTab] = useState<Tab>('Overview');
  const [year, setYear] = useState<number | null>(currentYear);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [coach, setCoach] = useState<PlayerCoach | null>(null);
  const [coachLoading, setCoachLoading] = useState(true);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [pairs, setPairs] = useState<PlayerPair[]>([]);
  const [activePairId, setActivePairId] = useState<string | null>(null);
  const [rankings, setRankings] = useState<PlayerRanking[]>([]);
  const [rankingsLoaded, setRankingsLoaded] = useState(false);
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [rankingsError, setRankingsError] = useState('');
  const [matches, setMatches] = useState<MatchDetails[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [statsError, setStatsError] = useState('');
  const [pairsError, setPairsError] = useState('');
  const [matchesError, setMatchesError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.allSettled([fetchPlayerProfile(id), fetchPlayerStats(id), fetchPlayerPairs(id)]).then(([profileResult, statsResult, pairsResult]) => {
      if (!active) return;
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
      else setProfileError(profileResult.reason instanceof Error ? profileResult.reason.message : 'Profile details are unavailable.');
      if (statsResult.status === 'fulfilled') setStats(statsResult.value);
      else setStatsError(statsResult.reason instanceof Error ? statsResult.reason.message : 'Player stats are unavailable.');
      if (pairsResult.status === 'fulfilled') setPairs(pairsResult.value);
      else setPairsError(pairsResult.reason instanceof Error ? pairsResult.reason.message : 'Partner history is unavailable.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    let active = true;
    setCoach(null); setCoachLoading(true);
    void fetchPlayerCoach(id).then(value => { if (active) setCoach(value); })
      .catch(() => { if (active) setCoach({ coaches: [], sourceUrl: null }); })
      .finally(() => { if (active) setCoachLoading(false); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    let active = true;
    setMatches([]); setPage(1); setHasMore(false); setMatchesError(''); setMatchesLoading(true);
    void fetchPlayerMatches(id, 1, year ?? undefined).then(result => {
      if (!active) return;
      setMatches(result.matches); setHasMore(result.hasMore);
    }).catch(error => { if (active) setMatchesError(error instanceof Error ? error.message : 'Match history is unavailable.'); })
      .finally(() => { if (active) setMatchesLoading(false); });
    return () => { active = false; };
  }, [id, year]);

  useEffect(() => {
    if (tab !== 'Rankings' || rankingsLoaded) return;
    let active = true;
    setRankingsLoading(true); setRankingsError('');
    void fetchPlayerRankings(id).then(value => { if (active) setRankings(value); })
      .catch(error => { if (active) setRankingsError(error instanceof Error ? error.message : 'Rankings are unavailable.'); })
      .finally(() => { if (active) { setRankingsLoading(false); setRankingsLoaded(true); } });
    return () => { active = false; };
  }, [tab, id, rankingsLoaded]);

  const loadMore = async () => {
    if (!hasMore || moreLoading) return;
    setMoreLoading(true); setMatchesError('');
    try {
      const result = await fetchPlayerMatches(id, page + 1, year ?? undefined);
      setMatches(previous => [...new Map([...previous, ...result.matches].map(row => [row.match.id, row])).values()]);
      setPage(page + 1); setHasMore(result.hasMore);
    } catch (error) { setMatchesError(error instanceof Error ? error.message : 'More matches could not be loaded.'); }
    finally { setMoreLoading(false); }
  };

  const name = profile?.name || player.name;
  const rank = profile?.rank ?? player.rank;
  const points = profile?.points ?? player.points;
  const nationality = profile?.nationality || player.pro?.nationality;
  const photo = profile?.photoUrl || player.photo;
  const currentPair = pairs.find(pair => pair.status === 'current');
  const activePair = pairs.find(pair => pair.id === activePairId) || currentPair || pairs[0];
  const latestPartner = currentPair?.partner || matches[0]?.match.teams.find(team => team.some(person => person.id === id))?.find(person => person.id !== id);
  const record = stats?.matchesPlayed != null && stats.matchesWon != null ? `${stats.matchesWon}–${Math.max(0, stats.matchesPlayed - stats.matchesWon)}` : '—';
  const renderResult = (row: MatchDetails) => <Result key={row.match.id} detail={row} playerId={id} onMatch={onMatch} />;
  const empty = (message: string) => <Text style={{ color: b.muted, lineHeight: 21 }}>{message}</Text>;

  return <View style={{ flex: 1, paddingTop: safe.top, backgroundColor: b.page }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, minHeight: 54 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close player profile" onPress={onClose} style={{ paddingVertical: 10, paddingRight: 14 }}><Text style={{ color: b.accent, fontWeight: '700' }}>Close</Text></Pressable>
      <Text style={{ color: b.premium, fontSize: 14, fontWeight: '800' }}>Player profile</Text>
      <View style={{ width: 48 }} />
    </View>
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: safe.bottom + 30, gap: 18 }}>
      <View style={{ alignItems: 'center', gap: 10 }}>
        {photo ? <Image source={{ uri: photo }} style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: b.glass }} contentFit="cover" /> : <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: b.glass, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 42, color: b.accent, fontWeight: '800' }}>{name[0]}</Text></View>}
        <Text style={{ color: b.premium, fontSize: 27, fontWeight: '800', textAlign: 'center' }}>{name}</Text>
        <Text style={{ color: b.muted, fontSize: 13 }}>{playerCountryLabel(nationality)} · {profile?.category === 'women' || player.gender === 'women' ? 'Women' : 'Men'}{profile?.age != null ? ` · ${profile.age} yrs` : ''}</Text>
        <View style={{ alignSelf: 'stretch' }}>{followButton}</View>
      </View>
      <View style={{ ...card, flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 18 }}>
        {[{ value: rank ? `#${rank}` : '—', label: 'World rank' }, { value: stats?.winPercentage != null ? `${Math.round(stats.winPercentage)}%` : '—', label: 'FIP win rate' }, { value: record, label: 'FIP record' }, { value: points?.toLocaleString('en-ZA') ?? '—', label: 'FIP pts' }].map(item => <View key={item.label} style={{ alignItems: 'center', gap: 4, flex: 1 }}><Text style={{ color: b.premium, fontSize: 17, fontWeight: '800' }}>{item.value}</Text><Text style={{ color: b.muted, fontSize: 10, textAlign: 'center' }}>{item.label}</Text></View>)}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{tabs.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={{ paddingHorizontal: 15, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: tab === value ? b.accent : b.edge, backgroundColor: tab === value ? b.accent : b.elevated }}><Text style={{ color: tab === value ? '#FFFFFF' : b.premium, fontWeight: '700', fontSize: 12 }}>{value}</Text></Pressable>)}</ScrollView>

      {tab === 'Overview' && <>
        <Text style={{ color: b.premium, fontSize: 18, fontWeight: '800' }}>{currentPair ? 'Current partnership' : 'Latest partner'}</Text>
        {currentPair ? <Partnership pair={currentPair} playerId={id} year={year} compact onOpen={() => { setActivePairId(currentPair.id); setTab('Partners'); }} onMatch={onMatch} onPlayer={onPlayer} /> : <View style={{ ...card, gap: 12 }}>{latestPartner ? <Pressable accessibilityRole="button" onPress={() => onPlayer(latestPartner.id, latestPartner.name)}><Text style={{ color: b.accent, fontSize: 16, fontWeight: '700' }}>{latestPartner.name} →</Text><Text style={{ color: b.muted, fontSize: 12, marginTop: 4 }}>In most recent published match</Text></Pressable> : empty(matchesLoading ? 'Loading partner…' : 'No partner in the published match history.')}</View>}
        {(coachLoading || !!coach?.coaches.length) && <View style={{ ...card, gap: 8 }}><Text style={{ color: b.premium, fontSize: 18, fontWeight: '800' }}>Coach</Text>{coachLoading ? <ActivityIndicator color={b.accent} /> : <><Text style={{ color: b.premium, fontSize: 16, fontWeight: '700' }}>{coach?.coaches.join(' · ')}</Text>{coach?.sourceUrl && <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(coach.sourceUrl!)}><Text style={{ color: b.accent, fontSize: 12, fontWeight: '700' }}>Verified on official FIP profile ↗</Text></Pressable>}</>}</View>}
        <RecentForm matches={matches} playerId={id} year={year} loading={matchesLoading} />
        <View style={{ ...card, gap: 12 }}><Text style={{ color: b.premium, fontSize: 18, fontWeight: '800' }}>Recent results</Text>{matchesLoading ? <ActivityIndicator color={b.accent} /> : matches.length ? matches.slice(0, 3).map(renderResult) : empty(matchesError || 'No matches published for this season.')}<Pressable accessibilityRole="button" onPress={() => setTab('Matches')}><Text style={{ color: b.accent, fontWeight: '700' }}>View all matches →</Text></Pressable></View>
        <View style={{ ...card, gap: 14 }}><Text style={{ color: b.premium, fontSize: 18, fontWeight: '800' }}>Profile info</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}><Field label="Born" value={profile?.birthdate} /><Field label="Birthplace" value={profile?.birthplace} /><Field label="Height" value={profile?.height ? `${profile.height} cm` : null} /><Field label="Court side" value={profile?.side} /><Field label="Plays" value={profile?.hand ? `${profile.hand}-handed` : null} /><Field label="Padel API Elo" value={profile?.elo} /></View>{loading && <ActivityIndicator color={b.accent} />}{!!profileError && empty(profileError)}</View>
      </>}

      {tab === 'Matches' && <>
        <Text style={{ color: b.premium, fontSize: 18, fontWeight: '800' }}>Match history</Text>
        <PeriodSelector year={year} currentYear={currentYear} onChange={setYear} />
        {matchesLoading ? <ActivityIndicator color={b.accent} /> : matches.length ? matches.map(renderResult) : empty(matchesError || `No published ${year ?? ''} matches.`)}
        {!!matchesError && matches.length > 0 && empty(matchesError)}
        {hasMore && <Pressable accessibilityRole="button" disabled={moreLoading} onPress={() => void loadMore()} style={{ ...card, alignItems: 'center' }}><Text style={{ color: b.accent, fontWeight: '800' }}>{moreLoading ? 'Loading…' : 'Load more matches'}</Text></Pressable>}
      </>}

      {tab === 'Partners' && <>
        <Text style={{ color: b.premium, fontSize: 18, fontWeight: '800' }}>Partnerships</Text>
        {loading ? <ActivityIndicator color={b.accent} /> : pairs.length ? <>
          {pairs.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{pairs.map(pair => <Pressable key={pair.id} accessibilityRole="button" accessibilityState={{ selected: activePair?.id === pair.id }} onPress={() => setActivePairId(pair.id)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderWidth: 1, borderColor: activePair?.id === pair.id ? b.accent : b.edge, backgroundColor: activePair?.id === pair.id ? b.accent : b.elevated }}><Text style={{ color: activePair?.id === pair.id ? '#FFFFFF' : b.premium, fontWeight: '800' }}>{pair.partner.name}</Text></Pressable>)}</ScrollView>}
          <PeriodSelector year={year} currentYear={currentYear} onChange={setYear} />
          {activePair && <Partnership key={activePair.id} pair={activePair} playerId={id} year={year} compact={false} onMatch={onMatch} onPlayer={onPlayer} />}
        </> : empty(pairsError || 'No published partner history.')}
      </>}

      {tab === 'Stats' && <><RecentForm matches={matches} playerId={id} year={year} loading={matchesLoading} /><View style={{ ...card, gap: 17 }}><Text style={{ color: b.premium, fontSize: 18, fontWeight: '800' }}>FIP match stats</Text>{loading ? <ActivityIndicator color={b.accent} /> : stats ? <><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}><Field label="Matches played" value={stats.matchesPlayed} /><Field label="Matches won" value={stats.matchesWon} /><Field label="Win rate" value={stats.winPercentage != null ? `${stats.winPercentage}%` : null} /><Field label="Titles" value={stats.titles} /><Field label="Finals" value={stats.finals} /><Field label="Semifinals" value={stats.semifinals} /><Field label="Sets won–lost" value={stats.setsWon != null && stats.setsLost != null ? `${stats.setsWon}–${stats.setsLost}` : null} /><Field label="Games won–lost" value={stats.gamesWon != null && stats.gamesLost != null ? `${stats.gamesWon}–${stats.gamesLost}` : null} /><Field label="Best round" value={stats.bestRound != null ? ({ 1: 'Final', 2: 'Semi-final', 4: 'Quarter-final' } as Record<number, string>)[stats.bestRound] || `Round of ${stats.bestRound * 2}` : null} /></View>{stats.coverage && <Text style={{ color: b.muted, fontSize: 12, lineHeight: 18 }}>These figures cover {stats.matchesPlayed ?? 'published'} tracked FIP matches{stats.since ? ` since ${stats.since}` : ''}. Other tours may have additional results.</Text>}</> : empty(statsError || 'FIP match stats are not published for this player.')}</View></>}
      {tab === 'Rankings' && <>
        <Text style={{ color: b.premium, fontSize: 18, fontWeight: '800' }}>Published rankings</Text>
        {rankingsLoading ? <ActivityIndicator color={b.accent} /> : rankings.length ? rankings.map((entry, index) => <View key={`${entry.type}-${entry.date}-${index}`} style={{ ...card, gap: 8 }}><Text style={{ color: b.accent, fontWeight: '800', textTransform: 'uppercase' }}>{entry.type}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}><Field label="World rank" value={entry.rank != null ? `#${entry.rank}` : null} /><Field label="Points" value={entry.points} /><Field label="Rank change" value={entry.rankChange} /><Field label="Points change" value={entry.pointsChange} /></View><Text style={{ color: b.muted, fontSize: 12 }}>{fullDate(entry.date) || 'Current published snapshot'}</Text></View>) : empty(rankingsError || 'No ranking snapshots published for this player.')}
      </>}
    </ScrollView>
  </View>;
}
