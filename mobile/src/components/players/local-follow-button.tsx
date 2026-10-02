import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { fetchLocalFollows, setLocalFollow } from '@/lib/player-hub';

export function LocalFollowButton({ playerId, name, iconOnly = false, onSignIn }: { playerId: string; name: string; iconOnly?: boolean; onSignIn?: () => void }) {
  const router = useRouter();
  const [following, setFollowing] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const owner = useRef<string | null>(null), epoch = useRef(0), lock = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    const load = async () => {
      const version = ++epoch.current;
      setBusy(true); setError(''); setFollowing(false);
      try {
        const { data, error: authError } = await supabase.auth.getSession();
        if (authError) throw authError;
        const id = data.session?.user.id ?? null;
        if (!active || version !== epoch.current) return;
        owner.current = id;
        const ids = id ? await fetchLocalFollows(id) : [];
        if (active && version === epoch.current) setFollowing(ids.includes(playerId));
      } catch { if (active && version === epoch.current) setError('Could not load follow status. Reopen this profile to retry.'); }
      finally { if (active && version === epoch.current) setBusy(false); }
    };
    void load();
    const { data } = supabase.auth.onAuthStateChange(() => { void Promise.resolve().then(() => { if (active) void load(); }); });
    return () => { active = false; epoch.current++; data.subscription.unsubscribe(); };
  }, [playerId]));
  const toggle = async () => {
    if (lock.current || busy || error) return;
    if (!owner.current) { onSignIn?.(); router.push('/(auth)/sign-in'); return; }
    const id = owner.current, version = ++epoch.current, next = !following;
    lock.current = true; setBusy(true);
    try { await setLocalFollow(id, playerId, next); if (epoch.current === version) setFollowing(next); }
    catch { if (epoch.current === version) setError('Could not save your follow. Reopen this profile to retry.'); }
    finally { lock.current = false; if (epoch.current === version) setBusy(false); }
  };
  return <View style={{ gap: 6 }}><Pressable accessibilityRole="button" accessibilityLabel={`${following ? 'Unfollow' : 'Follow'} ${name}`} accessibilityState={{ selected: following, busy, disabled: busy }} disabled={busy} onPress={() => { if (error) Alert.alert('Follow unavailable', error); else void toggle(); }} style={{ minHeight: 44, minWidth: 48, paddingHorizontal: iconOnly ? 14 : 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, backgroundColor: '#EAF0FF', opacity: busy ? 0.5 : 1 }}>
    {iconOnly && busy ? <ActivityIndicator size="small" color="#2449D8" /> : <Ionicons name={following ? 'heart' : 'heart-outline'} size={iconOnly ? 22 : 18} color="#2449D8" />}
    {!iconOnly && <Text style={{ color: '#2449D8', fontWeight: '700', fontSize: 13 }}>{busy ? 'Loading…' : following ? 'Following' : 'Follow player'}</Text>}
  </Pressable>{!!error && !iconOnly && <Text accessibilityRole="alert" style={{ color: '#B42318', fontSize: 12 }}>{error}</Text>}</View>;
}
