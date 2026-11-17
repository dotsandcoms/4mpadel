import { type ReactNode, useRef, useState } from 'react';
import { FlatList, Text, View, useWindowDimensions } from 'react-native';
import { HomeAction } from './home-action';
import { lightBrand as b } from '@/theme/tokens';

/** Each rail measures its own viewport; a single card always fills it. */
export function SwipeCards<T>({ items, itemKey, renderCard, controls = false, compact = false }: { items: T[]; itemKey: (item: T) => string; renderCard: (item: T, index: number, current: boolean) => ReactNode; controls?: boolean; compact?: boolean }) {
  const { width, fontScale } = useWindowDimensions();
  const [viewport, setViewport] = useState(width - 40), [page, setPage] = useState(0);
  const list = useRef<FlatList<T>>(null);
  const cardWidth = compact ? fontScale > 1.5 ? viewport - 16 : Math.min(184, Math.round(viewport * (fontScale > 1.15 ? .54 : .44))) : items.length > 1 ? viewport - 16 : viewport;
  const current = Math.min(page, Math.max(0, items.length - 1));
  const go = (next: number) => { setPage(next); list.current?.scrollToOffset({ offset: next * (cardWidth + 12), animated: true }); };
  return <View onLayout={event => setViewport(event.nativeEvent.layout.width)} style={{ minWidth: 0 }}>
    <FlatList ref={list} horizontal data={items} keyExtractor={itemKey} showsHorizontalScrollIndicator={false} scrollsToTop={false}
      style={{ flexGrow: 0 }} decelerationRate="fast" snapToInterval={cardWidth + 12} disableIntervalMomentum
      contentContainerStyle={{ gap: 12, paddingRight: items.length > 1 ? 16 : 0 }}
      onMomentumScrollEnd={event => setPage(Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 12)))}
      renderItem={({ item, index }) => <View style={{ width: cardWidth }}>{renderCard(item, index, index === current)}</View>} />
    {controls && items.length > 1 && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingTop: 4 }}>
      <HomeAction kind="icon" icon="previous" label="Previous event" disabled={current === 0} onPress={() => go(current - 1)} />
      <Text accessibilityLabel={`Event ${current + 1} of ${items.length}`} style={{ fontSize: 12, color: b.muted, fontVariant: ['tabular-nums'] }}>{current + 1} of {items.length}</Text>
      <HomeAction kind="icon" icon="next" label="Next event" disabled={current >= items.length - 1} onPress={() => go(current + 1)} />
    </View>}
  </View>;
}
