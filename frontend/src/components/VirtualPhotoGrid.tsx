import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

export interface VirtualPhotoGridHandle {
  ensurePhotoVisible: (photoId: number) => void;
}

const GAP = 0;
const PADDING = 16;
const OVERSCAN = 2;
const SECTION_HEADER_HEIGHT = 44;

interface PhotoRow {
  y: number;
  height: number;
  photos: Photo[];
}

interface SectionLayout {
  key: string;
  label: string;
  photoCount: number;
  collapsed: boolean;
  /** Global y offset where the section starts (header top). */
  y: number;
  /** Height of the photo content area (excludes header). */
  contentHeight: number;
  /** Total height of the section in the scroll container. */
  totalHeight: number;
  /** Photo rows within this section, y relative to section content area. */
  rows: PhotoRow[];
}

const VirtualPhotoGrid = memo(
  forwardRef<VirtualPhotoGridHandle, VirtualPhotoGridProps>(
    function VirtualPhotoGrid(
      { photos, onPhotoClick, hasMore, loadMore, loading, columnCount, sortBy },
      ref,
    ) {
      const containerRef = useRef<HTMLDivElement>(null);
      const observerTarget = useRef<HTMLDivElement>(null);
      const [scrollTop, setScrollTop] = useState(0);
      const [viewportHeight, setViewportHeight] = useState(0);
      const [containerWidth, setContainerWidth] = useState(0);
      const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
        new Set(),
      );

      // Track anchor photo for scroll preservation across layout changes
      const anchorRef = useRef<{
        photoId: number;
        viewportOffset: number;
      } | null>(null);
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

      // Measure container width and viewport height so layout matches actual size
      useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const ro = new ResizeObserver((entries) => {
          const rect = entries[0].contentRect;
          setContainerWidth(rect.width);
          setViewportHeight(rect.height);
        });
        ro.observe(container);
        return () => ro.disconnect();
      }, []);

      // Cards are 1:1 aspect ratio, so cell height = cell width
      const cellSize =
        containerWidth > 0
          ? (containerWidth - (columnCount - 1) * GAP) / columnCount
          : 300;

      const toggleSection = useCallback((key: string) => {
        setCollapsedSections((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      }, []);

      // Flat (non-grouped) layout: single list of virtualized photo rows
      const flatLayout = useMemo(() => {
        if (sortBy) return null;
        const rows: PhotoRow[] = [];
        const totalPhotoRows = Math.ceil(photos.length / columnCount);
        let y = PADDING;
        for (let r = 0; r < totalPhotoRows; r++) {
          const rowPhotos = photos.slice(
            r * columnCount,
            (r + 1) * columnCount,
          );
          rows.push({ y, height: cellSize, photos: rowPhotos });
          y += cellSize + GAP;
        }
        const totalHeight = rows.length > 0 ? y - GAP + PADDING : 0;
        return { rows, totalHeight };
      }, [photos, sortBy, columnCount, cellSize]);

      // Grouped layout: per-section layouts with sticky headers
      const sections = useMemo((): SectionLayout[] => {
        if (!sortBy) return [];
        const groups = groupPhotosBySort(photos, sortBy);
        const result: SectionLayout[] = [];
        let y = PADDING;

        for (const group of groups) {
          const collapsed = collapsedSections.has(group.key);
          const rows: PhotoRow[] = [];
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

          const totalHeight =
            SECTION_HEADER_HEIGHT + (collapsed ? 0 : GAP + contentHeight);

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

      // Update anchor ref with the first visible photo (for scroll preservation)
      const updateAnchor = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        const top = container.scrollTop;

        if (flatLayout) {
          for (const row of flatLayout.rows) {
            if (row.y + row.height > top) {
              anchorRef.current = {
                photoId: row.photos[0].id,
                viewportOffset: row.y - top,
              };
              return;
            }
          }
          return;
        }

        for (const section of sections) {
          if (section.collapsed) continue;
          const contentGlobalY = section.y + SECTION_HEADER_HEIGHT + GAP;
          for (const row of section.rows) {
            const globalY = contentGlobalY + row.y;
            if (globalY + row.height > top) {
              anchorRef.current = {
                photoId: row.photos[0].id,
                viewportOffset: globalY - top,
              };
              return;
            }
          }
        }
      }, [flatLayout, sections]);

      // Scroll tracking
      useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        setScrollTop(container.scrollTop);
        updateAnchor();

        const handleScroll = () => {
          requestAnimationFrame(() => {
            const el = containerRef.current;
            if (!el) return;
            setScrollTop(el.scrollTop);
            updateAnchor();
          });
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
      }, [updateAnchor]);

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

        const findAndRestore = (globalY: number, row: PhotoRow) => {
          if (row.photos.some((p) => p.id === anchor.photoId)) {
            container.scrollTop = globalY - anchor.viewportOffset;
            return true;
          }
          return false;
        };

        if (flatLayout) {
          for (const row of flatLayout.rows) {
            if (findAndRestore(row.y, row)) return;
          }
          return;
        }

        for (const section of sections) {
          if (section.collapsed) continue;
          const contentGlobalY = section.y + SECTION_HEADER_HEIGHT + GAP;
          for (const row of section.rows) {
            if (findAndRestore(contentGlobalY + row.y, row)) return;
          }
        }
      }, [flatLayout, sections, columnCount, containerWidth]);

      useImperativeHandle(
        ref,
        () => ({
          ensurePhotoVisible: (photoId: number) => {
            const container = containerRef.current;
            if (!container) return;

            const findPhotoY = (): number | null => {
              if (flatLayout) {
                for (const row of flatLayout.rows) {
                  if (row.photos.some((p) => p.id === photoId)) return row.y;
                }
                return null;
              }
              for (const section of sections) {
                if (section.collapsed) continue;
                const contentGlobalY = section.y + SECTION_HEADER_HEIGHT + GAP;
                for (const row of section.rows) {
                  if (row.photos.some((p) => p.id === photoId)) {
                    return contentGlobalY + row.y;
                  }
                }
              }
              return null;
            };

            const photoY = findPhotoY();
            if (photoY === null) return;

            const viewportTop = container.scrollTop;
            const vh = container.clientHeight;
            const rowBottom = photoY + cellSize;

            if (photoY >= viewportTop && rowBottom <= viewportTop + vh) return;

            container.scrollTop = Math.max(0, photoY - (vh - cellSize) / 2);
          },
        }),
        [flatLayout, sections, cellSize],
      );

      // Infinite scroll observer
      useEffect(() => {
        const observer = new IntersectionObserver(
          (entries) => {
            if (entries[0].isIntersecting && hasMore && !loading) {
              loadMore();
            }
          },
          {
            root: containerRef.current,
            rootMargin: '1000px 0px',
            threshold: 0,
          },
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

      const renderHeader = (section: SectionLayout) => (
        <Box
          onClick={() => toggleSection(section.key)}
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            height: SECTION_HEADER_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            bgcolor: 'background.default',
            px: 1.5,
            userSelect: 'none',
            '&:hover': {
              bgcolor: 'background.paper',
            },
          }}
        >
          <ExpandMoreIcon
            sx={{
              transform: section.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
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
      );

      const renderPhotoRow = (row: PhotoRow, key: string) => (
        <Box
          key={key}
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
      );

      const trailingControls = (
        <>
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
        </>
      );

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
              {visibleRows.map((row) =>
                renderPhotoRow(row, `photos-${row.photos[0].id}`),
              )}
            </Box>
            {trailingControls}
          </Box>
        );
      }

      return (
        <Box
          ref={containerRef}
          sx={{
            height: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            pb: `${PADDING}px`,
          }}
        >
          {sections.map((section) => {
            const contentGlobalY = section.y + SECTION_HEADER_HEIGHT + GAP;
            const visibleRows = section.collapsed
              ? []
              : section.rows.filter((row) => {
                  const globalY = contentGlobalY + row.y;
                  return (
                    globalY + row.height > scrollTop - overscanPx &&
                    globalY < scrollTop + viewportHeight + overscanPx
                  );
                });

            return (
              <Box key={section.key} sx={{ mb: `${GAP}px` }}>
                {renderHeader(section)}
                {!section.collapsed && (
                  <Box
                    sx={{
                      position: 'relative',
                      height: section.contentHeight,
                      mt: `${GAP}px`,
                    }}
                  >
                    {visibleRows.map((row) =>
                      renderPhotoRow(row, `photos-${row.photos[0].id}`),
                    )}
                  </Box>
                )}
              </Box>
            );
          })}
          {trailingControls}
        </Box>
      );
    },
  ),
);

export default VirtualPhotoGrid;
