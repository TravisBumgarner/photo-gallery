import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'photoGallery.settings.v1';

export type FilterSectionKey =
  | 'rating'
  | 'label'
  | 'aspectRatio'
  | 'orientation'
  | 'camera'
  | 'lens'
  | 'dateRange'
  | 'calendar'
  | 'iso'
  | 'aperture'
  | 'keywords'
  | 'people'
  | 'dogs';

export const FILTER_SECTIONS: { key: FilterSectionKey; label: string }[] = [
  { key: 'rating', label: 'Rating' },
  { key: 'label', label: 'Label' },
  { key: 'aspectRatio', label: 'Aspect ratio' },
  { key: 'orientation', label: 'Orientation' },
  { key: 'camera', label: 'Camera' },
  { key: 'lens', label: 'Lens' },
  { key: 'dateRange', label: 'Date range' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'iso', label: 'ISO range' },
  { key: 'aperture', label: 'Aperture range' },
  { key: 'keywords', label: 'Keywords' },
  { key: 'people', label: 'People' },
  { key: 'dogs', label: 'Dogs' },
];

export type FilterSectionMode = 'single' | 'multiple';

export const MIN_COLUMNS = 1;
export const MAX_COLUMNS = 8;

/** Auto column count for the gallery grid, derived from viewport width. */
export function getAutoColumnCount(width: number): number {
  if (width < 600) return 2;
  if (width < 960) return 3;
  if (width < 1280) return 4;
  return 5;
}

// ── Stats page: filter sections and charts ──────────────────────────────────

export type StatsFilterKey = 'date' | 'camera' | 'lens';

export const STATS_FILTERS: { key: StatsFilterKey; label: string }[] = [
  { key: 'date', label: 'Date range' },
  { key: 'camera', label: 'Camera' },
  { key: 'lens', label: 'Lens' },
];

export type StatsChartKey =
  | 'totalPhotos'
  | 'photosOverTime'
  | 'cameras'
  | 'lenses'
  | 'focalLength'
  | 'aperture'
  | 'iso'
  | 'rating';

export const STATS_CHARTS: { key: StatsChartKey; label: string }[] = [
  { key: 'totalPhotos', label: 'Total photos' },
  { key: 'photosOverTime', label: 'Photos over time' },
  { key: 'cameras', label: 'Top cameras' },
  { key: 'lenses', label: 'Top lenses' },
  { key: 'focalLength', label: 'Focal length distribution' },
  { key: 'aperture', label: 'Aperture distribution' },
  { key: 'iso', label: 'ISO distribution' },
  { key: 'rating', label: 'Rating distribution' },
];

export interface Settings {
  visibleFilterSections: Record<FilterSectionKey, boolean>;
  filterSectionMode: FilterSectionMode;
  expandedFilterSections: Record<FilterSectionKey, boolean>;
  filterSectionOrder: FilterSectionKey[];
  /** Manual gallery column override; null means auto-size to the viewport. */
  columnCount: number | null;
  visibleStatsFilters: Record<StatsFilterKey, boolean>;
  statsFilterOrder: StatsFilterKey[];
  visibleStatsCharts: Record<StatsChartKey, boolean>;
  statsChartOrder: StatsChartKey[];
}

const DEFAULT_ORDER = FILTER_SECTIONS.map((s) => s.key);
const STATS_FILTER_ORDER = STATS_FILTERS.map((s) => s.key);
const STATS_CHART_ORDER = STATS_CHARTS.map((s) => s.key);

/**
 * Returns a valid, complete ordering: keeps the persisted order for known keys
 * and appends any keys missing from storage (e.g. newly added ones).
 */
function repairOrderFor<T extends string>(
  order: unknown,
  defaultOrder: readonly T[],
): T[] {
  const valid = new Set<T>(defaultOrder);
  const seen = new Set<T>();
  const result: T[] = [];
  if (Array.isArray(order)) {
    for (const key of order) {
      if (valid.has(key as T) && !seen.has(key as T)) {
        seen.add(key as T);
        result.push(key as T);
      }
    }
  }
  for (const key of defaultOrder) {
    if (!seen.has(key)) result.push(key);
  }
  return result;
}

function repairOrder(order: unknown): FilterSectionKey[] {
  return repairOrderFor(order, DEFAULT_ORDER);
}

const allTrue = () =>
  Object.fromEntries(FILTER_SECTIONS.map((s) => [s.key, true])) as Record<
    FilterSectionKey,
    boolean
  >;

const allFalse = () =>
  Object.fromEntries(FILTER_SECTIONS.map((s) => [s.key, false])) as Record<
    FilterSectionKey,
    boolean
  >;

const allVisible = <T extends string>(keys: readonly T[]) =>
  Object.fromEntries(keys.map((k) => [k, true])) as Record<T, boolean>;

const DEFAULT_SETTINGS: Settings = {
  visibleFilterSections: allTrue(),
  filterSectionMode: 'multiple',
  expandedFilterSections: allTrue(),
  filterSectionOrder: DEFAULT_ORDER,
  columnCount: null,
  visibleStatsFilters: allVisible(STATS_FILTER_ORDER),
  statsFilterOrder: STATS_FILTER_ORDER,
  visibleStatsCharts: allVisible(STATS_CHART_ORDER),
  statsChartOrder: STATS_CHART_ORDER,
};

