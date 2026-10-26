import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';
import { ActionButton } from '@/components/events/event-ui';
import { fetchLicenses, licenseDate, type LicenseBundle } from '@/lib/licenses';
import { licenseStartDate } from '@/lib/license-dates';
import { hapticLight } from '@/lib/haptics';
import { lightBrand as brand } from '@/theme/tokens';
export function PlayerLicenseCard() {
  const [bundle, setBundle] = useState<LicenseBundle | null>(null),
    [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  useFocusEffect(useCallback(() => {
    let live = true;
    fetchLicenses().then(data => {
      if (live) {
        setBundle(data);
        setError('');
      }
    }).catch(e => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, []));
  const renewed = bundle?.licenses.some(l => l.license_type === 'full' && l.season_year === 2027),
    existing = bundle?.licenses.some(l => l.license_type === 'full' && l.season_year < 2027 && l.status !== 'revoked');
  const fullHolder = bundle?.licenses.some(l => l.license_type === 'full' && l.status === 'active');
  return <View style={{
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: brand.elevated,
    borderWidth: 1,
    borderColor: brand.edge
  }}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expanded ? 'Hide' : 'Show'} your licences`}
      accessibilityState={{ expanded }}
      onPress={() => { hapticLight(); setExpanded(value => !value); }}
      className="active:opacity-70"
      style={{ minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <SymbolView name={{ ios: 'person.text.rectangle', android: 'badge', web: 'badge' }} size={16} tintColor={brand.faint} />
      <Text style={{ flex: 1, color: brand.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }}>YOUR LICENCES</Text>
      <Text style={{ color: brand.premium, fontSize: 12, fontWeight: '600' }}>{expanded ? 'Hide' : 'Show'}</Text>
      <SymbolView name={{ ios: expanded ? 'chevron.up' : 'chevron.down', android: expanded ? 'expand_less' : 'expand_more', web: expanded ? 'expand_less' : 'expand_more' }} size={13} tintColor={brand.muted} />
    </Pressable>
    {expanded && <View style={{ paddingHorizontal: 14, paddingBottom: 16, gap: 10 }}>
      {bundle && <Text style={{ color: brand.premium, fontWeight: '600' }}>{fullHolder ? 'Full licence holder' : bundle.licenses.some(l => l.license_type === 'temporary' && l.status === 'active') ? 'Temporary event licence holder' : 'No current Full licence'}</Text>}<Text style={{ color: brand.muted, fontSize: 12 }}>4M licence number</Text><Text style={{
      color: brand.muted,
      fontSize: 13
    }}>{bundle?.license_number || (bundle ? 'Number allocated with your first licence' : 'Loading licence details…')}</Text>{bundle?.licenses.filter(l => l.status === 'active' || l.status === 'upcoming').map(l => <View key={l.id} style={{
      gap: 3
    }}><Text style={{
        color: brand.premium,
        fontWeight: '600'
      }}>{l.license_type === 'full' ? `${l.season_year} Full licence` : `Temporary · ${l.event_name}`}</Text><Text style={{
        color: brand.muted,
        fontSize: 12
      }}>{licenseDate(licenseStartDate(l))} – {licenseDate(l.ends_on)}</Text>{l.license_type === 'full' && <Text style={{ color: brand.muted, fontSize: 12 }}>{l.source === 'complimentary' ? `Granted ${licenseDate(l.granted_on || '')}` : l.purchased_on || l.season_year === 2026 ? `Purchased ${licenseDate(l.purchased_on || '2026-01-01')}` : 'Purchase date unavailable'}</Text>}{l.status === 'upcoming' && <Text style={{ color: brand.muted, fontSize: 12 }}>Starts {licenseDate(licenseStartDate(l))}</Text>}</View>)}{error && <Text accessibilityRole="alert" style={{
      color: brand.danger
    }}>{error}</Text>}<ActionButton label={renewed ? 'Manage licences' : existing ? 'Renew for 2027' : 'Buy 2027 Full licence'} onPress={() => router.push('/license')} /><Text style={{
      color: brand.muted,
      fontSize: 12,
      lineHeight: 18
    }}>Temporary event licences are available without annual coverage.</Text>
    </View>}
  </View>;
}
