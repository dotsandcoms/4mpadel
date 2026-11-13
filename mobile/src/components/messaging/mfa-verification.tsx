import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { ChatButton } from './ui';
import { lightBrand as b } from '@/theme/tokens';
export function MfaVerification({ onVerified, onError, purpose = 'messages' }: { purpose?: 'messages' | 'help'; onVerified: () => void; onError: (message: string) => void }) {
  const [factor, setFactor] = useState(''), [secret, setSecret] = useState(''), [code, setCode] = useState('');
  const [verified, setVerified] = useState(false), [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors()]).then(([assurance, factors]) => {
      if (!alive.current) return;
      setVerified(assurance.data?.currentLevel === 'aal2');
      setFactor(factors.data?.totp.find(f => f.status === 'verified')?.id || '');
    }).catch(() => {});
    return () => { alive.current = false; };
  }, []);
  const enrol = async () => {
    setBusy(true); onError('');
    try {
      const { data, error: issue } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `4M messaging ${new Date().toISOString().slice(0, 16)}` });
      if (issue || !data) throw new Error('Could not set up an authenticator. Please try again.');
      if (alive.current) { setFactor(data.id); setSecret(data.totp.secret); }
    } catch (e) { if (alive.current) onError(e instanceof Error ? e.message : 'Verification unavailable.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); onError('');
    try {
      const { error: issue } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor, code: code.trim() });
      if (issue) throw new Error('The code could not be verified. Check your authenticator and try again.');
      if (alive.current) { setVerified(true); setSecret(''); setCode(''); onVerified(); }
    } catch (e) { if (alive.current) onError(e instanceof Error ? e.message : 'Verification unavailable.'); }
    finally { if (alive.current) setBusy(false); }
  };
  return <View style={{ backgroundColor: b.elevated, borderRadius: 16, borderWidth: 1, borderColor: b.edge, padding: 18, gap: 12 }}>
    <Text style={{ color: b.premium, fontSize: 17, fontWeight: '700' }}>Organiser verification</Text>
    <Text style={{ color: b.muted, lineHeight: 22 }}>{verified ? 'Two-factor authentication is active for this session.' : purpose === 'help' ? 'Verify your authenticator to read and reply to your event’s help requests.' : 'Organisers need an authenticator code before publishing or moderating event messages.'}</Text>
    {!verified && (!factor ? <ChatButton quiet onPress={() => void enrol()} disabled={busy}>Set up authenticator</ChatButton> : <>
      {!!secret && <><Text style={{ color: b.muted }}>Add this setup key to your authenticator app. Keep it private.</Text><Text selectable style={{ color: b.premium, fontFamily: 'monospace', lineHeight: 24 }}>{secret}</Text></>}
      <TextInput accessibilityLabel="Authenticator code" value={code} onChangeText={setCode} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} placeholder="6-digit code" placeholderTextColor={b.placeholder} style={{ color: b.premium, minHeight: 48, padding: 12, backgroundColor: b.surface, borderRadius: 12 }} />
      <ChatButton disabled={busy || !/^\d{6}$/.test(code)} onPress={() => void verify()}>{busy ? 'Verifying…' : 'Verify'}</ChatButton>
    </>)}
  </View>;
}
