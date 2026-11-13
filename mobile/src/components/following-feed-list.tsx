import { trackEvent } from '@/lib/analytics';
import { useCallback, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View, type ListRenderItemInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeAction } from '@/components/home-action';
import { ActivityCard, FeedEmpty, FeedError } from '@/components/following-feed';
import { useFollowingFeed } from '@/hooks/use-following-feed';
import { FEED_FILTERS, type FeedFilter, type FeedItem } from '@/lib/following-feed';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

/** The same account-scoped, paginated feed on Home and the standalone route. */
export function FollowingFeedList({ header, bottomPadding, horizontalPadding = 16 }: {
  header?: ReactElement; bottomPadding?: number; horizontalPadding?: number;
}) {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const list = useRef<FlatList<FeedItem>>(null);
  const renderItem = useCallback(({ item }: ListRenderItemInfo<FeedItem>) => <ActivityCard item={item} />, []);
  const state = useFollowingFeed(filter), router = useRouter(), safe = useSafeAreaInsets();
  return <FlatList ref={list} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7} data={state.items} keyExtractor={item => item.id} renderItem={renderItem}
    showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingBottom: bottomPadding ?? safe.bottom + 24, gap: 12 }}
    ListHeaderComponent={<View>{header}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Text style={{ flex: 1, color: b.premium, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 }}>Latest updates</Text>
        <HomeAction label="Your players" kind="outline" size="small" icon="following" accessibilityLabel="Manage followed players" onPress={() => router.push('/rankings?view=Following')} />
      </View>
      <View accessibilityRole="tablist" accessibilityLabel="Following updates" style={{ flexDirection: 'row', backgroundColor: b.surface, borderRadius: 12, padding: 3, marginBottom: 2 }}>{FEED_FILTERS.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => {
        void trackEvent('feature_interaction', { feature: 'following_feed', action: 'filter', selection: value });
        list.current?.scrollToOffset({ offset: 0, animated: false }); setFilter(value);
      }} style={{ flex: 1, minHeight: 44, backgroundColor: filter === value ? b.accent : 'transparent', borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: value === 'tournaments' ? 11 : 12, fontWeight: '700', color: filter === value ? '#FFF' : b.muted }}>{value[0].toUpperCase() + value.slice(1)}</Text></Pressable>)}</View>
    </View>}
    refreshControl={<RefreshControl colors={[loadingBlue]} refreshing={state.refreshing} onRefresh={() => void state.refresh()} tintColor={loadingBlue} />}
    onEndReached={() => { if (!state.error && !state.loading && !state.refreshing) void state.loadMore(); }} onEndReachedThreshold={0.4}
    ListEmptyComponent={state.loading ? <ActivityIndicator color={loadingBlue} style={{ padding: 32 }} accessibilityLabel="Loading Following updates" /> : state.error ? <FeedError message={state.error} onRetry={() => void state.refresh()} /> : <FeedEmpty signedIn={!!state.userId} filter={filter} />}
    ListFooterComponent={state.items.length ? <View style={{ gap: 12 }}>{state.error && <FeedError message={state.error} onRetry={() => void (state.moreError ? state.loadMore() : state.refresh())} />}{state.loadingMore ? <ActivityIndicator color={loadingBlue} style={{ padding: 16 }} /> : state.hasMore ? <Pressable accessibilityRole="button" onPress={() => void state.loadMore()} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '700' }}>Load more updates</Text></Pressable> : <Text style={{ color: b.faint, textAlign: 'center', fontSize: 12, padding: 16 }}>You’re all caught up. Updates cover the last 90 days.</Text>}</View> : null} />;
}
