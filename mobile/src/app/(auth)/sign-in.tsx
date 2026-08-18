import * as AppleAuthentication from 'expo-apple-authentication';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExpandReveal } from '@/components/expand-reveal';
import { FadeUp } from '@/components/fade-up';
import { LimeRule } from '@/components/lime-rule';
import { LiquidField } from '@/components/liquid-field';
import { PressableScale } from '@/components/pressable-scale';
import { Toast, type ToastKind } from '@/components/toast';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  AuthAlreadyRegistered,
  AuthCancelled,
  isAppleAvailable,
  sendPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from '@/lib/auth';
import { hapticError, hapticSuccess } from '@/lib/haptics';
import { destinationAfterAuth } from '@/lib/profile';
import { openLegal } from '@/lib/legal';
import { supabase } from '@/lib/supabase';
import { brand, motion, padelGlow } from '@/theme/tokens';

type Mode = 'signin' | 'signup';

const CONTROL_H = 52;
const SOCIAL_H = 46;
const CONTROL_R = 14;
const RING = 2;

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ intent?: string | string[] }>();
  const intent = Array.isArray(params.intent) ? params.intent[0] : params.intent;
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const pendingPasswordFocus = useRef(false);

  const [mode, setMode] = useState<Mode>(intent === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<null | 'apple' | 'google' | 'email'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [appleReady, setAppleReady] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string; kind: ToastKind } | null>(
    null
  );
  const toastSeq = useRef(0);
  const dismissToast = useCallback(() => setToast(null), []);

  function flash(message: string, kind: ToastKind = 'error') {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message, kind });
  }

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
      hapticSuccess();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const confirmMsg = 'Confirm your email, then sign in to finish your player profile.';
        setNotice(confirmMsg);
        flash(confirmMsg, 'success');
        setMode('signin');
        return;
      }
      router.replace(await destinationAfterAuth(data.session));
    } catch (e: any) {
      if (e instanceof AuthCancelled) return;
      hapticError();
      if (kind === 'email' && mode === 'signin' && isInvalidCredentials(e)) {
        const msg = 'Email or password is incorrect. Try again or reset your password.';
        setPasswordError(msg);
        flash(msg);
        passwordRef.current?.focus();
        return;
      }
      if (kind === 'email' && mode === 'signup' && isWeakPassword(e)) {
        const msg =
          'That password is too easy to guess. Use a longer mix of letters, numbers and a symbol.';
        setPasswordError(msg);
        flash(msg);
        passwordRef.current?.focus();
        return;
      }
      if (kind === 'email' && isAlreadyRegistered(e)) {
        const msg = 'That email already has an account. Try signing in instead.';
        setEmailError(msg);
        flash(msg);
        emailRef.current?.focus();
        return;
      }
      const msg = friendlyError(e, kind === 'email' ? mode : 'signin');
      setError(msg);
      flash(msg);
    } finally {
      setBusy(null);
    }
  }

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const passwordIssues = mode === 'signup' ? signupPasswordIssues(password) : [];
  const passwordValid = mode === 'signin' ? password.length >= 6 : passwordIssues.length === 0;
  const confirmValid = mode === 'signin' || (confirm === password && passwordValid);
  const formReady = emailValid && passwordValid && confirmValid;

  const shownEmailError =
    emailError ??
    ((emailTouched || attempted) && !emailValid ? 'Enter a valid email address.' : null);
  const shownPasswordError =
    passwordError ??
    ((passwordTouched || attempted) && mode === 'signin' && password.length === 0
      ? 'Enter your password.'
      : null);
  const shownConfirmError =
    confirmError ??
    ((confirmTouched || attempted) && mode === 'signup' && !confirmValid
      ? 'Passwords do not match.'
      : null);

  function revealPassword() {
    setEmailOpen(true);
  }

  function revealAndFocusPassword() {
    if (emailOpen) {
      passwordRef.current?.focus();
      return;
    }
    pendingPasswordFocus.current = true;
    setEmailOpen(true);
  }

  useEffect(() => {
    if (!emailOpen || !pendingPasswordFocus.current) return;
    pendingPasswordFocus.current = false;
    const id = requestAnimationFrame(() => {
      passwordRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [emailOpen]);

  function submitEmail() {
    setAttempted(true);
    setError(null);

    if (!emailOpen) {
      revealPassword();
      emailRef.current?.focus();
      return;
    }

    if (!emailValid) {
      flash('Enter a valid email address.');
      emailRef.current?.focus();
      return;
    }
    if (mode === 'signup' && passwordIssues.length > 0) {
      flash(`Password still needs ${listAnd(passwordIssues)}.`);
      passwordRef.current?.focus();
      return;
    }
    if (mode === 'signin' && password.length === 0) {
      flash('Enter your password.');
      passwordRef.current?.focus();
      return;
    }
    if (!confirmValid) {
      flash('Passwords do not match.');
      confirmRef.current?.focus();
      return;
    }

    run('email', () =>
      mode === 'signin' ? signInWithEmail(email, password) : signUpWithEmail(email, password)
    );
  }

  async function resetPassword() {
    setError(null);
    setNotice(null);
    if (!emailValid) {
      setEmailTouched(true);
      const msg = 'Enter a valid email address.';
      flash(msg);
      emailRef.current?.focus();
      return;
    }
    try {
      const msg = `Reset link sent to ${email.trim()}. Check your inbox.`;
      setNotice(msg);
      flash(msg, 'success');
    } catch (e: any) {
      const msg = friendlyError(e);
      setError(msg);
      flash(msg);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
      className="flex-1 bg-page"
      style={{ flex: 1, backgroundColor: brand.page }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 12,
          paddingHorizontal: 28,
          paddingBottom: insets.bottom + 20,
        }}>
        <FadeUp>
          <View className="items-start">
            <Image
              source={require('@/assets/images/4m-logo.png')}
              style={{ width: 57, height: 43 }}
              contentFit="contain"
              accessibilityLabel="4M Padel"
            />
            <LimeRule draw width={30} style={{ marginTop: 8 }} />
          </View>
        </FadeUp>

        <FadeUp delay={80}>
          <Text
            accessibilityRole="header"
            className="mb-2 mt-8 font-extrabold text-premium"
            style={{ fontSize: 28, lineHeight: 33 }}>
            {mode === 'signin' ? 'Welcome back' : 'Create your player profile'}
          </Text>
          <Text className="mb-7 text-muted" style={{ fontSize: 16, lineHeight: 24 }}>
            {mode === 'signin'
              ? 'Sign in to manage events, partners and your ranking.'
              : 'Enter events, manage partners and track your ranking.'}
          </Text>
        </FadeUp>

        <FadeUp delay={200}>
          {appleReady ? (
            <FocusRing>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={CONTROL_R}
                style={{ height: SOCIAL_H }}
                onPress={() => run('apple', signInWithApple)}
              />
            </FocusRing>
          ) : null}

          <FocusRing>
            <PressableScale
              onPress={() => run('google', signInWithGoogle)}
              disabled={!!busy}
              accessibilityRole="button"
              accessibilityState={{ busy: busy === 'google' }}
              accessibilityLabel="Continue with Google"
              className="flex-row items-center justify-center border border-edge bg-elevated"
              style={{ height: SOCIAL_H, borderRadius: CONTROL_R }}>
              <View className="absolute left-4 h-11 w-11 items-center justify-center">
                {busy === 'google' ? (
                  <ActivityIndicator color={brand.premium} />
                ) : (
                  <Image
                    source={require('@/assets/images/google-g.png')}
                    style={{ width: 16, height: 16 }}
                    contentFit="contain"
                    accessible={false}
                  />
                )}
              </View>
              <Text className="text-[14px] font-semibold text-premium">Continue with Google</Text>
            </PressableScale>
          </FocusRing>

          <View className="mb-6 mt-1 flex-row items-center">
            <View className="h-px flex-1 bg-edge" />
            <Text className="px-3 text-[12px] text-muted">or continue with email</Text>
            <View className="h-px flex-1 bg-edge" />
          </View>

          <LiquidField
            ref={emailRef}
            label="Email address"
            icon="envelope.fill"
            value={email}
            error={shownEmailError ?? undefined}
            invalid={!!shownEmailError}
            valid={emailValid}
            onFocus={revealPassword}
            onBlur={() => setEmailTouched(true)}
            onChangeText={(v) => {
              setEmail(v);
              if (v.length > 0) revealPassword();
              if (emailError) setEmailError(null);
            }}
            placeholder="name@email.com"
            keyboardType="email-address"
            inputMode="email"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            returnKeyType="next"
            onSubmitEditing={revealAndFocusPassword}
          />
          <ExpandReveal open={emailOpen}>
            <LiquidField
              ref={passwordRef}
              label="Password"
              icon="lock.fill"
              value={password}
              error={shownPasswordError ?? undefined}
              invalid={!!shownPasswordError}
              valid={passwordValid}
              onBlur={() => setPasswordTouched(true)}
              onChangeText={(v) => {
                setPassword(v);
                if (passwordError) setPasswordError(null);
              }}
              placeholder="********"
              keyboardType="visible-password"
              inputMode="text"
              autoCapitalize="none"
              secureTextEntry
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              textContentType={mode === 'signin' ? 'password' : 'newPassword'}
              returnKeyType={mode === 'signup' ? 'next' : 'go'}
              onSubmitEditing={() =>
                mode === 'signup' ? confirmRef.current?.focus() : submitEmail()
              }
              labelAccessory={
                mode === 'signin' ? (
                  <Pressable
                    className="min-h-11 justify-center pl-3"
                    hitSlop={8}
                    disabled={!!busy}
                    accessibilityRole="button"
                    accessibilityLabel="Forgot password?"
                    onPress={resetPassword}>
                    <Text className="text-[12px] font-medium text-muted">Forgot password?</Text>
                  </Pressable>
                ) : null
              }
            />
            {mode === 'signup' ? <PasswordRules password={password} /> : null}
            {mode === 'signup' ? (
              <LiquidField
                ref={confirmRef}
                label="Confirm password"
                icon="lock.fill"
                value={confirm}
                error={shownConfirmError ?? undefined}
                invalid={!!shownConfirmError}
                valid={confirmValid}
                onBlur={() => setConfirmTouched(true)}
                onChangeText={(v) => {
                  setConfirm(v);
                  if (confirmError) setConfirmError(null);
                }}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={submitEmail}
              />
            ) : null}

            <View className="mt-5">
              <FocusRing flush>
                <EmailCta
                  ready={formReady}
                  busy={busy === 'email'}
                  signin={mode === 'signin'}
                  onPress={submitEmail}
                />
              </FocusRing>

              {mode === 'signup' ? (
                <View className="mt-3 items-center">
                  <Text className="text-center text-[13px] leading-5" style={{ color: brand.label }}>
                    By creating an account, you agree to the
                  </Text>
                  <View className="flex-row items-center">
                    <Pressable
                      onPress={() => openLegal('terms')}
                      accessibilityRole="link"
                      accessibilityLabel="Terms"
                      className="min-h-11 justify-center px-1">
                      <Text className="text-[13px] font-semibold text-padel">Terms</Text>
                    </Pressable>
                    <Text className="text-[13px]" style={{ color: brand.label }}>
                      and
                    </Text>
                    <Pressable
                      onPress={() => openLegal('privacy')}
                      accessibilityRole="link"
                      accessibilityLabel="Privacy Policy"
                      className="min-h-11 justify-center px-1">
                      <Text className="text-[13px] font-semibold text-padel">Privacy Policy</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          </ExpandReveal>

          {notice ? (
            <View accessibilityLiveRegion="polite" className="mb-2 px-1">
              <Text className="text-[14px] leading-5 text-padel">{notice}</Text>
            </View>
          ) : null}
          {error ? (
            <View accessibilityRole="alert" accessibilityLiveRegion="assertive" className="mb-2 px-1">
              <Text className="text-[14px] leading-5 text-danger">{error}</Text>
            </View>
          ) : null}
        </FadeUp>

        <View style={{ flexGrow: 1, minHeight: 24 }} />

        <FadeUp delay={280}>
          <Pressable
            className="min-h-11 items-center justify-center"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              mode === 'signin' ? 'Create an account' : 'Sign in'
            }
            onPress={() => {
              setError(null);
              setNotice(null);
              setEmailError(null);
              setPasswordError(null);
              setConfirmError(null);
              setEmailTouched(false);
              setPasswordTouched(false);
              setConfirmTouched(false);
              setAttempted(false);
              setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
            }}>
            <Text className="text-[14px] text-muted">
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <Text className="font-semibold text-padel">
                {mode === 'signin' ? 'Create one' : 'Sign in'}
              </Text>
            </Text>
          </Pressable>
        </FadeUp>
        </ScrollView>

      <Toast
        key={toast?.id ?? 0}
        message={toast?.message ?? null}
        kind={toast?.kind}
        onDismiss={dismissToast}
      />
    </KeyboardAvoidingView>
  );
}

function EmailCta({
  ready,
  busy,
  signin,
  onPress,
  onFocus,
  onBlur,
}: {
  ready: boolean;
  busy: boolean;
  signin: boolean;
  onPress: () => void;
  onFocus?: (e: unknown) => void;
  onBlur?: (e: unknown) => void;
}) {
  const reduced = useReducedMotion();
  const readyT = useSharedValue(ready ? 1 : 0);

  useEffect(() => {
    readyT.value = withTiming(ready ? 1 : 0, {
      duration: reduced ? 1 : motion.duration.base,
    });
  }, [ready, readyT, reduced]);

  const surface = useAnimatedStyle(() => {
    const glow = reduced ? 0 : 0.14 + readyT.value * 0.2;
    return {
      backgroundColor: interpolateColor(readyT.value, [0, 1], ['#9FCB00', brand.padel]),
      boxShadow: padelGlow(12, 20, glow),
    };
  });

  const idle = signin ? 'Sign in' : 'Create account';
  const label = busy ? (signin ? 'Signing in…' : 'Creating account…') : idle;

  return (
    <PressableScale
      disabled={busy}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      accessibilityRole="button"
      accessibilityState={{ busy }}
      accessibilityLabel={label}
      style={{ height: CONTROL_H, borderRadius: CONTROL_R }}>
      <Animated.View
        style={[
          surface,
          {
            height: CONTROL_H,
            borderRadius: CONTROL_R,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 10,
          },
        ]}>
        {busy ? <LimeStrokeSpinner /> : null}
        <Text className="text-base font-bold text-page">{label}</Text>
      </Animated.View>
    </PressableScale>
  );
}

function LimeStrokeSpinner() {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.linear }), -1, false);
  }, [spin]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View
      accessibilityElementsHidden
      style={{
        width: 20,
        height: 20,
        marginRight: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(10,10,10,0.32)',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Animated.View
        style={[
          {
            width: 14,
            height: 14,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: 'rgba(204,255,0,0.22)',
            borderTopColor: brand.padel,
          },
          style,
        ]}
      />
    </View>
  );
}

