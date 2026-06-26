/**
 * Push registration helper — uses native device push token via
 * expo-notifications (NOT Expo Push). Wraps everything in try/catch so it
 * never blocks login. Web is a no-op.
 */
import { Platform } from 'react-native';
import { pushApi } from './api';

export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // Lazy import to avoid web bundling issues.
    const Notifications = await import('expo-notifications');
    const perm = await Notifications.requestPermissionsAsync();
    if (perm.status !== 'granted') return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await pushApi.register(userId, Platform.OS, tokenResp.data as string);
  } catch (e) {
    // Push failure must never block the app.
    console.warn('[push] registration failed (non-blocking):', e);
  }
}
