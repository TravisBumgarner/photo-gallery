import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    Box,
    IconButton,
    Typography,
    Chip,
    Stack,
    Divider,
    Paper,
} from '@mui/material';
import {
    Close as CloseIcon,
    ArrowBack as ArrowBackIcon,
    ArrowForward as ArrowForwardIcon,
    CameraAlt as CameraIcon,
    Settings as SettingsIcon,
    Info as InfoIcon,
    Label as LabelIcon,
    InfoOutlined as InfoOutlinedIcon,
} from '@mui/icons-material';
import { Photo } from '../types';

interface PhotoViewerProps {
    photo: Photo;
    photos: Photo[];
    onClose: () => void;
    onNavigate: (direction: 'prev' | 'next') => void;
}

function PhotoViewer({ photo, photos, onClose, onNavigate }: PhotoViewerProps) {
    const [showMetadata, setShowMetadata] = useState(true);
    const currentIndex = photos.findIndex(p => p.id === photo.id);
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < photos.length - 1;

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
            } else if (e.key === 'ArrowLeft' && hasPrev) {
                onNavigate('prev');
            } else if (e.key === 'ArrowRight' && hasNext) {
                onNavigate('next');
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
        };
    }, [onClose, onNavigate, hasPrev, hasNext]);

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

    return (
        <Dialog
            open={true}
            onClose={onClose}
            maxWidth={false}
            fullWidth
            PaperProps={{
                sx: {
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

                <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flexDirection: 'column' }}>
                    <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                        <Box
                            sx={{
                                flex: 1,
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
                                    width: 350,
                                    overflowY: 'auto',
                                    p: 3,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 2,
                                }}
                                elevation={3}
                            >
                                <Typography variant="h6" noWrap title={photo.filename}>
                                    {photo.filename}
                                </Typography>

                                <Divider />

                                <Box>
                                    <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                                        <CameraIcon fontSize="small" />
                                        <Typography variant="subtitle2">Camera</Typography>
                                    </Stack>
                                    <Stack spacing={1}>
                                        <Box>
                                            <Typography variant="caption" color="text.secondary">
                                                Camera:
                                            </Typography>
                                            <Typography variant="body2">{photo.camera || 'N/A'}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" color="text.secondary">
                                                Lens:
                                            </Typography>
                                            <Typography variant="body2">{photo.lens || 'N/A'}</Typography>
                                        </Box>
                                    </Stack>
                                </Box>

                                <Divider />

                                <Box>
                                    <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                                        <SettingsIcon fontSize="small" />
                                        <Typography variant="subtitle2">Settings</Typography>
                                    </Stack>
                                    <Stack spacing={1}>
                                        <Box>
                                            <Typography variant="caption" color="text.secondary">
                                                ISO:
                                            </Typography>
                                            <Typography variant="body2">{photo.iso || 'N/A'}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" color="text.secondary">
                                                Shutter:
                                            </Typography>
                                            <Typography variant="body2">{photo.shutterSpeed || 'N/A'}</Typography>
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
                                                {photo.focalLength ? `${photo.focalLength}mm` : 'N/A'}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </Box>

                                <Divider />

                                <Box>
                                    <Stack direction="row" spacing={1} alignItems="center" mb={1}>
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
                                            <Typography variant="body2">{formatAspectRatio(photo.aspectRatio)}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" color="text.secondary">
                                                File Size:
                                            </Typography>
                                            <Typography variant="body2">{formatFileSize(photo.fileSize)}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" color="text.secondary">
                                                Date Captured:
                                            </Typography>
                                            <Typography variant="body2">{formatDate(photo.dateCaptured)}</Typography>
                                        </Box>
                                    </Stack>
                                </Box>

                                {keywords.length > 0 && (
                                    <>
                                        <Divider />
                                        <Box>
                                            <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                                                <LabelIcon fontSize="small" />
                                                <Typography variant="subtitle2">Keywords</Typography>
                                            </Stack>
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                {keywords.map((keyword: string, index: number) => (
                                                    <Chip key={index} label={keyword} size="small" />
                                                ))}
                                            </Box>
                                        </Box>
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
                            disabled={!hasPrev}
                            size="small"
                        >
                            <ArrowBackIcon />
                        </IconButton>

                        <Typography variant="caption" color="text.secondary">
                            {currentIndex + 1} / {photos.length}
                        </Typography>

                        <IconButton
                            onClick={() => onNavigate('next')}
                            disabled={!hasNext}
                            size="small"
                        >
                            <ArrowForwardIcon />
                        </IconButton>

                        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

                        <IconButton
                            onClick={() => setShowMetadata(!showMetadata)}
                            size="small"
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
