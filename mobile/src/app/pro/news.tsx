import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeAction } from '@/components/home-action';
import { PremierNewsCard } from '@/components/home-premier-news';
import { fetchPremierNews, fetchPremierStory, isPremierNewsSlug, premierNewsDate, type PremierNewsPage, type PremierStory } from '@/lib/premier-news';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

export default function PremierNewsScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const close = () => router.canGoBack() ? router.back() : router.replace('/(tabs)');

  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <HomeAction kind="icon" icon="previous" label="Back" onPress={close} />
      <Text accessibilityRole="header" style={styles.heading}>Premier Padel news</Text>
    </View>
    {slug === undefined ? <NewsIndex onOpen={next => router.push({ pathname: '/pro/news', params: { slug: next } })} />
      : isPremierNewsSlug(slug) ? <NewsStory key={slug} slug={slug} />
      : <NewsMessage text="This story is unavailable." />}
  </SafeAreaView>;
}

function NewsIndex({ onOpen }: { onOpen: (slug: string) => void }) {
  const [request, setRequest] = useState({ page: 1 });
  const [feed, setFeed] = useState<PremierNewsPage>({ articles: [], nextPage: null });
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = (page: number) => {
    setBusy(true);
    setFailed(false);
    setRequest({ page });
  };
  useEffect(() => {
    let current = true;
    void fetchPremierNews(request.page, 12).then(result => {
      if (!current) return;
      setFeed(previous => ({
        nextPage: result.nextPage,
        articles: [...new Map([...previous.articles, ...result.articles].map(article => [article.slug, article])).values()],
      }));
    }).catch(() => { if (current) setFailed(true); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [request]);

  const nextPage = feed.nextPage;
  return <FlatList
    data={feed.articles}
    keyExtractor={article => article.slug}
    renderItem={({ item }) => <PremierNewsCard article={item} onOpen={onOpen} />}
    contentContainerStyle={styles.list}
    ListEmptyComponent={busy || failed ? null : <NewsMessage text="No headlines are available yet." />}
    ListFooterComponent={busy ? <View style={styles.loading}><ActivityIndicator color={loadingBlue} accessibilityLabel="Loading headlines" /></View>
      : failed ? <NewsMessage text="The headlines couldn’t load." onRetry={() => load(request.page)} />
      : nextPage !== null ? <HomeAction label="Load more" onPress={() => load(nextPage)} /> : null}
  />;
}

function NewsStory({ slug }: { slug: string }) {
  const [attempt, setAttempt] = useState(0);
  const [story, setStory] = useState<PremierStory | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void fetchPremierStory(slug).then(result => { if (current) setStory(result); })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [slug, attempt]);

  if (failed) return <NewsMessage text="This story couldn’t load." onRetry={() => { setFailed(false); setAttempt(n => n + 1); }} />;
  if (!story) return <View style={styles.loading}><ActivityIndicator color={loadingBlue} accessibilityLabel="Loading article" /></View>;
  const date = premierNewsDate(story.publishedAt);
  return <ScrollView style={styles.story} contentContainerStyle={styles.content}>
    {story.image && <Image accessible={false} source={{ uri: story.image }} style={styles.hero} cachePolicy="memory-disk" contentFit="cover" />}
    <Text style={styles.byline}>Premier Padel{date ? ` · ${date}` : ''}</Text>
    <Text accessibilityRole="header" style={styles.title}>{story.title}</Text>
    {story.paragraphs.length
      ? story.paragraphs.map((part, index) => <Text key={index} accessibilityRole={part.style === 'heading' ? 'header' : undefined}
          style={part.style === 'heading' ? styles.subheading : styles.paragraph}>{part.text}</Text>)
      : <Text style={styles.byline}>The publisher hasn’t provided story text for this update.</Text>}
  </ScrollView>;
}

function NewsMessage({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return <View style={styles.message}>
    <Text style={styles.messageText}>{text}</Text>
    {onRetry && <HomeAction label="Try again" onPress={onRetry} />}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: b.page },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: b.edge },
  heading: { flex: 1, color: b.premium, fontSize: 18, fontWeight: '700' },
  list: { padding: 20, gap: 16 },
  story: { flex: 1, backgroundColor: b.surface },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 36, gap: 16 },
  hero: { width: '100%', aspectRatio: 1.7, borderRadius: 14, backgroundColor: b.elevated },
  byline: { color: b.muted, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  title: { color: b.premium, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  subheading: { color: b.premium, fontSize: 19, lineHeight: 25, fontWeight: '700' },
  paragraph: { color: b.premium, fontSize: 16, lineHeight: 25 },
  loading: { padding: 30, alignItems: 'center', justifyContent: 'center' },
  message: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  messageText: { textAlign: 'center', color: b.muted, fontSize: 15 },
});
