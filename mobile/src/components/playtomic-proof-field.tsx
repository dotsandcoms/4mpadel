import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { choosePlaytomicProof } from '@/lib/playtomic-proof';
import { extractPlaytomicProfile, PROOF_BUCKET, type PlaytomicExtraction } from '@/lib/profile-details';
import { supabase } from '@/lib/supabase';
import { lightBrand as brand } from '@/theme/tokens';

export function PlaytomicProofField({ playerId, signupUserId, path, level, disabled, onChange, onBusyChange, onLevelDetected, extraction, onExtractionDetected, noProfile, onNoProfileChange }: {
  extraction: PlaytomicExtraction | null; onExtractionDetected: (value: PlaytomicExtraction | null) => void; noProfile: boolean; onNoProfileChange: (value: boolean) => void;
  playerId?: number; signupUserId?: string; path: string; level: string; disabled: boolean; onChange: (path: string) => void; onBusyChange: (busy: boolean) => void; onLevelDetected: (level: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [success, setSuccess] = useState<PlaytomicExtraction | null>(null);
  const [progressDismissed, setProgressDismissed] = useState(false);
  const [readRequest, setReadRequest] = useState<{ path: string; initialLevel: string } | null>(null);
  const [readFailed, setReadFailed] = useState(false);
  const [readMessage, setReadMessage] = useState('');
  const pathRef = useRef(path);
  pathRef.current = path;
  const levelRef = useRef(level);
  levelRef.current = level;
  const callbacks = useRef({ onBusyChange, onLevelDetected, onExtractionDetected });
  callbacks.current = { onBusyChange, onLevelDetected, onExtractionDetected };
  useEffect(() => {
    let active = true;
    setSuccess(null);
    setReadMessage('');
    setReadFailed(false);
    setError('');
    setUrl('');
    if (path) void supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, 300).then(({ data, error: issue }) => {
      if (!active) return;
      if (issue) setError('Your saved screenshot could not be opened.');
      else setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [path]);

  useEffect(() => { callbacks.current.onBusyChange(busy || reading); }, [busy, reading]);
  useEffect(() => () => { callbacks.current.onBusyChange(false); }, []);
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 2000);
    return () => clearTimeout(timer);
  }, [success]);
  useEffect(() => {
    if (!readRequest || readRequest.path !== path) { setReading(false); return; }
    let active = true;
    setReading(true); setReadFailed(false); setReadMessage('');
    void extractPlaytomicProfile(path).then(result => {
      if (!active || pathRef.current !== readRequest.path) return;
      if (result === null) {
        setReadFailed(true);
        setReadMessage('No clear Playtomic details were found. Enter your level manually or retry.');
        return;
      }
      callbacks.current.onExtractionDetected(result);
      setSuccess(result);
      setReadFailed(result.level === null);
      if (result.level === null) {
        setReadMessage('No clear padel level was found. Enter your level manually.');
      } else if (levelRef.current === readRequest.initialLevel) {
        callbacks.current.onLevelDetected(String(result.level));
        setReadMessage(`Playtomic level filled from screenshot: ${result.level.toFixed(2)}. Check it before saving.`);
      } else {
        setReadMessage(`Screenshot level: ${result.level.toFixed(2)}. Your edited level was kept.`);
      }
    }).catch(issue => {
      if (!active || pathRef.current !== readRequest.path) return;
      setReadFailed(true);
      setReadMessage(issue instanceof Error ? issue.message : 'Enter your level manually or try again.');
    }).finally(() => { if (active) setReading(false); });
    return () => { active = false; };
  }, [readRequest, path]);

  async function choose() {
    if (busyRef.current || disabled) return;
    const initialLevel = levelRef.current;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await choosePlaytomicProof(playerId, signupUserId);
      if (next) {
        setSuccess(null);
        onExtractionDetected(null);
        setProgressDismissed(false);
        setReading(true);
        onChange(next);
        setReadRequest({ path: next, initialLevel });
      }
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Unable to upload the screenshot. Try again.'); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <View style={{ gap: 10 }}>
    <Modal visible={(reading || !!success) && !progressDismissed} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setProgressDismissed(true)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 380, borderRadius: 20, borderWidth: 1, borderColor: brand.edge, backgroundColor: brand.elevated, padding: 24, alignItems: 'center', gap: 16 }}>
          {success ? <Text accessibilityLabel="Extraction complete" style={{ color: '#15803d', fontSize: 44, lineHeight: 52 }}>✓</Text> : <ActivityIndicator size="large" color={brand.accent} accessibilityLabel="Extracting Playtomic level" />}
          <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 21, lineHeight: 28, fontWeight: '800', textAlign: 'center' }}>{success ? 'Playtomic details extracted' : 'We’re extracting your Playtomic level'}</Text>
          <Text accessibilityLiveRegion="polite" style={{ color: brand.muted, fontSize: 14, lineHeight: 22, textAlign: 'center' }}>{success ? 'Check the suggested details before saving.' : '4M is processing the screenshot. Check the suggested level before saving.'}</Text>
          {success ? <ExtractionSummary result={success} /> : null}
          <Pressable accessibilityRole="button" onPress={() => setProgressDismissed(true)} style={{ minHeight: 48, paddingHorizontal: 20, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: brand.edge }}><Text style={{ color: brand.accent, fontWeight: '700' }}>{success ? 'Done' : 'Keep editing'}</Text></Pressable>
        </View>
      </View>
    </Modal>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: noProfile, disabled: disabled || busy }} disabled={disabled || busy} onPress={() => { setReadRequest(null); setSuccess(null); onExtractionDetected(null); onNoProfileChange(!noProfile); }} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text accessibilityElementsHidden style={{ color: brand.accent, fontSize: 24 }}>{noProfile ? '☑' : '☐'}</Text>
      <Text style={{ color: brand.premium, fontSize: 14, flex: 1 }}>I don’t have a Playtomic profile or level</Text>
    </Pressable>
    {noProfile ? <Text accessibilityLiveRegion="polite" style={{ color: brand.muted, fontSize: 13 }}>You can continue without a Playtomic level or screenshot.</Text> : <>
    <Text style={{ color: brand.premium, fontSize: 13, fontWeight: '700', lineHeight: 19 }}>Upload a screenshot of your Playtomic profile (required)</Text>
    <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 19 }}>Only you and authorized admins can see your screenshot.</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy || disabled }} disabled={busy || disabled} onPress={() => void choose()} style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: brand.edge, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      {busy ? <ActivityIndicator color={brand.accent} /> : <Text style={{ color: brand.accent, fontWeight: '700' }}>{path ? 'Replace screenshot' : 'Choose screenshot'}</Text>}
    </Pressable>
    {url ? <Pressable accessibilityRole="link" accessibilityLabel="View Playtomic screenshot" onPress={() => void Linking.openURL(url).catch(() => setError('Unable to open the screenshot. Try again.'))}>
      <Image source={{ uri: url }} style={{ width: '100%', height: 180, borderRadius: 12 }} contentFit="contain" cachePolicy="none" accessibilityLabel="Your Playtomic level proof" />
      <Text style={{ color: brand.accent, paddingVertical: 12 }}>View screenshot</Text>
    </Pressable> : null}
    {path ? <View style={{ gap: 10 }}>
      <View accessibilityLiveRegion="polite">
        {reading && progressDismissed ? <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 19 }}>4M is processing the screenshot. Check the suggested level before saving.</Text> : null}
        {extraction ? <ExtractionSummary result={extraction} /> : null}
        {readMessage ? <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 19 }}>{readMessage}</Text> : null}
      </View>
      {readFailed && !reading ? <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => { setSuccess(null); setProgressDismissed(false); setReading(true); setReadRequest({ path, initialLevel: levelRef.current }); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: brand.accent }}>Retry reading screenshot</Text></Pressable> : null}
      <Pressable accessibilityRole="button" disabled={busy || disabled} onPress={() => { setReadRequest(null); setSuccess(null); onExtractionDetected(null); onChange(''); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: brand.muted }}>Remove screenshot</Text></Pressable>
    </View> : null}
    </>}
    {error ? <Text accessibilityRole="alert" style={{ color: '#b42318', fontSize: 13 }}>{error}</Text> : null}
    <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 18 }}>Up to 5 MB. Your screenshot is submitted when you save. Levels remain player submitted.</Text>
  </View>;
}

function ExtractionSummary({ result }: { result: PlaytomicExtraction }) {
  return <View style={{ gap: 4 }}>
    <Text style={{ color: brand.premium, fontWeight: '700', fontSize: 18 }}>Extracted level: {result.level == null ? 'Not visible' : result.level.toFixed(2)}</Text>
    <Text style={{ color: brand.muted, fontSize: 14 }}>Matches: {result.matches ?? 'Not visible'}</Text>
    <Text style={{ color: brand.muted, fontSize: 14 }}>Level reliability: {result.reliability_percent == null ? 'Not visible' : `${result.reliability_percent}%`}</Text>
  </View>;
}
