import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { licenseDate, type License, type LicenseBundle } from '@/lib/licenses';
import { licenseStartDate } from '@/lib/license-dates';
import { lightBrand as brand } from '@/theme/tokens';

const title = (licence: License) => licence.license_type === 'full'
  ? `${licence.season_year} Full licence`
  : `Temporary · ${licence.event_name || 'Event licence'}`;

function shortDate(value: string) {
  return value ? new Date(`${value.slice(0, 10)}T12:00:00+02:00`).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg',
  }) : '—';
}

function Status({ licence }: { licence: License }) {
  const color = licence.status === 'active' ? brand.accent
    : licence.status === 'revoked' ? brand.danger : brand.muted;
  return <View style={{ backgroundColor: brand.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
    <Text style={{ color, fontSize: 11, fontWeight: '600' }}>
      {licence.status[0].toUpperCase() + licence.status.slice(1)}
    </Text>
  </View>;
}

/** Current coverage stays visible; purchase dates and past licences are on demand. */
export function LicenseSummary({ bundle }: { bundle: LicenseBundle }) {
  const [expanded, setExpanded] = useState(false);
  const current = bundle.licenses.filter(licence => licence.status === 'active' || licence.status === 'upcoming');

  return <View style={{ paddingHorizontal: 16, paddingTop: 14, borderRadius: 16, backgroundColor: brand.elevated }}>
    <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 17, lineHeight: 23, fontWeight: '700' }}>
      {bundle.name}
    </Text>
    <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 18, marginTop: 2 }}>
      {bundle.license_number ? `Licence no. ${bundle.license_number}` : 'Number allocated with your first licence'}
    </Text>

    <View style={{ gap: 10, marginTop: 12, marginBottom: 8 }}>
      {current.length ? current.map(licence => <View key={licence.id} style={{ gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <Text style={{ flex: 1, color: brand.premium, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{title(licence)}</Text>
          <Status licence={licence} />
        </View>
        <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 18 }}>
          {licence.status === 'upcoming'
            ? `${shortDate(licenseStartDate(licence))} – ${shortDate(licence.ends_on)}`
            : `Valid until ${shortDate(licence.ends_on)}`}
        </Text>
      </View>) : <Text style={{ color: brand.muted, fontSize: 14, lineHeight: 20 }}>No active licence</Text>}
    </View>

    {bundle.licenses.length > 0 && <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Licence details (${bundle.licenses.length})`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(value => !value)}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderColor: brand.edge }}>
        <Text style={{ color: brand.muted, fontSize: 12, fontWeight: '600' }}>
          {expanded ? 'Hide licence details' : `Licence details (${bundle.licenses.length})`}
        </Text>
        <SymbolView name={expanded ? 'chevron.up' : 'chevron.down'} size={12} tintColor={brand.muted} accessibilityElementsHidden />
      </Pressable>
      {expanded && <View style={{ gap: 12, paddingBottom: 16 }}>
        {bundle.licenses.map(licence => <View key={licence.id} style={{ gap: 4, paddingTop: 10, borderTopWidth: 1, borderColor: brand.edge }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Text style={{ flex: 1, color: brand.premium, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{title(licence)}</Text>
            <Status licence={licence} />
          </View>
          <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 18 }}>
            {licenseDate(licenseStartDate(licence))} – {licenseDate(licence.ends_on)}
          </Text>
          {licence.license_type === 'full' && <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 18 }}>
            {licence.source === 'complimentary' ? `Granted ${licenseDate(licence.granted_on || '')}`
              : licence.purchased_on || licence.season_year === 2026
                ? `Purchased ${licenseDate(licence.purchased_on || '2026-01-01')}` : 'Purchase date unavailable'}
          </Text>}
        </View>)}
      </View>}
    </>}
    {!bundle.licenses.length && <View style={{ height: 8 }} />}
  </View>;
}
