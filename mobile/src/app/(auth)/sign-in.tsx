import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AuthCancelled,
  isAppleAvailable,
  sendPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/lib/auth';
import { LiquidField } from '@/components/liquid-field';
import { brand, motion } from '@/theme/tokens';

type Mode = 'signin' | 'signup';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'apple' | 'google' | 'email'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    isAppleAvailable().then(setAppleReady);
  }, []);

  /**
   * One handler for all three providers. A cancelled sheet is a normal user
   * action, not an error — it clears state silently rather than showing a
   * message, which would be noise.
   */
  async function run(kind: 'apple' | 'google' | 'email', fn: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    setBusy(kind);
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (e: any) {
      if (e instanceof AuthCancelled) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const canSubmitEmail = emailValid && password.length >= 6 && !busy;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-page">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 28,
        }}
        keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeIn.duration(motion.duration.slow)} className="mb-9 items-start">
          <Image
            source={require('@/assets/images/4m-logo.png')}
            style={{ width: 76, height: 57 }}
            contentFit="contain"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(motion.duration.slow)}>
          <Text className="mb-2 font-extrabold text-premium" style={{ fontSize: 32, lineHeight: 37 }}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </Text>
          <Text className="mb-8 text-muted" style={{ fontSize: 16, lineHeight: 24 }}>
            {mode === 'signin'
              ? 'Sign in to enter events and track your ranking.'
              : 'One account for entries, partners and rankings.'}
          </Text>
        </Animated.View>

        {/* Native provider buttons first — most people will use one of these. */}
        {appleReady ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              mode === 'signin'
                ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
            }
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={14}
            style={{ height: 52, marginBottom: 12 }}
            onPress={() => run('apple', signInWithApple)}
          />
        ) : null}

        <Pressable
          onPress={() => run('google', signInWithGoogle)}
          disabled={!!busy}
          accessibilityRole="button"
          className="mb-7 h-[52px] flex-row items-center justify-center rounded-[14px] border border-edge bg-elevated active:opacity-70">
          {busy === 'google' ? (
            <ActivityIndicator color={brand.premium} />
          ) : (
            <Text className="text-[16px] font-semibold text-premium">Continue with Google</Text>
          )}
        </Pressable>

        <View className="mb-7 flex-row items-center">
          <View className="h-px flex-1 bg-edge" />
          <Text className="px-3 text-xs uppercase text-faint" style={{ letterSpacing: 1.5 }}>
            or
          </Text>
          <View className="h-px flex-1 bg-edge" />
        </View>

        <LiquidField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <LiquidField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
          secureTextEntry
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          textContentType={mode === 'signin' ? 'password' : 'newPassword'}
        />

        {error ? (
          <Animated.View entering={FadeIn.duration(motion.duration.fast)} className="mb-4">
            <Text className="text-[14px] leading-5" style={{ color: '#E68577' }}>
              {error}
            </Text>
          </Animated.View>
        ) : null}
        {notice ? (
          <Animated.View entering={FadeIn.duration(motion.duration.fast)} className="mb-4">
            <Text className="text-[14px] leading-5 text-padel">{notice}</Text>
          </Animated.View>
        ) : null}

        <Pressable
          disabled={!canSubmitEmail}
          onPress={() =>
            run('email', () =>
              mode === 'signin'
                ? signInWithEmail(email, password)
                : signUpWithEmail(email, password)
            )
          }
          accessibilityRole="button"
          className={`h-14 items-center justify-center rounded-2xl ${
            canSubmitEmail ? 'bg-padel active:opacity-80' : 'bg-panel'
          }`}>
          {busy === 'email' ? (
            <ActivityIndicator color={brand.page} />
          ) : (
            <Text
              className={`text-base font-bold ${canSubmitEmail ? 'text-page' : 'text-faint'}`}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Text>
          )}
        </Pressable>

        {mode === 'signin' ? (
          <Pressable
            className="mt-5 items-center"
            hitSlop={10}
            disabled={!emailValid || !!busy}
            onPress={async () => {
              setError(null);
              try {
                await sendPasswordReset(email);
                setNotice(`Reset link sent to ${email.trim()}. Check your inbox.`);
              } catch (e: any) {
                setError(friendlyError(e));
              }
            }}>
            <Text className={`text-[14px] ${emailValid ? 'text-muted' : 'text-faint'}`}>
              Forgot your password?
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          className="mt-8 items-center"
          hitSlop={10}
          onPress={() => {
            setError(null);
            setNotice(null);
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
          }}>
          <Text className="text-[14px] text-muted">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <Text className="font-semibold text-padel">
              {mode === 'signin' ? 'Create one' : 'Sign in'}
            </Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}


/**
 * Supabase error text is written for developers. Rewrite the ones users
 * actually hit so the screen says what went wrong and what to do about it.
 */
function friendlyError(e: any): string {
  const msg = String(e?.message ?? e ?? '').toLowerCase();

  if (msg.includes('invalid login credentials')) {
    return "That email and password don't match. Check them and try again.";
  }
  if (msg.includes('already registered') || msg.includes('user already')) {
    return 'That email already has an account. Try signing in instead.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Confirm your email first — check your inbox for the link.';
  }
  if (msg.includes('password should be at least')) {
    return 'Passwords need to be at least 6 characters.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (msg.includes('audience') || msg.includes('invalid_client')) {
    return 'Sign-in is not configured correctly yet. Tell us and we will fix it.';
  }
  return e?.message ?? 'Something went wrong. Try again.';
}
