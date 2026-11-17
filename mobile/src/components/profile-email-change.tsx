import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LiquidField } from './liquid-field';
import { SelectField } from './select-field';
import { requestProfileEmailChange, validProfileEmail } from '@/lib/profile-email';
import { supabase } from '@/lib/supabase';
import { lightBrand as b } from '@/theme/tokens';

type Factor = { id: string; friendly_name?: string };
export function ProfileEmailChange({ email, userId, pendingEmail = '', disabled = false, onBusyChange, onVerified }: {
  email: string; userId: string; pendingEmail?: string; disabled?: boolean;
  onBusyChange: (value: boolean) => void; onVerified: () => Promise<void>;
}) {
  const [value, setValue] = useState(email), [pending, setPending] = useState(pendingEmail);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [factors, setFactors] = useState<Factor[]>([]), [factor, setFactor] = useState(''), [code, setCode] = useState('');
  const alive = useRef(true), lock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setValue(email); setPending(pendingEmail); }, [email, pendingEmail]);
  const changed = value.trim().toLowerCase() !== email.trim().toLowerCase();
  async function request() {
    if (disabled || lock.current || !changed) return;
    if (!validProfileEmail(value)) { setError('Enter a valid email address.'); return; }
    lock.current = true; setBusy(true); onBusyChange(true); setError(''); setNotice('');
    try {
      const [assurance, enrolled] = await Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors()]);
      if (assurance.error || enrolled.error) throw new Error('Your account security could not be checked. Please try again.');
      const connected = enrolled.data.totp.filter(item => item.status === 'verified');
      if (connected.length && assurance.data.currentLevel !== 'aal2') {
        if (!factors.length) { setFactors(connected); setFactor(connected[0].id); return; }
        if (!/^\d{6}$/.test(code)) throw new Error('Enter the 6-digit code for your connected authenticator.');
        const result = await supabase.auth.mfa.challengeAndVerify({ factorId: factor, code });
        if (result.error) throw new Error('The authenticator code could not be verified. Try its latest code.');
      }
      if (!alive.current) return;
      const target = await requestProfileEmailChange(value, userId);
      if (!alive.current) return;
      setPending(target); setCode(''); setFactors([]);
      setNotice('Check your email to confirm the change. Follow all confirmation links sent to your current and new addresses. Your sign-in email stays unchanged until verification finishes.');
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'The email change could not be requested. Try again.'); }
    finally { lock.current = false; if (alive.current) { setBusy(false); onBusyChange(false); } }
  }
  async function check() {
    if (disabled || lock.current) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      const result = await supabase.auth.getUser();
      if (result.error || result.data.user?.id !== userId) throw new Error('Sign in again to check your email change.');
      if (result.data.user.email?.toLowerCase() !== pending.toLowerCase()) throw new Error('Confirmation is still pending. Follow the links in your email, then check again.');
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) throw new Error('Your email was changed. Sign in again with your new address.');
      if (!alive.current) return;
      setPending(''); setNotice('Your sign-in email has been updated.'); await onVerified();
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Could not check the email change. Try again.'); }
    finally { lock.current = false; if (alive.current) { setBusy(false); onBusyChange(false); } }
  }
  return <View style={{ gap: 10, marginBottom: 20 }}>
    <LiquidField label="Sign-in email address" icon="envelope.fill" value={value} onChangeText={text => { setValue(text); setError(''); }} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!busy && !disabled} maxLength={254}
      hint="Changing this address also changes how you sign in. Your entries, messages and permissions stay with your account." />
    {!!factors.length && <View style={{ gap: 8 }}>
      <SelectField label="Authenticator" value={factor} options={factors.map(item => ({ value: item.id, label: item.friendly_name || 'Connected authenticator' }))} onChange={setFactor} />
      <LiquidField label="6-digit authenticator code" value={code} onChangeText={text => setCode(text.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} editable={!busy && !disabled} />
    </View>}
    {changed && <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => void request()} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: b.elevated, opacity: busy || disabled ? .5 : 1 }}><Text style={{ color: b.accent, fontWeight: '600' }}>{busy ? 'Checking…' : factors.length ? 'Verify & request email change' : 'Verify new email address'}</Text></Pressable>}
    {!!pending && <View style={{ gap: 8 }}><Text style={{ color: b.muted, fontSize: 12, lineHeight: 18 }}>Pending confirmation: {pending}</Text><Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => void check()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '600' }}>I’ve verified my email — check again</Text></Pressable></View>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: b.accent, fontSize: 12, lineHeight: 19 }}>{notice}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A52F25', fontSize: 13, lineHeight: 19 }}>{error}</Text>}
  </View>;
}
