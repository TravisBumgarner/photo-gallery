import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PhotoCard from '@/components/PhotoCard';
import type { Photo } from '@/types';
import { groupPhotosBySort } from '@/utils/groupPhotos';

interface VirtualPhotoGridProps {
  photos: Photo[];
  onPhotoClick: (photo: Photo) => void;
  hasMore: boolean;
  loadMore: () => void;
  loading: boolean;
  columnCount: number;
  sortBy?: string;
}

const GAP = 16;
const PADDING = 16;
const OVERSCAN = 2;
const SECTION_HEADER_HEIGHT = 44;

type VirtualRow =
  | {
      type: 'header';
      y: number;
      height: number;
      sectionKey: string;
      label: string;
      photoCount: number;
    }
  | {
      type: 'photos';
      y: number;
      height: number;
      photos: Photo[];
    };

const VirtualPhotoGrid = memo(function VirtualPhotoGrid({
  photos,
  onPhotoClick,
  hasMore,
  loadMore,
  loading,
  columnCount,
  sortBy,
}: VirtualPhotoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const [containerWidth, setContainerWidth] = useState(0);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set(),
  );

  // Clear collapsed sections when sort field changes
  const prevSortByRef = useRef(sortBy);
  useEffect(() => {
    if (sortBy !== prevSortByRef.current) {
      prevSortByRef.current = sortBy;
      setCollapsedSections(new Set());
    }
  }, [sortBy]);

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

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Build layout with section headers and photo rows
  const layout = useMemo(() => {
    if (!sortBy) {
      const rows: VirtualRow[] = [];
      const totalPhotoRows = Math.ceil(photos.length / columnCount);
      let y = PADDING;
      for (let r = 0; r < totalPhotoRows; r++) {
        const rowPhotos = photos.slice(
          r * columnCount,
          (r + 1) * columnCount,
        );
        rows.push({ type: 'photos', y, height: cellSize, photos: rowPhotos });
        y += cellSize + GAP;
      }
      const totalHeight = rows.length > 0 ? y - GAP + PADDING : 0;
      return { rows, totalHeight };
    }

    const sections = groupPhotosBySort(photos, sortBy);
    const rows: VirtualRow[] = [];
    let y = PADDING;

    for (const section of sections) {
      rows.push({
        type: 'header',
        y,
        height: SECTION_HEADER_HEIGHT,
        sectionKey: section.key,
        label: section.label,
        photoCount: section.photos.length,
      });
      y += SECTION_HEADER_HEIGHT + GAP;

      if (!collapsedSections.has(section.key)) {
        const photoRowCount = Math.ceil(section.photos.length / columnCount);
        for (let r = 0; r < photoRowCount; r++) {
          const rowPhotos = section.photos.slice(
            r * columnCount,
            (r + 1) * columnCount,
          );
          rows.push({
            type: 'photos',
            y,
            height: cellSize,
            photos: rowPhotos,
          });
          y += cellSize + GAP;
        }
      }
    }

    const totalHeight = rows.length > 0 ? y - GAP + PADDING : 0;
    return { rows, totalHeight };
  }, [photos, sortBy, columnCount, cellSize, collapsedSections]);

  // Calculate visible range based on scroll position
  const updateVisibleRange = useCallback(() => {
    const container = containerRef.current;
    if (!container || layout.rows.length === 0) return;

    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;
    const overscanPx = OVERSCAN * (cellSize + GAP);

    let start = 0;
    let end = layout.rows.length;

    for (let i = 0; i < layout.rows.length; i++) {
      if (layout.rows[i].y + layout.rows[i].height > scrollTop - overscanPx) {
        start = i;
        break;
      }
    }

    for (let i = start; i < layout.rows.length; i++) {
      if (layout.rows[i].y > scrollTop + viewportHeight + overscanPx) {
        end = i;
        break;
      }
    }

    setVisibleRange((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, [layout.rows, cellSize]);

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

  const visibleRows = layout.rows.slice(visibleRange.start, visibleRange.end);

  return (
    <Box
      ref={containerRef}
      sx={{
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <Box sx={{ height: layout.totalHeight, position: 'relative' }}>
        {visibleRows.map((row) => {
          if (row.type === 'header') {
            const isCollapsed = collapsedSections.has(row.sectionKey);
            return (
              <Box
                key={`header-${row.sectionKey}`}
                onClick={() => toggleSection(row.sectionKey)}
                sx={{
                  position: 'absolute',
                  top: row.y,
                  left: PADDING,
                  right: PADDING,
                  height: SECTION_HEADER_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                  px: 1.5,
                  userSelect: 'none',
                  '&:hover': {
                    bgcolor: 'grey.200',
                  },
                }}
              >
                <ExpandMoreIcon
                  sx={{
                    transform: isCollapsed
                      ? 'rotate(-90deg)'
                      : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    mr: 1,
                    fontSize: 20,
                    color: 'text.secondary',
                  }}
                />
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 600, fontSize: '0.875rem' }}
                >
                  {row.label}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  ({row.photoCount})
                </Typography>
              </Box>
            );
          }

          return (
            <Box
              key={`photos-${row.y}`}
              sx={{
                position: 'absolute',
                top: row.y,
                left: PADDING,
                right: PADDING,
                height: row.height,
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                gap: `${GAP}px`,
              }}
            >
              {row.photos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  onClick={() => onPhotoClick(photo)}
                />
              ))}
            </Box>
          );
        })}
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
