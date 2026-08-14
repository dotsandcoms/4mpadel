import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { PulseDot } from '@/components/pulse-dot';
import {
  eventDayParts,
  eventLocation,
  formatEventRange,
  type CalendarEvent,
} from '@/lib/home';
import {
  isMatchWinner,
  matchDayParts,
  type PlayerMatch,
} from '@/lib/matches';
import { sapaLabel, sapaTone } from '@/theme/sapa';
import { brand } from '@/theme/tokens';

const MATCH_ORANGE = '#F97316';

type CardProps = {
  event: CalendarEvent;
  live?: boolean;
  showLabel?: boolean;
  onPress: () => void;
};

/** Happening-now row — date block, venue, registration count, LIVE + tier. */
export function NowOnCard({ event, live = true, showLabel = true, onPress }: CardProps) {
  const parts = eventDayParts(event.start_date);
  const tone = sapaTone(event.sapa_status);
  const label = sapaLabel(event.sapa_status);
  const location = eventLocation(event);
  const registered = Number(event.registered_players || 0);

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
          <View className="mr-3.5 w-14 items-center border-r border-edge pr-3">
            <Text className="text-[10px] font-black uppercase tracking-widest text-padel">
              {parts.month}
            </Text>
            <Text
              className="text-[22px] font-bold leading-none text-premium"
              style={{ fontVariant: ['tabular-nums'] }}>
              {parts.day}
            </Text>
            <Text className="mt-0.5 text-[8px] font-bold uppercase tracking-widest text-padel">
              {parts.weekday}
            </Text>
          </View>

          <View className="min-w-0 flex-1 pr-2">
            <Text
              numberOfLines={2}
              className="text-[13px] font-bold uppercase tracking-tight text-premium">
              {event.event_name}
            </Text>
            {location ? (
              <View className="mt-1.5 flex-row items-center">
                <SymbolView name="mappin" size={11} tintColor={brand.faint} />
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

/** Compact schedule / featured / results row. */
export function EventRow({ event, onPress }: CardProps) {
  const parts = eventDayParts(event.start_date);
  const tone = sapaTone(event.sapa_status);
  const label = sapaLabel(event.sapa_status);
  const location = eventLocation(event);
  const range = formatEventRange(event.start_date, event.end_date);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.event_name || 'Event'}. ${range}. ${location}`}
      className="flex-row items-center px-4 py-3.5">
      <View className="w-11 items-center">
        <Text
          className="text-[18px] font-bold leading-none text-premium"
          style={{ fontVariant: ['tabular-nums'] }}>
          {parts.day}
        </Text>
        <Text className="mt-1 text-[9px] font-black uppercase tracking-widest text-padel">
          {parts.month}
        </Text>
      </View>

      <View className="ml-3 min-w-0 flex-1">
        <View className="flex-row items-center">
          <Text
            numberOfLines={1}
            className="min-w-0 flex-1 text-[13px] font-bold uppercase text-premium">
            {event.event_name}
          </Text>
          {label ? (
            <View
              className="ml-2 rounded-full border px-2 py-0.5"
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
          <Text numberOfLines={1} className="mt-1 text-[11px] text-white/50">
            {location}
          </Text>
        ) : null}
      </View>

      <SymbolView name="chevron.right" size={14} tintColor={brand.padel} />
    </PressableScale>
  );
}

export function FeaturedCard({ event, onPress }: CardProps) {
  const tone = sapaTone(event.sapa_status);
  const label = sapaLabel(event.sapa_status);
  const range = formatEventRange(event.start_date, event.end_date);
  const city = event.city || eventLocation(event);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.event_name || 'Featured event'}. ${range}`}
      className="overflow-hidden rounded-2xl border bg-elevated"
      style={{ borderColor: tone.border }}>
      <View className="px-4 py-3.5">
        <View className="flex-row items-start justify-between">
          {label ? (
            <View
              className="rounded-full border px-2 py-0.5"
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
          <SymbolView name="chevron.right" size={14} tintColor={brand.padel} />
        </View>
        <Text
          numberOfLines={2}
          className="mt-2 text-[16px] font-bold uppercase leading-snug tracking-tight text-premium">
          {event.event_name}
        </Text>
        <View className="mt-2 flex-row flex-wrap items-center">
          {range ? (
            <Text className="mr-3 text-[11px] font-bold uppercase" style={{ color: tone.fill }}>
              {range}
            </Text>
          ) : null}
          {city ? (
            <Text className="text-[11px] font-bold uppercase" style={{ color: tone.fill }}>
              {city}
            </Text>
          ) : null}
        </View>
        <RegCountdown
          opensAt={event.registration_opens_at}
          closesAt={event.registration_closes_at}
          accent={tone.fill}
        />
      </View>
    </PressableScale>
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

function RegCountdown({
  opensAt,
  closesAt,
  accent,
}: {
  opensAt: string | null;
  closesAt: string | null;
  accent: string;
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

  const diff = Math.max(0, target - now);
  const parts = [
    { value: pad2(Math.floor(diff / 86400000)), unit: 'DAYS' },
    { value: pad2(Math.floor((diff / 3600000) % 24)), unit: 'HRS' },
    { value: pad2(Math.floor((diff / 60000) % 60)), unit: 'MINS' },
    { value: pad2(Math.floor((diff / 1000) % 60)), unit: 'SECS' },
  ];

  return (
    <View
      className="relative mt-3 self-start rounded-lg border px-2.5 pb-1.5 pt-2.5"
      style={{ borderColor: `${accent}80` }}>
      <Text
        className="absolute -top-1.5 left-2 bg-elevated px-1 text-[8px] font-bold uppercase tracking-wider"
        style={{ color: accent }}>
        {label}
      </Text>
      <View className="flex-row items-end">
        {parts.map((part, i) => (
          <View key={part.unit} className="flex-row items-end">
            {i > 0 ? (
              <Text className="px-1 pb-1.5 text-[12px] font-bold text-white/40">:</Text>
            ) : null}
            <View className="items-center">
              <Text
                className="text-[14px] font-black leading-none text-premium"
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

export function EmptyBlock({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className="rounded-2xl border border-edge bg-elevated px-4 py-5">
      <Text className="text-[14px] font-semibold text-premium">{title}</Text>
      <Text className="mt-1 text-[13px] leading-5 text-muted">{body}</Text>
      {actionLabel && onAction ? (
        <PressableScale
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          className="mt-3 h-11 items-center justify-center rounded-full bg-padel">
          <Text className="text-[13px] font-bold text-black">{actionLabel}</Text>
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

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Next match, ${info.EventName || 'match'}. ${info.Challenger?.Name || 'TBD'} versus ${info.Challenged?.Name || 'TBD'}`}
      className="overflow-hidden rounded-[16px] border bg-elevated p-3.5"
      style={{ borderColor: 'rgba(249,115,22,0.35)' }}>
      <View className="flex-row items-start justify-between border-b border-white/5 pb-2">
        <View className="min-w-0 flex-1 flex-row items-center">
          <PulseDot color={MATCH_ORANGE} size={6} />
          <Text
            numberOfLines={1}
            className="ml-1.5 text-[12px] font-bold uppercase tracking-widest"
            style={{ color: MATCH_ORANGE }}>
            {info.EventName || 'Next Match'}
          </Text>
        </View>
        {info.Date ? (
          <Text className="ml-2 shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-white/70">
            {info.Date}
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
          <SymbolView name="mappin" size={12} tintColor={brand.padel} />
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
  const parts = matchDayParts(info.Date);
  const winner = isMatchWinner(match);
  const sets = match.Score?.Score ?? [];

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${info.EventName || 'Match'}. ${info.Challenger?.Name || 'TBD'} versus ${info.Challenged?.Name || 'TBD'}`}
      className="flex-row items-center px-4 py-3.5">
      <View className="w-11 items-center">
        <Text
          className="text-[18px] font-bold leading-none text-premium"
          style={{ fontVariant: ['tabular-nums'] }}>
          {parts.day}
        </Text>
        {parts.month ? (
          <Text className="mt-1 text-[9px] font-black uppercase tracking-widest" style={{ color: MATCH_ORANGE }}>
            {parts.month}
          </Text>
        ) : null}
      </View>
      <View className="ml-3 min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[13px] font-bold uppercase text-premium">
          {info.EventName || 'Match'}
        </Text>
        <Text numberOfLines={1} className="mt-1 text-[11px] text-white/50">
          {info.Challenger?.Name || 'TBD'} vs {info.Challenged?.Name || 'TBD'}
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
