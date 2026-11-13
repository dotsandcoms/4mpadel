import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useAnalyticsSearch } from '@/hooks/use-analytics-search';
import { ErrorBanner } from '@/components/error-banner';
import { SheetHeader } from '@/components/sheet-header';
import { HomeAction } from '@/components/home-action';
import { EventArtwork } from '@/components/event-artwork';
import { FeedPortrait } from '@/components/home-feed';
import { isUpcomingSearchEvent, searchDirectory, searchTerm, sortSearchEvents, SEARCH_LIMIT, type DirectorySection, type SearchResult } from '@/lib/app-search';
import { openSitePath } from '@/lib/site';
import { fetchSearchEvents, formatEventRange } from '@/lib/home';
import { fetchProSnapshot, proDate } from '@/lib/pro-padel';
import { tourPath, tourSource } from '@/lib/home-feed';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

type Result = SearchResult;
export default function SearchSheet() {
  const router = useRouter(), params = useLocalSearchParams<{ source?: string; category?: string }>();
  const international = params.source === 'international', tournamentsOnly = params.category === 'events';
  const [query, setQuery] = useState(''), [items, setItems] = useState<Result[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [directory, setDirectory] = useState<{ term: string; sections: DirectorySection[] }>({ term: '', sections: [] });
  const [openError, setOpenError] = useState('');
  const term = searchTerm(query), searching = term.length >= 2 && !tournamentsOnly;
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setItems([]);
    void (async () => {
      try {
        let next: Result[];
        if (international) {
          const [tour, fixtures, fip] = await Promise.all([fetchProSnapshot('tour'), fetchProSnapshot('fixtures'), fetchProSnapshot('fip-calendar')]);
          const events = [...new Map([...(fixtures.tournament ? [fixtures.tournament] : []), ...tour.tournaments, ...fip.tournaments].map(event => [event.id, event])).values()].filter(event => !tournamentsOnly || isUpcomingSearchEvent(event.startDate, event.endDate));
          next = events.map(event => ({ key: `event:${event.id}`, kind: 'events', title: event.name, subtitle: `${tourSource(event)} · ${proDate(event.startDate)}`, detail: event.location || event.country || '', image: event.photoUrl, path: tourPath(event), search: [event.name, event.location, event.country, event.level].join(' ').toLowerCase() }));
        } else {
          next = sortSearchEvents(await fetchSearchEvents(true, tournamentsOnly), undefined, tournamentsOnly).map(event => ({ key: `event:${event.id}`, kind: 'events', title: event.event_name || '4M event', subtitle: `${event.sapa_status && event.sapa_status !== 'None' ? event.sapa_status : '4M'} · ${formatEventRange(event.start_date, event.end_date)}`, detail: [event.venue, event.city].filter(Boolean).join(' · '), image: event.custom_image_url || event.poster_image_url || event.image_url || null, event, path: `/events/${encodeURIComponent(event.slug || String(event.id))}`, search: [event.event_name, event.city, event.venue, event.sapa_status].join(' ').toLowerCase() }));
        }
        if (active) setItems(next);
      } catch { if (active) setError('Events couldn’t load. Please try again.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [international, tournamentsOnly, retry]);
  useEffect(() => {
    const controller = new AbortController();
    setDirectory({ term, sections: [] }); setOpenError('');
    if (!searching) return () => controller.abort();
    const timer = setTimeout(() => void searchDirectory(term, international, controller.signal, section => {
      if (!controller.signal.aborted) setDirectory(previous => previous.term === term ? { term, sections: [...previous.sections.filter(item => item.kind !== section.kind), section] } : previous);
    }), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, international, retry, searching]);
  const current = directory.term === term ? directory.sections : [];
  const directoryLoading = searching && current.length < 3;
  const partialError = current.some(section => section.error);
  const results = useMemo(() => {
    const events = term ? items.filter(item => item.search?.includes(term.toLowerCase())) : tournamentsOnly ? items : items.slice(0, 12);
    return [...events, ...(['players', 'clubs', 'organisations'] as const).flatMap(kind => current.find(section => section.kind === kind)?.items ?? [])];
  }, [items, term, current, tournamentsOnly]);
  useAnalyticsSearch(query, results.length, tournamentsOnly ? 'events' : 'all', !loading && !directoryLoading && !error && !partialError);
  const title = tournamentsOnly ? 'Find tournaments' : 'Search';
  const placeholder = tournamentsOnly ? 'Event, city or venue' : 'Events, players, clubs, organisations';
  async function open(result: Result) {
    if (result.website) { try { await openSitePath(result.path); } catch { setOpenError('This page couldn’t open. Please try again.'); } return; }
    if (router.canDismiss()) router.dismiss(); router.navigate(result.path as Href);
  }
  return <>
    {Platform.OS === 'web' ? <SheetHeader title={title}><TextInput accessibilityLabel="Search events, players, clubs and organisations" placeholder={placeholder} value={query} onChangeText={setQuery} autoFocus style={{ margin: 20, padding: 12, borderRadius: 12, backgroundColor: b.elevated, color: b.premium }} /></SheetHeader> : <>
      <Stack.Screen options={{ title, headerTintColor: b.premium, headerStyle: { backgroundColor: b.page } }} />
      <Stack.SearchBar placeholder={placeholder} autoFocus hideWhenScrolling={false} hideNavigationBar={false} obscureBackground={false} placement="stacked" tintColor={b.accent} onChangeText={event => setQuery(event.nativeEvent.text)} onCancelButtonPress={() => router.back()} />
    </>}
    <FlatList style={{ flex: 1, backgroundColor: b.page }} removeClippedSubviews={false} data={results} keyExtractor={item => item.key} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 12 }}
      ListHeaderComponent={<View style={{ gap: 8 }}><Text style={{ fontSize: 12, lineHeight: 18, color: b.muted }}>{term ? `${results.length} ${results.length === 1 ? 'result' : 'results'}${directoryLoading || loading ? ' · Searching…' : ''}` : tournamentsOnly ? 'Find upcoming 4M events by name, city or venue' : 'Find events, players, clubs and organisations. Type at least 2 characters to search everyone.'}</Text>{(directoryLoading || loading) && <ActivityIndicator color={loadingBlue} accessibilityLabel="Searching" />}{(error || partialError) && <HomeAction label="Retry unavailable results" onPress={() => setRetry(value => value + 1)} />}</View>}
      renderItem={({ item, index }) => <View>{(index === 0 || results[index - 1].kind !== item.kind) && <Text accessibilityRole="header" style={{ fontSize: 16, lineHeight: 22, fontWeight: '600', color: b.premium, paddingTop: 8, paddingBottom: 12 }}>{item.kind === 'events' ? international ? 'International events' : tournamentsOnly ? 'Upcoming 4M events' : '4M events' : item.kind === 'players' ? international ? 'FIP players' : '4M players' : item.kind === 'clubs' ? 'Clubs' : 'Organisations'}</Text>}<Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.subtitle}. ${item.detail}${item.website ? '. Opens website' : ''}`} onPress={() => void open(item)} style={{ backgroundColor: b.elevated, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {item.kind === 'events' ? <EventArtwork uri={item.image} event={item.event} style={{ width: 52, height: 68, borderRadius: 8 }} /> : item.kind === 'players' ? <FeedPortrait name={item.title} uri={item.image} size={44} /> : <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>{item.image ? <Image source={{ uri: item.image }} style={{ width: 44, height: 44 }} contentFit="contain" /> : <SymbolView name={item.kind === 'clubs' ? { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' } : { ios: 'building.2', android: 'business', web: 'business' }} size={26} tintColor={b.muted} />}</View>}
        <View style={{ flex: 1, gap: 4 }}><Text numberOfLines={3} style={{ color: b.premium, fontSize: 15, lineHeight: 21, fontWeight: '600' }}>{item.title}</Text><Text style={{ color: b.accent, fontSize: 12 }}>{item.subtitle}</Text><Text numberOfLines={2} style={{ color: b.muted, fontSize: 12, lineHeight: 17 }}>{item.detail}</Text></View>
        <SymbolView name={item.website ? { ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' } : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={b.faint} />
      </Pressable></View>}
      ListFooterComponent={current.some(section => section.limited) ? <Text style={{ fontSize: 12, lineHeight: 18, color: b.muted }}>Showing up to {SEARCH_LIMIT} matches per directory. Refine your search for more specific results.</Text> : null}
      ListEmptyComponent={!loading && !directoryLoading ? <View style={{ paddingVertical: 16, gap: 8 }}><Text style={{ color: b.premium, fontSize: 16, fontWeight: '600' }}>{error || partialError ? 'Some results are unavailable' : 'No results found'}</Text><Text style={{ color: b.muted, fontSize: 14 }}>{error || 'Try another name, city or venue.'}</Text></View> : null} />
    <ErrorBanner message={openError || error || (partialError ? 'Some search results couldn’t load. Retry to load the missing results.' : null)} top={12} />
  </>;
}
