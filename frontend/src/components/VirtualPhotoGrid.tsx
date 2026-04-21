import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface SectionLayout {
  key: string;
  label: string;
  photoCount: number;
  collapsed: boolean;
  /** Global y offset of the section (including header) */
  y: number;
  /** Height of just the photo content area */
  contentHeight: number;
  /** Total height of the section (header + gap + content) */
  totalHeight: number;
  /** Photo rows within this section, with y relative to content area */
  rows: { y: number; height: number; photos: Photo[] }[];
}

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
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
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
      setViewportHeight(entries[0].contentRect.height);
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

  // Build section-based layout
  const sections = useMemo((): SectionLayout[] => {
    if (!sortBy) return [];

    const groups = groupPhotosBySort(photos, sortBy);
    const result: SectionLayout[] = [];
    let y = PADDING;

    for (const group of groups) {
      const collapsed = collapsedSections.has(group.key);
      const rows: SectionLayout['rows'] = [];
      let contentHeight = 0;

      if (!collapsed) {
        const photoRowCount = Math.ceil(group.photos.length / columnCount);
        let rowY = 0;
        for (let r = 0; r < photoRowCount; r++) {
          const rowPhotos = group.photos.slice(
            r * columnCount,
            (r + 1) * columnCount,
          );
          rows.push({ y: rowY, height: cellSize, photos: rowPhotos });
          rowY += cellSize + GAP;
        }
        contentHeight = photoRowCount > 0 ? rowY - GAP : 0;
      }

      const totalHeight = SECTION_HEADER_HEIGHT + (collapsed ? 0 : GAP + contentHeight);

      result.push({
        key: group.key,
        label: group.label,
        photoCount: group.photos.length,
        collapsed,
        y,
        contentHeight,
        totalHeight,
        rows,
      });

      y += totalHeight + GAP;
    }

    return result;
  }, [photos, sortBy, columnCount, cellSize, collapsedSections]);

  // Flat layout for non-grouped mode
  const flatLayout = useMemo(() => {
    if (sortBy) return null;
    const totalPhotoRows = Math.ceil(photos.length / columnCount);
    const rows: { y: number; height: number; photos: Photo[] }[] = [];
    let y = PADDING;
    for (let r = 0; r < totalPhotoRows; r++) {
      const rowPhotos = photos.slice(r * columnCount, (r + 1) * columnCount);
      rows.push({ y, height: cellSize, photos: rowPhotos });
      y += cellSize + GAP;
    }
    const totalHeight = rows.length > 0 ? y - GAP + PADDING : 0;
    return { rows, totalHeight };
  }, [photos, sortBy, columnCount, cellSize]);

  // Scroll tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      requestAnimationFrame(() => {
        setScrollTop(container.scrollTop);
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

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

  const overscanPx = OVERSCAN * (cellSize + GAP);

  // Render flat (non-grouped) mode
  if (flatLayout) {
    const visibleRows = flatLayout.rows.filter(
      (row) =>
        row.y + row.height > scrollTop - overscanPx &&
        row.y < scrollTop + viewportHeight + overscanPx,
    );

    return (
      <Box
        ref={containerRef}
        sx={{
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <Box sx={{ height: flatLayout.totalHeight, position: 'relative' }}>
          {visibleRows.map((row) => (
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
          ))}
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
  }

  // Render grouped mode with sticky headers
  return (
    <Box
      ref={containerRef}
      sx={{
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        px: `${PADDING}px`,
      }}
    >
      {sections.map((section) => {
        // Determine which photo rows in this section are visible
        const sectionContentGlobalY = section.y + SECTION_HEADER_HEIGHT + GAP;
        const visibleRows = section.rows.filter((row) => {
          const globalY = sectionContentGlobalY + row.y;
          return (
            globalY + row.height > scrollTop - overscanPx &&
            globalY < scrollTop + viewportHeight + overscanPx
          );
        });

        return (
          <Box
            key={section.key}
            sx={{ mb: `${GAP}px` }}
          >
            {/* Sticky section header */}
            <Box
              onClick={() => toggleSection(section.key)}
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 5,
                height: SECTION_HEADER_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                bgcolor: subtleBackground(),
                px: 1.5,
                userSelect: 'none',
                '&:hover': {
                  bgcolor: subtleBackground('slightly'),
                },
              }}
            >
              <ExpandMoreIcon
                sx={{
                  transform: section.collapsed
                    ? 'rotate(-90deg)'
                    : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                  mr: 1,
                  fontSize: 16,
                }}
              />
              <Typography variant="caption" fontWeight="600">
                {section.label}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ ml: 0.75, fontSize: '0.65rem' }}
              >
                ({section.photoCount})
              </Typography>
            </Box>

            {/* Photo content area */}
            {!section.collapsed && (
              <Box
                sx={{
                  position: 'relative',
                  height: section.contentHeight,
                  mt: `${GAP}px`,
                }}
              >
                {visibleRows.map((row) => (
                  <Box
                    key={`photos-${row.y}`}
                    sx={{
                      position: 'absolute',
                      top: row.y,
                      left: 0,
                      right: 0,
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
                ))}
              </Box>
            )}
          </Box>
        );
      })}

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
