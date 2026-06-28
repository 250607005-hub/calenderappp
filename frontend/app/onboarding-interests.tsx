/**
 * One-time interest selection screen shown after the user's first login.
 * Saves to backend; AuthGate routes here whenever user.interests is empty.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { auth } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth-context';
import { ALL_INTERESTS, type InterestKey } from '@/src/lib/categories';
import { colors, radius, shadow, spacing, type } from '@/src/theme';

export default function OnboardingInterests() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [selected, setSelected] = useState<Set<InterestKey>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (k: InterestKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      // "all" is mutually exclusive: picking it clears the others.
      if (k === 'all') {
        if (next.has('all')) {
          next.delete('all');
        } else {
          next.clear();
          next.add('all');
        }
      } else {
        next.delete('all');
        if (next.has(k)) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const submit = async () => {
    if (selected.size === 0) {
      setError('Lütfen en az bir seçim yap (veya "Kafam karıştı / Hepsi").');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await auth.setInterests(Array.from(selected));
      await refresh();
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']} testID="onboarding-screen">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.iconBlock}>
          <View style={styles.iconCircle}>
            <Ionicons name="compass" size={28} color={colors.onBrandPrimary} />
          </View>
        </View>
        <Text style={styles.eyebrow}>Bir kerelik soru</Text>
        <Text style={styles.title}>Neyle ilgileniyorsun?</Text>
        <Text style={styles.subtitle}>
          Seçtiklerine göre takvimine yalnızca sana uygun ilanlar düşecek. Birden fazla
          seçebilirsin.
        </Text>

        <View style={styles.list}>
          {ALL_INTERESTS.map((opt) => {
            const active = selected.has(opt.key);
            const special = opt.key === 'all';
            return (
              <Pressable
                key={opt.key}
                testID={`interest-${opt.key}`}
                onPress={() => toggle(opt.key)}
                style={({ pressed }) => [
                  styles.row,
                  active && styles.rowActive,
                  special && styles.rowSpecial,
                  special && active && styles.rowSpecialActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View
                  style={[
                    styles.rowIcon,
                    active && styles.rowIconActive,
                    special && styles.rowIconSpecial,
                  ]}
                >
                  <Ionicons
                    name={opt.icon}
                    size={20}
                    color={active ? colors.onBrandPrimary : colors.onBrandTertiary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, active && styles.rowLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.rowHint, active && styles.rowHintActive]}>
                    {opt.description}
                  </Text>
                </View>
                {active && (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={colors.onBrandPrimary}
                  />
                )}
              </Pressable>
            );
          })}
        </View>

        {error && (
          <Text testID="onboarding-error" style={styles.error}>
            {error}
          </Text>
        )}
      </ScrollView>

      <View style={styles.stickyBar}>
        <Pressable
          testID="onboarding-continue"
          disabled={saving || selected.size === 0}
          onPress={submit}
          style={({ pressed }) => [
            styles.cta,
            (saving || selected.size === 0) && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {saving ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <>
              <Text style={styles.ctaText}>
                Devam et{selected.size > 0 ? `  ·  ${selected.size}` : ''}
              </Text>
              <Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} />
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { padding: spacing.xl, paddingBottom: spacing['3xl'] },
  iconBlock: { alignItems: 'center', marginVertical: spacing.lg },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  eyebrow: {
    textAlign: 'center',
    fontSize: type.sm,
    color: colors.muted,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    textAlign: 'center',
    fontSize: type.display - 4,
    fontWeight: '500',
    color: colors.onSurface,
    marginTop: spacing.xs,
  },
  subtitle: {
    textAlign: 'center',
    fontSize: type.base,
    color: colors.muted,
    lineHeight: 22,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  rowSpecial: {
    backgroundColor: colors.brandSecondary,
    borderColor: colors.brandTertiary,
  },
  rowSpecialActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconActive: { backgroundColor: 'rgba(255,255,255,0.18)' },
  rowIconSpecial: { backgroundColor: colors.brandTertiary },
  rowLabel: { fontSize: type.lg, fontWeight: '500', color: colors.onSurface },
  rowLabelActive: { color: colors.onBrandPrimary },
  rowHint: { fontSize: type.sm, color: colors.muted, marginTop: 2 },
  rowHintActive: { color: 'rgba(255,255,255,0.85)' },
  error: { color: colors.error, fontSize: type.sm, marginTop: spacing.md, textAlign: 'center' },
  stickyBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  cta: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
  },
  ctaText: { color: colors.onBrandPrimary, fontSize: type.lg, fontWeight: '500' },
});
