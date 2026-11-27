import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { coachPublicUrl, type CoachDirectoryEntry } from '@/lib/coaches';
import { lightBrand as brand } from '@/theme/tokens';

export function CoachPortrait({ coach, size }: { coach: CoachDirectoryEntry; size: number }) {
  const url = coachPublicUrl(coach.profile_pic_url);
  const [failedUrl, setFailedUrl] = useState<string>();
  const initials = coach.full_name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

  return <View accessible={false} style={[styles.portrait, { width: size, height: size, borderRadius: size / 2 }]}>
    <Text accessible={false} style={[styles.initials, { fontSize: size * 0.29 }]}>{initials}</Text>
    {url && failedUrl !== url && <Image source={url} contentFit="cover" cachePolicy="memory-disk"
      recyclingKey={coach.id} style={StyleSheet.absoluteFill} onError={() => setFailedUrl(url)} />}
  </View>;
}

const styles = StyleSheet.create({
  portrait: { backgroundColor: brand.panel, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initials: { color: brand.accent, fontWeight: '700' },
});
