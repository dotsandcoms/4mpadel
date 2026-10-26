import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { SettingsGroup, SettingsPage, SettingsRow } from '@/components/settings-ui';
import { deleteCurrentAccount } from '@/lib/account-deletion';
import { AuthCancelled } from '@/lib/auth';
import { lightBrand as brand } from '@/theme/tokens';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const removing = useRef(false);
  async function remove() {
    if (removing.current) return;
    removing.current = true;
    setBusy(true);
    try {
      await deleteCurrentAccount();
      router.dismissAll();
      router.replace('/(auth)/sign-in');
      Alert.alert('Account deleted', 'Your 4M account and personal profile have been removed.');
    } catch (error) {
      if (!(error instanceof AuthCancelled)) Alert.alert('Could not delete account', error instanceof Error ? error.message : 'Please try again.');
    } finally { removing.current = false; setBusy(false); }
  }
  return <SettingsPage title="Delete account">
    <View style={{ padding: 20, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4E8E5' }}>
      <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 23, fontWeight: '800' }}>Permanently delete your account</Text>
      <Text style={{ color: brand.muted, fontSize: 14, lineHeight: 22, marginTop: 14 }}>Your login, player profile, profile photos, gallery, saved schedule and notification settings will be removed. Your saved account data on this phone and paired Apple Watch will be cleared.</Text>
      <Text style={{ color: brand.muted, fontSize: 14, lineHeight: 22, marginTop: 14 }}>Limited payment and tournament records may be retained for recordkeeping. Deletion does not automatically refund tournament entries or licence fees.</Text>
      <Text style={{ color: brand.premium, fontSize: 14, lineHeight: 22, marginTop: 14, fontWeight: '600' }}>This cannot be undone. You can create a new account later.</Text>
    </View>
    {busy && <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18 }}><ActivityIndicator color={brand.danger} /><Text style={{ color: brand.premium }}>Deleting your account…</Text></View>}
    <SettingsGroup title="Confirm your choice">
      <SettingsRow title="Delete my account" detail="Permanently remove your account and personal profile" icon="trash-outline" danger disabled={busy}
        onPress={() => Alert.alert('Delete your 4M account?', 'Your profile and photos will be permanently removed. This cannot be undone.', [
          { text: 'Keep account', style: 'cancel' }, { text: 'Delete account', style: 'destructive', onPress: () => void remove() },
        ])} />
      <SettingsRow title="Keep my account" icon="arrow-back-outline" disabled={busy} onPress={() => router.back()} />
    </SettingsGroup>
  </SettingsPage>;
}
