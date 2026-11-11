import { Text, View } from 'react-native';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { spotlightCountdown } from '@/lib/home-feed';
import type { CalendarEvent } from '@/lib/home';
import { lightBrand as b } from '@/theme/tokens';

export function SpotlightCountdown({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  const now = useForegroundClock();
  const timer = spotlightCountdown(event, now);
  const seconds = timer.target == null ? 0 : Math.max(0, Math.floor((timer.target - now) / 1000));
  const parts = [Math.floor(seconds / 86400), Math.floor(seconds % 86400 / 3600), Math.floor(seconds % 3600 / 60), seconds % 60];
  if (compact) return <View accessible accessibilityLabel={timer.target == null ? timer.label : `${timer.label} ${parts[0]} days, ${parts[1]} hours, ${parts[2]} minutes`} style={{ flex: 1, minWidth: 104, gap: 4 }}>
    <Text style={{ color: b.muted, fontSize: 11 }}>{timer.label}</Text>
    {timer.target != null && <Text style={{ fontSize: 12, fontWeight: '600', color: b.premium, fontVariant: ['tabular-nums'] }}>{parts[0]}d {String(parts[1]).padStart(2, '0')}h {String(parts[2]).padStart(2, '0')}m {String(parts[3]).padStart(2, '0')}s</Text>}
  </View>;
  return <View accessible accessibilityLabel={timer.target == null ? timer.label : `${timer.label} ${parts[0]} days, ${parts[1]} hours, ${parts[2]} minutes`} style={{ gap: 8, padding: 12, backgroundColor: b.surface, borderRadius: 12 }}>
    <Text style={{ color: b.muted, fontSize: 12, fontWeight: '500' }}>{timer.label}</Text>
    {timer.target != null && <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {parts.map((value, index) => <View key={index} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
        <Text style={{ fontSize: 20, lineHeight: 24, color: b.premium, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{String(value).padStart(2, '0')}</Text>
        <Text style={{ color: b.muted, fontSize: 11 }}>{['Days', 'Hrs', 'Mins', 'Secs'][index]}</Text>
      </View>)}
    </View>}
  </View>;
}
