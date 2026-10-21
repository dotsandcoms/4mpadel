import { trackEvent } from '@/lib/analytics';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View, type ListRenderItemInfo } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityCard, FeedEmpty, FeedError } from '@/components/following-feed';
import { useFollowingFeed } from '@/hooks/use-following-feed';
import { FEED_FILTERS, type FeedFilter, type FeedItem } from '@/lib/following-feed';
import { lightBrand as b } from '@/theme/tokens';
export default function FollowingScreen() {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const list = useRef<FlatList<FeedItem>>(null);
  const renderItem = useCallback(({ item }: ListRenderItemInfo<FeedItem>) => <ActivityCard item={item} />, []);
  const state = useFollowingFeed(filter), router = useRouter(), safe = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: b.page, paddingTop: safe.top }}><Stack.Screen options={{ headerShown: false }} />
    <View style={{ flexDirection: 'row', paddingHorizontal: 12, alignItems: 'center', gap: 10, paddingBottom: 6 }}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ width: 44, height: 48, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="arrow-back" size={23} color={b.premium} /></Pressable><Text style={{ flex: 1, color: b.premium, fontSize: 26, fontWeight: '800', letterSpacing: -0.7 }}>Following</Text><Pressable accessibilityRole="button" accessibilityLabel="Manage followed players" onPress={() => router.push('/rankings?view=Following')} style={{ minHeight: 48, paddingHorizontal: 8, justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '700', fontSize: 12 }}>Your players</Text></Pressable></View>
    <Text style={{ color: b.muted, fontSize: 13, paddingHorizontal: 20, marginBottom: 16 }}>The latest from your padel world.</Text>
    <View style={{ flexDirection: 'row', marginHorizontal: 16, backgroundColor: b.surface, borderRadius: 12, padding: 3, marginBottom: 14 }}>{FEED_FILTERS.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => { void trackEvent('feature_interaction', { feature: 'following_feed', action: 'filter', selection: value }); list.current?.scrollToOffset({ offset: 0, animated: false }); setFilter(value); }} style={{ flex: 1, minHeight: 44, backgroundColor: filter === value ? b.accent : 'transparent', borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: value === 'tournaments' ? 11 : 12, fontWeight: '700', color: filter === value ? '#FFF' : b.muted }}>{value[0].toUpperCase() + value.slice(1)}</Text></Pressable>)}</View>
    <FlatList ref={list} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7} data={state.items} keyExtractor={item => item.id} renderItem={renderItem} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: safe.bottom + 24, gap: 12 }}
      refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} tintColor={b.accent} />} onEndReached={() => { if (!state.error && !state.loading && !state.refreshing) void state.loadMore(); }} onEndReachedThreshold={0.4}
      ListEmptyComponent={state.loading ? <ActivityIndicator color={b.accent} style={{ padding: 32 }} accessibilityLabel="Loading Following updates" /> : state.error ? <FeedError message={state.error} onRetry={() => void state.refresh()} /> : <FeedEmpty signedIn={!!state.userId} filter={filter} />}
      ListFooterComponent={state.items.length ? <View style={{ gap: 12 }}>{state.error && <FeedError message={state.error} onRetry={() => void (state.moreError ? state.loadMore() : state.refresh())} />}{state.loadingMore ? <ActivityIndicator color={b.accent} style={{ padding: 16 }} /> : state.hasMore ? <Pressable accessibilityRole="button" onPress={() => void state.loadMore()} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '700' }}>Load more updates</Text></Pressable> : <Text style={{ color: b.faint, textAlign: 'center', fontSize: 12, padding: 16 }}>You’re all caught up. Updates cover the last 90 days.</Text>}</View> : null} />
  </View>;
}
