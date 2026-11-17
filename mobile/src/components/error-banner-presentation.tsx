import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { lightBrand as b } from '@/theme/tokens';
import type { ErrorPresentationProps } from './error-banner-presentation.types';

/** Web fallback. Native builds resolve the SwiftUI or Compose implementation. */
export function ErrorPresentation({ message, onDismiss, top }: ErrorPresentationProps) {
  return <View pointerEvents="box-none" style={{ position: 'absolute', top, left: 12, right: 12, zIndex: 2000 }}>
    <View style={{ backgroundColor: '#FFF0ED', borderWidth: 1, borderColor: '#EBC6C0', borderLeftWidth: 4, borderLeftColor: b.danger, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 6, paddingVertical: 9, shadowColor: '#16251F', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 12 }}>
      <Ionicons name="alert-circle-outline" size={24} color={b.danger} accessible={false} />
      <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ flex: 1, color: '#7D211B', fontWeight: '600', fontSize: 15, lineHeight: 22 }}>{message}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss error" onPress={onDismiss} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={21} color="#7D211B" /></Pressable>
    </View>
  </View>;
}