function parseStored(raw: string | null): Settings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      visibleFilterSections: {
        ...DEFAULT_SETTINGS.visibleFilterSections,
        ...(parsed.visibleFilterSections ?? {}),
      },
      filterSectionMode:
        parsed.filterSectionMode === 'single' ? 'single' : 'multiple',
      expandedFilterSections: {
        ...DEFAULT_SETTINGS.expandedFilterSections,
        ...(parsed.expandedFilterSections ?? {}),
      },
      filterSectionOrder: repairOrder(parsed.filterSectionOrder),
      columnCount:
        typeof parsed.columnCount === 'number' ? parsed.columnCount : null,
      visibleStatsFilters: {
        ...DEFAULT_SETTINGS.visibleStatsFilters,
        ...(parsed.visibleStatsFilters ?? {}),
      },
      statsFilterOrder: repairOrderFor(
        parsed.statsFilterOrder,
        STATS_FILTER_ORDER,
      ),
      visibleStatsCharts: {
        ...DEFAULT_SETTINGS.visibleStatsCharts,
        ...(parsed.visibleStatsCharts ?? {}),
      },
      statsChartOrder: repairOrderFor(
        parsed.statsChartOrder,
        STATS_CHART_ORDER,
      ),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// `cached` is the synchronously-readable snapshot. It starts as defaults and is
// replaced once hydrateSettings() resolves the AsyncStorage read — AsyncStorage
// is async but useSyncExternalStore needs a sync getSnapshot, so we hydrate once
// at startup and keep this updated on every commit.
let cached: Settings = DEFAULT_SETTINGS;
let hydrated = false;
const listeners = new Set<() => void>();

function getSnapshot(): Settings {
  return cached;
}

function getServerSnapshot(): Settings {
  return DEFAULT_SETTINGS;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Load persisted settings from storage into the sync cache. Fired once at
 *  module load; safe to await elsewhere if a caller needs them ready. */
export async function hydrateSettings(): Promise<void> {
  if (hydrated) return;
  try {
    cached = parseStored(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    cached = DEFAULT_SETTINGS;
  }
  hydrated = true;
  for (const l of listeners) l();
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function commit(next: Settings) {
  cached = next;
  // Fire-and-forget: the in-memory snapshot is already updated, so the UI
  // reflects the change immediately; persistence catches up asynchronously.
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  for (const l of listeners) l();
}

// Kick off hydration at import. Components re-render via the subscription when
// it resolves; nothing blocks on it.
void hydrateSettings();

export function setSectionVisible(key: FilterSectionKey, visible: boolean) {
  const prev = getSnapshot();
  commit({
    ...prev,
    visibleFilterSections: { ...prev.visibleFilterSections, [key]: visible },
  });
}

export function setFilterSectionMode(mode: FilterSectionMode) {
  const prev = getSnapshot();
  let nextExpanded = prev.expandedFilterSections;
  if (mode === 'single') {
    const firstOpen = FILTER_SECTIONS.find(
      (s) => prev.expandedFilterSections[s.key],
    )?.key;
    nextExpanded = allFalse();
    if (firstOpen) nextExpanded[firstOpen] = true;
  }
  commit({
    ...prev,
    filterSectionMode: mode,
    expandedFilterSections: nextExpanded,
  });
}

export function toggleFilterSectionExpanded(key: FilterSectionKey) {
  const prev = getSnapshot();
  const isOpen = prev.expandedFilterSections[key];
  let nextExpanded: Record<FilterSectionKey, boolean>;
  if (prev.filterSectionMode === 'single') {
    nextExpanded = allFalse();
    if (!isOpen) nextExpanded[key] = true;
  } else {
    nextExpanded = { ...prev.expandedFilterSections, [key]: !isOpen };
  }
  commit({ ...prev, expandedFilterSections: nextExpanded });
}

export function setFilterSectionOrder(order: FilterSectionKey[]) {
  const prev = getSnapshot();
  commit({ ...prev, filterSectionOrder: repairOrder(order) });
}

export function setColumnCount(count: number | null) {
  const prev = getSnapshot();
  const next =
    count == null
      ? null
      : Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.round(count)));
  commit({ ...prev, columnCount: next });
}

export function setAllFilterSectionsExpanded(expanded: boolean) {
  const prev = getSnapshot();
  if (prev.filterSectionMode === 'single' && expanded) return;
  commit({
    ...prev,
    expandedFilterSections: expanded ? allTrue() : allFalse(),
  });
}

export function setStatsFilterVisible(key: StatsFilterKey, visible: boolean) {
  const prev = getSnapshot();
  commit({
    ...prev,
    visibleStatsFilters: { ...prev.visibleStatsFilters, [key]: visible },
  });
}

export function setStatsFilterOrder(order: StatsFilterKey[]) {
  const prev = getSnapshot();
  commit({
    ...prev,
    statsFilterOrder: repairOrderFor(order, STATS_FILTER_ORDER),
  });
}

export function setStatsChartVisible(key: StatsChartKey, visible: boolean) {
  const prev = getSnapshot();
  commit({
    ...prev,
    visibleStatsCharts: { ...prev.visibleStatsCharts, [key]: visible },
  });
}

export function setStatsChartOrder(order: StatsChartKey[]) {
  const prev = getSnapshot();
  commit({
    ...prev,
    statsChartOrder: repairOrderFor(order, STATS_CHART_ORDER),
  });
}
