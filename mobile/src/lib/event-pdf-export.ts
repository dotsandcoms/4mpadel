import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export async function exportEventPdf(html: string, eventName: string) {
  if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
  if (!await Sharing.isAvailableAsync()) throw new Error('File saving is unavailable on this device.');
  const { uri } = await Print.printToFileAsync({ html, width: 595.28, height: 841.89, margins: { top: 28, bottom: 28, left: 28, right: 28 } });
  const safeName = eventName.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'SAPA-event';
  const pdf = new File(Paths.cache, `${safeName}-players.pdf`);
  if (pdf.exists) pdf.delete();
  new File(uri).move(pdf);
  await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Save player list' });
}
