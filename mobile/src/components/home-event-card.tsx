import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ComponentProps } from 'react';
import { Text, View, type ViewStyle } from 'react-native';

import { MapPin } from '@/components/map-pin';
import { MotionBorder } from '@/components/motion-border';
import { PressableScale } from '@/components/pressable-scale';
import { PulseDot } from '@/components/pulse-dot';
import {
  eventDayParts,
  eventLocation,
  featuredBackgroundSource,
  featuredCtaLabel,
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
import { sapaLabel, sapaTone } from '@/theme/sapa';
import { brand } from '@/theme/tokens';

const MATCH_ORANGE = '#F97316';

function contrastOnAccent(accent: string) {
  return accent === '#CCFF00' || accent === '#EAB308' || accent === '#F59E0B' ? '#0a0a0a' : '#ffffff';
}

function hexRgb(hex: string) {
  const n = hex.replace('#', '');
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function mixHex(hex: string, other: string, hexWeight: number) {
  const a = hexRgb(hex);
  const b = hexRgb(other);
  const t = Math.min(1, Math.max(0, hexWeight));
  const to = (x: number) => Math.round(x).toString(16).padStart(2, '0');
  return `#${to(a.r * t + b.r * (1 - t))}${to(a.g * t + b.g * (1 - t))}${to(a.b * t + b.b * (1 - t))}`;
}

function hexAlpha(hex: string, alpha: number) {
  const { r, g, b } = hexRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Website hero CTA: 145° gloss + top sheen. RN has no gradient Button — this is a Pressable with a linear-gradient fill. */
function AccentGradientButton({
  label,
  accent,
  onPress,
}: {
  label: string;
  accent: string;
  onPress: () => void;
}) {
  const highlight = mixHex(accent, '#ffffff', 0.68);
  const shade = mixHex(accent, '#000000', 0.82);
  const color = contrastOnAccent(accent);
  const fill = {
    experimental_backgroundImage: `linear-gradient(145deg, ${highlight} 0%, ${accent} 50%, ${shade} 100%)`,
  } as ViewStyle;

  return (
    <PressableScale
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <View
        className="min-h-11 shrink-0 justify-center overflow-hidden rounded-full border px-3.5"
        style={[
          {
            borderColor: accent,
            boxShadow: `inset 0px 1px 0px rgba(255,255,255,0.28), 0px 1px 6px ${hexAlpha(accent, 0.35)}`,
          },
          fill,
        ]}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            experimental_backgroundImage:
              'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 45%, transparent 100%)',
          } as ViewStyle}
        />
        <Text className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
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
          <View className="h-px w-4 bg-edge" />
          <Text className="px-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/80">
            Now On
          </Text>
          <View className="h-px flex-1 bg-edge" />
        </View>
      ) : null}

      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${event.event_name || 'Event'}${live ? ', live' : ''}. ${location}`}
        className="overflow-hidden rounded-[16px] border border-white/5 bg-elevated">
        <View className="flex-row items-center px-4 py-3">
          <View className="min-w-0 flex-1 pr-2">
            <Text
              numberOfLines={2}
              className="text-[13px] font-bold uppercase tracking-tight text-premium">
              {event.event_name}
            </Text>
            <Text className="mt-1 text-[12px] text-muted">{when}</Text>
            {location ? (
              <View className="mt-1.5 flex-row items-center">
                <MapPin size={12} color={brand.faint} />
                <Text
                  numberOfLines={1}
                  className="ml-1 flex-1 text-[10px] font-medium uppercase tracking-widest text-muted">
                  {location}
                </Text>
              </View>
            ) : null}
            {registered > 0 ? (
              <View className="mt-1 flex-row items-center">
                <SymbolView name="person.2.fill" size={11} tintColor={tone.fill} />
                <Text className="ml-1 text-[10px] font-medium text-muted">
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
            <SymbolView name="chevron.right" size={14} tintColor={brand.padel} />
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
      <View className="w-full gap-2.5 px-4 py-4">
        <View className="flex-row items-center">
          <View className="mr-3 shrink-0 flex-row items-start self-start pt-0.5">
            <SymbolView
              name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
              size={18}
              weight="medium"
              tintColor={brand.padel}
            />
            <View className="ml-3 items-center">
              <Text
                className="text-xl font-bold leading-none text-premium"
                style={{ fontVariant: ['tabular-nums'] }}>
                {parts.day}
              </Text>
              {parts.month ? (
                <Text className="mt-1.5 text-[9px] font-black uppercase tracking-widest text-padel">
                  {parts.month}
                </Text>
              ) : null}
              {parts.weekday ? (
                <Text className="mt-0.5 text-[8px] font-bold uppercase tracking-widest text-white/40">
                  {parts.weekday}
                </Text>
              ) : null}
            </View>
          </View>

          <View className="min-w-0 flex-1">
            <View className="flex-row items-center">
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 text-sm font-bold uppercase text-premium">
                {event.event_name}
              </Text>
              {label ? (
                <View
                  className="ml-2 shrink-0 rounded-full border px-2 py-0.5"
                  style={{ borderColor: tone.border }}>
                  <Text
                    className="text-[8px] font-black uppercase tracking-widest"
                    style={{ color: tone.text }}>
                    {label}
                  </Text>
                </View>
              ) : null}
            </View>
            {location ? (
              <View className="mt-1 flex-row items-center">
                <MapPin size={12} color="rgba(255,255,255,0.4)" />
                <Text numberOfLines={1} className="ml-1 min-w-0 flex-1 text-[11px] text-white/50">
                  {location}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="ml-1 shrink-0">
            <SymbolView name="chevron.right" size={18} tintColor={brand.padel} />
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
                  accent={tone.fill}
                  cutout={brand.elevated}
                />
              ) : null}
            </View>
            {cta ? (
              <AccentGradientButton
                label={cta.label}
                accent={tone.fill}
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
      <MotionBorder>
        <View className="flex-row items-center px-3.5 py-3.5">
          {parts.month ? (
            <View
              className="h-14 w-14 shrink-0 items-center justify-center rounded-xl"
              style={{ borderWidth: 1, borderColor: 'rgba(204,255,0,0.3)' }}>
              <Text className="text-[9px] font-black uppercase tracking-widest text-padel">
                {parts.month}
              </Text>
              <Text
                className="mt-0.5 text-[20px] font-bold leading-none text-premium"
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
                  style={{ color: tone.fill }}>
                  {label}
                </Text>
              </View>
            ) : null}
            <Text
              numberOfLines={1}
              className="text-[14px] font-bold uppercase leading-tight tracking-tight text-premium">
              {title}
              {trophy ? ' 🏆' : ''}
            </Text>
            {location ? (
              <View className="mt-1 flex-row items-center">
                <MapPin size={12} color={brand.faint} />
                <Text numberOfLines={1} className="ml-1.5 flex-1 text-[10px] text-muted">
                  {location}
                </Text>
              </View>
            ) : null}
            {winner ? (
              <View className="mt-1 flex-row items-center">
                <SymbolView
                  name={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
                  size={11}
                  tintColor={tone.fill}
                />
                <Text numberOfLines={1} className="ml-1.5 flex-1 text-[10px] text-muted">
                  Winner: {winner}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </MotionBorder>
    </PressableScale>
  );
}

export function FeaturedCard({ event, onPress }: CardProps) {
  const tone = sapaTone(event.sapa_status);
  const label = sapaLabel(event.sapa_status);
  const range = formatEventRange(event.start_date, event.end_date);
  const city = (event.city || '').trim();
  const badge = featuredBadgeText(event);
  const cta = featuredCtaLabel(event);
  const name = event.event_name || 'Featured event';

  return (
    <View
      className="overflow-hidden rounded-2xl border bg-page"
      style={{ borderColor: tone.border }}>
      <Image
        source={featuredBackgroundSource(event)}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none' }}
        contentFit="cover"
        contentPosition={{ top: '28%', left: '82%' }}
        accessibilityElementsHidden
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0,0,0,0.18)',
          pointerEvents: 'none',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '58%',
          backgroundColor: 'rgba(0,0,0,0.72)',
          pointerEvents: 'none',
        }}
      />

      <View className="px-3 pt-3 pb-2.5">
        <PressableScale
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${name}. ${range}${city ? `. ${city}` : ''}`}>
          <View className="flex-row items-start justify-between">
            {label ? (
              <View
                className="rounded-full border bg-black/40 px-2 py-0.5"
                style={{ borderColor: tone.fill }}>
                <Text
                  className="text-[8px] font-black uppercase tracking-widest"
                  style={{ color: tone.fill }}>
                  {label}
                </Text>
              </View>
            ) : (
              <View />
            )}
            {badge ? <FeaturedBadgeWords text={badge} accent={tone.fill} /> : null}
          </View>

          <Text
            numberOfLines={2}
            className="mt-1.5 text-[15px] font-bold uppercase leading-snug tracking-tight text-premium">
            {event.event_name}
          </Text>

          <View className="mt-1.5 flex-row flex-wrap items-center">
            {range ? (
              <View className="mr-3 flex-row items-center">
                <SymbolView
                  name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
                  size={12}
                  tintColor={tone.fill}
                />
                <Text
                  className="ml-1 text-[11px] font-bold uppercase"
                  style={{ color: tone.fill }}>
                  {range}
                </Text>
              </View>
            ) : null}
            {city ? (
              <View className="flex-row items-center">
                <MapPin size={12} color={tone.fill} />
                <Text
                  numberOfLines={1}
                  className="ml-1 text-[11px] font-bold uppercase"
                  style={{ color: tone.fill }}>
                  {city}
                </Text>
              </View>
            ) : null}
          </View>
        </PressableScale>

        <View className="mt-2.5 flex-row items-end">
          <View className="min-w-0 flex-1 pr-2">
            <RegCountdown
              opensAt={event.registration_opens_at}
              closesAt={event.registration_closes_at}
              accent={tone.fill}
              cutout={brand.page}
              compact
            />
          </View>
          <PressableScale
            onPress={onPress}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={cta}
            className="h-9 shrink-0 flex-row items-center justify-center rounded-full bg-padel pl-3.5 pr-3">
            <Text className="text-[10px] font-black uppercase tracking-wide text-black">
              {cta}
            </Text>
            {cta !== 'View' ? (
              <View className="ml-1">
                <SymbolView
                  name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
                  size={11}
                  tintColor="#000"
                />
              </View>
            ) : null}
          </PressableScale>
        </View>
      </View>
    </View>
  );
}

