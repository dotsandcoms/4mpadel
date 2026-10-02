import { paymentStatus } from '@/lib/payment-status';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { FieldColors, profileColors } from '@/components/field-colors';
import { SelectField, type SelectOption } from '@/components/select-field';
import { SettingsPage, SettingsGroup, SettingsRow, SETTINGS_BLUE } from '@/components/settings-ui';
import { fetchHomeBundle } from '@/lib/home';
import { fetchProfileTransactions } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { HELP_TOPICS, SUPPORT_EMAIL, supportEmailUrl } from '@/lib/support';
import { lightBrand as brand } from '@/theme/tokens';
export default function HelpScreen() {
  const params = useLocalSearchParams<{ topic?: string }>();
  const router = useRouter();
  const [topic, setTopic] = useState<string>(params.topic || '');
  const [writing, setWriting] = useState(params.topic === 'deletion');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [opening, setOpening] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const selected = HELP_TOPICS.find(item => item.id === topic);
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
            amount: row.amount,
            status: state,
            note: state.note,
            value: `${row.kind} reference ${row.id}${row.relatedReference ? ` (related ${row.relatedReference})` : ''} · ${row.event_name || 'SAPA licence'} · ${row.amount} · ${row.date} · Status: ${state.label} (recorded: ${row.status})`,
          };
        }));
      } else if (topic === 'entry') {
        const home = await fetchHomeBundle(user.email, { strictSchedule: true });
        const events = [...home.upcomingSchedule, ...home.pastSchedule].filter(event => event.isRegistered);
        if (active) setOptions([...new Map(events.map(event => [event.id, { label: event.event_name || 'Tournament', value: `${event.event_name || 'Tournament'} (event #${event.id})` }])).values()]);
      }
    })().catch(() => { if (active) setLoadError('Could not load your account details. You can retry or type the reference in your message.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [topic, attempt]);
  function choose(id: string) { setTopic(id); setWriting(id === 'deletion'); setHandoff(false); }
  async function openEmail() {
    if (opening || !selected || !message.trim()) return;
    setOpening(true);
    try { await Linking.openURL(supportEmailUrl({ topic: selected.title, message, context, name, email })); setHandoff(true); }
    catch { Alert.alert('Could not open your email app', `Please email ${SUPPORT_EMAIL}. Your message is still here, so you can copy it below.`); }
    finally { setOpening(false); }
  }
  return <FieldColors.Provider value={profileColors}><SettingsPage title="Help & enquiries">
    <Text accessibilityRole="header" style={{ fontSize: 27, lineHeight: 33, fontWeight: '800', color: brand.premium }}>How can we help?</Text><Text style={{ color: brand.muted, fontSize: 14, lineHeight: 21, marginTop: 8 }}>Find a quick answer or send the 4M team an enquiry.</Text>
    {!selected ? <SettingsGroup title="Choose a topic">{HELP_TOPICS.filter(item => !['deletion', 'guide'].includes(item.id)).map(item => <SettingsRow key={item.id} title={item.title} icon={item.icon} onPress={() => choose(item.id)} />)}</SettingsGroup> : <>
      <Pressable accessibilityRole="button" onPress={() => { setTopic(''); setWriting(false); }} style={{ minHeight: 44, justifyContent: 'center', marginTop: 16 }}><Text style={{ color: SETTINGS_BLUE, fontWeight: '600' }}>‹ All help topics</Text></Pressable>
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20 }}><Text accessibilityRole="header" style={{ fontSize: 19, fontWeight: '800', color: brand.premium }}>{selected.title}</Text><Text style={{ color: brand.muted, fontSize: 14, lineHeight: 22, marginTop: 10 }}>{selected.answer}</Text>
        {['entry', 'payment'].includes(topic) && <Pressable accessibilityRole="button" onPress={() => router.push(topic === 'payment' ? '/payments' : '/my-entries')} style={{ minHeight: 44, justifyContent: 'center', marginTop: 8 }}><Text style={{ color: SETTINGS_BLUE, fontWeight: '700' }}>{topic === 'payment' ? 'View my payments' : 'View my entries'}</Text></Pressable>}
      </View>
      {!writing ? <Pressable accessibilityRole="button" onPress={() => setWriting(true)} style={{ minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 20, backgroundColor: SETTINGS_BLUE, borderRadius: 14 }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Still need help?</Text></Pressable> : <View style={{ marginTop: 24 }}>
        <Text accessibilityRole="header" style={{ fontSize: 19, fontWeight: '800', color: brand.premium, marginBottom: 12 }}>Your enquiry</Text>
        {loading && <ActivityIndicator color={SETTINGS_BLUE} />}
        {loadError && <View><Text style={{ color: brand.danger, fontSize: 13 }}>{loadError}</Text><Pressable accessibilityRole="button" onPress={() => setAttempt(v => v + 1)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: SETTINGS_BLUE }}>Retry loading details</Text></Pressable></View>}
        {options.length > 0 && <SelectField label={topic === 'payment' ? 'Related payment (optional)' : 'Related entry (optional)'} value={context} options={[{ label: 'No related item', value: '' }, ...options]} onChange={setContext} searchable placeholder="Select a related item" />}
        {topic === 'payment' && options.find(option => option.value === context)?.status && (() => {
          const option = options.find(item => item.value === context)!;
          return <View style={{ padding: 14, borderRadius: 14, backgroundColor: option.status!.background, marginBottom: 16 }}><Text style={{ color: option.status!.color, fontWeight: '700', fontSize: 13 }}>{option.status!.label}</Text><Text style={{ color: brand.premium, fontSize: 12, lineHeight: 19, marginTop: 6 }}>{option.note}</Text></View>;
        })()}
        {!loading && !loadError && ['entry', 'payment'].includes(topic) && options.length === 0 && <Text style={{ color: brand.muted, fontSize: 13, marginBottom: 12 }}>No saved {topic === 'payment' ? 'payments' : 'entries'} found. You can include the details in your message.</Text>}
        <Text style={{ color: brand.label, fontWeight: '600', marginBottom: 8 }}>What can we help with?</Text><TextInput accessibilityLabel="Enquiry message" value={message} onChangeText={setMessage} multiline maxLength={3000} textAlignVertical="top" placeholder="Tell us what happened or what you need help with…" placeholderTextColor={brand.placeholder} selectionColor="#2449D8" style={{ minHeight: 150, borderWidth: 1, borderColor: brand.edge, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, fontSize: 15, lineHeight: 22, color: brand.premium }} />
        <Text selectable style={{ color: brand.muted, fontSize: 12, lineHeight: 19, marginTop: 12 }}>To: {SUPPORT_EMAIL}{email ? `\nAccount email included: ${email}` : ''}{context ? `\nReference included: ${context}` : ''}</Text><Text style={{ color: brand.muted, fontSize: 12, lineHeight: 19, marginTop: 8 }}>Review and send in your email app. Nothing is sent until you press Send there.</Text>
        <Pressable accessibilityRole="button" disabled={opening || !message.trim()} onPress={() => void openEmail()} style={{ minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: SETTINGS_BLUE, borderRadius: 14, marginTop: 18, opacity: opening || !message.trim() ? 0.45 : 1 }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{opening ? 'Opening email…' : 'Review enquiry in email'}</Text></Pressable>
        {handoff && <Text accessibilityLiveRegion="polite" style={{ color: brand.muted, marginTop: 12, lineHeight: 21 }}>Your email app was opened. If you cancelled, your message is still here.</Text>}
      </View>}
    </>}
  </SettingsPage></FieldColors.Provider>;
}
