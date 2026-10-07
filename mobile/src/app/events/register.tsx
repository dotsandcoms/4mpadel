import { EntrySavedBanner } from '@/components/events/entry-saved-banner';
import { Toast } from '@/components/toast';
import { SizePicker } from '@/components/events/tshirt-size-picker';
import { SponsorDetails } from '@/components/events/sponsor-details';
import { Choices, DivisionOptions, LicencePicker, type LicenceOption, type PartnerChoice } from '@/components/events/registration-options';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { eventImage } from '@/lib/events';
import { formatEventRange } from '@/lib/home';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButton, Notice } from '@/components/events/event-ui';
import { confirmCheckout, invokeCheckout, type CheckoutInput, type Quote } from '@/lib/event-checkout';
import { currentEmail, fetchDivisions, fetchEvent, fetchMyEventRegistrations, setEventScheduled, type Division, type EventDetail } from '@/lib/events';
import { entryFee, formatMoney, registrationState } from '@/lib/event-rules';
import { openSitePath } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import { parsePaymentReturn } from '@/lib/payment-return';
import { lightBrand as brand } from '@/theme/tokens';
import { requestPushPermission } from '@/lib/notifications';

export default function RegisterScreen() {
  const { id, mode, entry } = useLocalSearchParams<{ id: string; mode?: string; entry?: string }>();
  return <RegistrationFlow key={`${id}:${mode || 'register'}:${entry || ''}`} />;
}
function RegistrationFlow() {
  const { id, mode, entry, pay_ref, payment_return } = useLocalSearchParams<{ id: string; mode?: string; entry?: string; pay_ref?: string; payment_return?: string }>();
  const autoVerified = useRef('');
  useEffect(() => {
    const listener = Linking.addEventListener('url', ({ url }) => {
      if (parsePaymentReturn(url) && Platform.OS === 'ios') void WebBrowser.dismissBrowser().catch(() => {});
    });
    return () => listener.remove();
  }, []);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  const [registrationEdited, setRegistrationEdited] = useState(false);
  const payOnly = mode === 'pay' && !registrationEdited;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<(EventDetail & { collect_tshirt_size?: boolean }) | null>(null);
  const availability = event ? registrationState(event, null, now) : 'open';
  const [step, setStep] = useState(mode === 'pay' ? 2 : 1);
  const [partners, setPartners] = useState<Record<string, PartnerChoice>>({});
  const [playtomic, setPlaytomic] = useState('');
  const [rankedinAccount, setRankedinAccount] = useState<boolean | null>(null);
  const [licences, setLicences] = useState<LicenceOption[]>([]);
  const [licenseChoice, setLicenseChoice] = useState<'temporary' | 'full'>();
  const [hasLicence, setHasLicence] = useState(false);
  const [profile, setProfile] = useState<{ id: string; rankedin_id?: string; name: string; email: string; contact_number: string; license_type: string; points: number | null; image_url: string | null } | null>(null);
  const [existingDivisionIds, setExistingDivisionIds] = useState<string[]>([]);
  const scroll = useRef<ScrollView>(null);
  const goStep = (value: number) => { setStep(value); scroll.current?.scrollTo({ y: 0, animated: true }); };
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<NonNullable<Quote['entries']>>([]);
  const [paymentChoices, setPaymentChoices] = useState<Record<string, { self: boolean; partner: boolean }>>({});
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [payForPartner, setPayForPartner] = useState<boolean | undefined>(payOnly ? undefined : false);
  const [tshirtLogoUrl, setTshirtLogoUrl] = useState<string>();
  const [tshirtSponsorName, setTshirtSponsorName] = useState<string>();
  const [partnerTshirtLogoUrl, setPartnerTshirtLogoUrl] = useState<string>();
  const [partnerTshirtSponsorName, setPartnerTshirtSponsorName] = useState<string>();
  const [sponsorChanged, setSponsorChanged] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [tshirtSize, setTshirtSize] = useState('');
  const [partnerTshirtSize, setPartnerTshirtSize] = useState('');
  const [code, setCode] = useState('');
  const [grant, setGrant] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [obligations, setObligations] = useState(false);
  const [sapaAgreed, setSapaAgreed] = useState(false);
  const needsSapa = !!event && !event.is_weekly && !!event.sapa_status && event.sapa_status.toLowerCase() !== 'none';
  const agreementsComplete = agreed && obligations && (!needsSapa || sapaAgreed);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setBusy] = useState(false);
  const busy = actionBusy || logoUploading;
  const [error, setError] = useState('');
  const [errorToast, setErrorToast] = useState<{ id: number; message: string } | null>(null);
  const errorToastId = useRef(0);
  const dismissErrorToast = useRef(() => setErrorToast(null)).current;
  const showError = (message: string) => { setError(message); setErrorToast({ id: ++errorToastId.current, message }); };
  const [reference, setReference] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [returnedFromCheckout, setReturnedFromCheckout] = useState(false);
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const showPaymentStatus = !!reference && (!payOnly || checkoutStarted || payment_return === '1');
  const [done, setDone] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [partnerPayAccepted, setPartnerPayAccepted] = useState(false);
  const attempt = useRef(Crypto.randomUUID());
  const submitted = useRef(false);
  const storageKey = useRef('');
  const input: CheckoutInput = { ...(payOnly ? { mode: 'pay' as const } : {}), eventId: event?.id || Number(id), divisionIds: selected, partnerEmail: partnerEmail.trim().toLowerCase(),
    selections: event?.is_weekly ? undefined : selected.map(divisionId => ({ divisionId, ...partners[divisionId], ...(payOnly ? { payForSelf: paymentChoices[divisionId]?.self ?? false, payForPartner: paymentChoices[divisionId]?.partner ?? false } : {}) })), licenseChoice,
    ...(!payOnly || sponsorChanged ? { tshirtLogoUrl, tshirtSponsorName } : {}), partnerTshirtLogoUrl, partnerTshirtSponsorName,
    payForSelf: payOnly && event?.is_weekly ? paymentChoices.weekly?.self : undefined,
    payForPartner: payOnly && event?.is_weekly ? paymentChoices.weekly?.partner : payForPartner, tshirtSize, partnerTshirtSize, accessGrantId: grant, isTest: __DEV__ };
  const load = async () => {
    setReturnedFromCheckout(false); setCheckoutStarted(false);
    setLoading(true); setError(''); setErrorToast(null); setQuote(null); setPaymentOptions([]); setAgreed(false); setReference(null); setCheckoutUrl(null); setDone(false); setPartnerEmail(''); setPartnerName('');
    try {
      const row = await fetchEvent(id);
      setEvent(row);
      setDivisions(row.is_manual && !row.is_weekly ? await fetchDivisions(row.id) : []);
      const email = await currentEmail();
      let restoredPartnerPayment = payForPartner;
      if (email) {
        const { data: player, error: profileError } = await supabase.from('players').select('id,name,email,contact_number,license_type,paid_registration,points,image_url,rankedin_id,temporary_licenses(event_id,event_date)').ilike('email', email).maybeSingle();
        if (profileError) throw profileError;
        setProfile(player);
        setHasLicence(!!((player?.license_type === 'full' && player?.paid_registration) || player?.temporary_licenses?.some((l: any) => Number(l.event_id) === row.id || String(l.event_date || '').slice(0, 10) >= String(row.end_date || row.start_date).slice(0, 10))));
        if (player?.rankedin_id) setRankedinAccount(true);
        const { data: commerce, error: pricingError } = await supabase.from('commerce_config').select('*').eq('id', 'default').maybeSingle();
        if (pricingError) throw pricingError;
        const options: LicenceOption[] = [];
        for (const type of ['temporary', 'full'] as const) {
          const prefix = type === 'full' ? 'full' : 'temp';
          if (commerce?.[`${prefix}_license_enabled`] && (type === 'full' || (row as any).allow_temporary_license !== false)) {
            const base = Number(commerce[`${prefix}_license_price`]);
            options.push({ type, amount: Math.round((base + Math.round(base * Number(commerce.license_fee_percent || 0)) / 100) * 100) / 100 });
          }
        }
        setLicences(options);
        setLicenseChoice(options[0]?.type);
        const regs = await fetchMyEventRegistrations(row.id, email);
        if (payOnly) { setTshirtLogoUrl(regs[0]?.tshirt_logo_url); setTshirtSponsorName(regs[0]?.tshirt_sponsor_name); }

        const registeredIds = regs.map(r => r.division_id).filter((v): v is string => !!v);
        setExistingDivisionIds(registeredIds);
        setSelected(payOnly ? entry ? regs.filter(r => r.id === entry).map(r => r.division_id).filter((v): v is string => !!v) : registeredIds : []);
        if (mode === 'add-partner') {
          const existing = regs.find(r => r.id === entry);
          if (!existing) throw new Error('This entry is no longer available. Return to the event and refresh.');
          if (existing.partner_email) throw new Error('Remove the current partner through Manage entry before adding another.');
          setSelected(existing.division_id ? [existing.division_id] : []);
          setTshirtSize(existing.tshirt_size || '');
          setTshirtLogoUrl(existing.tshirt_logo_url);
          setTshirtSponsorName(existing.tshirt_sponsor_name);
          setStep(2);
        }
        if (payOnly && regs[0]?.partner_email) { setPartnerEmail(regs[0].partner_email); setPartnerName(regs[0].partner_name || ''); }
        storageKey.current = `native-checkout:${email}:${row.id}${payOnly ? ':pay' : ''}`;
        const stored = await AsyncStorage.getItem(storageKey.current);
        if (stored) {
          try { const pending = JSON.parse(stored); setReference(pending.reference); setCheckoutUrl(pending.url); if (pending.quote) setQuote(pending.quote); if (pending.selected) setSelected(pending.selected); if (pending.paymentChoices) setPaymentChoices(pending.paymentChoices); restoredPartnerPayment = pending.payForPartner; setPayForPartner(restoredPartnerPayment); }
          catch { setReference(stored); }
        }
      }
      if (payOnly && row.is_manual && payment_return !== '1') {
        if (!email) throw new Error('Sign in to pay your existing entry.');
        const result = await invokeCheckout({ ...input, eventId: row.id, mode: 'pay', payForPartner: restoredPartnerPayment });
        setQuote(result.quote);
        setPaymentOptions(result.quote.entries || []);
        const restored: Record<string, PartnerChoice> = {};
        for (const entry of result.quote.entries || []) {
          if (!entry.divisionId) continue;
          const { data: found } = entry.partnerEmail ? await supabase.rpc('find_registration_partner', { p_email: entry.partnerEmail, p_event_id: row.id }) : { data: [] };
          const p = found?.find((p: any) => p.email?.toLowerCase() === entry.partnerEmail?.toLowerCase());
          restored[entry.divisionId] = { partnerEmail: entry.partnerEmail, partnerName: entry.partnerName || undefined, tshirtLogoUrl: entry.partnerTshirtLogoUrl, tshirtSponsorName: entry.partnerTshirtSponsorName, partnerId: p?.id, image_url: p?.image_url, activeLicence: !!((p?.license_type === 'full' && p?.paid_registration) || p?.has_temp_license_for_event), payForPartner: entry.partnerEmail && entry.partnerPaymentStatus !== 'paid' ? restoredPartnerPayment ?? true : false };
        }
        setPartners(restored);
        if (entry && !(result.quote.entries || []).some(item => item.id === entry)) throw new Error('This entry is no longer available for payment. Return to the event and refresh.');
        const targetIds = entry ? (result.quote.entries || []).filter(item => item.id === entry && item.divisionId).map(item => item.divisionId!) : Object.keys(restored);
        setSelected(targetIds);
        setPaymentChoices(Object.fromEntries((result.quote.entries || []).map(item => {
          const included = !entry || item.id === entry;
          return [item.divisionId || 'weekly', { self: included && item.paymentStatus !== 'paid', partner: included && item.paymentStatus === 'paid' && !!item.partnerEmail && item.partnerPaymentStatus !== 'paid' }];
        })));
      }
    } catch (e) { showError(e instanceof Error ? e.message : 'Could not load registration.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [id, mode]);
  const run = async (action: () => Promise<void>) => {
    if (submitted.current) return;
    submitted.current = true; setBusy(true); setError(''); setErrorToast(null);
    try { await action(); } catch (e) { showError(e instanceof Error ? e.message : 'Could not complete that action.'); }
    finally { submitted.current = false; setBusy(false); }
  };
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  const finish = async (pending: boolean) => {
    setShowSavedBanner(true);
    scroll.current?.scrollTo({ y: 0, animated: true });
    setPaymentPending(pending); setDone(true); setReference(null);
    if (storageKey.current) await AsyncStorage.removeItem(storageKey.current);
    try { await setEventScheduled(Number(id), true); } catch { showError('Your entry was saved, but the event could not be added to your schedule. You can save it from the event page.'); }
    void requestPushPermission().catch(() => {});
  };
  const verify = () => run(async () => {
    if (!reference) return;
    await confirmCheckout(reference);
    const email = await currentEmail();
    const entries = email ? await fetchMyEventRegistrations(Number(id), email) : [];
    if (!entries.length || (payOnly ? !quote?.entries?.length || !quote.entries.every(item => entries.some(r => r.id === item.id && (!item.payForSelf || r.payment_status === 'paid') && (!item.payForPartner || r.partner_payment_status === 'paid'))) : !entries.some(r => r.payment_status === 'paid'))) throw new Error('Your payment is being processed. Wait a moment and check again.');
    await finish(false);
  });
  useEffect(() => {
    if (payment_return !== '1' || !pay_ref || loading || busy || done || autoVerified.current === pay_ref) return;
    autoVerified.current = pay_ref;
    if (reference !== pay_ref) { showError('This return does not match your saved checkout. Open your event entry to check the payment.'); return; }
    setReturnedFromCheckout(true);
    void verify();
  }, [payment_return, pay_ref, reference, loading, busy, done]);
  const checkout = () => run(async () => {
    if (!quote) return;
    const result = await invokeCheckout(input, { attemptId: attempt.current, acceptedTotal: quote.total, agreed: agreementsComplete });
    if (result.registered) {
      await finish(!!result.paymentPending);
      if (result.emailWarning) showError(result.emailWarning);
      return;
    }
    if (!result.authorizationUrl || !result.reference) throw new Error('Checkout could not be opened. Please try again.');
    const url = new URL(result.authorizationUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw new Error('The payment provider returned an unexpected checkout address.');
    setCheckoutStarted(true);
    setReference(result.reference);
    setCheckoutUrl(result.authorizationUrl);
    if (storageKey.current) await AsyncStorage.setItem(storageKey.current, JSON.stringify({ reference: result.reference, url: result.authorizationUrl, payForPartner, selected, paymentChoices, quote: result.quote }));
    await WebBrowser.openBrowserAsync(result.authorizationUrl, { controlsColor: brand.padel });
    setReturnedFromCheckout(true);
  });
  const back = () => {
    if (busy) return;
    if (!done && !showPaymentStatus && payOnly && step === 2) {
      router.replace({ pathname: '/events/[id]', params: { id: String(event?.id || id) } });
    } else if (!done && !showPaymentStatus && step > 1) {
      setError(''); setErrorToast(null); setAgreed(false); setObligations(false); setSapaAgreed(false);
      attempt.current = Crypto.randomUUID();
      goStep(step === 4 ? payOnly ? 2 : event?.is_weekly ? 3 : 2 : step - 1);
    } else if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/events/[id]', params: { id: String(event?.id || id) } });
  };
  const review = () => run(async () => {
    if (needsPartnerPaymentAcknowledgment && !partnerPayAccepted) throw new Error('Confirm that you accept responsibility for your partner’s payment before continuing.');
    const result = await invokeCheckout(input);
    setQuote(result.quote); setAgreed(false); setObligations(false); setSapaAgreed(false);
    attempt.current = Crypto.randomUUID(); goStep(4);
  });
  const needsPartnerPaymentAcknowledgment = payOnly
    ? false
    : event?.is_weekly ? !!partnerEmail.trim() && payForPartner === false
      : selected.some(divisionId => !!partners[divisionId]?.partnerEmail && partners[divisionId].payForPartner === false);
  const togglePayment = (divisionId: string, person: 'self' | 'partner') => {
    const current = paymentChoices[divisionId] || { self: false, partner: false };
    const next = { ...current, [person]: !current[person] };
    setPaymentChoices(values => ({ ...values, [divisionId]: next }));
    if (divisionId !== 'weekly') setSelected(ids => next.self || next.partner ? [...new Set([...ids, divisionId])] : ids.filter(id => id !== divisionId));
    setQuote(null);
    attempt.current = Crypto.randomUUID();
  };
  return <View style={{ flex: 1, backgroundColor: brand.page }}>
    <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 20 }}>
      <Pressable onPress={back} disabled={busy} accessibilityRole="button" accessibilityLabel="Back" style={{ minHeight: 48, justifyContent: 'center' }}>
        <Text style={{ color: brand.premium, fontSize: 16 }}>‹  Back</Text></Pressable>
    </View>
    {showSavedBanner && <EntrySavedBanner eventName={event?.event_name || 'this event'} pending={paymentPending} onDismiss={() => setShowSavedBanner(false)} />}
    <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40, gap: 20 }}>
      <Text style={{ color: brand.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2 }}>{done ? 'ENTRY RECEIVED' : payOnly ? 'PAY YOUR ENTRY' : step === 4 ? 'REVIEW YOUR ENTRY' : 'JOIN THE EVENT'}</Text>
      <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 }}>{event?.event_name || 'Registration'}</Text>
      {event?.is_manual && !showPaymentStatus && <View style={{ flexDirection: 'row', gap: 6 }}>
        {['Profile', event?.is_weekly ? 'Dates' : 'Division', event?.is_weekly ? 'Entry' : 'Partner', 'Review & Pay', 'Confirmed'].map((label, index) => <View key={label} style={{ flex: 1, gap: 8 }}>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: index < (done && !paymentPending ? 5 : done ? 4 : step) ? brand.padel : brand.edge }} />
          <Text style={{ color: index === (done && !paymentPending ? 4 : done ? 3 : step - 1) ? brand.accent : brand.muted, fontSize: 10 }}>{index < (done && !paymentPending ? 4 : done ? 3 : step - 1) ? '✓' : index + 1}. {label}</Text>
        </View>)}
      </View>}
      {loading && <View style={{ gap: 12, alignItems: 'center', padding: 24 }}><ActivityIndicator color={brand.accent} /><Text style={{ color: brand.muted }}>{payOnly ? 'Loading your existing entry and outstanding fees…' : 'Loading registration details…'}</Text></View>}
      {!event && !loading && <ActionButton label="Try again" secondary onPress={load} />}
      {done ? <>
        <Notice title={paymentPending ? 'Registration received — payment pending' : 'Your entry is confirmed'}>
          {paymentPending ? 'Follow the organiser’s payment instructions. Your payment remains pending until the organiser confirms it.' : 'Your entry is saved. You can review it on the event page and in your schedule.'}
        </Notice>
        {!!event?.payment_instructions && <Text style={{ color: brand.muted, lineHeight: 23 }}>{event.payment_instructions}</Text>}
        {paymentPending && event?.payment_method === 'eft' && <Notice title="EFT details">
          {[event.payment_bank_name, event.payment_account_name, event.payment_account_number,
            event.payment_branch_code ? `Branch: ${event.payment_branch_code}` : null,
            event.payment_reference_note ? `Reference: ${event.payment_reference_note}` : null].filter(Boolean).join('\n') || 'Contact the organiser for their banking details.'}
        </Notice>}
        {!!event?.external_payment_url && <ActionButton label="Open organiser payment page" secondary onPress={() => run(async () => {
          const url = new URL(event.external_payment_url!); if (url.protocol !== 'https:') throw new Error('Contact the organiser for their secure payment link.'); await Linking.openURL(url.href);
        })} />}
        <ActionButton label="View my entry" onPress={() => router.replace({ pathname: '/events/[id]', params: { id } })} />
      </> : showPaymentStatus ? <>
        <Notice title={returnedFromCheckout ? 'Check your payment' : checkoutUrl ? 'Continue your payment' : 'Check your payment'}>
          {returnedFromCheckout
            ? 'If you completed payment, check its status below. If you closed checkout before paying, you can continue your payment.'
            : checkoutUrl
              ? 'You have a saved checkout for this event. Continue to secure checkout to complete payment. Already paid? Check your payment status below.'
              : 'A previous payment attempt was found. Check its status before continuing.'}
        </Notice>
        {checkoutUrl && <ActionButton label="Continue to checkout" secondary={returnedFromCheckout} busy={busy} onPress={() => run(async () => {
          const url = new URL(checkoutUrl);
          if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw new Error('This saved checkout address is invalid.');
          await WebBrowser.openBrowserAsync(url.href, { controlsColor: brand.padel });
          setReturnedFromCheckout(true);
        })} />}
        <ActionButton label="Check payment status" secondary={!!checkoutUrl && !returnedFromCheckout} busy={busy} onPress={verify} />
        <ActionButton label="Return to event" secondary disabled={busy} onPress={() => router.back()} />
        <Text style={{ color: brand.faint, fontSize: 12 }}>Reference: {reference}</Text>
      </> : event && !loading && availability !== 'open' ? <>
        <Notice title={availability === 'not-open' ? 'Registration has not opened yet' : availability === 'cancelled' ? 'Event cancelled' : availability === 'finished' ? 'Event finished' : 'Registration closed'}>
          Entries are not available for this event. An access code does not override the registration dates.
        </Notice>
        <ActionButton label="Return to event" onPress={() => router.replace({ pathname: '/events/[id]', params: { id } })} />
      </> : event && !loading && !event.is_manual ? <>
        <View style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: brand.elevated, borderWidth: 1, borderColor: brand.edge }}>
          <Image source={eventImage(event)} style={{ height: 170, width: '100%' }} contentFit="cover" />
          <View style={{ padding: 20, gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Ionicons name="tennisball-outline" size={22} color={brand.accent} /><Text style={{ color: brand.accent, fontSize: 12, letterSpacing: 1 }}>RANKEDIN REGISTRATION</Text></View>
            <Text style={{ color: brand.premium, fontSize: 22, fontWeight: '600' }}>Enter with the organiser</Text>
            <Text style={{ color: brand.muted, lineHeight: 22 }}>{formatEventRange(event.start_date, event.end_date)}{event.venue ? ` · ${event.venue}` : ''}</Text>
            <Text style={{ color: brand.muted, lineHeight: 22 }}>Continue to RankedIn to select your division, arrange your partner and complete the organiser’s entry process.</Text>
            <Text style={{ color: brand.faint, fontSize: 12, lineHeight: 18 }}>You may need to sign in to your RankedIn account. Return here for event information and your 4M schedule.</Text>
            {!!event.rankedin_url && <ActionButton label="Continue to RankedIn ↗" disabled={registrationState(event) !== 'open'} onPress={() => run(async () => {
              const url = new URL(event.rankedin_url!); if (url.protocol !== 'https:') throw new Error('Contact the organiser for a registration link.'); await WebBrowser.openBrowserAsync(url.href);
            })} />}
            {!event.rankedin_url && <Text style={{ color: brand.muted }}>The organiser has not provided a registration link yet.</Text>}
            {registrationState(event) !== 'open' && <Text style={{ color: brand.danger }}>Registration {registrationState(event)}.</Text>}
          </View>
        </View>
      </> : event && !loading && quote && step === 4 ? <>
        <Text style={{ color: brand.premium, fontSize: 24, fontWeight: '600' }}>Review & Pay</Text>
        <Text style={{ color: brand.muted, lineHeight: 22 }}>Review your entries and fees. Registration is confirmed once payment is completed successfully.</Text>
        {payOnly && reference && <ActionButton label="Already paid? Check payment status" secondary busy={busy} onPress={verify} />}
        {quote.isTest && <Text style={{ color: brand.muted, fontSize: 12 }}>Test checkout · Changes still use the shared 4M database.</Text>}
        {!event.is_weekly && <View style={{ padding: 16, borderRadius: 16, backgroundColor: brand.elevated, flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: brand.muted }}>Your current SAPA Points</Text><Text style={{ color: brand.premium, fontWeight: '600' }}>{profile?.points == null ? '—' : Number(profile.points).toLocaleString('en-ZA')}</Text></View>}
        <View style={{ padding: 18, borderRadius: 16, backgroundColor: brand.elevated, gap: 12 }}>
          <Text style={{ color: brand.premium, fontSize: 19, fontWeight: '600' }}>Entries</Text>
          
          {quote.entries?.length ? quote.entries.map(entry => <View key={entry.id} style={{ gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: brand.edge }}>
            <View style={{ flexDirection: 'row' }}><Image source={profile?.image_url ? { uri: profile.image_url } : undefined} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#374151' }} />{entry.partnerName && <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#374151', marginLeft: -6, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: brand.elevated }}><Ionicons name="person-outline" size={20} color={brand.muted} /></View>}</View>
            <Text style={{ color: brand.premium, fontWeight: '600' }}>{entry.division}</Text>
            <Text style={{ color: brand.muted }}>{entry.playerName}{entry.partnerName ? `, ${entry.partnerName}` : ' · Partner not selected yet'}</Text>
            <Text style={{ color: '#fb923c', fontSize: 12 }}>{entry.payForPartner && !entry.payForSelf ? 'You are paying your partner’s entry' : (entry.playerCount || 0) > 1 ? 'You are paying both entries' : 'You are paying your entry'}</Text>
            {entry.amount != null && <Text style={{ color: brand.premium, fontSize: 18 }}>{formatMoney(entry.amount)} <Text style={{ color: brand.muted, fontSize: 12 }}>({entry.playerCount} × {formatMoney(entry.unitFee || 0)})</Text></Text>}

          </View>) : <Text style={{ color: brand.muted }}>Partner: {quote.partnerName || 'I will choose a partner later'}</Text>}
          {!quote.entries?.length && quote.lineItems.map((item, index) => <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ color: brand.muted, flex: 1, lineHeight: 22 }}>{item.label}</Text><Text style={{ color: brand.premium }}>{formatMoney(item.amount)}</Text>
          </View>)}
          {<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: brand.muted }}>Total entry fees</Text><Text style={{ color: brand.premium }}>{formatMoney(quote.base)}</Text></View>}
          {quote.fee > 0 && <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: brand.muted }}>{quote.feeLabel}</Text><Text style={{ color: brand.premium }}>{formatMoney(quote.fee)}</Text></View>}
          {quote.licenseItems?.map(item => <View key={item.label} style={{ flexDirection: 'row', gap: 12 }}><Text style={{ color: brand.muted, flex: 1 }}>{item.label}</Text><Text style={{ color: brand.premium }}>{formatMoney(item.amount)}</Text></View>)}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: brand.edge, paddingTop: 14 }}>
            <Text style={{ color: brand.premium, fontSize: 18, fontWeight: '700' }}>Total payable</Text><Text style={{ color: brand.accent, fontSize: 23, fontWeight: '800' }}>{formatMoney(quote.total)}</Text>
          </View>
        </View>
        {event.collect_tshirt_size && (event.allow_tshirt_logo_upload || event.allow_tshirt_sponsor_name) && <View style={{ backgroundColor: brand.elevated, padding: 18, borderRadius: 16, gap: 18 }}>
          <Text style={{ color: brand.premium, fontWeight: '600', fontSize: 19 }}>T-shirt sponsor details</Text>
          <SponsorDetails eventId={event.id} email={profile?.email || ''} name={profile?.name || 'you'} logo={tshirtLogoUrl} sponsor={tshirtSponsorName} allowLogo={!!event.allow_tshirt_logo_upload} allowName={!!event.allow_tshirt_sponsor_name} disabled={busy} onBusyChange={setLogoUploading} onChange={value => { setSponsorChanged(true); if (value.tshirtLogoUrl !== undefined) setTshirtLogoUrl(value.tshirtLogoUrl); if (value.tshirtSponsorName !== undefined) setTshirtSponsorName(value.tshirtSponsorName); attempt.current = Crypto.randomUUID(); }} />
          {selected.filter(key => !!partners[key]?.partnerEmail && quote.entries?.find(entry => entry.divisionId === key)?.canCustomizePartner !== false).filter((key, index, all) => all.findIndex(k => partners[k]?.partnerEmail === partners[key]?.partnerEmail) === index).map(key => <SponsorDetails key={partners[key].partnerEmail} eventId={event.id} email={partners[key].partnerEmail!} name={partners[key].partnerName || 'partner'} logo={partners[key].tshirtLogoUrl} sponsor={partners[key].tshirtSponsorName} allowLogo={!!event.allow_tshirt_logo_upload} allowName={!!event.allow_tshirt_sponsor_name} disabled={busy} onBusyChange={setLogoUploading} onChange={value => { const email = partners[key].partnerEmail; setPartners(values => Object.fromEntries(Object.entries(values).map(([id, p]) => [id, p.partnerEmail === email ? { ...p, ...value } : p]))); attempt.current = Crypto.randomUUID(); }} />)}
          {event.is_weekly && !!partnerEmail && <SponsorDetails eventId={event.id} email={partnerEmail} name={partnerName || 'partner'} logo={partnerTshirtLogoUrl} sponsor={partnerTshirtSponsorName} allowLogo={!!event.allow_tshirt_logo_upload} allowName={!!event.allow_tshirt_sponsor_name} disabled={busy} onBusyChange={setLogoUploading} onChange={value => { if (value.tshirtLogoUrl !== undefined) setPartnerTshirtLogoUrl(value.tshirtLogoUrl); if (value.tshirtSponsorName !== undefined) setPartnerTshirtSponsorName(value.tshirtSponsorName); attempt.current = Crypto.randomUUID(); }} />}
        </View>}
        <Agreement checked={agreed} onPress={() => setAgreed(v => !v)} label="I agree to the tournament rules, code of conduct, and terms & conditions." />
        <Agreement checked={obligations} onPress={() => setObligations(v => !v)} label="I confirm that registration is only complete once all required licence and payment obligations are met." />
        {needsSapa && <Agreement checked={sapaAgreed} onPress={() => setSapaAgreed(v => !v)} label="This is a SAPA sanctioned event and I agree to SAPA rules and regulations." />}
        {payOnly && !!error && <ActionButton label="Refresh outstanding amount" secondary busy={busy} onPress={() => run(async () => { const result = await invokeCheckout(input); setQuote(result.quote); setAgreed(false); attempt.current = Crypto.randomUUID(); })} />}
        <ActionButton label="Read terms" secondary onPress={() => router.push({ pathname: '/legal', params: { kind: 'terms' } })} />
        <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10 }}>
          <ActionButton label="‹ Back" secondary disabled={busy} onPress={back} />
          <View style={{ flex: 1 }}>
            <ActionButton label={quote.method === 'platform' && quote.total > 0 ? 'Pay & Complete Registration' : 'Confirm registration'} busy={busy} disabled={!agreementsComplete} onPress={checkout} />
          </View>
        </View>
        {['eft', 'external'].includes(quote.method) && <Text style={{ color: brand.muted, lineHeight: 22 }}>Payment is made directly to the organiser after registering and will remain pending until confirmed.</Text>}
      </> : event && !loading && payOnly && step === 4 ? <>
        <Notice title="Existing entry payment">Your divisions and partner details stay unchanged. Payment review will include only outstanding fees.</Notice>
        <ActionButton label="Retry payment review" busy={loading} onPress={load} />
        <ActionButton label="Edit my profile / licence" secondary onPress={() => router.push('/edit-profile')} />
        <ActionButton label="Back to my entry" secondary onPress={() => router.replace({ pathname: "/events/[id]", params: { id: String(event.id) } })} />
      </> : event && !loading ? <>
        {event.registration_access === 'code' && !grant ? <>
          <Field label="Event access code" value={code} onChangeText={setCode} secure />
          <ActionButton label="Unlock registration" busy={busy} onPress={() => run(async () => {
            const latest = await fetchEvent(id);
            setEvent(latest); setNow(new Date());
            if (registrationState(latest) !== 'open') throw new Error('Registration is not open. An access code cannot override the registration dates.');
            const { data, error: unlockError } = await supabase.rpc('unlock_event_registration', { p_event_id: event.id, p_code: code });
            if (unlockError || !data) throw new Error('That access code could not be verified. Please try again.');
            setGrant(String(data)); setCode('');
          })} />
        </> : <>
          {step === 1 && <>
            <View style={{ backgroundColor: brand.elevated, borderRadius: 16, overflow: 'hidden' }}>
              <Image source={eventImage(event)} style={{ width: '100%', height: 140 }} contentFit="cover" />
              <View style={{ padding: 16, gap: 8 }}><Text style={{ color: brand.premium }}>{formatEventRange(event.start_date, event.end_date)}</Text><Text style={{ color: brand.muted }}>{[event.venue, event.city].filter(Boolean).join(' · ')}</Text></View>
            </View>
            <View style={{ padding: 18, gap: 14, backgroundColor: brand.elevated, borderRadius: 16, borderWidth: 1, borderColor: brand.padel }}>
              <Text style={{ color: brand.premium, fontSize: 18, fontWeight: '600' }}>My 4M Profile</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Image source={profile?.image_url ? { uri: profile.image_url } : undefined} style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: brand.edge }} /><View style={{ flex: 1, gap: 5 }}><Text style={{ color: brand.premium }}>{profile?.name || 'Complete your profile'}</Text><Text style={{ color: brand.muted, fontSize: 12 }}>SAPA Points</Text></View><Text style={{ color: brand.accent, fontSize: 21, fontWeight: '600' }}>{profile?.points?.toLocaleString('en-ZA') || '—'}</Text></View>
            </View>
            <Field label="What is your current Playtomic level?" value={playtomic} onChangeText={setPlaytomic} />
            <Notice title="SAPA licence status">{hasLicence ? '✓ Your SAPA licence is active.' : 'You do not have an active SAPA licence. If one is required for this tournament, add a temporary or annual licence when sales are open.'}</Notice>
            {!event.is_weekly && <View style={{ padding: 18, gap: 12, backgroundColor: brand.elevated, borderRadius: 16 }}>
              <Text style={{ color: brand.premium, fontSize: 18, fontWeight: '600' }}>RankedIn Account</Text>
              <Text style={{ color: brand.muted }}>Do you have a RankedIn account?</Text>
              <Choices value={rankedinAccount === null ? '' : rankedinAccount ? 'yes' : 'no'} onChange={value => setRankedinAccount(value === 'yes')} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
              {rankedinAccount === false && <Text style={{ color: brand.muted, lineHeight: 21 }}>If you do not have a RankedIn account, please create one if you want ranking points.</Text>}
              {rankedinAccount && profile?.rankedin_id && <Text style={{ color: brand.accent, fontSize: 12 }}>RankedIn ID linked to your 4M profile: {profile.rankedin_id}</Text>}
            </View>}
            <ActionButton label="Continue to Division" disabled={!profile?.name || !profile?.contact_number || (!event.is_weekly && rankedinAccount === null)} onPress={() => goStep(2)} />
            <ActionButton label="Edit my profile" secondary onPress={() => router.push('/edit-profile')} />
          </>}
          {payOnly && step === 2 && <>
            {!paymentOptions.length && <ActionButton label="Retry payment options" busy={busy} onPress={load} />}
            <Notice title="Choose what to pay">Select your entry, your partner’s entry, or both in each division. Only the selected fees will appear in Review & Pay.</Notice>
            {paymentOptions.map(item => {
              const key = item.divisionId || 'weekly';
              const choice = paymentChoices[key] || { self: false, partner: false };
              return <View key={item.id} style={{ backgroundColor: brand.elevated, borderColor: brand.edge, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
                <Text style={{ color: brand.premium, fontWeight: '700', fontSize: 18 }}>{item.division}</Text>
                {([['self', item.playerName, item.paymentStatus], ['partner', item.partnerName, item.partnerPaymentStatus]] as const).map(([person, name, status]) => name && status !== 'paid' ? <Pressable key={person} accessibilityRole="checkbox" accessibilityState={{ checked: choice[person] }} onPress={() => togglePayment(key, person)} style={{ minHeight: 48, flexDirection: 'row', gap: 12, alignItems: 'center' }}><Ionicons name={choice[person] ? 'checkbox' : 'square-outline'} size={24} color={brand.accent} /><Text style={{ color: brand.premium, flex: 1 }}>{person === 'self' ? 'My entry' : `${name}’s entry`}</Text><Text style={{ color: brand.muted }}>{formatMoney(item.unitFee || 0)}</Text></Pressable> : null)}
                {item.paymentStatus === 'paid' && <Text style={{ color: brand.muted }}>Your entry is paid</Text>}
                {item.partnerName && item.partnerPaymentStatus === 'paid' && <Text style={{ color: brand.muted }}>Your partner’s entry is paid</Text>}
                {divisions.find(d => d.id === item.divisionId)?.license_required && choice.self && !hasLicence && <LicencePicker name="You" value={licenseChoice} onChange={setLicenseChoice} options={licences} />}
                {divisions.find(d => d.id === item.divisionId)?.license_required && choice.partner && !partners[key]?.activeLicence && <LicencePicker name={item.partnerName || 'Your partner'} value={partners[key]?.licenseChoice} onChange={licenseChoice => setPartners(current => ({ ...current, [key]: { ...current[key], licenseChoice } }))} options={licences} />}
              </View>;
            })}
            {needsPartnerPaymentAcknowledgment && <PartnerPaymentRequirement checked={partnerPayAccepted} onPress={() => setPartnerPayAccepted(value => !value)} />}
            <ActionButton label="Continue to Review & Pay" busy={busy} disabled={!paymentOptions.some(item => paymentChoices[item.divisionId || 'weekly']?.self || paymentChoices[item.divisionId || 'weekly']?.partner)} onPress={review} />
            <ActionButton label="Back to my entry" secondary onPress={back} />
          </>}
          {!payOnly && step === 2 && <>
            {event.is_weekly ? <Notice title="This week’s entry">{formatMoney(entryFee(event))} per player for this event date.</Notice> : <DivisionOptions event={event} divisions={mode === 'add-partner' ? divisions.filter(d => selected.includes(d.id)) : divisions} selected={selected} registered={mode === 'pay' || mode === 'add-partner' ? [] : existingDivisionIds} values={partners} profileId={profile?.id} currentUserEmail={profile?.email} licences={licences} busy={busy}
              onToggle={divisionId => { if (mode === 'add-partner') return; setRegistrationEdited(true); setSelected(values => values.includes(divisionId) ? values.filter(v => v !== divisionId) : [...values, divisionId]); }}
              onChange={(divisionId, value) => { if ((partners[divisionId]?.partnerEmail || '') !== (value.partnerEmail || '')) setRegistrationEdited(true); setPartnerPayAccepted(false); setPartners(values => Object.fromEntries(Object.entries({ ...values, [divisionId]: value }).map(([key, p]) => [key, value.partnerEmail && p.partnerEmail === value.partnerEmail && value.licenseChoice ? { ...p, licenseChoice: value.licenseChoice } : p]))); }} />}
            {!event.is_weekly && !hasLicence && divisions.some(d => selected.includes(d.id) && d.license_required) && <LicencePicker name="You" value={licenseChoice} onChange={setLicenseChoice} options={licences} />}
            {event.collect_tshirt_size && <>
              <SizePicker label="Your T-shirt size" value={tshirtSize} onChange={setTshirtSize} />
              {selected.filter(key => !!partners[key]?.partnerEmail).filter((key, index, all) => all.findIndex(k => partners[k]?.partnerEmail === partners[key]?.partnerEmail) === index).map(key => <SizePicker key={key} label={`${partners[key].partnerName} — T-shirt size`} value={partners[key].tshirtSize || ''} onChange={tshirtSize => setPartners(values => Object.fromEntries(Object.entries(values).map(([id, p]) => [id, p.partnerEmail === values[key].partnerEmail ? { ...p, tshirtSize } : p])))} />)}
            </>}
            {needsPartnerPaymentAcknowledgment && !event.is_weekly && <PartnerPaymentRequirement checked={partnerPayAccepted} onPress={() => setPartnerPayAccepted(v => !v)} />}
            <ActionButton label={event.is_weekly ? 'Continue to Entry' : 'Continue to Review & Pay'} busy={busy} disabled={(!event.is_weekly && !selected.length) || (!event.is_weekly && needsPartnerPaymentAcknowledgment && !partnerPayAccepted)} onPress={event.is_weekly ? () => goStep(3) : review} />
            <ActionButton label="‹ Back" secondary disabled={busy} onPress={back} />
          </>}
          {step === 3 && <>
          <Notice title="Your playing partner">Enter your partner’s email to find their profile, or leave it blank to choose a partner later.</Notice>
          <Field label="Partner email (optional)" value={partnerEmail} onChangeText={value => { setPartnerEmail(value); setPartnerName(''); }} email />
          {!!partnerEmail.trim() && <ActionButton label="Find my partner" secondary busy={busy} onPress={() => run(async () => {
            const { data, error: lookupError } = await supabase.rpc('find_registration_partner', { p_email: partnerEmail.trim().toLowerCase() });
            const found = data?.find((p: { email: string }) => p.email?.toLowerCase() === partnerEmail.trim().toLowerCase());
            if (lookupError || !found) throw new Error('No registered player found with that email address.');
            setPartnerName(found.name);
          })} />}
          {!!partnerName && <Text style={{ color: brand.accent, fontWeight: '700' }}>{partnerName}</Text>}
          {!!partnerEmail.trim() && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: brand.premium, fontSize: 15 }}>Pay my partner’s entry too</Text>
            <Switch value={payForPartner ?? quote?.entries?.some(entry => (entry.playerCount || 0) > 1) ?? false} onValueChange={value => { setPartnerPayAccepted(false); setPayForPartner(value); }} accessibilityLabel="Pay for partner" trackColor={{ true: brand.padel }} />
          </View>}
          {needsPartnerPaymentAcknowledgment && <PartnerPaymentRequirement checked={partnerPayAccepted} onPress={() => setPartnerPayAccepted(v => !v)} />}
          {event.collect_tshirt_size && <>
            <SizePicker label="Your T-shirt size" value={tshirtSize} onChange={setTshirtSize} />
            {!!partnerEmail.trim() && <SizePicker label="Partner T-shirt size" value={partnerTshirtSize} onChange={setPartnerTshirtSize} />}
          </>}
          <ActionButton label="Review entry" busy={busy} disabled={(!event.is_weekly && !selected.length) || registrationState(event) !== 'open' || (needsPartnerPaymentAcknowledgment && !partnerPayAccepted)}
            onPress={review} />
          </>}
        </>}
      </> : null}
    </ScrollView>
    <Toast key={errorToast?.id ?? 0} message={errorToast?.message ?? null} fromTop onDismiss={dismissErrorToast} />
  </View>;
}
function Field({ label, value, onChangeText, email, secure }: { label: string; value: string; onChangeText: (v: string) => void; email?: boolean; secure?: boolean }) {
  return <View style={{ gap: 8 }}><Text style={{ color: brand.muted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} accessibilityLabel={label} autoCapitalize="none" autoCorrect={false}
      keyboardType={email ? 'email-address' : 'default'} secureTextEntry={secure}
      style={{ color: brand.premium, backgroundColor: brand.elevated, borderWidth: 1, borderColor: brand.edge, borderRadius: 14, padding: 14, minHeight: 50, fontSize: 16 }} />
  </View>;
}
function Agreement({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={{ flexDirection: 'row', gap: 12, minHeight: 44, alignItems: 'flex-start' }}>
    <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={brand.accent} />
    <Text style={{ flex: 1, color: brand.muted, fontSize: 14, lineHeight: 22 }}>{label}</Text>
  </Pressable>;
}
function PartnerPaymentRequirement({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  return <View style={{ padding: 18, borderRadius: 16, borderWidth: 1, borderColor: '#f4c58c', backgroundColor: '#fff7e9', gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Ionicons name="alert-circle-outline" size={23} color="#b45309" /><Text style={{ color: '#7c2d12', fontSize: 17, fontWeight: '700', flex: 1 }}>Partner payment required</Text></View>
    <Text style={{ color: '#644b36', lineHeight: 22 }}>It is your responsibility to ensure that your partner completes payment before registration closes. Your team entry will only be confirmed once both players have paid in full.</Text>
    <Text style={{ color: '#644b36', lineHeight: 22 }}>If either player has not paid by the registration deadline, neither player will be included in the draw.</Text>
    <View style={{ borderTopWidth: 1, borderColor: '#f4dfc1', paddingTop: 12 }}><Agreement checked={checked} onPress={onPress} label="I understand and accept responsibility for ensuring that my partner pays." /></View>
  </View>;
}