function FocusRing({ children, flush }: { children: ReactNode; flush?: boolean }) {
  const [focused, setFocused] = useState(false);
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ onFocus?: Function; onBlur?: Function }>, {
        onFocus: (e: unknown) => {
          setFocused(true);
          (children as ReactElement<{ onFocus?: Function }>).props.onFocus?.(e);
        },
        onBlur: (e: unknown) => {
          setFocused(false);
          (children as ReactElement<{ onBlur?: Function }>).props.onBlur?.(e);
        },
      })
    : children;

  return (
    <View
      style={{
        marginBottom: flush ? 0 : 12,
        overflow: 'visible',
        borderWidth: RING,
        borderColor: focused ? brand.padel : 'transparent',
        borderRadius: CONTROL_R + RING,
      }}>
      {child}
    </View>
  );
}

/** Same rules as the website registration modal. */
const PASSWORD_RULES = [
  {
    id: 'len',
    label: '6+ characters',
    need: '6+ characters',
    hint: 'Use 6+ characters',
    test: (p: string) => p.length >= 6,
  },
  {
    id: 'upper',
    label: 'Uppercase',
    need: 'an uppercase letter',
    hint: 'Add an uppercase letter',
    test: (p: string) => /[A-Z]/.test(p),
  },
  {
    id: 'lower',
    label: 'Lowercase',
    need: 'a lowercase letter',
    hint: 'Add a lowercase letter',
    test: (p: string) => /[a-z]/.test(p),
  },
  {
    id: 'num',
    label: 'Number',
    need: 'a number',
    hint: 'Add a number',
    test: (p: string) => /[0-9]/.test(p),
  },
  {
    id: 'sym',
    label: 'Symbol',
    need: 'a symbol',
    hint: 'Add a symbol',
    test: (p: string) => /[@#$%^&*\-+=|<>?/,.'~]/.test(p),
  },
] as const;

function signupPasswordIssues(password: string): string[] {
  return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.need);
}

