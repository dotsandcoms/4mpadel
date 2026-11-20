import { clearAccountAnalytics } from './analytics';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Image } from 'expo-image';
import { Platform } from 'react-native';
import { AuthCancelled } from './auth';
import { setCompanionAccount } from './companion';
import { hasPlayerProfile } from './profile';
import { clearDraftText } from './profile-draft-storage';
import { supabase } from './supabase';

export async function deleteCurrentAccount(expectedAccountId?: string) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || (expectedAccountId && user.id !== expectedAccountId)) {
    throw new Error('Please sign in to the account you want to delete and try again.');
  }
  let appleAuthorizationCode: string | undefined;
  const apple = user.identities?.find(identity => identity.provider === 'apple');
  if (expectedAccountId && (!apple || !user.email?.toLowerCase().endsWith('@privaterelay.appleid.com') || await hasPlayerProfile(user.email))) {
    throw new Error('This option is for unfinished Apple sign-ins. To delete a saved profile, use Account & settings.');
  }
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
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session || session.user.id !== user.id) {
    throw new Error('Please sign in to the account you want to delete and try again.');
  }
  // Erase the device draft first so a storage failure cannot leave it behind
  // after the server has permanently removed the account.
  await clearDraftText(user.email);
  const result = await supabase.functions.invoke('delete-account', {
    headers: { Authorization: `Bearer ${session.access_token}` },
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
