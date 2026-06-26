import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { userApi, type UserEventSync } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth-context';
import { colors, radius, shadow, spacing, type } from '@/src/theme';

function formatRange(startIso: string, endIso: string) {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sameDay = s.toDateString() === e.toDateString();
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  if (sameDay) {
    const endShort = e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${s.toLocaleString([], opts)} – ${endShort}`;
  }
  return `${s.toLocaleString([], opts)} → ${e.toLocaleString([], opts)}`;
}

export default function UserDashboard() {
  const { user, refresh } = useAuth();
  const [events, setEvents] = useState<UserEventSync[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await userApi.myEvents();
      setEvents(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
      void refresh();
    }, [load, refresh])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const linked = !!user?.google_connected;

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="user-dashboard-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hello, {user?.name.split(' ')[0] || 'there'}</Text>
          <Text style={styles.subtitle}>{user?.email}</Text>
        </View>
        {user?.is_admin && (
          <View style={styles.adminPill}>
            <Ionicons name="shield-checkmark" size={12} color={colors.onBrandSecondary} />
            <Text style={styles.adminPillText}>Admin</Text>
          </View>
        )}
      </View>

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        ListHeaderComponent={
          <>
            <View
              testID="connection-status-card"
              style={[styles.statusCard, linked ? styles.statusCardLinked : styles.statusCardUnlinked]}
            >
              <View style={styles.statusIconWrap}>
                <Ionicons
                  name={linked ? 'checkmark-circle' : 'alert-circle-outline'}
                  size={24}
                  color={linked ? colors.success : colors.warning}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.statusTitle}>
                  {linked ? 'Google Account Linked' : 'Google Account Not Linked'}
                </Text>
                <Text style={styles.statusSub}>
                  {linked
                    ? 'New broadcasts will sync automatically.'
                    : 'Sign in again to authorize Google Calendar access.'}
                </Text>
              </View>
              <View style={[styles.dot, { backgroundColor: linked ? colors.success : colors.warning }]} />
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.section}>Sync History</Text>
              <Pressable testID="refresh-history" onPress={onRefresh} hitSlop={10}>
                <Ionicons name="refresh" size={18} color={colors.muted} />
              </Pressable>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <View testID={`event-row-${item.id}`} style={styles.eventRow}>
            <View style={styles.eventIconWrap}>
              <Ionicons name="calendar" size={18} color={colors.onBrandTertiary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.eventTime} numberOfLines={1}>
                {formatRange(item.start_time, item.end_time)}
              </Text>
              {item.description ? (
                <Text style={styles.eventDesc} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <View style={[styles.tag, tagStyle(item.status)]}>
              <Text style={[styles.tagText, { color: tagTextColor(item.status) }]}>
                {item.status}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.brand} />
            </View>
          ) : error ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={36} color={colors.error} />
              <Text style={styles.emptyTitle}>Could not fetch history</Text>
              <Text style={styles.emptySub}>{error}</Text>
              <Pressable testID="retry-history" onPress={onRefresh} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty} testID="empty-state">
              <Ionicons name="calendar-outline" size={36} color={colors.muted} />
              <Text style={styles.emptyTitle}>No events synced yet</Text>
              <Text style={styles.emptySub}>
                Waiting for an admin broadcast — your calendar history will appear here.
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

function tagStyle(status: UserEventSync['status']) {
  if (status === 'synced') return { backgroundColor: colors.brandTertiary };
  if (status === 'mock') return { backgroundColor: colors.surfaceTertiary };
  return { backgroundColor: '#FAD5D2' };
}
function tagTextColor(status: UserEventSync['status']) {
  if (status === 'synced') return colors.onBrandTertiary;
  if (status === 'mock') return colors.onSurfaceTertiary;
  return colors.error;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  hello: { fontSize: type.xl, fontWeight: '500', color: colors.onSurface },
  subtitle: { fontSize: type.sm, color: colors.muted, marginTop: 2 },
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSecondary,
  },
  adminPillText: { color: colors.onBrandSecondary, fontSize: type.sm, fontWeight: '500' },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    ...shadow.card,
  },
  statusCardLinked: { borderColor: colors.brandTertiary },
  statusCardUnlinked: { borderColor: colors.border },
  statusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { fontSize: type.lg, fontWeight: '500', color: colors.onSurface },
  statusSub: { fontSize: type.sm, color: colors.muted, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  section: { fontSize: type.base, fontWeight: '500', color: colors.muted, letterSpacing: 0.4, textTransform: 'uppercase' },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  eventIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTitle: { fontSize: type.base, fontWeight: '500', color: colors.onSurface },
  eventTime: { fontSize: type.sm, color: colors.muted, marginTop: 2 },
  eventDesc: { fontSize: type.sm, color: colors.onSurfaceTertiary, marginTop: 4 },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  tagText: { fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  empty: { alignItems: 'center', paddingVertical: spacing['3xl'], gap: spacing.sm },
  emptyTitle: { fontSize: type.lg, fontWeight: '500', color: colors.onSurface, marginTop: spacing.sm },
  emptySub: { fontSize: type.sm, color: colors.muted, textAlign: 'center', paddingHorizontal: spacing.xl },
  retryBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
  },
  retryText: { color: colors.onBrandPrimary, fontWeight: '500' },
});
