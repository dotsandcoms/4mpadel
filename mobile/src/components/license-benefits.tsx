import { useState } from 'react';
import { AccessibilityInfo, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { HomeAction } from '@/components/home-action';
import { lightBrand as brand } from '@/theme/tokens';

const COURT_SPORT_URL = 'https://www.courtsport.co.za/';

export function LicenseBenefits({ licenseNumber }: { licenseNumber?: string | null }) {
  const number = licenseNumber?.trim();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copyNumber() {
    if (!number) return;
    try {
      if (!(await Clipboard.setStringAsync(number))) {
        setCopyStatus('failed');
        return;
      }
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
      return;
    }
    AccessibilityInfo.announceForAccessibility('SAPA licence number copied.');
  }

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>Benefits</Text>
      <View style={styles.card}>
        <View style={styles.logoFrame}>
          <Image
            source={require('@/assets/images/court-sport.png')}
            accessible
            accessibilityLabel="Court Sport logo"
            resizeMode="contain"
            style={styles.logo}
          />
        </View>
        <Text style={styles.body}>
          SAPA annual licence holders get <Text style={styles.discount}>25% off</Text> at Court Sport.
          {' '}Enter your licence number at checkout.
        </Text>
        {number ? (
          <View style={styles.numberRow}>
            <View style={styles.numberDetails}>
              <Text style={styles.caption}>Your SAPA licence number</Text>
              <Text selectable style={styles.number}>{number}</Text>
            </View>
            <HomeAction
              label={copyStatus === 'copied' ? 'Copied' : 'Copy number'}
              accessibilityLabel="Copy SAPA licence number"
              onPress={() => void copyNumber()}
            />
          </View>
        ) : licenseNumber !== undefined ? (
          <Text style={styles.caption}>You’ll get a licence number when your first SAPA licence is issued.</Text>
        ) : null}
        {copyStatus === 'failed' && (
          <Text accessibilityRole="alert" style={styles.error}>
            Couldn’t copy the licence number. Select the number to copy it manually.
          </Text>
        )}
        <Link href={COURT_SPORT_URL} asChild>
          <Pressable accessibilityRole="link" style={styles.link}>
            <Text style={styles.linkText}>Visit courtsport.co.za</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heading: { color: brand.premium, fontSize: 20, fontWeight: '600' },
  card: { backgroundColor: brand.elevated, borderRadius: 16, padding: 16, gap: 12 },
  logoFrame: { width: 216, maxWidth: '100%', aspectRatio: 3.25, overflow: 'hidden', justifyContent: 'center' },
  logo: { width: '100%', aspectRatio: 16 / 9, flexShrink: 0 },
  body: { color: brand.muted, fontSize: 14, lineHeight: 21 },
  discount: { color: brand.premium, fontWeight: '700' },
  numberRow: { borderTopWidth: 1, borderColor: brand.edge, paddingTop: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  numberDetails: { flexGrow: 1, flexShrink: 1, gap: 3 },
  caption: { color: brand.muted, fontSize: 12, lineHeight: 18 },
  number: { color: brand.premium, fontSize: 16, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  error: { color: brand.danger, fontSize: 13, lineHeight: 19 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { color: brand.accent, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
});
