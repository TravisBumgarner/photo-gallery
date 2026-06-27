import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'photoGallery.recentSearches.v1';
const MAX_RECENTS = 8;

export type RecentKind = 'search' | 'ai' | 'person' | 'dog';

export interface RecentSearch {
  value: string;
  kind: RecentKind;
}

function parseStored(raw: string | null): RecentSearch[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentSearch =>
          e &&
          typeof e === 'object' &&
          typeof e.value === 'string' &&
          (e.kind === 'search' ||
            e.kind === 'ai' ||
            e.kind === 'person' ||
            e.kind === 'dog'),
      )
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

// Synchronously-readable cache, hydrated once from AsyncStorage at startup (see
// settings.ts for the same pattern and why the read can't be synchronous).
let cached: RecentSearch[] = [];
let hydrated = false;
const listeners = new Set<() => void>();

function getSnapshot(): RecentSearch[] {
  return cached;
}

function getServerSnapshot(): RecentSearch[] {
  return [];
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Load persisted recents into the sync cache. Fired once at module load. */
export async function hydrateRecentSearches(): Promise<void> {
  if (hydrated) return;
  try {
    cached = parseStored(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    cached = [];
  }
  hydrated = true;
  for (const l of listeners) l();
}

function persist(next: RecentSearch[]) {
  cached = next;
  // Fire-and-forget; the in-memory list is the source of truth for this session.
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  for (const l of listeners) l();
}

void hydrateRecentSearches();

export function useRecentSearches(): RecentSearch[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function addRecentSearch(entry: RecentSearch) {
  if (!entry.value.trim()) return;
  const prev = getSnapshot();
  // Dedupe on (kind, value); promote the new entry to the top.
  const filtered = prev.filter(
    (e) => !(e.kind === entry.kind && e.value === entry.value),
  );
  persist([entry, ...filtered].slice(0, MAX_RECENTS));
}

export function removeRecentSearch(entry: RecentSearch) {
  const prev = getSnapshot();
  persist(
    prev.filter((e) => !(e.kind === entry.kind && e.value === entry.value)),
  );
}

export function clearRecentSearches() {
  persist([]);
}
