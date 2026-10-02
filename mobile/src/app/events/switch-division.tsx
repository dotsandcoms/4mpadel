import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { formatMoney } from '@/lib/event-rules';
import { lightBrand as brand } from '@/theme/tokens';

type Quote = { eventId: number; eventName: string; registrationId: string; targetDivisionId: string; fromName: string; targetName: string; oldFee: number; newFee: number; total: number; partnerName: string | null };
export default function DivisionSwitchScreen() {
  const params = useLocalSearchParams<{ registrationId?: string; targetDivisionId?: string; reference?: string }>();
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [reference, setReference] = useState(params.reference || '');
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState<{ eventId: number; targetName: string } | null>(null);
  const lock = useRef(false);
  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('native-division-switch', { body: { action, registrationId: params.registrationId, targetDivisionId: params.targetDivisionId, reference: reference || params.reference || undefined, ...extra } });
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
    if (result.switched) setComplete(result);
    else setMessage(result.message || 'Payment is still processing. Check again shortly.');
  };
  const load = () => run(async () => {
    if (params.reference) { setReference(params.reference); await verify(params.reference); return; }
    const result = await call('quote');
    setQuote(result.quote); setReference(result.reference || ''); setCheckoutUrl(result.authorizationUrl || '');
    if (result.reference) await verify(result.reference);
  });
  useEffect(() => { void load(); }, [params.registrationId, params.targetDivisionId, params.reference]);
  useEffect(() => {
    const listener = Linking.addEventListener('url', ({ url }) => {
      if (/^fourmpadel:\/\/events\/switch-division\?reference=MSWITCH-[a-f0-9]{48}$/.test(url) && Platform.OS === 'ios') void WebBrowser.dismissBrowser().catch(() => {});
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
    <Stack.Screen options={{ title: 'Switch division', headerShown: true }} />
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 48 }}>
      {complete ? <>
        <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 25, fontWeight: '700' }}>Division switched</Text>
        <Text style={{ color: brand.muted }}>Your entry is confirmed in {complete.targetName}.</Text>
        {button('View my entry', () => router.replace({ pathname: '/events/[id]', params: { id: String(complete.eventId) } }))}
      </> : <>
        <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 25, fontWeight: '700' }}>Pay the difference</Text>
        {quote && <View style={{ backgroundColor: brand.elevated, borderRadius: 18, padding: 20, gap: 16 }}>
          <Text style={{ color: brand.premium, fontWeight: '600', fontSize: 18 }}>{quote.eventName}</Text>
          <Text style={{ color: brand.muted }}>{quote.fromName} · {formatMoney(quote.oldFee)}</Text>
          <Text style={{ color: brand.premium }}>To {quote.targetName} · {formatMoney(quote.newFee)}</Text>
          <Text style={{ color: brand.premium, fontWeight: '700', fontSize: 24 }}>Amount due: {formatMoney(quote.total)}</Text>
          <Text style={{ color: brand.muted, lineHeight: 22 }}>Your current entry stays in place until payment is verified and the switch is complete.</Text>
          {!!quote.partnerName && <Text style={{ color: brand.muted, lineHeight: 22 }}>This moves only your entry. {quote.partnerName} stays in the original division and your partner link is removed.</Text>}
        </View>}
        {!!message && <Text accessibilityRole="alert" style={{ color: brand.muted, lineHeight: 22 }}>{message}</Text>}
        {busy && <ActivityIndicator color={brand.accent} />}
        {quote && button(reference ? 'Resume payment' : `Pay ${formatMoney(quote.total)} & switch`, () => void pay())}
        {!!reference && button('Check payment status', () => void run(() => verify()), true)}
        {!quote && !reference && !busy && button('Retry', () => void load(), true)}
        {button('Back to event', () => router.back(), true)}
      </>}
    </ScrollView>
  </View>;
}
