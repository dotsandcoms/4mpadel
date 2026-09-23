import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidField } from '@/components/liquid-field';
import { supabase } from '@/lib/supabase';
import { lightBrand as brand } from '@/theme/tokens';

export default function ResetPasswordScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const lock = useRef(false);
  const exchange = useRef<{ code: string; request: ReturnType<typeof supabase.auth.exchangeCodeForSession> } | null>(null);

  useEffect(() => {
    let active = true;
    setReady(false);
    setError(null);
    if (!code || typeof code !== 'string') {
      setError('Open the reset link from your email on the device where you requested it.');
      return;
    }
    // Reuse the exchange during effect replay: recovery codes are single use.
    if (exchange.current?.code !== code) exchange.current = { code, request: supabase.auth.exchangeCodeForSession(code) };
    void exchange.current.request.then(({ data, error: failure }) => {
      if (!active) return;
      if (failure || !data.session) setError('This reset link has expired or is invalid. Request a new link from sign in.');
      else setReady(true);
    }).catch(() => {
      if (active) setError('Could not verify this link. Check your connection and request a new link.');
    });
    return () => { active = false; };
  }, [code]);

  async function save() {
    if (!ready || lock.current) return;
    if (password.length < 6 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[@#$%^&*\-+=|<>?/,.'~]/.test(password)) {
      setError('Use 6+ characters with uppercase, lowercase, a number and a symbol.');
      return;
    }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    lock.current = true;
    setSaving(true);
    setError(null);
    try {
      const { error: failure } = await supabase.auth.updateUser({ password });
      if (failure) throw failure;
      setDone(true);
      setPassword('');
      setConfirm('');
    } catch {
      setError('Could not update your password. Try a different password, or request a new reset link.');
    } finally { lock.current = false; setSaving(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: brand.page, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
      <ScrollView style={{ flex: 1 }} contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 28, paddingTop: 32, paddingBottom: 24 }}>
        <Text accessibilityRole="header" className="text-[28px] font-extrabold text-court-ink">{done ? 'Password updated' : 'Set a new password'}</Text>
        <Text className="mb-7 mt-3 text-[16px] leading-6 text-court-muted">{done ? 'Your new password is ready to use.' : 'Choose a password you haven’t used before.'}</Text>
        {!ready && !error && <ActivityIndicator color={brand.accent} accessibilityLabel="Verifying reset link" />}
        {ready && !done && <View>
          <LiquidField label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" editable={!saving} />
          <Text className="mb-4 text-[12px] leading-5 text-court-muted">Use 6+ characters with uppercase, lowercase, a number and a symbol.</Text>
          <LiquidField label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" editable={!saving} onSubmitEditing={() => void save()} />
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={() => void save()} className="mt-4 min-h-[52px] items-center justify-center rounded-[14px] bg-padel">
            <Text className="font-bold text-court-ink">{saving ? 'Updating…' : 'Update password'}</Text>
          </Pressable>
        </View>}
        {error && <Text accessibilityRole="alert" className="mt-4 text-[14px] leading-5 text-court-danger">{error}</Text>}
        <Pressable disabled={saving} accessibilityRole="button" onPress={() => router.replace('/(auth)/sign-in')} className="mt-6 min-h-11 items-center justify-center">
          <Text className="font-semibold text-court-accent">Back to sign in</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
