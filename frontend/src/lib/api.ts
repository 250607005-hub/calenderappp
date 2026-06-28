/**
 * Lightweight API client. Reads EXPO_PUBLIC_BACKEND_URL and attaches the
 * stored JWT to every request.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const TOKEN_KEY = 'calsync_token';

async function tokenGet(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function tokenSet(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function tokenClear(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false) {
    const t = await tokenGet();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === 'object' && 'detail' in parsed
        ? String((parsed as { detail: unknown }).detail)
        : `HTTP ${res.status}`);
    throw new ApiError(res.status, parsed, msg);
  }
  return parsed as T;
}

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  google_connected: boolean;
  interests: string[];
  created_at: string;
};

export type UserEventSync = {
  id: string;
  event_id: string;
  title: string;
  description: string;
  category: string;
  start_time: string;
  end_time: string;
  delivered_at: string;
  google_event_id: string | null;
  status: 'synced' | 'failed' | 'mock';
  error: string | null;
};

export type BroadcastEvent = {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  location: string | null;
  category: string;
  admin_id: string;
  admin_email: string;
  created_at: string;
  recipients_count: number;
  success_count: number;
  failure_count: number;
};

export const auth = {
  mockLogin: (email: string, name?: string) =>
    api<{ token: string; user: PublicUser }>('/api/auth/mock-login', {
      method: 'POST',
      body: { email, name },
      auth: false,
    }),
  googleMobile: (server_auth_code?: string, mock_email?: string, mock_name?: string) =>
    api<{ token: string; user: PublicUser }>('/api/auth/google/mobile', {
      method: 'POST',
      body: { server_auth_code, mock_email, mock_name },
      auth: false,
    }),
  me: () => api<PublicUser>('/api/auth/me'),
  disconnectGoogle: () =>
    api<{ status: string }>('/api/auth/disconnect-google', { method: 'POST' }),
  setInterests: (interests: string[]) =>
    api<PublicUser>('/api/auth/interests', {
      method: 'PUT',
      body: { interests },
    }),
};

export const userApi = {
  myEvents: () => api<UserEventSync[]>('/api/me/events'),
  syncEvent: (event: {
    title: string;
    description: string;
    start_time: string;
    end_time: string;
    location?: string | null;
    category?: string;
    all_day?: boolean;
    reminder_minutes?: number;
  }) =>
    api<{ id: string; google_event_id: string | null; status: string; error: string | null }>(
      '/api/me/sync-event',
      { method: 'POST', body: event }
    ),
};

export const adminApi = {
  broadcast: (b: {
    title: string;
    description: string;
    start_time: string;
    end_time: string;
    location?: string | null;
    category?: string;
    all_day?: boolean;
    reminder_minutes?: number;
    recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
    visibility?: 'default' | 'public' | 'private';
    busy_status?: 'busy' | 'free';
    send_push?: boolean;
    guests_can_invite_others?: boolean;
    guests_can_see_other_guests?: boolean;
    guests_can_modify?: boolean;
  }) =>
    api<BroadcastEvent>('/api/admin/broadcast-event', {
      method: 'POST',
      body: b,
    }),
  broadcasts: () => api<BroadcastEvent[]>('/api/admin/broadcasts'),
  users: () => api<PublicUser[]>('/api/admin/users'),
};

export const pushApi = {
  register: (user_id: string, platform: string, device_token: string) =>
    api<{ status: string }>('/api/register-push', {
      method: 'POST',
      body: { user_id, platform, device_token },
      auth: false,
    }),
};
