import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MapPin } from '@/components/map-pin';
import { PressableScale } from '@/components/pressable-scale';
import { PulseDot } from '@/components/pulse-dot';
import {
  eventDayParts,
  eventLocation,
  featuredBackgroundSource,
  resolveFeaturedCta,
  formatEventRange,
  parseDay,
  resolveScheduleEntryCta,
  type CalendarEvent,
} from '@/lib/home';
import {
  isMatchWinner,
  parseMatchDate,
  type PlayerMatch,
} from '@/lib/matches';
import { formatHomeWhen, matchTiming } from '@/lib/when';
import { sapaLabel, lightSapaTone as sapaTone } from '@/theme/sapa';
import { lightBrand as brand } from '@/theme/tokens';
import { EventNotificationBell } from '@/components/events/follow-tournament';

const MATCH_ORANGE = '#F97316';

function contrastOnAccent(accent: string) {
  return accent === '#CCFF00' || accent === '#EAB308' || accent === '#F59E0B' ? '#0a0a0a' : '#ffffff';
}

function AccentGradientButton({ label, accent, onPress, compact = false }: {
  label: string; accent: string; onPress: () => void; compact?: boolean;
}) {
  return <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    style={{ minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
      backgroundColor: accent, justifyContent: 'center', alignItems: 'center' }}>
    <Text style={{ color: contrastOnAccent(accent), fontSize: compact ? 12 : 14, fontWeight: '600' }}>{label}</Text>
  </PressableScale>;
}

type CardProps = {
  event: CalendarEvent;
  live?: boolean;
  showLabel?: boolean;
  showStartCountdown?: boolean;
  onPress: () => void;
  onCta?: () => void;
};

