import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { EventText as Text, EventIcon, lime } from '@/components/events/website-ui';
import { type PlayerMatch, isMatchWinner } from '@/lib/matches';

export default function MatchResultSheet() {
  const { match: raw } = useLocalSearchParams<{ match?: string }>();
  const router = useRouter();
  let match: PlayerMatch | null = null;
  try {
    const parsed = JSON.parse(raw || 'null');
    if (parsed && typeof parsed.Info === 'object') match = parsed;
  } catch { /* A missing or invalid route payload displays an empty state. */ }
  const info = match?.Info;
  const scores = Array.isArray(match?.Score?.Score) ? match.Score.Score : [];
  const sides = [
    [info?.Challenger?.Name, info?.Challenger1?.Name].filter(Boolean),
    [info?.Challenged?.Name, info?.Challenged1?.Name].filter(Boolean),
  ];
  const setWins = [scores.filter(s => Number(s.Score1) > Number(s.Score2)).length, scores.filter(s => Number(s.Score2) > Number(s.Score1)).length];
  const winners = [info?.Challenger?.IsWinner ?? setWins[0] > setWins[1], info?.Challenged?.IsWinner ?? setWins[1] > setWins[0]];
  const victory = match ? isMatchWinner(match) : undefined;
  const location = info?.Venue || info?.Location;
  return <ScrollView style={{ flex: 1 }} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 36 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
      <Text accessibilityRole="header" style={{ flex: 1, fontSize: 18 }}>Match result</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Close match result" hitSlop={12} onPress={() => router.back()}><Text style={{ fontSize: 24, color: '#9ca3af' }}>×</Text></Pressable>
    </View>
    {!match ? <Text style={{ color: '#9ca3af' }}>Select a completed match from your profile to view its result.</Text> :
      <View style={{ padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#ffffff20', backgroundColor: '#141414', gap: 14 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#ffffff0d' }}>
          {!!(info?.Date || info?.EventStartDate) && <Text style={{ fontSize: 10, color: '#828b9a', letterSpacing: 0.5 }}>{info?.Date || info?.EventStartDate}</Text>}
          <Text style={{ fontSize: 10, color: '#f59e0b', letterSpacing: 0.5 }}>{(info?.EventName || 'Tour Match').toUpperCase()}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 8 }}>
            {sides.map((names, side) => {
              const won = scores.length > 0 && winners[side];
              return <View key={side} style={{ padding: 10, borderRadius: 12, borderWidth: 1, borderColor: won ? '#CCFF004d' : '#ffffff0d', backgroundColor: won ? '#CCFF000d' : '#ffffff05', gap: 6 }}>
                <Text style={{ fontSize: 9, color: '#828b9a', letterSpacing: 1 }}>TEAM {side + 1}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: side === 0 ? '#fff' : '#d1d5db' }}>{names.join(' & ') || 'Players unavailable'}</Text>
                  {won && <EventIcon name="trophy" size={13} color={lime} />}
                </View>
              </View>;
            })}
          </View>
          {!!scores.length && <View style={{ borderLeftWidth: 1, borderColor: '#ffffff0d', paddingLeft: 12, alignItems: 'center', gap: 10, maxWidth: 114 }}>
            {match.Score?.IsSummary && <Text style={{ fontSize: 9, color: '#9ca3af' }}>MATCH SCORE</Text>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
              {scores.map((set, index) => <View key={index} accessibilityLabel={`${match.Score?.IsSummary ? 'Match score' : `Set ${index + 1}`}: ${set.Score1} to ${set.Score2}`} style={{ minWidth: 23, paddingHorizontal: 6, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#ffffff0d', backgroundColor: '#ffffff0a', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: Number(set.Score1) > Number(set.Score2) ? lime : '#9ca3af' }}>{set.Score1 ?? '—'}</Text>
                <View style={{ height: 1, backgroundColor: '#ffffff18', alignSelf: 'stretch', marginVertical: 3 }} />
                <Text style={{ fontSize: 12, color: Number(set.Score2) > Number(set.Score1) ? lime : '#9ca3af' }}>{set.Score2 ?? '—'}</Text>
              </View>)}
            </View>
            {victory !== undefined && <View style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: victory ? lime : '#ef444433', backgroundColor: victory ? lime : '#ef44441a' }}><Text style={{ fontSize: 9, letterSpacing: 0.8, color: victory ? '#000' : '#ef4444' }}>{victory ? 'VICTORY' : 'DEFEAT'}</Text></View>}
          </View>}
        </View>
        {!!location && <Text style={{ color: '#9ca3af', fontSize: 11 }}>{location}</Text>}
        {!!info?.Court && <View style={{ alignSelf: 'flex-start', borderRadius: 9, borderWidth: 1, borderColor: '#f9731640', backgroundColor: '#f973161a', paddingHorizontal: 9, paddingVertical: 4 }}><Text style={{ fontSize: 10, letterSpacing: 0.6, color: '#f97316' }}>{info.Court.toUpperCase()}</Text></View>}
        {match.Score?.IsSummary && <Text style={{ color: '#9ca3af', fontSize: 13 }}>Individual set scores are not available from RankedIn.</Text>}
        {!scores.length && <Text style={{ color: '#9ca3af', fontSize: 13 }}>The score is not available here yet.</Text>}
      </View>}
  </ScrollView>;
}
