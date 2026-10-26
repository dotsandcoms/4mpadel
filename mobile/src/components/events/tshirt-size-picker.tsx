import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightBrand as brand } from '@/theme/tokens';

const groups = [
  { title: 'Adult sizes', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] },
  { title: 'Youth sizes', sizes: ['Youth XS', 'Youth S', 'Youth M', 'Youth L', 'Youth XL'] },
];

export function SizePicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value || 'Select size'}`} accessibilityHint="Opens size selection" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, minHeight: 82, borderRadius: 16, borderWidth: 1, borderColor: value ? brand.accent : brand.edge, backgroundColor: brand.elevated }}>
      <View style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDF0EB' }}><Ionicons name="shirt-outline" size={22} color={value ? brand.accent : brand.muted} /></View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ color: brand.premium, fontSize: 14, fontWeight: '600', lineHeight: 20 }}>{label}</Text>
        <Text style={{ color: brand.muted, fontSize: 12 }}>{value ? 'Tap to change size' : 'Choose your fit'}</Text>
      </View>
      {value ? <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: brand.surface }}><Text style={{ color: brand.accent, fontSize: 16, fontWeight: '700' }}>{value}</Text></View> : <Text style={{ color: brand.muted, fontSize: 13 }}>Select</Text>}
      <Ionicons name="chevron-down" color={brand.muted} size={16} />
    </Pressable>
    <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss size selection" onPress={() => setOpen(false)} style={{ position: 'absolute', inset: 0, backgroundColor: '#000000b3' }} />
        <View accessibilityViewIsModal style={{ maxHeight: '85%', backgroundColor: brand.elevated, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: brand.edge, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 20) }}>
          <View style={{ alignSelf: 'center', height: 4, width: 36, backgroundColor: brand.edge, borderRadius: 2, marginBottom: 12 }} />
          <View style={{ paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <View style={{ flex: 1, gap: 5 }}><Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 23, fontWeight: '700' }}>Choose a size</Text><Text style={{ color: brand.muted, fontSize: 13 }}>{label}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close size picker" onPress={() => setOpen(false)} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={24} color={brand.muted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 22, gap: 24, paddingBottom: 12 }}>
            {groups.map(group => <View key={group.title} style={{ gap: 12 }}>
              <Text accessibilityRole="header" style={{ color: brand.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>{group.title.toUpperCase()}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {group.sizes.map(size => <Pressable key={size} accessibilityRole="radio" accessibilityLabel={`${group.title}: ${size}`} accessibilityState={{ checked: value === size }} onPress={() => { onChange(size); setOpen(false); }}
                  style={{ width: '30%', minHeight: 60, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: value === size ? brand.padel : brand.edge, backgroundColor: value === size ? brand.padel : brand.page }}>
                  <Text style={{ color: value === size ? '#16251F' : brand.premium, fontSize: 16, fontWeight: '600' }}>{size.replace('Youth ', '')}</Text>
                  {value === size && <Ionicons name="checkmark" size={12} color="#16251F" />}
                </Pressable>)}
              </View>
            </View>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
