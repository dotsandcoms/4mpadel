import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

export default function EmailChangeScreen() {
  const { code, error_description } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const router = useRouter(), insets = useSafeAreaInsets(), [error, setError] = useState('');
  const request = useRef<{ code: string; promise: ReturnType<typeof supabase.auth.exchangeCodeForSession> } | null>(null);
  useEffect(() => {
    let active = true;
    if (error_description || !code || typeof code !== 'string') { setError('Open the email confirmation link on the device where you requested the change. You can also return to Edit profile and check the confirmation there.'); return; }
    if (request.current?.code !== code) request.current = { code, promise: supabase.auth.exchangeCodeForSession(code) };
    void request.current.promise.then(async result => {
      if (!active) return;
      if (result.error || !result.data.session) { setError('This confirmation link has expired or was already used. Return to Edit profile to check your email or request another link.'); return; }
      await supabase.auth.refreshSession();
      if (active) router.replace('/edit-profile');
    }).catch(() => { if (active) setError('The confirmation could not be checked. Return to Edit profile and try again.'); });
    return () => { active = false; };
  }, [code, error_description, router]);
  return <View style={{ flex: 1, padding: 24, paddingTop: insets.top + 32, backgroundColor: b.page, gap: 18 }}><Text accessibilityRole="header" style={{ color: b.premium, fontSize: 24, fontWeight: '700' }}>Confirming your email</Text>{error ? <><Text accessibilityRole="alert" style={{ color: b.muted, fontSize: 15, lineHeight: 23 }}>{error}</Text><Pressable accessibilityRole="button" onPress={() => router.replace('/edit-profile')} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '600' }}>Return to Edit profile</Text></Pressable></> : <ActivityIndicator accessibilityLabel="Checking email confirmation" color={loadingBlue} />}</View>;
}
