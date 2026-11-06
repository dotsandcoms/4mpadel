import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ChatKind, Conversation, MessagingEvent } from '@/lib/messaging';
import { lightBrand as b } from '@/theme/tokens';

const announcement = { title: 'Announcements', icon: 'megaphone-outline' as const, ink: '#27517B', tint: '#E5EFFB', surface: '#F6F9FE', edge: '#CBDBEC', eyebrow: 'FROM YOUR EVENT TEAM', description: 'Official updates from the organiser.', action: 'Read announcements' };
const discussion = { title: 'Discussion', icon: 'chatbubbles-outline' as const, ink: '#3D602C', tint: '#E4EED6', surface: '#F2F7EA', edge: '#C7D8B1', eyebrow: 'PLAYERS + EVENT TEAM', description: 'Ask questions, reply and chat with other players.', action: 'Open discussion' };
export const eventChannelStyle = (kind: ChatKind) => kind === 'event_announcements' ? announcement : discussion;

export function EventChannelIcon({ kind, size = 50 }: { kind: ChatKind; size?: number }) {
  const theme = eventChannelStyle(kind);
  return <View accessible={false} style={{ width: size, height: size, borderRadius: 14, backgroundColor: theme.tint, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ionicons name={theme.icon} size={size * 0.48} color={theme.ink} /></View>;
}
export function EventUnread({ count, color = b.accent }: { count: number; color?: string }) {
  if (count <= 0) return null;
  return <View style={[styles.unread, { backgroundColor: color }]}><Text style={styles.unreadText}>{count > 99 ? '99+' : count}</Text></View>;
}
export function EventChannelOption({ kind, conversation, eventTitle, onPress, setupDetail, actionLabel, busy }: { kind: 'event_announcements' | 'event_discussion'; conversation?: Conversation; eventTitle: string; onPress: () => void; setupDetail?: string; actionLabel?: string; busy?: boolean }) {
  const theme = eventChannelStyle(kind), locked = !conversation;
  const action = actionLabel || theme.action;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${theme.title} for ${eventTitle}. ${setupDetail || theme.description}${conversation?.unread ? ` ${conversation.unread} unread.` : ''} ${action}.`} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.option, { backgroundColor: locked ? b.surface : theme.surface, borderColor: locked ? b.edge : theme.edge, borderLeftWidth: 4, borderLeftColor: locked ? b.edge : theme.ink, opacity: pressed || busy ? 0.7 : 1 }]}>
    <View style={styles.optionHeading}><EventChannelIcon kind={kind} size={42} /><Text style={[styles.eyebrow, { flex: 1, color: locked ? b.muted : theme.ink }]}>{theme.eyebrow}</Text>{locked ? <Ionicons name="lock-closed-outline" size={19} color={b.muted} /> : <EventUnread count={conversation.unread} color={theme.ink} />}</View><Text accessibilityRole="header" style={[styles.optionTitle, { color: theme.ink }]}>{theme.title}</Text>
    <Text style={styles.optionDescription}>{setupDetail || theme.description}</Text>
    <View style={styles.optionFooter}><View style={{ flex: 1 }}><Text style={[styles.action, { color: theme.ink }]}>{busy ? 'Opening…' : action}</Text>{!locked && <Text style={styles.access}>{kind === 'event_announcements' ? 'Organisers post updates' : 'Players and organisers can reply'}</Text>}</View><Ionicons name="arrow-forward" size={21} color={theme.ink} /></View>
  </Pressable>;
}
export function EventChatHeading({ title, onDetails }: { title: string; onDetails: () => void }) {
  return <View style={styles.eventHeading}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="calendar-outline" size={17} color="#D1E2B4" /><Text style={styles.eventEyebrow}>EVENT CONVERSATIONS</Text></View><Text accessibilityRole="header" style={styles.eventTitle}>{title}</Text><Pressable accessibilityRole="link" accessibilityLabel={`View event details for ${title}`} onPress={onDetails} style={styles.eventDetails}><Text style={{ color: '#E0E9D8', fontWeight: '600', fontSize: 13 }}>View event details</Text><Ionicons name="arrow-forward" size={16} color="#D1E2B4" /></Pressable></View>;
}
export function EventDirectoryItem({ event, unread, onPress }: { event: MessagingEvent; unread: number; onPress: () => void }) {
  const date = new Date(`${event.date?.slice(0, 10)}T12:00:00`), validDate = Number.isFinite(date.getTime());
  const dateLabel = validDate ? date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Date to be confirmed';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${event.title}. ${dateLabel}. ${unread ? `${unread} unread messages. ` : ''}Choose announcements or discussion.`} onPress={onPress} style={({ pressed }) => [styles.directoryItem, { opacity: pressed ? 0.7 : 1, borderColor: unread ? '#B5CBA0' : b.edge }]}>
    <View style={styles.dateTile}>{validDate ? <><Text style={styles.month}>{date.toLocaleDateString('en-ZA', { month: 'short' }).toUpperCase()}</Text><Text style={styles.day}>{date.getDate()}</Text></> : <Ionicons name="calendar-outline" size={25} color={b.accent} />}</View>
    <View style={{ flex: 1, gap: 7 }}><Text numberOfLines={3} style={styles.directoryTitle}>{event.title}</Text><Text style={styles.directoryDate}>{dateLabel}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><View style={styles.channelHintGroup}><Ionicons name="megaphone-outline" size={14} color={announcement.ink} /><Text style={[styles.channelHint, { color: announcement.ink }]}>Announcements</Text></View><View style={styles.channelHintGroup}><Ionicons name="chatbubbles-outline" size={14} color={discussion.ink} /><Text style={[styles.channelHint, { color: discussion.ink }]}>Discussion</Text></View></View>{event.manager && <Text style={styles.managerHint}>Event team access</Text>}</View>
    <View style={{ alignItems: 'center', gap: 12 }}><EventUnread count={unread} /><Ionicons name="chevron-forward" size={19} color={b.muted} /></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  option: { padding: 19, borderRadius: 19, borderWidth: 1, gap: 12, marginBottom: 14 },
  optionHeading: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 0.7 },
  optionTitle: { color: b.premium, fontSize: 23, fontWeight: '800', letterSpacing: -0.5 },
  optionDescription: { color: b.muted, fontSize: 15, lineHeight: 23 },
  optionFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#16251F12' },
  action: { fontSize: 15, fontWeight: '700' }, access: { color: b.muted, fontSize: 12, marginTop: 5, lineHeight: 18 },
  unread: { minWidth: 25, minHeight: 25, borderRadius: 13, paddingHorizontal: 7, justifyContent: 'center', alignItems: 'center' }, unreadText: { color: 'white', fontSize: 12, fontWeight: '700' },
  eventHeading: { backgroundColor: b.premium, padding: 22, borderRadius: 21, marginBottom: 23, gap: 13 },
  eventEyebrow: { color: '#D1E2B4', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  eventTitle: { color: 'white', fontSize: 25, lineHeight: 33, fontWeight: '800', letterSpacing: -0.6 },
  eventDetails: { minHeight: 38, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#FFFFFF25', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  directoryItem: { backgroundColor: b.elevated, borderWidth: 1, borderRadius: 18, padding: 16, gap: 13, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 13 },
  dateTile: { width: 49, minHeight: 65, paddingVertical: 8, borderRadius: 13, backgroundColor: b.surface, alignItems: 'center', justifyContent: 'center', gap: 2 },
  month: { fontSize: 10, color: b.muted, fontWeight: '700' }, day: { fontSize: 24, color: b.premium, fontWeight: '800' },
  directoryTitle: { color: b.premium, fontSize: 17, lineHeight: 23, fontWeight: '700' }, directoryDate: { color: b.muted, fontSize: 12, lineHeight: 18 },
  channelHintGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 }, channelHint: { color: b.muted, fontSize: 10 }, managerHint: { color: b.accent, fontSize: 11, fontWeight: '600', marginTop: 2 },
});
