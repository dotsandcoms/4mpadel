import { useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { ActionButton } from './event-ui';
import { pickSponsorLogo } from '@/lib/sponsor-logo';
import { lightBrand as brand } from '@/theme/tokens';

export function SponsorDetails({ eventId, email, name, logo, sponsor, allowLogo, allowName, disabled, onChange, onBusyChange }: {
  eventId: number; email: string; name: string; logo?: string; sponsor?: string;
  allowLogo: boolean; allowName: boolean; disabled: boolean;
  onChange: (value: { tshirtLogoUrl?: string; tshirtSponsorName?: string }) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const upload = async () => {
    if (disabled || inFlight.current) return;
    inFlight.current = true; setUploading(true); onBusyChange(true); setError('');
    try { const url = await pickSponsorLogo(eventId, email); if (url) onChange({ tshirtLogoUrl: url }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Logo upload failed. Please try again.'); }
    finally { inFlight.current = false; setUploading(false); onBusyChange(false); }
  };
  return <View style={{ gap: 12 }}>
    {allowName && <>
      <Text style={{ color: brand.muted, fontSize: 13 }}>Sponsor name for {name} (optional)</Text>
      <TextInput accessibilityLabel={`Sponsor name for ${name}`} value={sponsor || ''} editable={!disabled} maxLength={80} onChangeText={tshirtSponsorName => onChange({ tshirtSponsorName })} placeholder="e.g. NOX" placeholderTextColor={brand.faint} style={{ color: brand.premium, padding: 14, borderWidth: 1, borderColor: brand.edge, borderRadius: 12 }} />
    </>}
    {allowLogo && <>
      <Text style={{ color: brand.muted, fontSize: 13 }}>Sponsor logo for {name} (optional)</Text>
      {!!logo && <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#fff', alignSelf: 'flex-start' }}><Image accessibilityLabel={`${name} sponsor logo`} source={{ uri: logo }} style={{ width: 100, height: 80 }} contentFit="contain" /></View>}
      <ActionButton label={logo ? 'Replace logo' : 'Upload logo'} secondary disabled={disabled} busy={uploading} onPress={() => void upload()} />
      <Text style={{ color: brand.faint, fontSize: 12 }}>Choose an image from Files · Maximum 2MB</Text>
      {!!logo && <ActionButton label="Remove logo" secondary disabled={disabled} onPress={() => { setError(''); onChange({ tshirtLogoUrl: '' }); }} />}
      {!!error && <Text accessibilityRole="alert" style={{ color: brand.danger, lineHeight: 20 }}>{error}</Text>}
    </>}
  </View>;
}
