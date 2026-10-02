import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchPublicPlayer, publicRank, playerPoints, pointsGain, instagramUrl, type PublicPlayer } from '@/lib/players';
import { fetchPlayerMatches, matchKey, type MatchLists } from '@/lib/matches';
import { siteUrl } from '@/lib/site';
import { LocalFollowButton } from '@/components/players/local-follow-button';
import { PlayerOverview, PlayerForm, PlayerMatchCard } from '@/components/players/profile-sections';
import { lightBrand as b } from '@/theme/tokens';
import { fetchMyFipLink } from '@/lib/player-fip-link';
import { lookupOfficialFipProfile, searchProPlayers, type OfficialFipProfile, type PlayerFipLink } from '@/lib/player-hub';
import type { ProPlayer } from '@/lib/pro-padel';
import { categoriesFor, fetchRankings } from '@/lib/rankings';

const card = { padding: 16, gap: 10, backgroundColor: b.elevated, borderRadius: 16, borderWidth: 1, borderColor: b.edge } as const;
export default function PlayerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>(); const safe = useSafeAreaInsets();
  const [player, setPlayer] = useState<PublicPlayer | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [shareError, setShareError] = useState('');
  const [tab, setTab] = useState('Overview'); const [ranking, setRanking] = useState<number | null>(null); const [photo, setPhoto] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchLists | null>(null); const [matchError, setMatchError] = useState(''); const request = useRef(0);
  const [fipLink, setFipLink] = useState<PlayerFipLink | null>(null);
  const [fipLive, setFipLive] = useState<ProPlayer | null>(null);
  const [officialFip, setOfficialFip] = useState<OfficialFipProfile | null>(null);
  const [sapaRank, setSapaRank] = useState<number | null>(null);
  const load = useCallback(async () => { const current = ++request.current; setLoading(true); setError(''); setPlayer(null); setMatches(null); setMatchError('');
    setFipLink(null); setFipLive(null); setOfficialFip(null); setSapaRank(null);
    try { const next = await fetchPublicPlayer(id); if (current !== request.current) return; setPlayer(next);
      void fetchMyFipLink(Number(id)).then(link => {
        if (current !== request.current) return;
        setFipLink(link);
        if (link?.fip_player_id) void searchProPlayers('', 'all', 1, link.fip_player_id)
          .then(result => { if (current === request.current && result.players[0]?.id === link.fip_player_id) setFipLive(result.players[0]); })
          .catch(() => {});
        if (link?.fip_profile_url) void lookupOfficialFipProfile(link.fip_profile_url)
          .then(profile => { if (current === request.current) setOfficialFip(profile); })
          .catch(() => {});
      }).catch(() => {});
      if (next.rankedin_id) void Promise.allSettled(categoriesFor(15809).map(category => fetchRankings(15809, category))).then(results => {
        if (current !== request.current) return;
        const entries = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
        const exact = entries.filter(entry => entry.rankedinId === String(next.rankedin_id));
        if (exact.length === 1) setSapaRank(exact[0].rank);
      });
      if (next.rankedin_id) void fetchPlayerMatches(next.rankedin_id).then(rows => { if (current === request.current) setMatches(rows); }).catch(() => { if (current === request.current) setMatchError('Published matches could not be loaded. Pull down to retry.'); });
    } catch (e) { if (current === request.current) setError(e instanceof Error ? e.message : 'Player could not be loaded.'); }
    finally { if (current === request.current) setLoading(false); }
  }, [id]);
  useEffect(() => { setTab('Overview'); setRanking(null); void load(); return () => { request.current++; }; }, [load]);
  const gallery = [...new Set([player?.image_url, ...(player?.additional_images || [])].filter((url): url is string => !!url))];
  const currentFipRank = fipLive?.rank || officialFip?.rank || fipLink?.fip_rank || null;
  const share = async () => { if (!player) return; try { setShareError(''); await Share.share({ title: player.name, message: `${player.name} on 4M Padel\n${siteUrl(`/players?id=${player.id}`)}` }); } catch { setShareError('Could not open sharing. Please try again.'); } };
  return <View style={{ flex: 1, backgroundColor: b.page }}>
    <Stack.Screen options={{ headerShown: true, headerBackButtonDisplayMode: 'minimal', title: 'Player profile', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false, headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Share player profile" disabled={!player} onPress={share} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="share-outline" size={23} color={b.premium} /></Pressable> }} />
    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={b.accent} />} contentContainerStyle={{ padding: 16, paddingBottom: safe.bottom + 24, gap: 16 }}>
      {loading && !player && <ActivityIndicator color={b.accent} />}
      {!!error && <View style={card}><Text accessibilityRole="alert" style={{ color: b.danger }}>{error}</Text><Pressable accessibilityRole="button" onPress={load} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.accent }}>Try again</Text></Pressable></View>}
      {!!shareError && <Text accessibilityRole="alert" style={{ color: b.danger }}>{shareError}</Text>}
      {player && <>
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${player.name}'s photo`} disabled={!player.image_url} onPress={() => setPhoto(player.image_url)} style={{ width: 88, height: 88, borderRadius: 44, overflow: 'hidden', backgroundColor: b.surface, justifyContent: 'center', alignItems: 'center' }}>{player.image_url ? <Image source={{ uri: player.image_url }} style={{ width: 88, height: 88 }} contentFit="cover" /> : <Text style={{ fontSize: 38, fontWeight: '700', color: b.accent }}>{player.name.charAt(0)}</Text>}</Pressable>
          <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '800', color: b.premium, textAlign: 'center' }}>{player.name}</Text>
          {!!instagramUrl(player.instagram_link) && <Pressable accessibilityRole="link" accessibilityLabel={`Open ${player.name}'s Instagram`} onPress={() => { const url = instagramUrl(player.instagram_link); if (url) void Linking.openURL(url).catch(() => setShareError('Could not open Instagram. Please try again.')); }} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: b.surface, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="logo-instagram" size={23} color={b.accent} /></Pressable>}
          <LocalFollowButton playerId={player.id} name={player.name} />
          {!!player.category && <Text style={{ color: b.accent, fontWeight: '600' }}>{player.category}</Text>}
          <Text style={{ color: b.muted, textAlign: 'center', lineHeight: 21 }}>{[player.home_club, player.nationality].filter(Boolean).join(' · ') || '4M Padel player'}</Text>
        </View>
        <View style={{ ...card, flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8 }}>{[['SAPA rank', sapaRank ? `#${sapaRank}` : '—'], ['Points', playerPoints(player.points)], ['Skill rating', player.skill_rating == null ? '—' : String(player.skill_rating)]].map(([label, value]) => <View key={label} style={{ flex: 1, alignItems: 'center', gap: 6 }}><Text style={{ color: b.premium, fontSize: 17, fontWeight: '700' }}>{value}</Text><Text style={{ color: b.muted, fontSize: 12, textAlign: 'center' }}>{label}</Text></View>)}</View>
        {fipLink && <View style={{ ...card, backgroundColor: '#EAF0FF', borderColor: '#B7C9FF', borderWidth: 1.5, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><Text style={{ color: '#173FB8', fontSize: 13, fontWeight: '800', letterSpacing: 1 }}>FIP PROFILE</Text><Text style={{ color: '#173FB8', fontSize: 11, fontWeight: '700', backgroundColor: '#D7E2FF', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 }}>{fipLink.status === 'verified' ? 'Record verified' : 'Link pending'}</Text></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {!!(fipLive?.photoUrl || fipLink.fip_photo_url) && <Image source={{ uri: (fipLive?.photoUrl || fipLink.fip_photo_url)! }} style={{ width: 48, height: 48, borderRadius: 12 }} contentFit="cover" />}
            <View style={{ flex: 1, gap: 3 }}><Text style={{ color: b.premium, fontWeight: '700' }}>{fipLink.fip_player_name}</Text><Text style={{ color: b.muted }}>{[fipLive?.nationality || fipLink.fip_nationality, (fipLive?.hand || fipLink.fip_hand) && `${fipLive?.hand || fipLink.fip_hand}-handed`, (fipLive?.side || fipLink.fip_side) && `${fipLive?.side || fipLink.fip_side} side`].filter(Boolean).join(' · ') || 'FIP player'}</Text></View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}><Text style={{ color: '#173FB8', fontSize: currentFipRank ? 28 : 17, fontWeight: '800' }}>{currentFipRank ? `#${currentFipRank}` : 'Not listed'}</Text><Text style={{ color: '#425A93', fontSize: 12 }}>Current FIP rank</Text></View>
          {officialFip?.premierBestRank != null && <Text style={{ color: '#294987', fontSize: 13 }}>Premier Padel career best #{officialFip.premierBestRank}</Text>}
          {(fipLive?.points ?? fipLink.fip_points) != null && <Text style={{ color: '#425A93', fontSize: 13 }}>{playerPoints(fipLive?.points ?? fipLink.fip_points)} FIP points</Text>}
          {!!fipLink.fip_profile_url && <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(fipLink.fip_profile_url!).catch(() => setShareError('Could not open FIP profile. Please try again.'))} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: '#2449D8', fontWeight: '700' }}>View official FIP profile ↗</Text></Pressable>}
          <Text style={{ color: '#425A93', fontSize: 12 }}>{fipLink.status === 'verified' ? 'The FIP record and player name were checked automatically. Account ownership was not checked.' : 'This FIP link has not yet passed the automatic source check.'}</Text>
        </View>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{['Overview', 'Form', 'Rankings', 'Matches', 'Gallery'].map(label => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: tab === label }} onPress={() => setTab(label)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 22, backgroundColor: tab === label ? b.premium : b.elevated, borderWidth: 1, borderColor: b.edge }}><Text style={{ color: tab === label ? '#FFFFFF' : b.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text></Pressable>)}</ScrollView>
        {tab === 'Overview' && <PlayerOverview player={player} />}
        {tab === 'Form' && <PlayerForm player={player} />}
        {tab === 'Rankings' && <>{!player.rankings.length && <Empty>No published rankings for this player yet.</Empty>}{player.rankings.map((r, index) => <View key={index} style={card}><Pressable accessibilityRole="button" accessibilityState={{ expanded: ranking === index }} onPress={() => setRanking(ranking === index ? null : index)} style={{ minHeight: 48, flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={{ flex: 1, gap: 5 }}><Text style={{ color: b.accent, fontWeight: '700' }}>{r.org || 'Ranking'}</Text><Text style={{ color: b.premium }}>{[r.age_group || r.division, r.match_type].filter(Boolean).join(' · ')}</Text></View><View style={{ alignItems: 'flex-end', gap: 5 }}><Text style={{ color: b.premium, fontWeight: '700' }}>{publicRank(r.rank)}</Text><Text style={{ color: b.muted }}>{playerPoints(r.points)} pts</Text></View><Ionicons name={ranking === index ? 'chevron-up' : 'chevron-down'} size={18} color={b.muted} /></Pressable>{ranking === index && <><Text style={{ color: b.muted, fontSize: 12 }}>TOURNAMENT RESULTS</Text>{r.details?.length ? r.details.map((result, i) => <View key={i} style={{ paddingVertical: 12, borderTopWidth: 1, borderColor: b.edge, flexDirection: 'row', gap: 12 }}><View style={{ flex: 1, gap: 5 }}><Text style={{ color: b.premium, fontWeight: '600' }}>{result.name || 'Tournament'}</Text><Text style={{ color: b.muted, fontSize: 12 }}>{[result.date, result.class, result.place ? `Place ${result.place}` : ''].filter(Boolean).join(' · ')}</Text></View><Text style={{ color: b.accent }}>{pointsGain(result.points)}</Text></View>) : <Text style={{ color: b.muted }}>No points breakdown published.</Text>}</>}</View>)}</>}
        {tab === 'Matches' && <>{!player.rankedin_id ? <Empty>No linked match history is available.</Empty> : matchError ? <Empty>{matchError}</Empty> : !matches ? <ActivityIndicator color={b.accent} /> : <>{[['Upcoming', matches.upcoming], ['Recent results', matches.past]].map(([label, rows]) => <View key={String(label)} style={{ gap: 12 }}><Heading>{String(label)}</Heading>{typeof rows !== 'string' && (rows.length ? rows.map((match, index) => <PlayerMatchCard key={matchKey(match, index)} match={match} upcoming={label === 'Upcoming'} />) : <Text style={{ color: b.muted }}>No published matches.</Text>)}</View>)}</>}</>}
        {tab === 'Gallery' && <>{!gallery.length ? <Empty>No photos added yet.</Empty> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{gallery.map((uri, index) => <Pressable key={uri} accessibilityRole="button" accessibilityLabel={`Open photo ${index + 1}`} onPress={() => setPhoto(uri)} style={{ width: '47%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: b.surface }}><Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /></Pressable>)}</View>}</>}
      </>}
    </ScrollView>
    <Modal visible={!!photo} animationType="fade" onRequestClose={() => setPhoto(null)}><View style={{ flex: 1, backgroundColor: b.page, paddingTop: safe.top, paddingBottom: safe.bottom }}><Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={() => setPhoto(null)} style={{ alignSelf: 'flex-end', minHeight: 48, minWidth: 64, justifyContent: 'center' }}><Text style={{ color: b.accent }}>Done</Text></Pressable>{photo && <Image source={{ uri: photo }} style={{ flex: 1 }} contentFit="contain" />}</View></Modal>
  </View>;
}
function Heading({ children }: { children: React.ReactNode }) { return <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 16, fontWeight: '700' }}>{children}</Text>; }
function Empty({ children }: { children: React.ReactNode }) { return <View style={card}><Text style={{ color: b.muted, lineHeight: 23 }}>{children}</Text></View>; }
