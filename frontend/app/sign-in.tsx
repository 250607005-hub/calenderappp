import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { auth } from '@/src/lib/api';
import { useGoogleAuthServerCode } from '@/src/lib/google-auth';
import { useAuth } from '@/src/lib/auth-context';
import { registerForPush } from '@/src/lib/push';
import { colors, radius, shadow, spacing, type } from '@/src/theme';

const HERO =
  'https://images.pexels.com/photos/13709181/pexels-photo-13709181.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940';

export default function SignIn() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { isReady, signIn: googleSignIn, isConfigured } = useGoogleAuthServerCode();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);

  // Handle real Google Sign-In
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isConfigured) {
        // Fallback to mock mode
        const targetEmail = email.trim() || 'user@calsync.app';
        const targetName = name.trim() || 'Demo User';
        const res = await auth.googleMobile(undefined, targetEmail, targetName);
        await signIn(res.token, res.user);
        void registerForPush(res.user.id);
        router.replace('/(tabs)');
        return;
      }

      const result = await googleSignIn();

      if (result.type === 'success' && result.serverAuthCode) {
        // Send server auth code to backend
        const res = await auth.googleMobile(result.serverAuthCode);
        await signIn(res.token, res.user);
        void registerForPush(res.user.id);
        router.replace('/(tabs)');
      } else if (result.type === 'cancel') {
        setError('Sign in cancelled');
      } else {
        setError(result.error || 'Sign in failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const doSignIn = async (asAdmin: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const targetEmail =
        email.trim() || (asAdmin ? 'admin@calsync.app' : 'user@calsync.app');
      const targetName =
        name.trim() || (asAdmin ? 'Admin User' : 'Demo User');
      const res = await auth.googleMobile(undefined, targetEmail, targetName);
      await signIn(res.token, res.user);
      void registerForPush(res.user.id);
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root} testID="sign-in-screen">
      <Image source={{ uri: HERO }} style={styles.hero} contentFit="cover" />
      <LinearGradient
        colors={['rgba(13,13,13,0)', 'rgba(13,13,13,0.35)', 'rgba(13,13,13,0.95)']}
        style={styles.scrim}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroBlock}>
              <View style={styles.badge}>
                <Ionicons name="calendar" size={14} color={colors.onBrandPrimary} />
                <Text style={styles.badgeText}>CalSync Admin</Text>
              </View>
              <Text style={styles.title}>One calendar.{'\n'}One broadcast.</Text>
              <Text style={styles.subtitle}>
                Push events to every linked Google Calendar with a single tap.
              </Text>
            </View>

            <View style={styles.card}>
              {showEmail && (
                <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
                  <View>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      testID="sign-in-email-input"
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      style={styles.input}
                    />
                  </View>
                  <View>
                    <Text style={styles.label}>Name (optional)</Text>
                    <TextInput
                      testID="sign-in-name-input"
                      value={name}
                      onChangeText={setName}
                      placeholder="Jane Doe"
                      placeholderTextColor={colors.muted}
                      style={styles.input}
                    />
                  </View>
                </View>
              )}

              <Pressable
                testID="sign-in-google-button"
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
                onPress={handleGoogleSignIn}
                disabled={loading || !isReady}
              >
                {loading ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={18} color={colors.onBrandPrimary} />
                    <Text style={styles.primaryBtnText}>
                      {isConfigured ? 'Continue with Google' : 'Continue with Google (Demo)'}
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                testID="sign-in-as-admin-button"
                onPress={() => {
                  setEmail('admin@calsync.app');
                  setName('Admin User');
                  void doSignIn(true);
                }}
                style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
                disabled={loading}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.onSurface} />
                <Text style={styles.secondaryBtnText}>Sign in as Admin (demo)</Text>
              </Pressable>

              <Pressable
                testID="sign-in-toggle-email"
                onPress={() => setShowEmail((v) => !v)}
                style={styles.linkBtn}
              >
                <Text style={styles.linkText}>
                  {showEmail ? 'Hide custom email' : 'Use a custom email'}
                </Text>
              </Pressable>

              {error && (
                <Text testID="sign-in-error" style={styles.error}>
                  {error}
                </Text>
              )}

              <Text style={styles.fineprint}>
                {isConfigured
                  ? 'Sign in with Google to sync events to your calendar.'
                  : 'Demo mode: Google OAuth is mocked until backend keys are configured.'}
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0D' },
  hero: { ...StyleSheet.absoluteFillObject, height: '55%' },
  scrim: { ...StyleSheet.absoluteFillObject, height: '55%' },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'flex-end', padding: spacing.xl, gap: spacing.xl },
  heroBlock: { gap: spacing.md, marginBottom: spacing.xl },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
  },
  badgeText: {
    color: colors.onBrandPrimary,
    fontSize: type.sm,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  title: { color: '#FFF', fontSize: type.display, lineHeight: 38, fontWeight: '500' },
  subtitle: { color: '#E5E5E5', fontSize: type.lg, lineHeight: 22 },
  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.card,
  },
  label: {
    fontSize: type.sm,
    color: colors.muted,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: type.lg,
    color: colors.onSurface,
    backgroundColor: colors.surface,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: type.lg, fontWeight: '500' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  secondaryBtnText: { color: colors.onSurface, fontSize: type.base, fontWeight: '500' },
  linkBtn: { alignSelf: 'center', paddingVertical: spacing.sm },
  linkText: { color: colors.brand, fontSize: type.sm, fontWeight: '500' },
  error: {
    color: colors.error,
    fontSize: type.sm,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  fineprint: {
    color: colors.muted,
    fontSize: type.sm - 1,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: spacing.sm,
  },
});
