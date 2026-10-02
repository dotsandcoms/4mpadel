import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { fetchMyFipLink, requestFipLink, requestOfficialFipLink, verifyPendingFipLink, withdrawFipLink } from '@/lib/player-fip-link';
import { lookupOfficialFipProfile, searchProPlayers, type OfficialFipProfile, type PlayerFipLink } from '@/lib/player-hub';
import type { ProPlayer } from '@/lib/pro-padel';
import { lightBrand as b } from '@/theme/tokens';

const blue = '#2449D8';

export function LinkFipProfile({ localPlayerId, localName, embedded = false }: { localPlayerId: number; localName: string; localGender?: string | null; embedded?: boolean }) {
  const [link, setLink] = useState<PlayerFipLink | null>(null);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<ProPlayer[]>([]);
  const [officialProfiles, setOfficialProfiles] = useState<OfficialFipProfile[]>([]);
  const [profileUrl, setProfileUrl] = useState('');
  const [searchedQuery, setSearchedQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const sequence = useRef(0);

  useEffect(() => { let live = true;
    void fetchMyFipLink(localPlayerId).then(async value => {
      if (value?.status === 'pending') {
        try { await verifyPendingFipLink(localPlayerId); value = await fetchMyFipLink(localPlayerId); }
        catch (e) { if (live) setError(e instanceof Error ? e.message : 'Could not verify this FIP link.'); }
      }
      if (live) setLink(value);
    })
      .catch(() => { if (live) setError('Could not load your FIP link.'); });
    return () => { live = false; };
  }, [localPlayerId]);

  useEffect(() => {
    if (link || query.trim().length < 3) { setCandidates([]); setOfficialProfiles([]); setSearchedQuery(''); setSearching(false); return; }
    const current = ++sequence.current;
    setSearching(true); setError('');
    const timer = setTimeout(() => {
      void searchProPlayers(query.trim()).then(result => { if (sequence.current === current) { setCandidates(result.players.slice(0, 8)); setOfficialProfiles(result.officialProfiles); setSearchedQuery(query.trim()); } })
        .catch(e => { if (sequence.current === current) { setSearchedQuery(''); setError(e instanceof Error ? e.message : 'FIP search failed.'); } })
        .finally(() => { if (sequence.current === current) setSearching(false); });
    }, 600);
    return () => { clearTimeout(timer); sequence.current++; };
  }, [query, link]);

  const select = async (candidate: ProPlayer) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await requestFipLink(localPlayerId, candidate);
      setLink(await fetchMyFipLink(localPlayerId));
      setCandidates([]); setQuery('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not link this FIP player.'); }
    finally { setBusy(false); }
  };
  const selectOfficial = async (profile: OfficialFipProfile) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await requestOfficialFipLink(localPlayerId, profile.url);
      setLink(await fetchMyFipLink(localPlayerId));
      setCandidates([]); setOfficialProfiles([]); setQuery(''); setProfileUrl('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not link this FIP profile.'); }
    finally { setBusy(false); }
  };
  const findOfficial = async () => {
    if (busy || !profileUrl.trim()) return;
    setBusy(true); setError('');
    try { const profile = await lookupOfficialFipProfile(profileUrl.trim()); setOfficialProfiles([profile]); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not find that official FIP profile.'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await withdrawFipLink(localPlayerId); setLink(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove this link.'); }
    finally { setBusy(false); }
  };
  const retryVerification = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await verifyPendingFipLink(localPlayerId); setLink(await fetchMyFipLink(localPlayerId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not verify this FIP link.'); }
    finally { setBusy(false); }
  };
  const showUrlFallback = searchedQuery === query.trim() && searchedQuery.length >= 3 && !searching && !candidates.length && !officialProfiles.length;

  return <View style={embedded ? { gap: 12, paddingBottom: 16 } : { gap: 12, marginTop: 24, padding: 16, borderWidth: 1, borderColor: b.edge, borderRadius: 18, backgroundColor: b.elevated }}>
    {!embedded && <Text style={{ fontSize: 17, fontWeight: '800', color: b.premium }}>Link your FIP profile</Text>}
    <Text style={{ color: b.muted, lineHeight: 20 }}>Keep your 4M photo and details as your main profile, with your FIP ranking alongside your SAPA ranking.</Text>
    {link ? <>
      <Text style={{ color: b.premium, fontWeight: '700' }}>{link.fip_player_name} · {link.fip_rank ? `FIP #${link.fip_rank}` : 'FIP profile'}</Text>
      {link.fip_points != null && <Text style={{ color: b.muted }}>{link.fip_points.toLocaleString('en-ZA')} FIP points</Text>}
      <Text style={{ color: link.status === 'verified' ? '#226047' : blue, fontWeight: '700' }}>{link.status === 'verified' ? 'FIP record verified · Name matched' : 'FIP link awaiting source check'}</Text>
      {link.status === 'verified' && <Text style={{ color: b.muted, fontSize: 12 }}>The FIP record and name were checked automatically. Account ownership was not checked.</Text>}
      {link.status === 'pending' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void retryVerification()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: blue, fontWeight: '700' }}>{busy ? 'Checking…' : 'Retry verification'}</Text></Pressable>}
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void remove()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: blue, fontWeight: '700' }}>{busy ? 'Removing…' : 'Remove link'}</Text></Pressable>
    </> : <>
      <TextInput accessibilityLabel="Search FIP players" placeholder={`Search ${localName} on FIP`} placeholderTextColor={b.muted} value={query} onChangeText={value => { setQuery(value); setProfileUrl(''); }} autoCapitalize="words" style={{ minHeight: 48, borderWidth: 1, borderColor: b.edge, borderRadius: 12, paddingHorizontal: 12, color: b.premium, backgroundColor: b.page }} />
      {searching && <ActivityIndicator color={blue} />}
      {candidates.map(candidate => <Pressable key={candidate.id} accessibilityRole="button" accessibilityLabel={`Link ${candidate.name}, FIP rank ${candidate.rank || 'unranked'}`} disabled={busy} onPress={() => void select(candidate)} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: b.edge }}>
        {candidate.photoUrl ? <Image source={{ uri: candidate.photoUrl }} style={{ width: 42, height: 42, borderRadius: 10 }} contentFit="cover" /> : <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: b.surface }} />}
        <View style={{ flex: 1 }}><Text style={{ color: b.premium, fontWeight: '700' }}>{candidate.name}</Text><Text style={{ color: b.muted }}>FIP {candidate.rank ? `#${candidate.rank}` : 'unranked'} · {candidate.category === 'women' ? 'Women' : 'Men'}</Text></View>
      </Pressable>)}
      {officialProfiles.map(profile => <Pressable key={profile.url} accessibilityRole="button" accessibilityLabel={`Link official FIP profile for ${profile.name}`} disabled={busy} onPress={() => void selectOfficial(profile)} style={{ minHeight: 60, justifyContent: 'center', borderTopWidth: 1, borderColor: b.edge, gap: 3 }}><Text style={{ color: b.premium, fontWeight: '700' }}>{profile.name} · Official FIP profile</Text><Text style={{ color: b.muted, fontSize: 12 }}>{profile.rank ? `Current FIP #${profile.rank}` : 'Current FIP rank not listed'}{profile.premierBestRank ? ` · Premier Padel career best #${profile.premierBestRank}` : ''} · Name checked when linked</Text></Pressable>)}
      {showUrlFallback && <Text style={{ color: b.muted }}>Not found in PadelAPI. If you have an official FIP profile, paste its link below.</Text>}
      {!!candidates.length && <Text style={{ color: b.muted, fontSize: 12 }}>Select your FIP record. Its name is checked against your 4M profile before linking.</Text>}
      {showUrlFallback && <><TextInput accessibilityLabel="Official FIP player profile URL" placeholder="https://www.padelfip.com/player/your-name/" placeholderTextColor={b.muted} value={profileUrl} onChangeText={setProfileUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={{ minHeight: 48, borderWidth: 1, borderColor: b.edge, borderRadius: 12, paddingHorizontal: 12, color: b.premium, backgroundColor: b.page }} />
      {!!profileUrl.trim() && <Pressable accessibilityRole="button" disabled={busy} onPress={() => void findOfficial()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: blue, fontWeight: '700' }}>{busy ? 'Checking…' : 'Find official FIP profile'}</Text></Pressable>}</>}
    </>}
    {!!error && <Text accessibilityRole="alert" style={{ color: b.danger }}>{error}</Text>}
  </View>;
}
