import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Photo } from '../types';
import PhotoCard from './PhotoCard';

interface VirtualPhotoGridProps {
    photos: Photo[];
    onPhotoClick: (photo: Photo) => void;
    hasMore: boolean;
    loadMore: () => void;
    loading: boolean;
    columnCount: number;
}

const ROW_HEIGHT = 300; // Approximate height of each row
const OVERSCAN = 2; // Render 2 extra rows above and below viewport

function VirtualPhotoGrid({ photos, onPhotoClick, hasMore, loadMore, loading, columnCount }: VirtualPhotoGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const observerTarget = useRef<HTMLDivElement>(null);
    const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });

    // Calculate visible range based on scroll position
    const updateVisibleRange = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const scrollTop = container.scrollTop;
        const viewportHeight = container.clientHeight;

        const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
        const endRow = Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN;

        const startIndex = startRow * columnCount;
        const endIndex = Math.min(photos.length, endRow * columnCount);

        setVisibleRange({ start: startIndex, end: endIndex });
    }, [columnCount, photos.length]);

    // Update visible range on window resize
    useEffect(() => {
        const handleResize = () => {
            // Recalculate visible range when window resizes
            requestAnimationFrame(updateVisibleRange);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [updateVisibleRange]);

    // Update visible range on scroll
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        updateVisibleRange();

        const handleScroll = () => {
            requestAnimationFrame(updateVisibleRange);
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, [updateVisibleRange]);

    // Update visible range when photos or columns change
    useEffect(() => {
        updateVisibleRange();
    }, [photos.length, columnCount, updateVisibleRange]);

    // Infinite scroll observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    loadMore();
                }
            },
            { threshold: 0.1 }
        );

        const currentTarget = observerTarget.current;
        if (currentTarget) {
            observer.observe(currentTarget);
        }

        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
        };
    }, [hasMore, loading, loadMore]);

    const totalRows = Math.ceil(photos.length / columnCount);
    const totalHeight = totalRows * ROW_HEIGHT;
    const visiblePhotos = photos.slice(visibleRange.start, visibleRange.end);
    const offsetY = Math.floor(visibleRange.start / columnCount) * ROW_HEIGHT;

    return (
        <Box
            ref={containerRef}
            sx={{
                height: '100%',
                overflowY: 'auto',
                overflowX: 'hidden',
            }}
        >
            <Box sx={{ height: totalHeight, position: 'relative' }}>
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                        gap: 2,
                        p: 2,
                        transform: `translateY(${offsetY}px)`,
                        willChange: 'transform',
                    }}
                >
                    {visiblePhotos.map((photo) => (
                        <PhotoCard
                            key={photo.id}
                            photo={photo}
                            onClick={() => onPhotoClick(photo)}
                        />
                    ))}
                </Box>
            </Box>

            <div ref={observerTarget} style={{ height: '20px' }} />

            {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                    <CircularProgress />
                </Box>
            )}
        </Box>
    );
}

export default VirtualPhotoGrid;
