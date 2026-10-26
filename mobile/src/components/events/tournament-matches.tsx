import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { lightBrand as brand } from '@/theme/tokens';

type Match = { id: string; division_name: string; round: string; status: string; start: string | null; court: string | null; one_name: string | null; two_name: string | null; scores: number[][] | number[]; winner: string | null; one: string | null; two: string | null };
export function TournamentMatches({ eventId, divisionId, matchId, showPoints = false }: { eventId: number; divisionId?: string; matchId?: string; showPoints?: boolean }) {
  const [points, setPoints] = useState<{ division: string; points: number; round: string }[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    async function load() {
      try {
        const { data, error } = await supabase.rpc('get_tournament_notification_matches', { p_event: eventId, p_division: divisionId ?? null, p_match: matchId ?? null });
        if (error) throw error;
        if (active) { setMatches(data ?? []); setError(''); }
        if (showPoints) {
          const awards = await supabase.rpc('get_tournament_notification_points', { p_event: eventId, p_division: divisionId ?? null });
          if (awards.error) throw awards.error;
          if (active) setPoints(awards.data ?? []);
        }
      } catch { if (active) setError('Could not load published matches. Please try again.'); }
      finally { if (active) setLoading(false); }
    }
    setLoading(true); void load();
    const timer = setInterval(() => { if (AppState.currentState === 'active') void load(); }, 30000);
    const state = AppState.addEventListener('change', value => { if (value === 'active') void load(); });
    return () => { active = false; clearInterval(timer); state.remove(); };
  }, [eventId, divisionId, matchId, showPoints, attempt]));
  if (loading) return <ActivityIndicator accessibilityLabel="Loading published matches" style={{ margin: 20 }} />;
  if (error) return <View style={{ padding: 16 }}><Text accessibilityRole="alert" style={{ color: brand.premium }}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setAttempt(n => n + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: brand.accent }}>Retry</Text></Pressable></View>;
  return <View style={{ gap: 12, marginVertical: 12 }}>
    {showPoints && points.map(award => <View key={award.division} style={{ padding: 16, borderRadius: 16, backgroundColor: brand.elevated }}><Text style={{ color: brand.premium, fontWeight: '600' }}>Your points · {award.division}</Text><Text style={{ color: brand.accent, marginTop: 6 }}>{award.points} points · {award.round.replaceAll('_', ' ')}</Text></View>)}
    {!matches.length && <Text style={{ color: brand.muted }}>No published match is available here yet. Check the full draw for the latest details.</Text>}
    {matches.map(match => <View key={match.id} style={{ padding: 16, borderRadius: 16, backgroundColor: brand.elevated, borderWidth: 1, borderColor: brand.edge }}>
      <Text style={{ color: brand.muted, fontSize: 13 }}>{match.division_name} · {match.round}</Text>
      <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 17, fontWeight: '600', marginTop: 8 }}>{match.one_name || 'Opponent to be confirmed'}{ '\nvs\n' }{match.two_name || 'Opponent to be confirmed'}</Text>
      <Text style={{ color: brand.premium, marginTop: 12 }}>{match.start ? new Date(match.start).toLocaleString(undefined, { timeZone: 'Africa/Johannesburg', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' SAST' : 'Time to be confirmed'} · {match.court || 'Court to be confirmed'}</Text>
      <Text style={{ color: brand.accent, fontWeight: '600', marginTop: 8 }}>{match.status.replaceAll('_', ' ')}{match.scores?.length ? ` · ${match.scores.map(score => Array.isArray(score) ? score.join('–') : score).join('  ')}` : ''}</Text>
      {match.winner && <Text style={{ color: brand.premium, marginTop: 6 }}>Winner: {match.winner === match.one ? match.one_name : match.two_name}</Text>}
    </View>)}
  </View>;
}
