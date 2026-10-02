import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { SettingsGroup, SettingsPage, SettingsRow, SETTINGS_BLUE } from '@/components/settings-ui';
import { signOut, sendPasswordReset } from '@/lib/auth';
import { openLegal } from '@/lib/legal';
import { supabase } from '@/lib/supabase';
import { lightBrand as brand } from '@/theme/tokens';
type Account = { name: string | null; region: string | null; racket_brand: string | null; home_club: string | null; image_url: string | null; license_type: string | null };
export default function SettingsScreen() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    (async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!active) return;
      setEmail(user?.email ?? '');
      if (!user?.email) { setAccount(null); return; }
      const { data, error } = await supabase.from('players').select('name,region,racket_brand,home_club,image_url,license_type').eq('email', user.email.toLowerCase()).maybeSingle();
      if (error) throw error;
      if (active) setAccount(data);
    })().catch(() => { if (active) setError('Could not load your account. Please try again.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]));
  const percent = account ? Math.round([account.name, account.region, account.racket_brand, account.home_club, account.image_url].filter(v => v?.trim()).length / 5 * 100) : 0;
  async function logout() {
    setBusy(true);
    try { await signOut(); router.replace('/(auth)/sign-in'); }
    catch { Alert.alert('Could not log out', 'Please check your connection and try again.'); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true);
    try { await sendPasswordReset(email); Alert.alert('Check your email', 'Open the password reset link on this device.'); }
    catch { Alert.alert('Could not send reset link', 'Please try again shortly.'); }
    finally { setBusy(false); }
  }
  return <SettingsPage title="Account & settings">
    {loading ? <ActivityIndicator color={SETTINGS_BLUE} /> : error ? <SettingsRow title="Retry account loading" detail={error} icon="refresh-outline" onPress={() => setAttempt(v => v + 1)} /> : <View style={{ padding: 18, backgroundColor: '#EAF0FF', borderRadius: 22, borderWidth: 1, borderColor: '#DCE4FC' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}><View style={{ flex: 1 }}><Text accessibilityRole="header" style={{ fontSize: 23, fontWeight: '800', color: brand.premium }}>{account?.name || 'Your account'}</Text><Text style={{ fontSize: 13, color: brand.muted, marginTop: 7 }}>{account ? `${account.license_type && account.license_type !== 'none' ? account.license_type + ' SAPA licence' : '4M player account'}` : 'Sign in to manage your profile'}</Text></View>{account?.image_url ? <Image source={{ uri: account.image_url }} style={{ width: 64, height: 64, borderRadius: 32 }} /> : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22, fontWeight: '800', color: SETTINGS_BLUE }}>{account?.name?.split(/\s+/).slice(0, 2).map(n => n[0]).join('') || '4M'}</Text></View>}</View>
      {account && <View accessible accessibilityRole="progressbar" accessibilityLabel="Profile completeness" accessibilityValue={{ min: 0, max: 100, now: percent }} style={{ marginTop: 18 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}><Text style={{ color: brand.muted, fontSize: 12 }}>Profile completeness</Text><Text style={{ color: SETTINGS_BLUE, fontWeight: '700', fontSize: 12 }}>{percent}%</Text></View><View style={{ height: 5, backgroundColor: '#E5EAFE', borderRadius: 3 }}><View style={{ width: `${percent}%`, height: 5, borderRadius: 3, backgroundColor: SETTINGS_BLUE }} /></View></View>}
    </View>}
    <SettingsGroup title="Your account">
      {email ? <><SettingsRow title="Edit profile" detail="Personal details, club and player information" icon="person-outline" onPress={() => router.push('/edit-profile')} /><SettingsRow title="My entries" detail="Upcoming events and previous tournaments" icon="tennisball-outline" onPress={() => router.push('/my-entries')} /><SettingsRow title="Payments & refunds" detail="View your transaction history" icon="wallet-outline" onPress={() => router.push('/payments')} /><SettingsRow title="SAPA licence" detail="View your licence and membership options" icon="ribbon-outline" onPress={() => router.push('/license')} /></> : <SettingsRow title="Sign in" icon="person-outline" onPress={() => router.push('/(auth)/sign-in')} />}
    </SettingsGroup>
    {email && <SettingsGroup title="Preferences & security"><SettingsRow title="Notifications" detail="Player updates, events and reminders" icon="notifications-outline" onPress={() => router.push('/notification-settings')} /><SettingsRow title="Reset password" detail="Send a secure reset link to your account email" icon="lock-closed-outline" disabled={busy} onPress={() => Alert.alert('Reset password?', `Send a reset link to ${email}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Send link', onPress: () => void reset() }])} /></SettingsGroup>}
    <SettingsGroup title="Support"><SettingsRow title="Help & enquiries" detail="Get help with an entry, payment or your account" icon="chatbubble-ellipses-outline" onPress={() => router.push('/help')} /><SettingsRow title="How 4M works" detail="A quick guide to your padel community" icon="book-outline" onPress={() => router.push('/help?topic=guide')} /></SettingsGroup>
    <SettingsGroup title="Legal information"><SettingsRow title="Terms of use" icon="document-text-outline" onPress={() => openLegal('terms')} /><SettingsRow title="Privacy policy" icon="shield-checkmark-outline" onPress={() => openLegal('privacy')} /></SettingsGroup>
    {email && <SettingsGroup title="Account actions"><SettingsRow title="Request account deletion" detail="Contact support to request removal of your account" icon="trash-outline" danger onPress={() => router.push('/help?topic=deletion')} /><SettingsRow title="Log out" icon="log-out-outline" danger disabled={busy} onPress={() => Alert.alert('Log out of 4M Padel?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Log out', onPress: () => void logout() }])} /></SettingsGroup>}
  </SettingsPage>;
}
