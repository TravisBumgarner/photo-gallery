import { Redirect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useMountTransition } from '../components/AnimatedDialog';
import ActiveFilterChips, {
  describeFilters,
  FilterChip,
} from '../components/ActiveFilterChips';
import FilterPanel from '../components/FilterPanel';
import FolderPanel from '../components/FolderPanel';
import PhotoGrid from '../components/PhotoGrid';
import PhotoViewer from '../components/PhotoViewer';
import SearchPanel from '../components/SearchPanel';
import SettingsPanel from '../components/SettingsPanel';
import SlidePanel, { MOBILE_BREAKPOINT } from '../components/SlidePanel';
import SortModal from '../components/SortModal';
import { apiFetch } from '../lib/api';
import { useAuth } from '../lib/auth';
import { type BottomBarItem, useSetBottomBarItems } from '../lib/bottomBar';
import {
  getAutoColumnCount,
  setColumnCount,
  useSetting,
} from '../lib/settings';
import type {
  Photo,
  PhotoFilters,
  PhotosResponse,
  SectionsResponse,
} from '../lib/types';
import { SPACING } from '../styles/styleConsts';
import { useTheme } from '../styles/useTheme';
import { getGroupKey, normalizeSectionKey } from '../utils/groupPhotos';

const PAGE_SIZE = 100;

type PanelKey = 'search' | 'filter' | 'sort' | 'folder' | 'settings';

const PANEL_TITLES: Record<PanelKey, string> = {
  search: 'Search',
  filter: 'Filters',
  sort: 'Sort',
  folder: 'Folders',
  settings: 'Settings',
};

const DEFAULT_FILTERS: PhotoFilters = {
  sortBy: 'dateCaptured',
  sortOrder: 'desc',
};

function buildQueryString(
  filters: PhotoFilters,
  target: { page?: number; offset?: number },
  limit: number,
): string {
  const params = new URLSearchParams({
    page: String(target.page ?? 1),
    limit: String(limit),
  });
  // Absolute row offset (overrides page server-side) — used to skip past
  // collapsed sections instead of paging through them.
  if (target.offset !== undefined) {
    params.set('offset', String(target.offset));
  }
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') {
      params.append(k, String(v));
    }
  }
  return params.toString();
}

