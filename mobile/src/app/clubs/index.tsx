import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import { getForegroundPermissionsAsync } from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { HomeAction } from '@/components/home-action';
import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { ErrorBanner } from '@/components/error-banner';
import { ClubIdentity } from '@/components/club-identity';
import { clubCourts, clubLocation, fetchClubs, fetchClubGroups, filterClubGroups, filterClubs, type ClubGroup, type Club, type Coordinate } from '@/lib/clubs';
import { locateNearbyClubs } from '@/lib/club-location';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

export default function ClubsScreen() {
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [groups, setGroups] = useState<ClubGroup[]>([]), [groupError, setGroupError] = useState('');
  const [directory, setDirectory] = useState('venues');
  const [query, setQuery] = useState(''), [origin, setOrigin] = useState<Coordinate | null>(null), [radius, setRadius] = useState('25');
  const [locating, setLocating] = useState(false), [locationNotice, setLocationNotice] = useState(''), [settingsNeeded, setSettingsNeeded] = useState(false);
  const locationRequest = useRef(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setGroupError('');
    void fetchClubGroups(controller.signal, revision > 0).then(value => { if (!controller.signal.aborted) setGroups(value); }).catch(() => { if (!controller.signal.aborted) setGroupError('Club groups couldn’t load. Pull down to retry.'); });
    void fetchClubs(controller.signal, revision > 0).then(rows => { if (!controller.signal.aborted) setClubs(rows); }).catch(() => { if (!controller.signal.aborted) setError('Clubs couldn’t load. Please try again.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => () => { locationRequest.current++; }, []);
  useEffect(() => {
    let live = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active' || !settingsNeeded) return;
      // Returning from Settings only refreshes the button; a tap still starts location access.
      void getForegroundPermissionsAsync().then(permission => {
        if (live && (permission.granted || permission.canAskAgain)) { setSettingsNeeded(false); setLocationNotice(''); }
      }).catch(() => { /* Manual search remains available. */ });
    });
    return () => { live = false; subscription.remove(); };
  }, [settingsNeeded]);
  const rows = useMemo(() => filterClubs(clubs, query, origin, Number(radius)), [clubs, query, origin, radius]);
  const groupMatches = useMemo(() => query.trim() && !origin ? filterClubGroups(groups, query) : [], [groups, query, origin]);
  async function nearMe() {
    if (locating) return;
    const request = ++locationRequest.current;
    setLocating(true); setLocationNotice(''); setSettingsNeeded(false);
    try {
      const result = await locateNearbyClubs();
      if (request !== locationRequest.current) return;
      if (result.kind === 'located') { setOrigin(result.coordinate); }
      else if (result.kind === 'denied') { setSettingsNeeded(!result.canAskAgain); setLocationNotice(result.canAskAgain ? 'Location permission was declined. You can try again or search by club, city or province.' : 'Location access is off. Update it in app settings, or keep searching by club, city or province.'); }
      else setLocationNotice('Your location is unavailable. Try again or search by city or province.');
    } catch { if (request === locationRequest.current) setLocationNotice('Your location is unavailable. You can still search by city or province.'); }
    finally { if (request === locationRequest.current) setLocating(false); }
  }
  function showAll() { locationRequest.current++; setOrigin(null); setLocating(false); setLocationNotice(''); setSettingsNeeded(false); }
  const placeholder = 'Club, group, city or province';
  const groupCard = (group: ClubGroup) => <Pressable key={group.id} accessibilityRole="button" accessibilityLabel={`${group.name}. View venues`} onPress={() => router.push({ pathname: '/club-groups/[slug]', params: { slug: group.slug } })} style={{ padding: 16, backgroundColor: b.elevated, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <ClubIdentity club={group} /><View style={{ flex: 1, gap: 4 }}><Text style={{ color: b.premium, fontSize: 16, fontWeight: '600' }}>{group.name}</Text><Text style={{ color: b.muted, fontSize: 13 }}>{loading ? 'Loading venues…' : `${clubs.filter(club => club.groupId === group.id).length} venues`}</Text></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={b.muted} />
  </Pressable>;
  const shownGroups = query.trim() ? filterClubGroups(groups, query) : groups;
  return <>
    <Stack.Screen options={{ headerShown: true, title: 'Find clubs', headerBackTitle: 'Back', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false }} />
    {Platform.OS !== 'web' && <Stack.SearchBar placeholder={placeholder} hideWhenScrolling={false} hideNavigationBar={false} obscureBackground={false} placement="stacked" tintColor={b.accent} onChangeText={event => setQuery(event.nativeEvent.text)} />}
    <FlatList style={{ flex: 1, backgroundColor: b.page }} data={directory === 'venues' ? rows : []} keyExtractor={row => row.club.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="automatic" removeClippedSubviews={false}
      contentContainerStyle={{ padding: 20, paddingBottom: 36, gap: 12 }} refreshing={loading && clubs.length > 0} onRefresh={() => setRevision(value => value + 1)}
      ListHeaderComponent={<View style={{ gap: 16, paddingBottom: 4 }}>
        {Platform.OS === 'web' && <TextInput value={query} onChangeText={setQuery} placeholder={placeholder} accessibilityLabel="Search clubs" style={{ minHeight: 44, backgroundColor: b.elevated, borderRadius: 12, padding: 12, color: b.premium }} />}
        <NativeSegmentedControl label="Club directory" value={directory} options={[{ value: 'venues', label: 'Venues' }, { value: 'groups', label: 'Club groups' }]} onChange={value => { setDirectory(value); if (value === 'groups') showAll(); }} />
        {directory === 'venues' && <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 4 }}><Text style={{ color: b.premium, fontSize: 18, fontWeight: '600' }}>{origin ? 'Clubs near me' : 'Find your next court'}</Text><Text style={{ color: b.muted, fontSize: 12, lineHeight: 18 }}>{origin ? 'Approximate distance · no location saved' : 'Search a venue, or find courts near you'}</Text></View>
            {origin ? <HomeAction compact label="Show all" onPress={showAll} /> : settingsNeeded ? <HomeAction compact label="Location settings" onPress={() => void Linking.openSettings().catch(() => setLocationNotice('Open your phone’s Settings to manage location access for 4M Padel.'))} /> : <HomeAction compact label={locating ? 'Locating…' : 'Near me'} disabled={locating} onPress={() => void nearMe()} />}
          </View>
          {origin && <NativeSegmentedControl label="Nearby club radius" value={radius} options={['10', '25', '50', '100'].map(value => ({ value, label: `${value} km` }))} onChange={setRadius} />}
          {!origin && !settingsNeeded && <Text style={{ color: b.muted, fontSize: 12, lineHeight: 18 }}>Location is optional. Your phone asks for permission; it stays on this device.</Text>}
          {!!locationNotice && <Text style={{ color: b.muted, fontSize: 13, lineHeight: 19 }}>{locationNotice}</Text>}
        </View>}
        {directory === 'venues' && groupMatches.length > 0 && <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 17, fontWeight: '600' }}>Matching groups</Text>
          {groupMatches.map(groupCard)}
        </View>}
        {directory === 'groups' && <View style={{ gap: 12 }}><Text accessibilityRole="header" style={{ color: b.premium, fontSize: 18, fontWeight: '600' }}>{shownGroups.length} club groups</Text>{shownGroups.map(groupCard)}{!shownGroups.length && !loading && <Text style={{ color: b.muted }}>No club groups match your search</Text>}</View>}
        {directory === 'venues' && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text accessibilityRole="header" style={{ color: b.premium, fontSize: 19, fontWeight: '600' }}>{origin ? `Within ${radius} km` : query ? 'Venues' : 'All clubs'}</Text><Text style={{ color: b.muted, fontSize: 13 }}>{directory === 'venues' ? `${rows.length} ${rows.length === 1 ? 'club' : 'clubs'}` : ''}</Text></View>}
        {loading && clubs.length === 0 && <ActivityIndicator color={loadingBlue} accessibilityLabel="Loading clubs" />}
        {!!error && <HomeAction label="Retry clubs" onPress={() => setRevision(value => value + 1)} />}
      </View>}
      renderItem={({ item: { club, distance } }) => <Pressable accessibilityRole="button" accessibilityLabel={`${club.name}. ${clubLocation(club)}${distance !== null ? `. Approximately ${distance.toFixed(1)} kilometres away` : ''}. View club`} onPress={() => router.push({ pathname: '/clubs/[slug]', params: { slug: club.slug } })} style={{ padding: 12, borderRadius: 12, backgroundColor: b.elevated, flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 100 }}>
        {club.cover ? <Image source={{ uri: club.cover }} contentFit="cover" style={{ width: 88, height: 88, borderRadius: 8 }} /> : <ClubIdentity club={club} size={56} />}
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={{ color: b.premium, fontSize: 15, lineHeight: 21, fontWeight: '600' }}>{club.name}</Text><Text style={{ color: b.muted, fontSize: 12, lineHeight: 17 }}>{clubLocation(club)}</Text>{clubCourts(club) && <Text style={{ color: b.muted, fontSize: 12 }}>{clubCourts(club)}</Text>}{distance !== null && <Text style={{ color: b.accent, fontSize: 12, fontWeight: '600' }}>{distance < 1 ? 'Less than 1 km' : `${distance.toFixed(1)} km`} away</Text>}</View>
        <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={b.muted} />
      </Pressable>}
      ListEmptyComponent={directory === 'venues' && !loading && !error && !groupMatches.length ? <View style={{ paddingVertical: 16, gap: 8 }}><Text style={{ color: b.premium, fontSize: 16, fontWeight: '600' }}>No clubs found</Text><Text style={{ color: b.muted, fontSize: 14, lineHeight: 21 }}>{origin ? 'Try a wider radius or show all clubs. Some clubs do not have a map location yet.' : 'Try a different club name, city or province.'}</Text>{origin && <HomeAction label="Show all clubs" onPress={showAll} />}</View> : null} />
    <ErrorBanner message={error || groupError || locationNotice || null} top={8} />
  </>;
}
