/**
 * Calendar tab — Google Calendar-style.
 * Switches between Year / Month / Week. Shows broadcast events as dots
 * (month / year) or blocks (week). Tap an event in week view to view details.
 */
import { Ionicons } from '@expo/vector-icons';
import {
  addDays,
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { adminApi, userApi, type BroadcastEvent, type UserEventSync } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth-context';
import { colors, radius, shadow, spacing, type } from '@/src/theme';

type ViewMode = 'year' | 'month' | 'week';

type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  start: Date;
  end: Date;
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const { user } = useAuth();
  const [mode, setMode] = useState<ViewMode>('month');
  const [cursor, setCursor] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    try {
      let normalized: CalendarEvent[] = [];
      if (user?.is_admin) {
        const list: BroadcastEvent[] = await adminApi.broadcasts();
        normalized = list.map((b) => ({
          id: b.id,
          title: b.title,
          description: b.description,
          start: parseISO(b.start_time),
          end: parseISO(b.end_time),
        }));
      } else {
        const list: UserEventSync[] = await userApi.myEvents();
        normalized = list.map((b) => ({
          id: b.id,
          title: b.title,
          description: b.description,
          start: parseISO(b.start_time),
          end: parseISO(b.end_time),
        }));
      }
      setEvents(normalized);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [user?.is_admin]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadEvents();
    }, [loadEvents])
  );

  const stepBack = () => {
    if (mode === 'year') setCursor(addYears(cursor, -1));
    else if (mode === 'month') setCursor(addMonths(cursor, -1));
    else setCursor(addDays(cursor, -7));
  };
  const stepFwd = () => {
    if (mode === 'year') setCursor(addYears(cursor, 1));
    else if (mode === 'month') setCursor(addMonths(cursor, 1));
    else setCursor(addDays(cursor, 7));
  };
  const jumpToday = () => setCursor(new Date());

  const headerLabel = useMemo(() => {
    if (mode === 'year') return format(cursor, 'yyyy');
    if (mode === 'month') return format(cursor, 'MMMM yyyy');
    const s = startOfWeek(cursor);
    const e = endOfWeek(cursor);
    return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
  }, [cursor, mode]);

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="calendar-screen">
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>Calendar</Text>
          <Text style={styles.title}>{headerLabel}</Text>
        </View>
        <Pressable testID="calendar-today" onPress={jumpToday} style={styles.todayBtn}>
          <Ionicons name="locate-outline" size={16} color={colors.brand} />
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>

      {/* Navigation */}
      <View style={styles.navRow}>
        <Pressable testID="calendar-prev" onPress={stepBack} style={styles.navBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
        </Pressable>
        <ModeToggle mode={mode} onChange={setMode} />
        <Pressable testID="calendar-next" onPress={stepFwd} style={styles.navBtn} hitSlop={10}>
          <Ionicons name="chevron-forward" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      {mode === 'year' && (
        <YearView
          cursor={cursor}
          events={events}
          onPickMonth={(d) => {
            setCursor(d);
            setMode('month');
          }}
        />
      )}
      {mode === 'month' && (
        <MonthView
          cursor={cursor}
          events={events}
          onPickDay={(d) => {
            setCursor(d);
            setMode('week');
          }}
        />
      )}
      {mode === 'week' && (
        <WeekView
          cursor={cursor}
          events={events}
          onPickEvent={(e) => setSelectedEvent(e)}
          loading={loading}
        />
      )}

      <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Mode toggle (Year / Month / Week)
// ---------------------------------------------------------------------------
function ModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const options: { key: ViewMode; label: string }[] = [
    { key: 'year', label: 'Year' },
    { key: 'month', label: 'Month' },
    { key: 'week', label: 'Week' },
  ];
  return (
    <View style={styles.toggleWrap}>
      {options.map((o) => {
        const active = o.key === mode;
        return (
          <Pressable
            key={o.key}
            testID={`calendar-mode-${o.key}`}
            onPress={() => onChange(o.key)}
            style={[styles.toggleBtn, active && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Year view — 3x4 mini-month grid
// ---------------------------------------------------------------------------
function YearView({
  cursor,
  events,
  onPickMonth,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onPickMonth: (d: Date) => void;
}) {
  const yearStart = startOfYear(cursor);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(yearStart, i));
  return (
    <ScrollView contentContainerStyle={styles.yearGrid} showsVerticalScrollIndicator={false}>
      {months.map((m) => (
        <Pressable
          key={m.toISOString()}
          testID={`calendar-year-month-${format(m, 'MM')}`}
          onPress={() => onPickMonth(m)}
          style={styles.yearCell}
        >
          <Text style={styles.yearMonthLabel}>{format(m, 'MMM')}</Text>
          <MiniMonth month={m} events={events} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

function MiniMonth({ month, events }: { month: Date; events: CalendarEvent[] }) {
  const start = startOfWeek(startOfMonth(month));
  const end = endOfWeek(endOfMonth(month));
  const days = eachDayOfInterval({ start, end });
  return (
    <View style={styles.miniGrid}>
      {days.map((d) => {
        const inMonth = isSameMonth(d, month);
        const today = isToday(d);
        const hasEvent = events.some((e) => isSameDay(e.start, d));
        return (
          <View key={d.toISOString()} style={styles.miniCell}>
            <Text
              style={[
                styles.miniDay,
                !inMonth && styles.miniDayOut,
                today && styles.miniDayToday,
                hasEvent && !today && styles.miniDayEvent,
              ]}
            >
              {format(d, 'd')}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Month view — 7x6 grid with event dots
// ---------------------------------------------------------------------------
function MonthView({
  cursor,
  events,
  onPickDay,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onPickDay: (d: Date) => void;
}) {
  const start = startOfWeek(startOfMonth(cursor));
  const end = endOfWeek(endOfMonth(cursor));
  const days = eachDayOfInterval({ start, end });
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing['2xl'] }}>
      <View style={styles.weekdayHeader}>
        {WEEKDAY_LABELS.map((w) => (
          <Text key={w} style={styles.weekdayLabel}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.monthGrid}>
        {days.map((d) => {
          const inMonth = isSameMonth(d, cursor);
          const today = isToday(d);
          const dayEvents = events.filter((e) => isSameDay(e.start, d));
          return (
            <Pressable
              key={d.toISOString()}
              testID={`calendar-day-${format(d, 'yyyy-MM-dd')}`}
              onPress={() => onPickDay(d)}
              style={styles.monthCell}
            >
              <View style={[styles.monthDayWrap, today && styles.monthDayWrapToday]}>
                <Text
                  style={[
                    styles.monthDay,
                    !inMonth && styles.monthDayOut,
                    today && styles.monthDayToday,
                  ]}
                >
                  {format(d, 'd')}
                </Text>
              </View>
              <View style={styles.dotRow}>
                {dayEvents.slice(0, 3).map((_, i) => (
                  <View key={i} style={styles.dot} />
                ))}
                {dayEvents.length > 3 && (
                  <Text style={styles.moreDots}>+{dayEvents.length - 3}</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Week view — 7 day columns + hour rows, events rendered as blocks
// ---------------------------------------------------------------------------
const HOUR_HEIGHT = 56;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function WeekView({
  cursor,
  events,
  onPickEvent,
  loading,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onPickEvent: (e: CalendarEvent) => void;
  loading: boolean;
}) {
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const screenW = Dimensions.get('window').width;
  const sidebarW = 48;
  const colW = (screenW - spacing.lg * 2 - sidebarW) / 7;

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
      showsVerticalScrollIndicator={false}
    >
      {/* Day headers */}
      <View style={[styles.weekHeaderRow, { paddingLeft: sidebarW }]}>
        {days.map((d) => {
          const today = isToday(d);
          return (
            <View key={d.toISOString()} style={[styles.weekDayHeader, { width: colW }]}>
              <Text style={styles.weekDayName}>{format(d, 'EEE').toUpperCase()}</Text>
              <View style={[styles.weekDayBubble, today && styles.weekDayBubbleToday]}>
                <Text
                  style={[styles.weekDayNum, today && styles.weekDayNumToday]}
                >
                  {format(d, 'd')}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {loading ? (
        <View style={{ padding: spacing['2xl'], alignItems: 'center' }}>
          <Text style={{ color: colors.muted }}>Loading…</Text>
        </View>
      ) : (
        <View style={styles.weekGridWrap}>
          {/* Hour sidebar + grid */}
          <View style={[styles.hourSidebar, { width: sidebarW }]}>
            {HOURS.map((h) => (
              <View key={h} style={[styles.hourLabel, { height: HOUR_HEIGHT }]}>
                <Text style={styles.hourText}>{formatHourLabel(h)}</Text>
              </View>
            ))}
          </View>
          <View style={{ flex: 1, position: 'relative' }}>
            {/* Hour grid lines */}
            {HOURS.map((h) => (
              <View
                key={h}
                style={[styles.hourLine, { top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }]}
              />
            ))}
            {/* Day column dividers */}
            <View style={styles.dayDividers}>
              {days.map((d, i) => (
                <View
                  key={d.toISOString()}
                  style={[
                    styles.dayDivider,
                    { left: i * colW, width: colW, height: HOUR_HEIGHT * 24 },
                  ]}
                />
              ))}
            </View>
            {/* Event blocks */}
            {days.map((day, dayIdx) => {
              const dayEvents = events.filter((e) => isSameDay(e.start, day));
              return dayEvents.map((ev) => {
                const startMin = ev.start.getHours() * 60 + ev.start.getMinutes();
                const endMin = ev.end.getHours() * 60 + ev.end.getMinutes();
                const top = (startMin / 60) * HOUR_HEIGHT;
                const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 22);
                return (
                  <Pressable
                    key={ev.id}
                    testID={`calendar-event-${ev.id}`}
                    onPress={() => onPickEvent(ev)}
                    style={[
                      styles.eventBlock,
                      { left: dayIdx * colW + 2, width: colW - 4, top, height },
                    ]}
                  >
                    <Text style={styles.eventTitle} numberOfLines={1}>
                      {ev.title}
                    </Text>
                    <Text style={styles.eventTime} numberOfLines={1}>
                      {format(ev.start, 'HH:mm')}
                    </Text>
                  </Pressable>
                );
              });
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function formatHourLabel(h: number) {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return format(d, 'h a').toLowerCase();
}

// ---------------------------------------------------------------------------
// Event details modal
// ---------------------------------------------------------------------------
function EventDetailsModal({
  event,
  onClose,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={!!event}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          {event && (
            <>
              <View style={styles.modalHeader}>
                <View style={styles.eventIconBig}>
                  <Ionicons name="calendar" size={20} color={colors.onBrandTertiary} />
                </View>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.muted} />
                </Pressable>
              </View>
              <Text style={styles.modalTitle}>{event.title}</Text>
              <View style={styles.modalRow}>
                <Ionicons name="time-outline" size={16} color={colors.muted} />
                <Text style={styles.modalMeta}>
                  {format(event.start, 'EEE, MMM d · HH:mm')} – {format(event.end, 'HH:mm')}
                </Text>
              </View>
              {event.description ? (
                <Text style={styles.modalDesc}>{event.description}</Text>
              ) : null}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  eyebrow: {
    fontSize: type.sm,
    color: colors.muted,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: { fontSize: type.xl, fontWeight: '500', color: colors.onSurface },
  todayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSecondary,
  },
  todayText: { color: colors.brand, fontWeight: '500', fontSize: type.sm },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  toggleWrap: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.pill,
    padding: 2,
  },
  toggleBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.pill },
  toggleBtnActive: { backgroundColor: colors.brand },
  toggleText: { color: colors.muted, fontWeight: '500', fontSize: type.sm },
  toggleTextActive: { color: colors.onBrandPrimary },

  // Year
  yearGrid: {
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  yearCell: {
    width: `${100 / 3 - 2}%`,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.sm,
    ...shadow.card,
  },
  yearMonthLabel: {
    fontSize: type.sm,
    fontWeight: '500',
    color: colors.brand,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  miniCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  miniDay: { fontSize: 9, color: colors.onSurface },
  miniDayOut: { color: '#CCC' },
  miniDayToday: {
    color: colors.onBrandPrimary,
    backgroundColor: colors.brand,
    width: 14,
    height: 14,
    borderRadius: 7,
    textAlign: 'center',
    lineHeight: 14,
    overflow: 'hidden',
  },
  miniDayEvent: { color: colors.brand, fontWeight: '700' },

  // Month
  weekdayHeader: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.xs },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    color: colors.muted,
    fontSize: type.sm - 1,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  monthGrid: { paddingHorizontal: spacing.lg, flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.9,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  monthDayWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthDayWrapToday: { backgroundColor: colors.brand },
  monthDay: { fontSize: type.base, color: colors.onSurface },
  monthDayOut: { color: '#C8C8C8' },
  monthDayToday: { color: colors.onBrandPrimary, fontWeight: '500' },
  dotRow: { flexDirection: 'row', marginTop: 2, alignItems: 'center', gap: 2, minHeight: 8 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brand },
  moreDots: { color: colors.muted, fontSize: 9 },

  // Week
  weekHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
  },
  weekDayHeader: { alignItems: 'center', gap: 2 },
  weekDayName: { fontSize: type.sm - 1, color: colors.muted, letterSpacing: 0.5 },
  weekDayBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayBubbleToday: { backgroundColor: colors.brand },
  weekDayNum: { fontSize: type.base, color: colors.onSurface, fontWeight: '500' },
  weekDayNumToday: { color: colors.onBrandPrimary },
  weekGridWrap: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  hourSidebar: { paddingTop: 4 },
  hourLabel: { alignItems: 'flex-end', paddingRight: spacing.xs },
  hourText: { fontSize: 10, color: colors.muted },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  dayDividers: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  dayDivider: {
    position: 'absolute',
    top: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.divider,
  },
  eventBlock: {
    position: 'absolute',
    backgroundColor: colors.brandTertiary,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  eventTitle: {
    color: colors.onBrandTertiary,
    fontSize: 11,
    fontWeight: '500',
  },
  eventTime: { color: colors.brand, fontSize: 9, marginTop: 1 },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  eventIconBig: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: { fontSize: type.xl, fontWeight: '500', color: colors.onSurface },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  modalMeta: { fontSize: type.sm, color: colors.muted },
  modalDesc: { fontSize: type.base, color: colors.onSurfaceTertiary, marginTop: spacing.sm, lineHeight: 20 },
});
