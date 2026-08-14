import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { EventRow } from '@/components/home-event-card';
import { SheetHeader } from '@/components/sheet-header';
import {
  eventPath,
  fetchSearchEvents,
  filterSearchEvents,
  type CalendarEvent,
} from '@/lib/home';
import { openSitePath } from '@/lib/site';
import { brand } from '@/theme/tokens';

export default function SearchSheet() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchSearchEvents().then((rows) => {
      if (!cancelled) setEvents(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => filterSearchEvents(events, query), [events, query]);

  async function openEvent(event: CalendarEvent) {
    if (router.canDismiss()) router.dismiss();
    else router.back();
    await openSitePath(eventPath(event));
  }

  return (
    <View className="flex-1 bg-page">
      <SheetHeader title="Search events" />

      <View className="mx-5 mt-1 flex-row items-center rounded-[14px] border border-edge bg-elevated px-3.5">
        <SymbolView name="magnifyingglass" size={16} tintColor={brand.placeholder} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Cape Town Open"
          placeholderTextColor={brand.placeholder}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          className="ml-2 h-[48px] flex-1 text-[16px] text-premium"
          accessibilityLabel="Search events"
        />
      </View>

      <ScrollView
        className="mt-2 flex-1"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: 28 }}>
        {query.trim() && results.length === 0 ? (
          <Text className="px-5 pt-6 text-[14px] leading-5 text-muted">
            No events match “{query.trim()}”. Try a city or tournament name.
          </Text>
        ) : (
          results.map((event) => (
            <EventRow key={event.id} event={event} onPress={() => openEvent(event)} />
          ))
        )}
      </ScrollView>
    </View>
  );
}
