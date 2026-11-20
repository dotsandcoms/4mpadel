import { type ReactNode, useRef, useState } from 'react';
import { FlatList, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { HomeAction } from './home-action';
import { lightBrand as b } from '@/theme/tokens';

export function SwipeCards<T>({ items, itemKey, renderCard, compact = false, maxCardWidth }: {
  items: T[]; itemKey: (item: T) => string; renderCard: (item: T, index: number, current: boolean) => ReactNode;
  compact?: boolean; maxCardWidth?: number;
}) {
  const { width, fontScale } = useWindowDimensions();
  const [viewport, setViewport] = useState(width - 40), [page, setPage] = useState(0);
  const list = useRef<FlatList<T>>(null);
  const gap = 12;
  const fullWidth = items.length > 1 ? viewport - 16 : viewport;
  const compactWidth = fontScale > 1.5 ? fullWidth : Math.min(184, Math.round(viewport * (fontScale > 1.15 ? .54 : .44)));
  const cardWidth = Math.max(1, maxCardWidth ? Math.min(fullWidth, maxCardWidth) : compact ? compactWidth : fullWidth);
  const stride = cardWidth + gap;
  const canScroll = items.length * stride - gap > viewport;
  const current = canScroll ? Math.min(page, items.length - 1) : 0;
  const go = (next: number) => {
    setPage(next);
    list.current?.scrollToOffset({ offset: next * stride, animated: true });
  };
  const updatePage = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = nativeEvent.targetContentOffset?.x ?? nativeEvent.contentOffset.x;
    setPage(Math.max(0, Math.min(items.length - 1, Math.round(offset / stride))));
  };
  return <View onLayout={event => setViewport(event.nativeEvent.layout.width)} style={{ minWidth: 0 }}>
    <FlatList ref={list} horizontal data={items} keyExtractor={itemKey} showsHorizontalScrollIndicator={false} scrollsToTop={false}
      style={{ flexGrow: 0 }} scrollEnabled={canScroll} decelerationRate="fast" snapToInterval={stride} disableIntervalMomentum
      contentContainerStyle={{ gap, paddingEnd: canScroll ? viewport - cardWidth : 0 }}
      onScrollEndDrag={updatePage} onMomentumScrollEnd={updatePage} extraData={current}
      renderItem={({ item, index }) => <View style={{ width: cardWidth }}>{renderCard(item, index, index === current)}</View>} />
    {canScroll && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingTop: 4 }}>
      <HomeAction kind="icon" icon="previous" label="Previous card" disabled={current === 0} onPress={() => go(current - 1)} />
      <Text accessibilityLiveRegion="polite" accessibilityLabel={`Card ${current + 1} of ${items.length}`} style={{ fontSize: 12, color: b.muted, fontVariant: ['tabular-nums'] }}>{current + 1} of {items.length}</Text>
      <HomeAction kind="icon" icon="next" label="Next card" disabled={current >= items.length - 1} onPress={() => go(current + 1)} />
    </View>}
  </View>;
}
