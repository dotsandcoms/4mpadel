import { View } from 'react-native';
import type { EventDetail } from '@/lib/events';
import { registrationState } from '@/lib/event-rules';
import { EventIcon, EventText as Text, useEventAccent, type EventIconName } from './website-ui';
/** Field selection and row layout from EventDetails.jsx / Event Information. */
export function EventInformation({ event }: { event: EventDetail }) {
  const accent = useEventAccent();
  const state = registrationState(event);
  const scoring = event.scoring_point || (event.golden_point === true ? 'golden' : event.golden_point === false ? 'advantage' : null);
  const scoringLabels: Record<string, string> = { golden: 'Golden Point', silver: 'Silver Point', star: 'Star Point', advantage: 'Advantage (No Deciding Point)' };
  const rows: { label: string; value: unknown; icon: EventIconName; highlight?: boolean }[] = [
    { label: (event.venues?.length || 0) > 1 ? 'Venues' : 'Venue', value: event.venues?.length ? event.venues.join(' / ') : event.venue, icon: 'mappin.and.ellipse' },
    { label: 'Courts', value: event.courts, icon: 'rectangle.split.2x2' },
    { label: 'Organiser', value: event.organiser_name, icon: 'person' },
    { label: 'Tournament Tier', value: event.sapa_status, icon: 'rosette', highlight: true },
    { label: 'Prize Pool', value: event.prize_money_total ? `R ${Number(event.prize_money_total).toLocaleString('en-GB')}` : null, icon: 'trophy', highlight: true },
    { label: 'Back Draw', value: event.back_draw_options, icon: 'rosette' },
    { label: 'Maximum Players', value: event.is_quick_event && event.max_players ? `${event.max_players} players` : null, icon: 'person.2' },
    { label: 'Team Capacity', value: !event.is_quick_event && event.max_teams_capacity ? `${event.max_teams_capacity} teams` : null, icon: 'person' },
    { label: 'Scoring', value: scoring ? scoringLabels[scoring] || scoring : null, icon: 'rosette' },
    { label: 'Format', value: event.is_quick_event ? event.default_match_format : null, icon: 'trophy' },
    { label: 'Status', value: state === 'open' ? 'Registration Open' : state === 'not-open' ? 'Registration Opening Soon' : state === 'cancelled' ? 'Cancelled' : state === 'finished' ? 'Tournament Finished' : 'Registration Closed', icon: 'clock' },
  ];
  return <View style={{ margin: -20 }}>{rows.filter(r => r.value !== null && r.value !== undefined && r.value !== '').map(row => <View key={row.label} style={{ paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f9fafb', flexDirection: 'row', alignItems: 'center', gap: 12 }}><EventIcon name={row.icon} color="#9ca3af" size={20} /><Text style={{ color: '#374151', fontSize: 14, fontWeight: '400', flex: 1 }}>{row.label}</Text><Text numberOfLines={1} style={{ maxWidth: 150, fontSize: 14, fontWeight: '400', color: row.highlight ? accent : '#0a0a0a', textAlign: 'right' }}>{String(row.value)}</Text><EventIcon name="chevron.right" size={16} color="#d1d5db" /></View>)}</View>;
}
