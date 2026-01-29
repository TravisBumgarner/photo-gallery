import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
    CssBaseline,
    ThemeProvider,
    createTheme,
    Box,
    CircularProgress,
    Typography,
    Drawer,
    Button,
    useMediaQuery,
} from '@mui/material';
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon } from '@mui/icons-material';
import { Photo, PhotosResponse, PhotoFilters } from './types';
import VirtualPhotoGrid from './components/VirtualPhotoGrid';
import PhotoViewer from './components/PhotoViewer';
import FilterPanel from './components/FilterPanel';
import Toolbar from './components/Toolbar';

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

    const [photos, setPhotos] = useState<Photo[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
    const [filters, setFilters] = useState<PhotoFilters>({
        sortBy: 'dateCaptured',
        sortOrder: 'desc',
    });
    const [showFilters, setShowFilters] = useState(true);
    const [columnCount, setColumnCount] = useState(4);

    const loadingRef = useRef(false);
    const initialLoadRef = useRef(false);
    const prevFiltersRef = useRef<string>('');

    const fetchPhotos = useCallback(async (pageNum: number, currentFilters: PhotoFilters, append = false) => {
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

            const response = await fetch(`/api/photos?${params}`);
            const data: PhotosResponse = await response.json();

            if (data.photos && data.pagination) {
                setPhotos(prev => append ? [...prev, ...data.photos] : data.photos);
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
    }, []);

    // Initial load
    useEffect(() => {
        if (!initialLoadRef.current) {
            initialLoadRef.current = true;
            const filtersString = JSON.stringify(filters);
            prevFiltersRef.current = filtersString;
            fetchPhotos(1, filters, false);
        }
    }, []);

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
    }, [filters]);

    // Handle load more for virtual grid
    const handleLoadMore = useCallback(() => {
        if (hasMore && !loadingRef.current) {
            setPage(prev => prev + 1);
        }
    }, [hasMore]);

    // Handle page changes for pagination
    useEffect(() => {
        if (page > 1) {
            fetchPhotos(page, filters, true);
        }
    }, [page, filters, fetchPhotos]);

    const handleFilterChange = (newFilters: Partial<PhotoFilters>) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
    };

    const handlePhotoClick = (photo: Photo) => {
        setSelectedPhoto(photo);
    };

    const handlePhotoNavigate = (direction: 'prev' | 'next') => {
        const currentIndex = photos.findIndex(p => p.id === selectedPhoto?.id);
        if (currentIndex === -1) return;

        if (direction === 'prev' && currentIndex > 0) {
            setSelectedPhoto(photos[currentIndex - 1]);
        } else if (direction === 'next' && currentIndex < photos.length - 1) {
            setSelectedPhoto(photos[currentIndex + 1]);
        }
    };

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
