import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'photoGallery.recentSearches.v1';
const MAX_RECENTS = 8;

export type RecentKind = 'search' | 'ai' | 'person' | 'dog';

export interface RecentSearch {
  value: string;
  kind: RecentKind;
}

function readFromStorage(): RecentSearch[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
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

let cached: RecentSearch[] | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): RecentSearch[] {
  if (!cached) cached = readFromStorage();
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

function persist(next: RecentSearch[]) {
  cached = next;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / serialization errors
    }
  }
  for (const l of listeners) l();
}

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
