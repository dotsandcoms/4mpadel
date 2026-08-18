import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { unregisterPushToken } from './notifications';
import { collectSignupDevice, deviceSignupSource, recordAppDevice } from './signup-source';
import { supabase } from './supabase';

/**
 * Native sign-in.
 *
 * Both providers use `signInWithIdToken` rather than a browser redirect. The
 * OS presents its own account sheet, we hand the resulting identity token to
 * Supabase, and Supabase verifies it against the client IDs registered in its
 * provider settings. No web view, no redirect round-trip.
 *
 * The corollary is that Supabase must list the *native* client IDs under
 * "Authorized Client IDs" — the Bundle ID for Apple, the iOS/Android client
 * IDs for Google. The Services ID and Web client ID are for the web flow and
 * are not what the device presents.
 */

if (Platform.OS !== 'web') {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    scopes: ['email', 'profile'],
  });
}

export class AuthCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AuthCancelled';
  }
}

export class AuthAlreadyRegistered extends Error {
  constructor() {
    super('already registered');
    this.name = 'AuthAlreadyRegistered';
  }
}

/** True only on iOS 13+ with Sign in with Apple available. */
export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple() {
  let credential: AppleAuthentication.AppleAuthenticationCredential;

  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') throw new AuthCancelled();
    throw e;
  }

  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
  await stampSignupSource(data.user);
  await recordAppDevice();

  /**
   * Apple returns the user's name ONLY on the very first authorisation, and
   * never again — not even after deleting and reinstalling the app. If we
   * don't capture it now it is gone for good, so persist it immediately.
   */
  const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (fullName && data.user) {
    await supabase.auth.updateUser({ data: { full_name: fullName } });
  }

  return data;
}

export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  let idToken: string | null = null;
  try {
    const res = await GoogleSignin.signIn();
    idToken = res.data?.idToken ?? null;
  } catch (e: any) {
    // SIGN_IN_CANCELLED
    if (e?.code === '-5' || e?.code === 12501 || e?.code === 'SIGN_IN_CANCELLED') {
      throw new AuthCancelled();
    }
    throw e;
  }

  if (!idToken) throw new Error('Google did not return an identity token.');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
  await stampSignupSource(data.user);
  await recordAppDevice();

  return data;
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  await recordAppDevice();
  return data;
}

export async function signUpWithEmail(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: normalized,
    password,
    options: {
      data: {
        signup_source: deviceSignupSource(),
        signup_device: collectSignupDevice(),
      },
    },
  });
  if (error) {
    const code = String(error.code ?? '').toLowerCase();
    const msg = String(error.message ?? '').toLowerCase();
    if (
      code === 'user_already_exists' ||
      code === 'email_exists' ||
      code === 'identity_already_exists' ||
      msg.includes('already registered') ||
      msg.includes('user already')
    ) {
      throw new AuthAlreadyRegistered();
    }
    throw error;
  }
  return data;
}

/**
 * Record web / iOS / Android on first-time auth only. Returning users
 * already have a source (or are pre-app, which we treat as web).
 */
async function stampSignupSource(
  user: { created_at?: string; user_metadata?: Record<string, unknown> } | null
) {
  if (!user || user.user_metadata?.signup_source) return;
  const created = user.created_at ? new Date(user.created_at).getTime() : 0;
  if (!created || Date.now() - created > 120_000) return;
  await supabase.auth.updateUser({
    data: {
      signup_source: deviceSignupSource(),
      signup_device: collectSignupDevice(),
    },
  });
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: 'fourmpadel://reset-password',
  });
  if (error) throw error;
}

export async function signOut() {
  try {
    await unregisterPushToken();
  } catch {
    // Token drop is best-effort — still sign out.
  }
  try {
    await GoogleSignin.signOut();
  } catch {
    // Not signed in via Google — nothing to revoke.
  }
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
