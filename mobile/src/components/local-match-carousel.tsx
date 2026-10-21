import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LocalMatchCard } from './local-match-card';
import type { FollowedLocalMatch } from '@/lib/followed-local-matches';
import type { HubPlayer } from '@/lib/player-hub';
import { lightBrand as b } from '@/theme/tokens';

export function LocalMatchCarousel({ fixtures, directory, onPlayer }: { fixtures: FollowedLocalMatch[]; directory: HubPlayer[]; onPlayer: (id: string) => void }) {
  const { width } = useWindowDimensions();
  const [measured, setMeasured] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const rail = useRef<FlatList<FollowedLocalMatch>>(null);
  const viewport = measured ?? width - 32;
  const cardWidth = Math.min(fixtures.length > 1 ? viewport - 28 : viewport, 420);
  const step = cardWidth + 12;
  const index = Math.max(0, fixtures.findIndex(fixture => fixture.key === selected));
  const keys = fixtures.map(fixture => fixture.key).join('\n');
  useEffect(() => {
    rail.current?.scrollToOffset({ offset: index * step, animated: false });
  }, [step]);
  useEffect(() => {
    if (!fixtures.some(fixture => fixture.key === selected)) {
      setSelected(fixtures[0]?.key ?? null);
      rail.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [keys, selected]);
  const select = (next: number) => {
    if (!fixtures[next]) return;
    setSelected(fixtures[next].key);
    rail.current?.scrollToOffset({ offset: next * step, animated: true });
  };
  if (!fixtures.length) return null;
  return <View style={{ gap: 12 }} onLayout={event => setMeasured(event.nativeEvent.layout.width)}>
    {fixtures.length > 1 && <View style={s.controls}>
      <Text style={s.hint}>SWIPE TO EXPLORE</Text><View style={s.buttons}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous upcoming local match" accessibilityState={{ disabled: index === 0 }} disabled={index === 0} onPress={() => select(index - 1)} style={[s.arrow, index === 0 && s.disabled]}><Ionicons name="chevron-back" size={18} color={b.accent} /></Pressable>
        <Text accessibilityLiveRegion="polite" style={s.counter}>{index + 1} of {fixtures.length}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next upcoming local match" accessibilityState={{ disabled: index === fixtures.length - 1 }} disabled={index === fixtures.length - 1} onPress={() => select(index + 1)} style={[s.arrow, index === fixtures.length - 1 && s.disabled]}><Ionicons name="chevron-forward" size={18} color={b.accent} /></Pressable>
      </View>
    </View>}
    <FlatList ref={rail} horizontal data={fixtures} keyExtractor={fixture => fixture.key}
      showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={step} disableIntervalMomentum
      style={{ flexGrow: 0 }} contentContainerStyle={{ paddingRight: viewport - cardWidth, alignItems: 'flex-start' }}
      ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
      initialNumToRender={3} windowSize={5}
      onContentSizeChange={() => rail.current?.scrollToOffset({ offset: index * step, animated: false })}
      scrollEventThrottle={32}
      onScroll={event => {
        const next = Math.max(0, Math.min(fixtures.length - 1, Math.round(event.nativeEvent.contentOffset.x / step)));
        setSelected(fixtures[next].key);
      }}
      renderItem={({ item }) => <View style={{ width: cardWidth }}><LocalMatchCard fixture={item} directory={directory} onPlayer={onPlayer} /></View>} />
  </View>;
}
const s = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hint: { flex: 1, color: b.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: b.glass },
  disabled: { opacity: .4 },
  counter: { color: b.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
});
