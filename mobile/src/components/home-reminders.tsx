import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PendingAction } from '@/lib/home';

export function ProfileCompletionBanner({ missing, onEdit }: { missing: string[]; onEdit: () => void }) {
  if (!missing.length) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Your profile is incomplete. Missing ${missing.join(', ')}. Edit profile`} onPress={onEdit} style={[s.banner, s.profile]}>
    <Ionicons name="person-circle-outline" size={25} color="#27517B" />
    <View style={s.copy}><Text style={s.profileTitle}>Your profile is incomplete</Text><Text style={s.profileDetail}>Add {missing.slice(0, 3).join(', ').toLowerCase()}{missing.length > 3 ? ` and ${missing.length - 3} more details` : ''}.</Text><Text style={s.profileTitle}>Edit profile →</Text></View>
  </Pressable>;
}

export function HomeActionBanner({ actions, onReview, onDismiss }: { actions: PendingAction[]; onReview: () => void; onDismiss: () => void }) {
  if (!actions.length) return null;
  return <View style={s.banner}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${actions.length} pending actions. ${actions[0].title}. Review ${actions.length > 1 ? 'all actions' : 'action'}`} onPress={onReview} style={s.review}>
      <View style={s.copy}><View style={s.heading}><Text style={s.title}>{actions[0].title}</Text>{actions.length > 1 && <View style={s.badge}><Text style={s.badgeText}>+{actions.length - 1} more {actions.length === 2 ? 'action' : 'actions'}</Text></View>}</View><Text numberOfLines={1} style={s.detail}>{actions[0].subtitle}</Text><Text style={s.title}>Review {actions.length > 1 ? 'all ' : ''}→</Text></View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss action banner until next sign in" onPress={onDismiss} hitSlop={2} style={s.close}><Ionicons name="close" size={20} color="#78521A" /></Pressable>
  </View>;
}
const s = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 16, backgroundColor: '#FFF5DD', borderRadius: 12 },
  profile: { backgroundColor: '#EAF1F8', borderWidth: 1, borderColor: '#CFDDEB' },
  review: { flex: 1, minHeight: 52, justifyContent: 'center' }, copy: { flex: 1, gap: 6 },
  heading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#78521A' }, badgeText: { fontSize: 11, lineHeight: 16, fontWeight: '600', color: '#FFF' },
  title: { fontSize: 12, lineHeight: 18, fontWeight: '600', color: '#78521A' }, detail: { fontSize: 11, lineHeight: 16, color: '#78521A' },
  profileTitle: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#234B72' }, profileDetail: { fontSize: 12, lineHeight: 18, color: '#355B7B' },
  close: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
});
