import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PhotoCard from '@/components/PhotoCard';
import { subtleBackground } from '@/styles/styleConsts';
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

  // Track anchor photo for scroll preservation across layout changes
  const anchorRef = useRef<{ photoId: number; viewportOffset: number } | null>(
    null,
  );
  const prevColumnCountRef = useRef(columnCount);
  const prevContainerWidthRef = useRef(0);

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

  // Update anchor ref with the first visible photo
  const updateAnchor = useCallback(() => {
    const container = containerRef.current;
    if (!container || layout.rows.length === 0) return;

    const scrollTop = container.scrollTop;
    for (const row of layout.rows) {
      if (row.type === 'photos' && row.y + row.height > scrollTop) {
        anchorRef.current = {
          photoId: row.photos[0].id,
          viewportOffset: row.y - scrollTop,
        };
        break;
      }
    }
  }, [layout.rows]);

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

  // Update visible range on scroll, and track anchor photo
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateVisibleRange();
    updateAnchor();

    const handleScroll = () => {
      requestAnimationFrame(() => {
        updateVisibleRange();
        updateAnchor();
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [updateVisibleRange, updateAnchor]);

  // Restore scroll position when column count or container width changes
  useLayoutEffect(() => {
    const container = containerRef.current;
    const anchor = anchorRef.current;
    const colChanged = prevColumnCountRef.current !== columnCount;
    const widthChanged =
      prevContainerWidthRef.current !== 0 &&
      prevContainerWidthRef.current !== containerWidth;

    prevColumnCountRef.current = columnCount;
    prevContainerWidthRef.current = containerWidth;

    if (!container || !anchor || (!colChanged && !widthChanged)) return;

    // Find the row containing the anchor photo
    for (const row of layout.rows) {
      if (
        row.type === 'photos' &&
        row.photos.some((p) => p.id === anchor.photoId)
      ) {
        container.scrollTop = row.y - anchor.viewportOffset;
        break;
      }
    }
  }, [layout, columnCount, containerWidth]);

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
                  bgcolor: subtleBackground('slightly'),
                  px: 1.5,
                  userSelect: 'none',
                  '&:hover': {
                    bgcolor: 'action.hover',
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
                    fontSize: 16,
                  }}
                />
                <Typography variant="caption" fontWeight="600">
                  {row.label}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 0.75, fontSize: '0.65rem' }}
                >
                  ({row.photoCount})
                </Typography>
              </Box>
            );
          }

          return (
            <Box
              key={`photos-${row.photos[0].id}`}
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