function featuredBadgeText(event: CalendarEvent) {
  const custom = event.organiser_badge_text?.trim();
  if (custom) return custom;
  const status = event.sapa_status?.trim();
  if (!status || status.toLowerCase() === 'none') return '';
  const pts = event.points ? ` ${event.points}` : '';
  return `SAPA ${status}${pts}`;
}

function FeaturedBadgeWords({ text, accent }: { text: string; accent: string }) {
  return (
    <Text className="shrink-0 text-right text-[9px] font-black uppercase tracking-wide">
      {text.split(/\s+/).map((word, i) => {
        const tier = /^(gold|silver|bronze|major|super)$/i.test(word);
        return (
          <Text key={`${word}-${i}`} style={{ color: tier ? accent : '#fff' }}>
            {i > 0 ? ' ' : ''}
            {word}
          </Text>
        );
      })}
    </Text>
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
  const icon = kind === 'profile' ? 'person.fill' : 'creditcard.fill';

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}. ${detail}`}
      className="mb-2 flex-row items-center rounded-xl border border-edge bg-white/5 px-3.5 py-3">
      <View className="h-9 w-9 items-center justify-center rounded-full border border-padel/50 bg-padel/10">
        <SymbolView name={icon} size={15} tintColor={brand.padel} />
      </View>
      <View className="ml-3 min-w-0 flex-1">
        <Text className="text-[14px] font-bold text-premium">{title}</Text>
        <Text numberOfLines={1} className="mt-0.5 text-[12px] text-white/50">
          {subtitle}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[12px] font-bold text-padel">
          {detail}
        </Text>
      </View>
      <SymbolView name="chevron.right" size={14} tintColor={brand.padel} />
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
}: {
  label: string;
  target: number;
  accent: string;
  cutout?: string;
  compact?: boolean;
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
      className={`relative self-start rounded-lg border px-2.5 pb-1.5 pt-2.5 ${compact ? '' : 'mt-3'}`}
      style={{ borderColor: `${accent}80` }}>
      <Text
        className="absolute -top-1.5 left-2 px-1 text-[8px] font-bold uppercase tracking-wider"
        style={{ color: accent, backgroundColor: cutout }}>
        {label}
      </Text>
      <View className="flex-row items-end">
        {parts.map((part, i) => (
          <View key={part.unit} className="flex-row items-end">
            {i > 0 ? (
              <Text className="px-1 pb-1.5 text-[12px] font-bold text-white/40">:</Text>
            ) : null}
            <View className="min-w-[1.6rem] items-center">
              <Text
                className="text-sm font-black leading-none text-premium"
                style={{ fontVariant: ['tabular-nums'] }}>
                {part.value}
              </Text>
              <Text className="mt-0.5 text-[7px] font-bold tracking-wider text-white/50">
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
  return <CountdownBox label="Event starts in" target={start} accent={accent} cutout={cutout} />;
}

function useMatchTiming(dateStr?: string | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  return matchTiming(parseMatchDate(dateStr), dateStr, now);
}

function RegCountdown({
  opensAt,
  closesAt,
  accent,
  cutout = brand.elevated,
  compact = false,
}: {
  opensAt: string | null;
  closesAt: string | null;
  accent: string;
  cutout?: string;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const opens = opensAt ? new Date(opensAt).getTime() : NaN;
  const closes = closesAt ? new Date(closesAt).getTime() : NaN;
  let label: string | null = null;
  let target = 0;
  if (Number.isFinite(opens) && opens > now) {
    label = 'Registration opens in';
    target = opens;
  } else if (Number.isFinite(closes) && closes > now) {
    label = 'Registration closes in';
    target = closes;
  }
  if (!label) return null;

  return (
    <CountdownBox
      label={label}
      target={target}
      accent={accent}
      cutout={cutout}
      compact={compact}
    />
  );
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
      className={`rounded-2xl border border-edge bg-white/5 px-4 py-5 ${
        centered ? 'items-center' : ''
      }`}>
      {icon ? (
        <View className="mb-2" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SymbolView name={icon} size={28} weight="light" tintColor="rgba(255,255,255,0.2)" />
        </View>
      ) : null}
      <Text
        className={`text-sm font-bold text-premium ${centered ? 'text-center' : ''}`}>
        {title}
      </Text>
      <Text
        className={`mt-1 text-[11px] font-medium leading-4 text-white/50 ${
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
              centered ? 'text-xs font-bold text-padel' : 'text-[13px] font-bold text-black'
            }>
            {actionLabel}
          </Text>
          {centered ? <SymbolView name="chevron.right" size={14} tintColor={brand.padel} /> : null}
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
      className="overflow-hidden rounded-[16px] border bg-elevated p-3.5"
      style={{ borderColor: 'rgba(249,115,22,0.35)' }}>
      <View className="flex-row items-start justify-between border-b border-white/5 pb-2">
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
                  : 'rgba(255,255,255,0.7)',
              fontVariant: ['tabular-nums'],
            }}>
            {timing.label}
          </Text>
        ) : null}
      </View>

      <View className="flex-row items-center py-3">
        <View className="min-w-0 flex-1 items-end">
          <Text numberOfLines={1} className="w-full text-right text-[13px] font-semibold uppercase text-premium">
            {info.Challenger?.Name || 'TBD'}
          </Text>
          {team1P2 ? (
            <Text numberOfLines={1} className="mt-0.5 w-full text-right text-[11px] uppercase text-white/70">
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
          <Text numberOfLines={1} className="w-full text-[13px] font-semibold uppercase text-premium">
            {info.Challenged?.Name || 'TBD'}
          </Text>
          {team2P2 ? (
            <Text numberOfLines={1} className="mt-0.5 w-full text-[11px] uppercase text-white/70">
              {team2P2}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row items-center justify-between border-t border-white/5 pt-2">
        <View className="min-w-0 flex-1 flex-row items-center">
          <MapPin size={12} color={brand.padel} />
          <Text numberOfLines={1} className="ml-1.5 text-[12px] uppercase text-white/70">
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
        <Text numberOfLines={1} className="text-[13px] font-bold uppercase text-premium">
          {info.EventName || 'Match'}
        </Text>
        <Text numberOfLines={1} className="mt-1 text-[12px] text-white/50">
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
            className="ml-1 min-w-[20px] items-center rounded-lg border border-white/5 bg-white/[0.04] px-1.5 py-1">
            <Text
              className="text-[9px] font-black"
              style={{ color: set.Score1 > set.Score2 ? brand.padel : 'rgba(255,255,255,0.6)' }}>
              {set.Score1}
            </Text>
            <View className="my-0.5 h-px w-full bg-white/10" />
            <Text
              className="text-[9px] font-black"
              style={{ color: set.Score2 > set.Score1 ? brand.padel : 'rgba(255,255,255,0.6)' }}>
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
