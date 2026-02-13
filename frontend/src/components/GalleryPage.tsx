import { ChevronRight as ChevronRightIcon, FilterList as FilterListIcon } from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  Fab,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import PhotoViewer from '@/components/PhotoViewer';
import Toolbar from '@/components/Toolbar';
import VirtualPhotoGrid from '@/components/VirtualPhotoGrid';
import type { Photo, PhotoFilters, PhotosResponse } from '@/types';

interface GalleryPageProps {
  onLogout: () => void;
}

function GalleryPage({ onLogout }: GalleryPageProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [filters, setFilters] = useState<PhotoFilters>({
    search: '',
    sortBy: 'dateCaptured',
    sortOrder: 'desc',
  });
  const [showFilters, setShowFilters] = useState(true);
  const [columnCount, setColumnCount] = useState(4);
  const [columnOverride, setColumnOverride] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Auto-size column count based on screen width
  useEffect(() => {
    if (columnOverride) return;

    const updateColumns = () => {
      const width = window.innerWidth;
      if (width < 600) setColumnCount(2);
      else if (width < 960) setColumnCount(3);
      else if (width < 1280) setColumnCount(4);
      else setColumnCount(5);
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, [columnOverride]);

  // Close drawer on mobile by default
  useEffect(() => {
    if (isMobile) setShowFilters(false);
  }, [isMobile]);

  const handleColumnCountChange = (count: number) => {
    setColumnOverride(true);
    setColumnCount(count);
  };

  const loadingRef = useRef(false);
  const loadMorePendingRef = useRef(false);
  const initialLoadRef = useRef(false);
  const prevFiltersRef = useRef<string>('');

  const fetchPhotos = useCallback(
    async (pageNum: number, currentFilters: PhotoFilters, append = false) => {
      if (loadingRef.current) return;

      loadingRef.current = true;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: pageNum.toString(),
          limit: '50',
        });

        Object.entries(currentFilters).forEach(([key, value]) => {
          if (value !== undefined && value !== '' && value !== null) {
            params.append(key, String(value));
          }
        });

        const response = await fetch(`/api/photos?${params}`, {
          credentials: 'include',
        });

        if (response.status === 401) {
          initialLoadRef.current = false;
          return;
        }

        const data: PhotosResponse = await response.json();

        if (data.photos && data.pagination) {
          setPhotos((prev) =>
            append ? [...prev, ...data.photos] : data.photos,
          );
          setHasMore(data.pagination.hasMore);
        } else {
          console.error('Invalid response format:', data);
          setPhotos([]);
          setHasMore(false);
        }
      } catch (error) {
        console.error('Failed to fetch photos:', error);
      } finally {
        setLoading(false);
        loadingRef.current = false;
        loadMorePendingRef.current = false;
      }
    },
    [],
  );

  // Initial load
  useEffect(() => {
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      const filtersString = JSON.stringify(filters);
      prevFiltersRef.current = filtersString;
      fetchPhotos(1, filters, false);
    }
  }, [fetchPhotos, filters]);

  // Handle filter changes
  useEffect(() => {
    if (initialLoadRef.current) {
      const filtersString = JSON.stringify(filters);
      if (filtersString !== prevFiltersRef.current) {
        prevFiltersRef.current = filtersString;
        setPage(1);
        setPhotos([]);
        loadMorePendingRef.current = false;
        fetchPhotos(1, filters, false);
      }
    }
  }, [filters, fetchPhotos]);

  // Handle load more for virtual grid
  const handleLoadMore = useCallback(() => {
    if (hasMore && !loadingRef.current && !loadMorePendingRef.current) {
      loadMorePendingRef.current = true;
      setPage((prev) => prev + 1);
    }
  }, [hasMore]);

  // Handle page changes for pagination
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  useEffect(() => {
    if (page > 1) {
      fetchPhotos(page, filtersRef.current, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, fetchPhotos]);

  const handleFilterChange = useCallback((newFilters: Partial<PhotoFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const handlePhotoClick = useCallback((photo: Photo) => {
    setSelectedPhoto(photo);
  }, []);

  const handleCloseFilters = useCallback(() => {
    setShowFilters(false);
  }, []);

  const handlePhotoNavigate = (direction: 'prev' | 'next') => {
    if (photos.length === 0) return;
    const currentIndex = photos.findIndex((p) => p.id === selectedPhoto?.id);
    if (currentIndex === -1) return;

    if (direction === 'prev') {
      const newIndex = (currentIndex - 1 + photos.length) % photos.length;
      setSelectedPhoto(photos[newIndex]);
    } else {
      const newIndex = (currentIndex + 1) % photos.length;
      setSelectedPhoto(photos[newIndex]);
    }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', overflowX: 'hidden', width: '100vw' }}>
      {/* Left Sidebar for Filters */}
      <Drawer
        variant={isMobile ? 'temporary' : 'persistent'}
        anchor="left"
        open={showFilters}
        onClose={() => setShowFilters(false)}
        sx={{
          width: isMobile ? 'auto' : showFilters ? 300 : 0,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: isMobile ? '100%' : 300,
            boxSizing: 'border-box',
            position: 'fixed',
            height: '100vh',
            left: 0,
            top: 0,
          },
        }}
      >
        <FilterPanel
          filters={filters}
          onFilterChange={handleFilterChange}
          onClose={handleCloseFilters}
          onLogout={onLogout}
        />
      </Drawer>

      {/* Main Content Area */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          height: '100vh',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Toolbar */}
        <Toolbar
          filters={filters}
          onFilterChange={handleFilterChange}
          columnCount={columnCount}
          onColumnCountChange={handleColumnCountChange}
        />

        {/* Photos Grid */}
        <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
          {/* Toggle button when sidebar is hidden (desktop only) */}
          {!showFilters && !isMobile && (
            <Box
              onClick={() => setShowFilters(true)}
              sx={{
                position: 'fixed',
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                bgcolor: 'primary.main',
                color: 'white',
                cursor: 'pointer',
                p: 1,
                borderTopRightRadius: 8,
                borderBottomRightRadius: 8,
                zIndex: 1000,
                '&:hover': {
                  bgcolor: 'primary.dark',
                },
              }}
            >
              <ChevronRightIcon />
            </Box>
          )}

          {photos.length === 0 && !loading ? (
            <Box sx={{ textAlign: 'center', mt: 8, px: 2 }}>
              <Typography variant="h6" color="text.secondary" mb={2}>
                No photos found. Try adjusting your filters.
              </Typography>
              {(() => {
                const activeFilters: { label: string; onClear: () => void }[] = [];
                if (filters.search) activeFilters.push({ label: `Search: ${filters.search}`, onClear: () => handleFilterChange({ search: '' }) });
                if (filters.camera) activeFilters.push({ label: `Camera: ${filters.camera}`, onClear: () => handleFilterChange({ camera: undefined }) });
                if (filters.lens) activeFilters.push({ label: `Lens: ${filters.lens}`, onClear: () => handleFilterChange({ lens: undefined }) });
                if (filters.minIso !== undefined || filters.maxIso !== undefined) activeFilters.push({ label: `ISO: ${filters.minIso ?? ''}–${filters.maxIso ?? ''}`, onClear: () => handleFilterChange({ minIso: undefined, maxIso: undefined }) });
                if (filters.minAperture !== undefined || filters.maxAperture !== undefined) activeFilters.push({ label: `Aperture: f/${filters.minAperture ?? ''}–f/${filters.maxAperture ?? ''}`, onClear: () => handleFilterChange({ minAperture: undefined, maxAperture: undefined }) });
                if (filters.startDate || filters.endDate) activeFilters.push({ label: `Date: ${filters.startDate ?? ''}–${filters.endDate ?? ''}`, onClear: () => handleFilterChange({ startDate: undefined, endDate: undefined }) });
                if (filters.selectedMonths) activeFilters.push({ label: `Months: ${filters.selectedMonths}`, onClear: () => handleFilterChange({ selectedMonths: '' }) });
                if (filters.selectedDates) activeFilters.push({ label: `Dates: ${filters.selectedDates}`, onClear: () => handleFilterChange({ selectedDates: '' }) });
                if (filters.aspectRatio) activeFilters.push({ label: `Aspect: ${filters.aspectRatio}`, onClear: () => handleFilterChange({ aspectRatio: undefined }) });
                if (filters.orientation) activeFilters.push({ label: `Orientation: ${filters.orientation}`, onClear: () => handleFilterChange({ orientation: undefined }) });
                if (filters.rating !== undefined) activeFilters.push({ label: `Rating: ${filters.rating}+`, onClear: () => handleFilterChange({ rating: undefined }) });
                if (filters.label) activeFilters.push({ label: `Label: ${filters.label}`, onClear: () => handleFilterChange({ label: undefined }) });
                if (filters.keyword) activeFilters.push({ label: `Keyword: ${filters.keyword}`, onClear: () => handleFilterChange({ keyword: undefined }) });
                if (filters.folder) activeFilters.push({ label: `Folder: ${filters.folder}`, onClear: () => handleFilterChange({ folder: '' }) });

                return activeFilters.length > 0 ? (
                  <Stack spacing={2} alignItems="center">
                    <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
                      {activeFilters.map((f) => (
                        <Chip key={f.label} label={f.label} onDelete={f.onClear} size="small" />
                      ))}
                    </Stack>
                    <Button
                      variant="contained"
                      onClick={() => {
                        setFilters({
                          search: '',
                          sortBy: 'dateCaptured',
                          sortOrder: 'desc',
                        });
                      }}
                    >
                      Clear All Filters
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    variant="contained"
                    onClick={() => {
                      setFilters({
                        search: '',
                        sortBy: 'dateCaptured',
                        sortOrder: 'desc',
                      });
                    }}
                  >
                    Clear All Filters
                  </Button>
                );
              })()}
            </Box>
          ) : photos.length === 0 && loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <VirtualPhotoGrid
              photos={photos}
              onPhotoClick={handlePhotoClick}
              hasMore={hasMore}
              loadMore={handleLoadMore}
              loading={loading}
              columnCount={columnCount}
            />
          )}
        </Box>
      </Box>

      {selectedPhoto && (
        <PhotoViewer
          photo={selectedPhoto}
          photos={photos}
          onClose={() => setSelectedPhoto(null)}
          onNavigate={handlePhotoNavigate}
        />
      )}

      {/* Mobile FAB for filter toggle */}
      {isMobile && !showFilters && (
        <Fab
          onClick={() => setShowFilters(true)}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1000,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            '&:hover': { bgcolor: 'primary.dark' },
            boxShadow: 6,
          }}
        >
          <FilterListIcon />
        </Fab>
      )}
    </Box>
  );
}

export default GalleryPage;
