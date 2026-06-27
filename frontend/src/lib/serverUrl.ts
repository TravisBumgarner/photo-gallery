import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'photoGallery.serverUrl.v1';

// Build-time default. Useful for local dev (`expo start` with
// EXPO_PUBLIC_API_BASE_URL set) so you don't retype a URL on every reload.
// Empty in a store build → the login screen's "Server address" field is the
// only way in, which is the whole point: ship one binary, let each user point
// it at their own server.
const DEFAULT_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

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

/** Read the saved URL from storage into the sync cache. Call once at startup
 *  (before any apiFetch). Idempotent. */
export async function loadServerUrl(): Promise<string> {
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

/** Persist and switch to a new backend URL, notifying subscribers. */
export async function setServerUrl(url: string): Promise<void> {
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
