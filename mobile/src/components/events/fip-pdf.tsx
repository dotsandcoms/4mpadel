import { Linking, Pressable, Text, View } from 'react-native';
import { lightBrand as b } from '@/theme/tokens';
import { isFipDocumentUrl, type FipDocument } from '@/lib/fip-tournament';
// Web fallback only; Metro selects fip-pdf.native.tsx for both iOS and Android.
export function FipPdf({ document }: { document: FipDocument }) {
  return <View style={{ padding: 24, gap: 16 }}><Text style={{ color: b.premium }}>{document.title}</Text><Pressable accessibilityRole="link" onPress={() => { if (isFipDocumentUrl(document.url)) void Linking.openURL(document.url); }}><Text style={{ color: b.accent, fontWeight: '700' }}>Open published PDF →</Text></Pressable></View>;
}
