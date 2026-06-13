import { Redirect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Paragraph, Spinner, YStack } from 'tamagui';

import ActiveFilterChips from '../components/ActiveFilterChips';
import FilterPanel from '../components/FilterPanel';
import FolderPanel from '../components/FolderPanel';
import PhotoGrid from '../components/PhotoGrid';
import PhotoViewer from '../components/PhotoViewer';
import SearchPanel from '../components/SearchPanel';
import SettingsPanel from '../components/SettingsPanel';
import SlidePanel from '../components/SlidePanel';
import SortModal from '../components/SortModal';
import Toolbar from '../components/Toolbar';
import { apiFetch } from '../lib/api';
import type { Photo, PhotoFilters, PhotosResponse } from '../lib/types';
import { useAuth } from '../lib/auth';
import { getAutoColumnCount, setColumnCount, useSettings } from '../lib/settings';
import { SPACING } from '../styles/styleConsts';
import { usePalette } from '../styles/usePalette';

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
  const palette = usePalette();
  const { isAuthenticated } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [filters, setFilters] = useState<PhotoFilters>(DEFAULT_FILTERS);
  // Every toolbar overlay shares one slide-out container; only one is open at
  // a time so they all behave identically.
  const [activePanel, setActivePanel] = useState<PanelKey | null>(null);
  const searchValue = filters.contentSearch || filters.search || '';

  const closePanel = useCallback(() => setActivePanel(null), []);
  const togglePanel = useCallback(
    (panel: PanelKey) =>
      setActivePanel((prev) => (prev === panel ? null : panel)),
    [],
  );

  // Column count: a saved override (set in Settings or by pinch) or auto-sized.
  const { columnCount: columnOverride } = useSettings();
  const columnCount = columnOverride ?? getAutoColumnCount(width);

  const loadingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  const fetchPhotos = useCallback(
    async (pageNum: number, currentFilters: PhotoFilters, append: boolean) => {
      if (append && loadingRef.current) return;
      if (!append && abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const seq = ++seqRef.current;

      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const qs = buildQueryString(currentFilters, pageNum, PAGE_SIZE);
        const response = await apiFetch(`/api/photos?${qs}`, {
          signal: ac.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: PhotosResponse = await response.json();
        if (seq !== seqRef.current) return;
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

  const handleViewerNavigate = useCallback(
    (direction: 'prev' | 'next') => {
      if (!selectedPhoto) return;
      const idx = photos.findIndex((p) => p.id === selectedPhoto.id);
      if (idx === -1) return;
      if (direction === 'prev' && idx > 0) {
        setSelectedPhoto(photos[idx - 1]);
      } else if (direction === 'next' && idx < photos.length - 1) {
        setSelectedPhoto(photos[idx + 1]);
      }
    },
    [selectedPhoto, photos],
  );

  const handleFilterChange = useCallback(
    (changed: Partial<PhotoFilters>) => {
      setFilters((prev) => ({ ...prev, ...changed }));
    },
    [],
  );

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

  if (!isAuthenticated) return <Redirect href="/login" />;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: palette.background }]}
    >
      <View style={styles.body}>
        <SlidePanel
          visible={activePanel !== null}
          onClose={closePanel}
          title={activePanel ? PANEL_TITLES[activePanel] : ''}
          headerAction={
            activePanel === 'filter' ? (
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
          {activePanel === 'search' ? (
            <SearchPanel
              value={searchValue}
              onChange={handleSearchChange}
              onContentSearch={handleContentSearch}
              onApplyFilter={handleFilterChange}
              peopleFilter={filters.people}
              dogsFilter={filters.dogs}
              onClose={closePanel}
            />
          ) : activePanel === 'filter' ? (
            <FilterPanel filters={filters} onFilterChange={handleFilterChange} />
          ) : activePanel === 'sort' ? (
            <SortModal
              sortBy={filters.sortBy ?? 'dateCaptured'}
              sortOrder={filters.sortOrder ?? 'desc'}
              onChange={handleFilterChange}
            />
          ) : activePanel === 'folder' ? (
            <FolderPanel
              folder={filters.folder ?? ''}
              onFolderChange={(folder) =>
                handleFilterChange({ folder: folder || undefined })
              }
              onClose={closePanel}
            />
          ) : activePanel === 'settings' ? (
            <SettingsPanel />
          ) : null}
        </SlidePanel>

        <View style={styles.content}>
          <ActiveFilterChips filters={filters} onClear={handleFilterChange} />

          {photos.length === 0 && loading ? (
            <YStack items="center" justify="center" style={{ flex: 1 }}>
              <Spinner size="large" />
            </YStack>
          ) : photos.length === 0 && error ? (
            <YStack
              items="center"
              justify="center"
              p={SPACING.MEDIUM}
              style={{ flex: 1 }}
            >
              <Paragraph style={{ color: palette.error }}>{error}</Paragraph>
            </YStack>
          ) : photos.length === 0 ? (
            <YStack items="center" justify="center" style={{ flex: 1 }}>
              <Paragraph style={{ color: palette.textSecondary }}>
                No photos match your filters.
              </Paragraph>
            </YStack>
          ) : (
            <PhotoGrid
              photos={photos}
              loading={loading}
              hasMore={hasMore}
              columnCount={columnCount}
              sortBy={
                filters.contentSearch ? undefined : filters.sortBy ?? 'dateCaptured'
              }
              onLoadMore={handleLoadMore}
              onPhotoPress={handlePhotoPress}
              onColumnCountChange={setColumnCount}
            />
          )}
        </View>
      </View>

      <PhotoViewer
        photo={selectedPhoto}
        photos={photos}
        onClose={handleCloseViewer}
        onNavigate={handleViewerNavigate}
        onSelectPhoto={setSelectedPhoto}
      />

      <View
        style={[
          styles.floatingBar,
          { paddingBottom: insets.bottom + SPACING.SMALL },
        ]}
      >
        <View style={styles.floatingBarInner}>
          <Toolbar
            searchActive={!!searchValue}
            folderActive={!!filters.folder}
            onToggleSearch={() => togglePanel('search')}
            onToggleFilters={() => togglePanel('filter')}
            onToggleSort={() => togglePanel('sort')}
            onToggleFolders={() => togglePanel('folder')}
            onToggleSettings={() => togglePanel('settings')}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, flexDirection: 'row' },
  content: { flex: 1, minWidth: 0 },
  resetButton: {
    paddingHorizontal: SPACING.SMALL,
    paddingVertical: SPACING.TINY,
  },
  resetText: {
    fontSize: 14,
    fontWeight: '600',
  },
  floatingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.MEDIUM,
    alignItems: 'center',
    pointerEvents: 'box-none',
    zIndex: 100,
  },
  floatingBarInner: {
    width: '100%',
    maxWidth: 800,
  },
});
