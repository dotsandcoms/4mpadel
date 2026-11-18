import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SwipeCards } from './swipe-cards';
import type { PremierArticle } from '@/lib/premier-news';
import { lightBrand as b } from '@/theme/tokens';

export function PremierNewsRail({ articles, onOpen }: { articles: PremierArticle[]; onOpen: (url: string) => void }) {
  return <SwipeCards items={articles} itemKey={article => article.url} renderCard={article => (
    <Pressable accessibilityRole="button" accessibilityLabel={article.title} onPress={() => onOpen(article.url)} style={styles.card}>
      {article.image && <Image accessible={false} source={{ uri: article.image }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />}
      <View style={styles.body}>
        <Text style={styles.meta}>Premier Padel{article.date ? ` · ${article.date}` : ''}</Text>
        <Text style={styles.headline}>{article.title}</Text>
      </View>
    </Pressable>
  )} />;
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: b.edge, backgroundColor: b.surface, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 2, backgroundColor: b.elevated },
  body: { gap: 6, padding: 14 },
  meta: { color: b.muted, fontSize: 12, lineHeight: 16 },
  headline: { color: b.premium, fontSize: 17, lineHeight: 23, fontWeight: '700' },
});
