import { useEffect, useRef, useState } from 'react';
import { Share, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SettingsPage } from '@/components/settings-ui';
import { messaging, MESSAGING_RULES_VERSION } from '@/lib/messaging';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { ChatButton, ChatNotice } from '@/components/messaging/ui';
import { MfaVerification } from '@/components/messaging/mfa-verification';
import { ErrorBanner } from '@/components/error-banner';
import { usePrivateMessagingScreen } from '@/hooks/use-private-messaging-screen';
import { lightBrand as b } from '@/theme/tokens';
export default function MessagingSettings() {
  const inbox = useMessagingInbox(), router = useRouter(), active = usePrivateMessagingScreen();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [email, setEmail] = useState(''), [invite, setInvite] = useState('');
  const [code, setCode] = useState(''), [junior, setJunior] = useState(''), [declaration, setDeclaration] = useState(false);
  const run = async (action: (current: () => boolean) => Promise<unknown>) => {
    if (busy) return; setBusy(true); setError(''); const version = lifecycle.current;
    try { await action(() => lifecycle.current === version); if (lifecycle.current === version) await inbox.refresh(); }
    catch (e) { if (lifecycle.current === version) setError(e instanceof Error ? e.message : 'Could not save messaging settings.'); }
    finally { if (lifecycle.current === version) setBusy(false); }
  };
  const lifecycle = useRef(0);
  const [blocked, setBlocked] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { lifecycle.current++; setEmail(''); setInvite(''); setCode(''); setJunior(''); setDeclaration(false); setBlocked([]); setError(''); setBusy(false); }, [inbox.owner, active]);
  const status = inbox.status;
  return <SettingsPage title="Messaging" banner={<ErrorBanner message={active ? error : null} />}><View style={{ gap: 20 }}>
    {!active ? null : <>
      {!status?.enabled ? <ChatNotice title="Messaging is getting ready">This feature will open after its security checks and deployment are complete.</ChatNotice> : <>
        <View style={{ gap: 12 }}><Text style={heading}>A good place to connect</Text><Text style={copy}>Be respectful. Harassment, threats, sexual exploitation, scams and spam are prohibited. Share only information you have permission to share. Never post another player’s private contact or identity details.</Text><Text style={copy}>A private chat is visible to its participants. Event discussion is visible to eligible players and authorised organisers. Report a message or block a player from the conversation menu.</Text>
          {!status.rulesAccepted && <ChatButton disabled={busy} onPress={() => void run(() => messaging('accept_rules', { version: MESSAGING_RULES_VERSION }))}>Accept messaging rules</ChatButton>}
        </View>
        {status.needsBirthDate && <View style={panel}><Text style={heading}>Confirm your age privately</Text><Text style={copy}>Add your date of birth in your profile so we can apply the right consent process.</Text><ChatButton quiet onPress={() => router.push('/edit-profile')}>Update profile</ChatButton></View>}
        <View style={panel}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><View style={{ flex: 1 }}><Text style={heading}>Message requests</Text><Text style={copy}>Let other players send an introduction.</Text></View><Switch accessibilityLabel="Allow message requests" value={status.allowRequests} disabled={busy} trackColor={{ true: b.accent }} onValueChange={value => void run(() => messaging('preferences', { allowRequests: value }))} /></View></View>
        {status.junior && <View style={panel}><Text style={heading}>Guardian consent</Text><Text style={copy}>{status.interactive ? 'Your guardian has consented to messaging. They can revoke consent from their own account.' : 'A guardian must consent before you can use private chats and event discussion. They need a separate, verified adult account.'}</Text>
          {!status.juniorsEnabled && <Text style={copy}>Junior messaging opens after the safeguarding review. Consent can still be recorded in preparation.</Text>}
          <TextInput accessibilityLabel="Guardian email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Guardian email address" placeholderTextColor={b.placeholder} style={field} />
          <ChatButton quiet disabled={busy || !email.trim()} onPress={() => void run(async current => { const result = await messaging<{ code: string }>('guardian_invite', { email: email.trim() }); if (current()) setInvite(result.code); })}>Create consent invitation</ChatButton>
          {!!invite && <ChatButton onPress={() => void Share.share({ message: `Please review guardian consent for my 4M Padel messaging. Sign in with ${email.trim()} and open Messages → Settings → Review a consent invitation. This private code expires in 48 hours:\n${invite}` }).catch(() => setError('Could not open sharing.'))}>Share invitation with guardian</ChatButton>}
        </View>}
        {!status.junior && <View style={panel}><Text style={heading}>Review a consent invitation</Text><Text style={copy}>Paste the private code shared with you by your junior player. Only the invited guardian’s verified account can use it.</Text>
          <TextInput accessibilityLabel="Guardian consent code" value={code} onChangeText={value => { setCode(value.trim()); setJunior(''); setDeclaration(false); }} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Private invitation code" placeholderTextColor={b.placeholder} style={field} />
          <ChatButton quiet disabled={busy || code.length !== 72} onPress={() => void run(async current => { const result = await messaging<{ name: string }>('guardian_review', { code }); if (current()) setJunior(result.name); })}>Review invitation</ChatButton>
          {!!junior && <><Text style={copy}>I consent to {junior} using private messaging and event discussion. Their messages may be read by the relevant recipients and reported for moderation.</Text><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Switch accessibilityLabel="I am an adult with legal authority to consent" value={declaration} onValueChange={setDeclaration} trackColor={{ true: b.accent }} /><Text style={{ ...copy, flex: 1 }}>I am an adult with legal authority to consent.</Text></View><Text style={copy}>You must have signed in within the last 15 minutes to confirm.</Text><ChatButton disabled={busy || !declaration} onPress={() => void run(async current => { await messaging('guardian_accept', { code, version: MESSAGING_RULES_VERSION, declaration: 'I am an adult with legal authority to consent' }); if (current()) { setCode(''); setJunior(''); setDeclaration(false); } })}>Confirm consent</ChatButton><ChatButton quiet onPress={() => router.push('/(auth)/sign-in')}>Sign in again</ChatButton></>}
        </View>}
        {status.consents.filter(c => c.active).map(consent => <View style={panel} key={consent.id}><Text style={heading}>{consent.name}</Text><Text style={copy}>Messaging consent is active. Revoking it immediately stops this player’s interactive messaging.</Text><ChatButton danger disabled={busy} onPress={() => void run(() => messaging('guardian_revoke', { id: consent.id }))}>Revoke consent</ChatButton></View>)}
        <View style={panel}><Text style={heading}>Blocked players</Text><ChatButton quiet disabled={busy} onPress={() => void run(async current => { const rows = await messaging<{ id: string; name: string }[]>('blocked_players'); if (current()) setBlocked(rows); })}>Review blocked players</ChatButton>{blocked.map(player => <View key={player.id} style={{ gap: 8 }}><Text style={copy}>{player.name}</Text><ChatButton quiet disabled={busy} onPress={() => void run(async current => { await messaging('unblock', { playerId: Number(player.id) }); if (current()) setBlocked(rows => rows.filter(p => p.id !== player.id)); })}>Unblock</ChatButton></View>)}</View>
        <MfaVerification onVerified={() => void inbox.refresh()} onError={setError} />
      </>}
      <View style={{ gap: 10 }}><Text style={heading}>Your privacy</Text><Text style={copy}>Your phone number, email, date of birth and identity details are excluded from chat profiles. Notifications contain no message previews. Messages are encrypted in transit and storage; they are not end-to-end encrypted.</Text><Text style={copy}>DMs expire after 12 months. Event content expires 90 days after the event. Reported evidence is retained separately for moderation. Authorised recipients can still copy or photograph a message.</Text><ChatButton quiet onPress={() => router.push({ pathname: '/legal', params: { kind: 'privacy' } })}>Privacy policy</ChatButton><ChatButton quiet onPress={() => router.push('/help')}>Contact support</ChatButton></View>
    </>}
  </View></SettingsPage>;
}
const heading = { color: b.premium, fontSize: 17, fontWeight: '700' as const };
const copy = { color: b.muted, fontSize: 14, lineHeight: 22 };
const panel = { backgroundColor: b.elevated, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: b.edge, gap: 12 };
const field = { backgroundColor: b.surface, borderRadius: 12, padding: 13, minHeight: 48, color: b.premium, fontSize: 15 };
