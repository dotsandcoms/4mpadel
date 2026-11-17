import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import type { Club } from '@/lib/clubs';
import { lightBrand as b } from '@/theme/tokens';

export function ClubIdentity({ club, size = 56 }: { club: Pick<Club, 'name' | 'logo'>; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', backgroundColor: b.surface, borderWidth: 1, borderColor: '#0000001A', alignItems: 'center', justifyContent: 'center' }}>
    {club.logo ? <Image source={{ uri: club.logo }} style={{ width: '100%', height: '100%' }} contentFit="contain" /> : <Text style={{ color: b.muted, fontSize: size / 3, fontWeight: '600' }}>{club.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</Text>}
  </View>;
}
