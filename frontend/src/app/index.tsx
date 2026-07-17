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
import type { Photo, PhotoFilters, PhotosResponse } from '../lib/types';
import { SPACING } from '../styles/styleConsts';
import { useTheme } from '../styles/useTheme';

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
  page: number,
  limit: number,
): string {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
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

  const fetchPhotos = useCallback(
    async (pageNum: number, currentFilters: PhotoFilters, append: boolean) => {
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
        const qs = buildQueryString(currentFilters, pageNum, PAGE_SIZE);
        const response = await apiFetch(`/api/photos?${qs}`, {
          signal: ac.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: PhotosResponse = await response.json();
        if (seq !== seqRef.current) return;
        if (!append) setDisplayedSortBy(groupingFor(currentFilters));
        setPhotos((prev) => {
          if (!append) return data.photos;
          const seen = new Set(prev.map((p) => p.id));
          const fresh = data.photos.filter((p) => !seen.has(p.id));
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
    fetchPhotos(1, filters, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, filtersKey, fetchPhotos]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    const next = page + 1;
    setPage(next);
    fetchPhotos(next, filters, true);
  }, [hasMore, page, filters, fetchPhotos]);

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
    if (!selectedPhoto || !hasMore) return;
    const idx = photos.findIndex((p) => p.id === selectedPhoto.id);
    if (idx !== -1 && photos.length - idx <= 20) handleLoadMore();
  }, [selectedPhoto, photos, hasMore, handleLoadMore]);

  const handleViewerNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      // Functional update: rapid taps arrive faster than re-renders, so
      // deriving from the latest state (not a closure) keeps every step.
      setSelectedPhoto((current) => {
        if (!current) return current;
        const idx = photos.findIndex((p) => p.id === current.id);
        if (idx === -1) return current;
        if (direction === 'prev' && idx > 0) return photos[idx - 1];
        if (direction === 'next' && idx < photos.length - 1)
          return photos[idx + 1];
        return current;
      });
    },
    [photos],
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
                photos={photos}
                loading={loading}
                hasMore={hasMore}
                columnCount={columnCount}
                sortBy={displayedSortBy}
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
        photos={photos}
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
