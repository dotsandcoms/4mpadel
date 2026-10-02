import { useRouter } from 'expo-router';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { EmptyBlock } from '@/components/home-event-card';
import { MapPin } from '@/components/map-pin';
import { PressableScale } from '@/components/pressable-scale';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import {
  parseDay,
  resolveScheduleEntryCta,
  type CalendarEvent,
} from '@/lib/home';
import {
  isMatchWinner,
  matchKey,
  parseMatchDate,
  type PlayerMatch,
} from '@/lib/matches';
import type { ProfileTransaction, RankingRow } from '@/lib/profile';
import { sapaLabel, sapaTone } from '@/theme/sapa';
import { lightBrand as brand, motion } from '@/theme/tokens';

export const PROFILE_SECTIONS = [
  { id: 'events', label: 'My Events', active: brand.accent, text: '#fff' },
  { id: 'matches', label: 'My Matches', active: brand.accent, text: '#fff' },
  { id: 'rankings', label: 'My Rankings', active: brand.accent, text: '#fff' },
  { id: 'payments', label: 'Payments', active: brand.accent, text: '#fff' },
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number]['id'];
export type AgendaFilter = 'upcoming' | 'completed';
export type EventScope = 'all' | 'action';

const ease = Easing.bezier(
  motion.easing.standard[0],
  motion.easing.standard[1],
  motion.easing.standard[2],
  motion.easing.standard[3]
);

const RIPPLE = { color: 'rgba(204,255,0,0.16)' };

type MonthGroup<T> = { label: string; sort?: number; items: T[] };

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(date).toUpperCase();
}

function groupByMonth<T>(items: T[], dateOf: (item: T) => Date | null, upcoming = false): MonthGroup<T>[] {
  const buckets = new Map<string, { label: string; sort: number; items: T[] }>();
  const undated: T[] = [];
  for (const item of items) {
    const date = dateOf(item);
    if (!date || !Number.isFinite(date.getTime()) || date.getTime() === 0) {
      undated.push(item);
      continue;
    }
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const current = buckets.get(key);
    if (current) current.items.push(item);
    else buckets.set(key, { label: `${monthLabel(date)}${date.getFullYear() === new Date().getFullYear() ? '' : ` ${date.getFullYear()}`}`, sort: date.getFullYear() * 100 + date.getMonth(), items: [item] });
  }
  const groups = [...buckets.values()].sort((a, b) => upcoming ? a.sort - b.sort : b.sort - a.sort);
  if (undated.length) groups.push({ label: 'UNSCHEDULED', sort: 0, items: undated });
  return groups;
}

