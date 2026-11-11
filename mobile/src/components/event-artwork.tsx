import { Image, type ImageProps } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { featuredBackgroundSource, type CalendarEvent } from '@/lib/home';
import { lightBrand as b } from '@/theme/tokens';

/** Local events use the same bundled tier artwork as the website. */
export function EventArtwork({ uri, event, style }: {
  uri?: string | null;
  event?: Pick<CalendarEvent, 'sapa_status' | 'event_name'>;
  style: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const source: ImageProps['source'] = uri && uri !== failed ? { uri } : event ? featuredBackgroundSource(event) : null;
  return <View style={[s.artwork, style]}>
    {source ? <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={120} onError={() => setFailed(uri ?? null)} />
      : <SymbolView name={{ ios: 'tennisball', android: 'sports_tennis', web: 'sports_tennis' }} size={28} tintColor={b.muted} />}
  </View>;
}

const s = StyleSheet.create({
  artwork: { backgroundColor: b.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: '#0000001A' },
});
