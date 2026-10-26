import { clearAccountAnalytics } from './analytics';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Image } from 'expo-image';
import { Platform } from 'react-native';
import { AuthCancelled } from './auth';
import { setCompanionAccount } from './companion';
import { clearDraftText } from './profile-draft-storage';
import { supabase } from './supabase';

export async function deleteCurrentAccount() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Please sign in again before deleting your account.');
  let appleAuthorizationCode: string | undefined;
  const apple = user.identities?.find(identity => identity.provider === 'apple');
  if (apple) {
    if (Platform.OS !== 'ios') throw new Error('Please confirm your Apple account on your iPhone to complete deletion.');
    try {
      const credential = await AppleAuthentication.signInAsync();
      if (!credential.authorizationCode || credential.user !== apple.identity_data?.sub) {
        throw new Error('Please use the Apple account linked to your 4M profile.');
      }
      appleAuthorizationCode = credential.authorizationCode;
    } catch (error: any) {
      if (error?.code === 'ERR_REQUEST_CANCELED') throw new AuthCancelled();
      throw error;
    }
  }
  // Erase the device draft first so a storage failure cannot leave it behind
  // after the server has permanently removed the account.
  await clearDraftText(user.email);
  const result = await supabase.functions.invoke('delete-account', {
    body: { confirmation: 'DELETE', ...(appleAuthorizationCode ? { appleAuthorizationCode } : {}) },
  });
  if (result.error || result.data?.deleted !== true) {
    throw new Error('Your account could not be deleted. Please check your connection and try again.');
  }
  await setCompanionAccount(null);
  void clearAccountAnalytics();
  try { await GoogleSignin.signOut(); } catch { /* No Google session. */ }
  await supabase.auth.signOut({ scope: 'local' });
  await Promise.allSettled([Image.clearMemoryCache(), Image.clearDiskCache()]);
}
