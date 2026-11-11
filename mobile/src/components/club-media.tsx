import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeAction } from './home-action';
import type { ClubPhoto, ClubReview, PlaceAttribution } from '@/lib/club-places';
import { lightBrand as b } from '@/theme/tokens';

export function PhotoAttribution({ photo, onError }: { photo: ClubPhoto; onError: () => void }) {
  if (photo.source !== 'Google Maps') return photo.caption ? <Text style={{ color: b.muted, fontSize: 12 }}>{photo.caption}</Text> : null;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 4, alignItems: 'center' }}>
    <Text style={{ fontSize: 12, color: '#5E5E5E' }}>Google Maps</Text>
    <Attributions rows={photo.attributions} onError={onError} />
  </View>;
}
export function Attributions({ rows, onError }: { rows: PlaceAttribution[]; onError: () => void }) {
  return <>{rows.map((item,index) => item.url ? <Pressable key={index} accessibilityRole="link" accessibilityLabel={`Photo attribution: ${item.name}`} onPress={() => void Linking.openURL(item.url!).catch(onError)} style={{ minHeight: 32, justifyContent: 'center' }}><Text style={{ color: b.muted, fontSize: 12 }}>{item.name}</Text></Pressable> : <Text key={index} style={{ color: b.muted, fontSize: 12 }}>{item.name}</Text>)}</>;
}
export function ClubPhotoRail({ photos, onError }: { photos: ClubPhoto[]; onError: () => void }) {
  const { width } = useWindowDimensions(), safe = useSafeAreaInsets(), [index, setIndex] = useState(0), [viewer, setViewer] = useState<number | null>(null);
  const viewerScroll = useRef<ScrollView>(null);
  const page = width - 40, active = photos[Math.min(index, photos.length - 1)];
  if (!photos.length) return null;
  return <View style={{ gap: 8 }}>
    <View style={{ overflow: 'hidden', borderRadius: 16, backgroundColor: b.surface }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event => setIndex(Math.round(event.nativeEvent.contentOffset.x / page))}>
        {photos.map((photo,i) => <Pressable key={`${photo.url}:${i}`} accessibilityRole="button" accessibilityLabel={`View club photo ${i + 1} of ${photos.length}`} onPress={() => setViewer(i)}><Image source={{ uri: photo.url }} cachePolicy={photo.source === 'Google Maps' ? 'none' : 'disk'} contentFit="cover" style={{ width: page, height: 208 }} /></Pressable>)}
      </ScrollView>
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 12, right: 12, backgroundColor: '#15251FE6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ color: '#fff', fontSize: 12, fontVariant: ['tabular-nums'] }}>{Math.min(index + 1, photos.length)} / {photos.length}</Text></View>
    </View>
    {active && <PhotoAttribution photo={active} onError={onError} />}
    <Modal visible={viewer !== null} presentationStyle="fullScreen" animationType="slide" onRequestClose={() => setViewer(null)}>
      <View style={{ flex: 1, paddingTop: safe.top, paddingBottom: safe.bottom, backgroundColor: b.page }}>
        <View style={{ minHeight: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ fontSize: 16, color: b.premium }}>Club photos · {(viewer ?? 0) + 1} of {photos.length}</Text><HomeAction kind="icon" label="Close photos" icon="close" onPress={() => setViewer(null)} /></View>
        {viewer !== null && <ScrollView ref={viewerScroll} style={{ flex: 1 }} horizontal pagingEnabled onLayout={() => viewerScroll.current?.scrollTo({ x: viewer * width, animated: false })} showsHorizontalScrollIndicator={false} onMomentumScrollEnd={event => setViewer(Math.round(event.nativeEvent.contentOffset.x / width))}>
          {photos.map((photo,i) => <View key={`${photo.url}:${i}`} style={{ width, height: '100%', paddingBottom: 16 }}><Image source={{ uri: photo.url }} cachePolicy={photo.source === 'Google Maps' ? 'none' : 'disk'} contentFit="contain" style={{ width, flex: 1 }} /><View style={{ padding: 20 }}><PhotoAttribution photo={photo} onError={onError} /></View></View>)}
        </ScrollView>}
        <View style={{ paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between' }}><HomeAction compact label="Previous" icon="previous" disabled={viewer === null || viewer === 0} onPress={() => { const next = Math.max(0, (viewer ?? 0) - 1); setViewer(next); viewerScroll.current?.scrollTo({ x: next * width }); }} /><HomeAction compact label="Next" icon="next" disabled={viewer === null || viewer === photos.length - 1} onPress={() => { const next = Math.min(photos.length - 1, (viewer ?? 0) + 1); setViewer(next); viewerScroll.current?.scrollTo({ x: next * width }); }} /></View>
      </View>
    </Modal>
  </View>;
}
export function RatingStars({ rating }: { rating: number | null }) {
  return <View accessibilityLabel={rating ? `${rating} out of 5 stars` : 'Not rated'} style={{ flexDirection: 'row', gap: 2 }}>{[1,2,3,4,5].map(value => <SymbolView key={value} name={value <= Math.round(rating || 0) ? { ios: 'star.fill', android: 'star', web: 'star' } : { ios: 'star', android: 'star_border', web: 'star_border' }} size={12} tintColor={value <= Math.round(rating || 0) ? '#9A6500' : b.faint} />)}</View>;
}
export function ReviewCard({ review, onError }: { review: ClubReview; onError: () => void }) {
  const [open, setOpen] = useState(false);
  return <View style={{ width: 272, alignSelf: 'flex-start', backgroundColor: b.elevated, borderRadius: 12, padding: 16, gap: 12 }}>
    <Pressable disabled={!review.authorUrl} accessibilityRole={review.authorUrl ? 'link' : undefined} accessibilityLabel={`${review.author}. View Google profile`} onPress={() => void Linking.openURL(review.authorUrl!).catch(onError)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
      {review.avatar ? <Image source={{ uri: review.avatar }} cachePolicy="none" style={{ width: 36, height: 36, borderRadius: 18 }} /> : <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: b.surface, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: b.muted, fontWeight: '600' }}>{review.author[0]}</Text></View>}
      <View style={{ flex: 1, gap: 4 }}><Text numberOfLines={1} style={{ color: b.premium, fontSize: 14, fontWeight: '600' }}>{review.author}</Text><Text style={{ color: b.muted, fontSize: 12 }}>{review.relativeTime}</Text></View>
    </Pressable>
    <RatingStars rating={review.rating} />
    {!!review.text && <Text numberOfLines={open ? undefined : 4} style={{ color: b.premium, fontSize: 14, lineHeight: 21 }}>{review.text}</Text>}
    {review.text.length > 160 && <HomeAction compact label={open ? 'Read less' : 'Read review'} onPress={() => setOpen(value => !value)} />}
  </View>;
}
