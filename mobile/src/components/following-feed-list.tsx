import { trackEvent } from '@/lib/analytics';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Animated, type FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View, type FlatListProps, type ListRenderItemInfo } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MenuView } from '@expo/ui/community/menu';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeAction } from '@/components/home-action';
import { TourTarget, ContextualTip } from '@/components/guided-tour';
import { ActivityCard, FeedEmpty, FeedError, FollowPlayersPrompt } from '@/components/following-feed';
import { useFollowingFeed } from '@/hooks/use-following-feed';
import { FEED_FILTERS, type FeedFilter, type FeedItem } from '@/lib/following-feed';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

const filterLabels: Record<FeedFilter, string> = {
  all: 'All updates',
  players: 'Players',
  matches: 'Matches',
  tournaments: 'Tournaments',
};
const supportsNativeMenu = Platform.OS === 'ios' || Platform.OS === 'android';

/** The same account-scoped, paginated feed on Home and the standalone route. */
export function FollowingFeedList({ header, bottomPadding, horizontalPadding = 16, onTourScrollReady, onScroll }: {
  header?: ReactElement; bottomPadding?: number; horizontalPadding?: number; onTourScrollReady?: (reveal: () => void) => void;
  onScroll?: FlatListProps<FeedItem>['onScroll'];
}) {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const list = useRef<FlatList<FeedItem>>(null);
  useEffect(() => { onTourScrollReady?.(() => list.current?.scrollToOffset({ offset: 0, animated: false })); }, [onTourScrollReady]);
  const renderItem = useCallback(({ item }: ListRenderItemInfo<FeedItem>) => <ActivityCard item={item} />, []);
  const state = useFollowingFeed(filter), router = useRouter(), safe = useSafeAreaInsets();
  const selectFilter = (value: FeedFilter) => {
    void trackEvent('feature_interaction', { feature: 'following_feed', action: 'filter', selection: value });
    list.current?.scrollToOffset({ offset: 0, animated: false });
    setFilter(value);
  };
  return <Animated.FlatList ref={list} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7} data={state.items} keyExtractor={item => item.id} renderItem={renderItem}
    onScroll={onScroll} scrollEventThrottle={16}
    showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic"
    contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingBottom: bottomPadding ?? safe.bottom + 24, gap: 12 }}
    ListHeaderComponent={<View>{header}
      <TourTarget id="following.tools" onReveal={() => list.current?.scrollToOffset({ offset: 0, animated: false })}>
        <View style={styles.headingRow}>
          <Text accessibilityRole="header" style={styles.heading}>Catch up</Text>
          {supportsNativeMenu && <MenuView
            actions={FEED_FILTERS.map(value => ({ id: value, title: filterLabels[value], state: filter === value ? 'on' : 'off' }))}
            onPressAction={({ nativeEvent }) => {
              const value = FEED_FILTERS.find(option => option === nativeEvent.event);
              if (value) selectFilter(value);
            }}>
            <View accessible accessibilityRole="button" accessibilityLabel={`Filter updates, ${filterLabels[filter]}`} style={styles.filterTrigger}>
              <Text style={styles.filterLabel}>{filterLabels[filter]}</Text>
              <Ionicons name="chevron-down" size={15} color={b.accent} accessible={false} />
            </View>
          </MenuView>}
        </View>
        <View style={styles.playersLink}>
          <HomeAction label="Your players" kind="link" size="small" icon="following" accessibilityLabel="Your players, manage followed players" onPress={() => router.push('/rankings?view=Following')} />
        </View>
        {!supportsNativeMenu && <View accessibilityRole="tablist" accessibilityLabel="Following updates" style={styles.fallbackFilters}>
          {FEED_FILTERS.map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: filter === value }} onPress={() => selectFilter(value)} style={[styles.fallbackTab, filter === value && styles.selectedTab]}>
            <Text style={[styles.fallbackLabel, filter === value && styles.selectedLabel]}>{filterLabels[value]}</Text>
          </Pressable>)}
        </View>}
      </TourTarget>
      <ContextualTip chapter="following" style={{ marginTop: 12 }} />
      {!state.loading && !state.error && !!state.userId && state.items.length > 0 && state.followedPlayers.length === 0 && <View style={{ marginTop: 12 }}><FollowPlayersPrompt /></View>}
    </View>}
    refreshControl={<RefreshControl colors={[loadingBlue]} refreshing={state.refreshing} onRefresh={() => void state.refresh()} tintColor={loadingBlue} />}
    onEndReached={() => { if (!state.error && !state.loading && !state.refreshing) void state.loadMore(); }} onEndReachedThreshold={0.4}
    ListEmptyComponent={state.loading ? <ActivityIndicator color={loadingBlue} style={{ padding: 32 }} accessibilityLabel="Loading Following updates" /> : state.error ? <FeedError message={state.error} onRetry={() => void state.refresh()} /> : <FeedEmpty signedIn={!!state.userId} filter={filter} hasFollowedPlayers={state.followedPlayers.length > 0} />}
    ListFooterComponent={state.items.length ? <View style={{ gap: 12 }}>{state.error && <FeedError message={state.error} onRetry={() => void (state.moreError ? state.loadMore() : state.refresh())} />}{state.loadingMore ? <ActivityIndicator color={loadingBlue} style={{ padding: 16 }} /> : state.hasMore ? <Pressable accessibilityRole="button" onPress={() => void state.loadMore()} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '700' }}>Load more updates</Text></Pressable> : <Text style={{ color: b.faint, textAlign: 'center', fontSize: 12, padding: 16 }}>You’re all caught up. Updates cover the last 90 days.</Text>}</View> : null} />;
}

const styles = StyleSheet.create({
  headingRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  heading: { flexGrow: 1, flexShrink: 1, color: b.premium, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  filterTrigger: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14, borderWidth: 1, borderColor: b.edge, borderRadius: 24, backgroundColor: b.elevated },
  filterLabel: { color: b.premium, fontSize: 13, fontWeight: '700' },
  playersLink: { alignSelf: 'flex-start', marginTop: 2 },
  fallbackFilters: { flexDirection: 'row', backgroundColor: b.surface, borderRadius: 12, padding: 3, marginTop: 6 },
  fallbackTab: { flex: 1, minHeight: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  selectedTab: { backgroundColor: b.accent },
  fallbackLabel: { fontSize: 12, textAlign: 'center', fontWeight: '700', color: b.muted },
  selectedLabel: { color: '#FFFFFF' },
});
