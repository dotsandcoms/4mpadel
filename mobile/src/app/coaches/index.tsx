import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachPortrait } from '@/components/coach-portrait';
import { coachVenues, fetchApprovedCoaches, type CoachDirectoryEntry } from '@/lib/coaches';
import { lightBrand as brand, loadingBlue } from '@/theme/tokens';

export default function CoachesDirectory() {
  const router = useRouter();
  const safe = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const [coaches, setCoaches] = useState<CoachDirectoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void fetchApprovedCoaches(controller.signal).then(rows => {
      if (!controller.signal.aborted) setCoaches(rows);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [revision]);

  const search = query.trim().toLowerCase();
  const visibleCoaches = coaches.filter(coach => [coach.full_name, coach.city, coach.coaching_location]
    .some(value => value?.toLowerCase().includes(search)));

  return <View style={styles.screen}>
    <Stack.Screen options={{ headerShown: true, title: 'Coaches', headerBackButtonDisplayMode: 'minimal',
      headerTintColor: brand.premium, headerStyle: { backgroundColor: brand.page }, headerShadowVisible: false }} />
    <FlatList data={visibleCoaches} keyExtractor={coach => coach.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      onRefresh={refresh} refreshing={loading && coaches.length > 0} contentContainerStyle={[styles.content, { paddingBottom: safe.bottom + 18 }]}
      ListHeaderComponent={<View style={styles.header}>
        <Text accessibilityRole="header" style={styles.heading}>Find a coach</Text>
        <View style={styles.search}>
          <Ionicons name="search-outline" size={20} color={brand.muted} accessible={false} />
          <TextInput accessibilityLabel="Search coaches" placeholder="Name, city or club" placeholderTextColor={brand.placeholder}
            value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" style={styles.searchInput} />
          {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear coach search" onPress={() => setQuery('')} style={styles.clear}>
            <Ionicons name="close-circle" size={20} color={brand.muted} />
          </Pressable>}
        </View>
        {error && <View style={styles.notice}>
          <Text accessibilityRole="alert" style={styles.muted}>Coaches couldn’t load.</Text>
          <Pressable accessibilityRole="button" onPress={refresh} style={styles.retry}><Text style={styles.action}>Try again</Text></Pressable>
        </View>}
      </View>}
      ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Loading coaches" color={loadingBlue} /> : error ? null
        : <Text style={styles.muted}>{search ? 'No coaches match your search.' : 'No approved coaches are listed yet.'}</Text>}
      renderItem={({ item: coach }) => {
        const venues = coachVenues(coach.coaching_location);
        const venue = (search && venues.find(name => name.toLowerCase().includes(search))) || venues[0];
        const moreVenues = venues.length - 1;
        const city = coach.city?.trim();
        return <Pressable accessibilityRole="button" accessibilityLabel={[coach.full_name, city, ...venues.filter(name => name !== city)].filter(Boolean).join(', ')}
          onPress={() => router.push({ pathname: '/coaches/[id]', params: { id: coach.id } })} style={styles.row}>
          <View style={styles.summary}>
            <CoachPortrait coach={coach} size={48} />
            <View style={styles.identity}>
              <Text style={styles.name}>{coach.full_name}</Text>
              {!!city && city !== venue && <Text style={styles.city}>{city}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={16} color={brand.muted} accessible={false} />
          </View>
          {!!venue && <View style={styles.venues}>
            <Ionicons name="location-outline" size={16} color={brand.accent} accessible={false} />
            <Text style={styles.venue} numberOfLines={fontScale <= 1.25 ? 1 : undefined}>{venue}</Text>
            {moreVenues > 0 && <Text style={styles.moreVenues}>+{moreVenues} more</Text>}
          </View>}
        </Pressable>;
      }} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.page },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 10 },
  header: { gap: 12, paddingBottom: 6 },
  heading: { color: brand.premium, fontSize: 30, fontWeight: '800', letterSpacing: -0.7 },
  search: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 4, gap: 10, minHeight: 50,
    borderRadius: 14, borderWidth: 1, borderColor: brand.edge, backgroundColor: brand.elevated },
  searchInput: { flex: 1, minHeight: 48, fontSize: 16, color: brand.premium, paddingVertical: 8 },
  clear: { width: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  row: { backgroundColor: brand.elevated, borderColor: brand.edge, borderWidth: 1,
    borderRadius: 16, paddingHorizontal: 14 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  identity: { flex: 1, minWidth: 0, gap: 2 },
  name: { color: brand.premium, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  muted: { color: brand.muted, fontSize: 14, lineHeight: 20 },
  city: { color: brand.muted, fontSize: 13 },
  venues: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: brand.edge },
  venue: { flex: 1, color: brand.muted, fontSize: 13 },
  moreVenues: { color: brand.accent, fontSize: 12, fontWeight: '600' },
  notice: { paddingHorizontal: 12, paddingTop: 8, borderRadius: 12, backgroundColor: brand.surface },
  retry: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  action: { color: brand.accent, fontWeight: '700' },
});
