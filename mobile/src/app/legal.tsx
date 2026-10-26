import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { SettingsPage, SETTINGS_BLUE } from '@/components/settings-ui';
import { LEGAL, parseLegalKind } from '@/lib/legal';
import { lightBrand as brand } from '@/theme/tokens';

export default function LegalScreen() {
  const params = useLocalSearchParams<{ kind?: string | string[] }>();
  const kind = parseLegalKind(params.kind);
  const copy = LEGAL[kind];

  return <SettingsPage title={copy.title}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 18 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#E9EEFF', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={kind === 'privacy' ? 'shield-checkmark-outline' : 'document-text-outline'} size={23} color={SETTINGS_BLUE} />
      </View>
      <Text style={{ color: brand.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>4M PADEL · LEGAL INFORMATION</Text>
    </View>
    <Text style={{ color: brand.muted, fontSize: 14, lineHeight: 22, marginBottom: 22 }}>{copy.intro}</Text>
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E4E8E5', overflow: 'hidden' }}>
      {copy.points.map((point, index) => <View key={point} style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 18, gap: 12, borderTopWidth: index ? 0.5 : 0, borderTopColor: '#E4E8E5' }}>
        <Text style={{ color: SETTINGS_BLUE, fontSize: 12, lineHeight: 22, fontWeight: '700', width: 20 }}>{String(index + 1).padStart(2, '0')}</Text>
        <Text selectable style={{ flex: 1, color: brand.premium, fontSize: 14, lineHeight: 22 }}>{point}</Text>
      </View>)}
    </View>
    {kind === 'privacy' && <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 19, marginTop: 18, paddingHorizontal: 4 }}>By creating an account, you consent to this processing of your personal information.</Text>}
  </SettingsPage>;
}
