import { Component, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TurboModuleRegistry, View } from 'react-native';
import { loadNativePdf } from '@/lib/native-pdf';
import { lightBrand as b } from '@/theme/tokens';
import { isFipDocumentUrl, type FipDocument } from '@/lib/fip-tournament';

/** Native PDFKit/Pdfium rendering. No website, browser session or HTML is opened. */
export function FipPdf({ document }: { document: FipDocument }) {
  const [viewer] = useState(() => loadNativePdf(
    () => TurboModuleRegistry.get('ReactNativeBlobUtil'),
    () => require('react-native-pdf') as typeof import('react-native-pdf'),
  ));
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const source = useMemo(() => ({ uri: document.url, cache: true, cacheFileName: `fip-${document.id}.pdf`, expiration: 900,
    headers: { 'User-Agent': '4M Padel calendar sync/1.0', Accept: 'application/pdf' } }), [document.url, document.id]);
  if (!isFipDocumentUrl(document.url)) return <Text style={{ color: b.danger, padding: 20 }}>This published document is unavailable.</Text>;
  if (viewer.state !== 'ready') return <View style={{ padding: 24, gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 21, fontWeight: '700' }}>{viewer.state === 'update-required' ? 'App update required' : 'PDF viewer unavailable'}</Text>
    <Text style={{ color: b.muted, fontSize: 15, lineHeight: 23 }}>{viewer.state === 'update-required' ? 'This version of 4M Padel does not include the PDF viewer. Install the latest app build to read published draws and schedules here.' : 'The PDF viewer could not start. Close this document and try again.'}</Text>
  </View>;
  const Pdf = viewer.component;
  return <View style={{ flex: 1, backgroundColor: b.page }}>
    <Text style={{ color: b.muted, fontSize: 12, padding: 14, textAlign: 'center' }}>{pages ? `Page ${page} of ${pages} · Pinch to zoom` : 'Opening published document…'}</Text>
    {error ? <View style={{ padding: 24, gap: 16 }}><Text style={{ color: b.premium }}>This document could not load. Please try again.</Text><Pressable accessibilityRole="button" onPress={() => { setError(false); setAttempt(n => n + 1); }} style={{ padding: 16, borderRadius: 12, backgroundColor: b.accent }}><Text style={{ color: '#FFF', fontWeight: '700', textAlign: 'center' }}>Retry document</Text></Pressable></View>
      : <PdfRenderBoundary key={`${document.id}:${attempt}`} onError={() => setError(true)}><Pdf source={source} trustAllCerts={false} enableAnnotationRendering={false} onLoadComplete={count => setPages(count)} onPageChanged={current => setPage(current)} onError={() => setError(true)}
        renderActivityIndicator={() => <ActivityIndicator size="large" color={b.accent} />} style={{ flex: 1, width: '100%', backgroundColor: b.page }} /></PdfRenderBoundary>}
  </View>;
}

class PdfRenderBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
