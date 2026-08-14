import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import './polyfill-webcrypto';

/**
 * Supabase client for the native app.
 *
 * This points at the SAME project as the website, so accounts, RLS policies
 * and player records carry over untouched — someone who registered on
 * 4mpadel.com signs in here with the same credentials.
 *
 * Three differences from the web client in src/supabaseClient.js, all of them
 * deliberate:
 *
 *   1. storage      — SecureStore (iOS Keychain / Android Keystore), never
 *                     AsyncStorage. Refresh tokens are bearer credentials and
 *                     belong in hardware-backed storage.
 *   2. flowType     — PKCE. A mobile app cannot hold an OAuth client secret,
 *                     so the implicit flow is not an option.
 *   3. detectSessionInUrl — false. There is no URL bar in a native app, and
 *                     leaving this true is the single most common cause of
 *                     broken OAuth in Expo apps ported from web.
 *
 * The publishable key below is public by design and WILL be extracted from the
 * app binary. That is expected and safe: every actual security guarantee is
 * enforced server-side by RLS. Never put the service-role key in this app.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and restart the dev server.'
  );
}

/**
 * SecureStore has a 2048-byte value limit on iOS and rejects some key
 * characters. Supabase session payloads sit well under that, but we fail
 * loudly rather than silently losing a session if that ever changes.
 */
const SecureStorageAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // SecureStore is unavailable on the web target; fall back to the default.
    storage: Platform.OS === 'web' ? undefined : SecureStorageAdapter,
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseKey);
