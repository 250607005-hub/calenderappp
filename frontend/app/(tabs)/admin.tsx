import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { BlurView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FieldRow } from '@/src/components/FieldRow';
import { SelectSheet, type SelectOption } from '@/src/components/SelectSheet';
import { adminApi, type BroadcastEvent } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth-context';
import { CATEGORIES, type CategoryKey, categoryLabel } from '@/src/lib/categories';
import { colors, radius, shadow, spacing, type } from '@/src/theme';

type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';
type Visibility = 'default' | 'public' | 'private';
type BusyStatus = 'busy' | 'free';

const CATEGORY_OPTIONS: SelectOption<CategoryKey>[] = CATEGORIES.map((c) => ({
  value: c.key,
  label: c.label,
  hint: c.description,
}));

const HOUR_OPTIONS: SelectOption<number>[] = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${String(h).padStart(2, '0')}:00`,
}));

const MINUTE_OPTIONS: SelectOption<number>[] = Array.from({ length: 12 }, (_, i) => {
  const m = i * 5;
  return { value: m, label: `:${String(m).padStart(2, '0')}` };
});

const REMINDER_OPTIONS: SelectOption<number>[] = [
  { value: 0, label: 'No reminder', hint: 'Off' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

const RECURRENCE_OPTIONS: SelectOption<Recurrence>[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const VISIBILITY_OPTIONS: SelectOption<Visibility>[] = [
  { value: 'default', label: 'Calendar default', hint: 'Inherit from calendar' },
  { value: 'public', label: 'Public', hint: 'Anyone can see event details' },
  { value: 'private', label: 'Private', hint: 'Only invitees can see details' },
];

const BUSY_OPTIONS: SelectOption<BusyStatus>[] = [
  { value: 'busy', label: 'Busy', hint: 'Shows the slot as unavailable' },
  { value: 'free', label: 'Free', hint: 'Slot stays available' },
];

const recurrenceLabel = (v: Recurrence) =>
  RECURRENCE_OPTIONS.find((o) => o.value === v)?.label ?? '';
const reminderLabel = (m: number) =>
  REMINDER_OPTIONS.find((o) => o.value === m)?.label ?? `${m} minutes before`;
const visibilityLabel = (v: Visibility) =>
  VISIBILITY_OPTIONS.find((o) => o.value === v)?.label ?? '';
const busyLabel = (v: BusyStatus) => BUSY_OPTIONS.find((o) => o.value === v)?.label ?? '';

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Core
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState<Date>(() => new Date(Date.now() + 60 * 60 * 1000));
  const [end, setEnd] = useState<Date>(() => new Date(Date.now() + 2 * 60 * 60 * 1000));
  const [pickerOpen, setPickerOpen] = useState<null | 'start' | 'end'>(null);

  // Extra options
  const [category, setCategory] = useState<CategoryKey>('opportunities');
  const [reminder, setReminder] = useState(10);
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [visibility, setVisibility] = useState<Visibility>('default');
  const [busy, setBusy] = useState<BusyStatus>('busy');
  const [sendPush, setSendPush] = useState(true);
  const [canInvite, setCanInvite] = useState(true);
  const [canSeeGuests, setCanSeeGuests] = useState(true);
  const [canModify, setCanModify] = useState(false);

  // Sheet visibility flags (one boolean each — single sheet open at a time is fine here)
  const [sheet, setSheet] = useState<
    | null
    | 'reminder'
    | 'recurrence'
    | 'visibility'
    | 'busy'
    | 'category'
    | 'start-hour'
    | 'start-minute'
    | 'end-hour'
    | 'end-minute'
  >(null);

  const setHourOn = (which: 'start' | 'end', hour: number) => {
    const d = new Date(which === 'start' ? start : end);
    d.setHours(hour);
    if (which === 'start') {
      setStart(d);
      if (d >= end) setEnd(new Date(d.getTime() + 60 * 60 * 1000));
    } else {
      setEnd(d);
    }
  };

  const setMinuteOn = (which: 'start' | 'end', minute: number) => {
    const d = new Date(which === 'start' ? start : end);
    d.setMinutes(minute);
    if (which === 'start') {
      setStart(d);
      if (d >= end) setEnd(new Date(d.getTime() + 60 * 60 * 1000));
    } else {
      setEnd(d);
    }
  };

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [broadcasts, setBroadcasts] = useState<BroadcastEvent[]>([]);

  const loadBroadcasts = useCallback(async () => {
    try {
      const list = await adminApi.broadcasts();
      setBroadcasts(list);
    } catch {
      /* show empty */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBroadcasts();
    }, [loadBroadcasts])
  );

  const canSubmit = useMemo(
    () => title.trim().length > 0 && end > start && !submitting,
    [title, end, start, submitting]
  );

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await adminApi.broadcast({
        title: title.trim(),
        description: description.trim(),
        location: location.trim() || null,
        category,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        all_day: allDay,
        reminder_minutes: reminder,
        recurrence,
        visibility,
        busy_status: busy,
        send_push: sendPush,
        guests_can_invite_others: canInvite,
        guests_can_see_other_guests: canSeeGuests,
        guests_can_modify: canModify,
      });
      const pushMsg = sendPush ? ' · push sent' : ' · push skipped';
      setSuccess(
        `Broadcasted to ${res.success_count}/${res.recipients_count} users${pushMsg}` +
          (res.failure_count ? ` (${res.failure_count} failed)` : '')
      );
      setTitle('');
      setDescription('');
      setLocation('');
      void loadBroadcasts();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Broadcast failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user?.is_admin) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.lock}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.muted} />
          <Text style={styles.lockTitle}>Admin only</Text>
          <Text style={styles.lockSub}>This screen is restricted to administrators.</Text>
          <Pressable style={styles.btn} onPress={() => router.replace('/(tabs)')}>
            <Text style={styles.btnText}>Back to Dashboard</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="admin-dashboard-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 120 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerBlock}>
            <Text style={styles.eyebrow}>Admin Mode</Text>
            <Text style={styles.title}>Broadcast a new event</Text>
            <Text style={styles.sub}>
              Creates the event on your Google Calendar and pushes it to every linked user.
            </Text>
          </View>

          {/* TITLE — large, like Google */}
          <View style={styles.card}>
            <TextInput
              testID="admin-title-input"
              style={styles.titleInput}
              value={title}
              onChangeText={setTitle}
              placeholder="Add title"
              placeholderTextColor={colors.muted}
            />
          </View>

          {/* DATE / TIME */}
          <View style={styles.card}>
            <View style={[styles.row, { paddingVertical: spacing.md }]}>
              <View style={styles.iconLeft}>
                <Ionicons name="time-outline" size={18} color={colors.onBrandTertiary} />
              </View>
              <View style={{ flex: 1, gap: spacing.sm }}>
                {/* STARTS */}
                <View style={styles.timeRow}>
                  <Text style={styles.timeLabel}>Starts</Text>
                  <Pressable testID="admin-start-picker" onPress={() => setPickerOpen('start')} style={styles.dateChip}>
                    <Text style={styles.dateChipText}>{format(start, 'MMM d, yyyy')}</Text>
                  </Pressable>
                  {!allDay && (
                    <>
                      <Pressable testID="admin-start-hour" onPress={() => setSheet('start-hour')} style={styles.timeChip}>
                        <Text style={styles.timeChipText}>{String(start.getHours()).padStart(2, '0')}</Text>
                      </Pressable>
                      <Text style={styles.timeColon}>:</Text>
                      <Pressable testID="admin-start-minute" onPress={() => setSheet('start-minute')} style={styles.timeChip}>
                        <Text style={styles.timeChipText}>{String(start.getMinutes()).padStart(2, '0')}</Text>
                      </Pressable>
                    </>
                  )}
                </View>
                {/* ENDS */}
                <View style={styles.timeRow}>
                  <Text style={styles.timeLabel}>Ends</Text>
                  <Pressable testID="admin-end-picker" onPress={() => setPickerOpen('end')} style={styles.dateChip}>
                    <Text style={styles.dateChipText}>{format(end, 'MMM d, yyyy')}</Text>
                  </Pressable>
                  {!allDay && (
                    <>
                      <Pressable testID="admin-end-hour" onPress={() => setSheet('end-hour')} style={styles.timeChip}>
                        <Text style={styles.timeChipText}>{String(end.getHours()).padStart(2, '0')}</Text>
                      </Pressable>
                      <Text style={styles.timeColon}>:</Text>
                      <Pressable testID="admin-end-minute" onPress={() => setSheet('end-minute')} style={styles.timeChip}>
                        <Text style={styles.timeChipText}>{String(end.getMinutes()).padStart(2, '0')}</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            </View>
            <Divider />
            <FieldRow
              icon="sunny-outline"
              label="All day"
              testID="admin-all-day-row"
            >
              <Switch
                testID="admin-all-day-switch"
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor="#fff"
              />
            </FieldRow>
            <Divider />
            <FieldRow
              icon="repeat-outline"
              label="Repeat"
              value={recurrenceLabel(recurrence)}
              onPress={() => setSheet('recurrence')}
              testID="admin-recurrence-row"
            />

            {pickerOpen && (
              <DateTimePicker
                value={pickerOpen === 'start' ? start : end}
                mode="date"
                onChange={(_, d) => {
                  if (Platform.OS !== 'ios') setPickerOpen(null);
                  if (!d) return;
                  if (pickerOpen === 'start') {
                    // Preserve current time-of-day on start
                    const next = new Date(d);
                    next.setHours(start.getHours(), start.getMinutes(), 0, 0);
                    setStart(next);
                    if (next >= end) setEnd(new Date(next.getTime() + 60 * 60 * 1000));
                  } else {
                    const next = new Date(d);
                    next.setHours(end.getHours(), end.getMinutes(), 0, 0);
                    setEnd(next);
                  }
                }}
              />
            )}
            {Platform.OS === 'ios' && pickerOpen && (
              <Pressable onPress={() => setPickerOpen(null)} style={styles.linkBtn}>
                <Text style={styles.linkText}>Done</Text>
              </Pressable>
            )}
          </View>

          {/* LOCATION */}
          <Text style={styles.sectionLabel}>Kategori</Text>
          <View style={styles.card}>
            <FieldRow
              icon="pricetag-outline"
              label="Kategori"
              value={categoryLabel(category)}
              onPress={() => setSheet('category')}
              testID="admin-category-row"
            />
          </View>

          <View style={styles.card}>
            <View style={[styles.row, { paddingVertical: spacing.md }]}>
              <View style={styles.iconLeft}>
                <Ionicons name="location-outline" size={18} color={colors.onBrandTertiary} />
              </View>
              <TextInput
                testID="admin-location-input"
                value={location}
                onChangeText={setLocation}
                placeholder="Add a location"
                placeholderTextColor={colors.muted}
                style={styles.inlineInput}
              />
            </View>
          </View>

          {/* NOTIFICATION + PUSH */}
          <Text style={styles.sectionLabel}>Notification</Text>
          <View style={styles.card}>
            <FieldRow
              icon="notifications-outline"
              label="Calendar reminder"
              value={reminderLabel(reminder)}
              onPress={() => setSheet('reminder')}
              testID="admin-reminder-row"
            />
            <Divider />
            <FieldRow
              icon="send-outline"
              label="Send push notification"
              testID="admin-send-push-row"
            >
              <Switch
                testID="admin-send-push-switch"
                value={sendPush}
                onValueChange={setSendPush}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor="#fff"
              />
            </FieldRow>
          </View>

          {/* VISIBILITY + AVAILABILITY */}
          <Text style={styles.sectionLabel}>Availability & visibility</Text>
          <View style={styles.card}>
            <FieldRow
              icon="eye-outline"
              label="Visibility"
              value={visibilityLabel(visibility)}
              onPress={() => setSheet('visibility')}
              testID="admin-visibility-row"
            />
            <Divider />
            <FieldRow
              icon="briefcase-outline"
              label="Show me as"
              value={busyLabel(busy)}
              onPress={() => setSheet('busy')}
              testID="admin-busy-row"
            />
          </View>

          {/* GUEST PERMISSIONS */}
          <Text style={styles.sectionLabel}>Guest permissions</Text>
          <View style={styles.card}>
            <FieldRow
              icon="person-add-outline"
              label="Invite others"
              testID="admin-can-invite-row"
            >
              <Switch
                testID="admin-can-invite-switch"
                value={canInvite}
                onValueChange={setCanInvite}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor="#fff"
              />
            </FieldRow>
            <Divider />
            <FieldRow
              icon="people-outline"
              label="See guest list"
              testID="admin-can-see-guests-row"
            >
              <Switch
                testID="admin-can-see-guests-switch"
                value={canSeeGuests}
                onValueChange={setCanSeeGuests}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor="#fff"
              />
            </FieldRow>
            <Divider />
            <FieldRow
              icon="create-outline"
              label="Modify event"
              testID="admin-can-modify-row"
            >
              <Switch
                testID="admin-can-modify-switch"
                value={canModify}
                onValueChange={setCanModify}
                trackColor={{ false: colors.border, true: colors.brand }}
                thumbColor="#fff"
              />
            </FieldRow>
          </View>

          {/* DESCRIPTION */}
          <Text style={styles.sectionLabel}>Description</Text>
          <View style={styles.card}>
            <TextInput
              testID="admin-description-input"
              style={styles.descInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Add description"
              placeholderTextColor={colors.muted}
              multiline
            />
          </View>

          {error && (
            <Text testID="admin-error" style={styles.error}>
              {error}
            </Text>
          )}
          {success && (
            <View testID="admin-success" style={styles.successBox}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.successText}>{success}</Text>
            </View>
          )}

          {/* PAST BROADCASTS */}
          <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>Past broadcasts</Text>
          {broadcasts.length === 0 ? (
            <View style={styles.emptyBroadcasts}>
              <Ionicons name="megaphone-outline" size={28} color={colors.muted} />
              <Text style={styles.emptySub}>No broadcasts yet. Send your first one above.</Text>
            </View>
          ) : (
            broadcasts.map((b) => (
              <View key={b.id} testID={`broadcast-row-${b.id}`} style={styles.bRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bTitle} numberOfLines={1}>{b.title}</Text>
                  <Text style={styles.bMeta}>
                    {new Date(b.created_at).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>
                    {b.success_count}/{Math.max(b.recipients_count, 1)}
                  </Text>
                  <Text style={styles.statLabel}>synced</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {/* Sticky glass broadcast CTA */}
        <View style={[styles.stickyWrap, { paddingBottom: insets.bottom + spacing.md }]}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 50 : 90}
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            testID="admin-broadcast-button"
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [
              styles.broadcastBtn,
              !canSubmit && { opacity: 0.5 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color={colors.onBrandPrimary} />
            ) : (
              <>
                <Ionicons name="megaphone" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.broadcastBtnText}>Broadcast to All Users</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Select sheets */}
      <SelectSheet
        visible={sheet === 'category'}
        title="Kategori"
        value={category}
        options={CATEGORY_OPTIONS}
        onSelect={(v) => setCategory(v)}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === 'reminder'}
        title="Calendar reminder"
        value={reminder}
        options={REMINDER_OPTIONS}
        onSelect={(v) => setReminder(v)}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === 'recurrence'}
        title="Repeat"
        value={recurrence}
        options={RECURRENCE_OPTIONS}
        onSelect={(v) => setRecurrence(v)}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === 'visibility'}
        title="Visibility"
        value={visibility}
        options={VISIBILITY_OPTIONS}
        onSelect={(v) => setVisibility(v)}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === 'busy'}
        title="Show me as"
        value={busy}
        options={BUSY_OPTIONS}
        onSelect={(v) => setBusy(v)}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === 'start-hour'}
        title="Start hour"
        value={start.getHours()}
        options={HOUR_OPTIONS}
        onSelect={(v) => setHourOn('start', v)}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === 'start-minute'}
        title="Start minute"
        value={start.getMinutes() - (start.getMinutes() % 5)}
        options={MINUTE_OPTIONS}
        onSelect={(v) => setMinuteOn('start', v)}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === 'end-hour'}
        title="End hour"
        value={end.getHours()}
        options={HOUR_OPTIONS}
        onSelect={(v) => setHourOn('end', v)}
        onClose={() => setSheet(null)}
      />
      <SelectSheet
        visible={sheet === 'end-minute'}
        title="End minute"
        value={end.getMinutes() - (end.getMinutes() % 5)}
        options={MINUTE_OPTIONS}
        onSelect={(v) => setMinuteOn('end', v)}
        onClose={() => setSheet(null)}
      />
    </SafeAreaView>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, gap: spacing.md },
  headerBlock: { gap: spacing.xs, marginBottom: spacing.sm },
  eyebrow: {
    fontSize: type.sm,
    color: colors.muted,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: { fontSize: type.xl, fontWeight: '500', color: colors.onSurface },
  sub: { fontSize: type.base, color: colors.muted, lineHeight: 20 },
  sectionLabel: {
    fontSize: type.sm,
    color: colors.muted,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    ...shadow.card,
    overflow: 'hidden',
  },
  titleInput: {
    fontSize: type.xl,
    fontWeight: '500',
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  iconLeft: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dtLine: { fontSize: type.sm, color: colors.muted },
  dtValue: { color: colors.onSurface, fontWeight: '500', fontSize: type.base },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  timeLabel: { fontSize: type.sm, color: colors.muted, width: 48 },
  dateChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
  },
  dateChipText: { color: colors.onSurface, fontWeight: '500', fontSize: type.base },
  timeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.brandSecondary,
    borderRadius: radius.md,
    minWidth: 44,
    alignItems: 'center',
  },
  timeChipText: { color: colors.onBrandSecondary, fontWeight: '500', fontSize: type.base },
  timeColon: { fontSize: type.lg, color: colors.muted, marginHorizontal: -spacing.xs },
  inlineInput: {
    flex: 1,
    fontSize: type.base,
    color: colors.onSurface,
    paddingVertical: spacing.sm,
  },
  descInput: {
    minHeight: 100,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    fontSize: type.base,
    color: colors.onSurface,
    textAlignVertical: 'top',
  },
  linkBtn: { alignSelf: 'flex-end', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  linkText: { color: colors.brand, fontWeight: '500' },
  error: { color: colors.error, fontSize: type.sm, paddingHorizontal: spacing.xs },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.brandSecondary,
    borderRadius: radius.md,
  },
  successText: { color: colors.onBrandSecondary, fontSize: type.sm, flex: 1 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 32 + spacing.md,
  },

  stickyWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  broadcastBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
  },
  broadcastBtnText: { color: colors.onBrandPrimary, fontSize: type.lg, fontWeight: '500' },

  emptyBroadcasts: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptySub: { fontSize: type.sm, color: colors.muted, textAlign: 'center' },
  bRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  bTitle: { fontSize: type.base, fontWeight: '500', color: colors.onSurface },
  bMeta: { fontSize: type.sm, color: colors.muted, marginTop: 2 },
  statBox: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.md,
  },
  statNum: { color: colors.onBrandTertiary, fontWeight: '500', fontSize: type.base },
  statLabel: { color: colors.onBrandTertiary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  lock: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  lockTitle: { fontSize: type.xl, fontWeight: '500', color: colors.onSurface, marginTop: spacing.md },
  lockSub: { fontSize: type.base, color: colors.muted, textAlign: 'center' },
  btn: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  btnText: { color: colors.onBrandPrimary, fontWeight: '500' },
});
