import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, Text, View } from 'react-native';
import { HomeAction } from '@/components/home-action';
import { ClubIdentity } from '@/components/club-identity';
import { ErrorBanner } from '@/components/error-banner';
import { clubLocation, fetchClubGroup, fetchGroupVenues, type ClubGroup, type Club } from '@/lib/clubs';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

export default function ClubGroupScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>(), router = useRouter();
  const [group, setGroup] = useState<ClubGroup | null>(null), [clubs, setClubs] = useState<Club[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setGroup(null); setClubs([]);
    void (async () => {
      try { const value = await fetchClubGroup(slug, controller.signal); if (controller.signal.aborted) return; setGroup(value); if (value) { const venues = await fetchGroupVenues(value.id, controller.signal); if (!controller.signal.aborted) setClubs(venues); } }
      catch { if (!controller.signal.aborted) setError('This club group couldn’t load. Please try again.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [slug, revision]);
  return <>
    <Stack.Screen options={{ headerShown: true, title: 'Club group', headerBackTitle: 'Clubs', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false }} />
    <FlatList style={{ flex: 1, backgroundColor: b.page }} data={clubs} keyExtractor={club => club.id} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 12 }}
      ListHeaderComponent={<View style={{ gap: 20, paddingBottom: 8 }}>
        {group && <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}><ClubIdentity club={group} size={64} /><View style={{ flex: 1, gap: 4 }}><Text accessibilityRole="header" style={{ fontSize: 24, lineHeight: 30, fontWeight: '600', color: b.premium }}>{group.name}</Text><Text style={{ color: b.muted, fontSize: 13 }}>{loading ? 'Loading venues…' : `${clubs.length} venues`}</Text></View></View>
          {!!group.about && <Text style={{ color: b.muted, fontSize: 15, lineHeight: 22 }}>{group.about}</Text>}
          {group.website && <HomeAction label="Group website" onPress={() => void Linking.openURL(group.website!).catch(() => setError('The group website couldn’t open. Please try again.'))} />}
          <Text accessibilityRole="header" style={{ fontSize: 19, color: b.premium, fontWeight: '600' }}>Venues & branches</Text>
        </>}
        {loading && <ActivityIndicator color={loadingBlue} />}
        {!!error && <HomeAction label="Retry group" onPress={() => setRevision(value => value + 1)} />}
      </View>}
      renderItem={({ item: club }) => <Pressable accessibilityRole="button" accessibilityLabel={`${club.name}. ${clubLocation(club)}. View club`} onPress={() => router.push({ pathname: '/clubs/[slug]', params: { slug: club.slug } })} style={{ padding: 16, backgroundColor: b.elevated, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}><ClubIdentity club={club} /><View style={{ flex: 1, gap: 4 }}><Text style={{ color: b.premium, fontSize: 15, lineHeight: 21, fontWeight: '600' }}>{club.name}</Text><Text style={{ color: b.muted, fontSize: 12, lineHeight: 17 }}>{clubLocation(club)}</Text></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={b.muted} /></Pressable>}
      ListEmptyComponent={!loading && !error ? <Text style={{ color: b.muted, fontSize: 14, lineHeight: 21 }}>{group ? 'No published venues are available yet.' : 'This group is not available in the public directory.'}</Text> : null} />
    <ErrorBanner message={error || null} top={8} />
  </>;
}
