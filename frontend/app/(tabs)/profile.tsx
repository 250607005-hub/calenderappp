import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { auth as authApi } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth-context';
import { colors, radius, shadow, spacing, type } from '@/src/theme';

export default function Profile() {
  const router = useRouter();
  const { user, signOut, refresh } = useAuth();
  const [permission, setPermission] = useState<string>('unknown');
  const [busy, setBusy] = useState(false);

  const checkPermission = useCallback(async () => {
    if (Platform.OS === 'web') return setPermission('not-supported');
    try {
      const Notifications = await import('expo-notifications');
      const p = await Notifications.getPermissionsAsync();
      setPermission(p.status);
    } catch {
      setPermission('error');
    }
  }, []);

  useEffect(() => {
    void checkPermission();
  }, [checkPermission]);

  const disconnectGoogle = async () => {
    setBusy(true);
    try {
      await authApi.disconnectGoogle();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = async () => {
    await signOut();
    router.replace('/sign-in');
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="profile-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || '?').charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          {user?.is_admin && (
            <View style={styles.adminPill}>
              <Ionicons name="shield-checkmark" size={12} color={colors.onBrandSecondary} />
              <Text style={styles.adminPillText}>Administrator</Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <Row
            icon="link-outline"
            label="Google Calendar"
            value={user?.google_connected ? 'Linked' : 'Not linked'}
            tint={user?.google_connected ? colors.success : colors.warning}
          />
          <Divider />
          <Row
            icon="notifications-outline"
            label="Push Notifications"
            value={permission === 'granted' ? 'Allowed' : permission}
            tint={permission === 'granted' ? colors.success : colors.muted}
          />
          <Divider />
          <Row icon="finger-print-outline" label="User ID" value={user?.id.slice(0, 8) + '…'} />
        </View>

        <Text style={styles.sectionLabel}>Actions</Text>
        <View style={styles.card}>
          {!user?.is_admin && (
            <>
              <Pressable
                testID="edit-interests-button"
                onPress={() => router.push('/onboarding-interests')}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="compass-outline" size={18} color={colors.onBrandTertiary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionLabel}>İlgi alanlarım</Text>
                  <Text style={styles.actionHint}>
                    {(user?.interests ?? []).length === 0
                      ? 'Henüz seçilmedi'
                      : (user?.interests ?? []).includes('all')
                        ? 'Hepsi'
                        : `${(user?.interests ?? []).length} seçili`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
              <Divider />
            </>
          )}
          {user?.google_connected && (
            <>
              <Pressable
                testID="disconnect-google-button"
                onPress={disconnectGoogle}
                disabled={busy}
                style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
              >
                <View style={styles.actionIcon}>
                  <Ionicons name="unlink-outline" size={18} color={colors.onBrandTertiary} />
                </View>
                <Text style={styles.actionLabel}>Disconnect Google Calendar</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
              <Divider />
            </>
          )}
          <Pressable
            testID="sign-out-button"
            onPress={doSignOut}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#FAD5D2' }]}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.error }]}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
        </View>

        <Text style={styles.footer}>CalSync Admin · v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
  tint = colors.onBrandTertiary,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  tint?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={18} color={colors.onBrandTertiary} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: tint }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing['3xl'] },
  header: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xl },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: { color: colors.onBrandPrimary, fontSize: 28, fontWeight: '500' },
  name: { fontSize: type.xl, fontWeight: '500', color: colors.onSurface },
  email: { fontSize: type.base, color: colors.muted },
  adminPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSecondary,
    marginTop: spacing.sm,
  },
  adminPillText: { color: colors.onBrandSecondary, fontSize: type.sm, fontWeight: '500' },
  sectionLabel: {
    fontSize: type.sm,
    color: colors.muted,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.card,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  rowLabel: { fontSize: type.base, color: colors.onSurface, flex: 1 },
  rowValue: { fontSize: type.base, fontWeight: '500' },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  actionLabel: { fontSize: type.base, color: colors.onSurface, flex: 1, fontWeight: '500' },
  actionHint: { fontSize: type.sm, color: colors.muted, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: spacing.lg + 32 + spacing.md },
  footer: { textAlign: 'center', color: colors.muted, fontSize: type.sm, marginTop: spacing['2xl'] },
});
