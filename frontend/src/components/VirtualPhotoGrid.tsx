import { Box, Button, CircularProgress } from '@mui/material';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import PhotoCard from '@/components/PhotoCard';
import type { Photo } from '@/types';

interface VirtualPhotoGridProps {
  photos: Photo[];
  onPhotoClick: (photo: Photo) => void;
  hasMore: boolean;
  loadMore: () => void;
  loading: boolean;
  columnCount: number;
}

const GAP = 16; // MUI gap: 2 = theme.spacing(2) = 16px
const PADDING = 16; // MUI p: 2 = 16px
const OVERSCAN = 2;

const VirtualPhotoGrid = memo(function VirtualPhotoGrid({
  photos,
  onPhotoClick,
  hasMore,
  loadMore,
  loading,
  columnCount,
}: VirtualPhotoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure container width so row height matches actual layout
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Cards are 1:1 aspect ratio, so cell height = cell width
  const cellSize =
    containerWidth > 0
      ? (containerWidth - PADDING * 2 - (columnCount - 1) * GAP) / columnCount
      : 300;
  const rowPitch = cellSize + GAP;

  // Calculate visible range based on scroll position
  const updateVisibleRange = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;

    const startRow = Math.max(
      0,
      Math.floor(scrollTop / rowPitch) - OVERSCAN,
    );
    const endRow =
      Math.ceil((scrollTop + viewportHeight) / rowPitch) + OVERSCAN;

    const startIndex = startRow * columnCount;
    const endIndex = Math.min(photos.length, endRow * columnCount);

    setVisibleRange((prev) => {
      if (prev.start === startIndex && prev.end === endIndex) {
        return prev; // Same values, don't trigger re-render
      }
      return { start: startIndex, end: endIndex };
    });
  }, [columnCount, photos.length, rowPitch]);

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

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { root: containerRef.current, threshold: 0.1 },
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
  const totalHeight =
    totalRows > 0
      ? PADDING * 2 + totalRows * cellSize + (totalRows - 1) * GAP
      : 0;
  const visiblePhotos = photos.slice(visibleRange.start, visibleRange.end);
  const offsetY = Math.floor(visibleRange.start / columnCount) * rowPitch;

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

      {hasMore && !loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <Button variant="outlined" onClick={loadMore}>
            Load More
          </Button>
        </Box>
      )}
    </Box>
  );
});

export default VirtualPhotoGrid;
