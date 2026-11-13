import { usePrivateMessagingScreen } from '@/hooks/use-private-messaging-screen';
import { useHelpInbox } from '@/components/help-inbox-provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { SettingsPage } from '@/components/settings-ui';
import { HomeAction } from '@/components/home-action';
import { ErrorBanner } from '@/components/error-banner';
import { useHelpAccount } from '@/hooks/use-help-account';
import { helpApi, helpStatusLabel, newHelpKey, type HelpRequest, type HelpThread } from '@/lib/help-requests';
import { HELP_TOPICS, supportEmailUrl } from '@/lib/support';
import { startForegroundTask } from '@/lib/foreground-task';
import { lightBrand as b, loadingBlue } from '@/theme/tokens';

export default function HelpRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), owner = useHelpAccount(), help = useHelpInbox();
  const refreshInbox = useRef(help.refresh); refreshInbox.current = help.refresh;
  const focused = useRef(false), active = usePrivateMessagingScreen();
  const [thread, setThread] = useState<HelpThread | null>(null), [body, setBody] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), fetching = useRef(false), sending = useRef(false), retry = useRef<{ body: string; key: string } | null>(null);
  const load = useCallback(async () => {
    if (fetching.current || !owner || !active) return;
    fetching.current = true; const version = generation.current;
    try { const page = await helpApi<HelpThread>('read', { id }); if (version === generation.current) { setThread(previous => previous?.request.id === page.request.id ? { ...page, messages: [...new Map([...previous.messages, ...page.messages].map(message => [message.id, message])).values()], nextMessages: previous.nextMessages } : page); setError(''); const latest = page.messages.at(-1); if (latest) { await helpApi('mark_read', { id, messageId: latest.id }); if (version === generation.current) void refreshInbox.current(); } } }
    catch (e) { if (version === generation.current) { setThread(null); setError(e instanceof Error ? e.message : 'Could not load this request.'); } }
    finally { if (version === generation.current) { fetching.current = false; setLoading(false); } }
  }, [id, owner, active]);
  useFocusEffect(useCallback(() => {
    focused.current = true; generation.current++; fetching.current = false; sending.current = false; retry.current = null; setThread(null); setBody(''); setBusy(false); setError(''); setLoading(true);
    if (!owner || !active) { focused.current = false; setLoading(false); return; }
    const stop = startForegroundTask(load, 30000);
    return () => { focused.current = false; stop(); generation.current++; setThread(null); setBody(''); };
  }, [load, owner, active]));
  useEffect(() => { if (focused.current) void load(); }, [help.revision, load]);
  const act = async (action: string, data: Record<string, unknown>) => {
    if (sending.current) return;
    if (thread?.request.status === 'resolved' && ['reply', 'escalate'].includes(action)) { setError('This request is resolved. Reopen it before sending a message.'); return; } sending.current = true; setBusy(true); setError(''); const version = generation.current;
    try { await helpApi<HelpRequest>(action, { id, ...data }); if (version === generation.current) { if (action === 'reply') { setBody(''); retry.current = null; } await load(); } }
    catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : 'Could not save this change.'); }
    finally { if (version === generation.current) { sending.current = false; setBusy(false); } }
  };
  const request = thread?.request;
  const email = async () => {
    if (!request) return;
    try { await Linking.openURL(supportEmailUrl({ recipient: request.email, topic: `${HELP_TOPICS.find(topic => topic.id === request.topic)?.title || 'Help'} · ${request.reference}`, context: [request.reference, request.context].filter(Boolean).join(' · '), message: body.trim() || thread.messages.find(message => message.role === 'player')?.body || request.preview })); }
    catch { setError('Your email app could not open. Your request and messages are saved here.'); }
  };
  const earlier = async () => {
    if (!thread?.nextMessages || busy) return; setBusy(true); const version = generation.current;
    try { const page = await helpApi<HelpThread>('read', { id, ...thread.nextMessages }); if (version === generation.current) setThread(previous => previous ? { ...previous, messages: [...new Map([...page.messages, ...previous.messages].map(message => [message.id, message])).values()], nextMessages: page.nextMessages } : previous); }
    catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : 'Could not load earlier messages.'); }
    finally { if (version === generation.current) setBusy(false); }
  };
  if (!active) return <SettingsPage title="Help conversation">{null}</SettingsPage>;
  return <SettingsPage title="Help conversation" banner={<ErrorBanner message={error} />}>
    {loading && <ActivityIndicator color={loadingBlue} />}
    {!request && !loading && <HomeAction label="Try again" onPress={() => void load()} />}
    {request && <>
      <Text style={{ color: b.supportInk, fontSize: 13, fontWeight: '500' }}>{request.reference} · {helpStatusLabel(request.status)}</Text>
      <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 23, lineHeight: 28, fontWeight: '500', marginTop: 12 }}>{request.eventName || HELP_TOPICS.find(topic => topic.id === request.topic)?.title || 'Your request'}</Text>
      <Text style={{ color: b.muted, fontSize: 14, lineHeight: 20, marginTop: 8 }}>{request.isOwner ? `With ${request.recipient}` : `From ${request.requester.name || request.requester.email || 'Player'} · ${request.recipient}`}</Text>
      {!!request.context && <Text selectable style={{ color: b.muted, fontSize: 12, lineHeight: 20, marginTop: 8 }}>{request.context}</Text>}
      <View style={{ marginTop: 24, gap: 12 }}>
        {!!thread.nextMessages && <HomeAction label="Earlier messages" disabled={busy} onPress={() => void earlier()} />}
        {thread.messages.map(message => <View key={message.id} style={{ backgroundColor: message.mine ? b.supportTint : b.elevated, borderRadius: 12, padding: 16, gap: 8, alignSelf: message.mine ? 'flex-end' : 'flex-start', maxWidth: '94%', minWidth: '60%' }}><Text style={{ color: b.muted, fontSize: 12 }}>{message.mine ? 'You' : message.senderName || (message.role === 'player' ? request.requester.name || 'Player' : message.role === '4m' ? '4M support' : 'Event organiser')} · {new Date(message.createdAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text><Text selectable style={{ color: b.premium, fontSize: 15, lineHeight: 22 }}>{message.body}</Text></View>)}
      </View>
      {request.status === 'resolved' ? <Text style={{ marginTop: 24, color: b.muted, fontSize: 14, lineHeight: 21 }}>This request is resolved. Reopen it to send another message.</Text> : <>
        <Text style={{ color: b.label, fontSize: 14, fontWeight: '500', marginTop: 24, marginBottom: 8 }}>Reply to {request.isOwner ? request.recipient : request.requester.name || 'player'}</Text>
        <TextInput accessibilityLabel="Reply to help request" value={body} onChangeText={setBody} maxLength={4000} multiline placeholder="Add a reply" placeholderTextColor={b.placeholder} style={{ minHeight: 80, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, borderRadius: 12, padding: 16, color: b.premium, fontSize: 15, lineHeight: 22, textAlignVertical: 'top' }} />
      </>}
      <View style={{ marginTop: 16, gap: 10 }}>
        {request.status !== 'resolved' && <HelpAction label={busy ? 'Saving…' : 'Send reply'} primary disabled={busy || !body.trim()} onPress={() => { if (retry.current?.body !== body.trim()) retry.current = { body: body.trim(), key: newHelpKey() }; void act('reply', { body: retry.current.body, clientId: retry.current.key }); }} />}
        <HelpAction label={request.status === 'resolved' ? 'Reopen request' : 'Mark resolved'} primary={request.status === 'resolved'} disabled={busy} onPress={() => void act('status', { status: request.status === 'resolved' ? 'open' : 'resolved' })} />
        {request.status !== 'resolved' && <HelpAction label={request.team === 'organiser' && !request.emailFallback ? 'Email organiser' : 'Email 4M support'} disabled={busy} onPress={() => void email()} />}
        {request.status !== 'resolved' && request.canManage && request.team === 'organiser' && <HelpAction label="Send to 4M support" disabled={busy} onPress={() => void act('escalate', {})} />}
      </View>
      {request.status !== 'resolved' && request.emailFallback && <Text style={{ color: b.muted, fontSize: 12, lineHeight: 20 }}>No organiser email is listed, so the email fallback goes to 4M support.</Text>}
    </>}
  </SettingsPage>;
}

function HelpAction({ label, onPress, disabled = false, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ width: '100%', minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: primary ? b.supportInk : b.edge, backgroundColor: primary ? b.supportInk : b.elevated, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.45 : 1 }}><Text style={{ color: primary ? '#FFFFFF' : b.supportInk, fontSize: 15, lineHeight: 22, fontWeight: '600', textAlign: 'center' }}>{label}</Text></Pressable>;
}
