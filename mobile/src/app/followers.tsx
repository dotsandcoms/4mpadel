import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayerFollowers } from '@/hooks/use-player-followers';
import { ErrorBanner } from '@/components/error-banner';
import type { PlayerFollower } from '@/lib/player-followers';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

const BLUE = '#2449D8';

export default function FollowersScreen() {
  const { playerId, playerName } = useLocalSearchParams<{ playerId?: string; playerName?: string }>();
  const router = useRouter(), safe = useSafeAreaInsets();
  const state = usePlayerFollowers(typeof playerId === 'string' ? playerId : '');
  const openPlayer = (id: string) => router.push({ pathname: '/players/[id]', params: { id } });

  const renderFollower = ({ item }: { item: PlayerFollower }) => <FollowerRow follower={item} onPress={() => openPlayer(item.id)} />;
  return <View style={{ flex: 1, backgroundColor: b.page }}>
    <Stack.Screen options={{ headerShown: true, title: 'Followers', headerBackButtonDisplayMode: 'minimal', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false }} />
    <FlatList data={state.followers} keyExtractor={item => item.id} renderItem={renderFollower}
      contentContainerStyle={{ padding: 20, paddingBottom: safe.bottom + 24, gap: 10, flexGrow: 1 }}
      refreshControl={<RefreshControl colors={[loadingBlue]} refreshing={state.refreshing} onRefresh={state.refresh} tintColor={BLUE} />}
      onEndReached={() => { if (!state.moreError) void state.loadMore(); }} onEndReachedThreshold={0.3}
      ListHeaderComponent={<View style={{ gap: 6, paddingBottom: 12 }}>
        <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 22, fontWeight: '600' }}>{playerName ? `Following ${playerName}` : 'People following you'}</Text>
        <Text style={{ color: b.muted, fontSize: 14, lineHeight: 21 }}>Public player profiles, newest followers first</Text>
        {!!state.error && !!state.followers.length && <Text accessibilityRole="alert" style={{ color: b.danger, lineHeight: 21 }}>{state.error}</Text>}
      </View>}
      ListEmptyComponent={state.loading ? <ActivityIndicator accessibilityLabel="Loading followers" color={BLUE} style={{ marginTop: 32 }} />
        : <View style={{ backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, borderRadius: 20, padding: 24, gap: 12 }}>
          <Ionicons name="people-outline" size={28} color={BLUE} />
          <Text accessibilityRole={state.error ? 'alert' : 'header'} style={{ color: b.premium, fontSize: 17, fontWeight: '700' }}>{state.signInRequired ? 'Sign in to see followers' : state.error ? 'Followers couldn’t load' : state.total ? 'No public follower profiles yet' : 'No followers yet'}</Text>
          <Text style={{ color: b.muted, lineHeight: 22 }}>{state.signInRequired ? 'Follower lists are available when you’re signed in.' : state.error || (state.total ? 'Followers with a public player profile will appear here.' : playerName ? 'Players following this profile will appear here.' : 'When someone follows you, they’ll appear here.')}</Text>
          {(state.error || state.signInRequired) && <Pressable accessibilityRole="button" onPress={() => state.signInRequired ? router.push('/(auth)/sign-in') : void state.refresh()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: BLUE, fontWeight: '700' }}>{state.signInRequired ? 'Sign in' : 'Try again'}</Text></Pressable>}
        </View>}
      ListFooterComponent={<View style={{ gap: 12, paddingTop: 8 }}>
        {state.loadingMore && <ActivityIndicator accessibilityLabel="Loading more followers" color={BLUE} />}
        {!!state.moreError && <View style={{ gap: 4 }}><Text accessibilityRole="alert" style={{ color: b.danger }}>{state.moreError}</Text><Pressable accessibilityRole="button" onPress={() => void state.loadMore()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: BLUE, fontWeight: '700' }}>Try again</Text></Pressable></View>}
        {!state.loading && !state.hasMore && state.total > state.followers.length && !!state.followers.length && <Text style={{ color: b.muted, fontSize: 12, lineHeight: 18 }}>Only followers with a public player profile appear in this list.</Text>}
      </View>} />
    <ErrorBanner message={state.error || state.moreError} top={safe.top + 10} />
  </View>;
}

export function FollowerRow({ follower, onPress }: { follower: PlayerFollower; onPress: () => void }) {
  const initials = follower.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('');
  return <Pressable accessibilityRole="button" accessibilityLabel={`View ${follower.name}'s player profile`} onPress={onPress}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 80, padding: 14, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, borderRadius: 18 }}>
      <View style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden', backgroundColor: '#EAF0FF', alignItems: 'center', justifyContent: 'center' }}>
        {follower.imageUrl ? <Image source={{ uri: follower.imageUrl }} contentFit="cover" style={{ width: 48, height: 48 }} /> : <Text style={{ color: BLUE, fontSize: 16, fontWeight: '700' }}>{initials}</Text>}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={{ color: b.premium, fontSize: 16, lineHeight: 22, fontWeight: '700' }}>{follower.name}</Text>{!!follower.homeClub && <Text style={{ color: b.muted, fontSize: 12, lineHeight: 17 }}>{follower.homeClub}</Text>}</View>
      <Ionicons name="chevron-forward" size={18} color={b.muted} />
    </View>
  </Pressable>;
}