function closesInLabel(iso: string | null | undefined) {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const days = Math.ceil((at - Date.now()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return 'Registration closes today';
  if (days === 1) return 'Registration closes in 1 day';
  return `Registration closes in ${days} days`;
}

export function eventNeedsAction(event: CalendarEvent, pending: boolean) {
  if (pending) return true;
  const cta = resolveScheduleEntryCta(event);
  return cta.action === 'register' || cta.action === 'pay';
}

export function eventStatusLine(event: CalendarEvent, pending: boolean, past: boolean) {
  if (past) return sapaLabel(event.sapa_status);
  if (pending || (event.isRegistered && event.isPaid !== true && resolveScheduleEntryCta(event).action === 'pay')) {
    return 'Payment due';
  }
  if (event.isRegistered && event.isPaid) return 'Entry confirmed';
  const closes = closesInLabel(event.registration_closes_at);
  if (closes) return closes;
  if (event.fromSchedule && !event.isRegistered) return 'Open for registration';
  return sapaLabel(event.sapa_status);
}

export function eventActionLabel(event: CalendarEvent, past: boolean) {
  if (past) return null;
  const cta = resolveScheduleEntryCta(event);
  if (cta.action === 'register') return { label: 'Register', action: cta.action };
  if (cta.action === 'pay') return { label: 'Pay balance', action: cta.action };
  return { label: 'Manage entry', action: cta.action };
}

function clubLine(event: CalendarEvent) {
  return event.venue || event.city || 'Club';
}

function contrastOnFill(fill: string) {
  return fill === '#CCFF00' || fill === '#F59E0B' ? '#0a0a0a' : '#ffffff';
}

type AgendaTag = { label: string; color: string; border: string; bg: string };

function eventTags(event: CalendarEvent, pending: boolean): AgendaTag[] {
  const tags: AgendaTag[] = [];
  const tier = sapaLabel(event.sapa_status);
  if (tier) {
    const tone = sapaTone(event.sapa_status);
    tags.push({ label: tier, color: tone.text, border: tone.border, bg: tone.bg });
  }
  if (event.fromSchedule) {
    tags.push({
      label: 'On Schedule',
      color: brand.accent,
      border: 'rgba(204,255,0,0.2)',
      bg: 'rgba(204,255,0,0.1)',
    });
  }
  if (event.isPaid) {
    tags.push({
      label: 'Paid',
      color: brand.accent,
      border: 'rgba(204,255,0,0.2)',
      bg: 'rgba(204,255,0,0.1)',
    });
  }
  if (pending && !event.isPaid) {
    tags.push({
      label: 'Pending',
      color: '#F59E0B',
      border: 'rgba(245,158,11,0.2)',
      bg: 'rgba(245,158,11,0.1)',
    });
  }
  return tags;
}

function matchTitle(match: PlayerMatch) {
  return match.Info?.EventName?.trim() || 'Tour match';
}

function matchSubtitle(match: PlayerMatch) {
  const info = match.Info || {};
  const a = [info.Challenger?.Name, info.Challenger1?.Name].filter(Boolean).join(' & ');
  const b = [info.Challenged?.Name, info.Challenged1?.Name].filter(Boolean).join(' & ');
  if (a && b) return `${a} vs ${b}`;
  return info.Venue || info.Location || info.Court || undefined;
}

function matchStatus(match: PlayerMatch) {
  const hasResult = Boolean(match.Score?.Score?.length);
  if (!hasResult) return 'Upcoming';
  return isMatchWinner(match) ? 'Victory' : 'Defeat';
}

function parseLooseDate(value?: string | null) {
  if (!value) return null;
  const day = parseDay(value);
  if (day) return day;
  const parsed = parseMatchDate(value);
  return parsed.getTime() ? parsed : null;
}

function railParts(date: Date | null) {
  if (!date) return { day: '–', weekday: '' };
  return {
    day: String(date.getDate()).padStart(2, '0'),
    weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date).toUpperCase(),
  };
}

type AgendaRowModel = {
  id: string;
  kind: 'month' | 'row';
  payment?: ProfileTransaction;
  month?: string;
  monthKey?: string;
  monthSort?: number;
  recordCount?: number;
  day?: string;
  weekday?: string;
  title?: string;
  subtitle?: string;
  status?: string | null;
  tags?: AgendaTag[];
  pin?: boolean;
  actionLabel?: string | null;
  actionFill?: string;
  onAction?: () => void;
  onPress?: () => void;
};

function flattenGroups<T>(
  groups: MonthGroup<T>[],
  toRow: (item: T, index: number) => Omit<AgendaRowModel, 'kind' | 'day' | 'weekday'> & { date: Date | null }
): AgendaRowModel[] {
  const rows: AgendaRowModel[] = [];
  groups.forEach((group) => {
    const monthKey = `month-${group.sort ?? group.label}`;
    rows.push({ id: monthKey, kind: 'month', month: group.label, monthKey, monthSort: group.sort, recordCount: group.items.length });
    group.items.forEach((item, index) => {
      const next = toRow(item, index);
      const parts = railParts(next.date);
      rows.push({
        id: next.id,
        kind: 'row',
        payment: next.payment,
        monthKey,
        day: parts.day,
        weekday: parts.weekday,
        title: next.title,
        subtitle: next.subtitle,
        status: next.status,
        tags: next.tags,
        pin: next.pin,
        actionLabel: next.actionLabel,
        actionFill: next.actionFill,
        onAction: next.onAction,
        onPress: next.onPress,
      });
    });
  });
  return rows;
}

export function SectionSwitcher({
  section,
  counts,
  onChange,
}: {
  section: ProfileSection;
  counts: Partial<Record<ProfileSection, number>>;
  onChange: (next: ProfileSection) => void;
}) {
  return (
    <ScrollView
      horizontal
      accessibilityRole="tablist"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20 }}>
      <View className="flex-row rounded-2xl border border-court-edge bg-court-elevated p-1">
        {PROFILE_SECTIONS.map((item) => {
          const selected = section === item.id;
          const count = counts[item.id];
          const label = count != null ? `${item.label} (${count})` : item.label;
          return (
            <Pressable
              key={item.id}
              onPress={() => onChange(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              android_ripple={RIPPLE}
              className="min-h-11 justify-center rounded-xl px-3"
              style={selected ? { backgroundColor: item.active } : undefined}>
              <Text
                className="text-[9px] font-black uppercase tracking-widest"
                style={{ color: selected ? item.text : 'rgba(22,37,31,0.7)' }}>
                {item.label}
                {count != null ? ` (${count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

export function SegmentedControl({
  value,
  onChange,
  upcomingCount,
  completedCount,
  active = brand.accent,
  activeText = '#fff',
}: {
  value: AgendaFilter;
  onChange: (next: AgendaFilter) => void;
  upcomingCount: number;
  completedCount: number;
  active?: string;
  activeText?: string;
}) {
  const items = [
    { key: 'upcoming' as const, label: `Upcoming (${upcomingCount})` },
    { key: 'completed' as const, label: `Complete (${completedCount})` },
  ];

  return (
    <View
      accessibilityRole="tablist"
      className="flex-row self-start rounded-xl bg-court-surface p-1"
      style={{ borderWidth: 1, borderColor: 'rgba(22,37,31,0.1)' }}>
      {items.map((item) => {
        const selected = value === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={item.label}
            android_ripple={RIPPLE}
            className="min-h-9 justify-center rounded-lg px-3"
            style={selected ? { backgroundColor: active } : undefined}>
            <Text
              className="text-[9px] font-black uppercase tracking-wider"
              style={{ color: selected ? activeText : 'rgba(22,37,31,0.7)' }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FilterMenu({
  value,
  onChange,
}: {
  value: EventScope;
  onChange: (next: EventScope) => void;
}) {
  const label = value === 'action' ? 'Needs action' : 'All events';

  return (
    <Pressable
      onPress={() => onChange(value === 'all' ? 'action' : 'all')}
      accessibilityRole="button"
      accessibilityState={{ selected: value === 'action' }}
      accessibilityLabel={`Filter, ${label}. Tap to change.`}
      android_ripple={RIPPLE}
      className="min-h-11 flex-row items-center px-1">
      <Text className="text-[12px] font-bold text-court-muted">{label}</Text>
      <View className="ml-1">
        <SymbolView name="chevron.down" size={12} tintColor={brand.muted} />
      </View>
    </Pressable>
  );
}

function AgendaMonth({ label, count, expanded, onPress }: { label: string; count: number; expanded: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count} ${count === 1 ? 'record' : 'records'}`}
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={{ minHeight: 52, paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text style={{ flex: 1, color: brand.muted, fontSize: 11, fontWeight: '400', letterSpacing: 1.5 }}>{label}</Text>
      <Text style={{ color: brand.muted, fontSize: 11, fontWeight: '400' }}>{count}</Text>
      <SymbolView name={expanded ? 'chevron.down' : 'chevron.right'} size={12} tintColor={brand.muted} />
    </Pressable>
  );
}

function PaymentCard({ item }: { item: AgendaRowModel }) {
  const payment = item.payment!;
  const status = payment.status.toLowerCase();
  const refund = payment.kind === 'refund' || status.includes('refund');
  const failed = /failed|declined|rejected/.test(status);
  const abandoned = /abandoned|cancelled|canceled/.test(status);
  const pending = /pending|processing|queued|requested/.test(status);
  const success = /success|paid|completed|processed/.test(status);
  const color = failed ? '#F87171' : abandoned ? '#9CA3AF' : refund ? '#FB923C' : pending ? '#FBBF24' : success ? '#60A5FA' : '#9CA3AF';
  return <View style={{ paddingHorizontal: 20, paddingBottom: 7 }}>
    <View style={{ flexDirection: 'row', gap: 9, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: refund ? '#FB923C33' : '#16251f14', backgroundColor: '#FFFFFF' }}>
      <View style={{ width: 26, alignItems: 'center', gap: 5, paddingTop: 3 }}>
        <Text style={{ fontSize: 16, color, fontWeight: '400' }}>{item.day}</Text>
        <Text style={{ fontSize: 8, color: '#828b9a', letterSpacing: 0.5 }}>{item.weekday}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: `${color}18`, borderWidth: 1, borderColor: `${color}33` }}>
            <Text style={{ color, fontSize: 9, fontWeight: '400' }}>{payment.status.toUpperCase()}</Text>
          </View>
          {payment.kind === 'refund' && !status.includes('refund') && <Text style={{ fontSize: 9, color: '#FB923C' }}>REFUND</Text>}
          <Text style={{ marginLeft: 'auto', fontSize: 13, fontWeight: '400', color, fontVariant: ['tabular-nums'] }}>{payment.amount}</Text>
        </View>
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '400', color: '#16251F' }}>{payment.event_name || item.title}</Text>
        <Text style={{ fontSize: 10, lineHeight: 13, color: '#65726B' }}>{payment.kind === 'refund' ? payment.reason || 'Refund' : item.subtitle}</Text>
        {!!payment.refundedTotal && status !== 'refunded' && <Text style={{ fontSize: 10, color: '#FB923C' }}>Refunded: {payment.refundedTotal.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</Text>}
      </View>
    </View>
  </View>;
}

function AgendaRow({
  day,
  weekday,
  title,
  subtitle,
  status,
  tags,
  pin,
  actionLabel,
  actionFill,
  onAction,
  onPress,
}: {
  day?: string;
  weekday?: string;
  title: string;
  subtitle?: string;
  status?: string | null;
  tags?: AgendaTag[];
  pin?: boolean;
  actionLabel?: string | null;
  actionFill?: string;
  onAction?: () => void;
  onPress?: () => void;
}) {
  const fill = actionFill || brand.padel;
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress && !onAction}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[title, subtitle, status, actionLabel, ...(tags ?? []).map((tag) => tag.label)]
        .filter(Boolean)
        .join(', ')}
      className="px-5">
      <View className="min-h-[72px] flex-row items-center border-b border-court-edge py-3">
        <View className="w-11 items-start">
          <Text
            className="text-[15px] font-extrabold leading-none text-court-accent"
            style={{ fontVariant: ['tabular-nums'] }}>
            {day || '–'}
          </Text>
          <Text className="mt-1 text-[9px] font-bold uppercase tracking-widest text-court-faint">
            {weekday}
          </Text>
        </View>
        <View className="min-w-0 flex-1 pr-3">
          {tags?.length ? (
            <View className="mb-1 flex-row flex-wrap" style={{ gap: 6 }}>
              {tags.map((tag) => (
                <Text
                  key={tag.label}
                  className="rounded px-1.5 py-0.5 text-[7.5px] font-black uppercase tracking-wider"
                  style={{
                    color: tag.color,
                    borderWidth: 1,
                    borderColor: tag.border,
                    backgroundColor: tag.bg,
                  }}>
                  {tag.label}
                </Text>
              ))}
            </View>
          ) : null}
          <Text numberOfLines={1} className="text-[13px] font-extrabold uppercase text-court-ink">
            {title}
          </Text>
          {subtitle ? (
            <View className="mt-0.5 flex-row items-center">
              {pin ? <MapPin size={9} color="#6B7280" /> : null}
              <Text
                numberOfLines={1}
                className={`text-[8px] font-bold uppercase tracking-wider text-court-faint ${pin ? 'ml-1' : ''}`}>
                {subtitle}
              </Text>
            </View>
          ) : null}
          {status ? (
            <Text
              numberOfLines={1}
              className="mt-0.5 text-[11px] text-court-muted"
              style={status.endsWith(' pts') ? { color: '#526CA3', fontWeight: '600' } : undefined}>
              {status}
            </Text>
          ) : null}
        </View>
        {actionLabel && onAction ? (
          <PressableScale
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            className="min-h-8 justify-center rounded-full px-2.5"
            style={{ backgroundColor: fill }}>
            <Text
              className="text-[8.5px] font-black uppercase tracking-wide"
              style={{ color: contrastOnFill(fill) }}>
              {actionLabel} →
            </Text>
          </PressableScale>
        ) : onPress ? (
          <SymbolView name="chevron.right" size={14} tintColor="rgba(22,37,31,0.35)" />
        ) : null}
      </View>
    </PressableScale>
  );
}

function PageEnter({ active, children }: { active: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  const shift = useSharedValue(0);
  const seen = useRef(false);

  useEffect(() => {
    if (!active) return;
    if (!seen.current) {
      seen.current = true;
      return;
    }
    if (reduced) {
      opacity.value = 1;
      shift.value = 0;
      return;
    }
    opacity.value = 0;
    shift.value = 12;
    opacity.value = withTiming(1, { duration: motion.duration.base, easing: ease });
    shift.value = withTiming(0, { duration: motion.duration.base, easing: ease });
  }, [active, opacity, reduced, shift]);

  const style = useAnimatedStyle(() => ({
    flex: 1,
    opacity: opacity.value,
    transform: [{ translateY: shift.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function AgendaList({
  data,
  extraData,
  resetKey,
  header,
  footer,
  empty,
  refreshing,
  onRefresh,
  bottomPad,
}: {
  data: AgendaRowModel[];
  extraData?: unknown;
  resetKey?: string;
  header?: ReactNode;
  footer?: ReactNode;
  empty: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
  bottomPad: number;
}) {
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const listRef = useRef<FlashListRef<AgendaRowModel>>(null);
  useEffect(() => {
    if (resetKey === undefined) return;
    setExpandedMonths({});
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [resetKey]);
  const months = data.filter(row => row.kind === 'month');
  const now = new Date();
  const currentMonth = now.getFullYear() * 100 + now.getMonth();
  const dated = months.filter(row => (row.monthSort ?? 0) > 0);
  // Prefer the current month; histories open their latest available month.
  // An upcoming-only list opens its first scheduled month.
  const defaultMonth = dated.find(row => row.monthSort === currentMonth)
    ?? [...dated].filter(row => row.monthSort! < currentMonth).sort((a, b) => b.monthSort! - a.monthSort!)[0]
    ?? [...dated].sort((a, b) => a.monthSort! - b.monthSort!)[0]
    ?? months[0];
  const isExpanded = (key: string) => expandedMonths[key] ?? key === defaultMonth?.id;
  const visibleRows = data.filter(row => row.kind === 'month' || !row.monthKey || isExpanded(row.monthKey));
  const toggleMonth = (key: string) => setExpandedMonths(previous => ({ ...previous, [key]: !isExpanded(key) }));
  return (
    <FlashList
      ref={listRef}
      data={visibleRows}
      extraData={{ extraData, expandedMonths }}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) =>
        item.kind === 'month' ? (
          <AgendaMonth label={item.month || ''} count={item.recordCount || 0} expanded={isExpanded(item.id)} onPress={() => toggleMonth(item.id)} />
        ) : (
          item.payment ? <PaymentCard item={item} /> : <AgendaRow
            day={item.day}
            weekday={item.weekday}
            title={item.title || ''}
            subtitle={item.subtitle}
            status={item.status}
            tags={item.tags}
            pin={item.pin}
            actionLabel={item.actionLabel}
            actionFill={item.actionFill}
            onAction={item.onAction}
            onPress={item.onPress}
          />
        )
      }
      ListHeaderComponent={header ? <View>{header}</View> : null}
      ListFooterComponent={footer ? <View className="px-5 pb-6 pt-4">{footer}</View> : null}
      ListEmptyComponent={<View className="px-5 pt-6">{empty}</View>}
      contentContainerStyle={{ paddingBottom: bottomPad }}
      refreshing={refreshing}
      onRefresh={onRefresh}
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
    />
  );
}

export function ProfileSectionPager({
  width,
  height,
  section,
  pagerRef,
  onSwipe,
  counts,
  eventView,
  matchView,
  eventScope,
  onEventView,
  onMatchView,
  onEventScope,
  upcomingEvents,
  completedEvents,
  pendingEventIds,
  upcomingMatches,
  completedMatches,
  rankings,
  selectedRanking,
  onSelectRanking,
  transactions,
  txLoading,
  refreshing,
  onRefresh,
  onOpenEvent,
  eventsFooter,
  bottomPad,
}: {
  width: number;
  height: number;
  section: ProfileSection;
  pagerRef: RefObject<ScrollView | null>;
  onSwipe: (next: ProfileSection) => void;
  counts: Partial<Record<ProfileSection, number>>;
  eventView: AgendaFilter;
  matchView: AgendaFilter;
  eventScope: EventScope;
  onEventView: (next: AgendaFilter) => void;
  onMatchView: (next: AgendaFilter) => void;
  onEventScope: (next: EventScope) => void;
  upcomingEvents: CalendarEvent[];
  completedEvents: CalendarEvent[];
  pendingEventIds: Set<number>;
  upcomingMatches: PlayerMatch[];
  completedMatches: PlayerMatch[];
  rankings: RankingRow[];
  selectedRanking: RankingRow | null;
  onSelectRanking: (row: RankingRow) => void;
  transactions: ProfileTransaction[];
  txLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenEvent: (event: CalendarEvent, action?: 'register' | 'pay' | 'manage') => void;
  eventsFooter: ReactNode;
  bottomPad: number;
}) {
  const router = useRouter();
  const events = eventView === 'upcoming' ? upcomingEvents : completedEvents;
  const past = eventView === 'completed';
  const visibleEvents =
    eventScope === 'action' && !past
      ? events.filter((event) => eventNeedsAction(event, pendingEventIds.has(event.id)))
      : events;
  const matches = matchView === 'upcoming' ? upcomingMatches : completedMatches;

  const eventRows = useMemo(
    () =>
      flattenGroups(
        groupByMonth(visibleEvents, (event) => parseDay(event.start_date), !past),
        (event) => {
          const pending = pendingEventIds.has(event.id);
          const action = eventActionLabel(event, past);
          return {
            id: `event-${event.id}`,
            date: parseDay(event.start_date),
            title: event.event_name || 'Tournament',
            subtitle: clubLine(event),
            pin: true,
            tags: eventTags(event, pending),
            status: eventStatusLine(event, pending, past),
            actionLabel: action?.label,
            actionFill: sapaTone(event.sapa_status).fill,
            onAction: action ? () => onOpenEvent(event, action.action) : undefined,
            onPress: () => onOpenEvent(event),
          };
        }
      ),
    [onOpenEvent, past, pendingEventIds, visibleEvents]
  );

  const matchRows = useMemo(
    () =>
      flattenGroups(
        groupByMonth(matches, (match) => parseLooseDate(match.Info?.EventStartDate || match.Info?.Date)),
        (match, index) => ({
          id: `match-${matchKey(match, index)}`,
          date: parseLooseDate(match.Info?.EventStartDate || match.Info?.Date),
          title: matchTitle(match),
          subtitle: matchSubtitle(match),
          status: matchView === 'completed' && !match.Score?.Score?.length ? 'Result not available' : matchStatus(match),
          onPress: matchView === 'completed' ? () => router.push({ pathname: '/match-result', params: { match: JSON.stringify(match) } }) : undefined,
        })
      ),
    [matches, matchView, router]
  );

  const rankingRows = useMemo(() => {
    const details = selectedRanking?.details ?? [];
    if (details.length) {
      return flattenGroups(
        groupByMonth(details, (row) => parseLooseDate(row.date)),
        (row, index) => ({
          id: `rank-${row.name}-${index}`,
          date: parseLooseDate(row.date),
          title: row.name || 'Event',
          subtitle: [row.class, row.place ? `Standing ${row.place}` : null, row.event_type]
            .filter(Boolean)
            .join(' · '),
          status: row.points != null ? `+${row.points} pts` : null,
        })
      );
    }
    return flattenGroups(
      [{ label: 'RANKINGS', items: rankings }],
      (row, index) => ({
        id: `rank-org-${row.org}-${index}`,
        date: null,
        title: row.org || 'SAPA',
        subtitle: [row.age_group || 'Open', row.match_type].filter(Boolean).join(' · '),
        status: row.rank != null ? `#${row.rank} · ${row.points ?? '—'} pts` : null,
      })
    );
  }, [rankings, selectedRanking]);

  const paymentRows = useMemo(
    () =>
      flattenGroups(
        groupByMonth(transactions, (row) => (row.sortDate ? new Date(row.sortDate) : parseLooseDate(row.date))),
        (row, index) => {
          const refund = row.kind === 'refund';
          return {
            id: `pay-${row.kind}-${row.id}-${index}`,
            payment: row,
            date: row.sortDate ? new Date(row.sortDate) : parseLooseDate(row.date),
            title: refund ? row.reason || 'Refund' : row.event_name || 'License fee',
            subtitle: String(row.payment_type || row.kind).replace(/_/g, ' '),
            status: `${row.status} · ${row.amount}`,
          };
        }
      ),
    [transactions]
  );

  function onPagerEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
    const next = PROFILE_SECTIONS[index]?.id;
    if (next && next !== section) onSwipe(next);
  }

  const pageStyle = { width, height };

  return (
    <ScrollView
      ref={pagerRef}
      horizontal
      pagingEnabled
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      onMomentumScrollEnd={onPagerEnd}
      scrollEventThrottle={16}
      style={{ flex: 1 }}
      accessibilityLabel="Profile sections">
      <View style={pageStyle}>
        <PageEnter active={section === 'events'}>
          <AgendaList
            data={eventRows}
            extraData={`${eventView}-${eventScope}-${counts.events}`}
            refreshing={refreshing}
            onRefresh={onRefresh}
            bottomPad={bottomPad}
            header={
              <View className="px-5 pt-4">
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-court-muted">
                    My tournaments
                  </Text>
                  <FilterMenu value={eventScope} onChange={onEventScope} />
                </View>
                <SegmentedControl
                  value={eventView}
                  onChange={onEventView}
                  upcomingCount={upcomingEvents.length}
                  completedCount={completedEvents.length}
                  active={brand.accent}
                />
              </View>
            }
            footer={eventsFooter}
            empty={
              <EmptyBlock
                title={eventView === 'upcoming' ? 'No upcoming events' : 'No completed events'}
                body={
                  eventView === 'upcoming'
                    ? 'Tournaments you enter will show up here, grouped by month.'
                    : 'Finished tournaments will land here after results are in.'
                }
              />
            }
          />
        </PageEnter>
      </View>

      <View style={pageStyle}>
        <PageEnter active={section === 'matches'}>
          <AgendaList
            data={matchRows}
            extraData={matchView}
            refreshing={refreshing}
            onRefresh={onRefresh}
            bottomPad={bottomPad}
            header={
              <View className="px-5 pt-4">
                <Text className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-court-muted">
                  My matches
                </Text>
                <SegmentedControl
                  value={matchView}
                  onChange={onMatchView}
                  upcomingCount={upcomingMatches.length}
                  completedCount={completedMatches.length}
                  active={brand.accent}
                />
              </View>
            }
            empty={
              <EmptyBlock
                title={matchView === 'upcoming' ? 'No upcoming matches' : 'No completed matches'}
                body={
                  matchView === 'upcoming'
                    ? 'Once a draw is published, your fixtures appear here.'
                    : 'Match results will collect here after you play.'
                }
              />
            }
          />
        </PageEnter>
      </View>

      <View style={pageStyle}>
        <PageEnter active={section === 'rankings'}>
          <AgendaList
            data={rankingRows}
            resetKey={selectedRanking ? rankingKey(selectedRanking) : 'rankings'}
            extraData={selectedRanking?.org}
            refreshing={refreshing}
            onRefresh={onRefresh}
            bottomPad={bottomPad}
            header={
              <View className="px-5 pt-4">
                <Text className="mb-3 text-[11px] font-normal text-court-ink">RANKINGS POINTS BREAKDOWN</Text>
                {rankings.length ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
                    {rankings.map((row, index) => {
                      const active =
                        selectedRanking?.org === row.org &&
                        selectedRanking?.age_group === row.age_group &&
                        selectedRanking?.match_type === row.match_type;
                      return (
                        <Pressable
                          key={`${row.org}-${index}`}
                          onPress={() => onSelectRanking(row)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: Boolean(active) }}
                          accessibilityLabel={`${row.org || 'SAPA'}, ${row.age_group || 'Open'}`}
                          android_ripple={RIPPLE}
                          className="min-h-9 justify-center rounded-xl px-3"
                          style={{
                            backgroundColor: active ? brand.accent : 'rgba(22,37,31,0.02)',
                            borderWidth: 1,
                            borderColor: active ? brand.accent : 'rgba(22,37,31,0.1)',
                          }}>
                          <Text
                            className="text-[8px] font-normal uppercase tracking-widest"
                            style={{ color: active ? '#fff' : 'rgba(22,37,31,0.7)' }}>
                            {row.org || 'SAPA'} ({row.age_group || 'Open'})
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
                {selectedRanking ? (
                  <>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 18 }}>
                      {[
                        { label: 'STANDING', value: selectedRanking.rank != null ? `#${selectedRanking.rank}` : '—', color: brand.premium },
                        { label: 'POINTS', value: String(selectedRanking.points ?? '—'), color: '#16251F' },
                        { label: 'TYPE', value: (selectedRanking.match_type || 'Open').toUpperCase(), color: '#52625A' },
                      ].map(({ label, value, color }) => (
                        <View key={label} style={{ flex: 1, minHeight: 66, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: '#16251f18', backgroundColor: '#16251f05', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 8, letterSpacing: 1, color: '#828b9a', fontWeight: '400' }}>{label}</Text>
                          <Text style={{ fontSize: label === 'TYPE' ? 9 : 20, color, textAlign: 'center', fontWeight: '400' }}>{value}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={{ fontSize: 11, color: '#828b9a', marginBottom: 4 }}>DETAILED BREAKDOWN</Text>
                  </>
                ) : null}
              </View>
            }
            empty={
              <EmptyBlock
                title="No ranking details"
                body="Points breakdowns appear here after ranked events are published."
              />
            }
          />
        </PageEnter>
      </View>

      <View style={pageStyle}>
        <PageEnter active={section === 'payments'}>
          {txLoading && !transactions.length ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-[12px] font-bold uppercase tracking-widest text-court-faint">
                Loading payments
              </Text>
            </View>
          ) : (
            <AgendaList
              data={paymentRows}
              extraData={transactions.length}
              refreshing={refreshing}
              onRefresh={onRefresh}
              bottomPad={bottomPad}
              header={
                <View className="px-5 pt-4">
                  <Text className="mb-1 text-[16px] font-bold text-court-ink">Payments</Text>
                  <Text className="text-[12px] text-court-muted">License fees, entries, and refunds.</Text>
                </View>
              }
              empty={
                <EmptyBlock
                  title="No payments yet"
                  body="Entry fees and license charges will show here after checkout."
                />
              }
            />
          )}
        </PageEnter>
      </View>
    </ScrollView>
  );
}

export function rankingKey(row: RankingRow) {
  return `${row.org || ''}|${row.age_group || ''}|${row.match_type || ''}`;
}
