import {
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
  CameraAlt as CameraIcon,
  Close as CloseIcon,
  Grade as GradeIcon,
  Info as InfoIcon,
  InfoOutlined as InfoOutlinedIcon,
  Label as LabelIcon,
  Settings as SettingsIcon,
  Star as StarIcon,
  ViewCarouselOutlined as ViewCarouselOutlinedIcon,
} from '@mui/icons-material';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Paper,
  Rating,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import type { Photo } from '@/types';

interface PhotoViewerProps {
  photo: Photo;
  photos: Photo[];
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onSelectPhoto?: (photo: Photo) => void;
}

function PhotoViewer({
  photo,
  photos,
  onClose,
  onNavigate,
  onSelectPhoto,
}: PhotoViewerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [showMetadata, setShowMetadata] = useState(!isMobile);
  const [showNeighbors, setShowNeighbors] = useState(false);
  const [neighbors, setNeighbors] = useState<{
    before: Photo[];
    after: Photo[];
  }>({ before: [], after: [] });
  const stripRef = useRef<HTMLDivElement | null>(null);
  const currentIndex = photos.findIndex((p) => p.id === photo.id);
  const inResults = currentIndex !== -1;

  const formatAspectRatio = (ratio: number) => {
    const commonRatios = [
      { value: 1, label: '1:1' },
      { value: 1.5, label: '3:2' },
      { value: 0.67, label: '2:3' },
      { value: 1.78, label: '16:9' },
      { value: 0.56, label: '9:16' },
      { value: 1.33, label: '4:3' },
      { value: 0.75, label: '3:4' },
    ];

    for (const common of commonRatios) {
      if (Math.abs(ratio - common.value) < 0.05) {
        return common.label;
      }
    }

    return ratio.toFixed(2);
  };

  // When the current photo isn't part of the search results (user clicked into
  // a neighbor), arrow keys walk the chronological neighborhood instead of the
  // results array. Reaching the edge re-fetches and the strip slides forward.
  const navigate = (direction: 'prev' | 'next') => {
    if (inResults) {
      onNavigate(direction);
      return;
    }
    if (!onSelectPhoto) return;
    const target =
      direction === 'prev'
        ? neighbors.before[neighbors.before.length - 1]
        : neighbors.after[0];
    if (target) onSelectPhoto(target);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        navigate('prev');
      } else if (e.key === 'ArrowRight') {
        navigate('next');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, onNavigate, inResults, neighbors, onSelectPhoto]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/photos/${photo.id}/neighbors?window=10`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setNeighbors({
          before: data.before ?? [],
          after: data.after ?? [],
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photo.id]);

  // Center the active thumbnail in the strip whenever the photo changes.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(
      '[data-neighbor-active="true"]',
    );
    if (el && stripRef.current) {
      const stripRect = stripRef.current.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      if (isMobile) {
        const offset =
          elRect.left -
          stripRect.left -
          stripRect.width / 2 +
          elRect.width / 2;
        stripRef.current.scrollBy({ left: offset, behavior: 'smooth' });
      } else {
        const offset =
          elRect.top -
          stripRect.top -
          stripRect.height / 2 +
          elRect.height / 2;
        stripRef.current.scrollBy({ top: offset, behavior: 'smooth' });
      }
    }
  }, [photo.id, neighbors, isMobile, showNeighbors]);

  // Progressive photo preloading
  const preloadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (photos.length <= 1) return;

    const getPhotoAtOffset = (offset: number) => {
      const index = (currentIndex + offset + photos.length) % photos.length;
      return photos[index];
    };

    const preloadImage = (p: Photo): Promise<void> => {
      const src = `/images/${p.originalPath}`;
      if (preloadedRef.current.has(src)) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          preloadedRef.current.add(src);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src;
      });
    };

    // Level 1: Preload prev and next
    const prev = getPhotoAtOffset(-1);
    const next = getPhotoAtOffset(1);

    Promise.all([preloadImage(prev), preloadImage(next)]).then(() => {
      // Level 2: Preload prev-1 and next+1 (if we have enough photos)
      if (photos.length > 3) {
        const prevPrev = getPhotoAtOffset(-2);
        const nextNext = getPhotoAtOffset(2);
        preloadImage(prevPrev);
        preloadImage(nextNext);
      }
    });
  }, [photo.id, photos, currentIndex]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const keywords = photo.keywords ? JSON.parse(photo.keywords) : [];

  const labelColors: Record<string, string> = {
    Red: '#f44336',
    Yellow: '#ffeb3b',
    Green: '#4caf50',
    Blue: '#2196f3',
    Purple: '#9c27b0',
  };

  return (
    <Dialog
      open={true}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: isMobile
          ? {}
          : {
              height: '95vh',
              maxHeight: '95vh',
              m: 2,
            },
      }}
    >
      <Box sx={{ position: 'relative', height: '100%', display: 'flex' }}>
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            zIndex: 1,
            bgcolor: 'background.paper',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <CloseIcon />
        </IconButton>

        <DialogContent
          sx={{
            p: 0,
            display: 'flex',
            overflow: 'hidden',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
              flexDirection: isMobile ? 'column' : 'row',
            }}
          >
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'grey.900',
                p: 2,
              }}
            >
              <img
                src={`/images/${photo.originalPath}`}
                alt={photo.filename}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
            </Box>

            {showNeighbors &&
              (neighbors.before.length > 0 || neighbors.after.length > 0) && (
                <Box
                  ref={stripRef}
                  sx={{
                    display: isMobile ? 'flex' : 'grid',
                    gridTemplateColumns: isMobile
                      ? undefined
                      : 'repeat(2, 1fr)',
                    flexDirection: isMobile ? 'row' : undefined,
                    gap: 0.5,
                    overflowX: isMobile ? 'auto' : 'hidden',
                    overflowY: isMobile ? 'hidden' : 'auto',
                    flexShrink: 0,
                    width: isMobile ? '100%' : 176,
                    height: isMobile ? 80 : 'auto',
                    px: isMobile ? 1 : 0.75,
                    py: isMobile ? 0.75 : 1,
                    bgcolor: 'background.paper',
                    borderTop: isMobile ? 1 : 0,
                    borderLeft: isMobile ? 0 : 1,
                    borderColor: 'divider',
                  }}
                >
                  {[...neighbors.before, photo, ...neighbors.after].map((p) => {
                    const active = p.id === photo.id;
                    return (
                      <Box
                        key={p.id}
                        data-neighbor-active={active ? 'true' : undefined}
                        onClick={() => {
                          if (!active && onSelectPhoto) onSelectPhoto(p);
                        }}
                        sx={{
                          flex: isMobile ? '0 0 auto' : undefined,
                          width: isMobile ? 56 : '100%',
                          height: isMobile ? 56 : undefined,
                          aspectRatio: isMobile ? undefined : '1 / 1',
                          cursor: active ? 'default' : 'pointer',
                          boxShadow: active
                            ? (t) =>
                                `inset 0 0 0 2px ${t.palette.primary.main}`
                            : 'none',
                          borderRadius: 0.5,
                          overflow: 'hidden',
                          opacity: active ? 1 : 0.75,
                          transition: 'opacity 0.15s',
                          '&:hover': active ? {} : { opacity: 1 },
                        }}
                      >
                        <img
                          src={p.thumbnailPath}
                          alt={p.filename}
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              )}

            {showMetadata && (
              <Paper
                sx={{
                  width: isMobile ? '100%' : 350,
                  overflowY: 'auto',
                  flexShrink: 0,
                  p: isMobile ? 1.5 : 3,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isMobile ? 1 : 2,
                }}
                elevation={3}
              >
                {isMobile ? (
                  <>
                    {/* Rating and Label row */}
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Rating
                        </Typography>
                        <Box>
                          {photo.rating ? (
                            <Rating
                              value={photo.rating}
                              readOnly
                              size="small"
                              emptyIcon={
                                <StarIcon
                                  style={{ opacity: 0.3 }}
                                  fontSize="inherit"
                                />
                              }
                            />
                          ) : (
                            <Typography variant="body2">N/A</Typography>
                          )}
                        </Box>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Label
                        </Typography>
                        <Box>
                          {photo.label && labelColors[photo.label] ? (
                            <Chip
                              size="small"
                              label={photo.label}
                              sx={{
                                bgcolor: labelColors[photo.label],
                                color:
                                  photo.label === 'Yellow' ? 'black' : 'white',
                              }}
                            />
                          ) : (
                            <Typography variant="body2">N/A</Typography>
                          )}
                        </Box>
                      </Box>
                    </Stack>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 1,
                      }}
                    >
                      {[
                        { label: 'Camera', value: photo.camera },
                        { label: 'Lens', value: photo.lens },
                        { label: 'ISO', value: photo.iso },
                        { label: 'Shutter', value: photo.shutterSpeed },
                        {
                          label: 'Aperture',
                          value: photo.aperture ? `f/${photo.aperture}` : null,
                        },
                        {
                          label: 'Focal',
                          value: photo.focalLength
                            ? `${photo.focalLength}mm`
                            : null,
                        },
                        {
                          label: 'Resolution',
                          value: `${photo.width}×${photo.height}`,
                        },
                        {
                          label: 'Ratio',
                          value: formatAspectRatio(photo.aspectRatio),
                        },
                        {
                          label: 'Size',
                          value: formatFileSize(photo.fileSize),
                        },
                        {
                          label: 'Date',
                          value: formatDate(photo.dateCaptured),
                        },
                      ].map(({ label, value }) => (
                        <Box key={label} sx={{ minWidth: 0 }}>
                          <Typography variant="caption" color="text.secondary">
                            {label}
                          </Typography>
                          <Typography variant="body2" noWrap>
                            {value || 'N/A'}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                    {keywords.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {keywords.map((keyword: string, index: number) => (
                          <Chip key={index} label={keyword} size="small" />
                        ))}
                      </Box>
                    )}
                  </>
                ) : (
                  <>
                    <Typography variant="h6" noWrap title={photo.filename}>
                      {photo.filename}
                    </Typography>

                    <Divider />

                    <Box>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        mb={1}
                      >
                        <CameraIcon fontSize="small" />
                        <Typography variant="subtitle2">Camera</Typography>
                      </Stack>
                      <Stack spacing={1}>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Camera:
                          </Typography>
                          <Typography variant="body2">
                            {photo.camera || 'N/A'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Lens:
                          </Typography>
                          <Typography variant="body2">
                            {photo.lens || 'N/A'}
                          </Typography>
                        </Box>
                      </Stack>
                    </Box>

                    <Divider />

                    <Box>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        mb={1}
                      >
                        <GradeIcon fontSize="small" />
                        <Typography variant="subtitle2">Rating</Typography>
                      </Stack>
                      <Stack spacing={1}>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Stars:
                          </Typography>
                          <Box>
                            {photo.rating ? (
                              <Rating
                                value={photo.rating}
                                readOnly
                                size="small"
                                emptyIcon={
                                  <StarIcon
                                    style={{ opacity: 0.3 }}
                                    fontSize="inherit"
                                  />
                                }
                              />
                            ) : (
                              <Typography variant="body2">N/A</Typography>
                            )}
                          </Box>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Label:
                          </Typography>
                          <Box>
                            {photo.label && labelColors[photo.label] ? (
                              <Chip
                                size="small"
                                label={photo.label}
                                sx={{
                                  bgcolor: labelColors[photo.label],
                                  color:
                                    photo.label === 'Yellow'
                                      ? 'black'
                                      : 'white',
                                }}
                              />
                            ) : (
                              <Typography variant="body2">N/A</Typography>
                            )}
                          </Box>
                        </Box>
                      </Stack>
                    </Box>

                    <Divider />

                    <Box>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        mb={1}
                      >
                        <SettingsIcon fontSize="small" />
                        <Typography variant="subtitle2">Settings</Typography>
                      </Stack>
                      <Stack spacing={1}>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            ISO:
                          </Typography>
                          <Typography variant="body2">
                            {photo.iso || 'N/A'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Shutter:
                          </Typography>
                          <Typography variant="body2">
                            {photo.shutterSpeed || 'N/A'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Aperture:
                          </Typography>
                          <Typography variant="body2">
                            {photo.aperture ? `f/${photo.aperture}` : 'N/A'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Focal Length:
                          </Typography>
                          <Typography variant="body2">
                            {photo.focalLength
                              ? `${photo.focalLength}mm`
                              : 'N/A'}
                          </Typography>
                        </Box>
                      </Stack>
                    </Box>

                    <Divider />

                    <Box>
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        mb={1}
                      >
                        <InfoIcon fontSize="small" />
                        <Typography variant="subtitle2">Details</Typography>
                      </Stack>
                      <Stack spacing={1}>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Resolution:
                          </Typography>
                          <Typography variant="body2">
                            {photo.width} × {photo.height}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Aspect Ratio:
                          </Typography>
                          <Typography variant="body2">
                            {formatAspectRatio(photo.aspectRatio)}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            File Size:
                          </Typography>
                          <Typography variant="body2">
                            {formatFileSize(photo.fileSize)}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Date Captured:
                          </Typography>
                          <Typography variant="body2">
                            {formatDate(photo.dateCaptured)}
                          </Typography>
                        </Box>
                      </Stack>
                    </Box>

                    {keywords.length > 0 && (
                      <>
                        <Divider />
                        <Box>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            mb={1}
                          >
                            <LabelIcon fontSize="small" />
                            <Typography variant="subtitle2">
                              Keywords
                            </Typography>
                          </Stack>
                          <Box
                            sx={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 0.5,
                            }}
                          >
                            {keywords.map((keyword: string, index: number) => (
                              <Chip key={index} label={keyword} size="small" />
                            ))}
                          </Box>
                        </Box>
                      </>
                    )}
                  </>
                )}
              </Paper>
            )}
          </Box>

          {/* Bottom Navigation Bar */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              p: 1,
              bgcolor: 'background.paper',
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <IconButton
              onClick={() => navigate('prev')}
              disabled={
                inResults
                  ? photos.length <= 1
                  : neighbors.before.length === 0 || !onSelectPhoto
              }
              size={isMobile ? 'medium' : 'small'}
            >
              <ArrowBackIcon />
            </IconButton>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ minWidth: 64, textAlign: 'center' }}
            >
              {inResults ? `${currentIndex + 1} / ${photos.length}` : '—'}
            </Typography>

            <IconButton
              onClick={() => navigate('next')}
              disabled={
                inResults
                  ? photos.length <= 1
                  : neighbors.after.length === 0 || !onSelectPhoto
              }
              size={isMobile ? 'medium' : 'small'}
            >
              <ArrowForwardIcon />
            </IconButton>

            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

            <IconButton
              onClick={() => setShowNeighbors(!showNeighbors)}
              size={isMobile ? 'medium' : 'small'}
              color={showNeighbors ? 'primary' : 'default'}
              disabled={
                neighbors.before.length === 0 && neighbors.after.length === 0
              }
            >
              <ViewCarouselOutlinedIcon />
            </IconButton>

            <IconButton
              onClick={() => setShowMetadata(!showMetadata)}
              size={isMobile ? 'medium' : 'small'}
              color={showMetadata ? 'primary' : 'default'}
            >
              <InfoOutlinedIcon />
            </IconButton>
          </Box>
        </DialogContent>
      </Box>
    </Dialog>
  );
}

export default PhotoViewer;
