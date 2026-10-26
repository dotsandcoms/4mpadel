import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { fetchProSnapshot, proDate, type FipCalendar } from '@/lib/pro-padel';
import { lightBrand as brand } from '@/theme/tokens';

export function OfficialFipFeed() {
  const router = useRouter();
  const [calendar, setCalendar] = useState<FipCalendar | null>(null);
  useEffect(() => { let active = true; void fetchProSnapshot('fip-calendar').then(value => { if (active) setCalendar(value); }).catch(() => {}); return () => { active = false; }; }, []);
  if (!calendar) return null;
  const today = new Date().toISOString().slice(0, 10);
  const events = calendar.tournaments.filter(event => event.endDate >= today && event.status !== 'finished').slice(0, 12);
  if (!events.length) return null;
  return <View style={{ marginTop: 24, gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 21, fontWeight: '700' }}>FIP Promises & Bronze</Text>
    <Text style={{ color: brand.muted, fontSize: 12 }}>Official FIP calendar · Updated {proDate(calendar.updatedAt)}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
      {events.map(event => <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`View ${event.name} inside the app`} onPress={() => router.push({ pathname: '/pro/fip/[id]', params: { id: String(event.id) } })} style={{ width: 264, borderRadius: 18, overflow: 'hidden', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DCE2DA' }}>
        {event.photoUrl && <Image source={{ uri: event.photoUrl }} contentFit="cover" contentPosition="top" style={{ width: 264, height: 160 }} />}
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: brand.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1 }}>{event.level === 'fip_promises' ? 'FIP PROMISES' : 'FIP BRONZE'}{event.status === 'live' ? ' · IN PROGRESS' : ''}</Text>
          <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.75} textBreakStrategy="simple" lineBreakStrategyIOS="standard" style={{ color: brand.premium, fontSize: 18, fontWeight: '700' }}>{event.name.replace(/^FIP (PROMISES|BRONZE) /, '')}</Text>
          <Text style={{ color: brand.muted, fontSize: 12 }}>{proDate(event.startDate)} – {proDate(event.endDate)} · {event.location}</Text>
          <Text style={{ color: brand.accent, fontWeight: '700', fontSize: 13 }}>View official event →</Text>
        </View>
      </Pressable>)}
    </ScrollView>
  </View>;
}