export default function HomeScreen() {
  const theme = useTheme();
  const palette = theme.colors;
  const { isAuthenticated } = useAuth();
  const { width } = useWindowDimensions();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  // Section outline for the active grouping (keys + total counts, in display
  // order) from /photos/sections. Cumulative counts double as row offsets, so
  // loading can jump over collapsed sections. Tagged with the filters that
  // produced it so a stale outline is never paired with mismatched photos.
  // null → endpoint unavailable or grouping inactive; loading falls back to
  // plain page-append.
  const [sections, setSections] = useState<{
    forKey: string;
    list: { key: string; count: number }[];
  } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(false);
  // True while replacing the result set (filter/search change) as opposed to
  // appending a page — drives the grid's refresh veil.
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [filters, setFilters] = useState<PhotoFilters>(DEFAULT_FILTERS);
  // Every toolbar overlay shares one slide-out container; only one is open at
  // a time so they all behave identically. `panel` keeps its last value while
  // the sidebar animates closed, so the exit doesn't flash another panel's
  // content; only `open` flips on close.
  const [panelState, setPanelState] = useState<{
    panel: PanelKey;
    open: boolean;
  }>({ panel: 'search', open: false });
  const { panel } = panelState;
  const activePanel = panelState.open ? panelState.panel : null;
  const searchValue = filters.contentSearch || filters.search || '';

  const closePanel = useCallback(
    () => setPanelState((s) => ({ ...s, open: false })),
    [],
  );
  const togglePanel = useCallback(
    (next: PanelKey) =>
      setPanelState((s) =>
        s.open && s.panel === next
          ? { ...s, open: false }
          : { panel: next, open: true },
      ),
    [],
  );

  // Column count: a saved override (set in Settings or by pinch) or auto-sized.
  // Slice subscription: the gallery must not re-render on unrelated settings
  // writes (filter section toggles fire on every sidebar interaction).
  const columnOverride = useSetting((s) => s.columnCount);
  const columnCount = columnOverride ?? getAutoColumnCount(width);

  const loadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  // Grouping mode for the photos CURRENTLY displayed. Derived from the
  // filters that produced them (set when results land), not the in-flight
  // request — otherwise submitting an AI search flat-regroups the old photos
  // for a frame before the results arrive.
  const groupingFor = (f: PhotoFilters) =>
    f.contentSearch ? undefined : (f.sortBy ?? 'dateCaptured');
  const [displayedSortBy, setDisplayedSortBy] = useState<string | undefined>(
    () => groupingFor(DEFAULT_FILTERS),
  );
  // Filters (as a JSON key) that produced the photos currently displayed —
  // pairs the section outline with the right photo set during transitions.
  const [displayedKey, setDisplayedKey] = useState(() =>
    JSON.stringify(DEFAULT_FILTERS),
  );

  // Set when a skip-offset fetch produced nothing new (section metadata
  // drifted from the photo query). Blocks re-requesting the same offset
  // forever; cleared on any filter change.
  const stallOffsetRef = useRef<number | null>(null);
  // Section key just expanded — triggers a backfill fetch for its gap.
  const expandedKeyRef = useRef<string | null>(null);

  const fetchPhotos = useCallback(
    async (
      target: { page?: number; offset?: number },
      currentFilters: PhotoFilters,
      append: boolean,
    ) => {
      if (append && loadingRef.current) return;
      if (!append && abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const seq = ++seqRef.current;

      loadingRef.current = true;
      setLoading(true);
      if (!append) setRefreshing(true);
      setError(null);
      try {
        const qs = buildQueryString(currentFilters, target, PAGE_SIZE);
        const response = await apiFetch(`/api/photos?${qs}`, {
          signal: ac.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: PhotosResponse = await response.json();
        if (seq !== seqRef.current) return;
        if (!append) {
          setDisplayedSortBy(groupingFor(currentFilters));
          setDisplayedKey(JSON.stringify(currentFilters));
        }
        setPhotos((prev) => {
          if (!append) return data.photos;
          const seen = new Set(prev.map((p) => p.id));
          const fresh = data.photos.filter((p) => !seen.has(p.id));
          if (fresh.length === 0 && target.offset !== undefined) {
            stallOffsetRef.current = target.offset;
          }
          return [...prev, ...fresh];
        });
        setHasMore(data.pagination.hasMore);
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : 'Failed to load photos');
      } finally {
        if (seq === seqRef.current) {
          setLoading(false);
          setRefreshing(false);
          loadingRef.current = false;
        }
      }
    },
    [],
  );

  // Initial + filter-change fetch (always page 1, no append)
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  useEffect(() => {
    if (!isAuthenticated) return;
    setPage(1);
    stallOffsetRef.current = null;
    fetchPhotos({ page: 1 }, filters, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, filtersKey, fetchPhotos]);

  // Fetch the section outline alongside page 1. Best-effort: on failure the
  // grid still works, it just can't skip collapsed sections while loading.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed off filtersKey, same as the photo fetch above
  useEffect(() => {
    // Keep any previous outline while this one loads: it still orders the
    // photos currently on screen (they were fetched under the same filters).
    if (!isAuthenticated || !groupingFor(filters)) {
      setSections(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const qs = buildQueryString(filters, {}, PAGE_SIZE);
        const response = await apiFetch(`/api/photos/sections?${qs}`);
        if (!response.ok || cancelled) return;
        const data: SectionsResponse = await response.json();
        if (cancelled) return;
        setSections({
          forKey: filtersKey,
          list: data.sections.map((s) => ({
            key: normalizeSectionKey(s.key),
            count: s.count,
          })),
        });
      } catch {
        // Ignore — sections are a loading optimization, not required data.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, filtersKey]);

  // Section keys are sort-specific — clear collapse state when the grouping
  // of the photos on screen changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: displayedSortBy is the trigger, not an input
  useEffect(() => {
    setCollapsedSections(new Set());
  }, [displayedSortBy]);

  // Outline usable for ordering: it must describe the photos on screen (same
  // filters produced both), even if newer filters are already in flight.
  const orderingSections =
    sections !== null &&
    sections.forKey === displayedKey &&
    displayedSortBy !== undefined
      ? sections.list
      : null;

  // Outline usable for planning fetches: additionally the displayed photos
  // must correspond to the CURRENT filters — mixing an outline with photos
  // from an in-flight filter change would compute bogus skip offsets.
  const sectionOrder =
    orderingSections !== null && displayedKey === filtersKey
      ? orderingSections
      : null;

  // Photos arrive out of section order once collapsed sections get skipped
  // and later re-expanded (backfills append last). Re-derive display order
  // from the section outline; loaded photos within a section are always a
  // prefix of it, in order, so per-section arrival order is already correct.
  const { orderedPhotos, loadedCounts } = useMemo(() => {
    if (!orderingSections || !displayedSortBy) {
      return { orderedPhotos: photos, loadedCounts: null };
    }
    const byKey = new Map<string, Photo[]>();
    for (const p of photos) {
      const key = getGroupKey(p, displayedSortBy);
      const group = byKey.get(key);
      if (group) group.push(p);
      else byKey.set(key, [p]);
    }
    const ordered: Photo[] = [];
    const counts = new Map<string, number>();
    for (const s of orderingSections) {
      const group = byKey.get(s.key);
      if (!group) continue;
      counts.set(s.key, group.length);
      ordered.push(...group);
      byKey.delete(s.key);
    }
    // Keys missing from the outline shouldn't exist; keep their photos
    // reachable at the end rather than dropping them.
    for (const group of byKey.values()) ordered.push(...group);
    return { orderedPhotos: ordered, loadedCounts: counts };
  }, [photos, orderingSections, displayedSortBy]);

  // The next row offset the grid needs: the first unloaded photo of the first
  // expanded, not-fully-loaded section. Collapsed sections advance the offset
  // by their total count without ever being fetched — this is what lets the
  // section after a collapsed one load immediately.
  const nextFetchOffset = useMemo(() => {
    if (!sectionOrder) return null;
    let offset = 0;
    for (const s of sectionOrder) {
      const loaded = loadedCounts?.get(s.key) ?? 0;
      if (!collapsedSections.has(s.key) && loaded < s.count) {
        return offset + loaded;
      }
      offset += s.count;
    }
    return null;
  }, [sectionOrder, loadedCounts, collapsedSections]);

  const moreAvailable = sectionOrder
    ? nextFetchOffset !== null && nextFetchOffset !== stallOffsetRef.current
    : hasMore;

  const handleLoadMore = useCallback(() => {
    if (loadingRef.current) return;
    if (sectionOrder) {
      if (
        nextFetchOffset === null ||
        nextFetchOffset === stallOffsetRef.current
      ) {
        return;
      }
      fetchPhotos({ offset: nextFetchOffset }, filters, true);
      return;
    }
    if (!hasMore) return;
    const next = page + 1;
    setPage(next);
    fetchPhotos({ page: next }, filters, true);
  }, [sectionOrder, nextFetchOffset, hasMore, page, filters, fetchPhotos]);

  const handleToggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        expandedKeyRef.current = key;
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Re-expanding a section that was skipped while collapsed leaves a gap in
  // its photos — start filling it right away instead of waiting for a scroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: collapsedSections is the trigger, not an input
  useEffect(() => {
    const key = expandedKeyRef.current;
    if (!key || !sectionOrder) return;
    // A fetch is already in flight — keep the key; this effect re-runs when
    // the fetch lands (loadedCounts changes) and starts the backfill then.
    if (loadingRef.current) return;
    expandedKeyRef.current = null;
    const meta = sectionOrder.find((s) => s.key === key);
    const loaded = loadedCounts?.get(key) ?? 0;
    if (meta && loaded < meta.count) handleLoadMore();
  }, [collapsedSections, sectionOrder, loadedCounts, handleLoadMore]);

  const handlePhotoPress = useCallback((photo: Photo) => {
    setSelectedPhoto(photo);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setSelectedPhoto(null);
  }, []);

  // Keep the viewer fed: stepping through photos never scrolls the grid, so
  // onEndReached alone would let rapid next-taps run into the end of the
  // loaded window and go dead until a page fetch completes. Load ahead while
  // the viewer approaches the boundary instead.
  useEffect(() => {
    if (!selectedPhoto || !moreAvailable) return;
    const idx = orderedPhotos.findIndex((p) => p.id === selectedPhoto.id);
    if (idx !== -1 && orderedPhotos.length - idx <= 20) handleLoadMore();
  }, [selectedPhoto, orderedPhotos, moreAvailable, handleLoadMore]);

  const handleViewerNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      // Functional update: rapid taps arrive faster than re-renders, so
      // deriving from the latest state (not a closure) keeps every step.
      setSelectedPhoto((current) => {
        if (!current) return current;
        const idx = orderedPhotos.findIndex((p) => p.id === current.id);
        if (idx === -1) return current;
        if (direction === 'prev' && idx > 0) return orderedPhotos[idx - 1];
        if (direction === 'next' && idx < orderedPhotos.length - 1)
          return orderedPhotos[idx + 1];
        return current;
      });
    },
    [orderedPhotos],
  );

  const handleFilterChange = useCallback((changed: Partial<PhotoFilters>) => {
    setFilters((prev) => ({ ...prev, ...changed }));
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setFilters((prev) => ({
      ...prev,
      search: text || undefined,
      contentSearch: undefined,
    }));
  }, []);

  const handleContentSearch = useCallback((text: string) => {
    setFilters((prev) => ({
      ...prev,
      contentSearch: text || undefined,
      search: undefined,
    }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const emptyStateChips = useMemo(() => describeFilters(filters), [filters]);

  const isMobile = width < MOBILE_BREAKPOINT;

  // Refresh veil: while a filter/search change replaces the result set, fade
  // a translucent layer + spinner over the stale grid. The old photos hold
  // still underneath (no layout shift) and the tile swap happens covered,
  // instead of reading as a flicker. Only when photos are already on screen —
  // the initial empty load has its own centered spinner.
  const refreshVeil = useMountTransition(
    refreshing && photos.length > 0,
    theme.motion.fast,
    theme.motion.base,
  );
  const refreshVeilProgress = refreshVeil.progress;
  const refreshVeilStyle = useAnimatedStyle(() => ({
    opacity: refreshVeilProgress.value * 0.75,
  }));

  // Committing a search leaves the panel open on desktop, where it's a sidebar
  // beside the grid and filters are meant to be stacked. On mobile the panel is
  // a full-screen modal, so staying open would hide the results just asked for.
  const handleSearchCommit = useCallback(() => {
    if (isMobile) closePanel();
  }, [isMobile, closePanel]);

  // Publish this screen's actions into the shared bottom bar (left-justified).
  const barItems = useMemo<BottomBarItem[]>(
    () => [
      {
        key: 'search',
        icon: 'search',
        label: 'Search',
        active: activePanel === 'search' || !!searchValue,
        onPress: () => togglePanel('search'),
      },
      {
        key: 'filter',
        icon: 'filter-list-alt',
        label: 'Filters',
        active: activePanel === 'filter',
        onPress: () => togglePanel('filter'),
      },
      {
        key: 'sort',
        icon: 'swap-vert',
        label: 'Sort',
        active: activePanel === 'sort',
        onPress: () => togglePanel('sort'),
      },
      {
        key: 'folder',
        icon: 'folder',
        label: 'Folders',
        active: activePanel === 'folder' || !!filters.folder,
        onPress: () => togglePanel('folder'),
      },
      {
        key: 'settings',
        icon: 'settings',
        label: 'Settings',
        active: activePanel === 'settings',
        onPress: () => togglePanel('settings'),
      },
    ],
    [activePanel, searchValue, filters.folder, togglePanel],
  );
  useSetBottomBarItems(barItems);

  if (!isAuthenticated) return <Redirect href="/login" />;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: palette.background }]}
    >
      <View style={styles.body}>
        <SlidePanel
          visible={panelState.open}
          onClose={closePanel}
          title={PANEL_TITLES[panel]}
          headerAction={
            panel === 'filter' ? (
              <Pressable
                onPress={handleResetFilters}
                accessibilityLabel="Reset all filters"
                style={({ pressed }) => [
                  styles.resetButton,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={[styles.resetText, { color: palette.primary }]}>
                  Reset
                </Text>
              </Pressable>
            ) : undefined
          }
        >
          {panel === 'search' ? (
            <SearchPanel
              value={searchValue}
              onChange={handleSearchChange}
              onContentSearch={handleContentSearch}
              onApplyFilter={handleFilterChange}
              peopleFilter={filters.people}
              dogsFilter={filters.dogs}
              keywordFilter={filters.keyword}
              cameraFilter={filters.camera}
              onCommit={handleSearchCommit}
            />
          ) : panel === 'filter' ? (
            <FilterPanel
              filters={filters}
              onFilterChange={handleFilterChange}
            />
          ) : panel === 'sort' ? (
            <SortModal
              sortBy={filters.sortBy ?? 'dateCaptured'}
              sortOrder={filters.sortOrder ?? 'desc'}
              onChange={handleFilterChange}
            />
          ) : panel === 'folder' ? (
            <FolderPanel
              folder={filters.folder ?? ''}
              onFolderChange={(folder) =>
                handleFilterChange({ folder: folder || undefined })
              }
              onClose={closePanel}
            />
          ) : panel === 'settings' ? (
            <SettingsPanel />
          ) : null}
        </SlidePanel>

        <View style={styles.content}>
          <ActiveFilterChips filters={filters} onClear={handleFilterChange} />

          {/* Wraps only the grid region (not the chip bar). While the sidebar
              is open, a capture-phase responder hook closes it on any press in
              here — and by returning false it declines the touch, so the same
              click still reaches the photo/button underneath. One click to
              close AND interact, no swallowing overlay. */}
          <View
            style={styles.gridRegion}
            onStartShouldSetResponderCapture={
              panelState.open && !isMobile
                ? () => {
                    closePanel();
                    return false;
                  }
                : undefined
            }
          >
            {photos.length === 0 && loading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={palette.primary} />
              </View>
            ) : photos.length === 0 && error ? (
              <View style={[styles.centered, styles.centeredPadded]}>
                <Text style={{ color: palette.error }}>{error}</Text>
              </View>
            ) : photos.length === 0 ? (
              <View style={[styles.centered, styles.centeredPadded]}>
                <Text style={{ color: palette.textSecondary }}>
                  No photos match your filters.
                </Text>
                {/* Dead end otherwise: the chip bar up top scrolls horizontally
                  and is easy to miss, so repeat the active filters here where
                  the user is actually looking. */}
                {emptyStateChips.length > 0 ? (
                  <>
                    <View style={styles.emptyChips}>
                      {emptyStateChips.map((chip, index) => (
                        <FilterChip
                          key={`${chip.label}-${index}`}
                          chip={chip}
                          onClear={handleFilterChange}
                        />
                      ))}
                    </View>
                    <Pressable
                      onPress={handleResetFilters}
                      accessibilityLabel="Clear all filters"
                      style={({ pressed }) => [
                        styles.clearAllButton,
                        {
                          backgroundColor: palette.primary,
                          borderRadius: theme.radius.control,
                          opacity: pressed ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.clearAllText,
                          { color: palette.primaryContrast },
                        ]}
                      >
                        Clear all filters
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : (
              <PhotoGrid
                photos={orderedPhotos}
                loading={loading}
                hasMore={moreAvailable}
                columnCount={columnCount}
                sortBy={displayedSortBy}
                collapsedSections={collapsedSections}
                onToggleSection={handleToggleSection}
                onLoadMore={handleLoadMore}
                onPhotoPress={handlePhotoPress}
                onColumnCountChange={setColumnCount}
              />
            )}

            {refreshVeil.mounted && (
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  styles.refreshVeil,
                  { backgroundColor: palette.background },
                  refreshVeilStyle,
                ]}
              >
                <ActivityIndicator size="large" color={palette.primary} />
              </Animated.View>
            )}

          </View>
        </View>
      </View>

      <PhotoViewer
        photo={selectedPhoto}
        photos={orderedPhotos}
        onClose={handleCloseViewer}
        onNavigate={handleViewerNavigate}
        onSelectPhoto={setSelectedPhoto}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, flexDirection: 'row' },
  content: { flex: 1, minWidth: 0 },
  gridRegion: { flex: 1, minWidth: 0 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredPadded: {
    padding: SPACING.MEDIUM,
    gap: SPACING.MEDIUM,
  },
  refreshVeil: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButton: {
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
  },
  resetText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.TINY,
    maxWidth: 480,
  },
  clearAllButton: {
    paddingHorizontal: SPACING.MEDIUM,
    paddingVertical: SPACING.SMALL,
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
