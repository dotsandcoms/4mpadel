import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { formatMoney } from '@/lib/event-rules';
import { lightBrand as brand } from '@/theme/tokens';

type Quote = { eventId: number; eventName: string; registrationId: string; division: string; paid: number; price: number; due: number; total: number };
export default function EntryBalanceScreen() {
  const params = useLocalSearchParams<{ registrationId?: string; reference?: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [reference, setReference] = useState(params.reference || '');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState<{ eventId: number; balance: { due: number; division: string } } | null>(null);
  const lock = useRef(false);
  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('native-entry-balance', { body: { action, registrationId: params.registrationId, reference: reference || params.reference || undefined, ...extra } });
    if (error) { let detail; try { detail = await error.context?.json(); } catch {} throw new Error(detail?.error || 'Could not reach the payment service. Please retry.'); }
    if (data?.error) throw new Error(data.error);
    return data;
  };
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await fn(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const verify = async (ref = reference || params.reference) => {
    if (!ref) return;
    const result = await call('confirm', { reference: ref });
    if (result.paid) setComplete(result);
    else setMessage(result.message || 'Payment is still processing. Check again shortly.');
  };
  const load = () => run(async () => {
    if (params.reference) { setReference(params.reference); await verify(params.reference); return; }
    const result = await call('quote');
    setQuote(result.quote); setReference(result.reference || ''); setCheckoutUrl(result.authorizationUrl || '');
    if (result.reference) await verify(result.reference);
  });
  useEffect(() => { void load(); }, [params.registrationId, params.reference]);
  useEffect(() => {
    const listener = Linking.addEventListener('url', ({ url }) => {
      if (/^fourmpadel:\/\/events\/pay-balance\?reference=MBAL-[a-f0-9]{48}$/.test(url) && Platform.OS === 'ios') void WebBrowser.dismissBrowser().catch(() => {});
    });
    return () => listener.remove();
  }, []);
  const pay = () => run(async () => {
    let ref = reference, url = checkoutUrl;
    if (!url) {
      const result = await call('checkout', { acceptedTotal: quote?.total });
      if (!result.reference || !result.authorizationUrl) throw new Error('Checkout is not ready. Check payment status before trying again.');
      ref = result.reference; url = result.authorizationUrl;
      setQuote(result.quote); setReference(ref); setCheckoutUrl(url);
    }
    if (!url.startsWith('https://checkout.paystack.com/')) throw new Error('Invalid payment destination.');
    await WebBrowser.openBrowserAsync(url);
    await verify(ref);
  });
  const button = (label: string, onPress: () => void, secondary = false) => <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={{ minHeight: 52, borderRadius: 14, padding: 16, backgroundColor: secondary ? brand.elevated : brand.padel, opacity: busy ? 0.5 : 1, alignItems: 'center' }}><Text style={{ color: brand.premium, fontWeight: '600' }}>{label}</Text></Pressable>;
  return <View style={{ flex: 1, backgroundColor: brand.page }}>
    <Stack.Screen options={{ title: 'Entry balance', headerShown: true }} />
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 48 }}>
      {complete ? <>
        <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 25, fontWeight: '700' }}>Payment received</Text>
        <Text style={{ color: brand.muted }}>{complete.balance.due > 0 ? `The price changed again. Your remaining balance is ${formatMoney(complete.balance.due)}.` : `Your entry in ${complete.balance.division} is paid in full.`}</Text>
        {button('View my entry', () => router.replace({ pathname: '/events/[id]', params: { id: String(complete.eventId) } }))}
      </> : <>
        <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 25, fontWeight: '700' }}>Your entry balance</Text>
        {quote && <View style={{ backgroundColor: brand.elevated, borderRadius: 18, padding: 20, gap: 16 }}>
          <Text style={{ color: brand.premium, fontWeight: '600', fontSize: 18 }}>{quote.eventName}</Text>
          <Text style={{ color: brand.muted }}>Already paid · {formatMoney(quote.paid)}</Text>
          <Text style={{ color: brand.premium }}>Current entry price · {formatMoney(quote.price)}</Text>
          <Text style={{ color: brand.premium, fontWeight: '700', fontSize: 24 }}>Amount due: {formatMoney(quote.total)}</Text>
          <Text style={{ color: brand.muted, lineHeight: 22 }}>This pays the outstanding entry-fee balance. Your division and partner stay unchanged.</Text>

        </View>}
        {!!message && <Text accessibilityRole="alert" style={{ color: brand.muted, lineHeight: 22 }}>{message}</Text>}
        {busy && <ActivityIndicator color={brand.accent} />}
        {quote && quote.total > 0 && button(reference ? 'Resume payment' : `Pay balance · ${formatMoney(quote.total)}`, () => void pay())}
        {!!reference && button('Check payment status', () => void run(() => verify()), true)}
        {!quote && !reference && !busy && button('Retry', () => void load(), true)}
        {button('Back to event', () => router.back(), true)}
      </>}
    </ScrollView>
  </View>;
}
