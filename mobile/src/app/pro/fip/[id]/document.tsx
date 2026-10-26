import { trackEvent } from '@/lib/analytics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchFipTournament, type FipDocument } from '@/lib/fip-tournament';
import { FipPdf } from '@/components/events/fip-pdf';
import { lightBrand as b } from '@/theme/tokens';

export default function FipDocumentScreen() {
  const { id, document: documentId } = useLocalSearchParams<{ id: string; document: string }>();
  const router = useRouter();
  const [document, setDocument] = useState<FipDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void fetchFipTournament(Number(id)).then(value => {
      if (!active) return;
      const found = value.documents.find(d => d.id === documentId);
      if (!found) { setError('This document is no longer published. Return to the tournament and refresh.'); return; }
      setDocument(found);
      void trackEvent('content_view', { content_type: 'fip_document' });
    }).catch(() => { if (active) setError('This document could not load. Please try again.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, documentId, attempt]);
  return <SafeAreaView style={{ flex: 1, backgroundColor: b.page }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12, borderBottomColor: b.edge, borderBottomWidth: 1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to tournament" onPress={() => router.back()} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="arrow-back" color={b.premium} size={24} /></Pressable>
      <View style={{ flex: 1, gap: 4 }}><Text style={{ color: b.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>OFFICIAL FIP DOCUMENT</Text><Text numberOfLines={2} style={{ color: b.premium, fontWeight: '700', fontSize: 15 }}>{document?.title || 'Published document'}</Text></View>
    </View>
    {loading ? <ActivityIndicator color={b.accent} style={{ margin: 30 }} /> : error ? <View style={{ padding: 24, gap: 20 }}><Text style={{ color: b.premium }}>{error}</Text><Pressable onPress={() => setAttempt(n => n + 1)} accessibilityRole="button"><Text style={{ color: b.accent, fontWeight: '700' }}>Retry</Text></Pressable></View> : document && <FipPdf document={document} />}
  </SafeAreaView>;
}
