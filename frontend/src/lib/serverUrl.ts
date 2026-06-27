import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

const STORAGE_KEY = 'photoGallery.serverUrl.v1';

// On web the app is served BY the backend, so the backend is just this page's
// origin: relative requests ('/api/...', '/images/...') hit it automatically and
// getServerUrl() is always ''. Everything below — storage, hydration, the login
// screen's "Server address" field — is native-only, where we ship one binary and
// let each user point it at their own server.
const IS_WEB = Platform.OS === 'web';

// Build-time default (native only). Useful for local dev (`expo start` with
// EXPO_PUBLIC_API_BASE_URL set) so you don't retype a URL on every reload.
// Empty in a store build → the login screen's "Server address" field is the
// only way in, which is the whole point.
const DEFAULT_URL = IS_WEB ? '' : (process.env.EXPO_PUBLIC_API_BASE_URL ?? '');

// apiFetch/imageUrl/thumbnailUrl are synchronous, but AsyncStorage is async.
// So we hydrate this module-level cache once at startup (loadServerUrl) before
// the first request fires, then keep it current on every setServerUrl. Reads
// after hydration are synchronous against this variable.
let current = DEFAULT_URL;
let hydrated = false;
const listeners = new Set<() => void>();

/** Strip whitespace and any trailing slashes so callers can always join with a
 *  leading-slash path (`${getServerUrl()}/api/...`). */
export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** The current backend base URL (no trailing slash), readable synchronously. */
export function getServerUrl(): string {
  return current;
}

/** True once the saved URL has been read from storage. */
export function isServerUrlHydrated(): boolean {
  return hydrated;
}

/** Whether a backend is configured. Always true on web (the page is served by
 *  the backend); on native, true once the user has saved a server address. */
export function isServerConfigured(): boolean {
  return IS_WEB || current !== '';
}

/** Read the saved URL from storage into the sync cache. Call once at startup
 *  (before any apiFetch). Idempotent. */
export async function loadServerUrl(): Promise<string> {
  if (IS_WEB) {
    // Same-origin: nothing to read, current stays '' (relative requests).
    hydrated = true;
    return current;
  }
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved) current = saved;
  } catch {
    // Storage unavailable → fall back to DEFAULT_URL for this session.
  }
  hydrated = true;
  for (const l of listeners) l();
  return current;
}

/** Persist and switch to a new backend URL, notifying subscribers. Native-only;
 *  on web the backend is fixed to the page origin. */
export async function setServerUrl(url: string): Promise<void> {
  if (IS_WEB) return;
  current = normalizeServerUrl(url);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, current);
  } catch {
    // Persist failed, but the in-memory switch still applies this session.
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Subscribe to the current server URL in a component. */
export function useServerUrl(): string {
  return useSyncExternalStore(subscribe, getServerUrl, () => DEFAULT_URL);
}
