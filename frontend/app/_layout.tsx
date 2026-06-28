import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { LogBox, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider, useAuth } from '@/src/lib/auth-context';

// Push setup at module scope — guarded for web.
if (Platform.OS !== 'web') {
  // Lazy require to avoid web bundling.
  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}
if (Platform.OS === 'android') {
  const Notifications = require('expo-notifications');
  Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
  });
}

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'sign-in';
    const inOnboarding = segments[0] === 'onboarding-interests';
    if (!user) {
      if (!inAuthGroup) router.replace('/sign-in');
      return;
    }
    // Regular users must pick at least one interest before entering the app.
    const needsInterests = !user.is_admin && (!user.interests || user.interests.length === 0);
    if (needsInterests && !inOnboarding) {
      router.replace('/onboarding-interests');
    } else if (!needsInterests && (inAuthGroup || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [user, loading, segments, router]);

  // Push tap handling
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const Notifications = require('expo-notifications');
    const Linking = require('expo-linking');
    const tapSub = Notifications.addNotificationResponseReceivedListener(
      (response: { notification: { request: { content: { data: Record<string, string> } } } }) => {
        const data = response.notification.request.content.data || {};
        const url = data.deeplink || data.action_url;
        if (!url) return;
        url.startsWith('http') ? Linking.openURL(url) : router.push(url as never);
      }
    );
    Notifications.getLastNotificationResponseAsync().then(
      (response: { notification: { request: { content: { data: Record<string, string> } } } } | null) => {
        if (!response) return;
        const data = response.notification.request.content.data || {};
        const url = data.deeplink || data.action_url;
        if (url) url.startsWith('http') ? Linking.openURL(url) : router.push(url as never);
      }
    );
    return () => tapSub.remove();
  }, [router]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="onboarding-interests" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return <View />;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
