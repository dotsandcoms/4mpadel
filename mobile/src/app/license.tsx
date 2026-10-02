import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { ActionButton, Notice } from '@/components/events/event-ui';
import { formatMoney } from '@/lib/event-rules';
import { lightBrand as brand } from '@/theme/tokens';

type Quote = { base: number; fee: number; total: number; feeLabel: string; enabled: boolean; active: boolean };
type Attempt = { id: string; reference: string; url?: string };
async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('native-license-checkout', { body });
  if (error) {
    let message = 'Could not reach licence checkout. Please try again.';
    try { message = (await error.context?.json())?.error || message; } catch { /* offline */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export default function LicenseScreen() {
  const router = useRouter(); const insets = useSafeAreaInsets();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [paid, setPaid] = useState(false);
  const lock = useRef(false); const key = useRef(''); const userId = useRef('');
  async function load() {
    setLoading(true); setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to purchase your licence.');
      userId.current = user.id; key.current = `license-checkout:${user.id}`;
      const [result, saved] = await Promise.all([invoke({ action: 'quote' }), AsyncStorage.getItem(key.current)]);
      setQuote(result.quote); setPaid(result.quote.active);
      if (result.quote.active) await AsyncStorage.removeItem(key.current);
      else if (saved) {
        const restored = JSON.parse(saved); setAttempt(restored);
        // A webhook may finish after the payment sheet or app has closed.
        if (restored.url) { try { await verify(restored.reference); } catch { /* show resume/check controls */ } }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your licence.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith('fourmpadel://license') && Platform.OS === 'ios') {
        try { WebBrowser.dismissBrowser(); } catch { /* payment sheet is already closed */ }
      }
    });
    return () => subscription.remove();
  }, []);
  async function run(action: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function verify(reference: string) {
    const result = await invoke({ action: 'verify', reference });
    if (!result.paid) throw new Error('Payment is not confirmed yet. If you have paid, wait a moment and check again.');
    setPaid(true); setAttempt(null); await AsyncStorage.removeItem(key.current);
  }
  async function pay() {
    if (!quote) return;
    const id = attempt?.id || Crypto.randomUUID();
    const current = attempt || { id, reference: `LIC-${userId.current}-${id}` };
    await AsyncStorage.setItem(key.current, JSON.stringify(current)); setAttempt(current);
    const result = await invoke({ action: 'checkout', attemptId: id, agreed: true, acceptedTotal: quote.total });
    const url = new URL(result.authorizationUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw new Error('Unexpected payment address.');
    const saved = { ...current, reference: result.reference, url: url.href };
    await AsyncStorage.setItem(key.current, JSON.stringify(saved)); setAttempt(saved);
    await WebBrowser.openBrowserAsync(url.href, { controlsColor: brand.accent });
    await verify(saved.reference);
  }
  return <View style={{ flex: 1, backgroundColor: brand.page, paddingTop: insets.top }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Back to profile" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={{ minHeight: 48, paddingHorizontal: 20, justifyContent: 'center' }}><Text style={{ color: brand.premium, fontSize: 16 }}>‹ Back</Text></Pressable>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 20 }}>
      <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 30, fontWeight: '700' }}>Your SAPA licence</Text>
      {loading && <ActivityIndicator color={brand.accent} />}
      {!!error && <Text accessibilityRole="alert" style={{ color: brand.danger, lineHeight: 22 }}>{error}</Text>}
      {paid ? <><Notice title="Your full licence is active">You’re ready to enter SAPA divisions that require a licence.</Notice><ActionButton label="Back to profile" onPress={() => router.replace('/(tabs)/profile')} /></> : quote && <>
        <Notice title="Full annual licence">Activate your SAPA licence from the app. Temporary licences can be added when registering for an eligible tournament.</Notice>
        <View style={{ padding: 20, borderRadius: 16, backgroundColor: brand.elevated, gap: 16 }}>
          <Row label="Annual licence" value={formatMoney(quote.base)} />
          {quote.fee > 0 && <Row label={quote.feeLabel} value={formatMoney(quote.fee)} />}
          <View style={{ height: 1, backgroundColor: brand.edge }} /><Row label="Total" value={formatMoney(quote.total)} />
        </View>
        {!quote.enabled && <Notice title="Licence sales are closed">Please check back when annual licence sales reopen.</Notice>}
        {attempt && <ActionButton label="Check payment status" secondary disabled={busy} onPress={() => void run(() => verify(attempt.reference))} />}
        <ActionButton label={attempt ? 'Continue secure payment' : `Pay ${formatMoney(quote.total)}`} busy={busy} disabled={!quote.enabled} onPress={() => void run(pay)} />
        <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 20 }}>Payment is processed securely by Paystack. Close the payment sheet to return here; we’ll check your payment before activating your licence.</Text>
      </>}
      {!loading && !quote && <ActionButton label="Try again" secondary onPress={() => void load()} />}
    </ScrollView>
  </View>;
}
function Row({ label, value }: { label: string; value: string }) { return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: brand.muted, flex: 1 }}>{label}</Text><Text style={{ color: brand.premium, fontWeight: '700' }}>{value}</Text></View>; }
