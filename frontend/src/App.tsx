import { ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import {
  Box,
  Button,
  CircularProgress,
  CssBaseline,
  createTheme,
  Drawer,
  ThemeProvider,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import LoginPage from '@/components/LoginPage';
import PhotoViewer from '@/components/PhotoViewer';
import Toolbar from '@/components/Toolbar';
import VirtualPhotoGrid from '@/components/VirtualPhotoGrid';
import type { Photo, PhotoFilters, PhotosResponse } from '@/types';

function App() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: prefersDarkMode ? 'dark' : 'light',
          primary: {
            main: '#1976d2',
          },
          ...(prefersDarkMode && {
            background: {
              default: '#121212',
              paper: '#1e1e1e',
            },
          }),
        },
        components: {
          MuiDialog: {
            styleOverrides: {
              paper: {
                ...(prefersDarkMode && {
                  backgroundColor: '#1e1e1e',
                }),
              },
            },
          },
        },
      }),
    [prefersDarkMode],
  );

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

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

  const loadingRef = useRef(false);
  const initialLoadRef = useRef(false);
  const prevFiltersRef = useRef<string>('');

  // Check auth on mount
  useEffect(() => {
    fetch('/api/auth/check', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(data.authenticated === true);
      })
      .catch(() => {
        setIsAuthenticated(false);
      })
      .finally(() => {
        setAuthLoading(false);
      });
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // logout even if request fails
    }
    setIsAuthenticated(false);
  };

  const fetchPhotos = useCallback(
    async (pageNum: number, currentFilters: PhotoFilters, append = false) => {
      if (loadingRef.current) return;

      loadingRef.current = true;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: pageNum.toString(),
          limit: '50', // Increased for better virtualization
        });

        // Add filter params, being careful with falsy values
        Object.entries(currentFilters).forEach(([key, value]) => {
          if (value !== undefined && value !== '' && value !== null) {
            params.append(key, String(value));
          }
        });

        console.log('Fetching with filters:', currentFilters);
        console.log('Query params:', params.toString());

        const response = await fetch(`/api/photos?${params}`, {
          credentials: 'include',
        });
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
      }
    },
    [],
  );

  // Initial load
  useEffect(() => {
    if (isAuthenticated && !initialLoadRef.current) {
      initialLoadRef.current = true;
      const filtersString = JSON.stringify(filters);
      prevFiltersRef.current = filtersString;
      fetchPhotos(1, filters, false);
    }
  }, [isAuthenticated, fetchPhotos, filters]);

  // Handle filter changes
  useEffect(() => {
    if (initialLoadRef.current) {
      const filtersString = JSON.stringify(filters);
      if (filtersString !== prevFiltersRef.current) {
        prevFiltersRef.current = filtersString;
        setPage(1);
        setPhotos([]);
        fetchPhotos(1, filters, false);
      }
    }
  }, [filters, fetchPhotos]);

  // Handle load more for virtual grid
  const handleLoadMore = useCallback(() => {
    if (hasMore && !loadingRef.current) {
      setPage((prev) => prev + 1);
    }
  }, [hasMore]);

  // Handle page changes for pagination
  useEffect(() => {
    if (page > 1) {
      fetchPhotos(page, filters, true);
    }
  }, [page, filters, fetchPhotos]);

  const handleFilterChange = (newFilters: Partial<PhotoFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handlePhotoClick = (photo: Photo) => {
    setSelectedPhoto(photo);
  };

  const handlePhotoNavigate = (direction: 'prev' | 'next') => {
    const currentIndex = photos.findIndex((p) => p.id === selectedPhoto?.id);
    if (currentIndex === -1) return;

    if (direction === 'prev' && currentIndex > 0) {
      setSelectedPhoto(photos[currentIndex - 1]);
    } else if (direction === 'next' && currentIndex < photos.length - 1) {
      setSelectedPhoto(photos[currentIndex + 1]);
    }
  };

  if (authLoading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
          }}
        >
          <CircularProgress />
        </Box>
      </ThemeProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoginPage onLogin={() => setIsAuthenticated(true)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        {/* Left Sidebar for Filters */}
        <Drawer
          variant="persistent"
          anchor="left"
          open={showFilters}
          sx={{
            width: showFilters ? 300 : 0,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: 300,
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
            onClose={() => setShowFilters(false)}
          />
        </Drawer>

        {/* Main Content Area */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
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
            onColumnCountChange={setColumnCount}
            onLogout={handleLogout}
          />

          {/* Photos Grid */}
          <Box sx={{ flexGrow: 1, position: 'relative' }}>
            {/* Toggle button when sidebar is hidden */}
            {!showFilters && (
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
              <Box sx={{ textAlign: 'center', mt: 8 }}>
                <Typography variant="h6" color="text.secondary" mb={2}>
                  No photos found. Try adjusting your filters.
                </Typography>
                <Button
                  variant="contained"
                  onClick={() => {
                    setFilters({
                      search: '',
                      camera: '',
                      aspectRatio: undefined,
                      minIso: undefined,
                      maxIso: undefined,
                      minAperture: undefined,
                      maxAperture: undefined,
                      startDate: '',
                      endDate: '',
                      folder: '',
                      sortBy: 'date',
                      sortOrder: 'desc',
                    });
                  }}
                >
                  Clear All Filters
                </Button>
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
      </Box>
    </ThemeProvider>
  );
}

export default App;
