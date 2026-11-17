import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatKind, Conversation, MessagingEvent } from '@/lib/messaging';
import { lightBrand as b } from '@/theme/tokens';

const announcement = { title: 'Announcements', icon: 'megaphone-outline' as const, ink: '#27517B', tint: '#E5EFFB', surface: '#EEF4FC', edge: '#CBDBEC', description: 'Only organisers post updates', action: 'Read announcements' };
const discussion = { title: 'Discussion', icon: 'chatbubbles-outline' as const, ink: '#3D602C', tint: '#E4EED6', surface: '#F0F6E9', edge: '#C7D8B1', description: 'Players and organisers can reply', action: 'Open discussion' };
export const eventChannelStyle = (kind: ChatKind) => kind === 'event_announcements' ? announcement : discussion;

export function EventChannelIcon({ kind, size = 50 }: { kind: ChatKind; size?: number }) {
  const theme = eventChannelStyle(kind);
  return <View accessible={false} style={{ width: size, height: size, borderRadius: 12, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ionicons name={theme.icon} size={size * 0.48} color={theme.ink} /></View>;
}
export function EventUnread({ count, color = b.accent }: { count: number; color?: string }) {
  if (count <= 0) return null;
  return <View style={[styles.unread, { backgroundColor: color }]}><Text style={styles.unreadText}>{count > 99 ? '99+' : count}</Text></View>;
}
export function EventChannelOption({ kind, conversation, eventTitle, onPress, setupDetail, actionLabel, busy }: { kind: 'event_announcements' | 'event_discussion'; conversation?: Conversation; eventTitle: string; onPress: () => void; setupDetail?: string; actionLabel?: string; busy?: boolean }) {
  const theme = eventChannelStyle(kind), locked = !conversation;
  const action = actionLabel || theme.action;
  // Keep structural styles static: NativeWind's Pressable interop can drop
  // callback styles here, which previously removed the entire card treatment.
  return <Pressable accessibilityRole="button" accessibilityLabel={`${theme.title} for ${eventTitle}. ${setupDetail || theme.description}. ${conversation?.unread ? `${conversation.unread} unread. ` : ''}${busy ? 'Opening' : action}.`} accessibilityState={{ disabled: !!busy, busy: !!busy }} disabled={busy} onPress={onPress} android_ripple={{ color: theme.tint }} style={[styles.option, { backgroundColor: theme.surface, borderColor: theme.edge, borderLeftColor: theme.ink, opacity: busy ? 0.65 : 1 }]}>
    <View style={styles.optionRow}>
      <EventChannelIcon kind={kind} size={40} />
      <View style={styles.optionCopy}>
        <Text style={[styles.optionTitle, { color: theme.ink }]}>{theme.title}</Text>
        <Text style={styles.optionDescription}>{theme.description}</Text>
      </View>
      {locked ? <Ionicons name="lock-closed-outline" size={18} color={b.muted} /> : <EventUnread count={conversation.unread} color={theme.ink} />}
      <Ionicons name="chevron-forward" size={18} color={theme.ink} />
    </View>
    {locked && <View style={styles.setup}>
      {!!setupDetail && <Text style={styles.optionDescription}>{setupDetail}</Text>}
      <Text style={[styles.setupAction, { color: theme.ink }]}>{busy ? 'Opening…' : action}</Text>
    </View>}
  </Pressable>;
}
export function EventChatHeading({ title, onDetails }: { title: string; onDetails: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`View event details for ${title}`} onPress={onDetails} android_ripple={{ color: b.surface }} style={styles.eventHeading}>
    <View accessible={false} style={styles.eventIcon}><Ionicons name="calendar-outline" size={21} color={b.muted} /></View>
    <View style={styles.optionCopy}><Text numberOfLines={2} style={styles.eventTitle}>{title}</Text><Text style={styles.eventDetails}>View event details</Text></View>
    <Ionicons name="chevron-forward" size={18} color={b.muted} />
  </Pressable>;
}
export function EventDirectoryItem({ event, unread, onPress }: { event: MessagingEvent; unread: number; onPress: () => void }) {
  const date = new Date(`${event.date?.slice(0, 10)}T12:00:00`), validDate = Number.isFinite(date.getTime());
  const dateLabel = validDate ? date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date to be confirmed';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${event.title}. ${dateLabel}. ${event.manager ? 'Event team access. ' : ''}${unread ? `${unread} unread messages. ` : ''}Open announcements and discussion.`} onPress={onPress} android_ripple={{ color: '#16251F0D' }} style={[styles.directoryItem, { borderColor: unread ? '#A8C1D8' : b.edge }]}>
    <View style={styles.directoryHeading}>
      <View style={styles.dateTile}>{validDate ? <><Text style={styles.month}>{date.toLocaleDateString('en-ZA', { month: 'short' })}</Text><Text style={styles.day}>{date.getDate()}</Text></> : <Ionicons name="calendar-outline" size={20} color={b.muted} />}</View>
      <View style={styles.optionCopy}><Text numberOfLines={2} style={styles.directoryTitle}>{event.title}</Text><Text style={styles.directoryDate}>{dateLabel}{event.manager ? ' · Event team' : ''}</Text></View>
      <EventUnread count={unread} color={announcement.ink} />
      <Ionicons name="chevron-forward" size={18} color={b.muted} />
    </View>
    <View style={styles.directoryChannels}>
      <View style={[styles.channelHintGroup, { backgroundColor: announcement.tint }]}><Ionicons name="megaphone-outline" size={14} color={announcement.ink} /><Text style={[styles.channelHint, { color: announcement.ink }]}>Announcements</Text></View>
      <View style={[styles.channelHintGroup, { backgroundColor: discussion.tint }]}><Ionicons name="chatbubbles-outline" size={14} color={discussion.ink} /><Text style={[styles.channelHint, { color: discussion.ink }]}>Discussion</Text></View>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  option: { padding: 12, borderRadius: 16, borderWidth: 1, borderLeftWidth: 4, marginBottom: 12, overflow: 'hidden' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  optionCopy: { flex: 1, minWidth: 0, gap: 4 },
  optionTitle: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  optionDescription: { color: b.muted, fontSize: 13, lineHeight: 19 },
  setup: { marginTop: 12, gap: 8 },
  setupAction: { fontSize: 13, lineHeight: 20, fontWeight: '600' },
  unread: { minWidth: 24, minHeight: 24, borderRadius: 12, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
  unreadText: { color: 'white', fontSize: 12, fontWeight: '600' },
  eventHeading: { backgroundColor: b.elevated, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: b.edge, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden' },
  eventIcon: { width: 36, height: 40, borderRadius: 10, backgroundColor: b.surface, alignItems: 'center', justifyContent: 'center' },
  eventTitle: { color: b.premium, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  eventDetails: { color: b.messagingAction, fontSize: 12, lineHeight: 18 },
  directoryItem: { backgroundColor: b.elevated, borderWidth: 1, borderRadius: 16, padding: 12, gap: 12, marginBottom: 10, overflow: 'hidden' },
  directoryHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateTile: { width: 36, minHeight: 44, paddingVertical: 4, borderRadius: 8, backgroundColor: b.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  month: { fontSize: 11, lineHeight: 14, color: b.muted, fontWeight: '500' },
  day: { fontSize: 18, lineHeight: 22, color: b.premium, fontWeight: '600', fontVariant: ['tabular-nums'] },
  directoryTitle: { color: b.premium, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  directoryDate: { color: b.muted, fontSize: 12, lineHeight: 18 },
  directoryChannels: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  channelHintGroup: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 },
  channelHint: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
});
