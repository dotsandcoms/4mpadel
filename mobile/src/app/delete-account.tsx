import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { SettingsGroup, SettingsPage, SettingsRow } from '@/components/settings-ui';
import { deleteCurrentAccount } from '@/lib/account-deletion';
import { AuthCancelled } from '@/lib/auth';
import { lightBrand as brand } from '@/theme/tokens';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { accountId } = useLocalSearchParams<{ accountId?: string }>();
  const title = accountId ? 'Remove Apple sign-in' : 'Delete account';
  const [busy, setBusy] = useState(false);
  const removing = useRef(false);
  async function remove() {
    if (removing.current) return;
    removing.current = true;
    setBusy(true);
    try {
      await deleteCurrentAccount(accountId);
      router.dismissAll();
      if (accountId) {
        router.replace({ pathname: '/(auth)/sign-in', params: { intent: 'existing-profile' } });
        Alert.alert('Apple sign-in removed', 'Sign in to your existing profile, then link Apple in Account & settings.');
      } else {
        router.replace('/(auth)/sign-in');
        Alert.alert('Account deleted', 'Your 4M account and personal profile have been removed.');
      }
    } catch (error) {
      if (!(error instanceof AuthCancelled)) Alert.alert('Could not delete account', error instanceof Error ? error.message : 'Please try again.');
    } finally { removing.current = false; setBusy(false); }
  }
  return <SettingsPage title={title}>
    <View style={{ padding: 20, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E8E5' }}>
      <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 23, fontWeight: '800' }}>{accountId ? 'Remove this unfinished Apple sign-in' : 'Permanently delete your account'}</Text>
      <Text style={{ color: brand.muted, fontSize: 14, lineHeight: 22, marginTop: 14 }}>{accountId
        ? 'This removes the unfinished 4M account and its draft. You can then sign in to your existing profile and link Apple.'
        : 'Your login, player profile, profile photos, gallery, saved schedule and notification settings will be removed. Your saved account data on this phone and paired Apple Watch will be cleared.'}</Text>
      <Text style={{ color: brand.muted, fontSize: 14, lineHeight: 22, marginTop: 14 }}>Limited payment and tournament records may be retained for recordkeeping. Deletion does not automatically refund tournament entries or licence fees.</Text>
      <Text style={{ color: brand.premium, fontSize: 14, lineHeight: 22, marginTop: 14, fontWeight: '600' }}>This cannot be undone. You can create a new account later.</Text>
    </View>
    {busy && <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18 }}><ActivityIndicator color={brand.danger} /><Text style={{ color: brand.premium }}>Deleting your account…</Text></View>}
    <SettingsGroup title="Confirm your choice">
      <SettingsRow title={accountId ? 'Remove Apple sign-in' : 'Delete my account'} detail={accountId ? undefined : 'Permanently remove your account and personal profile'} icon="trash-outline" danger disabled={busy}
        onPress={() => Alert.alert(accountId ? 'Remove this unfinished Apple sign-in?' : 'Delete your 4M account?', accountId ? 'Your unfinished 4M account and draft will be permanently removed.' : 'Your profile and photos will be permanently removed. This cannot be undone.', [
          { text: 'Keep account', style: 'cancel' }, { text: title, style: 'destructive', onPress: () => void remove() },
        ])} />
      <SettingsRow title="Keep my account" icon="arrow-back-outline" disabled={busy} onPress={() => router.back()} />
    </SettingsGroup>
  </SettingsPage>;
}
