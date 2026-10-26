import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProPlayerProfile } from '@/components/players/pro-player-profile';
import { useProPadel } from '@/hooks/use-pro-padel';
import { fetchPlayerProfile } from '@/lib/pro-padel-live';
import type { HubPlayer } from '@/lib/player-hub';
import { lightBrand as b } from '@/theme/tokens';
export default function ProPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), router = useRouter(), safe = useSafeAreaInsets(), state = useProPadel();
  const [player, setPlayer] = useState<HubPlayer | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const back = () => router.canGoBack() ? router.back() : router.replace('/following');
  useEffect(() => {
    let cancelled = false; setPlayer(null); setError('');
    if (!/^[1-9]\d*$/.test(id || '') || !Number.isSafeInteger(Number(id))) { setError('This player could not be found.'); return; }
    void fetchPlayerProfile(Number(id)).then(profile => { if (cancelled) return; if (!profile) { setError('This player profile is not available yet.'); return; } setPlayer({ id, key: `pro:${id}`, source: 'pro', name: profile.name, gender: profile.category, rank: profile.rank, points: profile.points, photo: profile.photoUrl, subtitle: 'FIP player' }); }).catch(() => { if (!cancelled) setError('This player could not be loaded. Please retry.'); });
    return () => { cancelled = true; };
  }, [id, retry]);
  const followed = state.follows.some(row => row.player_id === Number(id));
  const followButton = <Pressable accessibilityRole="button" accessibilityLabel={`${followed ? 'Unfollow' : 'Follow'} ${player?.name}`} disabled={state.followsLoading || !!state.followsError || state.pendingId !== null} onPress={() => { if (!state.userId) router.push('/(auth)/sign-in'); else if (player) void state.toggleFollow({ player_id: Number(id), player_name: player.name, category: player.gender === 'women' ? 'women' : 'men' }); }} style={{ minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: b.glass, borderRadius: 12 }}><Text style={{ color: b.accent, fontWeight: '700' }}>{state.pendingId !== null ? 'Saving…' : followed ? 'Following' : 'Follow'}</Text></Pressable>;
  return <View style={{ flex: 1, backgroundColor: b.page }}><Stack.Screen options={{ headerShown: false }} />{player ? <ProPlayerProfile key={id} player={player} followButton={<View>{followButton}{(state.writeError || state.followsError) && <Text style={{ color: b.danger, fontSize: 12 }}>{state.writeError || state.followsError}</Text>}</View>} onClose={back} onMatch={matchId => router.push({ pathname: '/pro/match/[id]', params: { id: String(matchId), from: 'following' } })} onPlayer={playerId => router.push({ pathname: '/pro/player/[id]', params: { id: String(playerId) } })} /> : <View style={{ paddingTop: safe.top + 16, paddingHorizontal: 20, gap: 20 }}><Pressable accessibilityRole="button" onPress={back} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.accent }}>← Back</Text></Pressable>{error ? <><Text style={{ color: b.muted }}>{error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '700' }}>Retry</Text></Pressable></> : <ActivityIndicator color={b.accent} />}</View>}</View>;
}
