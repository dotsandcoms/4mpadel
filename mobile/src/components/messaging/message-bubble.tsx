import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { eventRoleLabel, type ChatCard, type ChatKind, type ChatMessage } from '@/lib/messaging';
import { ChatAvatar, chatDate } from './ui';
import { lightBrand as b } from '@/theme/tokens';

function Sender({ message, kind }: { message: ChatMessage; kind: ChatKind }) {
  const role = message.sender.role;
  const roleTheme = role === 'admin' ? { ink: '#27517B', fill: '#EAF1FA', edge: '#D2E0EF' }
    : role === 'organiser' ? { ink: '#47632C', fill: '#EDF3E4', edge: '#D6E2C5' }
    : { ink: b.muted, fill: b.surface, edge: b.edge };
  return <View style={[styles.sender, { justifyContent: message.mine && kind !== 'event_announcements' ? 'flex-end' : 'flex-start' }]}>
    <ChatAvatar name={message.sender.name} image={message.sender.image} size={kind === 'event_announcements' ? 36 : 30} />
    <Text style={styles.senderName}>{message.mine ? 'You' : message.sender.name}</Text>
    {kind !== 'direct' && <View style={[styles.role, { backgroundColor: roleTheme.fill, borderColor: roleTheme.edge }]}><Text numberOfLines={1} style={[styles.roleText, { color: roleTheme.ink }]}>{eventRoleLabel(role)}</Text></View>}
  </View>;
}

export function MessageBubble({ message, kind, onOptions, onCardPress }: { message: ChatMessage; kind: ChatKind; onOptions: () => void; onCardPress: (card: ChatCard) => void }) {
  const announcement = kind === 'event_announcements';
  const audience = message.audience?.all ? 'All registered players' : message.audience?.divisions.join(' · ');
  const date = new Date(message.createdAt);
  const stamp = date.toDateString() === new Date().toDateString() ? chatDate(message.createdAt)
    : `${chatDate(message.createdAt)} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return <View style={[styles.row, { alignItems: message.mine && !announcement ? 'flex-end' : 'flex-start' }]}>
    {!announcement && <View style={styles.chatSender}><Sender message={message} kind={kind} /></View>}
    <Pressable accessibilityRole="button" accessibilityLabel={`${message.mine ? 'You, ' : ''}${message.sender.name}${kind !== 'direct' ? ', ' + eventRoleLabel(message.sender.role) : ''}.${!message.deleted && audience ? ` Audience: ${audience}.` : ''} ${message.deleted ? 'Message removed' : message.body || message.card?.title || ''}. ${stamp}. Hold for message options.`}
      onLongPress={() => { if (!message.deleted) onOptions(); }} delayLongPress={350}
      style={[styles.bubble, announcement ? styles.announcement : message.mine ? styles.outgoing : styles.incoming]}>
      {announcement && <Sender message={message} kind={kind} />}
      {!!audience && !message.deleted && <View style={styles.audience}><Ionicons name={message.audience?.all ? 'people-outline' : 'funnel-outline'} size={13} color="#456787" /><Text style={styles.audienceText}>{audience}</Text></View>}
      {message.reply && !message.deleted && <View style={styles.quote}><Text style={styles.quoteName}>{message.reply.mine ? 'You' : message.reply.name}{kind !== 'direct' ? ` · ${eventRoleLabel(message.reply.role)}` : ''}</Text><Text numberOfLines={2} style={styles.quoteBody}>{message.reply.body}</Text></View>}
      {message.deleted ? <Text style={styles.removed}>Message removed</Text> : !!message.body && <Text style={styles.body}>{message.body}</Text>}
      {message.card && !message.deleted && <Pressable accessibilityRole="link" accessibilityLabel={`Open ${message.card.title}`} onPress={() => onCardPress(message.card!)} style={styles.card}><Ionicons name="calendar-outline" size={21} color={b.accent} /><Text style={styles.cardTitle}>{message.card.title}</Text><Text style={styles.cardDetail}>{message.card.date?.slice(0, 10)} · {message.card.tab} ↗</Text></Pressable>}
      <Text style={styles.timestamp}>{stamp}{message.mine && !message.deleted ? ' · Sent' : ''}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  row: { width: '100%', marginVertical: 7, gap: 7 },
  // Sender identity gets its own known-width row; short text cannot squeeze it.
  chatSender: { width: '88%', paddingHorizontal: 3 },
  sender: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 9 },
  senderName: { flexShrink: 1, minWidth: 0, color: b.premium, fontWeight: '700', fontSize: 13, lineHeight: 18 },
  role: { flexShrink: 0, alignSelf: 'center', borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  roleText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  bubble: { gap: 9, borderWidth: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderRadius: 17 },
  announcement: { width: '100%', backgroundColor: b.elevated, borderColor: b.edge, padding: 16, gap: 12 },
  incoming: { maxWidth: '88%', minWidth: 126, borderBottomLeftRadius: 5, backgroundColor: b.elevated, borderColor: b.edge },
  outgoing: { maxWidth: '88%', minWidth: 126, borderBottomRightRadius: 5, backgroundColor: '#E5EDDA', borderColor: '#D5E1C3' },
  body: { color: b.premium, fontSize: 16, lineHeight: 24 },
  audience: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  audienceText: { flex: 1, color: '#456787', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  quote: { borderLeftWidth: 3, borderColor: '#A1B483', paddingLeft: 10, gap: 3 },
  quoteName: { color: b.accent, fontWeight: '700', fontSize: 11, lineHeight: 17 },
  quoteBody: { color: b.muted, fontSize: 13, lineHeight: 19 },
  timestamp: { color: b.muted, fontSize: 10, lineHeight: 15, textAlign: 'right', marginTop: 1 },
  removed: { color: b.muted, fontSize: 14, lineHeight: 21, fontStyle: 'italic' },
  card: { backgroundColor: '#F0F4EA', borderRadius: 11, padding: 12, gap: 5 },
  cardTitle: { color: b.premium, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  cardDetail: { color: b.muted, fontSize: 12, lineHeight: 18 },
});