function listAnd(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function PasswordRules({ password }: { password: string }) {
  const reduced = useReducedMotion();
  const metCount = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  const total = PASSWORD_RULES.length;
  const complete = metCount === total;
  const next = PASSWORD_RULES.find((rule) => !rule.test(password));
  const [expanded, setExpanded] = useState(!complete);

  useEffect(() => {
    setExpanded(!complete);
  }, [complete]);

  const fill = useSharedValue(metCount / total);
  useEffect(() => {
    fill.value = withTiming(metCount / total, {
      duration: reduced ? 1 : motion.duration.slow,
      easing: Easing.out(Easing.cubic),
    });
  }, [fill, metCount, reduced, total]);

  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  const summary = complete
    ? 'Password meets all requirements'
    : `${metCount} of ${total} complete. ${next?.hint ?? ''}`;

  if (complete && !expanded) {
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        accessibilityRole="button"
        accessibilityLabel={summary}
        accessibilityHint="Shows password requirements"
        className="mb-3 min-h-11 flex-row items-center px-1">
        <SymbolView
          name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
          size={16}
          tintColor={brand.padel}
          accessibilityElementsHidden
        />
        <Text className="ml-2 text-[13px] font-semibold" style={{ color: brand.padel }}>
          Password meets all requirements
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: metCount, text: summary }}
      className="mb-3 px-1">
      <View className="mb-2 flex-row items-baseline justify-between">
        <Pressable
          disabled={!complete}
          onPress={() => setExpanded(false)}
          accessibilityRole={complete ? 'button' : 'text'}
          accessibilityLabel="Requirements"
          accessibilityHint={complete ? 'Hides the checklist' : undefined}
          className="min-h-6 justify-center">
          <Text className="text-[13px] font-semibold text-premium">Requirements</Text>
        </Pressable>
        <Text className="text-[12px] font-semibold" style={{ color: complete ? brand.padel : brand.faint }}>
          {metCount} of {total} complete
        </Text>
      </View>

      <View className="mb-3 flex-row items-center">
        <View className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ backgroundColor: brand.edge }}>
          <Animated.View
            style={[{ height: 3, borderRadius: 2, backgroundColor: brand.padel }, bar]}
          />
        </View>
        {next ? (
          <Text className="ml-3 text-[12px] font-semibold" style={{ color: brand.muted }}>
            {next.hint}
          </Text>
        ) : null}
      </View>

      <View className="flex-row flex-wrap" style={{ rowGap: 8 }}>
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password);
          return (
            <View
              key={rule.id}
              accessible={false}
              className="flex-row items-center"
              style={{ width: '50%', paddingRight: 8 }}>
              <SymbolView
                name={{
                  ios: met ? 'checkmark' : 'circle',
                  android: met ? 'check' : 'radio_button_unchecked',
                  web: met ? 'check' : 'radio_button_unchecked',
                }}
                size={14}
                tintColor={met ? brand.padel : brand.placeholder}
                accessibilityElementsHidden
              />
              <Text
                className="ml-2 text-[13px] leading-5"
                style={{ color: met ? brand.padel : brand.placeholder }}>
                {rule.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function isWeakPassword(e: any): boolean {
  const code = String(e?.code ?? '').toLowerCase();
  if (code === 'weak_password') return true;
  const msg = String(e?.message ?? e ?? '').toLowerCase();
  return (
    msg.includes('weak_password') ||
    msg.includes('too weak') ||
    msg.includes('pwned') ||
    msg.includes('leaked') ||
    msg.includes('easy to guess') ||
    msg.includes('not strong enough')
  );
}

function isInvalidCredentials(e: any): boolean {
  const msg = String(e?.message ?? e ?? '').toLowerCase();
  return msg.includes('invalid login credentials');
}

function isAlreadyRegistered(e: any): boolean {
  if (e instanceof AuthAlreadyRegistered) return true;
  const code = String(e?.code ?? '').toLowerCase();
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    code === 'identity_already_exists'
  ) {
    return true;
  }
  const msg = String(e?.message ?? e ?? '').toLowerCase();
  return (
    msg.includes('already registered') ||
    msg.includes('user already') ||
    msg.includes('already been registered') ||
    msg.includes('database error saving new user')
  );
}

/**
 * Supabase error text is written for developers. Rewrite the ones users
 * actually hit so the screen says what went wrong and what to do about it.
 */
function friendlyError(e: any, intent: Mode = 'signin'): string {
  const msg = String(e?.message ?? e ?? '').toLowerCase();

  if (msg.includes('invalid login credentials')) {
    return 'Email or password is incorrect. Try again or reset your password.';
  }
  if (isAlreadyRegistered(e)) {
    return 'That email already has an account. Try signing in instead.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Confirm your email first — check your inbox for the link.';
  }
  if (isWeakPassword(e) || msg.includes('password should be at least')) {
    return intent === 'signup'
      ? 'That password is too easy to guess. Use a longer mix of letters, numbers and a symbol.'
      : 'Use at least 6 characters.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return intent === 'signup'
      ? 'Unable to create your account. Check your connection and try again.'
      : 'Unable to reach the server. Check your connection and try again.';
  }
  if (msg.includes('audience') || msg.includes('invalid_client')) {
    return intent === 'signup'
      ? 'Account creation is not configured correctly yet. Tell us and we will fix it.'
      : 'Sign-in is not configured correctly yet. Tell us and we will fix it.';
  }
  return intent === 'signup'
    ? 'Unable to create your account. Check your connection and try again.'
    : 'Unable to sign in. Check your connection and try again.';
}
