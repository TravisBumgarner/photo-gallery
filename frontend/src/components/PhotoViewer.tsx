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
}

function PhotoViewer({ photo, photos, onClose, onNavigate }: PhotoViewerProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [showMetadata, setShowMetadata] = useState(!isMobile);
  const currentIndex = photos.findIndex((p) => p.id === photo.id);

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        onNavigate('prev');
      } else if (e.key === 'ArrowRight') {
        onNavigate('next');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [onClose, onNavigate]);

  // Progressive photo preloading
  const preloadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (photos.length <= 1) return;

    const getPhotoAtOffset = (offset: number) => {
      const index =
        (currentIndex + offset + photos.length) % photos.length;
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
                          value: photo.aperture
                            ? `f/${photo.aperture}`
                            : null,
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
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            {label}
                          </Typography>
                          <Typography variant="body2" noWrap>
                            {value || 'N/A'}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                    {keywords.length > 0 && (
                      <Box
                        sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
                      >
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
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            Camera:
                          </Typography>
                          <Typography variant="body2">
                            {photo.camera || 'N/A'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
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
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
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
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
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
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            ISO:
                          </Typography>
                          <Typography variant="body2">
                            {photo.iso || 'N/A'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            Shutter:
                          </Typography>
                          <Typography variant="body2">
                            {photo.shutterSpeed || 'N/A'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            Aperture:
                          </Typography>
                          <Typography variant="body2">
                            {photo.aperture ? `f/${photo.aperture}` : 'N/A'}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
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
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            Resolution:
                          </Typography>
                          <Typography variant="body2">
                            {photo.width} × {photo.height}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            Aspect Ratio:
                          </Typography>
                          <Typography variant="body2">
                            {formatAspectRatio(photo.aspectRatio)}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
                            File Size:
                          </Typography>
                          <Typography variant="body2">
                            {formatFileSize(photo.fileSize)}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                          >
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
                            {keywords.map(
                              (keyword: string, index: number) => (
                                <Chip
                                  key={index}
                                  label={keyword}
                                  size="small"
                                />
                              ),
                            )}
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
              onClick={() => onNavigate('prev')}
              disabled={photos.length <= 1}
              size={isMobile ? 'medium' : 'small'}
            >
              <ArrowBackIcon />
            </IconButton>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ minWidth: 64, textAlign: 'center' }}
            >
              {currentIndex + 1} / {photos.length}
            </Typography>

            <IconButton
              onClick={() => onNavigate('next')}
              disabled={photos.length <= 1}
              size={isMobile ? 'medium' : 'small'}
            >
              <ArrowForwardIcon />
            </IconButton>

            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

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
