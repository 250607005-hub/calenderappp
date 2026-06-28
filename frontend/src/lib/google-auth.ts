/**
 * Google OAuth integration using expo-auth-session.
 * Provides real Google Sign-In when GOOGLE_CLIENT_ID is configured,
 * otherwise falls back to mock mode.
 */
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Google OAuth client ID - must be configured in .env
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const GOOGLE_EXPO_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID || '';

// Whether real Google OAuth is available
export const GOOGLE_OAUTH_AVAILABLE = !!(
  GOOGLE_CLIENT_ID || GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID || GOOGLE_EXPO_CLIENT_ID
);

WebBrowser.maybeCompleteAuthSession();

export type GoogleAuthResult = {
  type: 'success' | 'error' | 'cancel';
  serverAuthCode?: string;
  accessToken?: string;
  idToken?: string;
  user?: {
    id: string;
    name?: string;
    email?: string;
    photoUrl?: string;
  };
  error?: string;
};

/**
 * Hook to get Google auth config based on platform.
 */
function getClientIds(): Record<string, string> {
  const clients: Record<string, string> = {};
  if (GOOGLE_IOS_CLIENT_ID) clients.iosClientId = GOOGLE_IOS_CLIENT_ID;
  if (GOOGLE_ANDROID_CLIENT_ID) clients.androidClientId = GOOGLE_ANDROID_CLIENT_ID;
  if (GOOGLE_EXPO_CLIENT_ID) clients.expoClientId = GOOGLE_EXPO_CLIENT_ID;
  if (GOOGLE_CLIENT_ID) clients.webClientId = GOOGLE_CLIENT_ID;
  return clients;
}

/**
 * Hook for Google OAuth authentication.
 */
export function useGoogleAuth() {
  const [isReady, setIsReady] = useState(false);
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID || undefined,
    ...getClientIds(),
    scopes: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    redirectUri: Platform.select({
      web: undefined, // Uses current origin
      default: undefined, // expo-auth-session handles this
    }),
    extraParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  });

  useEffect(() => {
    if (request) setIsReady(true);
  }, [request]);

  const signIn = async (): Promise<GoogleAuthResult> => {
    if (!GOOGLE_OAUTH_AVAILABLE) {
      return {
        type: 'error',
        error: 'Google OAuth not configured. Set EXPO_PUBLIC_GOOGLE_CLIENT_ID in .env',
      };
    }

    try {
      const result = await promptAsync();

      if (result.type === 'success') {
        return {
          type: 'success',
          accessToken: result.authentication?.accessToken,
          idToken: result.authentication?.idToken,
        };
      } else if (result.type === 'cancel') {
        return { type: 'cancel', error: 'User cancelled' };
      } else {
        return { type: 'error', error: result.error?.message || 'Unknown error' };
      }
    } catch (e) {
      return {
        type: 'error',
        error: e instanceof Error ? e.message : 'Failed to sign in',
      };
    }
  };

  return {
    isReady,
    request,
    response,
    signIn,
    isConfigured: GOOGLE_OAUTH_AVAILABLE,
  };
}

/**
 * Hook for Google OAuth with server auth code (more secure for backend flow).
 */
export function useGoogleAuthServerCode() {
  const [isReady, setIsReady] = useState(false);

  // UseAuthRequest with responseType: 'code' to get server auth code
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID || undefined,
    ...getClientIds(),
    scopes: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    responseType: 'code',
    extraParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  });

  useEffect(() => {
    if (request) setIsReady(true);
  }, [request]);

  const signIn = async (): Promise<GoogleAuthResult> => {
    if (!GOOGLE_OAUTH_AVAILABLE) {
      return {
        type: 'error',
        error: 'Google OAuth not configured',
      };
    }

    try {
      const result = await promptAsync();

      if (result.type === 'success') {
        return {
          type: 'success',
          serverAuthCode: result.params?.code,
        };
      } else if (result.type === 'cancel') {
        return { type: 'cancel' };
      } else {
        return { type: 'error', error: result.error?.message || 'Unknown error' };
      }
    } catch (e) {
      return {
        type: 'error',
        error: e instanceof Error ? e.message : 'Failed to sign in',
      };
    }
  };

  return {
    isReady,
    signIn,
    response,
    isConfigured: GOOGLE_OAUTH_AVAILABLE,
  };
}
