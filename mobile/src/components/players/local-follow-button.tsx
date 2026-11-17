import { useCallback, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { PlayerFollowAction } from './player-follow-action';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { fetchLocalFollows, setLocalFollow } from '@/lib/player-hub';

export function LocalFollowButton({ playerId, name, iconOnly = false, onSignIn, onFollowChange }: { playerId: string; name: string; iconOnly?: boolean; onSignIn?: () => void; onFollowChange?: () => void }) {
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
    try { await setLocalFollow(id, playerId, next); if (epoch.current === version) { setFollowing(next); onFollowChange?.(); } }
    catch { if (epoch.current === version) setError('Could not save your follow. Reopen this profile to retry.'); }
    finally { lock.current = false; if (epoch.current === version) setBusy(false); }
  };
  return <View style={{ gap: 6 }}><PlayerFollowAction name={name} following={following} pending={busy} pendingLabel="Loading…" iconOnly={iconOnly} accentColor="#2449D8"
    onPress={() => { if (error) Alert.alert('Follow unavailable', error); else void toggle(); }} />
    {!!error && !iconOnly && <Text accessibilityRole="alert" style={{ color: '#B42318', fontSize: 12 }}>{error}</Text>}
  </View>;
}
