import { supportEntryOption, supportEntryTarget } from '@/lib/support-entry';
import { useHelpInbox } from '@/components/help-inbox-provider';
import { paymentStatus } from '@/lib/payment-status';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { FieldColors, profileColors } from '@/components/field-colors';
import { SupportRelatedField } from '@/components/support-related-picker';
import { entrySupportOptions, type SupportRelatedOption } from '@/lib/support-related';
import { SettingsPage, SettingsGroup, SettingsRow } from '@/components/settings-ui';
import { fetchHomeBundle } from '@/lib/home';
import { fetchProfileTransactions } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { HELP_TOPICS, SUPPORT_EMAIL, supportEmailUrl } from '@/lib/support';
import { trackEvent } from '@/lib/analytics';
import { helpApi, helpReferenceData, newHelpKey, type HelpRoute, type HelpRequest } from '@/lib/help-requests';
import { useHelpAccount } from '@/hooks/use-help-account';
import { lightBrand as brand } from '@/theme/tokens';
export default function HelpScreen() {
  const params = useLocalSearchParams<{ topic?: string; eventId?: string; entryId?: string; compose?: string }>();
  const router = useRouter(), owner = useHelpAccount(), help = useHelpInbox();
  const [topic, setTopic] = useState<string>(params.topic || '');
  const directEntry = params.topic === 'entry' && params.compose === '1';
  const entryTarget = supportEntryTarget(params.eventId, params.entryId);
  const [writing, setWriting] = useState(directEntry);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [options, setOptions] = useState<SupportRelatedOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [route, setRoute] = useState<HelpRoute | null>(null), [routeError, setRouteError] = useState(''), [routeLoading, setRouteLoading] = useState(false);
  const [sending, setSending] = useState(false), [sendError, setSendError] = useState('');
  const identity = useRef(0), sendLock = useRef(false), retryKey = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => { identity.current++; setMessage(''); setEmail(''); setName(''); setContext(''); setOptions([]); setRoute(null); setHandoff(false); setSending(false); sendLock.current = false; retryKey.current = null; }, [owner]);
  const selected = HELP_TOPICS.find(item => item.id === topic);
  useEffect(() => {
    if (params.topic === 'deletion') router.replace('/delete-account');
  }, [params.topic, router]);
  useEffect(() => {
    let active = true;
    setContext(''); setOptions([]); setLoadError(''); setLoading(true);
    (async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      if (!active) return;
      setEmail(user?.email || ''); setName(user?.user_metadata?.full_name || user?.user_metadata?.name || '');
      if (!user?.email) return;
      if (topic === 'payment') {
        const transactions = await fetchProfileTransactions(user.email);
        if (active) setOptions(transactions.map(row => {
          const state = paymentStatus(row.status, row.kind, row.refundedTotal);
          return {
            label: row.event_name || row.payment_type?.replace(/_/g, ' ') || (row.kind === 'refund' ? 'Refund' : 'SAPA licence'),
            detail: row.date,
            paymentId: String(row.sourceId || row.id), paymentKind: row.kind, eventId: row.eventId || undefined,
            amount: row.amount,
            status: state,
            note: state.note,
            value: `${row.kind} reference ${row.id}${row.relatedReference ? ` (related ${row.relatedReference})` : ''} · ${row.event_name || 'SAPA licence'} · ${row.amount} · ${row.date} · Status: ${state.label} (recorded: ${row.status})`,
          };
        }));
      } else if (topic === 'entry') {
        if (directEntry) {
          if (!entryTarget) throw new Error('This entry is unavailable.');
          const route = await helpApi<HelpRoute>('route', entryTarget);
          const option = supportEntryOption(route);
          if (active) { setOptions([option]); setContext(option.value); }
        } else {
          const home = await fetchHomeBundle(user.email, { strictSchedule: true });
          if (active) setOptions(entrySupportOptions([...home.upcomingSchedule, ...home.pastSchedule]));
        }
      }
    })().catch(() => { if (active) setLoadError(directEntry ? 'Could not load this entry. Retry before sending your request.' : 'Could not load your account details. You can retry or type the reference in your message.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [topic, attempt, owner, directEntry, entryTarget?.eventId, entryTarget?.entryId]);
  const reference = options.find(option => option.value === context);
  const routeSignature = JSON.stringify(helpReferenceData(topic, reference));
  useEffect(() => {
    let current = true; setRoute(null); setRouteError(''); setRouteLoading(false);
    if (!writing || !owner || !selected || (directEntry && (loading || !!loadError || !reference?.entryId))) return;
    setRouteLoading(true);
    void helpApi<HelpRoute>('route', JSON.parse(routeSignature)).then(value => { if (current) setRoute(value); }).catch(e => { if (current) setRouteError(e.message); }).finally(() => { if (current) setRouteLoading(false); });
    return () => { current = false; };
  }, [writing, owner, routeSignature, attempt, directEntry, loading, loadError]);
  async function sendRequest() {
    if (sendLock.current || !route || !message.trim() || !selected) return;
    const version = identity.current, payload = { ...helpReferenceData(topic, reference), body: message.trim() };
    const signature = JSON.stringify(payload);
    if (retryKey.current?.signature !== signature) retryKey.current = { signature, key: newHelpKey() };
    sendLock.current = true; setSending(true); setSendError('');
    try {
      const request = await helpApi<HelpRequest>('create', { ...payload, clientId: retryKey.current.key });
      if (version !== identity.current) return;
      setMessage(''); setWriting(false); retryKey.current = null;
      void help.refresh();
      router.push(`/messages/help/${encodeURIComponent(request.id)}` as Href);
    } catch (e) { if (version === identity.current) setSendError(e instanceof Error ? e.message : 'Could not send your request. Please try again.'); }
    finally { if (version === identity.current) { sendLock.current = false; setSending(false); } }
  }
  function choose(id: string) {
    if (id === 'deletion') { router.push('/delete-account'); return; }
    setTopic(id); setWriting(false); setHandoff(false);
  }
  async function openEmail() {
    if (opening || !selected || !message.trim()) return;
    setOpening(true);
    try { await Linking.openURL(supportEmailUrl({ topic: selected.title, message, context, name, email, recipient: route?.email || SUPPORT_EMAIL })); void trackEvent('support_opened', { content_type: 'support' }); setHandoff(true); }
    catch { Alert.alert('Could not open your email app', `Please email ${SUPPORT_EMAIL}. Your message is still here, so you can copy it below.`); }
    finally { setOpening(false); }
  }
  return <FieldColors.Provider value={profileColors}><SettingsPage title="Help & enquiries">
    <Stack.Toolbar placement="left"><Stack.Toolbar.Button icon="chevron.left" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>Back</Stack.Toolbar.Button></Stack.Toolbar>
    {!directEntry && <>
    <Text accessibilityRole="header" style={{ fontSize: 27, lineHeight: 33, fontWeight: '600', color: brand.premium }}>How can we help?</Text><Text style={{ color: brand.muted, fontSize: 14, lineHeight: 21, marginTop: 8 }}>Get help from your event organiser or the 4M team.</Text>
    <SettingsGroup title="Your requests"><SettingsRow title={`Help messages${help.unread ? ` (${help.unread})` : ''}`} detail="Requests and replies in Messages" icon="chatbubble-ellipses-outline" onPress={() => router.navigate({ pathname: '/(tabs)/messages', params: { filter: 'Help' } })} /></SettingsGroup>
    </>}
    {!selected ? <SettingsGroup title="Choose a topic">{HELP_TOPICS.filter(item => !['deletion', 'guide'].includes(item.id)).map(item => <SettingsRow key={item.id} title={item.title} icon={item.icon} onPress={() => choose(item.id)} />)}</SettingsGroup> : <>
      {!directEntry && <>
      <Pressable accessibilityRole="button" onPress={() => { setTopic(''); setWriting(false); }} style={{ minHeight: 44, justifyContent: 'center', marginTop: 16 }}><Text style={{ color: brand.supportInk, fontWeight: '600' }}>‹ All help topics</Text></Pressable>
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20 }}><Text accessibilityRole="header" style={{ fontSize: 19, fontWeight: '800', color: brand.premium }}>{selected.title}</Text><Text style={{ color: brand.muted, fontSize: 14, lineHeight: 22, marginTop: 10 }}>{selected.answer}</Text>
        {['entry', 'payment'].includes(topic) && <Pressable accessibilityRole="button" onPress={() => router.push(topic === 'payment' ? '/payments' : '/my-entries')} style={{ minHeight: 44, justifyContent: 'center', marginTop: 8 }}><Text style={{ color: brand.supportInk, fontWeight: '700' }}>{topic === 'payment' ? 'View my payments' : 'View my entries'}</Text></Pressable>}
      </View>
      </>}
      {!writing ? <Pressable accessibilityRole="button" onPress={() => setWriting(true)} style={{ minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 20, backgroundColor: brand.supportInk, borderRadius: 14 }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Still need help?</Text></Pressable> : <View style={{ marginTop: directEntry ? 8 : 24 }}>
        <Text accessibilityRole="header" style={{ fontSize: 19, fontWeight: '800', color: brand.premium, marginBottom: 12 }}>Your enquiry</Text>
        {loading && <ActivityIndicator color={brand.supportInk} />}
        {loadError && <View><Text style={{ color: brand.danger, fontSize: 13 }}>{loadError}</Text><Pressable accessibilityRole="button" onPress={() => setAttempt(v => v + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: brand.supportInk }}>Retry loading details</Text></Pressable></View>}
        {options.length > 0 && (directEntry ? <View style={{ padding: 16, marginBottom: 16, borderRadius: 12, backgroundColor: brand.supportTint, gap: 8 }}><Text style={{ color: brand.supportInk, fontSize: 12, fontWeight: '600' }}>Your entry</Text><Text style={{ color: brand.premium, fontSize: 17, fontWeight: '600' }}>{reference?.label}</Text><Text style={{ color: brand.label, fontSize: 13, lineHeight: 20 }}>{reference?.detail}</Text><Text style={{ color: brand.muted, fontSize: 12 }}>Account: {email}</Text></View> : <SupportRelatedField kind={topic === 'payment' ? 'payment' : 'entry'} value={context} options={options} onChange={setContext} />)}
        {topic === 'payment' && options.find(option => option.value === context)?.status && (() => {
          const option = options.find(item => item.value === context)!;
          return <View style={{ padding: 14, borderRadius: 14, backgroundColor: option.status!.background, marginBottom: 16 }}><Text style={{ color: option.status!.color, fontWeight: '700', fontSize: 13 }}>{option.status!.label}</Text><Text style={{ color: brand.premium, fontSize: 12, lineHeight: 19, marginTop: 6 }}>{option.note}</Text></View>;
        })()}
        {!loading && !loadError && ['entry', 'payment'].includes(topic) && options.length === 0 && <Text style={{ color: brand.muted, fontSize: 13, marginBottom: 12 }}>No saved {topic === 'payment' ? 'payments' : 'entries'} found. You can include the details in your message.</Text>}
        <Text style={{ color: brand.label, fontWeight: '600', marginBottom: 8 }}>What can we help with?</Text><TextInput accessibilityLabel="Enquiry message" value={message} onChangeText={setMessage} multiline maxLength={3000} textAlignVertical="top" placeholder="Tell us what happened or what you need help with…" placeholderTextColor={brand.placeholder} selectionColor={brand.supportInk} style={{ minHeight: 150, borderWidth: 1, borderColor: brand.edge, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, fontSize: 15, lineHeight: 22, color: brand.premium }} />
        <View style={{ marginTop: 16, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 12, gap: 8 }}>
          <Text style={{ color: brand.muted, fontSize: 12 }}>This request goes to</Text>
          {routeLoading ? <ActivityIndicator color={brand.supportInk} /> : <Text style={{ color: brand.premium, fontSize: 16, fontWeight: '500' }}>{route?.recipient || '4M support'}</Text>}
          {!!route?.eventName && <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 20 }}>{route.eventName}</Text>}
          <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 20 }}>Your message and selected reference are shared with this team. Replies appear in Messages under Help.</Text>
          {routeError && <Text style={{ color: brand.danger, fontSize: 13 }}>{routeError}</Text>}
        </View>
        {!!sendError && <Text accessibilityRole="alert" style={{ color: brand.danger, marginTop: 12, fontSize: 13 }}>{sendError}</Text>}
        <Pressable accessibilityRole="button" disabled={sending || !route || !message.trim()} onPress={() => void sendRequest()} style={{ minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.supportInk, borderRadius: 14, marginTop: 16, opacity: sending || !route || !message.trim() ? 0.45 : 1 }}><Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>{sending ? 'Sending…' : route?.team === 'organiser' ? 'Send to organiser' : 'Send to 4M support'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={opening || sending || !message.trim()} onPress={() => void openEmail()} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8, opacity: opening || sending || !message.trim() ? .45 : 1 }}><Text style={{ color: brand.supportInk, fontSize: 14, fontWeight: '500' }}>{opening ? 'Opening email…' : route?.team === 'organiser' && !route.emailFallback ? 'Email the organiser instead' : 'Email 4M support instead'}</Text></Pressable>
        {route?.emailFallback && <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 20 }}>The organiser has no email contact listed. The email option goes to 4M support.</Text>}
        {handoff && <Text accessibilityLiveRegion="polite" style={{ color: brand.muted, marginTop: 12, lineHeight: 20 }}>Review and send in your email app. Your message stays here if you cancel.</Text>}
      </View>}
    </>}
  </SettingsPage></FieldColors.Provider>;
}