/** Happening-now row — date block, venue, registration count, LIVE + tier. */
export function NowOnCard({ event, live = true, showLabel = true, onPress }: CardProps) {
  const tone = sapaTone(event.sapa_status);
  const label = sapaLabel(event.sapa_status);
  const location = eventLocation(event);
  const registered = Number(event.registered_players || 0);
  const start = parseDay(event.start_date);
  const when = start ? formatHomeWhen(start, event.start_date) : '';

  return (
    <View>
      {showLabel ? (
        <View className="mb-2 flex-row items-center">
          <View className="h-px w-4 bg-court-edge" />
          <Text className="px-2 text-[9px] font-bold uppercase tracking-[0.2em] text-court-muted">
            Now On
          </Text>
          <View className="h-px flex-1 bg-court-edge" />
        </View>
      ) : null}

      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${event.event_name || 'Event'}${live ? ', live' : ''}. ${location}`}
        className="overflow-hidden rounded-[16px] border border-court-edge bg-court-elevated">
        <View className="flex-row items-center px-4 py-3">
          <View className="min-w-0 flex-1 pr-2">
            <Text
              numberOfLines={2}
              className="text-[13px] font-bold uppercase tracking-tight text-court-ink">
              {event.event_name}
            </Text>
            <Text className="mt-1 text-[12px] text-court-muted">{when}</Text>
            {location ? (
              <View className="mt-1.5 flex-row items-center">
                <MapPin size={12} color={brand.faint} />
                <Text
                  numberOfLines={1}
                  className="ml-1 flex-1 text-[10px] font-medium uppercase tracking-widest text-court-muted">
                  {location}
                </Text>
              </View>
            ) : null}
            {registered > 0 ? (
              <View className="mt-1 flex-row items-center">
                <SymbolView name="person.2.fill" size={11} tintColor={tone.text} />
                <Text className="ml-1 text-[10px] font-medium text-court-muted">
                  {registered} Registered
                </Text>
              </View>
            ) : null}
          </View>

          <View className="items-end justify-between self-stretch py-0.5">
            {live ? (
              <View className="flex-row items-center">
                <PulseDot color={brand.sa.red} size={6} />
                <Text className="ml-1.5 text-[8px] font-black uppercase tracking-widest text-sa-red">
                  Live
                </Text>
              </View>
            ) : (
              <View />
            )}
            <EventNotificationBell eventId={event.id} eventName={event.event_name || 'Tournament'} />
            <SymbolView name="chevron.right" size={14} tintColor={brand.accent} />
            {label ? (
              <View
                className="rounded-full border px-1.5 py-[2px]"
                style={{ borderColor: tone.border }}>
                <Text
                  className="text-[7px] font-black uppercase tracking-widest"
                  style={{ color: tone.text }}>
                  {label}
                </Text>
              </View>
            ) : (
              <View />
            )}
          </View>
        </View>
      </PressableScale>
    </View>
  );
}

/** My Schedule event row — date block, venue, countdown and entry CTA from the website hero. */
export function EventRow({ event, showStartCountdown = false, onPress, onCta }: CardProps) {
  const tone = sapaTone(event.sapa_status);
  const label = sapaLabel(event.sapa_status);
  const location = eventLocation(event);
  const parts = eventDayParts(event.start_date);
  const cta = showStartCountdown ? resolveScheduleEntryCta(event) : null;

  return (
    <View className="w-full">
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.event_name || 'Event'}. ${parts.weekday} ${parts.day} ${parts.month}. ${location}`}>
      <View className="w-full gap-2 px-3.5 py-3">
        <View className="flex-row items-center">
          <View className="mr-2.5 shrink-0 flex-row items-start self-start pt-0.5">
            <SymbolView
              name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
              size={16}
              weight="medium"
              tintColor={brand.accent}
            />
            <View className="ml-2 items-center">
              <Text
                className="text-[18px] font-medium leading-none text-court-ink"
                style={{ fontVariant: ['tabular-nums'] }}>
                {parts.day}
              </Text>
              {parts.month ? (
                <Text className="mt-1.5 text-[9px] font-normal uppercase tracking-widest text-court-accent">
                  {parts.month}
                </Text>
              ) : null}
              {parts.weekday ? (
                <Text className="mt-0.5 text-[8px] font-normal uppercase tracking-widest text-court-muted">
                  {parts.weekday}
                </Text>
              ) : null}
            </View>
          </View>

          <View className="min-w-0 flex-1">
            <View className="flex-row items-center">
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 text-[13px] font-normal uppercase text-court-ink">
                {event.event_name}
              </Text>
              {label ? (
                <View
                  className="ml-2 shrink-0 rounded-full border px-2 py-0.5"
                  style={{ borderColor: tone.border }}>
                  <Text
                    className="text-[8px] font-normal uppercase tracking-widest"
                    style={{ color: tone.text }}>
                    {label}
                  </Text>
                </View>
              ) : null}
            </View>
            {location ? (
              <View className="mt-1 flex-row items-center">
                <MapPin size={12} color="rgba(22,37,31,0.4)" />
                <Text numberOfLines={1} className="ml-1 min-w-0 flex-1 text-[11px] text-court-muted">
                  {location}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="ml-1 shrink-0 flex-row items-center">
            <EventNotificationBell eventId={event.id} eventName={event.event_name || 'Tournament'} />
            <SymbolView name="chevron.right" size={16} tintColor={brand.accent} />
          </View>
        </View>

        {showStartCountdown || cta ? (
          <View
            className="w-full flex-row items-center"
            style={{ justifyContent: 'space-between', gap: 8 }}>
            <View className="min-w-0 flex-1">
              {showStartCountdown ? (
                <EventStartsCountdown
                  startDate={event.start_date}
                  accent={label ? tone.text : brand.premium}
                  cutout={brand.elevated}
                />
              ) : null}
            </View>
            {cta ? (
              <AccentGradientButton
                compact
                label={cta.label}
                accent={label ? tone.text : brand.premium}
                onPress={onCta ?? onPress}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </PressableScale>
    </View>
  );
}

export function RecentResultCard({ event, onPress }: CardProps) {
  const tone = sapaTone(event.sapa_status);
  const label = sapaLabel(event.sapa_status);
  const parts = eventDayParts(event.start_date);
  const location = eventLocation(event);
  const rawTitle = event.event_name || 'Result';
  const title = rawTitle.replace('🏆', '').trim();
  const trophy =
    rawTitle.includes('🏆') || /open|cup|1000/i.test(title);
  const winner = event.winnerName?.trim();

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${winner ? `. Winner ${winner}` : ''}. ${location}`}>
      <View style={{ backgroundColor: brand.elevated, borderRadius: 16, borderWidth: 1, borderColor: brand.edge }}>
        <View className="flex-row items-center px-3.5 py-3.5">
          {parts.month ? (
            <View
              className="h-14 w-14 shrink-0 items-center justify-center rounded-xl"
              style={{ borderWidth: 1, borderColor: brand.edge, backgroundColor: brand.surface }}>
              <Text className="text-[9px] font-black uppercase tracking-widest text-court-accent">
                {parts.month}
              </Text>
              <Text
                className="mt-0.5 text-[20px] font-bold leading-none text-court-ink"
                style={{ fontVariant: ['tabular-nums'] }}>
                {parts.day}
              </Text>
            </View>
          ) : null}

          <View className={`${parts.month ? 'ml-3.5' : ''} min-w-0 flex-1`}>
            {label ? (
              <View
                className="mb-1.5 self-start rounded-full border px-2 py-0.5"
                style={{ borderColor: tone.border }}>
                <Text
                  className="text-[8px] font-black uppercase tracking-widest"
                  style={{ color: tone.text, backgroundColor: tone.bg }}>
                  {label}
                </Text>
              </View>
            ) : null}
            <Text
              numberOfLines={2}
              className="text-[16px] font-bold leading-tight text-court-ink">
              {title}
              {trophy ? ' 🏆' : ''}
            </Text>
            {location ? (
              <View className="mt-1 flex-row items-center">
                <MapPin size={12} color={brand.faint} />
                <Text numberOfLines={2} className="ml-1.5 flex-1 text-[12px] text-court-muted">
                  {location}
                </Text>
              </View>
            ) : null}
            {winner ? (
              <View className="mt-1 flex-row items-center">
                <SymbolView
                  name={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
                  size={11}
                  tintColor={tone.text}
                />
                <Text numberOfLines={2} className="ml-1.5 flex-1 text-[12px] text-court-muted">
                  Winner: <Text style={{ fontWeight: '700' }}>{winner}</Text>
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

export function FeaturedCard({ event, onPress, onCta }: CardProps) {
  const poster = event.poster_image_url?.trim();
  const posterKey = `${event.id}:${poster ?? ''}`;
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  const showPoster = !!poster && failedPoster !== posterKey;
  const label = sapaLabel(event.sapa_status);
  const range = formatEventRange(event.start_date, event.end_date);
  const name = event.event_name || 'Featured event';
  const cta = resolveFeaturedCta(event);
  return (
    <View style={{ borderRadius: 20, backgroundColor: brand.elevated, borderWidth: 1, borderColor: brand.edge, padding: 12, flexDirection: 'row', gap: 12 }}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`View ${name}`} style={{ width: 82, alignSelf: 'stretch', minHeight: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: brand.surface }}>
        <Image
          key={showPoster ? posterKey : `default-${event.id}`}
          source={showPoster ? { uri: poster } : featuredBackgroundSource(event)}
          contentFit={showPoster ? 'contain' : 'cover'}
          onError={showPoster ? () => setFailedPoster(posterKey) : undefined}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
        />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}. ${range}. ${event.city || ''}`} style={{ gap: 5 }}>
          <Text numberOfLines={2} style={{ color: brand.accent, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>{event.organiser_badge_text?.trim() || (label ? `SAPA ${label.toUpperCase()}` : '4M TOURNAMENT')}</Text>
          <Text numberOfLines={2} style={{ color: brand.premium, fontSize: 17, fontWeight: '700', lineHeight: 21 }}>{name}</Text>
          <Text style={{ color: brand.muted, fontSize: 11, lineHeight: 15 }}>{range}</Text>
          {!!event.city && <Text numberOfLines={1} style={{ color: brand.muted, fontSize: 11 }}>{event.city}</Text>}
        </Pressable>
        <View style={{ paddingTop: 7 }}>
          <RegCountdown opensAt={event.registration_opens_at} closesAt={event.registration_closes_at} accent={brand.accent} />
        </View>
        <PressableScale onPress={onCta ?? onPress} accessibilityRole="button" accessibilityLabel={`${cta.label}: ${name}`} style={{ backgroundColor: brand.padel, minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: brand.premium, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{cta.label}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

export function PendingRow({
  title,
  subtitle,
  detail,
  kind = 'payment',
  onPress,
}: {
  title: string;
  subtitle: string;
  detail: string;
  kind?: 'payment' | 'profile';
  onPress: () => void;
}) {
  const icon = kind === 'profile'
    ? { ios: 'person.fill', android: 'person', web: 'person' } as const
    : { ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' } as const;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}. ${detail}`}
      className="mb-2 flex-row items-center rounded-xl border border-court-edge bg-court-elevated px-3.5 py-3">
      <View className="h-8 w-8 items-center justify-center rounded-full border border-padel/50 bg-padel/10">
        <SymbolView name={icon} size={15} tintColor={brand.accent} />
      </View>
      <View className="ml-3 min-w-0 flex-1">
        <Text className="text-[13px] font-normal text-court-ink">{title}</Text>
        <Text numberOfLines={1} className="mt-0.5 text-[12px] text-court-muted">
          {subtitle}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[11px] font-normal text-court-accent">
          {detail}
        </Text>
      </View>
      <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={brand.accent} />
    </PressableScale>
  );
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function CountdownBox({
  label,
  target,
  accent,
  cutout = brand.elevated,
  compact = false,
  fullWidth = false,
}: {
  label: string;
  target: number;
  accent: string;
  cutout?: string;
  compact?: boolean;
  fullWidth?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = target - now;
  if (diff <= 0) return null;

  const parts = [
    { value: pad2(Math.floor(diff / 86400000)), unit: 'DAYS' },
    { value: pad2(Math.floor((diff / 3600000) % 24)), unit: 'HRS' },
    { value: pad2(Math.floor((diff / 60000) % 60)), unit: 'MINS' },
    { value: pad2(Math.floor((diff / 1000) % 60)), unit: 'SECS' },
  ];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`relative rounded-lg border px-2.5 pb-1.5 pt-2.5 ${compact ? '' : 'mt-3'}`}
      style={{ borderColor: `${accent}80`, alignSelf: fullWidth ? 'stretch' : 'flex-start' }}>
      <Text
        className="absolute -top-1.5 left-2 px-1 text-[8px] font-normal uppercase tracking-wider"
        style={{ color: accent, backgroundColor: cutout }}>
        {label}
      </Text>
      <View className="flex-row items-end">
        {parts.map((part, i) => (
          <View key={part.unit} className="flex-row items-end" style={fullWidth ? { flex: 1, justifyContent: 'center' } : undefined}>
            {i > 0 ? (
              <Text className="px-1 pb-1.5 text-[12px] font-normal text-court-muted" style={fullWidth ? { position: 'absolute', left: -5, bottom: 0 } : undefined}>:</Text>
            ) : null}
            <View className="min-w-[1.6rem] items-center">
              <Text
                className="text-[13px] font-medium leading-none text-court-ink"
                style={{ fontVariant: ['tabular-nums'] }}>
                {part.value}
              </Text>
              <Text className="mt-0.5 text-[7px] font-normal tracking-wider text-court-muted">
                {part.unit}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function EventStartsCountdown({
  startDate,
  accent,
  cutout,
}: {
  startDate: string | null;
  accent: string;
  cutout?: string;
}) {
  const start = startDate ? new Date(startDate).getTime() : NaN;
  if (!Number.isFinite(start)) return null;
  return <CountdownBox compact label="Event starts in" target={start} accent={accent} cutout={cutout} />;
}

function useMatchTiming(dateStr?: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  return matchTiming(parseMatchDate(dateStr), dateStr, now);
}

function RegCountdown({ opensAt, closesAt, accent }: {
  opensAt: string | null; closesAt: string | null; accent: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const opens = opensAt ? new Date(opensAt).getTime() : NaN;
  const closes = closesAt ? new Date(closesAt).getTime() : NaN;
  const opening = Number.isFinite(opens) && opens > now;
  const target = opening ? opens : closes;
  const diff = target - now;
  if (!Number.isFinite(diff) || diff <= 0) return <Text style={{ color: brand.muted, fontSize: 10 }}>{Number.isFinite(closes) ? 'Registration closed' : 'Tournament details'}</Text>;
  return <CountdownBox
    label={`Registration ${opening ? 'opens' : 'closes'} in`}
    target={target}
    accent={accent}
    cutout={brand.elevated}
    compact
    fullWidth
  />;
}

export function EmptyBlock({
  title,
  body,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ComponentProps<typeof SymbolView>['name'];
}) {
  const centered = Boolean(icon);

  return (
    <View
      className={`rounded-2xl border border-court-edge bg-court-surface px-4 py-5 ${
        centered ? 'items-center' : ''
      }`}>
      {icon ? (
        <View className="mb-2" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SymbolView name={icon} size={28} weight="light" tintColor="rgba(22,37,31,0.2)" />
        </View>
      ) : null}
      <Text
        className={`text-sm font-bold text-court-ink ${centered ? 'text-center' : ''}`}>
        {title}
      </Text>
      <Text
        className={`mt-1 text-[11px] font-medium leading-4 text-court-muted ${
          centered ? 'text-center' : ''
        }`}>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <PressableScale
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          className={
            centered
              ? 'mt-3 min-h-11 flex-row items-center justify-center gap-1'
              : 'mt-3 h-11 items-center justify-center rounded-full bg-padel'
          }>
          <Text
            className={
              centered ? 'text-xs font-bold text-court-accent' : 'text-[13px] font-bold text-black'
            }>
            {actionLabel}
          </Text>
          {centered ? <SymbolView name="chevron.right" size={14} tintColor={brand.accent} /> : null}
        </PressableScale>
      ) : null}
    </View>
  );
}

export function NextMatchCard({
  match,
  onPress,
}: {
  match: PlayerMatch;
  onPress: () => void;
}) {
  const info = match.Info || {};
  const team1P2 = info.Challenger1?.Name;
  const team2P2 = info.Challenged1?.Name;
  const place = info.Location || info.Venue || 'Location TBD';
  const timing = useMatchTiming(info.Date);
  const live = timing.kind === 'live';

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${live ? 'Live now' : timing.label}. ${info.EventName || 'match'}. ${info.Challenger?.Name || 'TBD'} versus ${info.Challenged?.Name || 'TBD'}`}
      className="overflow-hidden rounded-[16px] border bg-court-elevated p-3.5"
      style={{ borderColor: 'rgba(249,115,22,0.35)' }}>
      <View className="flex-row items-start justify-between border-b border-court-edge pb-2">
        <View className="min-w-0 flex-1 flex-row items-center">
          <PulseDot color={live ? brand.sa.red : MATCH_ORANGE} size={6} />
          <Text
            numberOfLines={1}
            className="ml-1.5 text-[12px] font-bold uppercase tracking-widest"
            style={{ color: live ? brand.sa.red : MATCH_ORANGE }}>
            {info.EventName || 'Next up'}
          </Text>
        </View>
        {timing.label ? (
          <Text
            className="ml-2 shrink-0 text-[12px] font-medium"
            style={{
              color: live
                ? brand.sa.red
                : timing.kind === 'imminent'
                  ? MATCH_ORANGE
                  : 'rgba(22,37,31,0.7)',
              fontVariant: ['tabular-nums'],
            }}>
            {timing.label}
          </Text>
        ) : null}
      </View>

      <View className="flex-row items-center py-3">
        <View className="min-w-0 flex-1 items-end">
          <Text numberOfLines={1} className="w-full text-right text-[13px] font-semibold uppercase text-court-ink">
            {info.Challenger?.Name || 'TBD'}
          </Text>
          {team1P2 ? (
            <Text numberOfLines={1} className="mt-0.5 w-full text-right text-[11px] uppercase text-court-muted">
              {team1P2}
            </Text>
          ) : null}
        </View>
        <View
          className="mx-3 h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: MATCH_ORANGE }}>
          <Text className="text-[10px] font-bold text-black">VS</Text>
        </View>
        <View className="min-w-0 flex-1 items-start">
          <Text numberOfLines={1} className="w-full text-[13px] font-semibold uppercase text-court-ink">
            {info.Challenged?.Name || 'TBD'}
          </Text>
          {team2P2 ? (
            <Text numberOfLines={1} className="mt-0.5 w-full text-[11px] uppercase text-court-muted">
              {team2P2}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-center justify-between border-t border-court-edge pt-2">
        <View className="min-w-0 flex-1 flex-row items-center">
          <MapPin size={12} color={brand.accent} />
          <Text numberOfLines={1} className="ml-1.5 text-[12px] uppercase text-court-muted">
            {place}
          </Text>
        </View>
        {info.Court ? (
          <Text
            className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
            style={{
              color: MATCH_ORANGE,
              backgroundColor: 'rgba(249,115,22,0.1)',
              borderWidth: 1,
              borderColor: 'rgba(249,115,22,0.25)',
            }}>
            {info.Court}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );
}

export function MatchRow({
  match,
  showResult,
  onPress,
}: {
  match: PlayerMatch;
  showResult?: boolean;
  onPress: () => void;
}) {
  const info = match.Info || {};
  const date = parseMatchDate(info.Date);
  const when = date.getTime() ? formatHomeWhen(date, info.Date) : '';
  const winner = isMatchWinner(match);
  const sets = match.Score?.Score ?? [];
  const vs = `${info.Challenger?.Name || 'TBD'} vs ${info.Challenged?.Name || 'TBD'}`;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${info.EventName || 'Match'}. ${vs}. ${when}`}
      className="flex-row items-center px-4 py-3.5">
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[13px] font-bold uppercase text-court-ink">
          {info.EventName || 'Match'}
        </Text>
        <Text numberOfLines={1} className="mt-1 text-[12px] text-court-muted">
          {[when, vs].filter(Boolean).join('  ·  ')}
        </Text>
      </View>
      {showResult ? <MatchResult sets={sets} winner={winner} /> : null}
      <SymbolView name="chevron.right" size={14} tintColor={MATCH_ORANGE} />
    </PressableScale>
  );
}

function MatchResult({
  sets,
  winner,
}: {
  sets: { Score1: number; Score2: number }[];
  winner?: boolean;
}) {
  if (!sets.length) {
    if (winner === undefined) return null;
    return (
      <Text
        className="mr-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest"
        style={{
          color: winner ? '#34D399' : brand.danger,
          backgroundColor: winner ? 'rgba(16,185,129,0.1)' : 'rgba(230,133,119,0.1)',
        }}>
        {winner ? 'Win' : 'Loss'}
      </Text>
    );
  }

  return (
    <View className="mr-2 items-end">
      <View className="flex-row">
        {sets.map((set, i) => (
          <View
            key={`${set.Score1}-${set.Score2}-${i}`}
            className="ml-1 min-w-[20px] items-center rounded-lg border border-court-edge bg-court-surface px-1.5 py-1">
            <Text
              className="text-[9px] font-black"
              style={{ color: set.Score1 > set.Score2 ? brand.accent : 'rgba(22,37,31,0.6)' }}>
              {set.Score1}
            </Text>
            <View className="my-0.5 h-px w-full bg-court-surface" />
            <Text
              className="text-[9px] font-black"
              style={{ color: set.Score2 > set.Score1 ? brand.accent : 'rgba(22,37,31,0.6)' }}>
              {set.Score2}
            </Text>
          </View>
        ))}
      </View>
      {winner !== undefined ? (
        <Text
          className="mt-1 rounded-full px-2 py-0.5 text-[7px] font-black uppercase tracking-widest"
          style={
            winner
              ? { backgroundColor: brand.padel, color: '#000' }
              : { backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444' }
          }>
          {winner ? 'Victory' : 'Defeat'}
        </Text>
      ) : null}
    </View>
  );
}
